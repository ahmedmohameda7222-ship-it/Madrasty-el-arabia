import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { importPreviewSchema, importReceiptSchema, importVersionSchema } from "../../packages/contracts/src/school/imports";
import { schoolFixtures } from "../fixtures/school";
import { familyWorkbook } from "../fixtures/workbook";
import { fixtureApi } from "../support/api";

test("family CSV preview and commit recognize siblings and duplicate rows without issuing any invitation", async () => {
  const school = schoolFixtures();
  try {
    const office = await school.bearer("office", "admin");
    const identifier = `qa-${randomUUID()}`;
    const email = `${identifier}@madrasty.invalid`;
    const row = (childCode: string, name: string) => `${identifier}-${childCode},${name},${identifier},QA Guardian,${email},de`;
    const csv = ["Child code,Child name,Guardian code,Guardian name,Email,Locale",
      row("child1", "QA Shared Name"), row("child1", "QA Shared Name"), row("child2", "QA Shared Name")].join("\r\n");
    const body = { fileName: "qa-family.csv", mime: "text/csv", bytesBase64: Buffer.from(csv, "utf8").toString("base64") };
    const write = (key: string, method: "POST" | "PUT" = "POST") =>
      ({ key: `${identifier}.${key}`, method, token: office, persona: "admin" }) as const;
    const ingest = async (attempt: string) => {
      const upload = importVersionSchema.parse((await fixtureApi(school, "/school/family-imports", {
        ...write(`${attempt}.upload`), body, status: 201,
      })).payload.data);
      const path = `/school/family-imports/${upload.id}`;
      const mapped = await fixtureApi(school, `${path}/mapping`, { ...write(`${attempt}.mapping`, "PUT"), body: {
        revision: upload.revision, delimiter: ",",
        columnMap: { childKey: 1, childName: 2, guardianKey: 3, guardianName: 4, email: 5, communicationLocale: 6 },
      } });
      const preview = importPreviewSchema.parse((await fixtureApi(school, `${path}/preview`, { token: office })).payload.data);
      assert.equal(preview.revision, mapped.payload.data.revision);
      const accepted = { ...write(`${attempt}.commit`), body: { reviewedRevision: preview.revision } };
      const commit = importReceiptSchema.parse((await fixtureApi(school, `${path}/commit`, accepted)).payload.data);
      const replay = importReceiptSchema.parse((await fixtureApi(school, `${path}/commit`, accepted)).payload.data);
      assert.deepEqual(commit, replay);
      return { preview, commit };
    };
    const first = await ingest("first");
    assert.equal(first.preview.counts.new, 2);
    assert.equal(first.preview.counts.duplicate, 1);
    assert.equal(first.commit.linksCreated, 2);
    assert.equal(first.commit.eligibleGuardians, 1);
    const second = await ingest("same-input");
    assert.equal(second.preview.counts.existing, 2);
    assert.equal(second.commit.linksCreated, 0);
  } finally {
    await school.close();
  }
});

test("XLSX preview keeps leading zeroes and flags formulas or numeric identifiers", async () => {
  const school = schoolFixtures();
  try {
    const office = await school.bearer("office", "admin");
    const key = randomUUID();
    const upload = importVersionSchema.parse((await fixtureApi(school, "/school/family-imports", {
      method: "POST", token: office, persona: "admin", key, status: 201, body: {
        fileName: "qa-family.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytesBase64: familyWorkbook().toString("base64"),
      },
    })).payload.data);
    const preview = importPreviewSchema.parse((await fixtureApi(school, `/school/family-imports/${upload.id}/mapping`, {
      method: "PUT", token: office, persona: "admin", key: `${key}.map`, body: {
        revision: upload.revision, worksheet: "Familien",
        columnMap: { childKey: 1, childName: 2, guardianKey: 3, guardianName: 4, email: 5, communicationLocale: 6 },
      },
    })).payload.data);
    assert.equal(preview.rows[0].display?.childKey, "00104");
    assert.equal(preview.rows[1].reason, "identifier_needs_text");
    assert.equal(preview.rows[2].reason, "formula");
  } finally {
    await school.close();
  }
});
