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
	ssr: {
		external: ['better-sqlite3', 'sharp', 'ffmpeg-static']
	},
	optimizeDeps: {
		exclude: ['better-sqlite3', 'sharp', 'ffmpeg-static', '@lucide/svelte']
	}
});
