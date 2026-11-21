import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { fixtureEmail, requireFixtureTarget } from "../support/target";

export const principals = [
  "admin", "admin-two", "office", "finance", "supervisor", "teacher", "teacher-other",
  "substitute", "dual-role", "guardian-ar", "guardian-de", "guardian-other",
] as const;
export type Principal = typeof principals[number];
export type Persona = "admin" | "teacher" | "guardian";
type Token = { access_token: string };
type Reference = { principal: string; ref: string };

function binding(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing local QA binding ${name}.`);
  return value;
}

function totp(secret: string) {
  assert.match(secret, /^[A-Z2-7]+$/);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bitString = [...secret].map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, "0")).join("");
  const bytes = Buffer.from((bitString.match(/.{8}/g) ?? []).map((bits) => Number.parseInt(bits, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac("sha1", bytes).update(counter).digest();
  return String((hash.readUInt32BE(hash[hash.length - 1] & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export function schoolFixtures() {
  const target = requireFixtureTarget(process.env);
  const sql = postgres(target.dbUrl, { max: 1, prepare: false, connect_timeout: 5 });
  const run = binding("QA_RUN_ID");
  const collisionRun = binding("QA_COLLISION_RUN_ID");
  const anon = binding("QA_ANON_KEY");
  const service = binding("QA_SERVICE_KEY");
  const password = binding("QA_SEED_PASSWORD");

  async function auth<T>(path: string, method: "POST" | "GET" | "DELETE", body?: unknown, token = anon, admin = false) {
    assert.match(path, /^\/(?:admin\/users|user|token|factors)(?:[/?]|$)/);
    const response = await fetch(`${target.auth}/auth/v1${path}`, {
      method, headers: {
        apikey: admin ? service : anon, authorization: `Bearer ${token}`, "content-type": "application/json",
      }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error_code?: string; code?: string };
      throw new Error(`Local Auth ${method} ${path.split("/").slice(0, 3).join("/")} returned ${response.status} (${result.error_code ?? result.code ?? "unknown"})`);
    }
    return (response.status === 204 ? null : await response.json()) as T;
  }

  async function references(id = run) {
    fixtureEmail(id, "admin");
    const rows = await sql<Reference[]>`select * from qa.read_run(${id})`;
    return Object.fromEntries(rows.map(({ principal, ref }) => [principal, ref]));
  }

  async function seed(id = run) {
    if (Object.keys(await references(id)).length) return references(id);
    const subjects = [];
    for (const principal of principals) {
      const user = await auth<{ id: string }>("/admin/users", "POST", {
        email: fixtureEmail(id, principal), password, email_confirm: true,
      }, service, true);
      subjects.push({ principal, subject: user.id });
    }
    await sql.begin(async (tx) => {
      for (const { principal, subject } of subjects) {
        await tx`select qa.seed_actor(${id}, ${principal}, ${subject}::uuid)`;
      }
      await tx`select * from qa.seed_family(${id})`;
    });
    return references(id);
  }

  async function purgeUnused(id: string) {
    if (id !== collisionRun) throw new Error("Only the unused collision run can be removed through this helper.");
    fixtureEmail(id, "admin");
    const removed = await sql<{ provider_subject: string }[]>`select * from qa.purge_unused_run(${id})`;
    for (const { provider_subject } of removed) {
      await auth(`/admin/users/${provider_subject}`, "DELETE", undefined, service, true);
    }
    return removed.length;
  }

  async function bearer(principal: Principal, persona: Persona) {
    let tokens = await auth<Token>("/token?grant_type=password", "POST", { email: fixtureEmail(run, principal), password });
    if (persona === "admin") {
      // This enrolls only the synthetic local account; its secret stays in ignored local QA state.
      const setupKey = new URL(`../.env.totp-${run}-${principal}`, import.meta.url);
      type Factor = { id: string; secret: string };
      const saved = await readFile(setupKey, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      let factor: Factor;
      if (saved !== null) {
        factor = JSON.parse(saved) as Factor;
      } else {
        const registered = await auth<{ factors?: { id: string; status: string; friendly_name: string }[] }>(
          "/user", "GET", undefined, tokens.access_token);
        const unfinished = registered.factors?.find((entry) => entry.status === "unverified" && entry.friendly_name === "Local QA");
        if (unfinished) await auth(`/factors/${unfinished.id}`, "DELETE", undefined, tokens.access_token);
        const entry = await auth<{ id: string; totp: { secret: string } }>("/factors", "POST", {
          factor_type: "totp", friendly_name: "Local QA", issuer: "Madrasty Local QA",
        }, tokens.access_token);
        factor = { id: entry.id, secret: entry.totp.secret };
        await writeFile(setupKey, JSON.stringify(factor), { flag: "wx", mode: 0o600 });
      }
      const challenge = await auth<{ id: string }>(`/factors/${factor.id}/challenge`, "POST", {}, tokens.access_token);
      tokens = await auth<Token>(`/factors/${factor.id}/verify`, "POST", {
        challenge_id: challenge.id, code: totp(factor.secret),
      }, tokens.access_token);
    }
    const bound = await fetch(`${target.origin}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${tokens.access_token}` }, redirect: "error", signal: AbortSignal.timeout(45_000),
    });
    if (!bound.ok) throw new Error(`Local app rejected fixture session ${principal} (${bound.status})`);
    return tokens.access_token;
  }

  async function localMfa(principal: Principal) {
    const setupKey = new URL(`../.env.totp-${run}-${principal}`, import.meta.url);
    const { id, secret } = JSON.parse(await readFile(setupKey, "utf8")) as { id: string; secret: string };
    return { factorId: id, code: () => totp(secret) };
  }

  async function expireSession(accessToken: string) {
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as { session_id: string };
    const [expired] = await sql<{ expired: boolean }[]>`select qa.expire_session(${run}, ${claims.session_id}::uuid) as expired`;
    assert.equal(expired.expired, true);
  }

  return { origin: target.origin, run, collisionRun, references, seed, purgeUnused, bearer, localMfa, expireSession, password,
    close: () => sql.end() };
}

export type FixtureSchool = ReturnType<typeof schoolFixtures>;
