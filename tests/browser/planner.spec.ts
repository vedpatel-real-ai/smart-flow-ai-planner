import { expect, type Page, test } from "@playwright/test";

async function enterDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Demo" }).click();
  await page.getByRole("tab", { name: /Task Manager|^Tasks$/ }).click();
}

async function create(page: Page, title: string, start?: string, duration?: number) {
  await page.getByRole("button", { name: "Add Task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  if (start) await dialog.getByLabel("Planned start").fill(start);
  if (duration) await dialog.getByLabel("Duration (minutes)", { exact: true }).fill(String(duration));
  await dialog.getByRole("button", { name: "Create Task" }).click();
  await expect(dialog).toBeHidden();
}

async function rows(page: Page, prefix: string) {
  return page.evaluate((title) => {
    const stored = JSON.parse(localStorage.getItem("smart-taskflow-demo-store")!);
    return (stored.tasks as {
      title: string;
      id: string;
      scheduled_start: string | null;
      due_date: string | null;
      series_id: string | null;
      occurrence_index: number | null;
    }[])
      .filter((task) => task.title.startsWith(title)).sort((a, b) =>
        (a.occurrence_index ?? 0) - (b.occurrence_index ?? 0)
      );
  }, prefix);
}

test("monthly series clamps dates and supports editing and deleting one or all occurrences", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("button", { name: "Add Task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Monthly review");
  await dialog.getByLabel("Due date").fill("2028-01-31T10:00");
  await dialog.getByLabel("Recurring task").check();
  await dialog.getByLabel("Repeat", { exact: true }).selectOption("Monthly");
  await dialog.getByLabel("Occurrences").fill("3");
  await dialog.getByRole("button", { name: "Create Task" }).click();
  await expect(dialog).toBeHidden();
  const records = await rows(page, "Monthly review");
  expect(records.map((row) => row.due_date)).toEqual([
    "2028-01-31T04:30:00.000Z",
    "2028-02-29T04:30:00.000Z",
    "2028-03-31T04:30:00.000Z",
  ]);
  expect(new Set(records.map((row) => row.series_id)).size).toBe(1);
  expect(records[0].series_id).toBeTruthy();
  await page.getByRole("button", { name: "Edit Monthly review", exact: true }).first().click();
  await dialog.getByLabel("Title", { exact: true }).fill("Monthly review exception");
  await dialog.getByRole("button", { name: "Update Task" }).click();
  await expect(page.getByRole("button", { name: "Edit Monthly review exception" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Monthly review exception" }).click();
  await dialog.getByLabel("Apply changes to").selectOption("series");
  await dialog.getByLabel("Title", { exact: true }).fill("Monthly planning");
  await dialog.getByRole("button", { name: "Update Task" }).click();
  await expect(page.getByRole("button", { name: "Edit Monthly planning", exact: true })).toHaveCount(3);
  expect((await rows(page, "Monthly planning")).map((row) => row.due_date)).toEqual(
    records.map((row) => row.due_date),
  );
  await page.getByRole("button", { name: "Delete Monthly planning" }).first().click();
  await dialog.getByRole("button", { name: "Delete occurrence" }).click();
  await expect(page.getByRole("button", { name: "Delete Monthly planning" })).toHaveCount(2);
  await page.getByRole("button", { name: "Delete Monthly planning" }).first().click();
  await dialog.getByRole("button", { name: "Delete entire series" }).click();
  // A modal temporarily hides the background cards from the accessibility tree.
  await expect(dialog).toBeHidden();
  await expect.poll(() => rows(page, "Monthly planning")).toEqual([]);
  await page.reload();
  await page.getByRole("tab", { name: /Task Manager|^Tasks$/ }).click();
  await expect(page.getByRole("button", { name: "Add Task" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Monthly planning" })).toHaveCount(0);
});

test("keyboard scheduling uses selected date, rejects overlapping durations and retains deadlines", async ({ page }) => {
  await enterDemo(page);
  await create(page, "Planner overnight", "2034-05-02T23:30", 120);
  await create(page, "Planner backlog");
  await page.getByRole("tab", { name: /Planner/ }).click();
  await page.getByLabel("Planner date").fill("2034-05-03");
  await expect(page.getByRole("button", { name: "Reschedule Planner overnight" })).toBeVisible();
  const schedule = page.getByRole("button", { name: "Schedule Planner backlog", exact: true });
  await schedule.focus();
  await schedule.press("Enter");
  const dialog = page.getByRole("dialog");
  const input = dialog.getByLabel("Planned start");
  await expect(input).toHaveValue("2034-05-03T09:00");
  await input.fill("2034-05-03T00:30");
  await dialog.getByRole("button", { name: "Save placement" }).press("Enter");
  await expect(
    page.getByText("This time overlaps “Planner overnight”. Choose another start.", { exact: true }),
  ).toBeVisible();
  expect((await rows(page, "Planner backlog"))[0].scheduled_start).toBeNull();
  await input.fill("2034-05-03T01:30");
  await dialog.getByRole("button", { name: "Save placement" }).press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Reschedule Planner backlog" })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Planner/ }).click();
  await page.getByLabel("Planner date").fill("2034-05-03");
  expect((await rows(page, "Planner backlog"))[0]).toMatchObject({
    scheduled_start: "2034-05-02T20:00:00.000Z",
    due_date: null,
  });
  await expect(page.getByRole("button", { name: "Reschedule Planner backlog" })).toBeVisible();
  await expect(schedule).toHaveCount(0);
  const saved = await rows(page, "Planner ");
  await page.getByRole("button", { name: "Reschedule Planner backlog" }).click();
  await input.fill("2034-05-03T01:00");
  await dialog.getByRole("button", { name: "Save placement" }).click();
  await expect(page.getByText("This time overlaps “Planner overnight”. Choose another start.", {exact:true})).toBeVisible();
  expect(await rows(page, "Planner ")).toEqual(saved);
  await input.fill("2034-05-03T02:30");
  await dialog.getByRole("button", {name:"Save placement"}).click();
  await expect(dialog).toBeHidden();
  expect((await rows(page, "Planner backlog"))[0].scheduled_start).toBe("2034-05-02T21:00:00.000Z");
});

test("a mouse drop places a task in the chosen working hour", async ({ page }) => {
  await enterDemo(page);
  await create(page, "Drag placement");
  await page.getByRole("tab", { name: /Planner/ }).click();
  await page.getByLabel("Planner date").fill("2034-05-03");
  const handle = page.getByRole("button", { name: "Drag Drag placement" });
  const target = page.getByRole("listitem").filter({ hasText: /09:00|9:00/ }).filter({
    hasText: "Available",
  }).first();
  await target.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Reschedule Drag placement" })).toBeVisible();
  expect((await rows(page, "Drag placement"))[0].scheduled_start).toBe("2034-05-03T03:30:00.000Z");
});

test("suggestions honor the saved preference and their planner action navigates", async ({ page }) => {
  await enterDemo(page);
  await create(page, "Needs a plan");
  await page.getByRole("tab", { name: /Overview|Home/ }).click();
  const toggle = page.getByRole("switch", { name: "Show suggestions" });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Open daily planner" })).toHaveCount(0);
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await page.getByRole("button", { name: "Open daily planner" }).click();
  await expect(page.getByRole("button", { name: "Schedule Needs a plan" })).toBeVisible();
});
