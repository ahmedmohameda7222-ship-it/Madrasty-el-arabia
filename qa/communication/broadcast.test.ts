import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { broadcastEntry, broadcastPreview, broadcastReceipt } from "../../packages/contracts/src/comms/broadcasts";
import { setUpCalendar } from "../fixtures/calendar";
import { schoolFixtures } from "../fixtures/school";
import { fixtureApi } from "../support/api";

test("a class announcement uses Arabic and German copy and stays inside the targeted class", async () => {
  const school = schoolFixtures();
  try {
    const admin = await school.bearer("admin", "admin");
    const { apple } = await setUpCalendar(school, admin);
    const [arabic, german, outsider] = await Promise.all([
      school.bearer("guardian-ar", "guardian"), school.bearer("guardian-de", "guardian"), school.bearer("guardian-other", "guardian"),
    ]);
    const copy = {
      ar: { title: "إعلان الفصل", body: "محتوى تجريبي للفصل" },
      de: { title: "Mitteilung für Klasse A", body: "Synthetische Nachricht für diese Klasse" },
    };
    const publish = { method: "POST", token: admin, persona: "admin", status: 201 } as const;
    const preview = broadcastPreview.parse((await fixtureApi(school, "/broadcasts/preview", {
      ...publish, body: { audience: { kind: "class_guardians", classId: apple.id }, copy },
    })).payload.data);
    assert.equal(preview.counts.ar, 1);
    assert.ok(preview.counts.de >= 1);
    const operation = { ...publish, key: randomUUID(), body: { previewId: preview.previewId } };
    const receipt = broadcastReceipt.parse((await fixtureApi(school, "/broadcasts", operation)).payload.data);
    assert.equal(receipt.recipientCount, preview.counts.ar + preview.counts.de);
    assert.deepEqual((await fixtureApi(school, "/broadcasts", operation)).payload.data, receipt);
    const path = `/broadcasts/inbox/${receipt.publicationId}`;
    const first = broadcastEntry.parse((await fixtureApi(school, `${path}?locale=ar`, { token: arabic })).payload.data);
    const second = broadcastEntry.parse((await fixtureApi(school, `${path}?locale=de`, { token: german })).payload.data);
    assert.equal(first.title, copy.ar.title);
    assert.equal(second.title, copy.de.title);
    await fixtureApi(school, path, { token: outsider, status: 404 });
    for(const [token,locale,expected] of [[arabic,"ar",copy.ar.title],[german,"de",copy.de.title],[admin,"de",copy.de.title]] as const){
      const feed=(await fixtureApi(school,`/comms/feed?locale=${locale}&filter=announcement`,{token})).payload.data;
      assert.ok(feed.some((item:{id:string;title:string})=>item.id===receipt.publicationId&&item.title===expected));
    }
    const outsideFeed=(await fixtureApi(school,"/comms/feed?locale=de",{token:outsider})).payload.data;
    assert.ok(!outsideFeed.some((item:{id:string})=>item.id===receipt.publicationId));
  } finally {
    await school.close();
  }
});
