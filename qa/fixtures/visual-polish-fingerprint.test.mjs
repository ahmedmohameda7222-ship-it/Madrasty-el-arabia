import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRegistrySource } from "./visual-polish-fingerprint.mjs";

for (const path of ["apps/web/public/manifest.webmanifest", "apps/web/public/templates/family-import.csv", "apps/web/src/app/page.tsx", "apps/android/app/src/main/res/values/strings.xml"]) {
  test("normalizes checkout line endings: " + path, () => {
    const lf = Buffer.from("مدرستي\nSchule\n");
    const crlf = Buffer.from("مدرستي\r\nSchule\r\n");
    assert.equal(normalizeRegistrySource(path, lf), normalizeRegistrySource(path, crlf));
  });
}
for (const path of ["apps/web/public/school-180.png", "apps/web/public/templates/family-import.xlsx"]) {
  test("preserves binary source bytes: " + path, () => {
    const bytes = Buffer.from([0, 0x0d, 0x0a, 255, 0]);
    assert.deepEqual(normalizeRegistrySource(path, bytes), bytes);
  });
}
