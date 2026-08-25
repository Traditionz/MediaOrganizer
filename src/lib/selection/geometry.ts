export type Point = { x: number; y: number };

export type SelectionRect = { x: number; y: number; w: number; h: number };

export function computeSelectionRect(
	selecting: boolean,
	start: Point,
	current: Point
): SelectionRect | null {
	if (!selecting) return null;
	const x = Math.min(start.x, current.x);
	const y = Math.min(start.y, current.y);
	const w = Math.abs(current.x - start.x);
	const h = Math.abs(current.y - start.y);
	return { x, y, w, h };
}

export function pointerPointInElement(e: PointerEvent, el: HTMLElement): Point {
	const rect = el.getBoundingClientRect();
	return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function rectsIntersect(a: SelectionRect, b: SelectionRect): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function isTinyRect(w: number, h: number, threshold = 4): boolean {
	return w < threshold && h < threshold;
}

export function cardRectInSurface(card: HTMLElement, surface: HTMLElement): SelectionRect {
	const surfaceRect = surface.getBoundingClientRect();
	const cardRect = card.getBoundingClientRect();
	return {
		x: cardRect.left - surfaceRect.left,
		y: cardRect.top - surfaceRect.top,
		w: cardRect.width,
		h: cardRect.height
	};
}

export function cardsInSelectionBox(surface: HTMLElement, box: SelectionRect): string[] {
	const ids: string[] = [];
	const cards = surface.querySelectorAll<HTMLElement>('.media-card');
	for (const card of cards) {
		const cardBox = cardRectInSurface(card, surface);
		if (!rectsIntersect(box, cardBox)) continue;
		const id = card.dataset.id;
		if (id) ids.push(id);
	}
	return ids;
}
