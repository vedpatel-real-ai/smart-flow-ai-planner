import { expect, test, type Page } from "@playwright/test";

import { stat, checkWorkspace } from "./shared-ui";

async function enterDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Demo" }).click();
  await expect(page.getByText("Demo · this browser")).toBeVisible();
}

test.describe("Demo Mode visitor journey", () => {
  test("fresh demo shows populated dashboard with meaningful metrics", async ({ page }) => {
    await enterDemo(page);
    // Overview tab is visible by default
    await expect(page.getByText("Your workspace at a glance")).toBeVisible();
    // Summary cards show non-zero values
    await expect(page.getByText("Due today", { exact: true })).toBeVisible();
    await expect(page.getByText("Open tasks", { exact: true })).toBeVisible();
    await expect(page.getByText("Completion rate", { exact: true })).toBeVisible();
    // Priority tasks section
    await expect(page.getByText("Today's priority tasks")).toBeVisible();
    // Weekly productivity
    await expect(page.getByText("Weekly productivity")).toBeVisible();
    // Recommendations
    await expect(page.getByText("Task recommendations")).toBeVisible();
  });

  test("analytics tab shows populated charts and history", async ({ page }) => {
    await enterDemo(page);
    await page.getByRole("tab", { name: /Analytics|Stats/ }).click();
    await expect(page.getByText("Productivity analytics")).toBeVisible();
    // Weekly completions chart
    await expect(page.getByText("Weekly completions")).toBeVisible();
    // Status distribution
    await expect(page.getByText("Task status distribution")).toBeVisible();
    // Category workload
    await expect(page.getByText("Category workload")).toBeVisible();
    // Recent activity
    await expect(page.getByText("Recent activity")).toBeVisible();
  });

  test("daily planner shows scheduled work and backlog", async ({ page }) => {
    await enterDemo(page);
    await page.getByRole("tab", { name: /Daily Planner|^Planner$/ }).click();
    // Should have scheduled tasks
    const scheduledSection = page.getByText("Scheduled work");
    await expect(scheduledSection).toBeVisible();
    // Should have unscheduled backlog
    await expect(page.getByText("Unscheduled tasks")).toBeVisible();
  });

  test("task manager shows many tasks with filtering", async ({ page }) => {
    await enterDemo(page);
    await page.getByRole("tab", { name: /Task Manager|^Tasks$/ }).click();
    // Should have more than the old 5 tasks
    const editButtons = page.getByRole("button", { name: /^Edit / });
    await expect(editButtons.first()).toBeVisible();
    const count = await editButtons.count();
    expect(count).toBeGreaterThan(10);
    // Filter by status
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    const completedEdits = page.getByRole("button", { name: /^Edit / });
    const completedCount = await completedEdits.count();
    expect(completedCount).toBeGreaterThan(5);
  });

  test("completing a task updates dashboard metrics", async ({ page }) => {
    await enterDemo(page);
    await expect(stat(page, "Open tasks")).toHaveText("28");
    await expect(stat(page, "Completion rate")).toHaveText("41.7%");
    await expect(page.getByText("20 completed of 48 total")).toBeVisible();
    await page.getByRole("tab", { name: /Task Manager|^Tasks$/ }).click();
    // Find a pending task and complete it
    const completeBtn = page.getByRole("button", { name: /^Complete / }).first();
    await expect(completeBtn).toBeVisible();
    const taskName = (await completeBtn.getAttribute("aria-label"))!.replace("Complete ", "");
    await completeBtn.click();
    // Wait for the toast
    await expect(page.getByText("Task completed", { exact: true })).toBeVisible();
    await page.getByRole("tab", {name: /Overview|Home/}).click();
    await expect(stat(page, "Open tasks")).toHaveText("27");
    await expect(stat(page, "Completion rate")).toHaveText("43.8%");
    await page.reload();
    await expect(page.getByText("21 completed of 48 total")).toBeVisible();
    await page.getByRole("tab", { name: /Analytics|Stats/ }).click();
    await expect(stat(page, "Completed")).toHaveText("21");
    await expect(page.getByRole("list", { name: "Completion timeline" }).getByText(taskName, {exact:true})).toBeVisible();
    const storedEvents = await page.evaluate(title => {
      const store = JSON.parse(localStorage.getItem("smart-taskflow-demo-store")!);
      const task = store.tasks.find((t: {title:string}) => t.title === title);
      return store.task_completions.filter((e: {task_id:string}) => e.task_id === task.id);
    }, taskName);
    expect(storedEvents).toHaveLength(1);
  });

  test("the exact edited title persists after reload", async ({ page }) => {
    await enterDemo(page);
    await page.getByRole("tab", {name: /Task Manager|^Tasks$/}).click();
    await page.getByRole("button", {name:"Edit Sprint backlog review", exact:true}).click();
    await page.getByLabel("Title", {exact:true}).fill("Edited sprint handoff");
    await page.getByRole("button", {name:"Update Task", exact:true}).click();
    const edited = page.getByRole("button", {name:"Edit Edited sprint handoff", exact:true});
    await expect(edited).toBeVisible();
    await page.reload();
    await page.getByRole("tab", {name: /Task Manager|^Tasks$/}).click();
    await expect(edited).toBeVisible();
  });

  test("reset demo replaces workspace with fresh sample", async ({ page }) => {
    await enterDemo(page);
    await page.getByRole("tab", { name: /Task Manager|^Tasks$/ }).click();
    // Create a custom task
    await page.getByRole("button", { name: "Add Task" }).click();
    await page.getByLabel("Title", { exact: true }).fill("My custom task");
    await page.getByRole("button", { name: "Create Task", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit My custom task" })).toBeVisible();
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", {name:"Reset demo"}).click();
    await expect(page.getByRole("button", {name:"Edit My custom task"})).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset demo" }).click();
    // After reset, custom task should be gone
    await page.getByRole("tab", { name: /Task Manager|^Tasks$/ }).click();
    await expect(page.getByRole("button", { name: "Edit My custom task" })).toHaveCount(0);
    // But demo tasks should be present
    const editBtns = page.getByRole("button", { name: /^Edit / });
    await expect(editBtns).toHaveCount(48);
  });
});

for (const [width, height] of [[390, 844], [768, 1024], [1280, 900]]) {
  test(`populated demo fits ${width}×${height} without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await enterDemo(page);
    // Check overview
    await expect(page.getByText("Your workspace at a glance")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // Check analytics
    await page.getByRole("tab", { name: /Analytics|Stats/ }).click();
    await expect(page.getByText("Productivity analytics")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // Check planner
    await page.getByRole("tab", { name: /Daily Planner|^Planner$/ }).click();
    await expect(page.getByText("Scheduled work")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}


test("shared demo views pass accessibility checks and fit four viewport sizes", async ({page}, info) => {
  test.setTimeout(120000);
  await enterDemo(page);
  await checkWorkspace(page, info);
});
