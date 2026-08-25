import type { Album, LibraryAlbumFilter, MediaItem, Profile } from '$lib/types';
import { defaultActiveAlbum } from '$lib/config/defaults';
import { filterMediaItems, pasteTargetAlbumId as resolvePasteTargetAlbumId } from '$lib/media/filter.js';
import type { PreferencesState } from './preferences.svelte';

export type LibraryLoad = {
	albums: Album[];
	media: MediaItem[];
	trash?: MediaItem[];
	totalCount: number;
	profiles: Profile[];
	activeProfile: Profile | null;
};

/** Profile library data + album/filter view (client cache over SSR load). */
export class LibraryState {
	albums = $state.raw<Album[]>([]);
	media = $state.raw<MediaItem[]>([]);
	trash = $state.raw<MediaItem[]>([]);
	totalCount = $state(0);
	profiles = $state.raw<Profile[]>([]);
	activeProfile = $state.raw<Profile | null>(null);
	activeAlbum = $state<LibraryAlbumFilter>(defaultActiveAlbum());

	/** Client-confirmed thumbs (survives refresh before server reflects thumbnail_key). */
	private thumbReady = new Set<string>();

	constructor(private readonly prefs: PreferencesState) {}

	sync(data: LibraryLoad) {
		const prevProfileId = this.activeProfile?.id ?? null;
		const nextProfileId = data.activeProfile?.id ?? null;
		if (prevProfileId !== nextProfileId) this.thumbReady.clear();

		this.albums = data.albums;
		this.media = data.media.map((item) =>
			this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
		);
		this.trash = (data.trash ?? []).map((item) =>
			this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
		);
		this.totalCount = data.totalCount;
		this.profiles = data.profiles;
		this.activeProfile = data.activeProfile;
	}

	readonly trashCount = $derived(this.trash.length);

	readonly unassignedCount = $derived(
		this.media.filter((item) => item.album_ids.length === 0).length
	);

	readonly filteredMedia = $derived.by(() => {
		const activeAlbum = this.activeAlbum;
		const source = activeAlbum === 'trash' ? this.trash : this.media;
		return filterMediaItems(source, activeAlbum, {
			searchQuery: this.prefs.searchQuery,
			showImages: this.prefs.showImages,
			showVideos: this.prefs.showVideos,
			dateFrom: this.prefs.dateFrom,
			dateTo: this.prefs.dateTo
		});
	});

	setActiveAlbum(id: LibraryAlbumFilter) {
		this.activeAlbum = id;
	}

	pasteTargetAlbumId(): string | null {
		return resolvePasteTargetAlbumId(this.activeAlbum);
	}

	markHasThumbnail(id: string) {
		this.thumbReady.add(id);
		this.media = this.media.map((item) =>
			item.id === id ? { ...item, has_thumbnail: true } : item
		);
		this.trash = this.trash.map((item) =>
			item.id === id ? { ...item, has_thumbnail: true } : item
		);
	}

	setMediaDuration(id: string, duration: number) {
		if (!Number.isFinite(duration) || duration <= 0) return;
		this.media = this.media.map((item) => (item.id === id ? { ...item, duration } : item));
		this.trash = this.trash.map((item) => (item.id === id ? { ...item, duration } : item));
	}

	async refresh() {
		const [mediaRes, trashRes, albumsRes] = await Promise.all([
			fetch('/api/media'),
			fetch('/api/media?trash=1'),
			fetch('/api/albums')
		]);
		const payload = await mediaRes.json();
		const trashPayload = await trashRes.json();
		// SAFETY: GET /api/media returns the MediaItem[] from listMedia.
		const media = payload as MediaItem[];
		// SAFETY: GET /api/media?trash=1 returns trashed MediaItem[] from listMedia.
		const trash = trashPayload as MediaItem[];
		this.media = media.map((item) =>
			this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
		);
		this.trash = trash.map((item) =>
			this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
		);
		this.albums = await albumsRes.json();
		this.totalCount = this.media.length;
	}

	/** Purge trash older than 30 days, then refresh lists. */
	async purgeExpiredAndRefresh() {
		await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'purge-trash' })
		}).catch(() => {
			/* best-effort */
		});
		await this.refresh();
	}
}
