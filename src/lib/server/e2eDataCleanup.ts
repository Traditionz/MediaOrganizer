import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export const E2E_DATA_DIR_NAME = 'e2e-data';

/** Playwright sandbox only. Never resolves to `data/`. */
export function e2eDataDir(cwd: string): string {
	return resolve(cwd, E2E_DATA_DIR_NAME);
}

export function isE2eDataOverride(override: string | undefined, cwd: string): boolean {
	if (!override) return false;
	return resolve(cwd, override) === e2eDataDir(cwd);
}

/** Drops `{cwd}/e2e-data`. Returns the removed path, or null if nothing to delete. */
export function removeE2eDataDir(cwd: string): string | null {
	const dir = e2eDataDir(cwd);
	if (!existsSync(dir)) return null;
	rmSync(dir, { recursive: true, force: true });
	return dir;
}

/** Same as removeE2eDataDir, but refuses anything that is not the e2e sandbox. */
export function removeConfiguredE2eDataDir(
	cwd: string,
	override: string | undefined
): string | null {
	if (!isE2eDataOverride(override, cwd)) return null;
	return removeE2eDataDir(cwd);
}
