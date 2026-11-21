import assert from "node:assert/strict";
import { fixtureApi } from "../support/api";
import { schoolClock as clock } from "./clock";
import type { FixtureSchool } from "./school";

export async function setUpCalendar(school: FixtureSchool, admin: string) {
  const ids = await school.references();
  const command = async (path: string, name: string, body: unknown, method: "POST" | "PATCH" = "POST") =>
    (await fixtureApi(school, path, {
      method, token: admin, persona: "admin", key: `${school.run}.${name}`, body, status: [200, 201],
    })).payload.data;

  await command("/school/settings", "settings", {
    timezone: clock.timeZone, nameAr: "مدرسة اختبار", nameDe: "QA-Schule", currency: "EUR", dueDay: 25, revision: 0,
  }, "PATCH");
  const year = await command("/school/years", "year", {
    startsOn: clock.startsOn, endsExclusive: clock.endsExclusive,
    teachingWeekdays: [1, 2, 3, 4, 5, 6, 7], state: "active",
  });
  const apple = await command("/school/classes", "class-a", {
    yearId: year.id, code: "QA_A", nameAr: "الفصل أ", nameDe: "Klasse A", capacity: 16,
  });
  const berry = await command("/school/classes", "class-b", {
    yearId: year.id, code: "QA_B", nameAr: "الفصل ب", nameDe: "Klasse B", capacity: 8,
  });
  const { payload: staff } = await fixtureApi(school, "/school/staff", { token: admin });
  const teacher = staff.data.find((member: { accountId: string }) => member.accountId === ids.teacher);
  const otherTeacher = staff.data.find((member: { accountId: string }) => member.accountId === ids["teacher-other"]);
  const substitute = staff.data.find((member: { accountId: string }) => member.accountId === ids.substitute);
  assert.ok(teacher && otherTeacher && substitute);
  const { payload: subjects } = await fixtureApi(school, "/school/subjects", { token: admin });
  const fiqh = subjects.data.find((subject: { code: string }) => subject.code === "FIQH");
  assert.ok(fiqh);
  const primary = await command(`/school/classes/${apple.id}/assignments`, "primary", {
    staffId: teacher.id, kind: "primary", subjectId: null, from: clock.startsOn, untilExclusive: clock.endsExclusive,
    capabilities: ["attendance.read", "attendance.mark", "attendance.approve", "comms.class"],
  });
  const offering = await command(`/school/classes/${apple.id}/assignments`, "fiqh", {
    staffId: teacher.id, kind: "subject", subjectId: fiqh.id, from: clock.startsOn, untilExclusive: clock.endsExclusive,
    capabilities: ["academics.plan", "academics.log", "academics.grade", "academics.publish"],
  });
  await command(`/school/classes/${berry.id}/assignments`, "primary-b", {
    staffId: otherTeacher.id, kind: "primary", subjectId: null, from: clock.startsOn, untilExclusive: clock.endsExclusive,
    capabilities: ["attendance.read", "attendance.mark", "attendance.approve"],
  });
  const enrollment = await command(`/school/classes/${apple.id}/enrollments`, "enrollment-a", {
    studentIds: [ids.ahmed, ids.omar], from: clock.startsOn, revision: apple.revision,
  });
  await command(`/school/classes/${berry.id}/enrollments`, "enrollment-b", {
    studentIds: [ids.other], from: clock.startsOn, revision: berry.revision,
  });
  const room = await command("/school/rooms", "room", { code: "QA_ROOM", nameAr: "قاعة اختبار", nameDe: "QA-Raum" });
  return { year, apple, berry, primary, offering, enrollment, substitute, room, ids, command };
}
