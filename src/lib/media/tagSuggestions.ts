import type { MediaItem, Tag, TagKind } from '$lib/types';

export type TagEnterAction = { type: 'pick'; tag: Tag } | { type: 'create'; name: string } | null;

function sameName(a: string, b: string): boolean {
	return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** Tag ids that every given item already carries. */
export function sharedTagIds(items: readonly Pick<MediaItem, 'tags'>[]): Set<string> {
	if (!items.length) return new Set();
	let shared = new Set((items[0].tags ?? []).map((tag) => tag.id));
	for (let i = 1; i < items.length; i++) {
		const next = new Set((items[i].tags ?? []).map((tag) => tag.id));
		shared = new Set([...shared].filter((id) => next.has(id)));
	}
	return shared;
}

/** Most used tags first, then A to Z. Hides tags the media already has. */
export function rankTagSuggestions(
	tags: readonly Tag[],
	options: { kind?: TagKind; query?: string; excludeIds?: ReadonlySet<string> } = {}
): Tag[] {
	const kind = options.kind ?? 'tag';
	const query = (options.query ?? '').trim().toLocaleLowerCase();
	const exclude = options.excludeIds;
	return tags
		.filter((tag) => tag.kind === kind)
		.filter((tag) => !exclude?.has(tag.id))
		.filter((tag) => !query || tag.name.toLocaleLowerCase().includes(query))
		.sort(
			(a, b) =>
				(b.media_count ?? 0) - (a.media_count ?? 0) ||
				a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
}

/** True when the typed text is a new name, not an existing tag. */
export function canCreateTag(tags: readonly Tag[], query: string, kind: TagKind = 'tag'): boolean {
	const trimmed = query.trim();
	if (!trimmed) return false;
	return !tags.some((tag) => tag.kind === kind && sameName(tag.name, trimmed));
}

/** What Enter does: exact match wins, then create the typed name, then the top suggestion. */
export function tagEnterAction(
	tags: readonly Tag[],
	query: string,
	options: { kind?: TagKind; excludeIds?: ReadonlySet<string> } = {}
): TagEnterAction {
	const kind = options.kind ?? 'tag';
	const trimmed = query.trim();
	const ranked = rankTagSuggestions(tags, { kind, query, excludeIds: options.excludeIds });
	if (trimmed) {
		const exact = ranked.find((tag) => sameName(tag.name, trimmed));
		if (exact) return { type: 'pick', tag: exact };
		if (canCreateTag(tags, trimmed, kind)) return { type: 'create', name: trimmed };
	}
	const first = ranked[0];
	return first ? { type: 'pick', tag: first } : null;
}
