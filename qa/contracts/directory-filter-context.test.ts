import assert from "node:assert/strict";
import { test } from "node:test";
import { readDirectorySearch, writeDirectorySearch } from "../../apps/web/src/features/school/directory-filter-state";

test("guardian and student queries remain independent across tab changes", () => {
  const start = new URLSearchParams("view=guardians&guardian=some-id&studentQuery=Ahmed");
  const updated = writeDirectorySearch(start, "guardians", "  فاطمة & عائشة  ");
  assert.equal(readDirectorySearch(updated, "guardians"), "فاطمة & عائشة");
  assert.equal(readDirectorySearch(updated, "students"), "Ahmed");
  assert.equal(updated.get("view"), "guardians");
  assert.equal(updated.get("guardian"), "some-id");
  assert.equal(start.get("guardianQuery"), null, "must not mutate the original query");
});

test("clearing one query retains the other and unrelated navigation context", () => {
  const start = new URLSearchParams("class=class-id&studentQuery=Ahmed&guardianQuery=فاطمة");
  const updated = writeDirectorySearch(start, "students", "");
  assert.equal(readDirectorySearch(updated, "students"), "");
  assert.equal(readDirectorySearch(updated, "guardians"), "فاطمة");
  assert.equal(updated.has("studentQuery"), false);
  assert.equal(updated.get("class"), "class-id");
});
