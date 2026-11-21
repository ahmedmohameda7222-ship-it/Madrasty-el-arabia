import { expect, test } from "@playwright/test";
import { schoolFixtures, totp } from "../fixtures/school";
import { fixtureEmail, localOrigin } from "../support/target";

test("the unhydrated sign-in form keeps credentials out of URL submissions", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${localOrigin}/de/account/sign-in`);
    await expect(page.locator("form.auth-form")).toHaveAttribute("method", "post");
    await expect(page.getByRole("button", { name: "Anmelden", exact: true })).toBeDisabled();
  } finally {
    await context.close();
  }
});

test("a new administrator can render the provider QR and verify the first TOTP on a laptop", async ({ page }) => {
  const school = schoolFixtures();
  try {
    await school.seed();
    await page.route("**/*", (route) => new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort());
    await page.goto("/de/account/sign-in");
    await page.locator('input[name="email"]').fill(fixtureEmail(school.run, "admin-two"));
    await page.locator('input[name="password"]').fill(school.password);
    await page.locator("form button[type=submit],form button:not([type])").first().click();
    await expect(page).toHaveURL(/\/de\/account\/security$/, { timeout: 15_000 });

    const [enrolled] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/mfa/enroll"),
      page.getByRole("button", { name: "Authenticator einrichten" }).click(),
    ]);
    expect(enrolled.status()).toBe(201);
    const image = page.getByRole("img", { name: "QR-Code für die Zwei-Faktor-Verifizierung" });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    const { data } = await enrolled.json() as { data: { totp: { secret: string } } };
    await page.locator('input[name="code"]').fill(totp(data.totp.secret));
    await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
    await expect(page).toHaveURL(/\/de\/school\/home$/);
    await expect(page.getByRole("main")).toBeVisible();
  } finally {
    await school.close();
  }
});
