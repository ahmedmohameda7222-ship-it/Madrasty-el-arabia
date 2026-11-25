import { z } from "zod";
import { localeSchema, pageQuerySchema, revisionSchema } from "../http";

const name = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(1).max(400);
const source = z.object({ namespace: z.string().trim().min(1).max(80), key: z.string().trim().min(1).max(160) });
const studentState = z.enum(["active", "inactive"]);
const birthday = z.iso.date().refine(value=>value>="1900-01-01"&&value<=new Date().toISOString().slice(0,10)).nullable().optional();
const familyReference=z.object({id:z.uuid(),displayName:name});
export const studentSchema = z.object({
  id: z.uuid(), studentNumber: z.string().regex(/^MA-\d{6,}$/), displayName: name,
  state: studentState, revision: revisionSchema, birthDate: z.iso.date().nullable().optional(),
  currentClass:z.object({id:z.uuid(),code:z.string(),nameAr:z.string(),nameDe:z.string()}).nullable().optional(),
});
export const createStudentInput = z.object({ displayName: name, source: source.optional() });
export const updateStudentInput = z.object({ displayName: name, state: studentState, revision: revisionSchema,birthDate:birthday });

const contact = z.object({
  displayName: name,
  contactEmail: z.email().max(254).transform((value) => value.toLowerCase()).nullable(),
  contactPhone: z.string().trim().min(1).max(48).nullable(),
  correspondenceLocale: localeSchema,
});
export const guardianSchema = contact.extend({
  id: z.uuid(), linkedAccount: z.boolean(), revision: revisionSchema,
  birthDate: z.iso.date().nullable().optional(), emergencyAddress: z.string().nullable().optional(),
});
export const createGuardianInput = contact.extend({ source: source.optional() });
export const updateGuardianInput = contact.extend({ revision: revisionSchema,birthDate:birthday,emergencyAddress:z.string().trim().min(1).max(500).nullable().optional() });
/** Family-first registration: guardian(s) and at least one child are saved atomically. */
export const familySituation = z.enum(["unknown","together","separated","divorced","single","other"]);
export const familyRelationship = z.enum(["unspecified","father","mother","legal","other"]);
export const createFamilyChildInput = z.object({
  displayName: name,
  classId: z.uuid().nullable().optional(),
  birthDate: birthday,
});
const familyGuardianInput = createGuardianInput.extend({
  existingId:z.uuid().optional(), birthDate: birthday, emergencyAddress: z.string().trim().min(1).max(500).nullable().optional(),
});
const familyChildInput = createFamilyChildInput.extend({
  existingId:z.uuid().optional(),
  payerGuardianIndex:z.int().min(0).max(7).optional(),
  guardianLinks: z.array(z.object({guardianIndex:z.int().min(0).max(7),relationship:familyRelationship,approved:z.boolean()})).min(1).max(8).optional(),
});
export const createFamilyInput = z.object({
  displayName: name.optional(),
  situation: familySituation.optional(),
  guardians: z.array(familyGuardianInput).min(1).max(8)
    .refine((items) => {
      const emails = items.map((item) => item.contactEmail).filter((email) => email !== null);
      return new Set(emails).size === emails.length;
    }, { message: "guardian e-mails must be distinct" }),
  children: z.array(familyChildInput).min(1).max(25),
}).refine(input => input.children.every(child => (!child.existingId||(!child.classId&&!child.birthDate)) && (child.guardianLinks ? new Set(child.guardianLinks.map(link=>link.guardianIndex)).size===child.guardianLinks.length && child.guardianLinks.every(link=>link.guardianIndex<input.guardians.length) && child.guardianLinks.some(link=>link.approved) : !input.situation && !input.guardians.some(g=>g.existingId) && !child.existingId)),{message:"Each child needs an explicit, valid approved guardian"}).refine(input=>new Set(input.guardians.flatMap(g=>g.existingId?[g.existingId]:[])).size===input.guardians.filter(g=>g.existingId).length&&new Set(input.children.flatMap(c=>c.existingId?[c.existingId]:[])).size===input.children.filter(c=>c.existingId).length,{message:"Do not select a person twice"}).refine(input=>input.children.every(c=>c.payerGuardianIndex===undefined||(!c.existingId&&c.guardianLinks?.some(l=>l.guardianIndex===c.payerGuardianIndex&&l.approved))),{message:"Select an approved payer for a new child"});
export const createdFamilySchema = z.object({
  familyId: z.uuid().optional(),
  guardianIds: z.array(z.uuid()).min(1),
  children: z.array(studentSchema).min(1),
});

export const childLinkSchema = z.object({
  id: z.uuid(), guardianId: z.uuid(), studentId: z.uuid(), state: z.enum(["pending", "approved", "revoked"]),
  studentName: name, studentNumber: z.string(), reason: z.string(), revision: revisionSchema,
  relationship: familyRelationship.optional(),
});
export const guardianDetailSchema = guardianSchema.extend({ links: childLinkSchema.array(),familyGroups:familyReference.array().optional() });
export const studentDetailSchema=studentSchema.extend({guardianRelationships:childLinkSchema.extend({guardianName:name}).array().optional(),familyGroups:familyReference.array().optional()});
export const createLinkInput = z.object({ guardianId: z.uuid(), studentId: z.uuid(), approvalReason: reason.optional() });
export const changeLinkInput = z.object({ revision: revisionSchema, reason });

export const familyQuerySchema = pageQuerySchema.extend({
  query: z.string().trim().max(120).optional(),
  cursor: z.uuid().optional(),
  sort:z.enum(["id","name"]).optional(),
  state:studentState.optional(),
  classId:z.union([z.uuid(),z.literal("none")]).optional(),
  ungrouped:z.literal("true").optional(),
});
export const childSummarySchema = studentSchema.pick({ id: true, studentNumber: true, displayName: true }).extend({
  currentClass: z.object({ id: z.uuid(), code: z.string(), nameAr: z.string(), nameDe: z.string() }).nullable().optional(),
});

export type Student = z.infer<typeof studentSchema>;
export type Guardian = z.infer<typeof guardianSchema>;
export type ChildLink = z.infer<typeof childLinkSchema>;

export const familyGroupSummary = z.object({id:z.uuid(),displayName:name,guardianCount:z.int().nonnegative(),childCount:z.int().nonnegative(),revision:revisionSchema});
export const familyGroupDetail = familyGroupSummary.extend({situation:familySituation,guardians:guardianSchema.array(),children:studentSchema.array(),links:childLinkSchema.array()});
export const familyGroupQuery = z.object({query:z.string().trim().max(120).optional(),cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(50)});

export const familyGroupEdit=z.object({displayName:name,situation:familySituation,revision:revisionSchema});
export const familyGroupAttach=z.object({kind:z.enum(["guardian","student"]),personId:z.uuid(),revision:revisionSchema});
export const familyGroupChildInput=createFamilyChildInput.extend({guardianLinks:z.array(z.object({guardianId:z.uuid(),relationship:familyRelationship,approved:z.boolean()})).min(1).max(8),revision:revisionSchema}).refine(v=>v.guardianLinks.some(l=>l.approved)&&new Set(v.guardianLinks.map(l=>l.guardianId)).size===v.guardianLinks.length);

export const familyOverviewSchema=z.object({activeStudents:z.int().nonnegative(),families:z.int().nonnegative(),ungroupedGuardians:z.int().nonnegative()});
export const familyGroupGuardianInput=createGuardianInput.extend({birthDate:birthday,emergencyAddress:z.string().trim().min(1).max(500).nullable().optional(),revision:revisionSchema});
