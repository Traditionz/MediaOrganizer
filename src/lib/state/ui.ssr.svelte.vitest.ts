import { describe, expect, test, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	browser: false,
	dev: false,
	building: false,
	version: 'test'
}));

const { UiState } = await import('./ui.svelte');

describe('UiState (SSR)', () => {
	test('skips storage restore, persistence, and window listeners', () => {
		sessionStorage.setItem('mo_upload_jobs', '[]');
		const getItem = vi.spyOn(Storage.prototype, 'getItem');
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const addListener = vi.spyOn(window, 'addEventListener');
		const removeListener = vi.spyOn(window, 'removeEventListener');
		try {
			const ui = new UiState();
			const id = ui.beginTransfer({ kind: 'upload', label: 'x', fileCount: 1 });
			ui.setTransferProgress(id, 20);
			ui.dispose();
			expect(ui.jobs).toEqual([]);
			expect(getItem).not.toHaveBeenCalled();
			expect(setItem).not.toHaveBeenCalled();
			expect(addListener).not.toHaveBeenCalled();
			expect(removeListener).not.toHaveBeenCalled();
		} finally {
			vi.restoreAllMocks();
			sessionStorage.removeItem('mo_upload_jobs');
		}
	});
});
