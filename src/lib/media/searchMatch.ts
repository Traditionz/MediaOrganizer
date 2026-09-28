export type SearchableMedia = {
	original_name: string;
	album_names: string[];
	camera_make?: string | null;
	camera_model?: string | null;
	tags?: Array<{ name: string }>;
};

export function mediaSearchHaystack(item: SearchableMedia): string {
	const parts = [item.original_name, ...item.album_names];
	if (item.camera_make) parts.push(item.camera_make);
	if (item.camera_model) parts.push(item.camera_model);
	if (item.tags) {
		for (const tag of item.tags) parts.push(tag.name);
	}
	return parts.join('\n').toLowerCase();
}

export function mediaMatchesSearch(item: SearchableMedia, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return mediaSearchHaystack(item).includes(q);
}
