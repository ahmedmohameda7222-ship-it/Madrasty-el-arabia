import { z } from "zod";
import { personaSchema } from "./http";

export const signInInput = z.object({
  email: z.email().max(254).transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1).max(1024),
});
export const switchPersonaInput = z.object({ persona: personaSchema });
export const signOutInput = z.object({ allDevices: z.boolean() });

export const sessionSchema = z.object({
  accountId: z.uuid(),
  sessionId: z.uuid(),
  personas: z.array(personaSchema),
  activePersona: personaSchema,
  assurance: z.enum(["aal1", "aal2"]),
  expiresAt: z.iso.datetime(),
});

export type SchoolSession = z.infer<typeof sessionSchema>;
