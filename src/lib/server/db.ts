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
migrateFoldersToAlbums();

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
	if (
		!names.has('folders') &&
		!names.has('albums') &&
		!names.has('media') &&
		!names.has('profiles')
	) {
		return;
	}

	let incompatible = false;

	if (!names.has('profiles') && (names.has('folders') || names.has('albums') || names.has('media'))) {
		incompatible = true;
	}

	if (names.has('folders')) {
		const cols = tableColumns('folders');
		if (!cols.has('profile_id') || !cols.has('id')) incompatible = true;
	}

	if (names.has('albums')) {
		const cols = tableColumns('albums');
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
		DROP TABLE IF EXISTS album_media;
		DROP TABLE IF EXISTS media;
		DROP TABLE IF EXISTS albums;
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

	// Additive migration for DBs created before thumbnails
	const mediaCols = tableColumns('media');
	if (mediaCols.size > 0 && !mediaCols.has('thumbnail_key')) {
		db.exec('ALTER TABLE media ADD COLUMN thumbnail_key TEXT');
	}

	const profileCols = tableColumns('profiles');
	if (profileCols.size > 0 && !profileCols.has('passcode_hash')) {
		db.exec('ALTER TABLE profiles ADD COLUMN passcode_hash TEXT');
	}
}

/**
 * One-time: folders + media.folder_id → albums + album_media, then drop folder_id.
 */
function migrateFoldersToAlbums() {
	const names = tableNames();
	if (!names.has('folders')) return;

	console.warn('[media-organizer] Migrating folders → albums (many-to-many)…');

	db.exec('PRAGMA foreign_keys = OFF');

	const tx = db.transaction(() => {
		db.exec(`
			CREATE TABLE IF NOT EXISTS albums (
				id TEXT PRIMARY KEY NOT NULL,
				profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
				name TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			CREATE TABLE IF NOT EXISTS album_media (
				album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
				media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
				PRIMARY KEY (album_id, media_id)
			);
		`);

		db.exec(`
			INSERT OR IGNORE INTO albums (id, profile_id, name, created_at)
			SELECT id, profile_id, name, created_at FROM folders
		`);

		const mediaCols = tableColumns('media');
		if (mediaCols.has('folder_id')) {
			db.exec(`
				INSERT OR IGNORE INTO album_media (album_id, media_id)
				SELECT folder_id, id FROM media WHERE folder_id IS NOT NULL
			`);

			db.exec(`
				CREATE TABLE media_new (
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
					created_at TEXT NOT NULL DEFAULT (datetime('now'))
				);

				INSERT INTO media_new (
					id, profile_id, original_name, mime_type, media_type,
					size, width, height, storage_key, thumbnail_key, created_at
				)
				SELECT
					id, profile_id, original_name, mime_type, media_type,
					size, width, height, storage_key, thumbnail_key, created_at
				FROM media;

				DROP TABLE media;
				ALTER TABLE media_new RENAME TO media;
			`);
		}

		db.exec(`
			DROP TABLE IF EXISTS folders;
			DROP INDEX IF EXISTS idx_folders_profile;
			DROP INDEX IF EXISTS idx_folders_parent;
			DROP INDEX IF EXISTS idx_folders_parent_name;
			DROP INDEX IF EXISTS idx_media_folder;

			CREATE INDEX IF NOT EXISTS idx_albums_profile ON albums(profile_id);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_profile_name
				ON albums (profile_id, name COLLATE NOCASE);
			CREATE INDEX IF NOT EXISTS idx_media_profile ON media(profile_id);
			CREATE INDEX IF NOT EXISTS idx_media_type ON media(profile_id, media_type);
			CREATE INDEX IF NOT EXISTS idx_media_created ON media(profile_id, created_at);
			CREATE INDEX IF NOT EXISTS idx_album_media_media ON album_media(media_id);
			CREATE INDEX IF NOT EXISTS idx_album_media_album ON album_media(album_id);
		`);
	});

	tx();
	db.exec('PRAGMA foreign_keys = ON');
	console.warn('[media-organizer] Folders → albums migration complete.');
}

export const PROFILE_COOKIE = 'mo_profile';

export function newId(): string {
	return crypto.randomUUID();
}

export function filePathForKey(storageKey: string): string {
	return join(FILES_DIR, storageKey);
}

export default db;
