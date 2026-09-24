import type { Album, LibraryAlbumFilter, MediaItem, Profile, Tag } from '$lib/types';
import { defaultActiveAlbum } from '$lib/config/defaults';
import { pasteTargetAlbumId as resolvePasteTargetAlbumId } from '$lib/media/filter.js';
import type { MediaSortBy, MediaSortDir } from '$lib/media/sort.js';
import { MEDIA_PAGE_SIZE, type MediaListPage } from '$lib/media/page';
import {
	asFiniteNumber,
	asPlainObject,
	own,
	ownNumber,
	stringList,
	type JsonValue
} from '$lib/parse';
import { albumCountDelta, mergeMembershipIntoList } from '$lib/media/viewMembership';
import {
	KNOWN_CACHE_CAP,
	forgetIds,
	pruneKnown,
	pruneThumbReady
} from '$lib/media/knownCache';
import type { PreferencesState } from './preferences.svelte';
import type { LibraryLoad } from './libraryLoad';

export type { LibraryLoad };

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
	favoritesCount = $state(0);
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
	tags = $state.raw<Tag[]>([]);

	/** Client-confirmed thumbs (survives refresh before server reflects thumbnail_key). */
	private thumbReady = new Set<string>();
	private queryEpoch = 0;
	/** Rows that left the open view still need a second album edit. */
	private known = new Map<string, MediaItem>();

	constructor(private readonly prefs: PreferencesState) {}

	/** Server already filtered/sorted — expose current view list. */
	readonly filteredMedia = $derived(this.activeAlbum === 'trash' ? this.trash : this.media);

	sync(data: LibraryLoad) {
		const prevProfileId = this.activeProfile?.id ?? null;
		const nextProfileId = data.activeProfile?.id ?? null;
		if (prevProfileId !== nextProfileId) {
			this.thumbReady.clear();
			this.known.clear();
		}

		this.albums = data.albums;
		this.media = data.media.map((item) =>
			this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
		);
		this.trash = (data.trash ?? []).map((item) =>
			this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item
		);
		this.trashCount = data.trashCount ?? this.trash.length;
		this.favoritesCount = data.favoritesCount ?? this.favoritesCount;
		this.trashLoaded = data.trashLoaded ?? this.trash.length > 0;
		this.totalCount = data.totalCount;
		this.unassignedCount = data.unassignedCount ?? 0;
		this.mediaTotal = data.mediaTotal ?? data.media.length;
		this.hasMore = data.mediaHasMore ?? false;
		this.pageSize = data.pageSize ?? MEDIA_PAGE_SIZE;
		this.profiles = data.profiles;
		this.activeProfile = data.activeProfile;
		this.tags = data.tags ?? [];
		this.remember(this.media);
		this.remember(this.trash);
		this.pruneCaches();
	}

	private remember(items: readonly MediaItem[]) {
		for (const item of items) this.known.set(item.id, item);
	}

	private viewKeepIds(): Set<string> {
		const keep = new Set<string>();
		for (const item of this.media) keep.add(item.id);
		for (const item of this.trash) keep.add(item.id);
		return keep;
	}

	private pruneCaches() {
		const keep = this.viewKeepIds();
		pruneKnown(this.known, keep, KNOWN_CACHE_CAP);
		pruneThumbReady(this.thumbReady, keep, this.known);
	}

	findKnown(id: string): MediaItem | undefined {
		return this.known.get(id);
	}

	loadedMedia(ids: readonly string[]): MediaItem[] {
		const items: MediaItem[] = [];
		for (const id of ids) {
			const item = this.findKnown(id);
			if (item) items.push(item);
		}
		return items;
	}

	/**
	 * Apply album membership locally. Rows that no longer match the open view leave the list
	 * immediately, and album / unassigned counts move without a full library recount.
	 */
	applyMembership(before: readonly MediaItem[], after: readonly MediaItem[]) {
		const count = before.length < after.length ? before.length : after.length;
		let unassignedDelta = 0;
		const albumDelta = new Map<string, number>();
		for (let index = 0; index < count; index++) {
			const prev = before[index];
			const next = after[index];
			if (!prev || !next) continue;
			const delta = albumCountDelta(prev.album_ids, next.album_ids);
			unassignedDelta += delta.unassigned;
			for (const [albumId, amount] of delta.albums) {
				albumDelta.set(albumId, (albumDelta.get(albumId) ?? 0) + amount);
			}
		}
		if (unassignedDelta !== 0) {
			this.unassignedCount = Math.max(0, this.unassignedCount + unassignedDelta);
		}
		if (albumDelta.size) {
			this.albums = this.albums.map((album) => {
				const amount = albumDelta.get(album.id);
				if (!amount) return album;
				return { ...album, media_count: Math.max(0, (album.media_count ?? 0) + amount) };
			});
		}
		const merged = mergeMembershipIntoList(this.media, after, this.activeAlbum);
		this.media = merged.items;
		if (merged.totalDelta !== 0) {
			this.mediaTotal = Math.max(0, this.mediaTotal + merged.totalDelta);
		}
		this.remember(after);
	}

	/** Swap in server rows that are still on screen. Does not change counts or visibility. */
	replaceKnownMedia(items: readonly MediaItem[]) {
		if (!items.length) return;
		const map = new Map(items.map((item) => [item.id, item]));
		let changed = false;
		const next = this.media.map((item) => {
			const hit = map.get(item.id);
			if (!hit) return item;
			changed = true;
			return this.thumbReady.has(item.id) ? { ...hit, has_thumbnail: true } : hit;
		});
		if (changed) this.media = next;
		this.remember(items);
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
		let favoriteDelta = 0;
		for (const item of items) {
			const prev = map.get(item.id);
			const wasFav = prev?.favorite === true;
			const nowFav = item.favorite === true;
			if (!wasFav && nowFav) favoriteDelta += 1;
			if (wasFav && !nowFav) favoriteDelta -= 1;
			const next = this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item;
			map.set(item.id, next);
		}
		this.media = [...map.values()];
		this.remember(items);
		if (favoriteDelta !== 0) {
			this.favoritesCount = Math.max(0, this.favoritesCount + favoriteDelta);
		}
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
		this.remember(items);
	}

	removeMediaIds(ids: string[]) {
		if (!ids.length) return;
		const drop = new Set(ids);
		const before = this.media.length;
		let removedFavorites = 0;
		for (const item of this.media) {
			if (drop.has(item.id) && item.favorite === true) removedFavorites += 1;
		}
		this.media = this.media.filter((item) => !drop.has(item.id));
		const removed = before - this.media.length;
		this.totalCount = Math.max(0, this.totalCount - removed);
		this.mediaTotal = Math.max(0, this.mediaTotal - removed);
		this.favoritesCount = Math.max(0, this.favoritesCount - removedFavorites);
		this.trash = this.trash.filter((item) => !drop.has(item.id));
		if (this.trashLoaded) this.trashCount = this.trash.length;
		else this.trashCount = Math.max(0, this.trashCount - removed);
		forgetIds(this.known, this.thumbReady, drop);
	}

	moveToTrash(items: MediaItem[]) {
		if (!items.length) return;
		const ids = new Set(items.map((item) => item.id));
		let removedFavorites = 0;
		for (const item of this.media) {
			if (ids.has(item.id) && item.favorite === true) removedFavorites += 1;
		}
		this.media = this.media.filter((item) => !ids.has(item.id));
		this.totalCount = Math.max(0, this.totalCount - items.length);
		this.mediaTotal = Math.max(0, this.mediaTotal - items.length);
		this.favoritesCount = Math.max(0, this.favoritesCount - removedFavorites);
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
		let restoredFavorites = 0;
		for (const item of items) {
			if (item.favorite === true) restoredFavorites += 1;
		}
		this.favoritesCount += restoredFavorites;
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
			this.remember(this.media);
			this.pruneCaches();
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
			const res = await fetch(this.buildListUrl({ offset: this.media.length, trash: false }));
			const page = parseMediaListPage(await readJsonValue(res), this.pageSize);
			const existing = new Set(this.media.map((item) => item.id));
			const appended = page.items
				.filter((item) => !existing.has(item.id))
				.map((item) => (this.thumbReady.has(item.id) ? { ...item, has_thumbnail: true } : item));
			this.media = [...this.media, ...appended];
			this.mediaTotal = page.total;
			this.hasMore = page.hasMore;
			this.remember(appended);
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
		this.remember(this.trash);
	}

	async refreshAlbums() {
		const res = await fetch('/api/albums');
		const payload = await readJsonValue(res);
		if (Array.isArray(payload)) {
			// SAFETY: GET /api/albums returns Album[].
			this.albums = payload as Album[];
		}
	}

	async refreshTags() {
		const res = await fetch('/api/tags');
		const payload = await readJsonValue(res);
		if (!Array.isArray(payload)) return;
		const next: Tag[] = [];
		for (const entry of payload) {
			const bag = asPlainObject(entry);
			if (!bag) continue;
			// SAFETY: GET /api/tags returns Tag[].
			next.push(entry as Tag);
		}
		this.tags = next;
	}

	async refreshCounts() {
		const res = await fetch('/api/media?meta=1');
		const bag = asPlainObject(await readJsonValue(res));
		if (!bag) return;
		const total = asFiniteNumber(own(bag, 'totalCount'));
		const trash = asFiniteNumber(own(bag, 'trashCount'));
		const favorites = asFiniteNumber(own(bag, 'favoritesCount'));
		const unassigned = asFiniteNumber(own(bag, 'unassignedCount'));
		if (total != null) this.totalCount = total;
		if (trash != null) this.trashCount = trash;
		if (favorites != null) this.favoritesCount = favorites;
		if (unassigned != null) this.unassignedCount = unassigned;
	}

	/** Full reload of current query + albums + counts (rare: profile switch / purge). */
	async refresh() {
		await Promise.all([
			this.reloadQuery(),
			this.refreshAlbums(),
			this.refreshCounts(),
			this.refreshTags()
		]);
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
