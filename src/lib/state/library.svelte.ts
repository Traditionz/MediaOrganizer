import type { Album, LibraryAlbumFilter, MediaItem, Profile } from '$lib/types';
import { defaultActiveAlbum } from '$lib/config/defaults';
import { pasteTargetAlbumId as resolvePasteTargetAlbumId } from '$lib/media/filter.js';
import type { MediaSortBy, MediaSortDir } from '$lib/media/sort.js';
import { MEDIA_PAGE_SIZE, type MediaListPage } from '$lib/media/page';
import { asFiniteNumber, asPlainObject, own, ownNumber, stringList, type JsonValue } from '$lib/parse';
import type { PreferencesState } from './preferences.svelte';

export type LibraryLoad = {
	albums: Album[];
	media: MediaItem[];
	mediaTotal?: number;
	mediaHasMore?: boolean;
	trash?: MediaItem[];
	trashCount?: number;
	trashLoaded?: boolean;
	totalCount: number;
	unassignedCount?: number;
	pageSize?: number;
	profiles: Profile[];
	activeProfile: Profile | null;
};

function mediaTypeParam(showImages: boolean, showVideos: boolean): 'all' | 'image' | 'video' {
	if (showImages && !showVideos) return 'image';
	if (!showImages && showVideos) return 'video';
	return 'all';
}

function albumQueryParam(activeAlbum: LibraryAlbumFilter): string | null {
	if (activeAlbum === 'all' || activeAlbum === 'trash') return null;
	if (activeAlbum === null) return 'unassigned';
	return activeAlbum;
}

function parseMediaListPage(payload: JsonValue | undefined, fallbackLimit: number): MediaListPage {
	const bag = asPlainObject(payload);
	if (!bag) {
		return { items: [], total: 0, offset: 0, limit: fallbackLimit, hasMore: false };
	}
	const itemsRaw = own(bag, 'items');
	const items: MediaItem[] = [];
	if (Array.isArray(itemsRaw)) {
		for (const entry of itemsRaw) {
			const itemBag = asPlainObject(entry);
			if (!itemBag) continue;
			// SAFETY: list API returns MediaItem-shaped JSON; client treats as MediaItem cache rows.
			items.push(entry as MediaItem);
		}
	}
	const total = asFiniteNumber(own(bag, 'total')) ?? items.length;
	const offset = asFiniteNumber(own(bag, 'offset')) ?? 0;
	const limit = asFiniteNumber(own(bag, 'limit')) ?? fallbackLimit;
	const hasMore = own(bag, 'hasMore') === true || offset + items.length < total;
	return { items, total, offset, limit, hasMore };
}

async function readJsonValue(res: Response): Promise<JsonValue | undefined> {
	const payload: unknown = await res.json();
	if (payload === undefined) return undefined;
	// SAFETY: Response.json() yields JSON values at the network I/O boundary.
	return payload as JsonValue;
}

/** Profile library data + album/filter view (client cache over paginated API). */
export class LibraryState {
	albums = $state.raw<Album[]>([]);
	media = $state.raw<MediaItem[]>([]);
	trash = $state.raw<MediaItem[]>([]);
	trashCount = $state(0);
	trashLoaded = $state(false);
	totalCount = $state(0);
	unassignedCount = $state(0);
	mediaTotal = $state(0);
	hasMore = $state(false);
	pageSize = $state(MEDIA_PAGE_SIZE);
	loadingQuery = $state(false);
	loadingMore = $state(false);
	profiles = $state.raw<Profile[]>([]);
	activeProfile = $state.raw<Profile | null>(null);
	activeAlbum = $state<LibraryAlbumFilter>(defaultActiveAlbum());

	/** Client-confirmed thumbs (survives refresh before server reflects thumbnail_key). */
	private thumbReady = new Set<string>();
	private queryEpoch = 0;

	constructor(private readonly prefs: PreferencesState) {}

	/** Server already filtered/sorted — expose current view list. */
	readonly filteredMedia = $derived(this.activeAlbum === 'trash' ? this.trash : this.media);

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
		this.trashCount = data.trashCount ?? this.trash.length;
		this.trashLoaded = data.trashLoaded ?? this.trash.length > 0;
		this.totalCount = data.totalCount;
		this.unassignedCount = data.unassignedCount ?? 0;
		this.mediaTotal = data.mediaTotal ?? data.media.length;
		this.hasMore = data.mediaHasMore ?? false;
		this.pageSize = data.pageSize ?? MEDIA_PAGE_SIZE;
		this.profiles = data.profiles;
		this.activeProfile = data.activeProfile;
	}

	setActiveAlbum(id: LibraryAlbumFilter) {
		this.activeAlbum = id;
	}

	pasteTargetAlbumId(): string | null {
		return resolvePasteTargetAlbumId(this.activeAlbum);
	}

	upsertMedia(items: MediaItem[]) {
		if (!items.length) return;
		const map = new Map(this.media.map((item) => [item.id, item]));
		for (const item of items) {
			const next = this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item;
			map.set(item.id, next);
		}
		this.media = [...map.values()];
	}

	prependMedia(items: MediaItem[]) {
		if (!items.length) return;
		const ids = new Set(items.map((item) => item.id));
		const rest = this.media.filter((item) => !ids.has(item.id));
		this.media = [
			...items.map((item) =>
				this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
			),
			...rest
		];
		this.totalCount += items.length;
		this.mediaTotal += items.length;
	}

	removeMediaIds(ids: string[]) {
		if (!ids.length) return;
		const drop = new Set(ids);
		const before = this.media.length;
		this.media = this.media.filter((item) => !drop.has(item.id));
		const removed = before - this.media.length;
		this.totalCount = Math.max(0, this.totalCount - removed);
		this.mediaTotal = Math.max(0, this.mediaTotal - removed);
		this.trash = this.trash.filter((item) => !drop.has(item.id));
		if (this.trashLoaded) this.trashCount = this.trash.length;
		else this.trashCount = Math.max(0, this.trashCount - removed);
	}

	moveToTrash(items: MediaItem[]) {
		if (!items.length) return;
		const ids = new Set(items.map((item) => item.id));
		this.media = this.media.filter((item) => !ids.has(item.id));
		this.totalCount = Math.max(0, this.totalCount - items.length);
		this.mediaTotal = Math.max(0, this.mediaTotal - items.length);
		if (this.trashLoaded) {
			const existing = new Set(this.trash.map((item) => item.id));
			this.trash = [...items.filter((item) => !existing.has(item.id)), ...this.trash];
			this.trashCount = this.trash.length;
		} else {
			this.trashCount += items.length;
		}
	}

	restoreFromTrash(items: MediaItem[]) {
		if (!items.length) return;
		const ids = new Set(items.map((item) => item.id));
		this.trash = this.trash.filter((item) => !ids.has(item.id));
		this.trashCount = Math.max(0, this.trashCount - items.length);
		this.prependMedia(items.map((item) => ({ ...item, deleted_at: null })));
	}

	replaceAlbums(albums: Album[]) {
		this.albums = albums;
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

	setViewCount(id: string, viewCount: number) {
		if (!Number.isFinite(viewCount) || viewCount < 0) return;
		const view_count = Math.floor(viewCount);
		this.media = this.media.map((item) => (item.id === id ? { ...item, view_count } : item));
		this.trash = this.trash.map((item) => (item.id === id ? { ...item, view_count } : item));
	}

	buildListUrl(options?: {
		trash?: boolean;
		offset?: number;
		limit?: number;
		album?: LibraryAlbumFilter;
		search?: string;
		sortBy?: MediaSortBy;
		sortDir?: MediaSortDir;
		showImages?: boolean;
		showVideos?: boolean;
		dateFrom?: string;
		dateTo?: string;
	}): string {
		const params = new URLSearchParams();
		const trash = options?.trash ?? this.activeAlbum === 'trash';
		const album = options?.album ?? this.activeAlbum;
		const limit = options?.limit ?? this.pageSize;
		const offset = options?.offset ?? 0;
		params.set('limit', String(limit));
		params.set('offset', String(offset));
		params.set('sort', options?.sortBy ?? this.prefs.sortBy);
		params.set('dir', options?.sortDir ?? this.prefs.sortDir);
		const type = mediaTypeParam(
			options?.showImages ?? this.prefs.showImages,
			options?.showVideos ?? this.prefs.showVideos
		);
		if (type !== 'all') params.set('type', type);
		const from = options?.dateFrom ?? this.prefs.dateFrom;
		const to = options?.dateTo ?? this.prefs.dateTo;
		if (from) params.set('from', from);
		if (to) params.set('to', to);
		const search = (options?.search ?? this.prefs.searchQuery).trim();
		if (search) params.set('q', search);
		if (trash) {
			params.set('trash', '1');
		} else {
			const albumParam = albumQueryParam(album);
			if (albumParam) params.set('album', albumParam);
		}
		return `/api/media?${params.toString()}`;
	}

	async reloadQuery() {
		const epoch = ++this.queryEpoch;
		this.loadingQuery = true;
		try {
			if (this.activeAlbum === 'trash') {
				await this.ensureTrashLoaded(true);
				return;
			}
			const res = await fetch(this.buildListUrl({ offset: 0, trash: false }));
			const page = parseMediaListPage(await readJsonValue(res), this.pageSize);
			if (epoch !== this.queryEpoch) return;
			this.media = page.items.map((item) =>
				this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
			);
			this.mediaTotal = page.total;
			this.hasMore = page.hasMore;
		} finally {
			if (epoch === this.queryEpoch) this.loadingQuery = false;
		}
	}

	async loadMore() {
		if (this.loadingMore || this.loadingQuery) return;
		if (this.activeAlbum === 'trash') return;
		if (!this.hasMore) return;
		this.loadingMore = true;
		try {
			const res = await fetch(
				this.buildListUrl({ offset: this.media.length, trash: false })
			);
			const page = parseMediaListPage(await readJsonValue(res), this.pageSize);
			const existing = new Set(this.media.map((item) => item.id));
			const appended = page.items
				.filter((item) => !existing.has(item.id))
				.map((item) =>
					this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
				);
			this.media = [...this.media, ...appended];
			this.mediaTotal = page.total;
			this.hasMore = page.hasMore;
		} finally {
			this.loadingMore = false;
		}
	}

	async ensureTrashLoaded(force = false) {
		if (this.trashLoaded && !force) return;
		const res = await fetch(
			this.buildListUrl({
				trash: true,
				offset: 0,
				limit: Math.max(this.pageSize, 500),
				album: 'trash'
			})
		);
		const page = parseMediaListPage(await readJsonValue(res), this.pageSize);
		this.trash = page.items.map((item) =>
			this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
		);
		this.trashCount = page.total;
		this.trashLoaded = true;
	}

	async refreshAlbums() {
		const res = await fetch('/api/albums');
		const payload = await readJsonValue(res);
		if (Array.isArray(payload)) {
			// SAFETY: GET /api/albums returns Album[].
			this.albums = payload as Album[];
		}
	}

	async refreshCounts() {
		const res = await fetch('/api/media?meta=1');
		const bag = asPlainObject(await readJsonValue(res));
		if (!bag) return;
		const total = asFiniteNumber(own(bag, 'totalCount'));
		const trash = asFiniteNumber(own(bag, 'trashCount'));
		const unassigned = asFiniteNumber(own(bag, 'unassignedCount'));
		if (total != null) this.totalCount = total;
		if (trash != null) this.trashCount = trash;
		if (unassigned != null) this.unassignedCount = unassigned;
	}

	/** Full reload of current query + albums + counts (rare: profile switch / purge). */
	async refresh() {
		await Promise.all([this.reloadQuery(), this.refreshAlbums(), this.refreshCounts()]);
		if (this.activeAlbum === 'trash') await this.ensureTrashLoaded(true);
	}

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

	async lookupNames(names: string[]): Promise<{ [lowerName: string]: MediaItem[] }> {
		const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
		if (!unique.length) return {};
		const res = await fetch('/api/media', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'lookup-names', names: unique })
		});
		const bag = asPlainObject(await readJsonValue(res));
		if (!bag) return {};
		const found = own(bag, 'found');
		const out: { [lowerName: string]: MediaItem[] } = {};
		const foundBag = asPlainObject(found);
		if (foundBag) {
			for (const name of unique) {
				const key = name.toLowerCase();
				const list = own(foundBag, key);
				if (Array.isArray(list)) {
					const items: MediaItem[] = [];
					for (const entry of list) {
						if (!asPlainObject(entry)) continue;
						// SAFETY: lookup-names returns MediaItem rows per name key.
						items.push(entry as MediaItem);
					}
					out[key] = items;
				} else {
					out[key] = [];
				}
			}
		}
		return out;
	}
}

export function parseIdsFromOk(payload: JsonValue | undefined): string[] {
	const bag = asPlainObject(payload);
	if (!bag) return [];
	return stringList(own(bag, 'ids'));
}

export function parseViewCount(payload: JsonValue | undefined): number | null {
	const bag = asPlainObject(payload);
	if (!bag) return null;
	return asFiniteNumber(ownNumber(bag, 'view_count'));
}
