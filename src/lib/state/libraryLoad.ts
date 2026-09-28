import type { Album, MediaItem, Profile, Tag } from '$lib/types';

/** Client library cache payload (page load + later invalidateAll). */
export type LibraryLoad = {
	albums: Album[];
	media: MediaItem[];
	mediaTotal?: number;
	mediaHasMore?: boolean;
	trash?: MediaItem[];
	trashCount?: number;
	favoritesCount?: number;
	trashLoaded?: boolean;
	totalCount: number;
	unassignedCount?: number;
	pageSize?: number;
	profiles: Profile[];
	activeProfile: Profile | null;
	tags?: Tag[];
};

/** Page-load snapshot used to seed LibraryState before first paint. */
export type LibraryPageSnapshot = {
	albums: Album[];
	media: MediaItem[];
	mediaTotal: number;
	mediaHasMore: boolean;
	trash: MediaItem[];
	trashCount: number;
	favoritesCount: number;
	trashLoaded: boolean;
	totalCount: number;
	unassignedCount: number;
	pageSize: number;
	profiles: Profile[];
	activeProfile: Profile | null;
	tags: Tag[];
};

/** Copy load data into the client library cache shape. */
export function libraryLoadFromPageData(data: LibraryPageSnapshot): LibraryLoad {
	return {
		albums: data.albums,
		media: data.media,
		mediaTotal: data.mediaTotal,
		mediaHasMore: data.mediaHasMore,
		trash: data.trash,
		trashCount: data.trashCount,
		favoritesCount: data.favoritesCount,
		trashLoaded: data.trashLoaded,
		totalCount: data.totalCount,
		unassignedCount: data.unassignedCount,
		pageSize: data.pageSize,
		profiles: data.profiles,
		activeProfile: data.activeProfile,
		tags: data.tags
	};
}

/** Profile picker vs library. Must use seeded load, not empty defaults. */
export function firstPaintShowsProfileGate(activeProfile: Profile | null): boolean {
	return activeProfile == null;
}
