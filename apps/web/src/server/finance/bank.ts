import "server-only";
import {createHash,randomBytes} from "node:crypto";
import {isValidIBAN} from "ibantools";
import {z} from "zod";
import {
  bankChangeReceipt,bankChallenge,bankStepUpProof,schoolBank,type BankProposal,
  type bankChallengeInput,type bankUpdate,type bankVerification,
} from "@madrasty/contracts";
import {requireCapability} from "@/server/access/policies";
import {commitCommand,hashCommand} from "@/server/db/commands";
import {appendAudit} from "@/server/db/outbox";
import {withActor,type ActorContext,type Transaction} from "@/server/db/scoped";
import {ApiError} from "@/server/http";
import {factors,providerRequest,requireFreshFactor} from "@/server/identity/assurance";
import {resolveSchoolSession} from "@/server/identity/session";

const timestamp="YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const providerChallenge=z.object({id:z.uuid(),expires_at:z.number().positive()});
const refreshedProvider=z.object({
  access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().int().positive(),
});
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");

function bankFingerprint(input:BankProposal){
  return hashCommand({purpose:"bank.configure",beneficiary:input.beneficiary,iban:input.iban,revision:input.revision});
}
function validateIban(iban:string){
  if(!isValidIBAN(iban))throw new ApiError("validation",{iban:"error.validation"});
}
async function activeSettings(tx:Transaction){
  const [{revision,versionId,beneficiary,iban,effectiveAt}]=await tx`
    select revision,version_id as "versionId",beneficiary,iban,
      to_char(effective_at at time zone 'UTC',${timestamp}) as "effectiveAt"
    from app.collection_bank_settings()`;
  return schoolBank.parse({revision,active:versionId?{versionId,beneficiary,iban,effectiveAt}:null});
}
export function readBank(actor:ActorContext){
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"bank.configure");
    return activeSettings(tx);
  });
}
export async function previewBank(actor:ActorContext,input:BankProposal){
  const current=await readBank(actor);
  if(current.revision!==input.revision)throw new ApiError("stale_revision");
  validateIban(input.iban);
  return input;
}

export async function beginBankChallenge(actor:ActorContext,access:string,input:z.infer<typeof bankChallengeInput>){
  const {factorId,...proposed}=input;
  await previewBank(actor,proposed);
  const chosen=(await factors(access)).find((item)=>item.id===factorId&&item.status==="verified");
  if(!chosen)throw new ApiError("not_found");
  const challenge=providerChallenge.parse(await providerRequest(`/factors/${chosen.id}/challenge`,access,{method:"POST",body:"{}"}));
  return withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"bank.configure");
    const [row]=await tx<{expiresAt:string|null}[]>`select to_char(app.record_bank_change_challenge(
      ${challenge.id},${chosen.id},${bankFingerprint(proposed)},${new Date(challenge.expires_at*1000).toISOString()}::timestamptz)
      at time zone 'UTC',${timestamp}) as "expiresAt"`;
    if(!row.expiresAt)throw new ApiError("unavailable");
    return bankChallenge.parse({challengeId:challenge.id,expiresAt:row.expiresAt});
  });
}
export async function finishBankChallenge(actor:ActorContext,access:string,input:z.infer<typeof bankVerification>){
  const factor=await withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"bank.configure");
    const [row]=await tx<{factor:string|null}[]>`select app.claim_bank_change_challenge(${input.challengeId}) as factor`;
    if(!row.factor)throw new ApiError("validation",{challengeId:"error.validation"});
    return row.factor;
  });
  const provider=refreshedProvider.parse(await providerRequest(`/factors/${factor}/verify`,access,{
    method:"POST",body:JSON.stringify({challenge_id:input.challengeId,code:input.code}),
  }));
  const fresh=await resolveSchoolSession(provider.access_token);
  if(fresh.accountId!==actor.accountId||fresh.sessionId!==actor.sessionId||fresh.activePersona!=="admin"||fresh.assurance!=="aal2"){
    throw new ApiError("forbidden");
  }
  await requireFreshFactor(provider.access_token);
  const secret=randomBytes(32).toString("base64url");
  const receipt=await withActor(actor,async(tx)=>{
    await requireCapability(tx,actor,"bank.configure");
    const [row]=await tx<{expiresAt:string|null}[]>`select to_char(app.complete_bank_change_challenge(
      ${input.challengeId},${digest(secret)}) at time zone 'UTC',${timestamp}) as "expiresAt"`;
    if(!row.expiresAt)throw new ApiError("validation",{challengeId:"error.validation"});
    return bankStepUpProof.parse({stepUpProof:secret,expiresAt:row.expiresAt});
  });
  return {receipt,provider};
}

export async function changeBank(actor:ActorContext,key:string|null,input:z.infer<typeof bankUpdate>){
  const {stepUpProof,...proposal}=input,fingerprint=bankFingerprint(proposal);
  const result=await commitCommand(actor,"finance.bank.change",key,fingerprint,{
    authorize:(tx)=>requireCapability(tx,actor,"bank.configure"),
    mutate:async(tx)=>{
      validateIban(proposal.iban);
      const [row]=await tx`
        select version_id as "versionId",old_version_id as "previousVersionId",revision,
          to_char(effective_at at time zone 'UTC',${timestamp}) as "effectiveAt",masked_iban as "maskedIban"
        from app.change_collection_bank(${proposal.beneficiary},${proposal.iban},${proposal.revision},${fingerprint},${digest(stepUpProof)})`;
      if(!row)throw new ApiError("stale_revision");
      const saved=bankChangeReceipt.parse(row);
      await appendAudit(tx,{action:"finance.bank_changed",aggregateId:saved.versionId,metadata:{
        oldVersionId:saved.previousVersionId,newVersionId:saved.versionId,revision:saved.revision,maskedIban:saved.maskedIban,
      }});
      return saved;
    },
  });
  return result.data;
}
