import "server-only";
import type { Locale } from "@madrasty/contracts";
import { ApiError } from "@/server/http";
import { authProvider } from "./provider";
import { invitationUrl, inviteHash, openInvite, sealInvite } from "./inviteDelivery";

type Source = {
  email: string; locale: Locale; sealedToken: string; sealedProof: string | null; existingIdentity: boolean;
};

export type InvitationDispatchStore = {
  // C06 implements these operations on the separately granted app_invite_worker role.
  load(inviteId: string, generation: number): Promise<Source | null>;
  saveProof(inviteId: string, generation: number, encryptedProof: string, hash: string): Promise<boolean>;
};

export async function prepareInvitationMail(store: InvitationDispatchStore, inviteId: string, generation: number) {
  const source = await store.load(inviteId, generation);
  if (!source) return null;
  const binding = `${inviteId}/${generation}`;
  let proof: string | undefined;
  if (source.sealedProof) proof = openInvite(source.sealedProof, `${binding}/proof`);
  else if (!source.existingIdentity) {
    const result = await authProvider(true).admin.generateLink({ type: "invite", email: source.email });
    if (result.error || !result.data.properties.hashed_token) throw new ApiError("unavailable");
    proof = result.data.properties.hashed_token;
    if (!await store.saveProof(inviteId, generation, sealInvite(proof, `${binding}/proof`), inviteHash(proof))) return null;
  }
  // Recheck current generation and eligibility after requesting an Auth proof.
  if (!await store.load(inviteId, generation)) return null;
  const token = openInvite(source.sealedToken, binding);
  return { to: source.email, locale: source.locale, link: invitationUrl(source.locale, token, proof) };
}
