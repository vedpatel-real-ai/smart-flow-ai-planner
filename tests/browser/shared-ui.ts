import { expect, type Page, type TestInfo } from "@playwright/test";
import { createRequire } from "node:module";
import type axe from "axe-core";
import type { AxeResults } from "axe-core";

declare global {
  interface Window { axe: typeof axe }
}
const require = createRequire(import.meta.url);
export const stat = (page: Page, label: string) =>
  page.locator("dl").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");

export async function checkWorkspace(page: Page, info: TestInfo) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  for (const name of [/Overview|Home/, /Task Manager|^Tasks$/, /Daily Planner|^Planner$/, /Analytics|Stats/]) {
    await page.getByRole("tab", { name }).click();
    for (const [width, height] of [[390, 844], [768, 1024], [1280, 900], [1600, 1000]]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (name.test("Overview") && process.env.CAPTURE_README_IMAGES === "1") {
        await page.screenshot({path: info.outputPath(`overview-${width}.png`), animations: "disabled"});
      }
      const violations = await page.evaluate(async () => {
        const { violations }: AxeResults = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        });
        return violations.map(v => ({ rule: v.id, elements: v.nodes.map(n => n.target) }));
      });
      expect(violations, String(name)).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}
