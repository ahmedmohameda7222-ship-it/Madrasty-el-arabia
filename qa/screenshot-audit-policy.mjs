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
    if (entry.httpStatus === undefined || entry.httpStatus < 200 || entry.httpStatus >= 400) {
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
export function assertCompleteAudit(records, {expected, targets, strictRetry = false, verifiedDenials = []} = {}) {
  const summary = summarizeCaptures(records, {strictRetry, verifiedDenials});
  if (expected !== undefined && expected !== summary.attempted) {
    throw new Error(`Expected ${expected} route attempts, got ${summary.attempted}`);
  }
  if (targets) {
    const key = (entry) => `${entry.route}::${entry.width}`;
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
