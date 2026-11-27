import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, posix } from "node:path";

const requireWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const ts = requireWeb("typescript");
const docs = "docs/visual-polish";
const read = (path) => readFileSync(path, "utf8");
const inventory = read(docs + "/INVENTORY.md");
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const sources = new Set(tracked);
const phases = new Map([...inventory.matchAll(/\| (?:WR|WS|AS)-\d+ \| (P\d+) \| (?:[^\n]*? \| )?\x60(apps\/[^\x60]+)\x60 \| OPEN \|/g)]
  .map(([, phase, path]) => [path, phase]));
const web = "apps/web/src";
const app = web + "/app/";
const android = "apps/android/app/src/main/";
const workspace = android + "java/de/madrasty/app/identity/SchoolWorkspace.kt";
const scenes = [];
const elements = [];
const modules = new Map();
const occurrences = new Map();
const visibleProps = /^(?:aria-.+|role|title|alt|placeholder|type|name|label|value|checked|disabled|readOnly|required|hidden|href|src|action|on[A-Z].+|className|icon|status|state)$/;
const compact = (s) => s.trim().replace(/\s+/g, " ");
const idFor = (path, key) => {
  const base = path + "#" + key;
  const occurrence = (occurrences.get(base) ?? 0) + 1;
  occurrences.set(base, occurrence);
  return createHash("sha256").update(base + "#" + occurrence).digest("hex").slice(0, 16);
};

function item(path, line, kind, text, owner, attributes, predicates) {
  const expression = compact(text);
  if (!expression) return;
  elements.push({
    id: idFor(path, [owner, kind, expression].join(":")), path, line, kind, owner, expression,
    ...(attributes?.length ? { attributes } : {}),
    ...(predicates?.length ? { predicates } : {}),
  });
}

function inspectTypeScript(path) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const code = (node) => compact(node.getText(source));
  const imports = new Set();
  const queries = new Set();
  const gates = [];

  function dependency(specifier) {
    const base = specifier.startsWith("@/") ? web + "/" + specifier.slice(2)
      : specifier.startsWith(".") ? posix.normalize(dirname(path) + "/" + specifier) : null;
    if (!base) return;
    const match = ["", ".tsx", ".ts", ".json", "/index.ts"].map(ext => base + ext).find(file => sources.has(file));
    if (match) imports.add(match);
  }

  function walk(node, owner = "<module>", predicates = []) {
    if (ts.isImportDeclaration(node)) dependency(node.moduleSpecifier.text);
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node) && node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) && node.name) {
      owner = code(node.name);
    }
    if (ts.isPropertySignature(node) && code(node.name) === "searchParams") {
      const type = node.type?.typeArguments?.[0];
      if (type && ts.isTypeLiteralNode(type)) type.members.forEach(member => queries.add(code(member.name)));
      else queries.add("<inspect dynamic query>");
    }
    if (ts.isPropertyAccessExpression(node) && /^(query|search|searchParams|routeParams)$/.test(code(node.expression))) {
      if (!["get", "getAll", "has", "toString"].includes(node.name.text)) queries.add(node.name.text);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
       && /^(query|search|searchParams|routeParams)$/.test(code(node.expression.expression))
       && /^(get|getAll|has)$/.test(node.expression.name.text) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      queries.add(node.arguments[0].text);
    }
    if (ts.isIfStatement(node) && /\b(notFound|redirect|hasCapability|canAccess|capabilities|activePersona)\b/.test(code(node))) {
      gates.push({ line: line(node), predicate: code(node.expression) });
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = node.attributes.properties.flatMap(prop => ts.isJsxSpreadAttribute(prop)
        ? ["..." + code(prop.expression)] : visibleProps.test(code(prop.name)) ? [code(prop)] : []);
      item(path, line(node), "jsx", code(node.tagName), owner, attributes, predicates);
    }
    if (ts.isJsxText(node)) item(path, line(node), "text", node.getText(source), owner, null, predicates);
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      item(path, line(node), "binding", code(node.expression).slice(0, 360), owner, null, predicates);
    }
    if (ts.isStringLiteral(node) && path.endsWith(".tsx") && !ts.isImportDeclaration(node.parent) && !ts.isJsxAttribute(node.parent)) {
      item(path, line(node), "stringCandidate", node.text, owner, null, predicates);
    }
    ts.forEachChild(node, child => {
      let branch;
      if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) {
        if (child === (node.thenStatement ?? node.whenTrue)) branch = code(node.expression ?? node.condition);
        if (child === (node.elseStatement ?? node.whenFalse)) branch = "!(" + code(node.expression ?? node.condition) + ")";
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === node.right) {
        branch = code(node.left);
      }
      walk(child, owner, branch ? [...predicates, branch] : predicates);
    });
  }

  walk(source);
  modules.set(path, { imports, queries, gates });
}

function inspectNative(path) {
  let owner = "<file>";
  let entry = false;
  const gates = [];
  for (const [index, line] of read(path).split(/\r?\n/).entries()) {
    if (/^\s*@Composable\b/.test(line)) entry = true;
    const fn = /^\s*(?:(?:private|internal|public|suspend|inline|override|operator)\s+)*fun\s+[\w.<>?, ]*?(\w+)\s*\(/.exec(line);
    if (fn) {
      owner = fn[1];
      if (entry) item(path, index + 1, "composable", owner, owner);
      entry = false;
    }
    for (const match of line.matchAll(/\b([A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*)\s*\(/g)) {
      item(path, index + 1, "kotlinCall", line.slice(match.index, match.index + 240), owner);
    }
    for (const match of line.matchAll(/\bR\.(?:string|drawable|plurals)\.\w+|"(?:(?:\\.)|[^"\\])*"/g)) {
      item(path, index + 1, "kotlinLiteralOrResource", match[0], owner);
    }
    if (/\b(?:if|when)\s*\(|(?:is )?WorkspacePage\.\w+.*->/.test(line)) {
      item(path, index + 1, "kotlinBranch", line, owner);
      if (path === workspace) gates.push({ line: index + 1, expression: compact(line) });
    }
  }
  return gates;
}

function inspectCopy(value, path, key = []) {
  if (typeof value === "string") item(path, null, "translation", value, key.join("."));
  else for (const [name, child] of Object.entries(value)) inspectCopy(child, path, [...key, name]);
}

function inspectMarkup(path) {
  const source = read(path);
  for (const match of source.matchAll(/<([\w-]+)\b([^>]*?)(\/?)>([^<>]*)/g)) {
    const [, tag, props, , content] = match;
    const line = source.slice(0, match.index).split("\n").length;
    item(path, line, "markup", tag, "<document>", props.trim() ? [compact(props)] : []);
    item(path, line, "markupText", content, tag);
  }
}

const scope = tracked.filter(path => path.startsWith(app) || path.startsWith(web + "/ui/") ||
  path.startsWith(web + "/features/") || path.startsWith(web + "/i18n/") ||
  path.startsWith("apps/web/public/") || path.startsWith(android));
let workspacePredicates = [];
const files = scope.map(path => {
  let classification = "asset-or-support";
  if (path.startsWith(app + "api/") || /\.well-known\/.*\/route\.ts$/.test(path)) classification = "endpoint";
  else if (/\.tsx?$/.test(path)) {
    inspectTypeScript(path);
    classification = path.endsWith(".tsx") ? "render-source" : "typescript-support";
  } else if (/\.kt$/.test(path)) {
    const gates = inspectNative(path);
    if (path === workspace) workspacePredicates = gates;
    classification = "kotlin-source";
  } else if (/\/i18n\/(?:ar|de)\.json$/.test(path)) {
    inspectCopy(JSON.parse(read(path)), path);
    classification = "translation-source";
  } else if (/\.(?:xml|html|svg)$/.test(path)) {
    inspectMarkup(path);
    classification = "markup-or-resource";
  } else if (/\.css$/.test(path)) classification = "stylesheet";
  return { path, phase: phases.get(path) ?? null, classification };
});

function elementsByModule(root) {
  const seen = new Set();
  function include(path) {
    if (seen.has(path)) return;
    seen.add(path);
    for (const imported of modules.get(path)?.imports ?? []) include(imported);
  }
  include(root);
  return [...seen].sort();
}

const routeRows = [...inventory.matchAll(/\| (WR-\d+) \| (P\d+) \| \x60([^\x60]+)\x60 \| ([^|]+) \| ([^|]+) \| \x60([^\x60]+)\x60 \| OPEN \|/g)];
const requiredByPath = new Map(routeRows.map(([, id, phase, , context, notes, path]) => [path, { id, phase, context: context.trim(), notes: notes.trim() }]));
const variants = [...inventory.matchAll(/^- \[ \] (\/(?:school\/home\/queues\/|account\/security\/|open\/)[^:]+): (.+)$/gm)];
const tabs = [...inventory.matchAll(/\| (TAB-\d+) \| (P\d+) \| \x60([^\x60]+)\x60 \| ([^|]+) \| ([^|]+) \|/g)];
const byId = (id) => scenes.find(scene => scene.id === id);

for (const path of scope.filter(path => path.startsWith(app) && /\/(?:page|layout|loading|not-found|error|route)\.tsx?$/.test(path) && !path.startsWith(app + "api/"))) {
  const route = path.slice(app.length).replace(/\/?(?:page|layout|loading|not-found|error|route)\.tsx?$/, "");
  const isPage = path.endsWith("/page.tsx");
  const meta = requiredByPath.get(path);
  const module = modules.get(path);
  scenes.push({
    id: meta?.id ?? "WEB-" + route + "-" + posix.basename(path, posix.extname(path)),
    phase: meta?.phase ?? phases.get(path) ?? null, platform: "web",
    route: "/" + route, path, kind: isPage ? "page" : posix.basename(path, posix.extname(path)),
    ...(meta ? { context: meta.context, requiredVariants: meta.notes } : {}),
    queries: [...(module?.queries ?? [])].sort(), routeGuards: module?.gates ?? [], moduleSources: elementsByModule(path),
  });
}

function expand(parent, route, id, details) {
  const original = byId(parent);
  if (!original) throw new Error("Missing scene " + parent);
  scenes.push({ ...original, ...details, id, route: "/[locale]" + route, parent });
}
for (const [, id, phase, route, context, requiredVariants] of tabs) expand("WR-012", route, id, {
  phase, context: context.trim(), requiredVariants: requiredVariants.trim(),
});
for (const [, route, requiredVariants] of variants) {
  const parent = route.startsWith("/school") ? "WR-015" : route.startsWith("/account") ? "WR-003" : "WR-010";
  expand(parent, route, "WEB" + route.replaceAll("/", "-").replace(/-\[id\]$/, ""), { requiredVariants });
}

scenes.push({ id: "WEB-offline-attendance", phase: "P06", platform: "web", kind: "offline",
  route: "/offline/attendance.html", path: "apps/web/public/offline/attendance.html",
  moduleSources: scope.filter(path => path.startsWith("apps/web/public/offline/")),
  requiredVariants: "Locked, unlocked, saved offline, queued, failed, conflict, reconnect" });
for (const [, id, declaration, name] of inventory.matchAll(/\| (AN-\d+) \| \x60(data (?:class|object) (\w+)[^\x60]*)\x60 \| OPEN \|/g)) {
  scenes.push({ id, platform: "android", kind: "workspacePage", name, declaration, path: workspace,
    sourcePredicates: workspacePredicates.filter(entry => new RegExp("\\bWorkspacePage\\." + name + "\\b").test(entry.expression)) });
}
for (const [id, relative, name] of [
  ["AN-root", "MainActivity.kt", "App entry and platform intents"],
  ["AN-sign-in", "identity/SignInScreen.kt", "Sign-in, MFA and errors"],
  ["AN-invitation", "identity/InvitationScreens.kt", "Invitation and activation"],
  ["AN-release-gate", "navigation/ReleaseVersionGate.kt", "Unsupported or outdated app"],
]) scenes.push({ id, platform: "android", kind: "entry", name, path: android + "java/de/madrasty/app/" + relative });

const sourceSha = /Baseline commit: `([a-f0-9]{40})`/.exec(inventory)?.[1];
if (!sourceSha) throw new Error("Inventory baseline SHA is missing");
const scopedFilesHash = createHash("sha256");
for (const path of scope) {
  const content = readFileSync(path);
  const normalized = /\.(?:ts|tsx|kt|css|html|md|xml|json|svg|js|mjs|webmanifest|csv)$/.test(path)
    ? content.toString("utf8").replaceAll("\r\n", "\n") : content;
  scopedFilesHash.update(path).update("\0").update(normalized).update("\0");
}
const sourceFingerprint = scopedFilesHash.digest("hex");
if (new Set(scenes.map(scene => scene.id)).size !== scenes.length) throw new Error("Duplicate scene ID");
if (new Set(elements.map(element => element.id)).size !== elements.length) throw new Error("Duplicate element ID");
for (const [, id, , , , , path] of routeRows) if (!byId(id)) throw new Error("Missing inventory route " + path);
for (const scene of scenes) if (!sources.has(scene.path)) throw new Error("Missing scene source " + scene.path);
function output(name, collections) {
  const payload = '{\n  "sourceSha": ' + JSON.stringify(sourceSha) + ',\n  "sourceFingerprint": ' + JSON.stringify(sourceFingerprint) + ',\n  "status": "DISCOVERED_PENDING_MANUAL_AND_RUNTIME_REVIEW",\n' +
    Object.entries(collections).map(([key, rows]) => '  "' + key + '": [\n' + rows.map(row => "    " + JSON.stringify(row)).join(",\n") + "\n  ]").join(",\n") + "\n}\n";
  const path = docs + "/" + name + ".json";
  if (process.argv.includes("--check")) {
    if (read(path).replaceAll("\r\n", "\n") !== payload) throw new Error(path + " needs regeneration");
  } else writeFileSync(path, payload);
}
output("SCENES", { scenes });
output("ELEMENTS", { files, elements });
console.log(scenes.length + " scene entries, " + files.length + " source files, " + elements.length + " element candidates");
