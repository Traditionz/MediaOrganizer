import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import type { Folder } from '$lib/types';
import db, { filePathForKey, newId } from './db';

type FolderRow = {
	id: string;
	profile_id: string;
	name: string;
	parent_id: string | null;
	created_at: string;
	media_count: number;
};

type MediaCopyRow = {
	id: string;
	original_name: string;
	mime_type: string;
	media_type: string;
	size: number;
	width: number | null;
	height: number | null;
	storage_key: string;
	thumbnail_key: string | null;
};

function buildFolderPaths(
	folders: Array<{ id: string; name: string; parent_id: string | null }>
): Map<string, string> {
	const byId = new Map(folders.map((f) => [f.id, f]));
	const paths = new Map<string, string>();

	function pathFor(id: string, visiting = new Set<string>()): string {
		const cached = paths.get(id);
		if (cached) return cached;
		const folder = byId.get(id);
		if (!folder) return '';
		if (visiting.has(id)) return folder.name;
		visiting.add(id);
		const path =
			folder.parent_id == null || !byId.has(folder.parent_id)
				? folder.name
				: `${pathFor(folder.parent_id, visiting)}/${folder.name}`;
		paths.set(id, path);
		return path;
	}

	for (const folder of folders) pathFor(folder.id);
	return paths;
}

function normalizeCreated(iso: string): string {
	return iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
}

export function listFolders(profileId: string): Folder[] {
	const rows = db
		.prepare(
			`
			SELECT f.id, f.profile_id, f.name, f.parent_id, f.created_at,
				(SELECT COUNT(*) FROM media m WHERE m.folder_id = f.id) AS media_count
			FROM folders f
			WHERE f.profile_id = ?
			ORDER BY f.name COLLATE NOCASE
		`
		)
		.all(profileId) as FolderRow[];

	const base = rows.map((row) => ({
		id: row.id,
		name: row.name,
		parent_id: row.parent_id,
		created_at: normalizeCreated(row.created_at),
		media_count: row.media_count
	}));

	const paths = buildFolderPaths(base);
	return base.map((f) => ({ ...f, path: paths.get(f.id) ?? f.name }));
}

export function createFolder(
	profileId: string,
	name: string,
	parentId: string | null = null
): Folder {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Folder name is required');

	if (parentId) {
		const parent = db
			.prepare('SELECT id FROM folders WHERE id = ? AND profile_id = ?')
			.get(parentId, profileId);
		if (!parent) throw new Error('Parent folder not found');
	}

	const id = newId();
	try {
		db.prepare(
			'INSERT INTO folders (id, profile_id, name, parent_id) VALUES (?, ?, ?, ?)'
		).run(id, profileId, trimmed, parentId);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
			throw new Error('A folder with that name already exists here');
		}
		throw err;
	}

	return listFolders(profileId).find((f) => f.id === id)!;
}

function collectSubtreeIds(
	rootId: string,
	folders: Array<{ id: string; parent_id?: string | null }>
): string[] {
	const children = new Map<string | null, string[]>();
	for (const f of folders) {
		const key = f.parent_id ?? null;
		const list = children.get(key) ?? [];
		list.push(f.id);
		children.set(key, list);
	}
	const ids: string[] = [];
	const stack = [rootId];
	while (stack.length) {
		const id = stack.pop()!;
		ids.push(id);
		for (const kid of children.get(id) ?? []) stack.push(kid);
	}
	return ids;
}

export function deleteFolder(profileId: string, id: string): void {
	const folders = listFolders(profileId);
	const subtree = collectSubtreeIds(id, folders);
	if (!subtree.length) return;

	const tx = db.transaction((folderIds: string[]) => {
		const placeholders = folderIds.map(() => '?').join(', ');
		db.prepare(
			`UPDATE media SET folder_id = NULL WHERE profile_id = ? AND folder_id IN (${placeholders})`
		).run(profileId, ...folderIds);
		db.prepare(
			`DELETE FROM folders WHERE profile_id = ? AND id IN (${placeholders})`
		).run(profileId, ...folderIds);
	});
	tx(subtree);
}

export function moveFolder(profileId: string, id: string, parentId: string | null): Folder {
	if (parentId === id) throw new Error('A folder cannot be moved into itself');

	const folder = db
		.prepare('SELECT id FROM folders WHERE id = ? AND profile_id = ?')
		.get(id, profileId);
	if (!folder) throw new Error('Folder not found');

	if (parentId) {
		const parent = db
			.prepare('SELECT id FROM folders WHERE id = ? AND profile_id = ?')
			.get(parentId, profileId);
		if (!parent) throw new Error('Parent folder not found');

		const all = listFolders(profileId);
		const subtree = new Set(collectSubtreeIds(id, all));
		if (subtree.has(parentId)) {
			throw new Error('Cannot move a folder into its own subfolder');
		}
	}

	try {
		db.prepare('UPDATE folders SET parent_id = ? WHERE id = ? AND profile_id = ?').run(
			parentId,
			id,
			profileId
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
			throw new Error('A folder with that name already exists here');
		}
		throw err;
	}

	const updated = listFolders(profileId).find((f) => f.id === id);
	if (!updated) throw new Error('Folder not found after move');
	return updated;
}

export function renameFolder(profileId: string, id: string, name: string): Folder {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Folder name is required');

	const folder = db
		.prepare('SELECT id FROM folders WHERE id = ? AND profile_id = ?')
		.get(id, profileId);
	if (!folder) throw new Error('Folder not found');

	try {
		db.prepare('UPDATE folders SET name = ? WHERE id = ? AND profile_id = ?').run(
			trimmed,
			id,
			profileId
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
			throw new Error('A folder with that name already exists here');
		}
		throw err;
	}

	const updated = listFolders(profileId).find((f) => f.id === id);
	if (!updated) throw new Error('Folder not found after rename');
	return updated;
}

/** Strip a trailing " (n)" so "Travel (2)" and "Travel" share the same stem. */
function folderNameStem(name: string): string {
	return name.replace(/\s+\(\d+\)$/, '').trim() || name;
}

/** Next available "Stem (x)" among sibling folder names. */
export function nextDuplicateFolderName(sourceName: string, siblingNames: string[]): string {
	const stem = folderNameStem(sourceName);
	const taken = new Set(siblingNames.map((n) => n.toLowerCase()));
	let n = 1;
	while (taken.has(`${stem} (${n})`.toLowerCase())) n += 1;
	return `${stem} (${n})`;
}

/**
 * Deep-duplicate a folder: new sibling named "Name (x)", with the same
 * nested folders and media files copied under it.
 */
export function duplicateFolder(profileId: string, id: string): Folder {
	const folders = listFolders(profileId);
	const source = folders.find((f) => f.id === id);
	if (!source) throw new Error('Folder not found');

	const parentId = source.parent_id ?? null;
	const siblings = folders.filter((f) => (f.parent_id ?? null) === parentId);
	const newRootName = nextDuplicateFolderName(
		source.name,
		siblings.map((f) => f.name)
	);

	const subtreeIds = collectSubtreeIds(id, folders);
	const idMap = new Map<string, string>();
	for (const oldId of subtreeIds) idMap.set(oldId, newId());

	const insertFolder = db.prepare(
		'INSERT INTO folders (id, profile_id, name, parent_id) VALUES (?, ?, ?, ?)'
	);
	const selectMedia = db.prepare(
		'SELECT id, original_name, mime_type, media_type, size, width, height, storage_key, thumbnail_key FROM media WHERE folder_id = ? AND profile_id = ?'
	);
	const insertMedia = db.prepare(
		`
		INSERT INTO media (
			id, profile_id, original_name, mime_type, media_type, folder_id,
			size, width, height, storage_key, thumbnail_key
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	);

	const copiedFiles: string[] = [];

	try {
		const tx = db.transaction(() => {
			for (const oldId of subtreeIds) {
				const folder = folders.find((f) => f.id === oldId);
				if (!folder) continue;

				const newFolderId = idMap.get(oldId)!;
				const name = oldId === id ? newRootName : folder.name;
				const newParent =
					oldId === id ? parentId : idMap.get(folder.parent_id ?? '') ?? null;

				insertFolder.run(newFolderId, profileId, name, newParent);

				const mediaRows = selectMedia.all(oldId, profileId) as MediaCopyRow[];
				for (const row of mediaRows) {
					const src = filePathForKey(row.storage_key);
					if (!existsSync(src)) continue;

					const newMediaId = newId();
					const destKey = newMediaId;
					const dest = filePathForKey(destKey);
					copyFileSync(src, dest);
					copiedFiles.push(dest);

					let thumbKey: string | null = null;
					if (row.thumbnail_key) {
						const thumbSrc = filePathForKey(row.thumbnail_key);
						if (existsSync(thumbSrc)) {
							thumbKey = `${newMediaId}-thumb`;
							const thumbDest = filePathForKey(thumbKey);
							copyFileSync(thumbSrc, thumbDest);
							copiedFiles.push(thumbDest);
						}
					}

					insertMedia.run(
						newMediaId,
						profileId,
						row.original_name,
						row.mime_type,
						row.media_type,
						newFolderId,
						row.size,
						row.width,
						row.height,
						destKey,
						thumbKey
					);
				}
			}
		});
		tx();
	} catch (err) {
		for (const path of copiedFiles) {
			try {
				if (existsSync(path)) unlinkSync(path);
			} catch {
				/* ignore */
			}
		}
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
			throw new Error('A folder with that name already exists here');
		}
		throw err;
	}

	const createdId = idMap.get(id)!;
	const created = listFolders(profileId).find((f) => f.id === createdId);
	if (!created) throw new Error('Folder not found after duplicate');
	return created;
}
