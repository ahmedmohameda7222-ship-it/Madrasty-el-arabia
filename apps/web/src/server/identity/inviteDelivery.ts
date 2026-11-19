import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ApiError } from "@/server/http";
import type { Locale } from "@madrasty/contracts";

export const inviteHash = (value: string) => createHash("sha256").update(value).digest("hex");

function envelopeKey() {
  const raw = process.env.INVITATION_ENVELOPE_KEY;
  const key = raw ? Buffer.from(raw, "base64url") : null;
  if (key?.length !== 32) throw new ApiError("unavailable");
  return key;
}

export function sealInvite(value: string, identity: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", envelopeKey(), nonce);
  cipher.setAAD(Buffer.from(identity));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openInvite(value: string, identity: string) {
  const envelope = Buffer.from(value, "base64url");
  if (envelope.length < 29) throw new ApiError("unavailable");
  const decipher = createDecipheriv("aes-256-gcm", envelopeKey(), envelope.subarray(0, 12));
  decipher.setAAD(Buffer.from(identity));
  decipher.setAuthTag(envelope.subarray(12, 28));
  return Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString("utf8");
}

export function invitationUrl(locale: Locale, token: string, providerProof?: string) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new ApiError("unavailable");
  const target = new URL(`/${locale}/invite`, origin);
  target.hash = new URLSearchParams({ token, ...(providerProof && { proof: providerProof }) }).toString();
  return target.toString();
}
