import { SvelteSet } from 'svelte/reactivity';

import { computeSelectionRect } from '$lib/selection/geometry.js';

/** Multi-select + rubber-band geometry for the media surface. */
export class SelectionState {
	selectMode = $state(false);
	selectedIds = new SvelteSet<string>();
	selectionAnchor = $state<string | null>(null);
	selecting = $state(false);
	selStart = $state({ x: 0, y: 0 });
	selCurrent = $state({ x: 0, y: 0 });
	contentEl = $state<HTMLElement | null>(null);

	readonly selectionRect = $derived.by(() =>
		computeSelectionRect(this.selecting, this.selStart, this.selCurrent)
	);

	attachContentEl = (node: HTMLElement) => {
		this.contentEl = node;
		return () => {
			if (this.contentEl === node) this.contentEl = null;
		};
	};

	clear() {
		this.selectedIds.clear();
		this.selectionAnchor = null;
		this.selectMode = false;
	}

	toggleSelectMode() {
		this.selectMode = !this.selectMode;
		if (!this.selectMode) {
			this.selectedIds.clear();
			this.selectionAnchor = null;
		}
	}

	selectOnly(id: string) {
		this.selectedIds.clear();
		this.selectedIds.add(id);
		this.selectionAnchor = id;
	}
}
