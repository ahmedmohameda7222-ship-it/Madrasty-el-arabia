import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { requireFixtureTarget } from "../support/target";

function service(origin: string, key: string | undefined) {
  if (!key) throw new Error("Missing credentials for the designated local QA Storage instance.");
  return (path: string, options: RequestInit = {}) => {
    assert.match(path, /^\/(?:object|bucket)\//);
    const url = new URL(`/storage/v1${path}`, origin);
    return fetch(url, {
      ...options, headers: { apikey: key, authorization: `Bearer ${key}`, ...options.headers },
      redirect: "error", signal: AbortSignal.timeout(15_000),
    });
  };
}

function sampleVoice() {
  const wav = Buffer.alloc(44 + 3200);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let offset = 44; offset < wav.length; offset += 2) wav.writeInt16LE((offset % 19) * 200, offset);
  return wav;
}

test("a private synthetic voice object restores byte-for-byte into a separate Supabase instance", async () => {
  const source = requireFixtureTarget(process.env);
  const target = "http://127.0.0.1:56421";
  assert.equal(process.env.QA_RESTORE_PROJECT, "madrasty_qa_restore");
  assert.equal(process.env.QA_RESTORE_ORIGIN, target);
  const sourceApi = service(source.auth, process.env.QA_SERVICE_KEY);
  const targetApi = service(target, process.env.QA_RESTORE_SERVICE_KEY);
  const sourcePublic = service(source.auth, process.env.QA_ANON_KEY);
  const targetPublic = service(target, process.env.QA_RESTORE_ANON_KEY);
  const name = `qa-recovery-${randomUUID()}.wav`;
  const object = `madrasty-chat-media/${name}`;
  const directory = await mkdtemp(join(tmpdir(), "madrasty-media-backup-"));
  const archive = join(directory, name);
  const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const upload = async (api: ReturnType<typeof service>, bytes: Buffer) => {
    const response = await api(`/object/${object}`, {
      method: "POST", headers: { "content-type": "audio/wav" }, body: new Uint8Array(bytes),
    });
    assert.equal(response.status, 200);
  };
  const download = async (api: ReturnType<typeof service>) => {
    const response = await api(`/object/authenticated/${object}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/wav");
    return Buffer.from(await response.arrayBuffer());
  };
  const list = async (api: ReturnType<typeof service>) => {
    const response = await api("/object/list/madrasty-chat-media", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix: "", search: name, limit: 1 }),
    });
    assert.equal(response.status, 200);
    const objects = await response.json() as { name: string; metadata: { size: number; mimetype: string } }[];
    return objects.find((entry) => entry.name === name);
  };
  try {
    const started = performance.now();
    const original = sampleVoice();
    const protectedBucket = await targetApi("/bucket/madrasty-chat-media");
    assert.equal(protectedBucket.status, 200);
    assert.equal((await protectedBucket.json()).public, false);
    await upload(sourceApi, original);
    assert.equal(await list(targetApi), undefined);
    const sourceBytes = await download(sourceApi);
    assert.equal(digest(sourceBytes), digest(original));
    await writeFile(archive, sourceBytes, { flag: "wx", mode: 0o600 });
    await upload(targetApi, await readFile(archive));
    const recovered = await download(targetApi);
    assert.equal(digest(recovered), digest(original));
    assert.deepEqual((await list(targetApi))?.metadata.size, (await list(sourceApi))?.metadata.size);
    const unauthenticated = await Promise.all([sourcePublic, targetPublic].map((api) => api(`/object/public/${object}`)));
    assert.ok(unauthenticated.every((response) => response.status >= 400 && response.status < 500));
    console.info(`Restored ${recovered.length} synthetic private bytes with matching SHA-256 in ${((performance.now() - started) / 1000).toFixed(2)} s.`);
  } finally {
    await Promise.allSettled([sourceApi, targetApi].map((api) => api(`/object/${object}`, { method: "DELETE" })));
    await rm(archive, { force: true });
    await rmdir(directory);
  }
});
