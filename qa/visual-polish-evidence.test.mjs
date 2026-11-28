import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertMatchedVisualAudit } from "./visual-polish-evidence.mjs";

const beforeSha = "a".repeat(40), afterSha = "b".repeat(40);
const target = (extra = {}) => ({
  sceneId: "WR-004", platform: "web", role: "guardian", capabilityProfile: "guardian",
  locale: "ar", theme: "dark", runtime: "webkit", mode: "browser", viewportWidth: 320, viewportHeight: 844,
  fontScale: 2, reducedMotion: true, route: "/ar/account/security", queryTemplate: "",
  state: "ready", fixtureId: "synthetic-guardian", expectedRoute: "/ar/account/security",
  expectedHttpStatus: 200, expectedTerminalState: "ready", elements: ["email", "password"], ...extra,
});
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "visual-audit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0yQAAAAASUVORK5CYII=", "base64");
  const files = [join(dir, "before.png"), join(dir, "after.png")];
  files.forEach(file => writeFileSync(file, png));
  const records = (item = target()) => ["before", "after"].map((stage, i) => ({
    ...item, stage, sha: i ? afterSha : beforeSha,
    finalRoute: item.expectedRoute, observedStatus: item.expectedHttpStatus,
    terminalState: item.expectedTerminalState, files: [files[i]],
  }));
  const options = (targets = [target()], recordsOverride = records()) => ({
    sceneIds: ["WR-004"], targets, records: recordsOverride, beforeSha, afterSha,
  });
  return { records, options, dir };
}

test("matched evidence requires both exact source revisions and identity", t => {
  const { options } = fixture(t);
  assert.deepEqual(assertMatchedVisualAudit(options()), { scenes: 1, targets: 1, captures: 2 });
});
test("theme mismatch and duplicate before capture cannot substitute for missing after evidence", t => {
  const { records, options } = fixture(t);
  const wrong = records(); wrong[1].theme = "light";
  assert.throws(() => assertMatchedVisualAudit(options([target()], wrong)), /unexpected|identity/i);
  const duplicate = records(); duplicate[1] = { ...duplicate[0] };
  assert.throws(() => assertMatchedVisualAudit(options([target()], duplicate)), /duplicate/i);
});
test("candidate from another commit cannot pass", t => {
  const { records, options } = fixture(t);
  const wrong = records(); wrong[1].sha = beforeSha;
  assert.throws(() => assertMatchedVisualAudit(options([target()], wrong)), /sha/i);
});
test("unexpected denied, redirect or loading terminal state cannot pass ready evidence", t => {
  const { records, options } = fixture(t);
  for (const change of [{ observedStatus: 403 }, { finalRoute: "/ar/account/sign-in" }, { terminalState: "loading" }]) {
    const wrong = records(); Object.assign(wrong[1], change);
    assert.throws(() => assertMatchedVisualAudit(options([target()], wrong)), /status|route|terminal/i);
  }
});
test("explicit forbidden state is a separate matched target, not ready", t => {
  const { records, options } = fixture(t);
  const denied = target({ state: "forbidden", expectedHttpStatus: 404, expectedTerminalState: "forbidden" });
  assert.equal(assertMatchedVisualAudit(options([denied], records(denied))).captures, 2);
});
test("missing and non-PNG evidence cannot pass", t => {
  const { records, options, dir } = fixture(t);
  const missing = records(); missing[1].files = [join(dir, "missing.png")];
  assert.throws(() => assertMatchedVisualAudit(options([target()], missing)), /file|png/i);
  const invalid = records(); writeFileSync(invalid[1].files[0], "not a PNG");
  assert.throws(() => assertMatchedVisualAudit(options([target()], invalid)), /png/i);
});
test("every declared scene needs an explicit target and every target needs both stages", t => {
  const { records, options } = fixture(t);
  assert.throws(() => assertMatchedVisualAudit({ ...options(), sceneIds: ["WR-004", "WR-005"] }), /scene|coverage/i);
  assert.throws(() => assertMatchedVisualAudit(options([target()], records().slice(0, 1))), /missing/i);
});
test("distinct capability profiles and element identities cannot be silently collapsed", t => {
  const { records, options } = fixture(t);
  const other = target({ capabilityProfile: "restricted-guardian" });
  assert.throws(() => assertMatchedVisualAudit(options([target(), other], records())), /missing/i);
  const wrong = records(); wrong[1].elements = ["email"];
  assert.throws(() => assertMatchedVisualAudit(options([target()], wrong)), /element/i);
});

test("non-rendering scene exclusions require explicit source proof and reviewer", t => {
  const { options } = fixture(t);
  const config = { ...options(), sceneIds: ["WR-004", "WEB-endpoint"] };
  assert.throws(() => assertMatchedVisualAudit({ ...config, exclusions: [{ sceneId: "WEB-endpoint" }] }), /exclusion|source|review/i);
  const exclusions = [{ sceneId: "WEB-endpoint", result: "NOT_APPLICABLE", sourcePath: "apps/web/src/app/example/route.ts", rationale: "Non-rendering redirect endpoint; reviewed route response.", reviewer: "QA" }];
  assert.deepEqual(assertMatchedVisualAudit({ ...config, exclusions }), { scenes: 2, targets: 1, captures: 2 });
});
test("a ready target cannot label a denial as its expected ready response", t => {
  const { records, options } = fixture(t);
  const contradictory = target({ expectedHttpStatus: 404 });
  assert.throws(() => assertMatchedVisualAudit(options([contradictory], records(contradictory))), /status|terminal/i);
});
test("a single screenshot file cannot stand in for both before and after", t => {
  const { records, options } = fixture(t);
  const reused = records(); reused[1].files = reused[0].files;
  assert.throws(() => assertMatchedVisualAudit(options([target()], reused)), /reus|duplicate/i);
});
