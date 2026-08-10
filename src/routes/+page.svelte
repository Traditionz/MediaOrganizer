<script lang="ts">
	import type { PageData } from './$types';
	import type { MediaItem } from '$lib/types';
	import {
		isSupportedMediaFile,
		probeImageDimensions,
		probeVideoDimensions,
		captureVideoThumbnail,
		isVideoFile,
		uploadMediaFile,
		uploadVideoThumbnail,
		mapWithConcurrency,
		UPLOAD_CONCURRENCY
	} from '$lib/utils';
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
	import ContextMenu, { type ContextMenuItem } from '$lib/components/ContextMenu.svelte';
	import { isInternalDragActive } from '$lib/dragSession';
	import { fade } from 'svelte/transition';
	import { createAppState, setAppState } from '$lib/state';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const app = setAppState(createAppState());
	const { prefs, library, selection, ui } = app;

	let av1EnqueuedForProfile: string | null = null;

	$effect(() => {
		library.sync({
			albums: data.albums,
			media: data.media,
			totalCount: data.totalCount,
			profiles: data.profiles,
			activeProfile: data.activeProfile
		});
		const profileId = data.activeProfile?.id ?? null;
		if (profileId && profileId !== av1EnqueuedForProfile) {
			av1EnqueuedForProfile = profileId;
			void fetch('/api/media', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'compress-all-videos' })
			}).catch(() => {
				/* background AV1 backfill */
			});
		}
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

	function openDeleteProfileModal(id: string) {
		const target = library.profiles.find((p) => p.id === id) ?? library.activeProfile;
		if (!target || target.id !== id) return;
		ui.profileModalError = '';
		ui.profileModal = {
			open: true,
			mode: 'delete',
			profileId: id,
			profileName: target.name,
			requiresPasscode: false,
			mediaCount: id === library.activeProfile?.id ? library.totalCount : 0,
			prefillName: ''
		};
	}

	async function handleProfileModalSubmit(payload: {
		name?: string;
		passcode: string;
		confirmPasscode: string;
		usePasscode: boolean;
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
					const body = await res.json().catch(() => ({}));
					throw new Error(body.message || 'Failed to delete profile');
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
		openDeleteProfileModal(id);
	}

	async function createAlbum(name: string) {
		const res = await fetch('/api/albums', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to create album';
			throw new Error(ui.errorMessage);
		}
		await library.refresh();
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
		await fetch('/api/albums', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (library.activeAlbum === id) library.setActiveAlbum('all');
		await library.refresh();
	}

	async function renameAlbum(id: string, name: string) {
		const res = await fetch('/api/albums', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to rename album';
			throw new Error(ui.errorMessage);
		}
		await library.refresh();
	}

	async function duplicateAlbum(id: string) {
		const res = await fetch('/api/albums', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to duplicate album';
			return;
		}
		await library.refresh();
	}

	async function addMediaToAlbum(ids: string[], albumId: string) {
		if (!ids.length || !albumId) return;
		await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'add-to-album', ids, albumId })
		});
		selection.selectedIds.clear();
		selection.selectionAnchor = null;
		await library.refresh();
	}

	async function removeMediaFromAlbum(ids: string[], albumId: string) {
		if (!ids.length || !albumId) return;
		await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'remove-from-album', ids, albumId })
		});
		selection.selectedIds.clear();
		selection.selectionAnchor = null;
		await library.refresh();
	}

	async function duplicateMedia(ids: string[], albumId: string | null = library.pasteTargetAlbumId()) {
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
		await library.refresh();
	}

	async function renameMediaItem(id: string) {
		const item = library.media.find((m) => m.id === id);
		if (!item) return;
		ui.openRenamePrompt(id, item.original_name);
	}

	async function runRenameMediaItem(id: string, name: string) {
		const item = library.media.find((m) => m.id === id);
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
			ui.closePromptModal();
			await library.refresh();
		} catch (err) {
			ui.promptModalError = err instanceof Error ? err.message : 'Failed to rename media';
			ui.promptModalBusy = false;
		}
	}

	async function copyMediaNames(ids: string[]) {
		const names = ids
			.map((id) => library.media.find((m) => m.id === id)?.original_name)
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

	async function compressMediaIds(ids: string[]) {
		if (!ids.length) return;
		ui.errorMessage = '';
		ui.uploading = true;
		ui.uploadProgress = 0;
		try {
			const res = await fetch('/api/media', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'compress', ids })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Compress failed');
			}
			ui.uploadProgress = 100;
			await library.refresh();
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Compress failed';
		} finally {
			ui.uploading = false;
			ui.uploadProgress = null;
		}
	}

	const contextMenuItems = $derived.by((): ContextMenuItem[] => {
		if (ui.contextMenu.kind === 'empty') {
			return [
				{
					id: 'paste',
					label: 'Paste',
					disabled: !ui.clipboard?.ids.length
				},
				{ id: 'upload', label: 'Upload…' }
			];
		}

		const count = ui.contextMenu.mediaIds.length;
		const single = count === 1;
		return [
			{ id: 'copy', label: count > 1 ? `Copy ${count} items` : 'Copy' },
			{ id: 'cut', label: count > 1 ? `Cut ${count} items` : 'Cut' },
			{ id: 'duplicate', label: count > 1 ? `Duplicate ${count}` : 'Duplicate' },
			{ id: 'add-to-album', label: 'Add to album…' },
			...(typeof library.activeAlbum === 'string' && library.activeAlbum !== 'all'
				? [{ id: 'remove-from-album', label: 'Remove from album' } as ContextMenuItem]
				: []),
			{ id: 'copy-name', label: single ? 'Copy name' : 'Copy names' },
			{ id: 'rename', label: 'Rename', disabled: !single },
			{ id: 'download', label: count > 1 ? `Download ${count}` : 'Download' },
			{
				id: 'compress',
				label: count > 1 ? `Compress ${count} (AV1/AVIF)` : 'Compress (AV1/AVIF)'
			},
			{ id: 'sep-1', label: '', separator: true },
			{ id: 'delete', label: 'Delete', danger: true }
		];
	});

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
		const target = e.target as HTMLElement;
		if (target.closest('.media-card')) return;
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
		if (id === 'compress') {
			await compressMediaIds(ids);
			return;
		}
		if (id === 'delete') {
			if (!ids.length) return;
			ui.openConfirmModal({
				kind: 'delete-media',
				title: 'Delete media',
				message: `Delete ${ids.length} item(s)?`,
				confirmLabel: 'Delete',
				destructive: true,
				mediaIds: ids
			});
			return;
		}
		if (id === 'upload') {
			ui.fileInput?.click();
			return;
		}
		if (id === 'remove-from-album') {
			if (typeof library.activeAlbum === 'string' && library.activeAlbum !== 'all') {
				await removeMediaFromAlbum(ids, library.activeAlbum);
			}
			return;
		}
		if (id === 'add-to-album') {
			if (ids.length) ui.openAlbumPicker(ids);
		}
	}

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
			return;
		}
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();

		if (mod && key === 'c' && selection.selectedIds.size > 0) {
			e.preventDefault();
			ui.setClipboard([...selection.selectedIds], 'copy');
			return;
		}
		if (mod && key === 'x' && selection.selectedIds.size > 0) {
			e.preventDefault();
			ui.setClipboard([...selection.selectedIds], 'cut');
			return;
		}
		if (mod && key === 'v' && ui.clipboard?.ids.length) {
			e.preventDefault();
			pasteClipboard();
			return;
		}
		if (e.key === 'F2' && selection.selectedIds.size === 1) {
			e.preventDefault();
			renameMediaItem([...selection.selectedIds][0]);
			return;
		}
		if (e.key === 'Delete' && selection.selectedIds.size > 0) {
			e.preventDefault();
			deleteSelected();
		}
	}

	function hasInternalDrag(_dt: DataTransfer | null) {
		return isInternalDragActive();
	}

	function handleSelect(id: string, event: MouseEvent) {
		if (event.shiftKey && selection.selectionAnchor) {
			const ids = library.filteredMedia.map((m) => m.id);
			const lastIdx = ids.indexOf(selection.selectionAnchor);
			const curIdx = ids.indexOf(id);
			if (lastIdx >= 0 && curIdx >= 0) {
				if (!(event.ctrlKey || event.metaKey)) selection.selectedIds.clear();
				const [a, b] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
				for (let i = a; i <= b; i++) selection.selectedIds.add(ids[i]);
			} else {
				selection.selectedIds.add(id);
				selection.selectionAnchor = id;
			}
		} else if (event.ctrlKey || event.metaKey) {
			if (selection.selectedIds.has(id)) selection.selectedIds.delete(id);
			else selection.selectedIds.add(id);
			selection.selectionAnchor = id;
		} else {
			selection.selectOnly(id);
		}
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
		const items = ids
			.map((id) => library.media.find((m) => m.id === id))
			.filter((m): m is NonNullable<typeof m> => Boolean(m));
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
		ui.openConfirmModal({
			kind: 'delete-media',
			title: 'Delete media',
			message: `Delete ${selection.selectedIds.size} item(s)?`,
			confirmLabel: 'Delete',
			destructive: true,
			mediaIds: [...selection.selectedIds]
		});
	}

	async function runDeleteMedia(ids: string[]) {
		if (!ids.length) return;
		await fetch('/api/media', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids })
		});
		for (const mid of ids) selection.selectedIds.delete(mid);
		selection.selectionAnchor = null;
		await library.refresh();
	}

	async function handleConfirmModal() {
		const { kind, albumId, mediaIds } = ui.confirmModal;
		if (!kind) return;
		ui.confirmModalBusy = true;
		try {
			if (kind === 'delete-album' && albumId) {
				await runDeleteAlbum(albumId);
				ui.closeConfirmModal();
				return;
			}
			if (kind === 'delete-media') {
				await runDeleteMedia(mediaIds);
				ui.closeConfirmModal();
			}
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Request failed';
			ui.confirmModalBusy = false;
		}
	}

	async function handlePromptModalSubmit(value: string) {
		if (!ui.promptModal.mediaId) return;
		await runRenameMediaItem(ui.promptModal.mediaId, value);
	}

	async function uploadFiles(fileList: FileList | File[]) {
		const files = [...fileList].filter(isSupportedMediaFile);
		if (!files.length) {
			ui.errorMessage = 'Only image and video files are supported.';
			return;
		}

		ui.uploading = true;
		ui.uploadProgress = 0;
		ui.errorMessage = '';

		const albumId = library.activeAlbum === 'all' || library.activeAlbum === null ? null : library.activeAlbum;
		const fileProgress = files.map(() => 0);
		const errors: string[] = [];

		const bumpProgress = () => {
			const sum = fileProgress.reduce((a, b) => a + b, 0);
			ui.uploadProgress = Math.round((sum / files.length) * 100);
		};

		try {
			await mapWithConcurrency(files, UPLOAD_CONCURRENCY, async (file, i) => {
				try {
					const dims =
						(await probeImageDimensions(file)) ?? (await probeVideoDimensions(file));
					const uploaded = await uploadMediaFile(file, {
						albumId,
						width: dims?.width ?? null,
						height: dims?.height ?? null,
						compress: prefs.compressOnUpload,
						onProgress: (pct) => {
							// Reserve last 5% for thumbnail work on videos
							const weight = isVideoFile(file) ? 0.95 : 1;
							fileProgress[i] = (pct / 100) * weight;
							bumpProgress();
						}
					});

					if (isVideoFile(file) && uploaded?.id) {
						const thumb = await captureVideoThumbnail(file);
						if (thumb) await uploadVideoThumbnail(uploaded.id, thumb);
					}
					fileProgress[i] = 1;
					bumpProgress();
				} catch (err) {
					fileProgress[i] = 1;
					bumpProgress();
					errors.push(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
				}
			});

			ui.uploadProgress = 100;
			await library.refresh();
			if (errors.length) {
				ui.errorMessage =
					errors.length === 1
						? errors[0]
						: `${errors.length} of ${files.length} uploads failed: ${errors[0]}`;
			}
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			ui.uploading = false;
			ui.uploadProgress = null;
		}
	}

	function onDragEnter(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			ui.dragOver = false;
			return;
		}
		e.preventDefault();
		if (e.dataTransfer?.types.includes('Files')) ui.dragOver = true;
	}

	function onDragOver(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			ui.dragOver = false;
			return;
		}
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave(e: DragEvent) {
		if (e.currentTarget === e.target) ui.dragOver = false;
	}

	async function onDrop(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			ui.dragOver = false;
			return;
		}
		e.preventDefault();
		ui.dragOver = false;
		if (e.dataTransfer?.files?.length) {
			await uploadFiles(e.dataTransfer.files);
		}
	}

	function onContentPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (target.closest('.media-card')) return;
		if (!selection.contentEl) return;

		const rect = selection.contentEl.getBoundingClientRect();
		const x = e.clientX - rect.left + selection.contentEl.scrollLeft;
		const y = e.clientY - rect.top + selection.contentEl.scrollTop;
		selection.selecting = true;
		selection.selStart = { x, y };
		selection.selCurrent = { x, y };
		selection.contentEl.setPointerCapture(e.pointerId);
	}

	function onContentPointerMove(e: PointerEvent) {
		if (!selection.selecting || !selection.contentEl) return;
		const rect = selection.contentEl.getBoundingClientRect();
		selection.selCurrent = {
			x: e.clientX - rect.left + selection.contentEl.scrollLeft,
			y: e.clientY - rect.top + selection.contentEl.scrollTop
		};
	}

	function onContentPointerUp(e: PointerEvent) {
		if (!selection.selecting || !selection.contentEl) return;

		const box = {
			x: Math.min(selection.selStart.x, selection.selCurrent.x),
			y: Math.min(selection.selStart.y, selection.selCurrent.y),
			w: Math.abs(selection.selCurrent.x - selection.selStart.x),
			h: Math.abs(selection.selCurrent.y - selection.selStart.y)
		};

		selection.selecting = false;
		try {
			selection.contentEl.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}

		// Tiny movement = empty click → clear selection (unless ctrl additive)
		if (box.w < 4 || box.h < 4) {
			if (!(e.ctrlKey || e.metaKey)) {
				selection.selectedIds.clear();
				selection.selectionAnchor = null;
			}
			return;
		}

		const cards = selection.contentEl.querySelectorAll<HTMLElement>('.media-card');
		const contentRect = selection.contentEl.getBoundingClientRect();
		if (!(e.ctrlKey || e.metaKey)) selection.selectedIds.clear();

		let hitCount = 0;
		for (const card of cards) {
			const r = card.getBoundingClientRect();
			const cx = r.left - contentRect.left + selection.contentEl.scrollLeft;
			const cy = r.top - contentRect.top + selection.contentEl.scrollTop;
			const intersects =
				cx < box.x + box.w &&
				cx + r.width > box.x &&
				cy < box.y + box.h &&
				cy + r.height > box.y;
			if (intersects) {
				const id = card.dataset.id;
				if (id) {
					selection.selectedIds.add(id);
					hitCount++;
					if (!selection.selectionAnchor) selection.selectionAnchor = id;
				}
			}
		}

		if (hitCount > 0) selection.selectMode = true;
	}
</script>

<svelte:head>
	<title>Media Organizer</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

{#if !library.activeProfile}
	<ProfileGate profiles={library.profiles} onselect={selectProfile} oncreate={createProfile} />
{:else}
	<div
		class="flex h-screen bg-base-200 text-base-content"
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
			profile={library.activeProfile}
			profiles={library.profiles}
			onselect={(id) => app.selectAlbum(id)}
			oncreate={createAlbum}
			ondelete={deleteAlbum}
			onrename={renameAlbum}
			onduplicate={duplicateAlbum}
			onaddMedia={addMediaToAlbum}
			onswitchProfile={switchProfileWithPrompt}
			oncreateProfile={createProfileWithPrompt}
			ondeleteProfile={deleteProfile}
		/>

		<main class="flex min-w-0 flex-1 flex-col">
			<Toolbar
				viewMode={prefs.viewMode}
				showImages={prefs.showImages}
				showVideos={prefs.showVideos}
				dateFrom={prefs.dateFrom}
				dateTo={prefs.dateTo}
				searchQuery={prefs.searchQuery}
				columns={prefs.columns}
				selectMode={selection.selectMode}
				selectedCount={selection.selectedIds.size}
				uploading={ui.uploading}
				compressOnUpload={prefs.compressOnUpload}
				theme={prefs.theme}
				onviewMode={(m) => prefs.setViewMode(m)}
				onshowImages={(v) => prefs.setShowImages(v)}
				onshowVideos={(v) => prefs.setShowVideos(v)}
				ondateFrom={(v) => prefs.setDateFrom(v)}
				ondateTo={(v) => prefs.setDateTo(v)}
				onsearchQuery={(v) => prefs.setSearchQuery(v)}
				oncolumns={(v) => prefs.setColumns(v)}
				oncompressOnUpload={(v) => prefs.setCompressOnUpload(v)}
				ontoggleSelect={() => selection.toggleSelectMode()}
				onclearSelection={() => selection.clear()}
				onopenAlbumPicker={openAlbumPickerForSelection}
				oncompress={() => compressMediaIds([...selection.selectedIds])}
				ondelete={deleteSelected}
				onuploadClick={() => ui.fileInput?.click()}
				ontheme={(t) => prefs.setTheme(t)}
			/>

			{#if ui.errorMessage}
				<div class="alert alert-error mx-4 mt-3 py-2 text-sm" role="alert">
					<span>{ui.errorMessage}</span>
					<button class="btn btn-ghost btn-xs" onclick={() => (ui.errorMessage = '')}>Dismiss</button>
				</div>
			{:else if ui.convertResultMessage}
				<div class="alert alert-success mx-4 mt-3 py-2 text-sm" role="status">
					<span>{ui.convertResultMessage}</span>
					<button class="btn btn-ghost btn-xs" onclick={() => (ui.convertResultMessage = '')}>Dismiss</button>
				</div>
			{:else if ui.uploading && ui.uploadProgress != null}
				<div class="alert alert-info mx-4 mt-3 py-2 text-sm" role="status">
					<span>Uploading… {ui.uploadProgress}%</span>
				</div>
			{/if}

			<div
				{@attach selection.attachContentEl}
				class="media-scroll relative flex-1 overflow-auto p-4"
				role="region"
				aria-label="Media library"
				onpointerdown={onContentPointerDown}
				onpointermove={onContentPointerMove}
				onpointerup={onContentPointerUp}
				oncontextmenu={openEmptyContextMenu}
			>
				{#if library.filteredMedia.length === 0}
					<div class="flex h-full min-h-64 flex-col items-center justify-center text-center text-base-content/60">
						<p class="text-lg font-medium text-base-content/80">
							{prefs.searchQuery.trim()
								? 'No matching media'
								: library.activeAlbum === null
									? 'No unassigned media'
									: 'No media yet'}
						</p>
						<p class="mt-1 max-w-sm text-sm">
							{#if prefs.searchQuery.trim()}
								Try a different search, or clear the search box.
							{:else if library.activeAlbum === null}
								Upload files here, or remove items from albums to see them in Unassigned.
							{:else}
								Drag and drop pictures or videos here, or use Upload. Double-click an item to expand it.
							{/if}
						</p>
					</div>
				{:else if prefs.viewMode === 'grid'}
					<MediaGrid
						items={library.filteredMedia}
						selectedIds={selection.selectedIds}
						selectMode={selection.selectMode}
						columns={prefs.columns}
						onselect={handleSelect}
						onopen={(item) => (ui.preview = item)}
						oncontextmenu={openMediaContextMenu}
					/>
				{:else}
					<MediaCollage
						items={library.filteredMedia}
						selectedIds={selection.selectedIds}
						selectMode={selection.selectMode}
						columns={prefs.columns}
						onselect={handleSelect}
						onopen={(item) => (ui.preview = item)}
						oncontextmenu={openMediaContextMenu}
					/>
				{/if}

				{#if selection.selectionRect && selection.selecting}
					<div
						class="pointer-events-none absolute z-20 border border-primary bg-primary/15"
						style:left="{selection.selectionRect.x}px"
						style:top="{selection.selectionRect.y}px"
						style:width="{selection.selectionRect.w}px"
						style:height="{selection.selectionRect.h}px"
					></div>
				{/if}
			</div>
		</main>

		{#if ui.dragOver}
			<div
				class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-primary/20 backdrop-blur-[2px]"
				transition:fade={{ duration: 120 }}
			>
				<div class="rounded-2xl border-2 border-dashed border-primary bg-base-100/90 px-10 py-8 text-center shadow-xl">
					<p class="text-xl font-semibold text-primary">Drop to upload</p>
					<p class="mt-1 text-sm text-base-content/60">Images and videos</p>
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
			if (files?.length) uploadFiles(files);
			e.currentTarget.value = '';
		}}
	/>

	{#if ui.preview}
		{#key ui.preview.id}
			<MediaLightbox item={ui.preview} onclose={() => (ui.preview = null)} />
		{/key}
	{/if}

	<ContextMenu
		open={ui.contextMenu.open}
		x={ui.contextMenu.x}
		y={ui.contextMenu.y}
		items={contextMenuItems}
		onselect={handleContextSelect}
		onclose={() => ui.closeContextMenu()}
	/>

	<PasscodeModal
		open={ui.profileModal.open}
		mode={ui.profileModal.mode}
		profileName={ui.profileModal.mode === 'create' ? ui.profileModal.prefillName : ui.profileModal.profileName}
		mediaCount={ui.profileModal.mediaCount}
		requiresPasscode={ui.profileModal.requiresPasscode}
		busy={ui.profileModalBusy}
		errorMessage={ui.profileModalError}
		oncancel={() => ui.closeProfileModal()}
		onsubmit={handleProfileModalSubmit}
	/>

	<ConfirmModal
		open={ui.confirmModal.open}
		title={ui.confirmModal.title}
		message={ui.confirmModal.message}
		confirmLabel={ui.confirmModal.confirmLabel}
		destructive={ui.confirmModal.destructive}
		busy={ui.confirmModalBusy}
		oncancel={() => ui.closeConfirmModal()}
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
