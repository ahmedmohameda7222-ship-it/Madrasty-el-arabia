import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures, type Persona, type Principal } from "../fixtures/school";
import { fixtureApi } from "../support/api";

type Contact = { id: string; role: string; displayName: string | null; workEmail?: string | null; workPhone?: string | null; target: { kind: "person" | "office"; id: string } };

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
