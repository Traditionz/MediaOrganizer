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

export const profiles = sqliteTable('profiles', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	passcodeHash: text('passcode_hash'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

export const albums = sqliteTable(
	'albums',
	{
		id: text('id').primaryKey(),
		profileId: text('profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(t) => [
		index('idx_albums_profile').on(t.profileId),
		uniqueIndex('idx_albums_profile_name').on(t.profileId, t.name)
	]
);

export const media = sqliteTable(
	'media',
	{
		id: text('id').primaryKey(),
		profileId: text('profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		originalName: text('original_name').notNull(),
		mimeType: text('mime_type').notNull(),
		mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
		size: integer('size').notNull(),
		width: integer('width'),
		height: integer('height'),
		storageKey: text('storage_key').notNull().unique(),
		thumbnailKey: text('thumbnail_key'),
		duration: real('duration'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`),
		/** Soft-delete timestamp; null = active library */
		deletedAt: text('deleted_at')
	},
	(t) => [
		index('idx_media_profile').on(t.profileId),
		index('idx_media_type').on(t.profileId, t.mediaType),
		index('idx_media_created').on(t.profileId, t.createdAt),
		index('idx_media_deleted').on(t.profileId, t.deletedAt)
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
