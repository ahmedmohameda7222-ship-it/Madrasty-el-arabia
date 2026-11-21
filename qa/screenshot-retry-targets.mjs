import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Use the old artifacts as an immutable failure inventory, never repeat successful captures. */
export function buildRetryTargets(manifests) {
  const output = {};
  for (const manifest of manifests) {
    const key = `${manifest.persona}-${manifest.locale}`;
    const failures = manifest.captures
      .filter(entry => entry.error && entry.httpStatus === undefined)
      .map(({route, width}) => ({route, width}));
    if (failures.length) output[key] = [...(output[key] ?? []), ...failures];
  }
  for (const key of Object.keys(output)) {
    output[key] = [...new Map(output[key].map(item=>[`${item.route}|${item.width}`,item])).values()];
  }
  return output;
}

/** A role-level 404 in either language / viewport is supporting evidence for a
 * role-denied page, but does not count as a rendered screenshot. Never share
 * denial evidence between roles. */
export function buildVerifiedDenials(manifests) {
  const byPersona = new Map();
  for (const manifest of manifests) {
    const denied = byPersona.get(manifest.persona) ?? new Set();
    for (const entry of manifest.captures) {
      if (entry.httpStatus === 403 || entry.httpStatus === 404) {
        denied.add(entry.route.replace(/^\\/(ar|de)(?=\\/|$)/, ''));
      }
    }
    byPersona.set(manifest.persona, denied);
  }
  const output = {};
  for (const [persona, routes] of byPersona) {
    for (const locale of ['ar', 'de']) {
      output[`${persona}-${locale}`] = [...routes].map(route => `/${locale}${route}`).sort();
    }
  }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [, , outputFile, ...manifestFiles] = process.argv;
  if (!outputFile || !manifestFiles.length) throw new Error('Usage: node qa/screenshot-retry-targets.mjs OUTPUT manifest.json ...');
  const manifests=manifestFiles.map(file=>JSON.parse(readFileSync(file,'utf8')));
  const targets=buildRetryTargets(manifests);
  if (process.env.QA_AUDIT_VERIFIED_DENIALS) writeFileSync(process.env.QA_AUDIT_VERIFIED_DENIALS, JSON.stringify(buildVerifiedDenials(manifests), null, 2)+'\n');
  // The only already-captured pages revisited are the two mobile views changed by this fix.
  for (const locale of ['ar','de']) {
    const key = `guardian-${locale}`;
    targets[key] ??= [];
    for (const suffix of ['homework','exams']) {
      const route = `/${locale}/school/more/${suffix}`;
      if (!targets[key].some(entry => entry.route === route && entry.width === 390)) {
        targets[key].push({route, width:390});
      }
    }
  }
  const count=Object.values(targets).reduce((sum,entries)=>sum+entries.length,0);
  if (!count) throw new Error('No archived network failures were found; refusing an empty retry');
  writeFileSync(outputFile, JSON.stringify(targets,null,2)+'\n');
  process.stdout.write(`Retry inventory: ${count} distinct failed route/viewport pairs across ${Object.keys(targets).length} persona/locale groups\n`);
}
