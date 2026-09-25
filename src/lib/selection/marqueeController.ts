import type { SelectionRect } from '$lib/selection/geometry.js';
import {
	cardsInSelectionBox,
	computeSelectionRect,
	isTinyRect,
	pointerPointInElement
} from '$lib/selection/geometry.js';
import { applyMarqueeHits, marqueeSelectionAnchor } from '$lib/selection/marquee.js';
import type { SelectionState } from '$lib/state/selection.svelte';

export function shouldStartMarquee(target: HTMLElement | null): boolean {
	if (!target) return false;
	if (target.closest('.media-card')) return false;
	if (target.closest('[data-slot="scroll-area-scrollbar"]')) return false;
	return true;
}

export class MarqueeController {
	additive = false;
	baseIds: string[] = [];

	constructor(
		private readonly selection: SelectionState,
		private readonly hitsFromLayout: (surface: HTMLElement, box: SelectionRect) => string[] | null
	) {}

	pointerDown(e: PointerEvent, surface: HTMLElement) {
		this.additive = e.ctrlKey || e.metaKey;
		this.baseIds = this.additive ? [...this.selection.selectedIds] : [];
		this.selection.selecting = true;
		const point = pointerPointInElement(e, surface);
		this.selection.selStart = point;
		this.selection.selCurrent = point;
		surface.setPointerCapture(e.pointerId);
	}

	sync(surface: HTMLElement) {
		const box = computeSelectionRect(true, this.selection.selStart, this.selection.selCurrent);
		if (!box || isTinyRect(box.w, box.h)) {
			if (!this.additive) {
				this.selection.selectedIds.clear();
				this.selection.selectionAnchor = null;
				this.selection.selectMode = false;
			}
			return;
		}

		const hits = this.hitsFromLayout(surface, box) ?? cardsInSelectionBox(surface, box);
		applyMarqueeHits(this.selection.selectedIds, hits, {
			additive: this.additive,
			baseIds: this.baseIds
		});
		if (hits.length > 0 || (this.additive && this.baseIds.length > 0)) {
			this.selection.selectMode = true;
		}
		this.selection.selectionAnchor = marqueeSelectionAnchor(hits, this.selection.selectionAnchor);
	}

	pointerMove(e: PointerEvent, surface: HTMLElement) {
		if (!this.selection.selecting) return;
		this.selection.selCurrent = pointerPointInElement(e, surface);
		this.sync(surface);
	}

	finish(e: PointerEvent, surface: HTMLElement) {
		if (!this.selection.selecting) return;
		const box = computeSelectionRect(true, this.selection.selStart, this.selection.selCurrent);
		this.selection.selecting = false;
		try {
			if (surface.hasPointerCapture(e.pointerId)) {
				surface.releasePointerCapture(e.pointerId);
			}
		} catch {
			/* ignore */
		}
		if (!box || isTinyRect(box.w, box.h)) {
			if (!(e.ctrlKey || e.metaKey)) {
				this.selection.selectedIds.clear();
				this.selection.selectionAnchor = null;
				this.selection.selectMode = false;
			}
			return;
		}
		this.sync(surface);
	}

	cancel(e: PointerEvent, surface: HTMLElement | null) {
		if (!this.selection.selecting) return;
		this.selection.selecting = false;
		if (!surface) return;
		try {
			if (surface.hasPointerCapture(e.pointerId)) {
				surface.releasePointerCapture(e.pointerId);
			}
		} catch {
			/* ignore */
		}
	}
}
