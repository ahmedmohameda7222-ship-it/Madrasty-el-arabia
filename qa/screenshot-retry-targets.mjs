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

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [, , outputFile, ...manifestFiles] = process.argv;
  if (!outputFile || !manifestFiles.length) throw new Error('Usage: node qa/screenshot-retry-targets.mjs OUTPUT manifest.json ...');
  const targets=buildRetryTargets(manifestFiles.map(file=>JSON.parse(readFileSync(file,'utf8'))));
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
