import { existsSync, statSync } from "node:fs";
/** Summarize evidence without turning a denied route, loading screen or redirect into a pass. */
export function summarizeCaptures(records, {strictRetry = false, verifiedDenials = []} = {}) {
  const summary = {attempted: records.length, captured: 0, denied: 0, failed: 0, failures: []};
  for (const entry of records) {
    const id = `${entry.route} (${entry.width}px)`;
    const fail = (reason) => { summary.failed++; summary.failures.push(`${id}: ${reason}`); };
    if (entry.httpStatus === 403 || entry.httpStatus === 404) {
      // The caller passes the denial list for this exact role and locale, not a global 404 whitelist.
      if (verifiedDenials.includes(entry.route)) { summary.denied++; continue; }
      fail(`HTTP ${entry.httpStatus} without verified persona permission evidence`);
      continue;
    }
    if (entry.error) { fail(entry.error); continue; }
    if (entry.httpStatus === undefined || entry.httpStatus < 200 || entry.httpStatus >= 300) {
      fail(`HTTP ${entry.httpStatus ?? 'missing'}`); continue;
    }
    if (entry.finalPath !== entry.route) {
      fail(`redirect/finalPath ${entry.finalPath ?? 'missing'} does not match requested route`); continue;
    }
    if (entry.terminalState !== 'ready' && entry.terminalState !== 'empty') {
      if ((entry.terminalState === 'error' || entry.terminalState === 'offline') && entry.captureIntent === entry.terminalState) {
        // A deliberately requested error/offline evidence shot, not a normal page acceptance.
      } else {
        fail(`no accepted terminal state (${entry.terminalState ?? 'missing'}); loading/error/forbidden is not ready`);
        continue;
      }
    }
    if (!entry.files?.length) { fail('no screenshot'); continue; }
    summary.captured++;
  }
  return summary;
}

/** Also checks exact expected pathname+viewport pairs, not only their total count. */
export function assertCompleteAudit(records, {expected, targets, strictRetry = false, verifiedDenials = [], verifyFiles = false, requireIdentity = false, expectedSha} = {}) {
  const summary = summarizeCaptures(records, {strictRetry, verifiedDenials});
  if (expected !== undefined && expected !== summary.attempted) {
    throw new Error(`Expected ${expected} route attempts, got ${summary.attempted}`);
  }
  if (requireIdentity) {
    for (const entry of records) {
      if (!entry.role || !['admin', 'teacher', 'guardian'].includes(entry.role) ||
          !['ar', 'de'].includes(entry.locale) ||
          typeof entry.sha !== 'string' || !entry.sha.trim() ||
          !entry.route?.startsWith(`/${entry.locale}/`) ||
          !Number.isInteger(entry.width) || entry.width <= 0 ||
          !entry.mode) {
        throw new Error(`Missing role/locale/path/width/mode/sha capture identity: ${entry.route ?? '-'}`);
      }
      if (expectedSha !== undefined && entry.sha !== expectedSha) {
        throw new Error(`Capture SHA mismatch for ${entry.route}: ${entry.sha} is not ${expectedSha}`);
      }
    }
  }
  if (verifyFiles) {
    for (const entry of records) {
      if ([403, 404].includes(entry.httpStatus) && verifiedDenials.includes(entry.route)) continue;
      for (const file of entry.files ?? []) {
        if (typeof file !== 'string' || !existsSync(file) || !statSync(file).isFile() || statSync(file).size === 0) {
          throw new Error(`Missing or empty screenshot file for ${entry.route}: ${file}`);
        }
      }
    }
  }
  if (targets) {
    const key = (entry) => `${entry.role ?? ''}::${entry.locale ?? ''}::${entry.route}::${entry.width}::${entry.mode ?? 'standard'}`;
    const actual = new Set(records.map(key));
    const required = new Set(targets.map(key));
    if (actual.size !== records.length) throw new Error('Duplicate route/viewport capture attempt');
    if (required.size !== targets.length) throw new Error('Duplicate required route/viewport target');
    const missing = targets.filter(entry => !actual.has(key(entry)));
    const extra = records.filter(entry => !required.has(key(entry)));
    if (missing.length || extra.length) {
      throw new Error(`Capture coverage missing ${missing.map(key).join(', ') || '-'}; unexpected ${extra.map(key).join(', ') || '-'}`);
    }
  }
  if (summary.failed) {
    const sample = summary.failures.slice(0, 8).join(' | ');
    throw new Error(`${summary.failed} screenshot routes failed: ${sample}`);
  }
  if (!summary.captured) throw new Error('No successful screenshots: denied routes do not count as coverage');
  return summary;
}

export function selectRetryTargets(targets, persona, locale, route, width) {
  return Array.isArray(targets[`${persona}-${locale}`]) && targets[`${persona}-${locale}`].some(
    entry => entry.route === route && entry.width === width
  );
}
