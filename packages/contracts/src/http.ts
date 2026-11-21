import { z } from "zod";

export const apiVersion = "v1" as const;
export const personas = ["admin", "teacher", "guardian"] as const;
export const personaSchema = z.enum(personas);
export type Persona = z.infer<typeof personaSchema>;

export const localeSchema = z.enum(["ar", "de"]);
export type Locale = z.infer<typeof localeSchema>;
export const schoolDateSchema = z.iso.date();
export const billingMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const minorUnitsSchema = z.int();
export const revisionSchema = z.int().positive();
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9._~-]{1,128}$/);

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(2048).optional(),
});

export const pageMetaSchema = z.object({ nextCursor: z.string().min(1).optional() });

export function successEnvelope<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: pageMetaSchema.optional() });
}

export const healthSchema = z.object({ status: z.literal("ok"), apiVersion: z.literal(apiVersion) });
