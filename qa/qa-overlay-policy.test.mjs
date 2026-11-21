import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = readFileSync(new URL('../apps/web/next.config.ts', import.meta.url), 'utf8');
test('QA-only screenshot environment disables Next dev badge without hiding actual app errors globally', () => {
  assert.match(config, /devIndicators:\s*process\.env\.QA_SCREENSHOTS_ONLY\s*===\s*["']1["']\s*\?\s*false\s*:\s*undefined/);
  assert.doesNotMatch(config, /devIndicators:\s*false\s*[,}]/);
});
