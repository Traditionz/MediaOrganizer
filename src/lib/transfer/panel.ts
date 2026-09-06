import type { TransferFile, TransferJob } from '$lib/transfer/types.js';

export const FILE_PREVIEW_LIMIT = 6;

export const STATUS_RANK = {
	uploading: 0,
	saving: 1,
	error: 2,
	cancelled: 3,
	queued: 4,
	done: 5
} as const;

export function orderedFiles(job: TransferJob): TransferFile[] {
	return [...job.files].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

/** Collapsed: top N by status priority. Expanded: every file (scroll the list). */
export function visibleFiles(
	job: TransferJob,
	filesExpanded: boolean,
	previewLimit = FILE_PREVIEW_LIMIT
): TransferFile[] {
	const files = orderedFiles(job);
	if (filesExpanded) return files;
	if (files.length <= previewLimit) return files;
	return files.slice(0, previewLimit);
}

export function activeFile(job: TransferJob): TransferFile | undefined {
	return orderedFiles(job).find((file) => file.status === 'uploading' || file.status === 'saving');
}

export function jobTitle(job: TransferJob): string {
	if (job.kind === 'compress') return 'Compressing';
	const videos = job.files.filter((file) => file.kind === 'video').length;
	const inFlight = job.files.some(
		(file) => file.status === 'queued' || file.status === 'uploading' || file.status === 'saving'
	);
	const cancelled = job.files.some((file) => file.status === 'cancelled');
	if (!inFlight && cancelled) return 'Upload cancelled';
	if (videos && videos === job.files.length) {
		return videos === 1 ? 'Uploading video' : `Uploading ${videos} videos`;
	}
	if (job.fileCount === 1) return 'Uploading';
	return `Uploading ${job.fileCount} files`;
}

export function jobSubtitle(job: TransferJob, minimized: boolean): string {
	if (minimized) {
		const current = activeFile(job);
		if (current) return current.name;
	}
	if (!job.files.length) return `${job.progress}% complete`;
	const done = job.files.filter((file) => file.status === 'done').length;
	const failed = job.files.filter((file) => file.status === 'error').length;
	const cancelled = job.files.filter((file) => file.status === 'cancelled').length;
	const parts = [`${done} of ${job.files.length} done`];
	if (failed) parts.push(`${failed} failed`);
	if (cancelled) parts.push(`${cancelled} cancelled`);
	return parts.join(' · ');
}

export function fileMeta(file: TransferFile, formatBytes: (n: number) => string): string {
	if (file.status === 'queued') return 'Waiting';
	if (file.status === 'saving') return 'Saving…';
	if (file.status === 'done') return 'Done';
	if (file.status === 'cancelled') return 'Cancelled';
	if (file.status === 'error') return file.error || 'Failed';
	if (file.total > 0) return `${formatBytes(file.loaded)} / ${formatBytes(file.total)}`;
	return `${file.progress}%`;
}

export function fileProgressClass(file: TransferFile): string {
	if (file.status === 'error') return '[&_[data-slot=progress-indicator]]:bg-destructive';
	if (file.status === 'cancelled') return '[&_[data-slot=progress-indicator]]:bg-amber-500';
	if (file.status === 'done') return '[&_[data-slot=progress-indicator]]:bg-emerald-500';
	if (file.status === 'saving') return '[&_[data-slot=progress-indicator]]:bg-sky-500';
	return '';
}
