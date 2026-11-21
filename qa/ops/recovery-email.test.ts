import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { schoolFixtures } from "../fixtures/school";
import { fixtureEmail, requireFixtureTarget } from "../support/target";

const mailpit = "http://127.0.0.1:55424";

test("recovery mail reaches the local inbox, allows one password change and cannot be reused", async () => {
  const target = requireFixtureTarget(process.env);
  const school = schoolFixtures();
  const email = fixtureEmail(school.run, "guardian-de");
  const previousPassword = school.password;
  const newPassword = randomBytes(24).toString("base64url");
  const send = (path: string, body: unknown) => fetch(`${target.origin}/api/v1/auth/${path}`, {
    method: "POST",
    headers: { origin: target.origin, "content-type": "application/json" },
    body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(25_000),
  });
  try {
    await school.seed();
    const requested = await send("recovery/request", { email, locale: "de" });
    assert.equal(requested.status, 202);
    type Message = { ID: string; Subject: string; To: { Address: string }[] };
    let receipt: Message | undefined;
    for (let attempt = 0; attempt < 15 && !receipt; attempt++) {
      const inbox = await fetch(`${mailpit}/api/v1/messages`, { redirect: "error", signal: AbortSignal.timeout(4_000) });
      assert.equal(inbox.status, 200);
      const messages = (await inbox.json() as { messages: Message[] }).messages ?? [];
      receipt = messages.find((message) => message.To.some(({ Address }) => Address === email) &&
        message.Subject.includes("Passwort zurücksetzen"));
      if (!receipt) await setTimeout(300);
    }
    assert.ok(receipt, "The school recovery message did not reach the isolated mailbox.");
    const message = await fetch(`${mailpit}/api/v1/message/${encodeURIComponent(receipt.ID)}`, {
      redirect: "error", signal: AbortSignal.timeout(4_000),
    });
    assert.equal(message.status, 200);
    const { HTML } = await message.json() as { HTML: string };
    const href = HTML.match(/href="([^"]+)"/)?.[1];
    assert.ok(href, "The school template omitted its recovery destination.");
    const link = new URL(href);
    assert.equal(link.origin, target.origin);
    assert.equal(link.pathname, "/de/account/security/recover");
    const challenge = link.searchParams.get("token_hash");
    assert.ok(challenge, "The school recovery URL omitted the one-time token.");
    const complete = { challenge, newPassword };
    assert.equal((await send("recovery/complete", complete)).status, 204);
    assert.equal((await send("recovery/complete", complete)).status, 401);
    assert.equal((await send("sign-in", { email, password: previousPassword })).status, 401);
    assert.equal((await send("sign-in", { email, password: newPassword })).status, 200);
  } finally {
    await school.close();
  }
});
