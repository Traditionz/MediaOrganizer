import type { Album, MediaItem, Profile } from '$lib/types';
import { defaultActiveAlbum } from '$lib/config/defaults';
import type { PreferencesState } from './preferences.svelte';

export type LibraryLoad = {
	albums: Album[];
	media: MediaItem[];
	totalCount: number;
	profiles: Profile[];
	activeProfile: Profile | null;
};

/** Profile library data + album/filter view (client cache over SSR load). */
export class LibraryState {
	albums = $state.raw<Album[]>([]);
	media = $state.raw<MediaItem[]>([]);
	totalCount = $state(0);
	profiles = $state.raw<Profile[]>([]);
	activeProfile = $state.raw<Profile | null>(null);
	activeAlbum = $state<string | null | 'all'>(defaultActiveAlbum());

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
		this.totalCount = data.totalCount;
		this.profiles = data.profiles;
		this.activeProfile = data.activeProfile;
	}

	readonly unassignedCount = $derived(
		this.media.filter((item) => item.album_ids.length === 0).length
	);

	readonly filteredMedia = $derived.by(() => {
		const q = this.prefs.searchQuery.trim().toLowerCase();
		const activeAlbum = this.activeAlbum;
		const showImages = this.prefs.showImages;
		const showVideos = this.prefs.showVideos;
		const dateFrom = this.prefs.dateFrom;
		const dateTo = this.prefs.dateTo;

		return this.media.filter((item) => {
			if (activeAlbum !== 'all') {
				if (activeAlbum === null) {
					if (item.album_ids.length !== 0) return false;
				} else if (!item.album_ids.includes(activeAlbum)) {
					return false;
				}
			}
			if (item.media_type === 'image' && !showImages) return false;
			if (item.media_type === 'video' && !showVideos) return false;
			if (dateFrom || dateTo) {
				const day = item.created_at.slice(0, 10);
				if (dateFrom && day < dateFrom) return false;
				if (dateTo && day > dateTo) return false;
			}
			if (q && !item.original_name.toLowerCase().includes(q)) return false;
			return true;
		});
	});

	setActiveAlbum(id: string | null | 'all') {
		this.activeAlbum = id;
	}

	/** Target album for upload / paste when a concrete album is selected. */
	pasteTargetAlbumId(): string | null {
		return this.activeAlbum === 'all' || this.activeAlbum === null ? null : this.activeAlbum;
	}

	markHasThumbnail(id: string) {
		this.thumbReady.add(id);
		this.media = this.media.map((item) =>
			item.id === id ? { ...item, has_thumbnail: true } : item
		);
	}

	async refresh() {
		const [mediaRes, albumsRes] = await Promise.all([
			fetch('/api/media'),
			fetch('/api/albums')
		]);
		const media = (await mediaRes.json()) as MediaItem[];
		this.media = media.map((item) =>
			this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
		);
		this.albums = await albumsRes.json();
		this.totalCount = this.media.length;
	}
}
