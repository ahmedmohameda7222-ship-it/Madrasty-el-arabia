import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildVerifiedDenials } from './screenshot-retry-targets.mjs';
import { assertCompleteAudit } from './screenshot-audit-policy.mjs';

// Verify archived screenshots: no browser, live database, or fixture re-seeding.
const [oldStaff, oldGuardian, ...retries] = process.argv.slice(2);
if (!oldStaff || !oldGuardian || retries.length !== 4) {
  throw new Error('Usage: node qa/verify-screenshot-retry.mjs OLD_STAFF OLD_GUARDIAN RETRY_ADMIN RETRY_TEACHER RETRY_GUARDIAN_AR RETRY_GUARDIAN_DE');
}
function manifests(dir) {
  const root = path.join(dir, 'screenshots');
  return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => JSON.parse(readFileSync(path.join(root, entry.name, 'manifest.json'), 'utf8')));
}
const old = [...manifests(oldStaff), ...manifests(oldGuardian)];
const verified = buildVerifiedDenials(old);
const targets = JSON.parse(readFileSync(path.join(retries[0], 'retry-targets.json'), 'utf8'));
const expectedNames = ['admin-de', 'teacher-de', 'guardian-ar', 'guardian-de'];
assert.deepEqual(Object.keys(targets).sort(), [...expectedNames].sort(), 'unexpected retry groups');

const totals = { attempted: 0, captured: 0, denied: 0, failed: 0 };
const groups = {};
for (const [index, name] of expectedNames.entries()) {
  const dir = retries[index];
  const found = manifests(dir);
  assert.equal(found.length, 1, `expected one manifest in ${dir}`);
  const manifest = found[0];
  assert.equal(`${manifest.persona}-${manifest.locale}`, name, `wrong persona/locale in ${dir}`);
  const expectedPairs = targets[name].map(item => `${item.route}|${item.width}`).sort();
  const recordedPairs = manifest.captures.map(item => `${item.route}|${item.width}`).sort();
  assert.deepEqual(recordedPairs, expectedPairs, `missing, duplicate or unexpected routes for ${name}`);
  // The screenshot references themselves must exist in each downloaded artifact.
  for (const item of manifest.captures) {
    for (const file of item.files ?? []) {
      assert.ok(existsSync(path.join(dir, file)), `missing file ${name}/${file}`);
    }
  }
  const outcome = assertCompleteAudit(manifest.captures, {
    expected: expectedPairs.length, strictRetry: true, verifiedDenials: verified[name] ?? [],
  });
  groups[name] = { attempted: outcome.attempted, captured: outcome.captured, denied: outcome.denied, failed: outcome.failed };
  for (const field of Object.keys(totals)) totals[field] += outcome[field];
  console.log(`${name}: ${outcome.captured} screenshots + ${outcome.denied} documented denials / ${outcome.attempted} attempts`);
}
assert.equal(totals.attempted, 112, 'expected precisely 108 failed navigations + four mobile checks');
assert.equal(totals.captured, 61, 'stored screenshots changed unexpectedly');
assert.equal(totals.denied, 51, 'documented denial inventory changed unexpectedly');
assert.equal(totals.failed, 0);
const report = { sourceRuns: [44878617957,44881108800,44885864968], ...totals, groups,
  conclusion: 'Archived retry coverage verified; this does not validate a new browser or production run.' };
mkdirSync('qa-artifacts', {recursive:true});
writeFileSync('qa-artifacts/retry-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log('PASS: archived evidence classified without rerunning any browser tests:', JSON.stringify(totals));
