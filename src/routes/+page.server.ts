import type { PageServerLoad } from './$types';
import { listProfiles } from '$lib/server/profiles';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { listFolders } from '$lib/server/folders';
import { countAllMedia, listMedia } from '$lib/server/media';

export const load: PageServerLoad = async ({ cookies }) => {
	const profiles = listProfiles();
	const activeProfile = resolveProfileFromCookies(cookies);

	if (!activeProfile) {
		return {
			profiles,
			activeProfile: null,
			folders: [],
			media: [],
			totalCount: 0
		};
	}

	return {
		profiles,
		activeProfile,
		folders: listFolders(activeProfile.id),
		media: listMedia(activeProfile.id),
		totalCount: countAllMedia(activeProfile.id)
	};
};
