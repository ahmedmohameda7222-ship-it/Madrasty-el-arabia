import { readFileSync, writeFileSync } from "node:fs";
const production = process.env.VISUAL_POLISH_RUNTIME === "production";
const root = production ? "qa-artifacts/visual-polish/P12-production" : "qa-artifacts/visual-polish/P12";
const roles = ["admin", "teacher", "guardian"];
const groups = [];
for (const role of roles) {
  const before = JSON.parse(readFileSync(root + "/baseline/" + role + "/samples.json", "utf8"));
  const after = JSON.parse(readFileSync(root + "/candidate/" + role + "/samples.json", "utf8"));
  if (before.samples.length !== 70 || after.samples.length !== 70) throw Error("Incomplete matched series for " + role);
  if (before.runtime !== after.runtime || !before.runtime.includes(production ? "production with verified TLS" : "development")) throw Error("Unmatched runtime");
  if (before.browser !== after.browser || JSON.stringify(before.viewport) !== JSON.stringify(after.viewport)) throw Error("Unmatched browser or viewport");
  for (const mode of ["fresh-browser-context", "reused-browser-context"]) {
    for (const action of [...new Set(before.samples.map(s => s.action))]) {
      function summary(data) {
        const rows = data.samples.filter(s => s.mode === mode && s.action === action);
        if (rows.length !== 5) throw Error("Incomplete group");
        const sorted = rows.map(s => s.durationMs).sort((a,b) => a-b);
        const raf = rows.map(s => s.firstRafProxyMs).filter(v => v !== null).sort((a,b) => a-b);
        const tasks = rows.flatMap(s => s.longTasks ?? []);
        return { n: sorted.length, medianMs: sorted[2], minMs: sorted[0], maxMs: sorted.at(-1),
          firstRafProxySamples: raf.length, firstRafProxyMedianMs: raf.length ? raf[Math.floor(raf.length/2)] : null,
          longTaskCount: rows.some(s => s.longTasks !== null) ? tasks.length : null, maxLongTaskMs: tasks.length ? Math.max(...tasks) : null };
      }
      const baseline=summary(before),candidate=summary(after);
      groups.push({ role, mode, action, baselineSha: before.sourceSha, candidateSha: after.sourceSha, baseline, candidate,
        medianDeltaMs: Math.round((candidate.medianMs-baseline.medianMs)*100)/100 });
    }
  }
}
writeFileSync(root + "/matched-summary.json", JSON.stringify({ notes: ["Five repetitions per journey/context/stage; p95 omitted due to small sample.", production ? "Hosted browser production-mode loopback measurements, not a live deployment or physical-device measurements." : "Hosted browser dev measurements, not physical-device or production measurements.", "Differences require investigation; no automatic release approval."], groups }, null, 2));
console.log(JSON.stringify({ groups: groups.length, baselineSha: groups[0]?.baselineSha, candidateSha: groups[0]?.candidateSha }));
