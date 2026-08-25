import type { TransferFile, TransferFileStatus, TransferJob } from '$lib/state/ui.svelte';

let fileCounter = 0;

export function makeTransferFile(
	overrides: Partial<TransferFile> & Pick<TransferFile, 'name'> & { status?: TransferFileStatus }
): TransferFile {
	fileCounter += 1;
	return {
		id: overrides.id ?? `file-${fileCounter}`,
		name: overrides.name,
		kind: overrides.kind ?? 'image',
		progress: overrides.progress ?? 0,
		loaded: overrides.loaded ?? 0,
		total: overrides.total ?? 0,
		status: overrides.status ?? 'queued',
		error: overrides.error
	};
}

export function makeTransferJob(overrides: Partial<TransferJob> = {}): TransferJob {
	const files = overrides.files ?? [];
	return {
		id: overrides.id ?? 'job-1',
		kind: overrides.kind ?? 'upload',
		label: overrides.label ?? 'Upload',
		progress: overrides.progress ?? 0,
		fileCount: overrides.fileCount ?? (files.length || 1),
		files
	};
}

export function resetTransferHelpers(): void {
	fileCounter = 0;
}
