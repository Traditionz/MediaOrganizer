import type { Album, MediaItem, Profile } from '$lib/types';

export interface HomePageData {
	profiles: Profile[];
	activeProfile: Profile | null;
	albums: Album[];
	media: MediaItem[];
	trash: MediaItem[];
	totalCount: number;
}

export interface HomePageLoadDeps {
	listProfiles: () => Profile[];
	resolveActiveProfile: () => Profile | null;
	listAlbums: (profileId: string) => Album[];
	listMedia: (profileId: string, options?: { trash?: boolean }) => MediaItem[];
	countAllMedia: (profileId: string) => number;
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
			trash: [],
			totalCount: 0
		};
	}

	deps.purgeExpiredTrash(activeProfile.id);

	return {
		profiles,
		activeProfile,
		albums: deps.listAlbums(activeProfile.id),
		media: deps.listMedia(activeProfile.id),
		trash: deps.listMedia(activeProfile.id, { trash: true }),
		totalCount: deps.countAllMedia(activeProfile.id)
	};
}
