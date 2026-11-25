import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures, type Persona, type Principal } from "../fixtures/school";
import { fixtureApi } from "../support/api";

type Contact = { id: string; role: string; displayName: string | null; contexts: {id:string}[]; workEmail?: string | null; workPhone?: string | null; target: { kind: "person" | "office"; id: string } };

test("all three active school personas can discover and start direct conversations with every role", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    await setUpCalendar(school, admin);
    const actors: [Principal, Persona][] = [["guardian-ar", "guardian"], ["teacher", "teacher"], ["admin", "admin"]];
    for (const [principal, persona] of actors) {
      const token = principal === "admin" ? admin : await school.bearer(principal, persona);
      const contacts: Contact[] = (await fixtureApi(school, "/directory?limit=100", { token, persona })).payload.data;
      const direct = contacts.filter(c => c.target.kind === "person");
      const groups = [
        direct.filter(c => c.role === "guardian"),
        direct.filter(c => c.role === "teacher"),
        direct.filter(c => c.role !== "teacher" && c.role !== "guardian"),
      ];
      for (const group of groups) {
        assert.ok(group.length > 0, `${persona}: every role must have at least one other active contact`);
        for (const contact of group) {
          if (contact.role === "guardian") {
            assert.equal(contact.workEmail ?? null, null);
            assert.equal(contact.workPhone ?? null, null);
          }
          const key = randomUUID();
          const input = { target: contact.target };
          const first = await fixtureApi(school, "/threads", { token, persona, method: "POST", key, body: input });
          const repeat = await fixtureApi(school, "/threads", { token, persona, method: "POST", key: randomUUID(), body: input });
          assert.equal(first.payload.data.kind, "direct");
          assert.equal(first.payload.data.threadId, repeat.payload.data.threadId, "same pair must reuse thread");
        }
      }
    }
  } finally {
    await school.close();
  }
});

test("recommended contacts prioritize the assigned teacher, all people includes other teachers and parents, and pagination does not omit contacts", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    await setUpCalendar(school, admin);
    const token = await school.bearer("guardian-ar", "guardian");
    const request = (path: string) => fixtureApi(school, path, { token, persona: "guardian" });
    const mine: Contact[] = (await request("/directory?view=mine&limit=100")).payload.data;
    assert.equal(mine[0]?.role, "teacher", "assigned teachers precede administration");
    assert.ok(mine.some(c => c.displayName === "يوسف عبد الرحمن محمود"));
    assert.ok(mine.filter(c=>c.role==="teacher").every(c=>c.contexts.length>0));
    // Only the responsible primary teacher is recommended; others stay in All persons.
    assert.ok(!mine.some(c=>c.displayName==="Johannes Peter Schneider"));
    assert.ok(mine.every(c => c.target.kind === "person"));
    const all: Contact[] = (await request("/directory?view=all&limit=100")).payload.data;
    assert.ok(all.some(c => c.displayName === "Johannes Peter Schneider"));
    assert.deepEqual(mine.filter(c=>c.role==="teacher").map(c=>c.id),all.filter(c=>c.role==="teacher"&&c.contexts.length>0).map(c=>c.id));
    assert.ok(all.some(c => c.role === "guardian"));
    assert.ok(all.every(c => c.target.kind === "person"));
    assert.ok(!all.some(c => c.displayName === "سلمى عبد الرحمن محمد"), "no self contact");
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const response = (await request("/directory?view=all&limit=2" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""))).payload;
      seen.push(...response.data.map((c: Contact) => c.id));
      cursor = response.meta?.nextCursor;
      assert.ok(seen.length <= all.length, "pagination cannot loop or duplicate");
    } while (cursor);
    assert.deepEqual(seen, all.map(c => c.id));
  } finally {
    await school.close();
  }
});
