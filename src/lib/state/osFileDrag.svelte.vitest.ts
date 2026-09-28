import { describe, expect, test } from 'vitest';
import { createAppState } from './app.svelte';
import { testLoad } from '../../test-utils/fixtures';

function zone() {
	const parent = document.createElement('div');
	const child = document.createElement('span');
	parent.appendChild(child);
	return { parent, child, outside: document.createElement('div') };
}

describe('OsFileDrag', () => {
	test('enter with files shows overlay; leave into a child keeps it', () => {
		const app = createAppState(testLoad());
		const { parent, child } = zone();
		app.osFileDrag.enter(true);
		expect(app.ui.dragOver).toBe(true);
		app.osFileDrag.leave(parent, child);
		expect(app.ui.dragOver).toBe(true);
	});

	test('enter without files never shows overlay', () => {
		const app = createAppState(testLoad());
		app.osFileDrag.enter(false);
		expect(app.ui.dragOver).toBe(false);
	});

	test('leave to an element outside the zone clears overlay', () => {
		const app = createAppState(testLoad());
		const { parent, outside } = zone();
		app.osFileDrag.enter(true);
		app.osFileDrag.leave(parent, outside);
		expect(app.ui.dragOver).toBe(false);
	});

	test('clear resets overlay and depth', () => {
		const app = createAppState(testLoad());
		app.osFileDrag.enter(true);
		app.osFileDrag.enter(true);
		app.osFileDrag.clear();
		expect(app.ui.dragOver).toBe(false);
		app.osFileDrag.enter(true);
		expect(app.ui.dragOver).toBe(true);
	});
});
