import { sql } from 'drizzle-orm';
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

/** Registry DB — profile list + unlock metadata only. */
export const profiles = sqliteTable('profiles', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	passcodeHash: text('passcode_hash'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

/** Per-profile media.db — no profile_id; folder owns the profile. */
export const albums = sqliteTable(
	'albums',
	{
		id: text('id').primaryKey(),
		/** AES-GCM ciphertext (`enc:v1:…`); display via decryptName. */
		name: text('name').notNull(),
		/** HMAC of normalized plaintext — unique case-insensitive match. */
		nameKey: text('name_key').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(t) => [uniqueIndex('idx_albums_name_key').on(t.nameKey)]
);

export const media = sqliteTable(
	'media',
	{
		id: text('id').primaryKey(),
		originalName: text('original_name').notNull(),
		/** HMAC of normalized plaintext name — duplicate / exact lookup. */
		nameKey: text('name_key').notNull().default(''),
		mimeType: text('mime_type').notNull(),
		mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
		size: integer('size').notNull(),
		width: integer('width'),
		height: integer('height'),
		storageKey: text('storage_key').notNull().unique(),
		thumbnailKey: text('thumbnail_key'),
		duration: real('duration'),
		viewCount: integer('view_count').notNull().default(0),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`),
		/** Soft-delete timestamp; null = active library */
		deletedAt: text('deleted_at')
	},
	(t) => [
		index('idx_media_type').on(t.mediaType),
		index('idx_media_created').on(t.createdAt),
		index('idx_media_deleted').on(t.deletedAt),
		index('idx_media_deleted_created').on(t.deletedAt, t.createdAt),
		index('idx_media_name_key').on(t.nameKey)
	]
);

export const albumMedia = sqliteTable(
	'album_media',
	{
		albumId: text('album_id')
			.notNull()
			.references(() => albums.id, { onDelete: 'cascade' }),
		mediaId: text('media_id')
			.notNull()
			.references(() => media.id, { onDelete: 'cascade' })
	},
	(t) => [
		primaryKey({ columns: [t.albumId, t.mediaId] }),
		index('idx_album_media_media').on(t.mediaId),
		index('idx_album_media_album').on(t.albumId)
	]
);

export type ProfileRow = typeof profiles.$inferSelect;
export type AlbumRow = typeof albums.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type AlbumMediaRow = typeof albumMedia.$inferSelect;
