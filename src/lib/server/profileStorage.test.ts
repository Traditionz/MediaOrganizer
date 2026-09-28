import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { createProfile, deleteProfile } from '$lib/server/profiles';
import { newId, profileDir, removeOrphanProfileDirs } from '$lib/server/db';

function orphanDir(): string {
	const id = newId();
	const dir = profileDir(id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'media.db'), 'leftover');
	return id;
}

describe('removeOrphanProfileDirs', () => {
	const created: string[] = [];

	afterEach(() => {
		for (const id of created.splice(0)) {
			try {
				deleteProfile(id, null);
			} catch {
				/* already removed */
			}
		}
		removeOrphanProfileDirs();
	});

	test('drops folders whose profile row is gone and keeps live profiles', () => {
		const gone = orphanDir();
		const profile = createProfile(`Keep ${newId()}`);
		created.push(profile.id);
		expect(existsSync(profileDir(gone))).toBe(true);
		expect(existsSync(profileDir(profile.id))).toBe(true);

		const removed = removeOrphanProfileDirs();
		expect(removed).toContain(gone);
		expect(existsSync(profileDir(gone))).toBe(false);
		expect(existsSync(profileDir(profile.id))).toBe(true);
	});

	test('deleting a profile removes its folder and any other leftover profile folders', () => {
		const profile = createProfile(`Gone ${newId()}`);
		const leftover = orphanDir();
		expect(existsSync(profileDir(profile.id))).toBe(true);

		deleteProfile(profile.id, null);
		expect(existsSync(profileDir(profile.id))).toBe(false);
		expect(existsSync(profileDir(leftover))).toBe(false);
	});
});
