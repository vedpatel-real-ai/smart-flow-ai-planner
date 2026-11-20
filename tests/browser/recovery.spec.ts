import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const storeKey = "smart-taskflow-demo-store";
for (const raw of ["{broken", '{"version":3}']) {
  test(`preserves and exports invalid store ${raw} through provider recovery`, async ({page}) => {
    await page.goto("/");
    await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [storeKey, raw]);
    await page.getByRole("button", {name:"Explore Demo"}).click();
    await expect(page.getByRole("alert")).toContainText("preserved");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", {name:"Export saved data"}).click();
    const file = await downloaded;
    expect(await readFile((await file.path())!, "utf8")).toBe(raw);
    await page.evaluate(key => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v) {
        if (k === key) throw new Error("Storage full");
        set.call(this, k, v);
      };
    }, storeKey);
    page.once("dialog", d => d.accept());
    await page.getByRole("button", {name:"Reset demo"}).click();
    await expect(page.getByText("Storage full", {exact:true})).toBeVisible();
    expect(await page.evaluate(k => localStorage.getItem(k), storeKey)).toBe(raw);
    await page.reload();
    page.once("dialog", d => d.accept());
    await page.getByRole("button", {name:"Reset demo"}).click();
    await expect(page.getByText("20 completed of 48 total")).toBeVisible();
  });
}

test("missing Web Locks explains recovery and leaves storage intact", async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "locks", {value: undefined}));
  await page.goto("/");
  await page.getByRole("button", {name:"Explore Demo"}).click();
  await expect(page.getByRole("alert")).toContainText("requires Web Locks");
  expect(await page.evaluate(k => localStorage.getItem(k), storeKey)).toBeNull();
});

test("two tabs commit concurrent edits to the same workspace", async ({page, context}) => {
  await page.goto("/");
  await page.getByRole("button", {name:"Explore Demo"}).click();
  await expect(page.getByText("20 completed of 48 total")).toBeVisible();
  const second = await context.newPage();
  await second.goto("/");
  const tabs = [page, second];
  await Promise.all(tabs.map(async (tab, i) => {
    await tab.getByRole("tab", {name:/Task Manager/}).click();
    await tab.getByRole("button", {name:"Add Task"}).click();
    await tab.getByLabel("Title", {exact:true}).fill("Concurrent task " + i);
  }));
  await Promise.all(tabs.map(tab => tab.getByRole("button", {name:"Create Task", exact:true}).click()));
  for (const tab of tabs) {
    await expect(tab.getByRole("button", {name:/^Edit Concurrent task/})).toHaveCount(2);
  }
});

test("a render failure exposes a reload and preserves the saved demo", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name:"Explore Demo"}).click();
  await expect(page.getByText("20 completed of 48 total")).toBeVisible();
  const before = await page.evaluate(k => localStorage.getItem(k), storeKey);
  await page.evaluate(() => {
    Date.prototype.toLocaleString = () => { throw new Error("Injected formatting failure"); };
  });
  await page.getByRole("tab", {name:"Task Manager"}).click();
  await expect(page.getByRole("alert")).toHaveText("Something went wrong");
  await expect(page.getByRole("button", {name:"Export saved data"})).toBeVisible();
  await page.getByRole("button", {name:"Reload page"}).click();
  await expect(page.getByText("20 completed of 48 total")).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k), storeKey)).toBe(before);
});
