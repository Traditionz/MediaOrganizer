import { afterEach, describe, expect, test } from 'vitest';
import { createAppState } from './app.svelte';
import { mediaJson, testLoad, testMedia } from '../../test-utils/fixtures';
import { installLibraryFetch } from '../../test-utils/mockFetch';

function imageFile(name = 'new.jpg') {
	return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

describe('UploadController', () => {
	let restore: (() => void) | null = null;
	afterEach(() => restore?.());

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

	test('single-name duplicate message', async () => {
		const app = createAppState(testLoad());
		const pending = app.upload.askDuplicates(['only.jpg']);
		expect(app.ui.confirmModal?.message).toContain('"only.jpg" is already in your library');
		app.upload.resolveDuplicatePrompt(null);
		await expect(pending).resolves.toBeNull();
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

	test('resolveDuplicatePrompt is a no-op without a waiter', () => {
		const app = createAppState(testLoad());
		expect(() => app.upload.resolveDuplicatePrompt(true)).not.toThrow();
	});
});
