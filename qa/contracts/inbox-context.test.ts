import assert from "node:assert/strict";
import { test } from "node:test";
import { readInboxContext, writeInboxContext, withInboxThread } from "../../apps/web/src/features/comms/inbox-context";

const filters = ["all", "direct", "office", "student_affairs", "accounts"] as const;

test("opening and returning from a thread retains inbox filters and school context", () => {
  const source = new URLSearchParams("returnChild=child-id&filter=office&q=شؤون الطلاب&archived=1");
  const thread = withInboxThread(source, "thread-id");
  assert.equal(thread.get("thread"), "thread-id");
  const context = readInboxContext(thread, filters);
  assert.deepEqual(context, { filter: "office", search: "شؤون الطلاب", archived: true });
  const back = withInboxThread(thread);
  assert.equal(back.has("thread"), false);
  assert.equal(back.get("returnChild"), "child-id");
  assert.equal(back.get("q"), "شؤون الطلاب");
  assert.equal(source.has("thread"), false);
});

test("clearing one inbox filter retains unrelated navigation parameters", () => {
  const source = new URLSearchParams("thread=thread-id&filter=direct&q=old&archived=1&returnClass=abc");
  const changed = writeInboxContext(source, { filter: "all", search: "  ", archived: false });
  assert.equal(changed.has("filter"), false);
  assert.equal(changed.has("q"), false);
  assert.equal(changed.has("archived"), false);
  assert.equal(changed.get("thread"), "thread-id");
  assert.equal(changed.get("returnClass"), "abc");
  assert.equal(readInboxContext(new URLSearchParams("filter=unknown&archived=0"), filters).filter, "all");
});
