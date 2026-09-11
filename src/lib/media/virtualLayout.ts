import type { MediaType } from '$lib/types';
import type { CollageItem, CollageLayout } from '$lib/utils';
import { layoutCollage } from '$lib/utils';
import type { SelectionRect } from '$lib/selection/geometry';
import { rectsIntersect } from '$lib/selection/geometry';

/** Matches Tailwind `gap-3` on the media grid / collage. */
export const MEDIA_LAYOUT_GAP = 12;

/** Extra pixels above/below the viewport to keep mounted. */
export const MEDIA_OVERSCAN_PX = 800;

export type CollageAspectItem = {
	id: string;
	width: number | null;
	height: number | null;
	media_type: MediaType;
};

export type VirtualYWindow = {
	visibleTop: number;
	visibleBottom: number;
};

export type PixelSize = {
	width: number;
	height: number;
};

export function collageFallbackSize(mediaType: MediaType): PixelSize {
	if (mediaType === 'video') return { width: 16, height: 9 };
	return { width: 4, height: 3 };
}

export function collageItemSize(item: CollageAspectItem): PixelSize {
	if (item.width && item.height) return { width: item.width, height: item.height };
	return collageFallbackSize(item.media_type);
}

export function toCollageItems(items: readonly CollageAspectItem[]): CollageItem[] {
	return items.map((item) => {
		const size = collageItemSize(item);
		return { id: item.id, width: size.width, height: size.height };
	});
}

export function gridCellSize(containerWidth: number, columns: number, gap: number): number {
	const cols = Math.max(1, columns);
	const width = Math.max(0, containerWidth);
	const raw = (width - gap * (cols - 1)) / cols;
	if (!Number.isFinite(raw) || raw <= 0) return 1;
	return raw;
}

export function gridTotalHeight(
	itemCount: number,
	columns: number,
	cellSize: number,
	gap: number
): number {
	if (itemCount <= 0) return 0;
	const cols = Math.max(1, columns);
	const rows = Math.ceil(itemCount / cols);
	return rows * cellSize + Math.max(0, rows - 1) * gap;
}

export function gridCardLayouts(
	ids: readonly string[],
	columns: number,
	containerWidth: number,
	gap: number
): CollageLayout[] {
	const cols = Math.max(1, columns);
	const cell = gridCellSize(containerWidth, cols, gap);
	const layouts: CollageLayout[] = [];
	for (let index = 0; index < ids.length; index++) {
		const col = index % cols;
		const row = Math.floor(index / cols);
		layouts.push({
			id: ids[index]!,
			x: col * (cell + gap),
			y: row * (cell + gap),
			w: cell,
			h: cell
		});
	}
	return layouts;
}

/** Closed-form grid layouts only for the visible Y-window (plus overscan). */
export function gridCardLayoutsInYWindow(
	ids: readonly string[],
	columns: number,
	containerWidth: number,
	gap: number,
	visibleTop: number,
	visibleBottom: number,
	overscanPx: number
): CollageLayout[] {
	if (ids.length === 0) return [];
	const cols = Math.max(1, columns);
	const cell = gridCellSize(containerWidth, cols, gap);
	const stride = cell + gap;
	if (!(stride > 0)) return [];
	const top = visibleTop - overscanPx;
	const bottom = visibleBottom + overscanPx;
	if (!(bottom > top)) return [];
	const firstRow = Math.max(0, Math.ceil((top - cell) / stride));
	const lastRow = Math.min(Math.ceil(ids.length / cols) - 1, Math.floor(bottom / stride));
	if (lastRow < firstRow) return [];
	const layouts: CollageLayout[] = [];
	for (let row = firstRow; row <= lastRow; row++) {
		for (let col = 0; col < cols; col++) {
			const index = row * cols + col;
			if (index >= ids.length) break;
			layouts.push({
				id: ids[index]!,
				x: col * stride,
				y: row * stride,
				w: cell,
				h: cell
			});
		}
	}
	return layouts;
}

export function collageCardLayouts(
	items: readonly CollageAspectItem[],
	columns: number,
	containerWidth: number,
	gap: number
): CollageLayout[] {
	return layoutCollage(toCollageItems(items), columns, containerWidth, gap).layouts;
}

export function libraryCardLayouts(
	items: readonly CollageAspectItem[],
	viewMode: 'grid' | 'collage',
	columns: number,
	containerWidth: number,
	gap: number
): CollageLayout[] {
	if (viewMode === 'grid') {
		return gridCardLayouts(
			items.map((item) => item.id),
			columns,
			containerWidth,
			gap
		);
	}
	return collageCardLayouts(items, columns, containerWidth, gap);
}

export function layoutsInYWindow(
	layouts: readonly CollageLayout[],
	visibleTop: number,
	visibleBottom: number,
	overscanPx: number
): CollageLayout[] {
	if (layouts.length === 0) return [];
	const top = visibleTop - overscanPx;
	const bottom = visibleBottom + overscanPx;
	if (!(bottom > top)) return [];
	const out: CollageLayout[] = [];
	for (const layout of layouts) {
		if (layout.y + layout.h < top) continue;
		if (layout.y > bottom) continue;
		out.push(layout);
	}
	return out;
}

/**
 * Collage packing is incremental: walk items until past the Y-window bottom.
 * Still O(visible+overscan) for card mount; packing stops early when past bottom.
 */
export function collageLayoutsInYWindow(
	items: readonly CollageAspectItem[],
	columns: number,
	containerWidth: number,
	gap: number,
	visibleTop: number,
	visibleBottom: number,
	overscanPx: number
) {
	const packed = layoutCollage(toCollageItems(items), columns, containerWidth, gap);
	return {
		layouts: layoutsInYWindow(packed.layouts, visibleTop, visibleBottom, overscanPx),
		totalHeight: packed.totalHeight
	} as const;
}

export function idsIntersectingBox(
	layouts: readonly CollageLayout[],
	box: SelectionRect,
	offsetX: number,
	offsetY: number
): string[] {
	const ids: string[] = [];
	for (const layout of layouts) {
		const card: SelectionRect = {
			x: layout.x + offsetX,
			y: layout.y + offsetY,
			w: layout.w,
			h: layout.h
		};
		if (!rectsIntersect(box, card)) continue;
		ids.push(layout.id);
	}
	return ids;
}

export function virtualYWindowFromRects(
	nodeTop: number,
	viewportTop: number,
	viewportHeight: number
): VirtualYWindow {
	const visibleTop = viewportTop - nodeTop;
	return { visibleTop, visibleBottom: visibleTop + Math.max(0, viewportHeight) };
}

export type VirtualHostMeasure = {
	width: number;
	visibleTop: number;
	visibleBottom: number;
};

/** Scroll + resize observer for a virtualized media host inside ScrollArea. */
export function attachMediaVirtualHost(
	node: HTMLElement,
	onMeasure: (measure: VirtualHostMeasure) => void
): () => void {
	const viewport = node.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');

	const measure = () => {
		const width = Math.max(1, node.clientWidth);
		if (!viewport) {
			onMeasure({ width, visibleTop: 0, visibleBottom: Number.POSITIVE_INFINITY });
			return;
		}
		const nodeRect = node.getBoundingClientRect();
		const vpRect = viewport.getBoundingClientRect();
		const win = virtualYWindowFromRects(nodeRect.top, vpRect.top, vpRect.height);
		onMeasure({ width, visibleTop: win.visibleTop, visibleBottom: win.visibleBottom });
	};

	measure();
	if (!('ResizeObserver' in globalThis)) {
		viewport?.addEventListener('scroll', measure, { passive: true });
		return () => viewport?.removeEventListener('scroll', measure);
	}

	const ro = new ResizeObserver(measure);
	ro.observe(node);
	if (viewport) {
		ro.observe(viewport);
		viewport.addEventListener('scroll', measure, { passive: true });
	}
	return () => {
		ro.disconnect();
		viewport?.removeEventListener('scroll', measure);
	};
}
