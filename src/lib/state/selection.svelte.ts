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

	/** Click a card. Select mode and Ctrl/Cmd toggle; Shift ranges; else replace. */
	clickItem(id: string, orderedIds: readonly string[], shift: boolean, additive: boolean) {
		if (shift && this.selectionAnchor) {
			const lastIdx = orderedIds.indexOf(this.selectionAnchor);
			const curIdx = orderedIds.indexOf(id);
			if (lastIdx >= 0 && curIdx >= 0) {
				if (!additive && !this.selectMode) this.selectedIds.clear();
				const [a, b] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
				for (let i = a; i <= b; i++) this.selectedIds.add(orderedIds[i]!);
			} else {
				this.selectedIds.add(id);
				this.selectionAnchor = id;
			}
			return;
		}
		if (additive || this.selectMode) {
			if (this.selectedIds.has(id)) this.selectedIds.delete(id);
			else this.selectedIds.add(id);
			this.selectionAnchor = id;
			return;
		}
		if (this.selectedIds.has(id) && this.selectedIds.size > 1) {
			this.selectionAnchor = id;
			return;
		}
		this.selectOnly(id);
	}
}
