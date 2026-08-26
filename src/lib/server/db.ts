import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema';
import { asPlainObject, type JsonObject, type JsonValue } from '$lib/parse';
import {
	DATA_DIR,
	FILES_DIR
} from './dbUtil';

export {
	DATA_DIR,
	FILES_DIR,
	filePathForKey,
	isUniqueConstraintError,
	newId,
	PROFILE_COOKIE
} from './dbUtil';

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(FILES_DIR, { recursive: true });

const sqlite = new Database(join(DATA_DIR, 'media.db'));

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

createSchema();

const db = drizzle(sqlite, { schema });

function sqliteNames(rows: JsonObject[]): string[] {
	const names: string[] = [];
	for (const row of rows) {
		const desc = Object.getOwnPropertyDescriptor(row, 'name');
		if (!desc) continue;
		const name = `${desc.value}`;
		if (name) names.push(name);
	}
	return names;
}

function tableColumns(table: string): Set<string> {
	const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all();
	const bags: JsonObject[] = [];
	if (Array.isArray(rows)) {
		for (const row of rows) {
			// SAFETY: PRAGMA table_info rows are JSON-shaped column objects.
			const bag = asPlainObject(row as JsonValue);
			if (bag) bags.push(bag);
		}
	}
	return new Set(sqliteNames(bags));
}

function createSchema() {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS profiles (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL UNIQUE COLLATE NOCASE,
			passcode_hash TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS albums (
			id TEXT PRIMARY KEY NOT NULL,
			profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS media (
			id TEXT PRIMARY KEY NOT NULL,
			profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
			original_name TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
			size INTEGER NOT NULL,
			width INTEGER,
			height INTEGER,
			storage_key TEXT NOT NULL UNIQUE,
			thumbnail_key TEXT,
			duration REAL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS album_media (
			album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
			media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
			PRIMARY KEY (album_id, media_id)
		);

		CREATE INDEX IF NOT EXISTS idx_albums_profile ON albums(profile_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_profile_name
			ON albums (profile_id, name COLLATE NOCASE);
		CREATE INDEX IF NOT EXISTS idx_media_profile ON media(profile_id);
		CREATE INDEX IF NOT EXISTS idx_media_type ON media(profile_id, media_type);
		CREATE INDEX IF NOT EXISTS idx_media_created ON media(profile_id, created_at);
		CREATE INDEX IF NOT EXISTS idx_album_media_media ON album_media(media_id);
		CREATE INDEX IF NOT EXISTS idx_album_media_album ON album_media(album_id);
	`);

	// Additive migrations for DBs created before thumbnails / duration
	const mediaCols = tableColumns('media');
	if (mediaCols.size > 0 && !mediaCols.has('thumbnail_key')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN thumbnail_key TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('duration')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN duration REAL');
	}
	if (mediaCols.size > 0 && !mediaCols.has('deleted_at')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN deleted_at TEXT');
	}
	sqlite.exec(
		'CREATE INDEX IF NOT EXISTS idx_media_deleted ON media(profile_id, deleted_at)'
	);

	const profileCols = tableColumns('profiles');
	if (profileCols.size > 0 && !profileCols.has('passcode_hash')) {
		sqlite.exec('ALTER TABLE profiles ADD COLUMN passcode_hash TEXT');
	}
}

export default db;
export { sqlite };
