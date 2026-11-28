import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
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
  const truncated = records();
  const path = truncated[1].files[0];
  writeFileSync(path, readFileSync(path).subarray(0, 24));
  assert.throws(() => assertMatchedVisualAudit(options([target()], truncated)), /png/i);
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

test("release CLI binds reviewed targets and captures to the checked-out registry and HEAD", t => {
  const { options, dir } = fixture(t);
  const repo = join(dir, "checkout");
  mkdirSync(join(repo, "qa"), { recursive: true });
  mkdirSync(join(repo, "docs", "visual-polish"), { recursive: true });
  const cli = join(repo, "qa", "visual-polish-evidence.mjs");
  copyFileSync(new URL("./visual-polish-evidence.mjs", import.meta.url), cli);
  const git = args => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git(["init"]);
  git(["-c", "user.name=Visual QA", "-c", "user.email=qa@example.invalid", "commit", "--allow-empty", "-m", "candidate"]);
  const head = git(["rev-parse", "HEAD"]);
  const { targets, records } = options();
  const fingerprint = "f".repeat(64);
  const matrix = { sourceFingerprint: fingerprint, targets };
  const captures = { beforeSha, afterSha: head, records: records.map(record => ({
    ...record, sha: record.stage === "after" ? head : beforeSha,
    files: [record.stage + ".png"],
  })) };
  const write = (path, data) => writeFileSync(path, JSON.stringify(data));
  const scenesFile = join(repo, "docs", "visual-polish", "SCENES.json");
  const matrixFile = join(dir, "matrix.json"), capturesFile = join(dir, "captures.json");
  const scenes = [{ id: "WR-004", path: "apps/web/src/app/account/security/page.tsx" }];
  write(scenesFile, { sourceSha: beforeSha, sourceFingerprint: fingerprint, scenes });
  write(join(repo, "docs", "visual-polish", "ELEMENTS.json"), {
    sourceSha: beforeSha, sourceFingerprint: fingerprint, elements: [{ id: "email" }, { id: "password" }],
  });
  write(matrixFile, matrix);
  write(capturesFile, captures);
  const run = () => spawnSync(process.execPath, [cli, matrixFile, capturesFile], { cwd: dir, encoding: "utf8" });

  const complete = run();
  assert.equal(complete.status, 0, complete.stderr);
  assert.deepEqual(JSON.parse(complete.stdout), { scenes: 1, targets: 1, captures: 2 });

  write(scenesFile, { sourceSha: beforeSha, sourceFingerprint: fingerprint, scenes: [...scenes, { id: "WR-005" }] });
  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Missing scene coverage: WR-005/);

  write(scenesFile, { sourceSha: beforeSha, sourceFingerprint: fingerprint, scenes });
  write(capturesFile, { ...captures, afterSha });
  const stale = run();
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /checked-out HEAD/);

  write(capturesFile, captures);
  write(matrixFile, { ...matrix, sourceFingerprint: "0".repeat(64) });
  const wrongRegistry = run();
  assert.equal(wrongRegistry.status, 1);
  assert.match(wrongRegistry.stderr, /registry fingerprint/i);

  write(matrixFile, { ...matrix, targets: [{ ...targets[0], elements: ["not-from-registry"] }] });
  const unknownElement = run();
  assert.equal(unknownElement.status, 1);
  assert.match(unknownElement.stderr, /Unregistered visual element/);
});
