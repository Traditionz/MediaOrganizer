import type { Album, MediaItem, Profile } from '$lib/types';
import type { MediaListPage } from '$lib/media/page';
import { emptyMediaListPage, MEDIA_PAGE_SIZE } from '$lib/media/page';
import type { MediaQuery } from '$lib/server/media';

export interface HomePageData {
	profiles: Profile[];
	activeProfile: Profile | null;
	albums: Album[];
	media: MediaItem[];
	mediaTotal: number;
	mediaHasMore: boolean;
	trash: MediaItem[];
	trashCount: number;
	trashLoaded: boolean;
	totalCount: number;
	unassignedCount: number;
	pageSize: number;
}

export interface HomePageLoadDeps {
	listProfiles: () => Profile[];
	resolveActiveProfile: () => Profile | null;
	listAlbums: (profileId: string) => Album[];
	listMedia: (profileId: string, query?: MediaQuery) => MediaListPage;
	countAllMedia: (profileId: string) => number;
	countTrashMedia: (profileId: string) => number;
	countUnassignedMedia: (profileId: string) => number;
	purgeExpiredTrash: (profileId: string) => void;
}

/** Pure home route load — keeps +page.server.ts thin and Bun-testable. */
export function loadHomePageData(deps: HomePageLoadDeps): HomePageData {
	const profiles = deps.listProfiles();
	const activeProfile = deps.resolveActiveProfile();

	if (!activeProfile) {
		return {
			profiles,
			activeProfile: null,
			albums: [],
			media: [],
			mediaTotal: 0,
			mediaHasMore: false,
			trash: [],
			trashCount: 0,
			trashLoaded: false,
			totalCount: 0,
			unassignedCount: 0,
			pageSize: MEDIA_PAGE_SIZE
		};
	}

	deps.purgeExpiredTrash(activeProfile.id);

	const page = deps.listMedia(activeProfile.id, {
		limit: MEDIA_PAGE_SIZE,
		offset: 0,
		sortBy: 'date',
		sortDir: 'desc'
	});

	return {
		profiles,
		activeProfile,
		albums: deps.listAlbums(activeProfile.id),
		media: page.items,
		mediaTotal: page.total,
		mediaHasMore: page.hasMore,
		trash: [],
		trashCount: deps.countTrashMedia(activeProfile.id),
		trashLoaded: false,
		totalCount: deps.countAllMedia(activeProfile.id),
		unassignedCount: deps.countUnassignedMedia(activeProfile.id),
		pageSize: MEDIA_PAGE_SIZE
	};
}

export function emptyHomePageData(profiles: Profile[] = []): HomePageData {
	return {
		profiles,
		activeProfile: null,
		albums: [],
		media: [],
		mediaTotal: 0,
		mediaHasMore: false,
		trash: [],
		trashCount: 0,
		trashLoaded: false,
		totalCount: 0,
		unassignedCount: 0,
		pageSize: MEDIA_PAGE_SIZE
	};
}

export { emptyMediaListPage };
