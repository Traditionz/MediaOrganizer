import { asString, parseJsonText } from '$lib/parse';

export const MEDIA_IDS_MIME = 'application/x-media-ids';

export type SidebarMediaDropTarget = 'favorites' | 'trash' | 'album';

export type DropEffect = 'copy' | 'move';

/** Favorites + Trash sit in their own droppable sidebar group. */
export const QUICK_ACTION_DROP_TARGETS = ['favorites', 'trash'] as const;

export function isQuickActionDropTarget(target: string): target is 'favorites' | 'trash' {
	return target === 'favorites' || target === 'trash';
}

export function dropEffectForTarget(target: string): DropEffect {
	return target === 'trash' ? 'move' : 'copy';
}

export function classifySidebarDropTarget(target: string): SidebarMediaDropTarget {
	if (target === 'favorites') return 'favorites';
	if (target === 'trash') return 'trash';
	return 'album';
}

export function parseMediaIdList(raw: string): string[] {
	try {
		const parsed = parseJsonText(raw);
		if (!Array.isArray(parsed)) return [];
		const ids: string[] = [];
		for (const item of parsed) {
			const id = asString(item);
			if (id) ids.push(id);
		}
		return ids;
	} catch {
		return [];
	}
}

export function parsePlainMediaIds(plain: string): string[] {
	if (!plain.startsWith('media:')) return [];
	return plain
		.slice('media:'.length)
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * Resolve media IDs from an internal drag session and/or DataTransfer payloads.
 * Prefers session IDs (reliable during HTML5 drag), then custom MIME, then text/plain.
 */
export function resolveMediaIdsFromDrop(
	sessionIds: string[] | null | undefined,
	getData: ((type: string) => string) | null | undefined
): string[] {
	const fromSession = (sessionIds ?? []).filter((id) => id.length > 0);
	if (fromSession.length) return fromSession;
	if (!getData) return [];
	const fromMime = parseMediaIdList(getData(MEDIA_IDS_MIME));
	if (fromMime.length) return fromMime;
	return parsePlainMediaIds(getData('text/plain'));
}
