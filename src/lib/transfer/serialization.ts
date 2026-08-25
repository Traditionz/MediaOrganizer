import { asFiniteNumber, asPlainObject, own, ownString, parseJsonText } from '$lib/parse';
import type { JsonValue } from '$lib/parse';
import type {
	TransferFile,
	TransferFileKind,
	TransferFileStatus,
	TransferJob,
	TransferKind
} from '$lib/transfer/types.js';

export function parseFileStatus(value: string | null): TransferFileStatus {
	switch (value) {
		case 'queued':
		case 'uploading':
		case 'saving':
		case 'done':
		case 'error':
		case 'cancelled':
			return value;
		default:
			return 'queued';
	}
}

export function parseFileKind(value: string | null): TransferFileKind {
	switch (value) {
		case 'video':
		case 'image':
		case 'other':
			return value;
		default:
			return 'other';
	}
}

export function parseTransferKind(value: string | null): TransferKind | null {
	if (value === 'upload' || value === 'compress') return value;
	return null;
}

export function parseTransferFiles(raw: JsonValue[] | undefined): TransferFile[] {
	if (!Array.isArray(raw)) return [];
	const files: TransferFile[] = [];
	for (const item of raw) {
		const row = asPlainObject(item);
		if (!row) continue;
		const id = ownString(row, 'id');
		const name = ownString(row, 'name');
		if (!id || !name) continue;
		const progress = asFiniteNumber(own(row, 'progress'));
		const loaded = asFiniteNumber(own(row, 'loaded'));
		const total = asFiniteNumber(own(row, 'total'));
		files.push({
			id,
			name,
			kind: parseFileKind(ownString(row, 'kind')),
			progress:
				progress != null && Number.isFinite(progress)
					? Math.min(100, Math.max(0, Math.round(progress)))
					: 0,
			loaded: loaded != null && Number.isFinite(loaded) ? Math.max(0, loaded) : 0,
			total: total != null && Number.isFinite(total) ? Math.max(0, total) : 0,
			status: parseFileStatus(ownString(row, 'status')),
			error: ownString(row, 'error') ?? undefined
		});
	}
	return files;
}

export function restoreTransferJobsFromStorage(raw: string | null): TransferJob[] {
	if (!raw) return [];
	try {
		const parsed = parseJsonText(raw);
		if (!Array.isArray(parsed)) return [];
		const jobs: TransferJob[] = [];
		for (const item of parsed) {
			const row = asPlainObject(item);
			if (!row) continue;
			const id = ownString(row, 'id');
			const kind = parseTransferKind(ownString(row, 'kind'));
			if (!id || !kind) continue;
			const progressRaw = asFiniteNumber(own(row, 'progress'));
			const progress =
				progressRaw != null && Number.isFinite(progressRaw)
					? Math.min(100, Math.max(0, Math.round(progressRaw)))
					: 0;
			const filesField = own(row, 'files');
			const files = parseTransferFiles(Array.isArray(filesField) ? filesField : undefined);
			const inFlight =
				files.some(
					(file) =>
						file.status === 'queued' || file.status === 'uploading' || file.status === 'saving'
				) ||
				(kind === 'compress' && progress < 100) ||
				(kind === 'upload' && !files.length && progress < 100);
			if (inFlight) continue;
			if (files.length && files.every((file) => file.status === 'cancelled')) continue;
			const fileCountRaw = asFiniteNumber(own(row, 'fileCount'));
			jobs.push({
				id,
				kind,
				label: ownString(row, 'label') ?? 'Transfer',
				progress,
				fileCount:
					fileCountRaw != null && Number.isFinite(fileCountRaw)
						? Math.max(1, Math.round(fileCountRaw))
						: 1,
				files
			});
		}
		return jobs;
	} catch {
		return [];
	}
}
