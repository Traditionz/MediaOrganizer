import { beforeEach, describe, expect, test } from 'bun:test';
import {
	applyFileProgress,
	averageFileProgress,
	canCancelTransfer,
	clampProgress
} from '$lib/transfer/progress';
import { makeTransferFile, makeTransferJob, resetTransferHelpers } from '../../../test/helpers/transfer';

describe('transfer progress', () => {
	beforeEach(() => resetTransferHelpers());

	test('clampProgress bounds 0–100', () => {
		expect(clampProgress(-5)).toBe(0);
		expect(clampProgress(50.4)).toBe(50);
		expect(clampProgress(150)).toBe(100);
	});

	test('averageFileProgress averages file progress', () => {
		const files = [
			makeTransferFile({ name: 'a', progress: 0 }),
			makeTransferFile({ name: 'b', progress: 100 })
		];
		expect(averageFileProgress(files)).toBe(50);
		expect(averageFileProgress([])).toBe(0);
	});

	test('canCancelTransfer only for active uploads', () => {
		const uploadActive = makeTransferJob({
			kind: 'upload',
			files: [makeTransferFile({ name: 'a', status: 'uploading' })]
		});
		expect(canCancelTransfer(uploadActive)).toBe(true);

		const uploadDone = makeTransferJob({
			kind: 'upload',
			files: [makeTransferFile({ name: 'a', status: 'done' })]
		});
		expect(canCancelTransfer(uploadDone)).toBe(false);

		const compress = makeTransferJob({ kind: 'compress', files: [] });
		expect(canCancelTransfer(compress)).toBe(false);
	});

	test('applyFileProgress merges patch and ignores cancelled files', () => {
		const file = makeTransferFile({ name: 'a', status: 'uploading', progress: 10 });
		const updated = applyFileProgress(file, { progress: 55, loaded: 100, total: 200 });
		expect(updated.progress).toBe(55);
		expect(updated.loaded).toBe(100);
		expect(updated.total).toBe(200);

		const cancelled = makeTransferFile({ name: 'b', status: 'cancelled', progress: 0 });
		expect(applyFileProgress(cancelled, { progress: 99 }).progress).toBe(0);
	});
});
