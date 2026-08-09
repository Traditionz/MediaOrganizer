import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_DIR = join(process.cwd(), 'data');
export const FILES_DIR = join(DATA_DIR, 'files');

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(FILES_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'media.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

migrateLegacySchema();
createSchema();

function tableNames(): Set<string> {
	const rows = db
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
		.all() as Array<{ name: string }>;
	return new Set(rows.map((r) => r.name));
}

function tableColumns(table: string): Set<string> {
	const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
	return new Set(rows.map((r) => r.name));
}

/** Old SQLite DBs (pre-profiles / blob-in-db) are incompatible — reset them. */
function migrateLegacySchema() {
	const names = tableNames();
	if (!names.has('folders') && !names.has('media') && !names.has('profiles')) {
		return;
	}

	let incompatible = false;

	if (!names.has('profiles') && (names.has('folders') || names.has('media'))) {
		incompatible = true;
	}

	if (names.has('folders')) {
		const cols = tableColumns('folders');
		if (!cols.has('profile_id') || !cols.has('id')) incompatible = true;
	}

	if (names.has('media')) {
		const cols = tableColumns('media');
		if (!cols.has('profile_id') || !cols.has('storage_key') || cols.has('data')) {
			incompatible = true;
		}
	}

	if (!incompatible) return;

	console.warn(
		'[media-organizer] Resetting incompatible SQLite schema (old DB without profiles / file storage).'
	);

	db.exec(`
		PRAGMA foreign_keys = OFF;
		DROP TABLE IF EXISTS media;
		DROP TABLE IF EXISTS folders;
		DROP TABLE IF EXISTS profiles;
		PRAGMA foreign_keys = ON;
	`);
}

function createSchema() {
	db.exec(`
		CREATE TABLE IF NOT EXISTS profiles (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL UNIQUE COLLATE NOCASE,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS folders (
			id TEXT PRIMARY KEY NOT NULL,
			profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS media (
			id TEXT PRIMARY KEY NOT NULL,
			profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
			original_name TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
			folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
			size INTEGER NOT NULL,
			width INTEGER,
			height INTEGER,
			storage_key TEXT NOT NULL UNIQUE,
			thumbnail_key TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_folders_profile ON folders(profile_id);
		CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(profile_id, parent_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_parent_name
			ON folders (profile_id, IFNULL(parent_id, ''), name COLLATE NOCASE);
		CREATE INDEX IF NOT EXISTS idx_media_profile ON media(profile_id);
		CREATE INDEX IF NOT EXISTS idx_media_folder ON media(profile_id, folder_id);
		CREATE INDEX IF NOT EXISTS idx_media_type ON media(profile_id, media_type);
		CREATE INDEX IF NOT EXISTS idx_media_created ON media(profile_id, created_at);
	`);

	// Additive migration for DBs created before thumbnails
	const mediaCols = tableColumns('media');
	if (mediaCols.size > 0 && !mediaCols.has('thumbnail_key')) {
		db.exec('ALTER TABLE media ADD COLUMN thumbnail_key TEXT');
	}
}

export const PROFILE_COOKIE = 'mo_profile';

export function newId(): string {
	return crypto.randomUUID();
}

export function filePathForKey(storageKey: string): string {
	return join(FILES_DIR, storageKey);
}

export default db;
