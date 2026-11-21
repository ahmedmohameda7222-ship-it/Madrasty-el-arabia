import {z} from "zod";
import {mfaVerifyInput} from "../security";

const bankRevision=z.int().min(0);
const beneficiary=z.string().max(250).transform((value)=>value.normalize("NFC").trim().replace(/\s+/gu," "))
  .pipe(z.string().min(1).max(140).refine((value)=>!/[\p{Cc}\p{Cf}]/u.test(value)));
const iban=z.string().max(80).refine((value)=>/^[A-Za-z0-9\s]+$/.test(value)).transform((value)=>value.replace(/\s+/gu,"").toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/));
const code=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const bankProposal=z.object({beneficiary,iban,revision:bankRevision}).strict();
export const bankUpdate=bankProposal.extend({stepUpProof:code});
export const bankChallengeInput=bankProposal.extend({factorId:z.uuid()});
export const bankChallenge=z.object({challengeId:z.uuid(),expiresAt:z.iso.datetime()});
export const bankVerification=mfaVerifyInput.strict();
export const bankStepUpProof=z.object({stepUpProof:code,expiresAt:z.iso.datetime()});
export const schoolBank=z.object({
  revision:bankRevision,active:z.object({versionId:z.uuid(),beneficiary,iban,effectiveAt:z.iso.datetime()}).nullable(),
});
export const bankChangeReceipt=z.object({
  versionId:z.uuid(),previousVersionId:z.uuid().nullable(),revision:bankRevision,effectiveAt:z.iso.datetime(),maskedIban:z.string(),
});
export const transferInstructions=z.object({
  bankVersionId:z.uuid(),beneficiary,iban,amountMinor:z.int().nonnegative(),currency:z.string().regex(/^[A-Z]{3}$/),
  reference:z.string().min(4).max(140),bankChanged:z.boolean(),
});

export type BankProposal=z.infer<typeof bankProposal>;
export type TransferInstructions=z.infer<typeof transferInstructions>;
