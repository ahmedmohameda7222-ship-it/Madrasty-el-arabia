import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const exists = (path: string) => existsSync(resolve(root, path));

test("only school administration manages staff onboarding", () => {
  assert.ok(exists("apps/web/src/app/[locale]/school/more/assignments/page.tsx"));
  assert.ok(exists("apps/web/src/app/[locale]/staff/invitations/page.tsx"));
  for (const path of [
    "apps/web/src/app/[locale]/apply/page.tsx",
    "apps/web/src/app/[locale]/apply/verify/page.tsx",
    "apps/web/src/app/[locale]/staff/applications/page.tsx",
    "apps/web/src/app/api/v1/teacher-applications/route.ts",
    "apps/web/src/app/api/v1/teacher-applications/me/route.ts",
    "apps/web/src/app/api/v1/teacher-applications/session/route.ts",
  ]) assert.equal(exists(path), false, `deprecated self-registration route: ${path}`);
  assert.doesNotMatch(read("apps/web/src/app/[locale]/account/sign-in/page.tsx"), /ApplyLink|TeacherApplications/);
  assert.doesNotMatch(read("apps/web/src/app/[locale]/school/[tab]/page.tsx"), /\/apply\?|staff\/applications/);
  assert.doesNotMatch(read("apps/android/app/src/main/java/de/madrasty/app/identity/SignInScreen.kt"), /ApplicantScreen|teacher_apply/);
  assert.doesNotMatch(read("apps/android/app/src/main/java/de/madrasty/app/identity/SchoolWorkspace.kt"), /WorkspacePage\.Applications|WorkspacePage\.Apply/);
});
