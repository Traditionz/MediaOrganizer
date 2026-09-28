export type IntegrityRow = {
	id: string;
	original_name: string;
	storage_key: string;
	size: number;
};

export type MissingFile = {
	id: string;
	original_name: string;
};

export function missingFilesFromExists(
	rows: readonly IntegrityRow[],
	fileExists: (storageKey: string) => boolean
): MissingFile[] {
	const missing: MissingFile[] = [];
	for (const row of rows) {
		if (fileExists(row.storage_key)) continue;
		missing.push({ id: row.id, original_name: row.original_name });
	}
	return missing;
}

export function totalStoredBytes(rows: readonly IntegrityRow[]): number {
	let sum = 0;
	for (const row of rows) {
		if (Number.isFinite(row.size) && row.size > 0) sum += row.size;
	}
	return sum;
}
