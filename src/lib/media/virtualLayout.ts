import type { MediaType } from '$lib/types';
import type { CollageItem, CollageLayout, CollageResult } from '$lib/utils';
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

export type TimelineSectionMetric = {
	index: number;
	top: number;
	height: number;
	gridTop: number;
	gridHeight: number;
};

export type TimelineMetrics = {
	sections: TimelineSectionMetric[];
	totalHeight: number;
};

export type GridIndexRange = {
	start: number;
	end: number;
};

/** Month header plus the square grid under it. Gap sits between sections, not after the last. */
export function timelineSectionMetrics(
	itemCounts: readonly number[],
	columns: number,
	cellSize: number,
	gap: number,
	headerHeight: number,
	sectionGap: number
): TimelineMetrics {
	const sections: TimelineSectionMetric[] = [];
	let top = 0;
	for (let index = 0; index < itemCounts.length; index++) {
		const gridHeight = gridTotalHeight(itemCounts[index] ?? 0, columns, cellSize, gap);
		const height = headerHeight + gridHeight;
		sections.push({
			index,
			top,
			height,
			gridTop: top + headerHeight,
			gridHeight
		});
		top += height;
		if (index < itemCounts.length - 1) top += sectionGap;
	}
	return { sections, totalHeight: top };
}

/** Inclusive-exclusive card indexes whose rows intersect the local Y window. */
export function gridIndexRange(
	itemCount: number,
	columns: number,
	cellSize: number,
	gap: number,
	localTop: number,
	localBottom: number,
	overscanPx: number
): GridIndexRange {
	if (itemCount <= 0) return { start: 0, end: 0 };
	const stride = cellSize + gap;
	if (!(stride > 0) || !(localBottom > localTop)) return { start: 0, end: 0 };
	const cols = Math.max(1, columns);
	const firstRow = Math.max(0, Math.floor((localTop - overscanPx) / stride));
	const lastRow = Math.max(firstRow, Math.floor((localBottom + overscanPx) / stride));
	return {
		start: Math.min(itemCount, firstRow * cols),
		end: Math.min(itemCount, (lastRow + 1) * cols)
	};
}

export function gridCardBox(
	index: number,
	columns: number,
	cellSize: number,
	gap: number
): CollageLayout {
	const cols = Math.max(1, columns);
	const col = index % cols;
	const row = Math.floor(index / cols);
	const stride = cellSize + gap;
	return {
		id: '',
		x: col * stride,
		y: row * stride,
		w: cellSize,
		h: cellSize
	};
}

let collagePackCache: { key: string; packed: CollageResult } | null = null;

function collagePackKey(
	items: readonly CollageAspectItem[],
	columns: number,
	containerWidth: number,
	gap: number
): string {
	let key = `${columns}:${containerWidth}:${gap}:${items.length}`;
	for (const item of items) {
		key += `|${item.id}:${item.width ?? ''}:${item.height ?? ''}:${item.media_type}`;
	}
	return key;
}

/**
 * Pack the collage once per geometry. A view-count or album-name change reuses the pack
 * so a large library does not lay out every card again.
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
	const key = collagePackKey(items, columns, containerWidth, gap);
	let packed = collagePackCache?.key === key ? collagePackCache.packed : null;
	if (!packed) {
		packed = layoutCollage(toCollageItems(items), columns, containerWidth, gap);
		collagePackCache = { key, packed };
	}
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
