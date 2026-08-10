import { SvelteSet } from 'svelte/reactivity';

/** Multi-select + rubber-band geometry for the media surface. */
export class SelectionState {
	selectMode = $state(false);
	selectedIds = new SvelteSet<string>();
	selectionAnchor = $state<string | null>(null);
	selecting = $state(false);
	selStart = $state({ x: 0, y: 0 });
	selCurrent = $state({ x: 0, y: 0 });
	contentEl = $state<HTMLDivElement | undefined>();

	readonly selectionRect = $derived.by(() => {
		if (!this.selecting) return null;
		const x = Math.min(this.selStart.x, this.selCurrent.x);
		const y = Math.min(this.selStart.y, this.selCurrent.y);
		const w = Math.abs(this.selCurrent.x - this.selStart.x);
		const h = Math.abs(this.selCurrent.y - this.selStart.y);
		return { x, y, w, h };
	});

	attachContentEl = (node: HTMLDivElement) => {
		this.contentEl = node;
		return () => {
			if (this.contentEl === node) this.contentEl = undefined;
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
