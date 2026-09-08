import { beforeEach, describe, expect, test } from 'bun:test';
import {
	FILE_PREVIEW_LIMIT,
	activeFile,
	fileMeta,
	fileProgressClass,
	jobSubtitle,
	jobTitle,
	orderedFiles,
	visibleFiles
} from '$lib/transfer/panel';
import { formatBytes } from '$lib/utils';
import {
	makeTransferFile,
	makeTransferJob,
	resetTransferHelpers
} from '../../../test/helpers/transfer';

describe('transfer panel', () => {
	beforeEach(() => resetTransferHelpers());

	test('orderedFiles sorts by status priority', () => {
		const job = makeTransferJob({
			files: [
				makeTransferFile({ name: 'done.jpg', status: 'done' }),
				makeTransferFile({ name: 'up.mp4', status: 'uploading' }),
				makeTransferFile({ name: 'wait.png', status: 'queued' })
			]
		});
		expect(orderedFiles(job).map((f) => f.name)).toEqual(['up.mp4', 'wait.png', 'done.jpg']);
	});

	test('visibleFiles returns all files when expanded', () => {
		const files = Array.from({ length: 12 }, (_, i) =>
			makeTransferFile({ name: `file-${i}.jpg`, status: 'queued' })
		);
		const job = makeTransferJob({ files, fileCount: 12 });
		const visible = visibleFiles(job, true);
		expect(visible).toHaveLength(12);
		expect(visible.map((f) => f.name)).toEqual(files.map((f) => f.name));
	});

	test('visibleFiles limits preview when collapsed', () => {
		const files = Array.from({ length: 12 }, (_, i) =>
			makeTransferFile({ name: `file-${i}.jpg`, status: 'queued' })
		);
		const job = makeTransferJob({ files, fileCount: 12 });
		const visible = visibleFiles(job, false);
		expect(visible).toHaveLength(FILE_PREVIEW_LIMIT);
	});

	test('visibleFiles shows all when count <= preview limit', () => {
		const files = Array.from({ length: 4 }, (_, i) =>
			makeTransferFile({ name: `file-${i}.jpg`, status: 'queued' })
		);
		const job = makeTransferJob({ files, fileCount: 4 });
		expect(visibleFiles(job, false)).toHaveLength(4);
	});

	test('activeFile finds uploading or saving file', () => {
		const job = makeTransferJob({
			files: [
				makeTransferFile({ name: 'a.jpg', status: 'done' }),
				makeTransferFile({ name: 'b.mp4', status: 'saving' })
			]
		});
		expect(activeFile(job)?.name).toBe('b.mp4');
	});

	test('jobTitle reflects upload state', () => {
		const single = makeTransferJob({
			fileCount: 1,
			files: [makeTransferFile({ name: 'a.jpg', status: 'uploading' })]
		});
		expect(jobTitle(single)).toBe('Uploading');

		const multi = makeTransferJob({
			fileCount: 3,
			files: [
				makeTransferFile({ name: 'a.jpg', status: 'queued' }),
				makeTransferFile({ name: 'b.jpg', status: 'queued' }),
				makeTransferFile({ name: 'c.jpg', status: 'queued' })
			]
		});
		expect(jobTitle(multi)).toBe('Uploading 3 files');

		const compress = makeTransferJob({ kind: 'compress', files: [] });
		expect(jobTitle(compress)).toBe('Compressing');

		const cancelled = makeTransferJob({
			files: [makeTransferFile({ name: 'a.jpg', status: 'cancelled' })]
		});
		expect(jobTitle(cancelled)).toBe('Upload cancelled');

		const singleVideo = makeTransferJob({
			fileCount: 1,
			files: [makeTransferFile({ name: 'clip.mp4', kind: 'video', status: 'uploading' })]
		});
		expect(jobTitle(singleVideo)).toBe('Uploading video');

		const multiVideo = makeTransferJob({
			fileCount: 2,
			files: [
				makeTransferFile({ name: 'a.mp4', kind: 'video', status: 'uploading' }),
				makeTransferFile({ name: 'b.mp4', kind: 'video', status: 'queued' })
			]
		});
		expect(jobTitle(multiVideo)).toBe('Uploading 2 videos');
	});

	test('jobSubtitle covers progress-only state', () => {
		const job = makeTransferJob({ progress: 42, files: [] });
		expect(jobSubtitle(job, false)).toBe('42% complete');
	});

	test('jobSubtitle summarizes done/failed/cancelled', () => {
		const job = makeTransferJob({
			files: [
				makeTransferFile({ name: 'a.jpg', status: 'done' }),
				makeTransferFile({ name: 'b.jpg', status: 'error' }),
				makeTransferFile({ name: 'c.jpg', status: 'cancelled' })
			]
		});
		expect(jobSubtitle(job, false)).toBe('1 of 3 done · 1 failed · 1 cancelled');
	});

	test('jobSubtitle minimized shows active file name', () => {
		const job = makeTransferJob({
			files: [makeTransferFile({ name: 'active.mp4', status: 'uploading' })]
		});
		expect(jobSubtitle(job, true)).toBe('active.mp4');
	});

	test('fileMeta formats status and bytes', () => {
		const queued = makeTransferFile({ name: 'a.jpg', status: 'queued' });
		expect(fileMeta(queued, formatBytes)).toBe('Waiting');

		const uploading = makeTransferFile({
			name: 'b.jpg',
			status: 'uploading',
			loaded: 512,
			total: 1024,
			progress: 50
		});
		expect(fileMeta(uploading, formatBytes)).toBe('512 B / 1.0 KB');

		const failed = makeTransferFile({ name: 'c.jpg', status: 'error', error: 'Network' });
		expect(fileMeta(failed, formatBytes)).toBe('Network');

		const progressOnly = makeTransferFile({ name: 'd.jpg', status: 'uploading', progress: 25 });
		expect(fileMeta(progressOnly, formatBytes)).toBe('25%');

		expect(fileMeta(makeTransferFile({ name: 'e', status: 'saving' }), formatBytes)).toBe(
			'Saving…'
		);
		expect(fileMeta(makeTransferFile({ name: 'f', status: 'done' }), formatBytes)).toBe('Done');
		expect(fileMeta(makeTransferFile({ name: 'g', status: 'cancelled' }), formatBytes)).toBe(
			'Cancelled'
		);
		expect(fileMeta(makeTransferFile({ name: 'h', status: 'error' }), formatBytes)).toBe('Failed');
	});

	test('fileProgressClass maps status to indicator color', () => {
		expect(fileProgressClass(makeTransferFile({ name: 'a', status: 'error' }))).toContain(
			'destructive'
		);
		expect(fileProgressClass(makeTransferFile({ name: 'b', status: 'done' }))).toContain('emerald');
		expect(fileProgressClass(makeTransferFile({ name: 'c', status: 'cancelled' }))).toContain(
			'amber'
		);
		expect(fileProgressClass(makeTransferFile({ name: 'd', status: 'saving' }))).toContain('sky');
		expect(fileProgressClass(makeTransferFile({ name: 'e', status: 'uploading' }))).toBe('');
	});
});
