import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	/** Shared SQLite under MEDIA_DATA_DIR — one worker avoids races. */
	workers: 1,
	reporter: process.env.CI ? 'github' : 'list',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'on-first-retry',
		permissions: ['clipboard-read', 'clipboard-write']
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'bun run build && bun run preview --port 4173 --host 127.0.0.1',
		port,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			...process.env,
			MEDIA_DATA_DIR: 'e2e-data'
		}
	}
});
