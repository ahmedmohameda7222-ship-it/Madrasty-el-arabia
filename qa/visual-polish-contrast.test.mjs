import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const school = readFileSync("apps/web/src/app/school.css", "utf8");
const shared = readFileSync("apps/web/src/app/school-tokens.css", "utf8");
const calendar = readFileSync("apps/web/src/features/school/Calendar.module.css", "utf8");
const classMonitor = readFileSync("apps/web/src/features/school/AdminClassMonitor.module.css", "utf8");
const timetable = readFileSync("apps/web/src/features/school/timetable/Timetable.module.css", "utf8");
const finance = readFileSync("apps/web/src/features/finance/FinanceWorkspace.module.css", "utf8");
function palette(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, "Missing " + selector);
  const body = source.slice(start + selector.length, source.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6}|#[0-9a-f]{3})(?![0-9a-f])/gi)].map(match => [match[1], match[2].length === 4 ? "#" + [...match[2].slice(1)].map(ch => ch + ch).join("") : match[2]]));
}
function luminance(color) {
  assert.match(color ?? "", /^#[0-9a-f]{6}$/i);
  const rgb = color.slice(1).match(/../g).map(part => parseInt(part, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function ratio(a,b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
const themes = [
  ["light", palette(shared, ":root {"), palette(calendar, ".root {")],
  ["dark", palette(shared, ':root[data-theme="dark"] {'), palette(calendar, ':global(:root[data-theme="dark"]) .root {')],
];
for (const [mode, base, cal] of themes) {
  const checks = [
    ["shared body text on canvas", base["--text-primary"], base["--surface-canvas"], 4.5],
    ["shared secondary on canvas", base["--text-secondary"], base["--surface-canvas"], 4.5],
    ["shared secondary on inset", base["--text-secondary"], base["--surface-inset"], 4.5],
    ["shared selection", base["--selection-ink"], base["--selection"], 4.5],
    ["shared action", base["--on-action"], base["--action"], 4.5],
    ["chat placeholder on composer inset", base["--text-secondary"], base["--surface-inset"], 4.5],
    ["input placeholder on card", base["--text-secondary"], base["--surface-card"], 4.5],
    ["chat sent-message focus ring", base["--on-action"], base["--action"], 3],
    ["calendar secondary on canvas", cal["--c-muted"], base["--surface-canvas"], 4.5],
    ["calendar secondary on card", cal["--c-muted"], cal["--c-card"], 4.5],
    ["calendar secondary on plain", cal["--c-muted"], cal["--c-plain"], 4.5],
    ["calendar accent on canvas", cal["--c-accent"], base["--surface-canvas"], 4.5],
    ["calendar accent status", cal["--c-accent"], cal["--c-accent-soft"], 4.5],
    ["calendar danger status", cal["--c-danger"], cal["--c-danger-soft"], 4.5],
    ["calendar warning status", cal["--c-warning"], cal["--c-warning-soft"], 4.5],
    ["calendar draft status", cal["--c-draft"], cal["--c-draft-soft"], 4.5],
    ["calendar primary action", cal["--c-on-primary"], cal["--c-primary"], 4.5],
    ["calendar input outline", base["--field-border"], cal["--c-input"], 3],
    ["calendar input placeholder", cal["--c-muted"], cal["--c-input"], 4.5],
  ];
  for (const [label, foreground, background, minimum] of checks) test(mode + " " + label, () => {
    const value = ratio(foreground, background);
    console.log(mode + " " + label + ": " + value.toFixed(2) + ":1");
    assert.ok(value >= minimum, label + " requires " + minimum + ":1, observed " + value.toFixed(2) + ":1");
  });
}
test("calendar fields use the measured control boundary token", () => {
  assert.match(calendar, /\.field\s*\{[^}]*border:\s*1px solid var\(--field-border\)/);
});

test("chat applies accessible tokens to the placeholder and the sent-message focus ring", () => {
  assert.match(school, /\.comms-input-field textarea::placeholder\s*\{[^}]*color:\s*var\(--muted\)[^}]*opacity:\s*1/);
  assert.match(school, /\.comms-message\[data-own=true\] \.comms-message-actions>summary:focus-visible\s*\{[^}]*outline-color:\s*var\(--on-primary\)/);
});

const placeholderRules = [
  ["conversation search", school, ".comms-hub .inbox-search input::placeholder", "--muted"],
  ["contact search", school, ".comms-search::placeholder", "--muted"],
  ["family search", school, ".family-search input::placeholder", "--muted"],
  ["class fields", classMonitor, ".field input::placeholder", "--muted"],
  ["calendar reason", calendar, ".field::placeholder", "--c-muted"],
  ["timetable time fields", timetable, ".fields input::placeholder", "--muted"],
  ["finance ISO text fallback", finance, ".dateFallback>input::placeholder", "--muted"],
];
for (const [label, stylesheet, selector, token] of placeholderRules) {
  test(label + " uses a full-opacity placeholder token", () => {
    const rule = stylesheet.match(/[^{}]+\{[^{}]*\}/g)?.find(block =>
      block.slice(0, block.indexOf("{")).split(",").some(part => part.trim() === selector)
    );
    assert.ok(rule, "Missing " + selector);
    assert.ok(rule.includes("color:var(" + token + ")") && rule.includes("opacity:1"), rule);
  });
}
