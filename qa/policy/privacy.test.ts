import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolClock as clock } from "../fixtures/clock";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("the PostgreSQL public roles cannot read the application schema and its private records", async () => {
  const school = schoolFixtures();
  const url = new URL(process.env.DATABASE_URL ?? "invalid:");
  assert.equal(url.origin, "null");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55422");
  assert.equal(url.username, "madrasty_qa_runtime");
  const sql = postgres(url.href, { max: 1, prepare: false });
  try {
    const [grants] = await sql`
      select
        has_schema_privilege('anon', 'app', 'USAGE') as anon_has_schema,
        has_schema_privilege('authenticated', 'app', 'USAGE') as authenticated_has_schema,
        has_table_privilege('anon', (select oid from pg_class where relnamespace = (select oid from pg_namespace where nspname = 'app') and relname = 'student'), 'SELECT') as anon_can_select,
        has_table_privilege('authenticated', (select oid from pg_class where relnamespace = (select oid from pg_namespace where nspname = 'app') and relname = 'child_link'), 'SELECT') as auth_can_select,
        has_table_privilege('authenticated', (select oid from pg_class where relnamespace = (select oid from pg_namespace where nspname = 'app') and relname = 'invoice'), 'SELECT') as auth_can_read_invoice,
        (select not (rolsuper or rolbypassrls) from pg_roles where rolname=session_user) as restricted
    `;
    assert.deepEqual(grants, {
      anon_has_schema: false, authenticated_has_schema: false, anon_can_select: false,
      auth_can_select: false, auth_can_read_invoice: false, restricted: true,
    });
  } finally {
    await sql.end();
    await school.close();
  }
});

test("teacher scope, guardian child scope, and finance privilege remain distinct over interleaved requests", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    const { apple, berry, ids } = await setUpCalendar(school, admin);
    const [teacher, otherTeacher, guardian, otherGuardian, finance] = await Promise.all([
      school.bearer("teacher", "teacher"), school.bearer("teacher-other", "teacher"),
      school.bearer("guardian-ar", "guardian"), school.bearer("guardian-other", "guardian"),
      school.bearer("finance", "admin"),
    ]);
    const day = (classId: string) => `/attendance/classes/${classId}/days/${clock.day}`;
    const [teacherDay, otherDay, children, otherChildren] = await Promise.all([
      fixtureApi(school, day(apple.id), { token: teacher }),
      fixtureApi(school, day(berry.id), { token: otherTeacher }),
      fixtureApi(school, "/me/children", { token: guardian }),
      fixtureApi(school, "/me/children", { token: otherGuardian }),
      fixtureApi(school, day(berry.id), { token: teacher, status: 404 }),
      fixtureApi(school, day(apple.id), { token: finance, status: 404 }),
      fixtureApi(school, `/me/children/${ids.ahmed}`, { token: otherGuardian, status: 404 }),
    ]);
    assert.equal(teacherDay.payload.data.classroom.id, apple.id);
    assert.equal(otherDay.payload.data.classroom.id, berry.id);
    assert.equal(children.payload.data.length, 2);
    assert.equal(otherChildren.payload.data.length, 1);
    await fixtureApi(school, "/finance/invoices", { token: finance });
    await fixtureApi(school, `/finance/pupils?period=${clock.month}`, { token: teacher, status: 403 });
  } finally {
    await school.close();
  }
});

test("revoking a family link immediately removes both the existing session's list and its old child URL", async () => {
  const school = schoolFixtures();
  try {
    const [admin, guardian] = await Promise.all([school.bearer("admin", "admin"), school.bearer("dual-role", "guardian")]);
    const ids = await school.references();
    const search = encodeURIComponent(`${school.run} dual-role`);
    const { payload } = await fixtureApi(school, `/school/guardians?query=${search}`, { token: admin });
    assert.equal(payload.data.length, 1);
    const profile = await fixtureApi(school, `/school/guardians/${payload.data[0].id}`, { token: admin });
    const link = profile.payload.data.links.find((value: { studentId: string }) => value.studentId === ids.ahmed);
    assert.equal(link.state, "approved");
    const detail = `/me/children/${ids.ahmed}`;
    await fixtureApi(school, detail, { token: guardian });
    const excusePath = `/children/${ids.ahmed}/attendance/excuses`;
    const excuse = {
      method: "POST", token: guardian, persona: "guardian", key: `${school.run}.pre-revocation-excuse`,
      body: { schoolDate: "2026-11-28", reason: "Synthetic relationship check" },
    } as const;
    const original = await fixtureApi(school, excusePath, { ...excuse, status: 201 });
    assert.equal((await fixtureApi(school, excusePath, excuse)).payload.data.id, original.payload.data.id);
    await fixtureApi(school, `/school/guardian-links/${link.id}/revoke`, {
      method: "POST", token: admin, persona: "admin", key: `${school.run}.revoke-dual-link`,
      body: { revision: link.revision, reason: "Synthetic end of relationship" },
    });
    await fixtureApi(school, detail, { token: guardian, status: 404 });
    await fixtureApi(school, excusePath, { ...excuse, status: 404 });
    const childList = await fixtureApi(school, "/me/children", { token: guardian });
    assert.deepEqual(childList.payload.data, []);
    const other = await school.bearer("guardian-de", "guardian");
    await fixtureApi(school, detail, { token: other });
  } finally {
    await school.close();
  }
});
