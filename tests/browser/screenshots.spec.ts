import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("capture real application screens from a fresh demo profile", async ({ page }, testInfo) => {
  const directory = process.env.CAPTURE_README_IMAGES === "1"
    ? resolve("docs/images")
    : testInfo.outputPath("screens");
  await mkdir(directory, { recursive: true });
  const capture = async (name: string) => {
    const path = join(directory, name + ".png");
    await page.screenshot({ path, animations: "disabled" });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Explore Demo" })).toBeVisible();
  await capture("entry");
  await page.getByRole("button", { name: "Explore Demo" }).click();
  await expect(page.getByText("Today's priority tasks", { exact: true })).toBeVisible();
  await capture("overview");
  for (
    const [tab, marker, filename] of [
      ["Task Manager", "Add Task", "tasks"],
      ["Daily Planner", "Unscheduled tasks", "planner"],
      ["Analytics", "Weekly completions", "analytics"],
    ]
  ) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    await capture(filename);
  }
});
