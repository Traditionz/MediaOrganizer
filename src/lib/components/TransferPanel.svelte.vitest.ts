import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { renderWithApp } from '../../test-utils/renderWithApp';
import TransferPanel from './TransferPanel.svelte';
import { testLoad } from '../../test-utils/fixtures';
import type { TransferFile, TransferJob } from '$lib/transfer/types';

function job(overrides: Partial<TransferJob> = {}): TransferJob {
	const files: TransferFile[] = [
		{
			id: 'f1',
			name: 'a.jpg',
			kind: 'image',
			progress: 40,
			loaded: 4,
			total: 10,
			status: 'uploading'
		},
		{
			id: 'f2',
			name: 'b.mp4',
			kind: 'video',
			progress: 100,
			loaded: 8,
			total: 8,
			status: 'done'
		},
		{
			id: 'f3',
			name: 'c.jpg',
			kind: 'image',
			progress: 100,
			loaded: 1,
			total: 1,
			status: 'error',
			error: 'nope'
		},
		{
			id: 'f4',
			name: 'd.jpg',
			kind: 'image',
			progress: 0,
			loaded: 0,
			total: 1,
			status: 'cancelled'
		},
		{
			id: 'f5',
			name: 'e.jpg',
			kind: 'image',
			progress: 90,
			loaded: 9,
			total: 10,
			status: 'saving'
		},
		{
			id: 'f6',
			name: 'f.jpg',
			kind: 'image',
			progress: 0,
			loaded: 0,
			total: 1,
			status: 'queued'
		},
		{
			id: 'f7',
			name: 'g.jpg',
			kind: 'image',
			progress: 0,
			loaded: 0,
			total: 1,
			status: 'queued'
		}
	];
	return {
		id: 'j1',
		kind: 'upload',
		label: '3 files',
		progress: 40,
		fileCount: 3,
		files,
		...overrides
	};
}

describe('TransferPanel', () => {
	test('hidden without jobs; shows upload and cancel when jobs exist', async () => {
		const { app } = await renderWithApp(TransferPanel, { load: testLoad(), props: {} });
		expect(document.querySelector('[role="status"]')).toBeNull();
		const seed = job();
		app.ui.beginTransfer({
			kind: seed.kind,
			label: seed.label,
			fileCount: seed.files.length,
			files: seed.files
		});
		await expect.poll(() => document.querySelector('[role="status"]')).toBeTruthy();
		await page.getByRole('button', { name: `Show all ${seed.files.length} files` }).click();
		await page.getByRole('button', { name: 'Show less' }).click();
		await page.getByRole('button', { name: 'Minimize upload panel' }).click();
		await page.getByRole('button', { name: 'Expand upload details' }).click();
		await page.getByRole('button', { name: 'Cancel upload' }).click();
		app.ui.beginTransfer({ kind: 'compress', label: 'zip', fileCount: 1, files: [] });
		await expect.poll(() => document.querySelectorAll('[role="status"]').length).toBeGreaterThan(1);
		document.querySelector<HTMLButtonElement>('[aria-label="Hide transfer progress"]')?.click();
	});

	test('short file list shows cancelled and in-flight video rows without a show-all toggle', async () => {
		const { app } = await renderWithApp(TransferPanel, { load: testLoad(), props: {} });
		const files: TransferFile[] = [
			{
				id: 'c1',
				name: 'gone.jpg',
				kind: 'image',
				progress: 0,
				loaded: 0,
				total: 1,
				status: 'cancelled'
			},
			{
				id: 'v1',
				name: 'clip.mp4',
				kind: 'video',
				progress: 0,
				loaded: 0,
				total: 5,
				status: 'queued'
			}
		];
		app.ui.beginTransfer({ kind: 'upload', label: '2 files', fileCount: files.length, files });
		await expect.element(page.getByText('gone.jpg')).toBeVisible();
		await expect.element(page.getByText('clip.mp4')).toBeVisible();
		expect(document.querySelector('.h-auto.max-h-48')).toBeTruthy();
		expect(document.body.textContent).not.toContain('Show all');
	});
});
