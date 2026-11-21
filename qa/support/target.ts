import { randomUUID } from "node:crypto";

export const schoolOrigin = "https://madrastyelarabia.vercel.app";
export const localOrigin = "http://127.0.0.1:4300";
export const localAuth = "http://127.0.0.1:55421";
export const localProject = "madrasty_final_qa";
const schoolProject = "ycsyghyigkadtugluugm";

export const candidate = {
  webSha: "9e76eb93d991b63c1275e866e902e2dd599fd526",
  deployment: "dpl_CToF1pHubX6tBvSeWN7UqqRaQbPT",
  projectRef: schoolProject,
  openApiSha256: "cadfa05acf2604019d3c7acd05c35e4b2252cde92c197a3abf8dbc9070e77316",
  apkBytes: 11_758_251,
  apkSha256: "d5ca02907bfaaa4604252603bbc8fd2a36b82d5eccf014ea11765051b4f8c99d",
  apkSignerSha256: "8cdd2ca77ae0051388be756512fdda8b50bfd2023b954d078f4079e8c2332fd3",
} as const;

export function requireFixtureTarget(bindings: Readonly<Record<string, string | undefined>>) {
  if (bindings.QA_PROJECT !== localProject || bindings.QA_ORIGIN !== localOrigin || bindings.QA_AUTH !== localAuth) {
    throw new Error("Fixtures require the designated local application, Auth server and project.");
  }
  const db = new URL(bindings.QA_FIXTURE_DATABASE_URL ?? "invalid:");
  if (db.protocol !== "postgresql:" || db.hostname !== "127.0.0.1" || db.port !== "55422" ||
    db.username !== "madrasty_qa_fixture" || db.pathname !== "/postgres" || db.search || db.hash || !db.password) {
    throw new Error("Fixtures require the restricted local fixture login.");
  }
  return { origin: localOrigin, auth: localAuth, dbUrl: db.href };
}

export function newRunId() {
  return `qa-${randomUUID().replaceAll("-", "")}`;
}

export function fixtureEmail(runId: string, principal: string) {
  if (!/^qa-[a-f0-9]{32}$/.test(runId) || !/^[a-z][a-z0-9-]{0,23}$/.test(principal)) {
    throw new Error("Fixture mailbox requires a valid run and synthetic principal.");
  }
  return `${runId}.${principal}@madrasty.invalid`;
}

export function publicRead(path: string) {
  const target = new URL(path, schoolOrigin);
  if (target.origin !== schoolOrigin) throw new Error("Public QA is pinned to the school origin.");
  return fetch(target, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
}
