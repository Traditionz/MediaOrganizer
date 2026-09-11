/** Client checks for delete-profile name + media-count confirmation. */

export type DeleteProfileConfirmInput = {
	typedName: string;
	typedCountRaw: string;
	profileName: string;
	mediaCount: number;
};

export function parseConfirmMediaCount(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	if (!/^\d+$/.test(trimmed)) return null;
	const n = Number(trimmed);
	if (!Number.isInteger(n) || n < 0) return null;
	return n;
}

export function validateDeleteProfileConfirm(input: DeleteProfileConfirmInput): string | null {
	const typedName = input.typedName.trim();
	if (!typedName) return 'Enter the profile name to confirm';
	const typedCount = parseConfirmMediaCount(input.typedCountRaw);
	if (typedCount == null) return 'Enter the media count as a whole number';
	if (
		typedName.localeCompare(input.profileName.trim(), undefined, { sensitivity: 'accent' }) !== 0
	) {
		return 'Profile name does not match';
	}
	if (typedCount !== input.mediaCount) return 'Media count does not match';
	return null;
}

/** SQLite count() can arrive as a string or bigint. */
export function normalizeMediaCount(raw: number | string | bigint | null | undefined): number {
	if (raw == null || raw === '') return 0;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) return Number.NaN;
	return n;
}

/** Empty libraries skip the type-to-confirm dialog. Unknown counts still confirm. */
export function profileDeleteNeedsConfirm(mediaCount: number): boolean {
	const count = normalizeMediaCount(mediaCount);
	if (!Number.isInteger(count) || count < 0) return true;
	return count > 0;
}

export function profileDeleteConfirmationError(
	actualCount: number,
	expectedName: string,
	providedName: string | null,
	providedCount: number | null
): string | null {
	const count = normalizeMediaCount(actualCount);
	if (!Number.isInteger(count) || count < 0) return 'Confirmation required';
	if (count === 0) return null;
	if (providedName == null || providedCount == null) return 'Confirmation required';
	return validateDeleteProfileConfirm({
		typedName: providedName,
		typedCountRaw: String(providedCount),
		profileName: expectedName,
		mediaCount: count
	});
}
