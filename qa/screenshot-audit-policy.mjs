/** Keep screenshot evidence separate from role-denied routes and navigation failures. */
export function summarizeCaptures(records, {strictRetry = false, verifiedDenials = []} = {}) {
  const summary = {attempted: records.length, captured: 0, denied: 0, failed: 0, failures: []};
  for (const entry of records) {
    const id = `${entry.route} (${entry.width}px)`;
    if (entry.httpStatus === 403 || entry.httpStatus === 404) {
      if (!strictRetry || verifiedDenials.includes(entry.route)) { summary.denied++; continue; }
      summary.failed++;
      summary.failures.push(`${id}: HTTP ${entry.httpStatus} (was a network failure in prior run)`);
      continue;
    }
    if (entry.error) {
      summary.failed++;
      summary.failures.push(`${id}: ${entry.error}`);
      continue;
    }
    if (entry.httpStatus !== undefined && (entry.httpStatus < 200 || entry.httpStatus >= 400)) {
      summary.failed++;
      summary.failures.push(`${id}: HTTP ${entry.httpStatus}`);
      continue;
    }
    if (!entry.files?.length) {
      summary.failed++;
      summary.failures.push(`${id}: no screenshot`);
      continue;
    }
    summary.captured++;
  }
  return summary;
}

/** Fails a suite if its declared attempt count differs or any target failed. */
export function assertCompleteAudit(records, {expected, strictRetry = false, verifiedDenials = []} = {}) {
  const summary = summarizeCaptures(records, {strictRetry, verifiedDenials});
  if (expected !== undefined && expected !== summary.attempted) {
    throw new Error(`Expected ${expected} route attempts, got ${summary.attempted}`);
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
