import type { PageServerLoad } from './$types';
import { listProfiles } from '$lib/server/profiles';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { listAlbums } from '$lib/server/albums';
import { countAllMedia, listMedia, purgeExpiredTrash } from '$lib/server/media';
import { loadHomePageData } from '$lib/server/homePageLoad';

export const load: PageServerLoad = async ({ cookies }) => {
	return loadHomePageData({
		listProfiles,
		resolveActiveProfile: () => resolveProfileFromCookies(cookies),
		listAlbums,
		listMedia,
		countAllMedia,
		purgeExpiredTrash
	});
};
