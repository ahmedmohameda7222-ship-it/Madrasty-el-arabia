import { z } from "zod";
import { revisionSchema } from "./http";

export const birthDateSchema = z.iso.date().refine(value => value >= "1900-01-01" && value <= new Date().toISOString().slice(0,10));
const birthDate = birthDateSchema.nullable();
const displayName = z.string().trim().min(1).max(200);
const phone = z.string().trim().min(1).max(48).nullable();
const emergencyAddress = z.string().trim().min(1).max(500).nullable();
export const accountProfileSchema = z.object({
  displayName: displayName.nullable(),
  guardian: z.object({revision:revisionSchema,birthDate,phone,emergencyAddress}).nullable(),
  children: z.array(z.object({id:z.uuid(),displayName,birthDate,age:z.int().nonnegative().nullable(),revision:revisionSchema})),
});
export const accountProfilePatch = z.discriminatedUnion("kind",[
  z.strictObject({kind:z.literal("guardian"),revision:revisionSchema,birthDate,phone,emergencyAddress}),
  z.strictObject({kind:z.literal("child"),id:z.uuid(),revision:revisionSchema,displayName,birthDate}),
]);
export const profileSavedSchema=z.object({revision:revisionSchema});
export type AccountProfile=z.infer<typeof accountProfileSchema>;
export type AccountProfilePatch=z.infer<typeof accountProfilePatch>;
