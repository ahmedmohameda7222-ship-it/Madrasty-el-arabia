import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { candidate, publicRead } from "../support/target";

test("the school download matches the published bytes and trusted signing certificate", async () => {
  const download = await publicRead("/download/android");
  assert.equal(download.status, 302);
  const artifact = new URL(download.headers.get("location") ?? "invalid:");
  assert.equal(artifact.origin, `https://${candidate.projectRef}.supabase.co`);
  assert.equal(artifact.search, "");
  const response = await fetch(artifact, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/vnd\.android\.package-archive(?:;|$)/i);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, candidate.apkBytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), candidate.apkSha256);
  const destination = await mkdtemp(join(tmpdir(), "madrasty-qa-apk-"));
  const apk = join(destination, "candidate.apk");
  try {
    await writeFile(apk, bytes, { flag: "wx" });
    const output = execFileSync("pwsh", ["-NoProfile", "-File", "qa/android/toolchain.ps1", "-VerifyApk", apk],
      { encoding: "utf8", timeout: 50_000 });
    assert.match(output, new RegExp(`certificate SHA-256 digest: ${candidate.apkSignerSha256}`, "i"));
  } finally {
    await unlink(apk);
    await rmdir(destination);
  }
});

test("Android App Links associate the official domain with the signed school package", async () => {
  const response = await publicRead("/.well-known/assetlinks.json");
  assert.equal(response.status, 200);
  const fingerprint = candidate.apkSignerSha256.match(/../g)?.join(":").toUpperCase();
  const statements = await response.json() as {
    relation: string[]; target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
  }[];
  assert.ok(statements.some(({ relation, target }) => relation.includes("delegate_permission/common.handle_all_urls") &&
    target.namespace === "android_app" && target.package_name === "de.madrasty.app" &&
    target.sha256_cert_fingerprints.includes(fingerprint ?? "")));
});
