import { chromium, expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tasks = (page: Page) => page.getByRole("tab", { name: /Task Manager|^Tasks$/ });
const taskButton = (page: Page, action: string, title: string) => page.getByRole("button", {name: action + " " + title, exact:true});
async function explore(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name:"Explore Demo" }).click();
  await expect(page.getByText("Demo · this browser")).toBeVisible();
  await tasks(page).click();
}
async function create(page: Page, title: string, due?: string) {
  await page.getByRole("button", {name:"Add Task"}).click();
  await page.getByLabel("Title", {exact:true}).fill(title);
  if (due) await page.getByLabel("Due date", {exact:true}).fill(due);
  await page.getByRole("button", {name:"Create Task", exact:true}).click();
  await expect(taskButton(page,"Edit",title)).toBeVisible();
}

test("demo CRUD preserves the Indian deadline instant and removes deleted completion history", async ({ page }) => {
  await explore(page);
  const title = "Prepare weekly notes";
  await create(page,title,"2028-02-29T10:15");
  const readDue = () => page.evaluate(title => JSON.parse(localStorage.getItem("smart-taskflow-demo-store")!).tasks
    .find((task: {title:string}) => task.title === title).due_date, title);
  expect(await readDue()).toBe("2028-02-29T04:45:00.000Z");
  await taskButton(page,"Edit",title).click();
  await expect(page.getByLabel("Due date",{exact:true})).toHaveValue("2028-02-29T10:15");
  await page.getByRole("button",{name:"Update Task"}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readDue()).toBe("2028-02-29T04:45:00.000Z");
  await taskButton(page,"Complete",title).click();
  await page.getByRole("tab",{name:/Analytics|Stats/}).click();
  await expect(page.getByText(title,{exact:true})).toBeVisible();
  await page.reload(); await tasks(page).click();
  await taskButton(page,"Delete",title).click();
  await page.getByRole("dialog").getByRole("button",{name:"Delete task",exact:true}).click();
  await expect(taskButton(page,"Edit",title)).toHaveCount(0);
  await page.getByRole("tab",{name:/Analytics|Stats/}).click();
  await expect(page.getByText(title,{exact:true})).toHaveCount(0);
});

test("explicit demo persists through a browser process restart, sign-out and deliberate reset", async ({ baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(),"smart-flow-browser-"));
  const launch = () => chromium.launchPersistentContext(profile,{ baseURL,
    executablePath:process.env.CHROMIUM_EXECUTABLE || undefined, timezoneId:"Asia/Kolkata" });
  let context = await launch();
  try {
    let page = await context.newPage();
    await explore(page); await create(page,"Restart fixture");
    await context.close(); context = await launch(); page = await context.newPage();
    await page.goto("/"); await tasks(page).click(); await expect(taskButton(page,"Edit","Restart fixture")).toBeVisible();
    await page.getByRole("button",{name:"Sign out"}).click();
    await expect(page.getByRole("button",{name:"Explore Demo"})).toBeVisible();
    await page.getByRole("button",{name:"Explore Demo"}).click(); await tasks(page).click();
    await expect(taskButton(page,"Edit","Restart fixture")).toBeVisible();
    page.once("dialog",dialog => dialog.accept());
    await page.getByRole("button",{name:"Reset demo"}).click();
    await tasks(page).click();
    await expect(taskButton(page,"Edit","Restart fixture")).toHaveCount(0);
  } finally { await context.close(); await rm(profile,{recursive:true,force:true}); }
});

for (const [width,height] of [[390,844],[768,1024],[1280,900]]) {
  test(`workspace fits ${width}×${height} after task creation`,async ({page}) => {
    await page.setViewportSize({width,height});
    await explore(page); await create(page,"Project planning ".repeat(6).trim());
    for (const name of [/Task Manager|^Tasks$/,/Daily Planner|^Planner$/,/Analytics|Stats/,/Overview|Home/]) {
      await page.getByRole("tab",{name}).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.getByText("Demo · this browser")).toBeVisible();
    }
  });
}

test("a rejected or interrupted cloud login stays on the cloud entry screen", async ({page}) => {
  await page.route("**/auth/v1/token?*",route => route.fulfill({ status:400, json:{error_code:"invalid_credentials",msg:"Invalid login credentials"} }));
  await page.goto("/");
  await page.getByLabel("Email",{exact:true}).fill("fixture@example.test");
  await page.getByLabel("Password",{exact:true}).fill("invalid-test-password");
  await page.getByRole("button",{name:"Sign in to cloud"}).click();
  await expect(page.getByRole("alert")).toContainText(/invalid/i);
  expect(await page.evaluate(() => localStorage.getItem("smart-taskflow-demo-store"))).toBeNull();
  await page.unroute("**/auth/v1/token?*");
  await page.route("**/auth/v1/token?*",route => route.abort("connectionfailed"));
  await page.getByRole("button",{name:"Sign in to cloud"}).click();
  await expect(page.getByRole("alert")).toContainText(/fetch|network|connect/i);
  await expect(page.getByText("Demo · this browser")).toHaveCount(0);
});

test("actual cloud signup, task storage, failed write, recovery and session restoration", async ({page}) => {
  if (!process.env.SMART_FLOW_TEST_ANON_KEY || process.env.SMART_FLOW_TEST_URL !== "http://127.0.0.1:57421")
    throw new Error("Run browser verification with scripts/with-local-stack.mjs and the disposable Supabase stack.");
  await page.goto("/");
  await page.getByRole("button",{name:"Register",exact:true}).click();
  await page.getByLabel("Display name").fill("Morgan");
  await page.getByLabel("Email",{exact:true}).fill(`browser-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password",{exact:true}).fill("synthetic-example-password-2026");
  await page.getByRole("button",{name:"Create account"}).click();
  await expect(page.getByText("Cloud · Supabase")).toBeVisible();
  await expect(page.getByText("Morgan",{exact:true})).toBeVisible();
  await tasks(page).click(); await expect(page.getByText("No tasks yet.",{exact:true})).toBeVisible();
  await create(page,"Cloud fixture");
  await page.route("**/rest/v1/rpc/create_task_batch",route => route.abort("connectionfailed"));
  await page.getByRole("button",{name:"Add Task"}).click();
  await page.getByLabel("Title",{exact:true}).fill("Retry fixture");
  await page.getByRole("button",{name:"Create Task",exact:true}).click();
  await expect(page.getByText("Action failed",{exact:true})).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.unroute("**/rest/v1/rpc/create_task_batch");
  await page.getByRole("button",{name:"Create Task",exact:true}).click();
  await expect(taskButton(page,"Edit","Retry fixture")).toBeVisible();
  await page.reload(); await tasks(page).click(); await expect(taskButton(page,"Edit","Cloud fixture")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("smart-taskflow-demo-store"))).toBeNull();
  await page.getByRole("button",{name:"Sign out"}).click();
  await expect(page.getByRole("button",{name:"Sign in to cloud"})).toBeVisible();
});
