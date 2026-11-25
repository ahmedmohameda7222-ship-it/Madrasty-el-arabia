import { z } from "zod";
import { localeSchema, revisionSchema } from "../http";

export const maxFamilyUploadBytes = 2_500_000;
export const importMime = z.enum(["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const column = z.int().min(1).max(64);
export const importUploadInput = z.object({
  fileName: z.string().trim().min(1).max(180),
  mime: importMime,
  bytesBase64: z.string().min(4).max(Math.ceil(maxFamilyUploadBytes / 3) * 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export const importColumns = z.object({
  familyKey: column.optional(), familyName: column.optional(),
  childKey: column, studentNumber: column.optional(), childName: column,
  guardianKey: column, guardianName: column, email: column,
  communicationLocale: column, payerCandidate: column.optional(),
}).refine((mapping) => {
  const indices = Object.values(mapping);
  return new Set(indices).size === indices.length;
});
export const importSheetOptions = z.object({
  worksheet: z.string().min(1).max(128).optional(),
  delimiter: z.enum([",", ";", "\t"]).optional(),
});
export const importMappingInput = importSheetOptions.extend({ columnMap: importColumns, revision: revisionSchema });
export const importVersionSchema = z.object({
  id: z.uuid(), fileName: z.string(), revision: revisionSchema,
  state: z.enum(["uploaded", "review", "committed"]),
  expiresAt: z.iso.datetime(), mime: importMime,
});
export const importInspectionSchema = importVersionSchema.extend({
  worksheets: z.array(z.string()),
  worksheet: z.string().nullable(),
  columns: z.array(z.object({ index: column, label: z.string() })),
  delimiter: z.enum([",", ";", "\t"]).nullable(),
  savedColumnMap: importColumns.optional(),
});

const mappedText = z.string().trim().min(1).max(160);
export const normalizedImportSchema = z.object({
  familyKey: mappedText.nullable().optional(), familyName: z.string().trim().min(1).max(200).nullable().optional(),
  childKey: mappedText, studentNumber: z.string().regex(/^MA-\d{6,}$/).nullable(),
  childName: z.string().trim().min(1).max(200), guardianKey: mappedText,
  guardianName: z.string().trim().min(1).max(200), email: z.email().max(254).transform((value) => value.toLowerCase()),
  communicationLocale: localeSchema, payerCandidate: z.boolean().nullable(),
}).refine(row=>Boolean(row.familyKey)===Boolean(row.familyName),{path:["familyKey"],message:"Family key and name must be supplied together"});
export const importDispositions = z.enum(["new", "existing", "duplicate", "conflict", "revoked", "skipped"]);
export const importReasonSchema = z.enum([
  "invalid_value", "identifier_needs_text", "formula", "student_number_unknown", "source_key_mismatch",
  "identity_fields_differ", "conflicting_rows", "link_revoked", "guardian_email_collision", "decision_required",
  "inactive_student", "payer_conflict", "payer_missing",
]);
export const importDecision = z.enum(["approve", "skip", "restore", "match_guardian", "match_student"]);
export const importDecisionInput = z.object({
  revision: revisionSchema,
  rows: z.array(z.object({
    rowNo: z.int().positive(), decision: importDecision, matchedId: z.uuid().optional(), payerCandidate: z.boolean().optional(),
  })).min(1).max(500).refine((items) => new Set(items.map(({ rowNo }) => rowNo)).size === items.length)
    .refine((items) => items.every(({ decision, matchedId }) => decision.startsWith("match_") === Boolean(matchedId))),
});
export const importPreviewRowSchema = z.object({
  rowNo: z.int().positive(),
  disposition: importDispositions,
  reason: importReasonSchema.nullable(),
  column: z.string().nullable(),
  display: normalizedImportSchema.nullable(),
  decision: importDecision.nullable(),
});
export const importPreviewSchema = importVersionSchema.extend({
  rows: importPreviewRowSchema.array(),
  counts: z.object({
    new: z.int(), existing: z.int(), duplicate: z.int(), conflict: z.int(), revoked: z.int(), skipped: z.int(),
  }),
});
export const importCommitInput = z.object({ reviewedRevision: revisionSchema });
export const importReceiptSchema = z.object({
  id: z.uuid(), revision: revisionSchema, rowsCommitted: z.int().nonnegative(),
  linksCreated: z.int().nonnegative(), eligibleGuardians: z.int().nonnegative(),
});
export type NormalizedFamilyImport = z.infer<typeof normalizedImportSchema>;
export type ImportReason = z.infer<typeof importReasonSchema>;
