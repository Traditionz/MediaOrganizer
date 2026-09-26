import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { asPlainObject, type JsonObject, type JsonValue } from '$lib/parse';
import * as schema from './schema';
import { decryptName, ensureEncryptedName, nameLookupKey } from './nameCrypto';
import {
	DATA_DIR,
	PROFILES_DIR,
	REGISTRY_DB_PATH,
	profileDbPath,
	profileDir,
	profileFilesDir,
	profileTmpDir
} from './dbUtil';

export {
	DATA_DIR,
	PROFILES_DIR,
	REGISTRY_DB_PATH,
	filePathForKey,
	isUniqueConstraintError,
	newId,
	profileDbPath,
	profileDir,
	profileFilesDir,
	profileTmpDir,
	tmpPathForKey,
	PROFILE_COOKIE,
	PROFILE_UNLOCK_COOKIE
} from './dbUtil';

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(PROFILES_DIR, { recursive: true });

type RegistryDb = ReturnType<typeof drizzle<typeof schema>>;
type ProfileDb = ReturnType<typeof drizzle<typeof schema>>;

const registrySqlite = new Database(REGISTRY_DB_PATH);
registrySqlite.pragma('journal_mode = WAL');
registrySqlite.pragma('foreign_keys = ON');
createRegistrySchema(registrySqlite);

const registryDb = drizzle(registrySqlite, { schema });

const profileDbCache = new Map<string, { sqlite: Database.Database; db: ProfileDb }>();

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

function tableColumns(sqlite: Database.Database, table: string): Set<string> {
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

function createRegistrySchema(sqlite: Database.Database) {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS profiles (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL UNIQUE COLLATE NOCASE,
			passcode_hash TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
	`);
}

function createProfileSchema(sqlite: Database.Database) {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS albums (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS media (
			id TEXT PRIMARY KEY NOT NULL,
			original_name TEXT NOT NULL,
			name_key TEXT NOT NULL DEFAULT '',
			mime_type TEXT NOT NULL,
			media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
			size INTEGER NOT NULL,
			width INTEGER,
			height INTEGER,
			storage_key TEXT NOT NULL UNIQUE,
			thumbnail_key TEXT,
			duration REAL,
			view_count INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			deleted_at TEXT,
			captured_at TEXT,
			content_hash TEXT,
			camera_make TEXT,
			camera_model TEXT,
			gps_lat REAL,
			gps_lng REAL,
			favorite INTEGER NOT NULL DEFAULT 0,
			source_path TEXT,
			storyboard TEXT,
			playback_key TEXT
		);

		CREATE TABLE IF NOT EXISTS album_media (
			album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
			media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
			PRIMARY KEY (album_id, media_id)
		);

		CREATE TABLE IF NOT EXISTS tags (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			name_key TEXT NOT NULL,
			kind TEXT NOT NULL DEFAULT 'tag' CHECK (kind IN ('tag', 'person')),
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS media_tags (
			tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
			PRIMARY KEY (tag_id, media_id)
		);

		CREATE TABLE IF NOT EXISTS watched_folders (
			id TEXT PRIMARY KEY NOT NULL,
			path TEXT NOT NULL UNIQUE,
			recursive INTEGER NOT NULL DEFAULT 1,
			last_scan_at TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type);
		CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at);
		CREATE INDEX IF NOT EXISTS idx_media_deleted ON media(deleted_at);
		CREATE INDEX IF NOT EXISTS idx_album_media_media ON album_media(media_id);
		CREATE INDEX IF NOT EXISTS idx_album_media_album ON album_media(album_id);
	`);

	// Existing profile DBs keep their old CREATE TABLE shape — ALTER before any
	// index that needs new columns (CREATE TABLE IF NOT EXISTS will not add them).
	const mediaCols = tableColumns(sqlite, 'media');
	if (mediaCols.size > 0 && !mediaCols.has('thumbnail_key')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN thumbnail_key TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('duration')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN duration REAL');
	}
	if (mediaCols.size > 0 && !mediaCols.has('deleted_at')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN deleted_at TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('view_count')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0');
	}
	if (mediaCols.size > 0 && !mediaCols.has('name_key')) {
		sqlite.exec(`ALTER TABLE media ADD COLUMN name_key TEXT NOT NULL DEFAULT ''`);
	}
	if (mediaCols.size > 0 && !mediaCols.has('captured_at')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN captured_at TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('content_hash')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN content_hash TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('camera_make')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN camera_make TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('camera_model')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN camera_model TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('gps_lat')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN gps_lat REAL');
	}
	if (mediaCols.size > 0 && !mediaCols.has('gps_lng')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN gps_lng REAL');
	}
	if (mediaCols.size > 0 && !mediaCols.has('favorite')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
	}
	if (mediaCols.size > 0 && !mediaCols.has('source_path')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN source_path TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('storyboard')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN storyboard TEXT');
	}
	if (mediaCols.size > 0 && !mediaCols.has('playback_key')) {
		sqlite.exec('ALTER TABLE media ADD COLUMN playback_key TEXT');
	}

	sqlite.exec(
		'CREATE INDEX IF NOT EXISTS idx_media_deleted_created ON media(deleted_at, created_at)'
	);
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_name_key ON media(name_key)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_captured ON media(captured_at)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_content_hash ON media(content_hash)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_favorite ON media(favorite)');
	sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_key ON tags (name_key)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_tags_media ON media_tags(media_id)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_tags_tag ON media_tags(tag_id)');

	migrateEncryptedNames(sqlite);
}

function migrateEncryptedNames(sqlite: Database.Database) {
	const albumCols = tableColumns(sqlite, 'albums');
	if (albumCols.size === 0) return;

	if (!albumCols.has('name_key')) {
		sqlite.exec('ALTER TABLE albums ADD COLUMN name_key TEXT');
	}

	sqlite.exec('DROP INDEX IF EXISTS idx_albums_name');

	type AlbumRow = { id: string; name: string; name_key: string | null };
	// SAFETY: SELECT id, name, name_key FROM albums yields these columns.
	const albumRows = sqlite.prepare('SELECT id, name, name_key FROM albums').all() as AlbumRow[];
	const updateAlbum = sqlite.prepare('UPDATE albums SET name = ?, name_key = ? WHERE id = ?');
	for (const row of albumRows) {
		const plain = decryptName(row.name);
		const cipher = ensureEncryptedName(row.name);
		const key = nameLookupKey(plain);
		if (cipher !== row.name || row.name_key !== key) {
			updateAlbum.run(cipher, key, row.id);
		}
	}

	sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_name_key ON albums (name_key)');

	type MediaNameRow = { id: string; original_name: string; name_key: string | null };
	// SAFETY: SELECT id, original_name, name_key FROM media yields these columns.
	const mediaRows = sqlite
		.prepare('SELECT id, original_name, name_key FROM media')
		.all() as MediaNameRow[];
	const updateMedia = sqlite.prepare(
		'UPDATE media SET original_name = ?, name_key = ? WHERE id = ?'
	);
	for (const row of mediaRows) {
		const plain = decryptName(row.original_name);
		const cipher = ensureEncryptedName(row.original_name);
		const key = nameLookupKey(plain);
		if (cipher !== row.original_name || row.name_key !== key) {
			updateMedia.run(cipher, key, row.id);
		}
	}
}

/** Ensure profile folders + media.db exist; return drizzle handle. */
export function getProfileDb(profileId: string): ProfileDb {
	const cached = profileDbCache.get(profileId);
	if (cached) return cached.db;

	mkdirSync(profileFilesDir(profileId), { recursive: true });
	mkdirSync(profileTmpDir(profileId), { recursive: true });

	const sqlite = new Database(profileDbPath(profileId));
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	createProfileSchema(sqlite);
	const db = drizzle(sqlite, { schema });
	profileDbCache.set(profileId, { sqlite, db });
	return db;
}

export function closeProfileDb(profileId: string): void {
	const cached = profileDbCache.get(profileId);
	if (!cached) return;
	cached.sqlite.close();
	profileDbCache.delete(profileId);
}

/** Wipe profile DB handle + on-disk folder. */
export function destroyProfileStorage(profileId: string): void {
	closeProfileDb(profileId);
	const dir = profileDir(profileId);
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

export default registryDb;
export { registryDb, registrySqlite };
