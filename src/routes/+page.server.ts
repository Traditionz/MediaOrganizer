import type { PageServerLoad } from './$types';
import { listProfiles } from '$lib/server/profiles';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { listAlbums } from '$lib/server/albums';
import { countAllMedia, listMedia, purgeExpiredTrash } from '$lib/server/media';

export const load: PageServerLoad = async ({ cookies }) => {
	const profiles = listProfiles();
	const activeProfile = resolveProfileFromCookies(cookies);

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

	// Permanently remove trash items older than 30 days on page load
	purgeExpiredTrash(activeProfile.id);

	return {
		profiles,
		activeProfile,
		albums: listAlbums(activeProfile.id),
		media: listMedia(activeProfile.id),
		trash: listMedia(activeProfile.id, { trash: true }),
		totalCount: countAllMedia(activeProfile.id)
	};
};
