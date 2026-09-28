<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { LibraryAlbumFilter, MediaItem } from '$lib/types';
	import { invalidateAll } from '$app/navigation';
	import AlbumSidebar from '$lib/components/AlbumSidebar.svelte';
	import ProfileGate from '$lib/components/ProfileGate.svelte';
	import PasscodeModal from '$lib/components/PasscodeModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import PromptModal from '$lib/components/PromptModal.svelte';
	import AlbumPickerModal from '$lib/components/AlbumPickerModal.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import MediaGrid from '$lib/components/MediaGrid.svelte';
	import MediaCollage from '$lib/components/MediaCollage.svelte';
	import MediaLightbox from '$lib/components/MediaLightbox.svelte';
	import MediaMap from '$lib/components/MediaMap.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import TransferPanel from '$lib/components/TransferPanel.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { isInternalDragActive } from '$lib/dragSession';
	import { type DragZoneHost } from '$lib/dragUpload';
	import { asFiniteNumber, asPlainObject, eventTargetHtml, own, ownString } from '$lib/parse';
	import { isCopyableTextSelection, readTextSelection } from '$lib/media/copyableText';
	import {
		parseImportedMedia,
		parseMediaItem,
		parseMediaItems,
		parseOkMediaItems,
		parseTag
	} from '$lib/library/mutationHandlers';
	import { invertUndo, type UndoAction } from '$lib/media/undo';
	import { resolveLibraryHotkey, nextGridSelectionId } from '$lib/media/libraryHotkeys';
	import { isSpecialLibraryFilter, parseTagFilterId, tagFilterId } from '$lib/media/libraryNav';
	import {
		WATCH_POLL_MS,
		emptyLibraryDetail,
		emptyLibraryHeadline,
		formatLibraryHealth,
		resolveMediaExportHref
	} from '$lib/media/libraryUi';
	import { parseIdsFromOk } from '$lib/state/library.svelte';
	import { passcodePatchBody } from '$lib/profile/passcodeEdit';
	import {
		profileDeleteMediaCount,
		profileDeleteNeedsConfirm
	} from '$lib/profile/deleteConfirm';
	import {
		MEDIA_LAYOUT_GAP,
		idsIntersectingBox,
		libraryCardLayouts
	} from '$lib/media/virtualLayout';
	import { MarqueeController, shouldStartMarquee } from '$lib/selection/marqueeController';
	import { buildContextMenuItems } from '$lib/media/contextMenuItems';
	import { playbackJobErrors } from '$lib/media/playbackEncode';
	import { runPlaybackOptimize } from '$lib/media/playbackJobsClient';
	import { fade } from 'svelte/transition';
	import {
		createAppState,
		firstPaintShowsProfileGate,
		libraryLoadFromPageData,
		setAppState
	} from '$lib/state';
	import { syncLibraryFromLoad } from '$lib/state/librarySync.svelte';
	import type { MediaSortBy } from '$lib/media/sort.js';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// svelte-ignore state_referenced_locally
	// Seed before first paint. $effect.pre handles later data updates; this read is the SSR snapshot.
	const app = setAppState(createAppState(libraryLoadFromPageData(data)));
	const { prefs, library, selection, ui, undo, albums, favorites, upload, osFileDrag } = app;

	let durationBackfilledForProfile: string | null = null;
	let selectionSurface = $state<HTMLElement | null>(null);
	const marquee = new MarqueeController(selection, (surface, box) => {
		const host = surface.querySelector<HTMLElement>('[data-media-layout]');
		if (!host) return null;
		const width = host.clientWidth;
		if (!(width > 0)) return null;
		const layouts = libraryCardLayouts(
			library.filteredMedia,
			prefs.viewMode,
			prefs.columns,
			width,
			MEDIA_LAYOUT_GAP
		);
		return idsIntersectingBox(layouts, box, host.offsetLeft, host.offsetTop);
	});
	let promptKind: 'rename' | 'import-folder' | 'watch-folder' | 'assign-tag' | 'assign-person' =
		'rename';
	let assignTargetIds: string[] = [];
	let queryReloadTimer: ReturnType<typeof setTimeout> | null = null;
	let folderInput = $state<HTMLInputElement | null>(null);

	function attachFolderInput(node: HTMLInputElement) {
		folderInput = node;
		return () => {
			if (folderInput === node) folderInput = null;
		};
	}

	function scheduleQueryReload() {
		if (queryReloadTimer) clearTimeout(queryReloadTimer);
		queryReloadTimer = setTimeout(() => {
			queryReloadTimer = null;
			void library.reloadQuery();
		}, 200);
	}

	$effect(() => {
		return () => {
			if (queryReloadTimer) {
				clearTimeout(queryReloadTimer);
				queryReloadTimer = null;
			}
			app.dispose();
		};
	});

	async function selectAlbumFilter(id: LibraryAlbumFilter) {
		selection.selectedIds.clear();
		selection.selectionAnchor = null;
		if (id === 'trash') {
			await library.ensureTrashLoaded();
			library.setActiveAlbum(id);
			return;
		}
		library.setActiveAlbum(id);
		await library.reloadQuery();
	}

	async function refreshAlbumsAndCounts() {
		await app.refreshLibraryLists();
	}

	/** Keep marquee hit target at least viewport-tall so empty space below rows is draggable. */
	$effect(() => {
		const viewport = selection.contentEl;
		const surface = selectionSurface;
		if (!viewport || !surface) return;

		const sync = () => {
			surface.style.minHeight = `${viewport.clientHeight}px`;
		};
		sync();
		const ro = new ResizeObserver(sync);
		ro.observe(viewport);
		return () => {
			ro.disconnect();
			surface.style.minHeight = '';
		};
	});

	$effect(() => {
		const viewport = selection.contentEl;
		if (!viewport) return;
		const onScroll = () => {
			const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
			if (remaining < 900 && library.hasMore) {
				void library.loadMore();
			}
		};
		viewport.addEventListener('scroll', onScroll, { passive: true });
		return () => viewport.removeEventListener('scroll', onScroll);
	});

	syncLibraryFromLoad(library, () => libraryLoadFromPageData(data));

	$effect(() => {
		const profileId = data.activeProfile?.id ?? null;
		if (profileId && profileId !== durationBackfilledForProfile) {
			durationBackfilledForProfile = profileId;
			void (async () => {
				try {
					const res = await fetch('/api/media', {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'backfill-durations' })
					});
					if (res.ok) {
						const summary = asPlainObject(await res.json());
						const updated = summary ? asFiniteNumber(own(summary, 'updated')) : null;
						if ((updated ?? 0) > 0) await library.reloadQuery();
					}
				} catch {
					/* duration backfill optional */
				}
			})();
		}
	});

	$effect(() => {
		const profileId = library.activeProfile?.id ?? null;
		if (!profileId) return;
		untrack(() => {
			void scanWatched();
		});
		const timer = setInterval(() => {
			void scanWatched();
		}, WATCH_POLL_MS);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (!library.activeProfile?.has_passcode) return;
		const lock = () => {
			void fetch('/api/profiles/lock', {
				method: 'POST',
				keepalive: true,
				credentials: 'same-origin'
			});
		};
		window.addEventListener('pagehide', lock);
		window.addEventListener('beforeunload', lock);
		return () => {
			window.removeEventListener('pagehide', lock);
			window.removeEventListener('beforeunload', lock);
		};
	});

	async function selectProfile(id: string, passcode = '') {
		const res = await fetch('/api/profiles/select', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, passcode })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message || 'Failed to unlock profile');
		}
		await invalidateAll();
	}

	async function createProfile(name: string, passcode?: string | null) {
		const res = await fetch('/api/profiles', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, passcode: passcode || null })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message || 'Failed to create profile');
		}
		await invalidateAll();
	}

	function openMedia(item: MediaItem) {
		ui.preview = item;
	}

	function applyRecordedView(id: string, count: number) {
		library.setViewCount(id, count);
		if (ui.preview?.id === id) {
			ui.preview = { ...ui.preview, view_count: count };
		}
	}

	function openUnlockModal(profile: { id: string; name: string; has_passcode: boolean }) {
		if (!profile.has_passcode) {
			void selectProfile(profile.id).catch((err) => {
				ui.errorMessage = err instanceof Error ? err.message : 'Failed to open profile';
			});
			return;
		}
		ui.profileModalError = '';
		ui.profileModal = {
			open: true,
			mode: 'unlock',
			profileId: profile.id,
			profileName: profile.name,
			requiresPasscode: true,
			mediaCount: 0,
			prefillName: ''
		};
	}

	function openCreateProfileModal(prefillName = '') {
		ui.profileModalError = '';
		ui.profileModal = {
			open: true,
			mode: 'create',
			profileId: null,
			profileName: prefillName,
			requiresPasscode: false,
			mediaCount: 0,
			prefillName
		};
	}

	function openDeleteProfileModal(id: string, mediaCount?: number) {
		const target = library.profiles.find((p) => p.id === id) ?? library.activeProfile;
		if (!target || target.id !== id) return;
		const count =
			mediaCount ??
			(id === library.activeProfile?.id
				? profileDeleteMediaCount(library.totalCount, library.trashCount)
				: 0);
		ui.profileModalError = '';
		ui.profileModal = {
			open: true,
			mode: 'delete',
			profileId: id,
			profileName: target.name,
			requiresPasscode: false,
			mediaCount: count,
			prefillName: ''
		};
	}

	function openPasscodeEditor(profile: { id: string; name: string; has_passcode: boolean }) {
		ui.profileModalError = '';
		ui.profileModal = {
			open: true,
			mode: 'passcode',
			profileId: profile.id,
			profileName: profile.name,
			requiresPasscode: profile.has_passcode,
			mediaCount: 0,
			prefillName: ''
		};
	}

	async function goHome() {
		ui.preview = null;
		ui.closeProfileModal();
		await fetch('/api/profiles/lock', {
			method: 'POST',
			credentials: 'same-origin'
		});
		await invalidateAll();
	}

	async function handleProfileModalSubmit(payload: {
		name?: string;
		passcode: string;
		confirmPasscode: string;
		usePasscode: boolean;
		currentPasscode?: string;
		removePasscode?: boolean;
		confirmName?: string;
		confirmMediaCount?: number;
	}) {
		ui.profileModalBusy = true;
		ui.profileModalError = '';
		try {
			if (ui.profileModal.mode === 'unlock' && ui.profileModal.profileId) {
				await selectProfile(ui.profileModal.profileId, payload.passcode);
				ui.closeProfileModal();
				return;
			}
			if (ui.profileModal.mode === 'create') {
				const name = (payload.name || ui.profileModal.prefillName).trim();
				await createProfile(name, payload.usePasscode ? payload.passcode : null);
				ui.closeProfileModal();
				return;
			}
			if (ui.profileModal.mode === 'passcode' && ui.profileModal.profileId) {
				const body = passcodePatchBody({
					id: ui.profileModal.profileId,
					hasPasscode: ui.profileModal.requiresPasscode,
					remove: payload.removePasscode === true,
					currentPasscode: payload.currentPasscode ?? '',
					newPasscode: payload.passcode
				});
				const res = await fetch('/api/profiles', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				if (!res.ok) {
					const errBody = await res.json().catch(() => ({}));
					throw new Error(errBody.message || 'Failed to update passcode');
				}
				ui.closeProfileModal();
				await invalidateAll();
				return;
			}
			if (ui.profileModal.mode === 'delete' && ui.profileModal.profileId) {
				const res = await fetch('/api/profiles', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: ui.profileModal.profileId,
						confirmName: payload.confirmName,
						confirmMediaCount: payload.confirmMediaCount
					})
				});
				if (!res.ok) {
					const errBody = await res.json().catch(() => ({}));
					throw new Error(errBody.message || 'Failed to delete profile');
				}
				ui.closeProfileModal();
				await invalidateAll();
			}
		} catch (err) {
			ui.profileModalError = err instanceof Error ? err.message : 'Request failed';
			ui.profileModalBusy = false;
		}
	}

	async function switchProfileWithPrompt(id: string) {
		const target = library.profiles.find((p) => p.id === id);
		if (!target) return;
		openUnlockModal(target);
	}

	async function createProfileWithPrompt(name: string) {
		openCreateProfileModal(name);
	}

	async function deleteProfile(id: string) {
		const count =
			id === library.activeProfile?.id
				? profileDeleteMediaCount(library.totalCount, library.trashCount)
				: 0;
		if (profileDeleteNeedsConfirm(count)) {
			openDeleteProfileModal(id, count);
			return;
		}
		try {
			const res = await fetch('/api/profiles', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				const bag = asPlainObject(errBody) ?? {};
				const message = ownString(bag, 'message') ?? 'Failed to delete profile';
				// Server still has media (e.g. trash) — open type-to-confirm instead of a dead banner.
				if (message === 'Confirmation required') {
					const serverCount = asFiniteNumber(own(bag, 'mediaCount'));
					openDeleteProfileModal(
						id,
						serverCount ?? profileDeleteMediaCount(library.totalCount, library.trashCount)
					);
					return;
				}
				throw new Error(message);
			}
			await invalidateAll();
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Failed to delete profile';
		}
	}

	async function createAlbum(name: string) {
		await albums.createAlbum(name);
	}

	async function deleteAlbum(id: string) {
		ui.openConfirmModal({
			kind: 'delete-album',
			title: 'Delete album',
			message: 'Delete this album? Media stays in your library.',
			confirmLabel: 'Delete',
			destructive: true,
			albumId: id
		});
	}

	async function runDeleteAlbum(id: string) {
		await albums.runDeleteAlbum(id);
	}

	async function renameAlbum(id: string, name: string) {
		await albums.renameAlbum(id, name);
	}

	async function duplicateAlbum(id: string) {
		await albums.duplicateAlbum(id);
	}

	function loadedMedia(ids: string[]): MediaItem[] {
		return library.loadedMedia(ids);
	}

	async function addMediaToAlbum(ids: string[], albumId: string, recordUndo = true) {
		await albums.addMediaToAlbum(ids, albumId, recordUndo);
	}

	async function removeMediaFromAlbum(ids: string[], albumId: string, recordUndo = true) {
		await albums.removeMediaFromAlbum(ids, albumId, recordUndo);
	}

	async function duplicateMedia(
		ids: string[],
		albumId: string | null = library.pasteTargetAlbumId()
	) {
		if (!ids.length) return;
		const res = await fetch('/api/media', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', ids, albumId })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to duplicate media';
			return;
		}
		const created = parseMediaItems(await res.json());
		library.prependMedia(created);
		await refreshAlbumsAndCounts();
	}

	async function renameMediaItem(id: string) {
		const item = library.findKnown(id);
		if (!item) return;
		promptKind = 'rename';
		ui.openRenamePrompt(id, item.original_name);
	}

	async function runRenameMediaItem(id: string, name: string) {
		const item = library.findKnown(id);
		if (!item) return;
		const trimmed = name.trim();
		if (!trimmed || trimmed === item.original_name) {
			ui.closePromptModal();
			return;
		}
		ui.promptModalBusy = true;
		ui.promptModalError = '';
		try {
			const res = await fetch('/api/media', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'rename', id, name: trimmed })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Failed to rename media');
			}
			const updated = parseMediaItem(await res.json());
			if (updated) library.upsertMedia([updated]);
			ui.closePromptModal();
		} catch (err) {
			ui.promptModalError = err instanceof Error ? err.message : 'Failed to rename media';
			ui.promptModalBusy = false;
		}
	}

	function openImportFolderPrompt() {
		promptKind = 'import-folder';
		ui.promptModalBusy = false;
		ui.promptModalError = '';
		ui.promptModal = {
			open: true,
			title: 'Import folder',
			label: 'Absolute folder path',
			initialValue: '',
			mediaId: null
		};
	}

	async function runImportFolder(path: string) {
		const trimmed = path.trim();
		if (!trimmed) {
			ui.promptModalError = 'Folder path is required';
			return;
		}
		ui.promptModalBusy = true;
		ui.promptModalError = '';
		try {
			const res = await fetch('/api/media', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'import-folder',
					path: trimmed,
					albumId: library.pasteTargetAlbumId()
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Import failed');
			}
			const imported = parseImportedMedia(await res.json());
			library.prependMedia(imported);
			await refreshAlbumsAndCounts();
			ui.closePromptModal();
			ui.convertResultMessage =
				imported.length === 1
					? 'Imported 1 file from folder.'
					: `Imported ${imported.length} files from folder.`;
		} catch (err) {
			ui.promptModalError = err instanceof Error ? err.message : 'Import failed';
			ui.promptModalBusy = false;
		}
	}

	async function copyMediaNames(ids: string[]) {
		const names = loadedMedia(ids)
			.map((item) => item.original_name)
			.filter((n): n is string => Boolean(n));
		if (!names.length) return;
		try {
			await navigator.clipboard.writeText(names.join('\n'));
		} catch {
			/* ignore */
		}
	}

	async function pasteClipboard() {
		if (!ui.clipboard?.ids.length) return;
		const albumId = library.pasteTargetAlbumId();
		if (ui.clipboard.mode === 'cut') {
			if (albumId) await addMediaToAlbum(ui.clipboard.ids, albumId);
			ui.clipboard = null;
			return;
		}
		await duplicateMedia(ui.clipboard.ids, albumId);
	}

	function downloadMedia(ids: string[]) {
		if (ids.length > 1) {
			window.location.href = `/api/media/export?ids=${ids.map(encodeURIComponent).join(',')}`;
			return;
		}
		for (const id of ids) {
			const a = document.createElement('a');
			a.href = `/api/media/${id}?download`;
			a.download = '';
			a.rel = 'noopener';
			document.body.appendChild(a);
			a.click();
			a.remove();
		}
	}

	async function applyUndoAction(action: UndoAction) {
		const inverse = invertUndo(action);
		if (inverse.kind === 'restore') {
			await restoreSelected(inverse.ids, false);
			return;
		}
		if (inverse.kind === 'trash') {
			await runDeleteMedia(inverse.ids, false, false);
			return;
		}
		if (inverse.kind === 'album-add') {
			await addMediaToAlbum(inverse.ids, inverse.albumId, false);
			return;
		}
		if (inverse.kind === 'album-remove') {
			await removeMediaFromAlbum(inverse.ids, inverse.albumId, false);
			return;
		}
		await setFavorite(inverse.ids, inverse.favorite, false);
	}

	async function undoLast() {
		const action = undo.pop();
		if (!action) return;
		await applyUndoAction(action);
	}

	async function setFavorite(ids: string[], favorite: boolean, recordUndo = true) {
		await favorites.setFavorite(ids, favorite, recordUndo);
	}

	async function showLibraryHealth() {
		try {
			const res = await fetch('/api/library');
			const body = asPlainObject(await res.json());
			const missing = asFiniteNumber(own(body ?? {}, 'missingCount')) ?? 0;
			const bytes = asFiniteNumber(own(body ?? {}, 'totalBytes')) ?? 0;
			const count = asFiniteNumber(own(body ?? {}, 'mediaCount')) ?? 0;
			let backedUp = false;
			if (missing === 0) {
				const backup = await fetch('/api/library', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'backup' })
				});
				backedUp = backup.ok;
			}
			ui.convertResultMessage = formatLibraryHealth({
				mediaCount: count,
				totalBytes: bytes,
				missingCount: missing,
				backedUp
			});
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Health check failed';
		}
	}

	async function createTag(name: string, kind: 'tag' | 'person') {
		const res = await fetch('/api/tags', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, kind })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to create tag';
			throw new Error(ui.errorMessage);
		}
		const tag = parseTag(await res.json());
		await library.refreshTags();
		return tag;
	}

	async function deleteTag(id: string) {
		const res = await fetch('/api/tags', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to delete tag';
			return;
		}
		await library.refreshTags();
		if (library.activeAlbum === tagFilterId(id)) {
			await selectAlbumFilter('all');
		}
	}

	async function assignTagByName(ids: string[], name: string, kind: 'tag' | 'person') {
		const trimmed = name.trim();
		if (!ids.length || !trimmed) return;
		const existing = library.tags.find(
			(tag) => tag.kind === kind && tag.name.toLowerCase() === trimmed.toLowerCase()
		);
		const tag = existing ?? (await createTag(trimmed, kind));
		if (!tag) return;
		const res = await fetch('/api/tags', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'assign', tagId: tag.id, ids })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to assign tag';
			return;
		}
		library.upsertMedia(parseOkMediaItems(await res.json()));
		await library.refreshTags();
	}

	async function unassignCurrentTag(ids: string[]) {
		const tagId = parseTagFilterId(library.activeAlbum);
		if (!tagId || !ids.length) return;
		const res = await fetch('/api/tags', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'unassign', tagId, ids })
		});
		if (!res.ok) return;
		library.upsertMedia(parseOkMediaItems(await res.json()));
		if (library.activeAlbum === tagFilterId(tagId)) {
			library.removeMediaIds(ids);
		}
		await library.refreshTags();
	}

	function openAssignPrompt(ids: string[], kind: 'tag' | 'person') {
		assignTargetIds = ids;
		promptKind = kind === 'person' ? 'assign-person' : 'assign-tag';
		ui.promptModalBusy = false;
		ui.promptModalError = '';
		ui.promptModal = {
			open: true,
			title: kind === 'person' ? 'Add person' : 'Add tag',
			label: kind === 'person' ? 'Person name' : 'Tag name',
			initialValue: '',
			mediaId: null
		};
	}

	async function toggleFavoriteSelected() {
		const ids = [...selection.selectedIds];
		if (!ids.length) return;
		await favorites.toggle(ids);
	}

	function exportCurrent() {
		const href = resolveMediaExportHref({
			selectedIds: [...selection.selectedIds],
			visibleIds: library.filteredMedia.map((item) => item.id),
			activeAlbum: library.activeAlbum
		});
		if (href) window.location.href = href;
	}

	function pickFolder() {
		folderInput?.click();
	}

	async function rotatePreview(id: string) {
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'rotate', id, degrees: 90 })
		});
		if (!res.ok) return;
		const updated = parseMediaItem(await res.json());
		if (updated) {
			library.upsertMedia([updated]);
			if (ui.preview?.id === id) ui.preview = updated;
		}
	}

	async function cropPreview(
		id: string,
		box: { left: number; top: number; width: number; height: number; normalized: boolean }
	) {
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'crop', id, ...box })
		});
		if (!res.ok) return;
		const updated = parseMediaItem(await res.json());
		if (updated) {
			library.upsertMedia([updated]);
			if (ui.preview?.id === id) ui.preview = updated;
		}
	}

	function openWatchFolderPrompt() {
		promptKind = 'watch-folder';
		ui.promptModalBusy = false;
		ui.promptModalError = '';
		ui.promptModal = {
			open: true,
			title: 'Watch folder',
			label: 'Absolute folder path',
			initialValue: '',
			mediaId: null
		};
	}

	async function runWatchFolder(path: string) {
		const trimmed = path.trim();
		if (!trimmed) {
			ui.promptModalError = 'Folder path is required';
			return;
		}
		ui.promptModalBusy = true;
		ui.promptModalError = '';
		try {
			const res = await fetch('/api/watch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: trimmed })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Watch failed');
			}
			ui.closePromptModal();
			await scanWatched();
		} catch (err) {
			ui.promptModalError = err instanceof Error ? err.message : 'Watch failed';
			ui.promptModalBusy = false;
		}
	}

	async function scanWatched() {
		const res = await fetch('/api/watch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'scan' })
		});
		if (!res.ok) return;
		const imported = parseImportedMedia(await res.json());
		if (imported.length) {
			library.prependMedia(imported);
			await refreshAlbumsAndCounts();
			ui.convertResultMessage =
				imported.length === 1
					? 'Watched folder imported 1 file.'
					: `Watched folder imported ${imported.length} files.`;
		}
	}

	async function optimizePlaybackIds(ids: string[]) {
		const videoIds = loadedMedia(ids)
			.filter((item) => item.media_type === 'video')
			.map((item) => item.id);
		if (!videoIds.length) return;
		const jobId = ui.beginTransfer({
			kind: 'optimize',
			label: videoIds.length === 1 ? '1 video' : `${videoIds.length} videos`,
			fileCount: videoIds.length
		});
		try {
			const { jobs, items } = await runPlaybackOptimize(videoIds, {
				fetch: (input, init) => fetch(input, init),
				sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
				onProgress: (pct) => ui.setTransferProgress(jobId, pct)
			});
			library.upsertMedia(parseMediaItems(items));
			const errors = playbackJobErrors(jobs);
			if (errors.length) ui.errorMessage = errors.join('; ');
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Optimize failed';
		} finally {
			ui.endTransfer(jobId);
		}
	}

	const contextMenuItems = $derived(
		buildContextMenuItems({
			kind: ui.contextMenu.kind,
			mediaIds: ui.contextMenu.mediaIds,
			activeAlbum: library.activeAlbum,
			trashCount: library.trashCount,
			hasClipboard: Boolean(ui.clipboard?.ids.length),
			favoriteItems: loadedMedia(ui.contextMenu.mediaIds)
		})
	);

	function openMediaContextMenu(e: MouseEvent, item: MediaItem) {
		e.preventDefault();
		e.stopPropagation();
		if (!selection.selectedIds.has(item.id)) {
			selection.selectOnly(item.id);
		}
		ui.openContextMenu({
			x: e.clientX,
			y: e.clientY,
			mediaIds: [...selection.selectedIds],
			kind: 'media'
		});
	}

	function openEmptyContextMenu(e: MouseEvent) {
		const target = eventTargetHtml(e);
		if (target?.closest('.media-card')) return;
		e.preventDefault();
		ui.openContextMenu({
			x: e.clientX,
			y: e.clientY,
			mediaIds: [],
			kind: 'empty'
		});
	}

	async function handleContextSelect(id: string) {
		const ids = ui.contextMenu.mediaIds;

		if (id === 'copy') {
			ui.setClipboard(ids, 'copy');
			return;
		}
		if (id === 'cut') {
			ui.setClipboard(ids, 'cut');
			return;
		}
		if (id === 'paste') {
			await pasteClipboard();
			return;
		}
		if (id === 'duplicate') {
			await duplicateMedia(ids);
			return;
		}
		if (id === 'copy-name') {
			await copyMediaNames(ids);
			return;
		}
		if (id === 'rename') {
			if (ids.length === 1) await renameMediaItem(ids[0]);
			return;
		}
		if (id === 'download') {
			downloadMedia(ids);
			return;
		}
		if (id === 'optimize-playback') {
			await optimizePlaybackIds(ids);
			return;
		}
		if (id === 'delete') {
			if (!ids.length) return;
			ui.openConfirmModal({
				kind: 'delete-media',
				title: 'Move to trash',
				message: `Move ${ids.length} item(s) to trash? Items are deleted forever after 30 days.`,
				confirmLabel: 'Move to trash',
				destructive: true,
				mediaIds: ids
			});
			return;
		}
		if (id === 'delete-forever') {
			if (!ids.length) return;
			ui.openConfirmModal({
				kind: 'delete-media-forever',
				title: 'Delete forever',
				message: `Permanently delete ${ids.length} item(s)? This cannot be undone.`,
				confirmLabel: 'Delete forever',
				destructive: true,
				mediaIds: ids
			});
			return;
		}
		if (id === 'restore') {
			await restoreSelected(ids);
			return;
		}
		if (id === 'empty-trash') {
			await emptyTrash();
			return;
		}
		if (id === 'upload') {
			ui.fileInput?.click();
			return;
		}
		if (id === 'import-folder') {
			openImportFolderPrompt();
			return;
		}
		if (id === 'pick-folder') {
			pickFolder();
			return;
		}
		if (id === 'watch-folder') {
			openWatchFolderPrompt();
			return;
		}
		if (id === 'library-health') {
			await showLibraryHealth();
			return;
		}
		if (id === 'favorite') {
			await favorites.toggle(ids);
			return;
		}
		if (id === 'export-zip') {
			const href = resolveMediaExportHref({
				selectedIds: ids,
				visibleIds: [],
				activeAlbum: 'all'
			});
			if (href) window.location.href = href;
			return;
		}
		if (id === 'assign-tag') {
			openAssignPrompt(ids, 'tag');
			return;
		}
		if (id === 'assign-person') {
			openAssignPrompt(ids, 'person');
			return;
		}
		if (id === 'remove-tag') {
			await unassignCurrentTag(ids);
			return;
		}
		if (id === 'remove-from-album') {
			if (!isSpecialLibraryFilter(library.activeAlbum) && library.activeAlbum !== null) {
				await removeMediaFromAlbum(ids, library.activeAlbum);
			}
			return;
		}
		if (id === 'add-to-album') {
			if (ids.length) ui.openAlbumPicker(ids);
		}
	}

	function onKeydown(e: KeyboardEvent) {
		const target = eventTargetHtml(e);
		const action = resolveLibraryHotkey(
			{ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey },
			{
				inputFocused: Boolean(
					target &&
					(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
				),
				blocked: Boolean(
					ui.albumPicker.open ||
					ui.confirmModal.open ||
					ui.promptModal.open ||
					ui.profileModal.open ||
					ui.preview
				),
				selectedCount: selection.selectedIds.size,
				hasClipboard: Boolean(ui.clipboard?.ids.length),
				textSelected: isCopyableTextSelection(readTextSelection())
			}
		);
		if (!action) return;
		e.preventDefault();
		if (action.kind === 'undo') {
			void undoLast();
			return;
		}
		if (action.kind === 'select-all') {
			selection.selectedIds.clear();
			for (const item of library.filteredMedia) selection.selectedIds.add(item.id);
			selection.selectionAnchor = library.filteredMedia[0]?.id ?? null;
			selection.selectMode = selection.selectedIds.size > 0;
			return;
		}
		if (action.kind === 'copy') {
			ui.setClipboard([...selection.selectedIds], 'copy');
			return;
		}
		if (action.kind === 'cut') {
			ui.setClipboard([...selection.selectedIds], 'cut');
			return;
		}
		if (action.kind === 'paste') {
			void pasteClipboard();
			return;
		}
		if (action.kind === 'rename') {
			const id = [...selection.selectedIds][0];
			if (id) void renameMediaItem(id);
			return;
		}
		if (action.kind === 'delete') {
			void deleteSelected();
			return;
		}
		const ids = library.filteredMedia.map((item) => item.id);
		const currentId = selection.selectionAnchor ?? [...selection.selectedIds][0] ?? null;
		const nextId = nextGridSelectionId(ids, currentId, prefs.columns, action.key);
		if (nextId) selection.selectOnly(nextId);
	}

	function hasInternalDrag(_dt: DataTransfer | null) {
		return isInternalDragActive();
	}

	function handleSelect(id: string, event: MouseEvent) {
		selection.clickItem(
			id,
			library.filteredMedia.map((item) => item.id),
			event.shiftKey,
			event.ctrlKey || event.metaKey
		);
	}

	async function handleAlbumPickerConfirm(albumIds: string[]) {
		const ids = ui.albumPicker.mediaIds;
		ui.closeAlbumPicker();
		for (const albumId of albumIds) {
			await addMediaToAlbum(ids, albumId);
		}
	}

	function openAlbumPickerForSelection() {
		const ids = [...selection.selectedIds];
		if (!ids.length) return;
		ui.openAlbumPicker(ids);
	}

	/** Albums that every selected picker item already belongs to. */
	const albumPickerMemberIds = $derived.by(() => {
		const ids = ui.albumPicker.mediaIds;
		if (!ids.length) return new Set<string>();
		const items = loadedMedia(ids);
		if (!items.length) return new Set<string>();
		let shared = new Set(items[0].album_ids);
		for (let i = 1; i < items.length; i++) {
			const next = new Set(items[i].album_ids);
			shared = new Set([...shared].filter((id) => next.has(id)));
		}
		return shared;
	});

	async function deleteSelected() {
		if (!selection.selectedIds.size) return;
		if (library.activeAlbum === 'trash') {
			ui.openConfirmModal({
				kind: 'delete-media-forever',
				title: 'Delete forever',
				message: `Permanently delete ${selection.selectedIds.size} item(s)? This cannot be undone.`,
				confirmLabel: 'Delete forever',
				destructive: true,
				mediaIds: [...selection.selectedIds]
			});
			return;
		}
		ui.openConfirmModal({
			kind: 'delete-media',
			title: 'Move to trash',
			message: `Move ${selection.selectedIds.size} item(s) to trash? Items are deleted forever after 30 days.`,
			confirmLabel: 'Move to trash',
			destructive: true,
			mediaIds: [...selection.selectedIds]
		});
	}

	async function restoreSelected(ids?: string[], recordUndo = true) {
		const targetIds = ids ?? [...selection.selectedIds];
		if (!targetIds.length) return;
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'restore', ids: targetIds })
		});
		if (res.ok) {
			library.restoreFromTrash(parseOkMediaItems(await res.json()));
			if (recordUndo) undo.push({ kind: 'restore', ids: targetIds });
		}
		for (const mid of targetIds) selection.selectedIds.delete(mid);
		selection.selectionAnchor = null;
		await refreshAlbumsAndCounts();
	}

	async function emptyTrash() {
		if (library.trashCount === 0) return;
		await library.ensureTrashLoaded();
		const count = library.trashCount;
		ui.openConfirmModal({
			kind: 'empty-trash',
			title: 'Empty trash',
			message: `Permanently delete all ${count} item(s) in trash? Type ${count} to confirm.`,
			confirmLabel: 'Empty trash',
			destructive: true,
			mediaIds: library.trash.map((m) => m.id),
			confirmCount: count
		});
	}

	async function runDeleteMedia(ids: string[], permanent = false, recordUndo = true) {
		if (!ids.length) return;
		const res = await fetch('/api/media', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids, permanent })
		});
		const payload = res.ok ? await res.json() : null;
		for (const mid of ids) selection.selectedIds.delete(mid);
		selection.selectionAnchor = null;
		if (permanent) {
			const removed = parseIdsFromOk(payload);
			library.removeMediaIds(removed.length ? removed : ids);
		} else {
			library.moveToTrash(parseOkMediaItems(payload));
			if (recordUndo) undo.push({ kind: 'trash', ids });
		}
		await refreshAlbumsAndCounts();
	}

	async function handleConfirmModal() {
		const { kind, albumId, mediaIds } = ui.confirmModal;
		if (!kind) return;
		ui.confirmModalBusy = true;
		try {
			if (kind === 'upload-duplicates') {
				// Primary confirm = Skip duplicates (Amazon Photos–style)
				resolveUploadDuplicatePrompt(false);
				ui.closeConfirmModal();
				return;
			}
			if (kind === 'delete-album' && albumId) {
				await runDeleteAlbum(albumId);
				ui.closeConfirmModal();
				return;
			}
			if (kind === 'delete-media') {
				await runDeleteMedia(mediaIds, false);
				ui.closeConfirmModal();
				return;
			}
			if (kind === 'delete-media-forever' || kind === 'empty-trash') {
				await runDeleteMedia(mediaIds, true);
				ui.closeConfirmModal();
			}
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Request failed';
			ui.confirmModalBusy = false;
		}
	}

	function handleConfirmModalCancel() {
		if (ui.confirmModal.kind === 'upload-duplicates') {
			// Secondary action = Upload as duplicates
			resolveUploadDuplicatePrompt(true);
		}
		ui.closeConfirmModal();
	}

	function handleConfirmModalDismiss() {
		if (ui.confirmModal.kind === 'upload-duplicates') {
			resolveUploadDuplicatePrompt(null);
			ui.closeConfirmModal();
			return;
		}
		handleConfirmModalCancel();
	}

	async function handlePromptModalSubmit(value: string) {
		if (promptKind === 'import-folder') {
			await runImportFolder(value);
			return;
		}
		if (promptKind === 'watch-folder') {
			await runWatchFolder(value);
			return;
		}
		if (promptKind === 'assign-tag') {
			await assignTagByName(assignTargetIds, value, 'tag');
			ui.closePromptModal();
			return;
		}
		if (promptKind === 'assign-person') {
			await assignTagByName(assignTargetIds, value, 'person');
			ui.closePromptModal();
			return;
		}
		if (!ui.promptModal.mediaId) return;
		await runRenameMediaItem(ui.promptModal.mediaId, value);
	}

	function resolveUploadDuplicatePrompt(uploadDuplicates: boolean | null) {
		upload.resolveDuplicatePrompt(uploadDuplicates);
	}

	async function uploadFiles(fileList: FileList | File[]) {
		await upload.uploadFiles(fileList);
	}

	function clearOsFileDragOverlay() {
		osFileDrag.clear();
	}

	function dragZoneHost(target: EventTarget | null): DragZoneHost | null {
		if (target instanceof Node) {
			return target;
		}
		return null;
	}

	function onDragEnter(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			clearOsFileDragOverlay();
			return;
		}
		e.preventDefault();
		if (!e.dataTransfer?.types.includes('Files')) return;
		osFileDrag.enter(true);
	}

	function onDragOver(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			clearOsFileDragOverlay();
			return;
		}
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) return;
		osFileDrag.leave(dragZoneHost(e.currentTarget), e.relatedTarget);
	}

	async function onDrop(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			clearOsFileDragOverlay();
			return;
		}
		e.preventDefault();
		clearOsFileDragOverlay();
		if (e.dataTransfer?.files?.length) {
			await uploadFiles(e.dataTransfer.files);
		}
	}

	function onWindowDragEnd() {
		clearOsFileDragOverlay();
	}

	function onDocumentDrop() {
		clearOsFileDragOverlay();
	}

	function onContentPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const target = eventTargetHtml(e);
		if (!shouldStartMarquee(target)) return;
		const surface = e.currentTarget;
		if (!(surface instanceof HTMLElement)) return;
		e.preventDefault();
		marquee.pointerDown(e, surface);
	}

	function onContentPointerMove(e: PointerEvent) {
		const surface = e.currentTarget;
		if (!(surface instanceof HTMLElement)) return;
		marquee.pointerMove(e, surface);
	}

	function onContentPointerUp(e: PointerEvent) {
		const surface = e.currentTarget;
		if (!(surface instanceof HTMLElement)) return;
		marquee.finish(e, surface);
	}

	function onContentPointerCancel(e: PointerEvent) {
		const surface = e.currentTarget;
		marquee.cancel(e, surface instanceof HTMLElement ? surface : null);
	}
</script>

<svelte:head>
	<title>Media Organizer</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} ondragend={onWindowDragEnd} />
<svelte:document ondrop={onDocumentDrop} />

{#if firstPaintShowsProfileGate(data.activeProfile)}
	<ProfileGate
		profiles={data.profiles}
		theme={prefs.theme}
		onselect={selectProfile}
		oncreate={createProfile}
		onpasscode={openPasscodeEditor}
		ontheme={(t) => prefs.setTheme(t)}
	/>
{:else if library.activeProfile}
	<div
		class="bg-muted text-foreground flex h-screen"
		ondragenter={onDragEnter}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		role="application"
		aria-label="Media organizer"
	>
		<AlbumSidebar
			albums={library.albums}
			activeAlbum={library.activeAlbum}
			totalCount={library.totalCount}
			unassignedCount={library.unassignedCount}
			trashCount={library.trashCount}
			favoritesCount={library.favoritesCount}
			profile={library.activeProfile}
			profiles={library.profiles}
			tags={library.tags}
			onselect={selectAlbumFilter}
			oncreate={createAlbum}
			ondelete={deleteAlbum}
			onrename={renameAlbum}
			onduplicate={duplicateAlbum}
			onaddMedia={addMediaToAlbum}
			onfavoriteMedia={async (ids) => {
				await favorites.toggle(ids);
			}}
			ontrashMedia={async (ids) => {
				await runDeleteMedia(ids, false);
			}}
			oncreateTag={async (name, kind) => {
				await createTag(name, kind);
			}}
			ondeleteTag={deleteTag}
			onswitchProfile={switchProfileWithPrompt}
			oncreateProfile={createProfileWithPrompt}
			ondeleteProfile={deleteProfile}
			onhome={goHome}
			oneditPasscode={() => {
				if (library.activeProfile) openPasscodeEditor(library.activeProfile);
			}}
		/>

		<main class="flex min-h-0 min-w-0 flex-1 flex-col">
			<Toolbar
				viewMode={prefs.viewMode}
				showImages={prefs.showImages}
				showVideos={prefs.showVideos}
				dateFrom={prefs.dateFrom}
				dateTo={prefs.dateTo}
				searchQuery={prefs.searchQuery}
				sortBy={prefs.sortBy}
				sortDir={prefs.sortDir}
				columns={prefs.columns}
				selectMode={selection.selectMode}
				selectedCount={selection.selectedIds.size}
				uploading={ui.uploading}
				warnDuplicateUploads={prefs.warnDuplicateUploads}
				theme={prefs.theme}
				trashMode={library.activeAlbum === 'trash'}
				trashCount={library.trashCount}
				onviewMode={(m) => prefs.setViewMode(m)}
				onshowImages={(v) => {
					prefs.setShowImages(v);
					scheduleQueryReload();
				}}
				onshowVideos={(v) => {
					prefs.setShowVideos(v);
					scheduleQueryReload();
				}}
				ondateFrom={(v) => {
					prefs.setDateFrom(v);
					scheduleQueryReload();
				}}
				ondateTo={(v) => {
					prefs.setDateTo(v);
					scheduleQueryReload();
				}}
				onsearchQuery={(v) => {
					prefs.setSearchQuery(v);
					scheduleQueryReload();
				}}
				onsortBy={(v: MediaSortBy) => {
					prefs.setSortBy(v);
					scheduleQueryReload();
				}}
				ontoggleSortDir={() => {
					prefs.toggleSortDir();
					scheduleQueryReload();
				}}
				oncolumns={(v) => prefs.setColumns(v)}
				onwarnDuplicateUploads={(v) => prefs.setWarnDuplicateUploads(v)}
				ontoggleSelect={() => selection.toggleSelectMode()}
				onclearSelection={() => selection.clear()}
				onopenAlbumPicker={openAlbumPickerForSelection}
				ondelete={deleteSelected}
				onrestore={() => restoreSelected()}
				onemptyTrash={emptyTrash}
				onuploadClick={() => ui.fileInput?.click()}
				onfolderClick={pickFolder}
				onexport={exportCurrent}
				onfavorite={toggleFavoriteSelected}
				onhealth={showLibraryHealth}
				ontheme={(t) => prefs.setTheme(t)}
			/>

			{#if ui.errorMessage}
				<div class="mx-4 mt-3">
					<Alert.Root variant="destructive">
						<Alert.Description>{ui.errorMessage}</Alert.Description>
						<Alert.Action>
							<Button variant="ghost" size="xs" onclick={() => (ui.errorMessage = '')}
								>Dismiss</Button
							>
						</Alert.Action>
					</Alert.Root>
				</div>
			{:else if ui.convertResultMessage}
				<div class="mx-4 mt-3">
					<Alert.Root>
						<Alert.Description>{ui.convertResultMessage}</Alert.Description>
						<Alert.Action>
							<Button variant="ghost" size="xs" onclick={() => (ui.convertResultMessage = '')}
								>Dismiss</Button
							>
						</Alert.Action>
					</Alert.Root>
				</div>
			{/if}

			<ScrollArea class="relative min-h-0 flex-1" bind:viewportRef={selection.contentEl}>
				<div
					bind:this={selectionSurface}
					class="relative box-border min-h-full w-full p-4"
					class:select-none={selection.selecting}
					role="region"
					aria-label="Media library"
					onpointerdown={onContentPointerDown}
					onpointermove={onContentPointerMove}
					onpointerup={onContentPointerUp}
					onpointercancel={onContentPointerCancel}
					oncontextmenu={openEmptyContextMenu}
				>
					{#if library.activeAlbum === 'map'}
						<MediaMap
							items={library.filteredMedia}
							selectedIds={selection.selectedIds}
							onselect={handleSelect}
							onopen={openMedia}
						/>
					{:else if library.filteredMedia.length === 0}
						<div
							class="text-muted-foreground flex h-full min-h-64 flex-col items-center justify-center text-center"
						>
							<p class="text-foreground/80 text-lg font-medium">
								{emptyLibraryHeadline(prefs.searchQuery, library.activeAlbum)}
							</p>
							<p class="mt-1 max-w-sm text-sm">
								{emptyLibraryDetail(prefs.searchQuery, library.activeAlbum)}
							</p>
						</div>
					{:else if prefs.viewMode === 'grid'}
						<MediaGrid
							items={library.filteredMedia}
							selectedIds={selection.selectedIds}
							selectMode={selection.selectMode}
							columns={prefs.columns}
							onselect={handleSelect}
							onopen={openMedia}
							oncontextmenu={openMediaContextMenu}
							onfavorite={(id, favorite) => setFavorite([id], favorite)}
						/>
					{:else}
						<MediaCollage
							items={library.filteredMedia}
							selectedIds={selection.selectedIds}
							selectMode={selection.selectMode}
							columns={prefs.columns}
							onselect={handleSelect}
							onopen={openMedia}
							oncontextmenu={openMediaContextMenu}
							onfavorite={(id, favorite) => setFavorite([id], favorite)}
						/>
					{/if}

					{#if selection.selectionRect && selection.selecting}
						<div
							class="border-primary bg-primary/15 pointer-events-none absolute z-20 border"
							style:left="{selection.selectionRect.x}px"
							style:top="{selection.selectionRect.y}px"
							style:width="{selection.selectionRect.w}px"
							style:height="{selection.selectionRect.h}px"
						></div>
					{/if}
				</div>
			</ScrollArea>
		</main>

		{#if ui.dragOver}
			<div
				class="bg-primary/20 pointer-events-none fixed inset-0 z-40 flex items-center justify-center backdrop-blur-[2px]"
				transition:fade={{ duration: 120 }}
			>
				<div
					class="border-primary bg-background/90 rounded-2xl border-2 border-dashed px-10 py-8 text-center shadow-xl"
				>
					<p class="text-primary text-xl font-semibold">Drop to upload</p>
					<p class="text-muted-foreground mt-1 text-sm">Images and videos</p>
				</div>
			</div>
		{/if}
	</div>

	<input
		{@attach ui.attachFileInput}
		type="file"
		accept="image/*,video/*,.mp4,.m4v,.mov,.webm,.mkv"
		multiple
		class="hidden"
		onchange={(e) => {
			const files = e.currentTarget.files;
			if (files?.length) void uploadFiles(files);
			e.currentTarget.value = '';
		}}
	/>

	<input
		{@attach attachFolderInput}
		type="file"
		accept="image/*,video/*,.mp4,.m4v,.mov,.webm,.mkv"
		multiple
		webkitdirectory
		class="hidden"
		onchange={(e) => {
			const files = e.currentTarget.files;
			if (files?.length) void uploadFiles(files);
			e.currentTarget.value = '';
		}}
	/>

	{#if ui.preview}
		<MediaLightbox
			item={ui.preview}
			items={library.filteredMedia}
			onclose={() => (ui.preview = null)}
			onnavigate={(next) => (ui.preview = next)}
			onview={applyRecordedView}
			onrotate={rotatePreview}
			onfavorite={(id, favorite) => setFavorite([id], favorite)}
			oncrop={cropPreview}
		/>
	{/if}

	<ContextMenu
		open={ui.contextMenu.open}
		x={ui.contextMenu.x}
		y={ui.contextMenu.y}
		items={contextMenuItems}
		onselect={handleContextSelect}
		onclose={() => ui.closeContextMenu()}
	/>

	<ConfirmModal
		open={ui.confirmModal.open}
		title={ui.confirmModal.title}
		message={ui.confirmModal.message}
		confirmLabel={ui.confirmModal.confirmLabel}
		cancelLabel={ui.confirmModal.cancelLabel}
		destructive={ui.confirmModal.destructive}
		busy={ui.confirmModalBusy}
		confirmCount={ui.confirmModal.confirmCount}
		oncancel={handleConfirmModalCancel}
		ondismiss={handleConfirmModalDismiss}
		onconfirm={handleConfirmModal}
	/>

	<PromptModal
		open={ui.promptModal.open}
		title={ui.promptModal.title}
		label={ui.promptModal.label}
		initialValue={ui.promptModal.initialValue}
		busy={ui.promptModalBusy}
		errorMessage={ui.promptModalError}
		oncancel={() => ui.closePromptModal()}
		onsubmit={handlePromptModalSubmit}
	/>

	<AlbumPickerModal
		open={ui.albumPicker.open}
		albums={library.albums}
		memberAlbumIds={albumPickerMemberIds}
		oncancel={() => ui.closeAlbumPicker()}
		onconfirm={handleAlbumPickerConfirm}
	/>
{/if}

<PasscodeModal
	open={ui.profileModal.open}
	mode={ui.profileModal.mode}
	profileName={ui.profileModal.mode === 'create'
		? ui.profileModal.prefillName
		: ui.profileModal.profileName}
	mediaCount={ui.profileModal.mediaCount}
	requiresPasscode={ui.profileModal.requiresPasscode}
	busy={ui.profileModalBusy}
	errorMessage={ui.profileModalError}
	oncancel={() => ui.closeProfileModal()}
	onsubmit={handleProfileModalSubmit}
/>

<TransferPanel />
