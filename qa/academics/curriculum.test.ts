import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { curriculumLesson, lessonReceipt } from "../../packages/contracts/src/academics/curriculum";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("draft curriculum stays private until publication and only an entitled family can read it", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    const { offering, ids } = await setUpCalendar(school, admin);
    const [teacher, family, outside] = await Promise.all([
      school.bearer("teacher", "teacher"), school.bearer("guardian-ar", "guardian"), school.bearer("guardian-other", "guardian"),
    ]);
    const key = randomUUID();
    const titleDe = "QA-Fall Fiqh";
    const request = { token: teacher, persona: "teacher", method: "POST" } as const;
    const created = await fixtureApi(school, "/academics/lessons", {
      ...request, key, status: 201, body: {
        offeringId: offering.offeringId, unitId: null, sortOrder: 10, plannedDate: clock.day,
        sourceLanguage: "de", titleAr: "درس فقه", bodyAr: "محتوى ضمان الجودة", titleDe, bodyDe: "Synthetischer Unterricht",
      },
    });
    const lesson = lessonReceipt.parse(created.payload.data);
    const path = `/academics/lessons/${lesson.id}`;
    await fixtureApi(school, `${path}?childId=${ids.ahmed}`, { token: family, status: 404 });
    await fixtureApi(school, `${path}/publish`, { ...request, key: `${key}.publish`, body: { revision: lesson.revision } });
    const parent = await fixtureApi(school, `${path}?childId=${ids.ahmed}`, { token: family });
    assert.equal(curriculumLesson.parse(parent.payload.data).titleDe, titleDe);
    assert.equal(parent.payload.data.canEdit, false);
    await fixtureApi(school, `${path}?childId=${ids.other}`, { token: outside, status: 404 });
  } finally {
    await school.close();
  }
});
