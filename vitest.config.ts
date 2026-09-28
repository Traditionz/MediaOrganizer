import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

const envPublic = fileURLToPath(new URL('./src/test-utils/envPublic.ts', import.meta.url));

/**
 * Windows: kit builds `$lib` from cwd. A lowercase drive letter makes `$lib` imports resolve to a
 * different module id than relative imports, so coverage drops every file reached only via `$lib`.
 */
function uppercaseAliasDrive(): Plugin {
	return {
		name: 'uppercase-alias-drive',
		enforce: 'post',
		config(config) {
			const alias = config.resolve?.alias;
			if (!Array.isArray(alias)) return;
			for (const entry of alias) {
				if (typeof entry.replacement === 'string') {
					entry.replacement = entry.replacement.replace(/^[a-z]:/, (drive) => drive.toUpperCase());
				}
			}
		}
	};
}

export default mergeConfig(
	viteConfig,
	defineConfig({
		plugins: [uppercaseAliasDrive()],
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
				thresholds: {
					lines: 100,
					functions: 100,
					branches: 100,
					statements: 100
				}
			}
		}
	})
);
