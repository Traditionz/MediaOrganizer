import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	clearScreen: false,
	server: {
		watch: {
			// data/ writes and timestamp-only rewrites of these configs were restarting
			// the dev server every few minutes. A restart reloads the page, and that
			// reload locks passcode profiles back to the picker.
			// Edit vite.config.ts or tsconfig.app.json → restart `bun run dev` by hand.
			ignored: [
				'**/src-tauri/**',
				'**/data/**',
				'**/*.db',
				'**/*.db-*',
				'**/vite.config.ts',
				'**/vite.config.js',
				'**/tsconfig.app.json'
			]
		}
	},
	ssr: {
		external: ['better-sqlite3', 'sharp', 'ffmpeg-static']
	},
	optimizeDeps: {
		exclude: ['better-sqlite3', 'sharp', 'ffmpeg-static', '@lucide/svelte']
	}
});
