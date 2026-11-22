import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { examEntry, examResultHistory, examRosterRow } from "../../packages/contracts/src/academics/exams";
import { homeworkGradeRow } from "../../packages/contracts/src/academics/gradebook";
import { homeworkEntry } from "../../packages/contracts/src/academics/homework";
import { evaluationEntry } from "../../packages/contracts/src/academics/evaluations";
import { academicReport } from "../../packages/contracts/src/academics/reports";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

async function withResultsFixture(work: (fixture: Awaited<ReturnType<typeof acquire>>) => Promise<void>) {
  const school = schoolFixtures();
  try {
    await work(await acquire(school));
  } finally {
    await school.close();
  }
}

async function acquire(school: ReturnType<typeof schoolFixtures>) {
  const admin = await school.bearer("admin", "admin");
  const { offering, ids } = await setUpCalendar(school, admin);
  const [teacher, parent, stranger] = await Promise.all([
    school.bearer("teacher", "teacher"), school.bearer("guardian-ar", "guardian"), school.bearer("guardian-other", "guardian"),
  ]);
  const write = (method: "POST" | "PATCH" | "PUT", body: unknown, status = 200) =>
    ({ token: teacher, persona: "teacher", method, body, status, key: randomUUID() }) as const;
  return { school, offering, ids, teacher, parent, stranger, write };
}

test("homework distinguishes a recorded zero, a half-point score and an unmarked pupil", () =>
  withResultsFixture(async ({ school, offering, ids, teacher, parent, write }) => {
    const created = await fixtureApi(school, "/academics/homework", write("POST", {
      offeringId: offering.offeringId, title: "QA homework", instructions: "Read the synthetic lesson",
      lessonId: null, issuedOn: clock.day, dueOn: clock.homeworkDue,
    }, 201));
    const path = `/academics/homework/${created.payload.data.id}`;
    const roster = homeworkGradeRow.array().parse((await fixtureApi(school, `${path}/grades`, { token: teacher })).payload.data);
    const first = roster.find((row) => row.studentId === ids.ahmed);
    const second = roster.find((row) => row.studentId === ids.omar);
    assert.ok(first && second);
    assert.equal(first.score, null);
    assert.equal(second.score, null);
    await fixtureApi(school, `${path}/grades/${ids.ahmed}`, write("PATCH", { revision: first.revision, score: 3.1 }, 422));
    await fixtureApi(school, `${path}/grades/${ids.ahmed}`, write("PATCH", { revision: first.revision, score: 0 }));
    const marked = homeworkEntry.parse((await fixtureApi(school, `${path}?childId=${ids.ahmed}`, { token: parent })).payload.data);
    const blank = homeworkEntry.parse((await fixtureApi(school, `${path}?childId=${ids.omar}`, { token: parent })).payload.data);
    assert.equal(marked.score, 0);
    assert.equal(blank.score, null);
    await fixtureApi(school, `${path}/grades/${ids.omar}`, write("PATCH", { revision: second.revision, score: 5.5 }));
    const half = homeworkEntry.parse((await fixtureApi(school, `${path}?childId=${ids.omar}`, { token: parent })).payload.data);
    assert.equal(half.score, 5.5);
  }));

test("exam announcements and published scores are separate, and a family cannot read another class", () =>
  withResultsFixture(async ({ school, offering, ids, teacher, parent, stranger, write }) => {
    const created = await fixtureApi(school, "/academics/exams", write("POST", {
      offeringId: offering.offeringId, date: clock.day, time: "11:00", kind: "oral", title: "QA oral exam", maxScore: 25,
    }, 201));
    const path = `/academics/exams/${created.payload.data.id}`;
    const detail = `${path}?childId=${ids.ahmed}`;
    await fixtureApi(school, detail, { token: parent, status: 404 });
    const announcement = await fixtureApi(school, `${path}/announce`, write("POST", {
      revision: created.payload.data.revision, date: clock.day, time: "11:00",
    }));
    assert.equal(announcement.payload.data.change, "initial");
    const roster = examRosterRow.array().parse((await fixtureApi(school, `${path}/marks`, { token: teacher })).payload.data);
    const pupil = roster.find((entry) => entry.studentId === ids.ahmed);
    assert.ok(pupil);
    const marked = await fixtureApi(school, `${path}/marks/${ids.ahmed}`, write("PUT", {
      revision: pupil.revision, score: 21.5, feedback: "Synthetic score note",
    }));
    const pending = examEntry.parse((await fixtureApi(school, detail, { token: parent })).payload.data);
    assert.equal(pending.resultScore, null);
    await fixtureApi(school, `${path}/results/publish`, write("POST", {
      revision: announcement.payload.data.revision,
      reviewedRows: [{ studentId: ids.ahmed, revision: marked.payload.data.revision }],
    }));
    const published = examEntry.parse((await fixtureApi(school, detail, { token: parent })).payload.data);
    assert.equal(published.resultScore, 21.5);
    assert.equal(published.resultMaxScore, 25);
    await fixtureApi(school, `${path}?childId=${ids.other}`, { token: stranger, status: 404 });
    const reason = "Private correction explanation";
    await fixtureApi(school, `${path}/results/${ids.ahmed}/correct`, write("POST", {
      revision: published.resultRevision, score: 22, feedback: "Corrected synthetic score", reason,
    }));
    const amended = await fixtureApi(school, detail, { token: parent });
    assert.equal(examEntry.parse(amended.payload.data).resultScore, 22);
    assert.equal(JSON.stringify(amended.payload).includes(reason), false);
    const history = examResultHistory.array().parse((await fixtureApi(school, `${path}/results/${ids.ahmed}/history`, { token: teacher })).payload.data);
    assert.deepEqual(history.map((entry) => entry.score), [22, 21.5]);
  }));

test("periodic evaluation appears in the child's report only after publication", () =>
  withResultsFixture(async ({ school, offering, ids, parent, stranger, write }) => {
    const title = "QA quarterly assessment " + randomUUID();
    const created = await fixtureApi(school, "/academics/evaluations", write("POST", {
      offeringId: offering.offeringId, studentId: ids.ahmed, title, strengths: "Synthetic strengths", improvements: "",
      participation: 4, understanding: 5, preparation: 3, periodStart: clock.startsOn, periodEnd: clock.day,
    }, 201));
    const path = `/academics/evaluations/${created.payload.data.id}`;
    const reportPath = `/academics/reports/students/${ids.ahmed}?from=${clock.startsOn}&to=${clock.day}`;
    const draft = academicReport.parse((await fixtureApi(school, reportPath, { token: parent })).payload.data);
    assert.equal(draft.sources.some((entry) => entry.resourceId === created.payload.data.id), false);
    await fixtureApi(school, `${path}/publish`, write("POST", { revision: created.payload.data.revision }));
    const assigned = evaluationEntry.parse((await fixtureApi(school, `${path}?childId=${ids.ahmed}`, { token: parent })).payload.data);
    assert.equal(assigned.title, title);
    assert.equal(assigned.understanding, 5);
    const published = academicReport.parse((await fixtureApi(school, reportPath, { token: parent })).payload.data);
    assert.ok(published.sources.some((entry) => entry.kind === "evaluation" && entry.resourceId === assigned.id && entry.visibility === "published"));
    await fixtureApi(school, reportPath, { token: stranger, status: 404 });
  }));
