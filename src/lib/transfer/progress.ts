import type { TransferFile, TransferJob } from '$lib/transfer/types.js';

export function clampProgress(pct: number): number {
	return Math.min(100, Math.max(0, Math.round(pct)));
}

export function averageFileProgress(files: TransferFile[]): number {
	if (!files.length) return 0;
	const sum = files.reduce((acc, item) => acc + item.progress, 0);
	return Math.round(sum / files.length);
}

export function canCancelTransfer(job: TransferJob): boolean {
	if (job.kind !== 'upload') return false;
	return job.files.some(
		(file) => file.status === 'queued' || file.status === 'uploading' || file.status === 'saving'
	);
}

export type FileProgressPatch = Partial<
	Pick<TransferFile, 'progress' | 'loaded' | 'total' | 'status' | 'error'>
>;

export function applyFileProgress(file: TransferFile, patch: FileProgressPatch): TransferFile {
	if (file.status === 'cancelled') return file;
	const next = { ...file };
	if (patch.progress != null && Number.isFinite(patch.progress)) {
		next.progress = clampProgress(patch.progress);
	}
	if (patch.loaded != null && Number.isFinite(patch.loaded)) {
		next.loaded = Math.max(0, patch.loaded);
	}
	if (patch.total != null && Number.isFinite(patch.total)) {
		next.total = Math.max(0, patch.total);
	}
	if (patch.status) next.status = patch.status;
	if (patch.error !== undefined) next.error = patch.error;
	return next;
}
