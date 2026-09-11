import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		// Registry DB for drizzle-kit studio; per-profile DBs live under data/profiles/{id}/media.db
		url: './data/registry.db'
	}
});
