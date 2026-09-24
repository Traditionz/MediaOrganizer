/** A real text highlight, not a collapsed caret. */
export function isCopyableTextSelection(
	selection: {
		isCollapsed: boolean;
		text: string;
	} | null
): boolean {
	return Boolean(selection && !selection.isCollapsed && selection.text.length > 0);
}

/** True when the highlight starts or ends inside `root`. */
export function selectionHitsRoot(
	root: Node | null,
	selection: { isCollapsed: boolean; text: string; anchor: Node | null; focus: Node | null } | null
): boolean {
	if (!root || !isCopyableTextSelection(selection) || !selection) return false;
	const inside = (node: Node | null) => node != null && (node === root || root.contains(node));
	return inside(selection.anchor) || inside(selection.focus);
}

export function readTextSelection(): {
	isCollapsed: boolean;
	text: string;
	anchor: Node | null;
	focus: Node | null;
} | null {
	if (!('getSelection' in globalThis) || globalThis.getSelection == null) return null;
	const sel = globalThis.getSelection();
	if (!sel) return null;
	return {
		isCollapsed: sel.isCollapsed,
		text: sel.toString(),
		anchor: sel.anchorNode,
		focus: sel.focusNode
	};
}

export function selectionInside(root: EventTarget | null): boolean {
	if (!(root instanceof Node)) return false;
	return selectionHitsRoot(root, readTextSelection());
}

/**
 * Lightbox info text. Does not mark the node draggable and does not stop pointerdown,
 * so a click still reaches the parent unless a real highlight sits inside the label.
 */
export function attachCopyableText(node: HTMLElement) {
	const keep = (event: MouseEvent) => {
		if (selectionInside(node)) event.stopPropagation();
	};
	node.addEventListener('click', keep);
	node.addEventListener('dblclick', keep);
	node.addEventListener('contextmenu', keep);
	return () => {
		node.removeEventListener('click', keep);
		node.removeEventListener('dblclick', keep);
		node.removeEventListener('contextmenu', keep);
	};
}
