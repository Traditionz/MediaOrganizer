import type { PageServerLoad } from './$types';
import { listProfiles } from '$lib/server/profiles';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { listAlbums } from '$lib/server/albums';
import {
	countAllMedia,
	countTrashMedia,
	countUnassignedMedia,
	listMedia,
	purgeExpiredTrash
} from '$lib/server/media';
import { loadHomePageData } from '$lib/server/homePageLoad';

export const load: PageServerLoad = async ({ cookies, isDataRequest }) => {
	return loadHomePageData({
		listProfiles,
		resolveActiveProfile: () =>
			resolveProfileFromCookies(cookies, {
				// Full document loads always require a fresh passcode for locked profiles.
				allowPasscodeUnlock: isDataRequest
			}),
		listAlbums,
		listMedia,
		countAllMedia,
		countTrashMedia,
		countUnassignedMedia,
		purgeExpiredTrash
	});
};
