import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearProfileCookie } from '$lib/server/profileContext';

/** Drop the active profile session (used on page unload for passcode-protected profiles). */
export const POST: RequestHandler = async ({ cookies }) => {
	clearProfileCookie(cookies);
	return json({ ok: true });
};
