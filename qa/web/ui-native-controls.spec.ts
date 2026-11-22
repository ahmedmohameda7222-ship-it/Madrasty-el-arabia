import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("shared controls acknowledge touch immediately without removing keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/account/sign-in");
  const pressable = page.locator(".auth-form .plain-button").first();
  await expect(pressable).toBeVisible();
  const target = await pressable.boundingBox();
  expect(target).not.toBeNull();
  expect(target!.height).toBeGreaterThanOrEqual(44);
  expect(target!.width).toBeGreaterThanOrEqual(44);
  const touch = await pressable.evaluate((element) => getComputedStyle(element).touchAction);
  expect(touch).toBe("manipulation");
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  const pressed = await pressable.evaluate((element) => getComputedStyle(element).transform);
  expect(pressed, "pointer-down must have perceptible visual feedback").not.toBe("none");
  await page.mouse.up();
  mkdirSync("qa-artifacts/ui-after", { recursive: true });
  await page.screenshot({ path: "qa-artifacts/ui-after/UIX03-sign-in-ar-390-light.png", animations: "disabled" });

  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  const duration = await pressable.evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration.split(",").every((item) => item.trim() === "0s"), "reduced motion must cancel button movement").toBe(true);
  await page.keyboard.press("Tab");
  await pressable.focus();
  const focusStyle = await pressable.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).not.toBe("0px");
  await page.screenshot({ path: "qa-artifacts/ui-after/UIX03-sign-in-ar-390-dark-reduced-motion.png", animations: "disabled" });
});
