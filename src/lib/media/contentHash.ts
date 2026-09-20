export function duplicateHashSet(
	items: ReadonlyArray<{ content_hash?: string | null }>
): Set<string> {
	const counts = new Map<string, number>();
	for (const item of items) {
		const hash = item.content_hash;
		if (!hash) continue;
		counts.set(hash, (counts.get(hash) ?? 0) + 1);
	}
	const out = new Set<string>();
	for (const [hash, n] of counts) {
		if (n > 1) out.add(hash);
	}
	return out;
}

export type WatchedFileDecision = 'import' | 'skip-path' | 'skip-hash';

export function watchedFileDecision(
	relativePath: string,
	hash: string,
	knownPaths: ReadonlySet<string>,
	knownHashes: ReadonlySet<string>
): WatchedFileDecision {
	if (knownPaths.has(relativePath)) return 'skip-path';
	if (hash && knownHashes.has(hash)) return 'skip-hash';
	return 'import';
}
