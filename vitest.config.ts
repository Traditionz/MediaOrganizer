import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

const envPublic = fileURLToPath(new URL('./src/test-utils/envPublic.ts', import.meta.url));

export default mergeConfig(
	viteConfig,
	defineConfig({
		resolve: {
			conditions: ['browser'],
			alias: {
				'$env/dynamic/public': envPublic
			}
		},
		test: {
			include: ['src/**/*.svelte.vitest.ts'],
			browser: {
				enabled: true,
				provider: playwright(),
				headless: true,
				instances: [{ browser: 'chromium' }]
			},
			coverage: {
				provider: 'v8',
				include: ['src/lib/components/**/*.svelte', 'src/lib/**/*.svelte.ts'],
				exclude: ['src/lib/components/ui/**'],
				// Ratchet: raise as tests land; workspace target is 100.
				thresholds: {
					lines: 46,
					functions: 46,
					branches: 29,
					statements: 46
				}
			}
		}
	})
);
