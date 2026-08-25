/**
 * Install-time UI defaults from PUBLIC_* env vars (.env / .env.local).
 * User overrides (theme, duplicate warn) still win via localStorage after first change.
 */
import { env } from '$env/dynamic/public';
import {
	buildAppDefaults,
	defaultActiveAlbumFrom,
	type DefaultAlbumView
} from '$lib/config/defaultsLogic.js';

export type { DefaultAlbumView };

export const appDefaults = buildAppDefaults(env);

export function defaultActiveAlbum() {
	return defaultActiveAlbumFrom(appDefaults.albumView);
}
