import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser', timeout:30000, fullyParallel:false,
  use:{ baseURL:process.env.TEST_BASE_URL || 'http://127.0.0.1:3817', ...devices['Desktop Chrome'], launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {} },
  reporter:'list', outputDir:'.local/browser-results',
});
