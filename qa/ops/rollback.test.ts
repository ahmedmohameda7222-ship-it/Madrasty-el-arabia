import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { schoolFixtures } from "../fixtures/school";

test("a local rollback and return to the current release preserve a guardian session and child scope", async () => {
  const school = schoolFixtures();
  const prior = "http://127.0.0.1:4310";
  let upstream = school.origin;
  const routes = ["/api/v1/health", "/api/v1/auth/session", "/api/v1/me/children"];
  const proxy = createServer(async (request, response) => {
    if (request.method !== "GET" || !routes.includes(request.url ?? "")) {
      response.writeHead(404).end();
      return;
    }
    try {
      const result = await fetch(`${upstream}${request.url}`, {
        headers: request.headers.authorization ? { authorization: request.headers.authorization } : {},
        redirect: "error", signal: AbortSignal.timeout(30_000),
      });
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.writeHead(502).end();
    }
  });
  try {
    await school.seed();
    const ids = await school.references();
    const token = await school.bearer("guardian-ar", "guardian");
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    const { port } = proxy.address() as AddressInfo;
    const read = async (path: string) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(40_000),
      });
      assert.equal(response.status, 200);
      return (await response.json()).data;
    };
    const verify = async () => {
      assert.equal((await read("/api/v1/health")).apiVersion, "v1");
      const session = await read("/api/v1/auth/session");
      assert.equal(session.activePersona, "guardian");
      assert.equal(session.accountId, ids["guardian-ar"]);
      const children = await read("/api/v1/me/children") as { id: string }[];
      assert.deepEqual(new Set(children.map(({ id }) => id)), new Set([ids.ahmed, ids.omar]));
      return session.sessionId as string;
    };
    const before = await verify();
    upstream = prior;
    assert.equal(await verify(), before);
    upstream = school.origin;
    assert.equal(await verify(), before);
  } finally {
    if (proxy.listening) await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    await school.close();
  }
});
