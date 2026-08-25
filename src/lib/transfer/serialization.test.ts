import { describe, expect, test } from 'bun:test';
import type { JsonValue } from '$lib/parse';
import {
	parseFileKind,
	parseFileStatus,
	parseTransferFiles,
	parseTransferKind,
	restoreTransferJobsFromStorage
} from '$lib/transfer/serialization';

describe('transfer serialization', () => {
	test('parseFileStatus defaults unknown to queued', () => {
		expect(parseFileStatus('uploading')).toBe('uploading');
		expect(parseFileStatus('bogus')).toBe('queued');
	});

	test('parseFileKind defaults unknown to other', () => {
		expect(parseFileKind('video')).toBe('video');
		expect(parseFileKind(null)).toBe('other');
	});

	test('parseTransferKind accepts upload and compress only', () => {
		expect(parseTransferKind('upload')).toBe('upload');
		expect(parseTransferKind('compress')).toBe('compress');
		expect(parseTransferKind('x')).toBeNull();
	});

	test('parseTransferFiles skips invalid rows', () => {
		const files = parseTransferFiles([
			{ id: '1', name: 'a.jpg', kind: 'image', progress: 50, status: 'done' } as JsonValue,
			{ name: 'missing-id.jpg' } as JsonValue,
			'not-an-object' as JsonValue
		]);
		expect(files).toHaveLength(1);
		expect(files[0]?.name).toBe('a.jpg');
		expect(files[0]?.progress).toBe(50);
	});

	test('restoreTransferJobsFromStorage keeps finished jobs only', () => {
		const payload = JSON.stringify([
			{
				id: 'done-job',
				kind: 'upload',
				label: 'Upload',
				progress: 100,
				fileCount: 1,
				files: [{ id: 'f1', name: 'a.jpg', kind: 'image', progress: 100, status: 'done' }]
			},
			{
				id: 'active-job',
				kind: 'upload',
				label: 'Upload',
				progress: 40,
				fileCount: 1,
				files: [{ id: 'f2', name: 'b.jpg', kind: 'image', progress: 40, status: 'uploading' }]
			}
		]);
		const jobs = restoreTransferJobsFromStorage(payload);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.id).toBe('done-job');
	});

	test('restoreTransferJobsFromStorage drops all-cancelled jobs', () => {
		const payload = JSON.stringify([
			{
				id: 'cancelled-job',
				kind: 'upload',
				label: 'Upload',
				progress: 0,
				fileCount: 1,
				files: [{ id: 'f1', name: 'a.jpg', kind: 'image', progress: 0, status: 'cancelled' }]
			}
		]);
		expect(restoreTransferJobsFromStorage(payload)).toHaveLength(0);
	});

	test('restoreTransferJobsFromStorage handles corrupt input', () => {
		expect(restoreTransferJobsFromStorage(null)).toEqual([]);
		expect(restoreTransferJobsFromStorage('not-json')).toEqual([]);
	});
});
