import { afterEach, describe, expect, test, vi } from 'vitest';
import { createAppState } from './app.svelte';
import { mediaJson, testLoad, testMedia } from '../../test-utils/fixtures';
import { installFetch, installLibraryFetch, jsonResponse } from '../../test-utils/mockFetch';
import type { MediaItem } from '$lib/types';

function imageFile(name = 'new.jpg') {
	return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

function videoFile(name = 'clip.mp4') {
	return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'video/mp4' });
}

class HangXHR {
	status = 0;
	response = null;
	responseType = '';
	timeout = 0;
	upload = { onprogress: null };
	onload = null;
	onerror = null;
	onabort: (() => void) | null = null;
	ontimeout = null;
	open() {}
	setRequestHeader() {}
	abort() {
		this.onabort?.();
	}
	send() {}
}

type XhrMode = 'ok' | 'fail' | 'network' | 'empty';

function installXhr(mode: XhrMode, item?: MediaItem) {
	class FakeXHR {
		status = 0;
		response: object | null = null;
		responseType = '';
		timeout = 0;
		upload = {
			// SAFETY: handler slot starts empty; the controller assigns it before send().
			onprogress: null as ((e: ProgressEvent<EventTarget>) => void) | null
		};
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		onabort: (() => void) | null = null;
		ontimeout: (() => void) | null = null;
		open() {}
		setRequestHeader() {}
		abort() {
			this.onabort?.();
		}
		send() {
			queueMicrotask(() => {
				// SAFETY: uploadMediaFile only reads lengthComputable, loaded, and total.
				this.upload.onprogress?.({
					lengthComputable: true,
					loaded: 90,
					total: 100
				} as ProgressEvent<EventTarget>);
				if (mode === 'network') {
					this.onerror?.();
					return;
				}
				this.status = mode === 'fail' ? 400 : 200;
				this.response =
					mode === 'empty'
						? {}
						: mode === 'fail'
							? { message: 'Nope' }
							: mediaJson(item ?? testMedia());
				this.onload?.();
			});
		}
	}
	vi.stubGlobal('XMLHttpRequest', FakeXHR);
}

function installHookXhr(outcome: 'load' | 'error', hook: () => void, item?: MediaItem) {
	class HookXHR {
		status = 0;
		response: object | null = null;
		responseType = '';
		timeout = 0;
		upload = { onprogress: null };
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		onabort: (() => void) | null = null;
		ontimeout: (() => void) | null = null;
		open() {}
		setRequestHeader() {}
		abort() {}
		send() {
			queueMicrotask(() => {
				if (outcome === 'error') {
					this.onerror?.();
				} else {
					this.status = 200;
					this.response = mediaJson(item ?? testMedia());
					this.onload?.();
				}
				hook();
			});
		}
	}
	vi.stubGlobal('XMLHttpRequest', HookXHR);
}

describe('UploadController', () => {
	let restore: (() => void) | null = null;
	afterEach(() => {
		restore?.();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	test('rejects unsupported files', async () => {
		const app = createAppState(testLoad());
		const txt = new File(['hi'], 'note.txt', { type: 'text/plain' });
		await app.upload.uploadFiles([txt]);
		expect(app.ui.errorMessage).toBe('Only image and video files are supported.');
	});

	test('askDuplicates opens confirm modal and resolveDuplicatePrompt closes it', async () => {
		const app = createAppState(testLoad());
		const pending = app.upload.askDuplicates(['a.jpg', 'b.jpg']);
		expect(app.ui.confirmModal?.kind).toBe('upload-duplicates');
		expect(app.ui.confirmModal?.title).toBe('Duplicates found');
		app.upload.resolveDuplicatePrompt(false);
		await expect(pending).resolves.toBe(false);
		expect(app.upload.duplicateResolver).toBeNull();
	});

	test('single-name and overflow duplicate messages', async () => {
		const app = createAppState(testLoad());
		const one = app.upload.askDuplicates(['only.jpg']);
		expect(app.ui.confirmModal?.message).toContain('"only.jpg" is already in your library');
		app.upload.resolveDuplicatePrompt(null);
		await expect(one).resolves.toBeNull();

		const many = app.upload.askDuplicates(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg']);
		expect(app.ui.confirmModal?.message).toContain('and 1 more');
		app.upload.resolveDuplicatePrompt(true);
		await expect(many).resolves.toBe(true);
	});

	test('skips duplicates when warned and user skips', async () => {
		const existing = testMedia({ original_name: 'dup.jpg' });
		restore = installLibraryFetch({
			onPatch: () => ({ items: [mediaJson(existing)] })
		});
		const app = createAppState(testLoad({ media: [existing] }));
		app.prefs.warnDuplicateUploads = true;
		app.library.lookupNames = async () => ({ 'dup.jpg': [existing] });
		const done = app.upload.uploadFiles([imageFile('dup.jpg')]);
		await expect.poll(() => app.ui.confirmModal?.kind).toBe('upload-duplicates');
		app.upload.resolveDuplicatePrompt(false);
		await done;
		expect(app.ui.convertResultMessage).toMatch(/Skipped 1 duplicate/);
	});

	test('cancel at duplicate prompt uploads nothing', async () => {
		const existing = testMedia({ original_name: 'dup.jpg' });
		const app = createAppState(testLoad({ media: [existing] }));
		app.prefs.warnDuplicateUploads = true;
		app.library.lookupNames = async () => ({ 'dup.jpg': [existing] });
		const done = app.upload.uploadFiles([imageFile('dup.jpg')]);
		await expect.poll(() => app.upload.duplicateResolver).not.toBeNull();
		app.upload.resolveDuplicatePrompt(null);
		await done;
		expect(app.ui.jobs).toEqual([]);
		expect(app.library.media.some((item) => item.original_name === 'new.jpg')).toBe(false);
	});

	test('warn off skips duplicates and links into the active album', async () => {
		const existing = testMedia({ original_name: 'dup.jpg' });
		restore = installLibraryFetch({
			onPatch: () => ({
				items: [mediaJson({ ...existing, album_ids: ['a1'], album_names: ['Trip'] })]
			})
		});
		const app = createAppState(testLoad({ media: [existing] }));
		app.prefs.warnDuplicateUploads = false;
		app.library.setActiveAlbum('a1');
		app.library.lookupNames = async () => ({ 'dup.jpg': [existing] });
		await app.upload.uploadFiles([imageFile('dup.jpg')]);
		expect(app.ui.convertResultMessage).toMatch(/added/);
	});

	test('resolveDuplicatePrompt is a no-op without a waiter', () => {
		const app = createAppState(testLoad());
		expect(() => app.upload.resolveDuplicatePrompt(true)).not.toThrow();
	});

	test('uploads a unique image and ends the job', async () => {
		vi.useFakeTimers();
		const uploaded = testMedia({ id: 'up1', original_name: 'fresh.jpg' });
		installXhr('ok', uploaded);
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		const done = app.upload.uploadFiles([imageFile('fresh.jpg')]);
		await vi.runAllTimersAsync();
		await done;
		expect(app.library.findKnown('up1')?.original_name).toBe('fresh.jpg');
		expect(app.ui.jobs).toEqual([]);
	});

	test('uploads a unique video and a duplicate-as-copy together', async () => {
		vi.useFakeTimers();
		const existing = testMedia({ original_name: 'dup.jpg' });
		const uploaded = testMedia({ id: 'up2', original_name: 'clip.mp4', media_type: 'video' });
		installXhr('ok', uploaded);
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [existing] }));
		app.prefs.warnDuplicateUploads = true;
		app.library.lookupNames = async () => ({ 'dup.jpg': [existing] });
		const done = app.upload.uploadFiles([videoFile('clip.mp4'), imageFile('dup.jpg')]);
		await expect.poll(() => app.upload.duplicateResolver).not.toBeNull();
		app.upload.resolveDuplicatePrompt(true);
		await vi.runAllTimersAsync();
		await done;
		expect(app.library.findKnown('up2')).toBeTruthy();
	});

	test('single upload error paints the server message', async () => {
		installXhr('fail');
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		await app.upload.uploadFiles([imageFile('bad.jpg')]);
		expect(app.ui.errorMessage).toBe('Nope');
		expect(app.ui.jobs.length).toBe(1);
	});

	test('two upload errors summarize the batch', async () => {
		installXhr('network');
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		await app.upload.uploadFiles([imageFile('a.jpg'), imageFile('b.jpg')]);
		expect(app.ui.errorMessage).toMatch(/2 of 2 uploads failed/);
	});

	test('uploads unique file and reports skipped duplicates', async () => {
		vi.useFakeTimers();
		const existing = testMedia({ original_name: 'dup.jpg' });
		const uploaded = testMedia({ id: 'up3', original_name: 'fresh.jpg' });
		installXhr('ok', uploaded);
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [existing] }));
		app.prefs.warnDuplicateUploads = true;
		app.library.lookupNames = async () => ({ 'dup.jpg': [existing] });
		const done = app.upload.uploadFiles([imageFile('fresh.jpg'), imageFile('dup.jpg')]);
		await expect.poll(() => app.upload.duplicateResolver).not.toBeNull();
		app.upload.resolveDuplicatePrompt(false);
		await vi.runAllTimersAsync();
		await done;
		expect(app.library.findKnown('up3')).toBeTruthy();
		expect(app.ui.convertResultMessage).toMatch(/Uploaded 1 file/);
	});

	test('uploads unique file, skips dups, and links them into the album', async () => {
		vi.useFakeTimers();
		const existing = testMedia({ original_name: 'dup.jpg' });
		const uploaded = testMedia({ id: 'up4', original_name: 'fresh.jpg' });
		installXhr('ok', uploaded);
		restore = installLibraryFetch({
			onPatch: () => ({ items: [mediaJson({ ...existing, album_ids: ['a1'] })] })
		});
		const app = createAppState(testLoad({ media: [existing] }));
		app.prefs.warnDuplicateUploads = true;
		app.library.setActiveAlbum('a1');
		app.library.lookupNames = async () => ({ 'dup.jpg': [existing] });
		const done = app.upload.uploadFiles([imageFile('fresh.jpg'), imageFile('dup.jpg')]);
		await expect.poll(() => app.upload.duplicateResolver).not.toBeNull();
		app.upload.resolveDuplicatePrompt(false);
		await vi.runAllTimersAsync();
		await done;
		expect(app.ui.convertResultMessage).toMatch(/added/);
	});

	test('pool throw paints Upload failed; refreshCounts errors stay quiet', async () => {
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		app.library.refreshCounts = async () => {
			throw new Error('counts');
		};
		vi.spyOn(app.ui, 'setFileProgress').mockImplementation(() => {
			throw new Error('pool');
		});
		await app.upload.uploadFiles([imageFile('fresh.jpg')]);
		expect(app.ui.errorMessage).toBe('pool');
	});

	test('cancel right after a successful response skips the insert', async () => {
		vi.useFakeTimers();
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		installHookXhr(
			'load',
			() => app.ui.cancelTransfer(app.ui.jobs[0]!.id),
			testMedia({ id: 'late' })
		);
		const done = app.upload.uploadFiles([imageFile('late.jpg')]);
		await vi.runAllTimersAsync();
		await done;
		expect(app.library.findKnown('late')).toBeUndefined();
		expect(app.ui.jobs).toEqual([]);
	});

	test('network error after cancel is treated as cancelled', async () => {
		vi.useFakeTimers();
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		installHookXhr('error', () => app.ui.cancelTransfer(app.ui.jobs[0]!.id));
		const done = app.upload.uploadFiles([imageFile('net.jpg')]);
		await vi.runAllTimersAsync();
		await done;
		expect(app.ui.errorMessage).toBe('');
		expect(app.ui.jobs).toEqual([]);
	});

	test('non-Error upload rejection uses the fallback message', async () => {
		vi.stubGlobal(
			'XMLHttpRequest',
			class {
				constructor() {
					throw 'boom';
				}
			}
		);
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		await app.upload.uploadFiles([imageFile('odd.jpg')]);
		expect(app.ui.errorMessage).toBe('Failed to upload odd.jpg');
	});

	test('non-Error pool throw paints Upload failed', async () => {
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		vi.spyOn(app.ui, 'setFileProgress').mockImplementation(() => {
			throw 'pool';
		});
		await app.upload.uploadFiles([imageFile('fresh.jpg')]);
		expect(app.ui.errorMessage).toBe('Upload failed');
	});

	test('pool abort errors and cancelled pools stay quiet', async () => {
		vi.useFakeTimers();
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		const spy = vi.spyOn(app.ui, 'setFileProgress').mockImplementation(() => {
			throw new DOMException('stop', 'AbortError');
		});
		const first = app.upload.uploadFiles([imageFile('a.jpg')]);
		await vi.runAllTimersAsync();
		await first;
		expect(app.ui.errorMessage).toBe('');

		spy.mockImplementation(() => {
			app.ui.cancelTransfer(app.ui.jobs[0]!.id);
			throw new Error('after cancel');
		});
		const second = app.upload.uploadFiles([imageFile('b.jpg')]);
		await vi.runAllTimersAsync();
		await second;
		expect(app.ui.errorMessage).toBe('');
	});

	test('thumbnail backfill failures are swallowed', async () => {
		vi.useFakeTimers();
		installXhr('ok', testMedia({ id: 'up5', original_name: 'fresh.jpg' }));
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		const mark = vi.spyOn(app.library, 'markHasThumbnail').mockImplementation(() => {
			throw new Error('mark');
		});
		const done = app.upload.uploadFiles([imageFile('fresh.jpg')]);
		await vi.runAllTimersAsync();
		await done;
		expect(mark).toHaveBeenCalledWith('up5');
	});

	test('server thumbnail refusal leaves item unmarked', async () => {
		vi.useFakeTimers();
		installXhr('ok', testMedia({ id: 'up6', original_name: 'fresh.jpg' }));
		restore = installFetch(async (url) =>
			url.includes('/thumbnail') ? jsonResponse({}, 500) : jsonResponse({})
		);
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		const mark = vi.spyOn(app.library, 'markHasThumbnail');
		const done = app.upload.uploadFiles([imageFile('fresh.jpg')]);
		await vi.runAllTimersAsync();
		await done;
		expect(mark).not.toHaveBeenCalled();
	});

	test('in-batch duplicate names with an album target link nothing', async () => {
		vi.useFakeTimers();
		installXhr('ok', testMedia({ id: 'up7', original_name: 'twin.jpg' }));
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.prefs.warnDuplicateUploads = false;
		app.library.setActiveAlbum('a1');
		app.library.lookupNames = async () => ({});
		const done = app.upload.uploadFiles([imageFile('twin.jpg'), imageFile('twin.jpg')]);
		await vi.runAllTimersAsync();
		await done;
		expect(app.ui.convertResultMessage).toMatch(/skipped 1 duplicate name/);
	});

	test('failed album link still reports skipped duplicates', async () => {
		const existing = testMedia({ original_name: 'dup.jpg' });
		restore = installFetch(async (url, init) =>
			(init?.method ?? 'GET').toUpperCase() === 'PATCH'
				? jsonResponse({ message: 'no' }, 500)
				: jsonResponse({})
		);
		const app = createAppState(testLoad({ media: [existing] }));
		app.prefs.warnDuplicateUploads = false;
		app.library.setActiveAlbum('a1');
		app.library.lookupNames = async () => ({ 'dup.jpg': [existing] });
		const upsert = vi.spyOn(app.library, 'upsertMedia');
		await app.upload.uploadFiles([imageFile('dup.jpg')]);
		expect(upsert).not.toHaveBeenCalled();
		expect(app.ui.convertResultMessage).toMatch(/Skipped 1 duplicate/);
	});

	test('abort during upload marks cancelled and ends the job', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('XMLHttpRequest', HangXHR);
		restore = installLibraryFetch();
		const app = createAppState(testLoad({ media: [] }));
		app.library.lookupNames = async () => ({});
		const done = app.upload.uploadFiles([imageFile('slow.jpg')]);
		await expect.poll(() => app.ui.jobs.length).toBe(1);
		app.ui.cancelTransfer(app.ui.jobs[0]!.id);
		await vi.runAllTimersAsync();
		await done;
		expect(app.ui.jobs).toEqual([]);
	});
});
