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
