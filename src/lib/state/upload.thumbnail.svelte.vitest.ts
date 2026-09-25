import { afterEach, describe, expect, test, vi } from 'vitest';
import { mediaJson, testLoad, testVideo } from '../../test-utils/fixtures';
import { installFetch, jsonResponse } from '../../test-utils/mockFetch';

vi.mock('$lib/utils', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/utils')>();
	return {
		...original,
		captureVideoThumbnail: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
		uploadMediaFile: async (file: File) => testVideo({ id: file.name, original_name: file.name })
	};
});

const { createAppState } = await import('./app.svelte');

function videoFile(name: string) {
	return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'video/mp4' });
}

describe('UploadController video thumbnail backfill', () => {
	let restore: (() => void) | null = null;
	afterEach(() => {
		restore?.();
		vi.useRealTimers();
	});

	test('client capture uploads the frame, falls back to server when rejected', async () => {
		vi.useFakeTimers();
		const calls: string[] = [];
		restore = installFetch(async (url, init) => {
			const method = (init?.method ?? 'GET').toUpperCase();
			if (url.includes('/thumbnail')) {
				calls.push(`${method} ${url}`);
				return jsonResponse({}, url.includes('ok.mp4') || method === 'POST' ? 200 : 500);
			}
			return jsonResponse(url.includes('/api/media') ? mediaJson(testVideo()) : {});
		});
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		const mark = vi.spyOn(app.library, 'markHasThumbnail');
		const done = app.upload.uploadFiles([videoFile('ok.mp4'), videoFile('bad.mp4')]);
		await vi.runAllTimersAsync();
		await done;
		await vi.waitFor(() => expect(mark).toHaveBeenCalledTimes(2));
		expect(calls).toContain('PUT /api/media/ok.mp4/thumbnail');
		expect(calls).toContain('PUT /api/media/bad.mp4/thumbnail');
		expect(calls).toContain('POST /api/media/bad.mp4/thumbnail');
		expect(calls).not.toContain('POST /api/media/ok.mp4/thumbnail');
	});
});
