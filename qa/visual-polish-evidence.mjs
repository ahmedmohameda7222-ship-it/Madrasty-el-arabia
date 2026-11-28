import { readFileSync, realpathSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// A structural evidence gate, not a visual reviewer. The caller must supply
// the complete, source-reviewed matrix and perform real before/after review.
const identityFields = [
  "sceneId", "platform", "role", "capabilityProfile", "locale", "theme", "runtime", "mode",
  "viewportWidth", "viewportHeight", "fontScale", "reducedMotion", "route", "queryTemplate", "state", "fixtureId",
];
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const unique = values => Array.isArray(values) && values.every(nonempty) && new Set(values).size === values.length;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function identity(entry) {
  for (const field of identityFields) {
    const value = entry[field];
    const valid = ["viewportWidth", "viewportHeight"].includes(field) ? Number.isInteger(value) && value > 0
      : field === "fontScale" ? Number.isFinite(value) && value > 0
      : field === "reducedMotion" ? typeof value === "boolean"
      : field === "queryTemplate" ? typeof value === "string" : nonempty(value);
    if (!valid) throw new Error(`Missing or invalid visual identity field ${field}`);
  }
  if (!["web", "android"].includes(entry.platform) || !["admin", "teacher", "guardian", "public"].includes(entry.role) ||
      !["ar", "de"].includes(entry.locale) || !["light", "dark"].includes(entry.theme)) {
    throw new Error("Invalid visual identity platform, role, locale or theme");
  }
  return JSON.stringify(identityFields.map(field => entry[field]));
}

function inspectPng(file, used) {
  if (!nonempty(file)) throw new Error("Missing screenshot file path");
  try {
    const resolved = realpathSync(file);
    if (used.has(resolved)) throw new Error("Duplicate/reused screenshot file");
    if (!statSync(resolved).isFile()) throw new Error("Screenshot path is not a file");
    const image = readFileSync(resolved);
    if (image.length < 45 || !image.subarray(0, 8).equals(pngSignature) ||
        image.readUInt32BE(8) !== 13 || image.toString("ascii", 12, 16) !== "IHDR" ||
        !image.readUInt32BE(16) || !image.readUInt32BE(20) ||
        image.readUInt32BE(image.length - 12) !== 0 || image.toString("ascii", image.length - 8, image.length - 4) !== "IEND") {
      throw new Error("Invalid or incomplete PNG screenshot");
    }
    used.add(resolved);
  } catch (error) {
    throw new Error(`Screenshot file invalid: ${file}: ${error.message}`);
  }
}

export function assertMatchedVisualAudit({ sceneIds, targets, records, beforeSha, afterSha, exclusions = [] }) {
  if (!unique(sceneIds) || sceneIds.length === 0) throw new Error("Missing or duplicate declared scene IDs");
  if (!sha(beforeSha) || !sha(afterSha)) throw new Error("Expected full before/after commit SHA");
  if (!Array.isArray(targets) || !Array.isArray(records) || !Array.isArray(exclusions) || !targets.length) {
    throw new Error("Missing visual target or capture matrix");
  }
  const declared = new Set(sceneIds), covered = new Set(), excluded = new Set(), expected = new Map();
  for (const target of targets) {
    const key = identity(target);
    if (!declared.has(target.sceneId)) throw new Error(`Unexpected scene ${target.sceneId}`);
    if (expected.has(key)) throw new Error(`Duplicate visual target: ${key}`);
    if (!nonempty(target.expectedRoute) || !nonempty(target.expectedTerminalState) ||
        !unique(target.elements) || !target.elements.length) throw new Error(`Missing route, terminal or element contract: ${key}`);
    const status = target.expectedHttpStatus;
    if (target.platform === "android" ? status !== null : status !== null && (!Number.isInteger(status) || status < 100 || status > 599)) {
      throw new Error(`Invalid expected HTTP status: ${key}`);
    }
    if (target.platform === "web" && ["ready", "empty"].includes(target.expectedTerminalState) &&
        (status === null || status < 200 || status >= 300)) throw new Error(`Invalid HTTP status for ready terminal state: ${key}`);
    covered.add(target.sceneId);
    expected.set(key, target);
  }
  for (const item of exclusions) {
    if (!declared.has(item.sceneId) || covered.has(item.sceneId) || excluded.has(item.sceneId) ||
        item.result !== "NOT_APPLICABLE" || !nonempty(item.sourcePath) || !nonempty(item.rationale) || !nonempty(item.reviewer)) {
      throw new Error(`Invalid or duplicate scene exclusion (source, rationale and reviewer required): ${item.sceneId}`);
    }
    excluded.add(item.sceneId);
  }
  for (const id of declared) if (!covered.has(id) && !excluded.has(id)) throw new Error(`Missing scene coverage: ${id}`);

  const seen = new Set(), files = new Set();
  for (const record of records) {
    const key = identity(record), target = expected.get(key);
    if (!target) throw new Error(`Unexpected visual capture identity: ${key}`);
    if (!["before", "after"].includes(record.stage)) throw new Error(`Invalid capture stage: ${key}`);
    const staged = JSON.stringify([key, record.stage]);
    if (seen.has(staged)) throw new Error(`Duplicate capture: ${staged}`);
    seen.add(staged);
    if (record.sha !== (record.stage === "before" ? beforeSha : afterSha)) throw new Error(`Capture SHA mismatch: ${staged}`);
    if (record.error || record.observedStatus !== target.expectedHttpStatus) throw new Error(`Capture HTTP status or error mismatch: ${staged}`);
    if (record.finalRoute !== target.expectedRoute) throw new Error(`Capture route mismatch: ${staged}`);
    if (record.terminalState !== target.expectedTerminalState) throw new Error(`Capture terminal state mismatch: ${staged}`);
    if (!unique(record.elements) || record.elements.length !== target.elements.length ||
        record.elements.some(id => !target.elements.includes(id))) throw new Error(`Capture element identity mismatch: ${staged}`);
    if (!Array.isArray(record.files) || !record.files.length) throw new Error(`Missing screenshot files: ${staged}`);
    for (const file of record.files) inspectPng(file, files);
  }
  for (const key of expected.keys()) for (const stage of ["before", "after"]) {
    const staged = JSON.stringify([key, stage]);
    if (!seen.has(staged)) throw new Error(`Missing matched capture: ${staged}`);
  }
  return { scenes: declared.size, targets: expected.size, captures: seen.size };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [matrixFile, capturesFile, extra] = process.argv.slice(2);
    if (!matrixFile || !capturesFile || extra) {
      throw new Error("Usage: node qa/visual-polish-evidence.mjs <reviewed-matrix.json> <captures.json>");
    }
    const repo = fileURLToPath(new URL("..", import.meta.url));
    const json = path => JSON.parse(readFileSync(path, "utf8"));
    const scenes = json(resolve(repo, "docs/visual-polish/SCENES.json"));
    const elements = json(resolve(repo, "docs/visual-polish/ELEMENTS.json"));
    const matrix = json(matrixFile), captures = json(capturesFile);
    if (!/^[a-f0-9]{64}$/.test(scenes.sourceFingerprint) ||
        scenes.sourceFingerprint !== elements.sourceFingerprint ||
        scenes.sourceFingerprint !== matrix.sourceFingerprint ||
        scenes.sourceSha !== elements.sourceSha) {
      throw new Error("Reviewed matrix does not match the checkout's scene/element registry fingerprint");
    }
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    if (captures.beforeSha !== scenes.sourceSha || captures.afterSha !== head) {
      throw new Error("Captures must pair the registered baseline with the checked-out HEAD");
    }
    const registeredElements = new Set(elements.elements.map(element => element.id));
    for (const target of matrix.targets ?? []) {
      for (const id of target.elements ?? []) {
        if (!registeredElements.has(id)) throw new Error("Unregistered visual element: " + id);
      }
    }
    const captureDirectory = dirname(resolve(capturesFile));
    const records = Array.isArray(captures.records) ? captures.records.map(record => ({
      ...record,
      files: Array.isArray(record.files)
        ? record.files.map(file => nonempty(file) ? resolve(captureDirectory, file) : file)
        : record.files,
    })) : captures.records;
    const result = assertMatchedVisualAudit({
      sceneIds: scenes.scenes.map(scene => scene.id),
      targets: matrix.targets, exclusions: matrix.exclusions,
      beforeSha: scenes.sourceSha, afterSha: head, records,
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
