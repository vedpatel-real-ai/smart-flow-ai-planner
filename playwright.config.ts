import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 35000,
  retries: 0,
  reporter: [["list"], ["junit", { outputFile: "verification-output/browser.xml" }]],
  use: {
    baseURL: "http://127.0.0.1:4187", timezoneId: "Asia/Kolkata",
    viewport: { width: 1280, height: 900 }, screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE || undefined },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4187 --strictPort",
    url: "http://127.0.0.1:4187", reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: process.env.SMART_FLOW_TEST_URL || "http://127.0.0.1:57421",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SMART_FLOW_TEST_ANON_KEY || "test-public-placeholder",
    },
  },
});
