import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for /event and regression checks for existing pages.
// Runs against a production build (`npm run build` first) using the locally
// installed Google Chrome, so no browser download is needed.
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [
    { name: "desktop-chrome", use: { viewport: { width: 1366, height: 860 } } },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], channel: "chrome" },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/event`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
