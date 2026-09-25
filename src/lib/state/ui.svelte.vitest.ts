import { afterEach, describe, expect, test } from 'vitest';
import { createAppState } from './app.svelte';
import { UiState } from './ui.svelte';
import { testLoad, testMedia } from '../../test-utils/fixtures';
import type { TransferFile, TransferJob } from '$lib/transfer/types';

const KEY = 'mo_upload_jobs';

function file(status: TransferFile['status'] = 'queued'): TransferFile {
	return {
		id: 'f1',
		name: 'shot.jpg',
		kind: 'image',
		progress: 10,
		loaded: 1,
		total: 10,
		status
	};
}

function job(overrides: Partial<TransferJob> = {}): TransferJob {
	return {
		id: 'j1',
		kind: 'upload',
		label: 'shot.jpg',
		progress: 0,
		fileCount: 1,
		files: [file()],
		...overrides
	};
}

describe('UiState', () => {
	afterEach(() => {
		sessionStorage.removeItem(KEY);
	});

	test('beginTransfer marks uploading, persist, and restore', () => {
		const ui = new UiState();
		const id = ui.beginTransfer({
			kind: 'upload',
			label: 'one.jpg',
			fileCount: 0,
			files: [file('done')]
		});
		expect(ui.uploading).toBe(true);
		expect(ui.jobs[0]?.fileCount).toBe(1);
		expect(ui.transferSignal(id)).toBeInstanceOf(AbortSignal);
		expect(ui.isTransferCancelled(id)).toBe(false);
		expect(sessionStorage.getItem(KEY)).toContain(id);

		const restored = new UiState();
		expect(restored.jobs.some((item) => item.id === id)).toBe(true);
	});

	test('setTransferProgress and setFileProgress skip unknown ids', () => {
		const ui = new UiState();
		const id = ui.beginTransfer({ kind: 'upload', label: 'x', fileCount: 1, files: [file()] });
		ui.setTransferProgress('missing', 50);
		ui.setFileProgress('missing', 'f1', { progress: 50 });
		ui.setFileProgress(id, 'nope', { progress: 50 });
		ui.setTransferProgress(id, 33);
		expect(ui.jobs[0]?.progress).toBe(33);
		ui.setFileProgress(id, 'f1', { progress: 80, loaded: 8, total: 10, status: 'uploading' });
		expect(ui.jobs[0]?.files[0]?.status).toBe('uploading');
		expect(ui.jobs[0]?.progress).toBe(80);
	});

	test('cancelTransfer aborts, marks files, and removes orphan jobs', () => {
		const ui = new UiState();
		const id = ui.beginTransfer({
			kind: 'upload',
			label: 'x',
			fileCount: 3,
			files: [
				file('queued'),
				{ ...file(), id: 'f2', status: 'uploading' },
				{ ...file(), id: 'f3', status: 'done' }
			]
		});
		expect(ui.canCancelTransfer(ui.jobs[0]!)).toBe(true);
		ui.cancelTransfer(id);
		expect(ui.isTransferCancelled(id)).toBe(true);
		expect(ui.jobs[0]?.files[0]?.status).toBe('cancelled');
		expect(ui.jobs[0]?.files[1]?.status).toBe('cancelled');
		expect(ui.jobs[0]?.files[2]?.status).toBe('done');

		ui.jobs = [job({ id: 'orphan' })];
		ui.cancelTransfer('orphan');
		expect(ui.jobs.find((item) => item.id === 'orphan')).toBeUndefined();
	});

	test('cancelTransfer aborts a live controller whose job row is gone', () => {
		const ui = new UiState();
		const id = ui.beginTransfer({ kind: 'upload', label: 'x', fileCount: 1, files: [file()] });
		ui.jobs = [];
		ui.cancelTransfer(id);
		expect(ui.isTransferCancelled(id)).toBe(true);
		ui.cancelTransfer(id);
		expect(ui.isTransferCancelled(id)).toBe(true);
	});

	test('endTransfer drops the job and persist empty storage', () => {
		const ui = new UiState();
		const id = ui.beginTransfer({ kind: 'compress', label: 'zip', fileCount: 1 });
		expect(ui.uploading).toBe(false);
		expect(ui.canCancelTransfer(ui.jobs[0]!)).toBe(false);
		ui.endTransfer(id);
		expect(ui.jobs).toEqual([]);
		expect(sessionStorage.getItem(KEY)).toBeNull();
	});

	test('pagehide aborts live jobs and dispose removes listeners', () => {
		const ui = new UiState();
		const id = ui.beginTransfer({ kind: 'upload', label: 'x', fileCount: 1, files: [file()] });
		window.dispatchEvent(new Event('pagehide'));
		expect(ui.jobs).toEqual([]);
		expect(ui.transferSignal(id)).toBeUndefined();
		expect(sessionStorage.getItem(KEY)).toBeNull();

		const again = new UiState();
		again.beginTransfer({ kind: 'upload', label: 'y', fileCount: 1 });
		again.dispose();
		expect(again.jobs).toEqual([]);
	});

	test('persist swallows storage errors and delayed flush runs', async () => {
		const ui = new UiState();
		const id = ui.beginTransfer({ kind: 'upload', label: 'x', fileCount: 1, files: [file()] });
		const origSet = sessionStorage.setItem.bind(sessionStorage);
		sessionStorage.setItem = () => {
			throw new Error('quota');
		};
		ui.setTransferProgress(id, 12);
		await new Promise((resolve) => setTimeout(resolve, 350));
		sessionStorage.setItem = origSet;

		const origGet = sessionStorage.getItem.bind(sessionStorage);
		sessionStorage.getItem = () => {
			throw new Error('blocked');
		};
		expect(() => new UiState()).not.toThrow();
		sessionStorage.getItem = origGet;
	});

	test('dispose clears a pending persist timer', () => {
		const ui = new UiState();
		const id = ui.beginTransfer({ kind: 'upload', label: 'x', fileCount: 1, files: [file()] });
		ui.setTransferProgress(id, 12);
		ui.endTransfer(id);
		const again = new UiState();
		const id2 = again.beginTransfer({ kind: 'upload', label: 'y', fileCount: 1, files: [file()] });
		again.setTransferProgress(id2, 40);
		again.dispose();
		expect(again.jobs).toEqual([]);
	});

	test('file input attach detaches only the current node', () => {
		const ui = new UiState();
		const a = document.createElement('input');
		const b = document.createElement('input');
		const detachA = ui.attachFileInput(a);
		expect(ui.fileInput).toBe(a);
		ui.attachFileInput(b);
		detachA();
		expect(ui.fileInput).toBe(b);
		const detachB = ui.attachFileInput(b);
		detachB();
		expect(ui.fileInput).toBeUndefined();
	});

	test('modals, clipboard, errors, and preview sync', () => {
		const app = createAppState(testLoad());
		const { ui } = app;
		ui.setError('boom');
		expect(ui.errorMessage).toBe('boom');
		ui.clearError();
		expect(ui.errorMessage).toBe('');

		ui.openConfirmModal({ kind: 'delete-media', title: 'Trash', message: 'Sure?' });
		expect(ui.confirmModal.open).toBe(true);
		expect(ui.confirmModal.confirmLabel).toBe('Confirm');
		ui.closeConfirmModal();
		expect(ui.confirmModal.open).toBe(false);

		ui.openRenamePrompt('m1', 'shot.jpg');
		expect(ui.promptModal.open).toBe(true);
		ui.closePromptModal();
		expect(ui.promptModal.mediaId).toBeNull();

		ui.openAlbumPicker(['m1']);
		expect(ui.albumPicker.mediaIds).toEqual(['m1']);
		ui.closeAlbumPicker();
		expect(ui.albumPicker.open).toBe(false);

		ui.profileModal.open = true;
		ui.profileModalError = 'x';
		ui.closeProfileModal();
		expect(ui.profileModal.open).toBe(false);
		expect(ui.profileModalError).toBe('');

		ui.openContextMenu({ x: 4, y: 5, mediaIds: ['m1'], kind: 'media' });
		expect(ui.contextMenu.open).toBe(true);
		ui.closeContextMenu();
		expect(ui.contextMenu.open).toBe(false);

		ui.setClipboard(['m1'], 'cut');
		expect(ui.clipboard).toEqual({ ids: ['m1'], mode: 'cut' });

		ui.preview = testMedia({ original_name: 'old.jpg' });
		ui.syncPreview([]);
		expect(ui.preview?.original_name).toBe('old.jpg');
		ui.syncPreview([testMedia({ original_name: 'new.jpg' })]);
		expect(ui.preview?.original_name).toBe('new.jpg');
		ui.preview = null;
		ui.syncPreview([testMedia()]);
		expect(ui.preview).toBeNull();
	});
});
