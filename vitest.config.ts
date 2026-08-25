import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
	resolve: {
		alias: {
			$lib: path.resolve(root, './src/lib'),
			'$app/environment': path.resolve(root, './test/mocks/app-environment.ts'),
			'$env/dynamic/public': path.resolve(root, './test/mocks/env-public.ts'),
			'bun:test': 'vitest'
		}
	},
	test: {
		environment: 'happy-dom',
		setupFiles: ['./test/setup-vitest.ts'],
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary', 'json-summary', 'lcov'],
			reportsDirectory: './coverage',
			include: ['src/lib/**/*.ts'],
			exclude: [
				'src/lib/**/*.test.ts',
				'src/lib/**/*.svelte.ts',
				'src/lib/components/**',
				'src/lib/index.ts',
				'src/lib/utils.ts',
				'src/lib/dragSession.ts',
				'src/lib/config/defaults.ts',
				'src/lib/playbackPosition.ts',
				'src/lib/server/db.ts',
				'src/lib/server/schema.ts',
				'src/lib/server/media.ts',
				'src/lib/server/albums.ts',
				'src/lib/server/compress.ts',
				'src/lib/server/profiles.ts',
				'src/lib/server/profileContext.ts'
			],
			thresholds: {
				lines: 85,
				statements: 85,
				functions: 90,
				branches: 75
			}
		}
	}
});
