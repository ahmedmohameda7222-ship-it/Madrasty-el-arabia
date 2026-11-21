import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { chatMessage } from "../../packages/contracts/src/comms/messages";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("a guardian and teacher exchange one private message, read and react without leaking to school administration", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    await setUpCalendar(school, admin);
    const [guardian, teacher, finance] = await Promise.all([
      school.bearer("guardian-ar", "guardian"), school.bearer("teacher", "teacher"), school.bearer("finance", "admin"),
    ]);
    const directory = (await fixtureApi(school, "/directory", { token: guardian })).payload.data;
    const staff = directory.find((contact: { displayName: string }) => contact.displayName === `${school.run} teacher`);
    assert.ok(staff?.target);
    const thread = await fixtureApi(school, "/threads", {
      token: guardian, persona: "guardian", method: "POST", key: `${school.run}.teacher-chat`, body: { target: staff.target },
    });
    assert.equal(thread.payload.data.kind, "direct");
    const path = `/threads/${thread.payload.data.threadId}`;
    const id = randomUUID();
    const body = `رسالة اختبار ${id}`;
    const send = { token: guardian, persona: "guardian", method: "POST", key: id,
      body: { clientMessageId: id, body }, status: 201 } as const;
    const first = chatMessage.parse((await fixtureApi(school, `${path}/messages`, send)).payload.data);
    const replay = chatMessage.parse((await fixtureApi(school, `${path}/messages`, send)).payload.data);
    assert.equal(first.id, replay.id);
    const teacherInbox = await fixtureApi(school, `${path}/messages?q=${encodeURIComponent(id)}`, { token: teacher });
    assert.deepEqual(teacherInbox.payload.data.map((message: { body: string }) => message.body), [body]);

    for (const outsider of [admin, finance]) {
      await fixtureApi(school, `${path}/messages`, { token: outsider, status: 404 });
    }
    await fixtureApi(school, `${path}/state`, { method: "PATCH", token: teacher, persona: "teacher",
      body: { readThroughSeq: first.sequence } });
    await fixtureApi(school, `${path}/messages/${first.id}/reaction`, { method: "PUT", token: teacher, persona: "teacher",
      body: { emoji: "👍" } });
    const read = chatMessage.parse((await fixtureApi(school, `${path}/messages?limit=1`, { token: guardian })).payload.data[0]);
    assert.equal(read.counterpartRead, true);
    assert.deepEqual(read.reactions, [{ emoji: "👍", count: 1, mine: false }]);
  } finally {
    await school.close();
  }
});
