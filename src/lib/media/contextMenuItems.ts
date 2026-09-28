import type { LibraryAlbumFilter } from '$lib/types';
import { isSpecialLibraryFilter, parseTagFilterId } from '$lib/media/libraryNav';
import { favoriteMenuLabel } from '$lib/media/libraryUi';

export type ContextMenuItem = {
	id: string;
	label: string;
	disabled?: boolean;
	danger?: boolean;
	separator?: boolean;
	children?: ContextMenuItem[];
};

export type ContextMenuBuildInput = {
	kind: 'media' | 'empty';
	mediaIds: readonly string[];
	activeAlbum: LibraryAlbumFilter;
	trashCount: number;
	hasClipboard: boolean;
	favoriteItems: ReadonlyArray<{ favorite?: boolean; media_type?: string }>;
};

function optimizeMenuItem(items: ContextMenuBuildInput['favoriteItems']): ContextMenuItem[] {
	const videos = items.filter((item) => item.media_type === 'video').length;
	if (!videos) return [];
	return [
		{
			id: 'optimize-playback',
			label: videos > 1 ? `Optimize ${videos} videos for playback` : 'Optimize for playback'
		}
	];
}

export function buildContextMenuItems(input: ContextMenuBuildInput): ContextMenuItem[] {
	if (input.kind === 'empty') {
		if (input.activeAlbum === 'trash') {
			return [
				{
					id: 'empty-trash',
					label: 'Empty trash',
					danger: true,
					disabled: input.trashCount === 0
				}
			];
		}
		return [
			{
				id: 'paste',
				label: 'Paste',
				disabled: !input.hasClipboard
			},
			{ id: 'upload', label: 'Upload…' },
			{ id: 'pick-folder', label: 'Pick folder…' },
			{ id: 'import-folder', label: 'Import folder by path…' },
			{ id: 'watch-folder', label: 'Watch folder…' },
			{ id: 'library-health', label: 'Library health' }
		];
	}

	const count = input.mediaIds.length;
	const single = count === 1;

	if (input.activeAlbum === 'trash') {
		return [
			{ id: 'restore', label: count > 1 ? `Restore ${count}` : 'Restore' },
			{ id: 'download', label: count > 1 ? `Download ${count}` : 'Download' },
			{ id: 'sep-1', label: '', separator: true },
			{
				id: 'delete-forever',
				label: count > 1 ? `Delete ${count} forever` : 'Delete forever',
				danger: true
			}
		];
	}

	const items: ContextMenuItem[] = [
		{ id: 'copy', label: count > 1 ? `Copy ${count} items` : 'Copy' },
		{ id: 'cut', label: count > 1 ? `Cut ${count} items` : 'Cut' },
		{ id: 'duplicate', label: count > 1 ? `Duplicate ${count}` : 'Duplicate' },
		{ id: 'add-to-album', label: 'Add to album…' }
	];
	if (!isSpecialLibraryFilter(input.activeAlbum) && input.activeAlbum !== null) {
		items.push({ id: 'remove-from-album', label: 'Remove from album' });
	}
	if (parseTagFilterId(input.activeAlbum)) {
		items.push({ id: 'remove-tag', label: 'Remove tag' });
	}
	items.push(
		{ id: 'copy-name', label: single ? 'Copy name' : 'Copy names' },
		{ id: 'rename', label: 'Rename', disabled: !single },
		{
			id: 'favorite',
			label: favoriteMenuLabel(input.favoriteItems)
		},
		{ id: 'assign-tag', label: 'Add tag…' },
		{ id: 'assign-person', label: 'Add person…' },
		{ id: 'download', label: count > 1 ? `Download ${count}` : 'Download' },
		{ id: 'export-zip', label: 'Export zip' },
		...optimizeMenuItem(input.favoriteItems),
		{ id: 'sep-1', label: '', separator: true },
		{ id: 'delete', label: 'Move to trash', danger: true }
	);
	return items;
}
