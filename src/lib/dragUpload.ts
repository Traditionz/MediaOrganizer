/** Pure helpers for OS file drag-over overlay (enter/leave depth + containment). */

/** Drop-zone host that answers containment without requiring a full Element. */
export type DragZoneHost = {
	contains(node: Node | null): boolean;
};

export type OsFileDragLeaveResult = {
	depth: number;
	clear: boolean;
};

/** Increment depth when dragenter bubbles into the drop zone. */
export function nextOsFileDragEnterDepth(depth: number): number {
	return depth + 1;
}

/** Decrement depth on dragleave; never go below zero. */
export function nextOsFileDragLeaveDepth(depth: number): number {
	return Math.max(0, depth - 1);
}

export function resetOsFileDragDepth(): number {
	return 0;
}

export function shouldShowOsFileDragOverlay(depth: number): boolean {
	return depth > 0;
}

/**
 * True when the pointer left the drop zone (or the window): relatedTarget is
 * null/non-Node, or not contained by currentTarget.
 */
export function shouldClearOsFileDrag(
	currentTarget: DragZoneHost | null,
	relatedTarget: EventTarget | null
): boolean {
	if (currentTarget === null) return true;
	if (relatedTarget === null) return true;
	if (!(relatedTarget instanceof Node)) return true;
	return !currentTarget.contains(relatedTarget);
}

/**
 * Apply a leave event: force-clear when relatedTarget is outside the zone.
 * When still inside (child transit), keep depth so overlay does not flicker.
 * Depth counter helpers remain available for callers that decrement on every leave.
 */
export function applyOsFileDragLeave(
	depth: number,
	currentTarget: DragZoneHost | null,
	relatedTarget: EventTarget | null
): OsFileDragLeaveResult {
	if (!shouldClearOsFileDrag(currentTarget, relatedTarget)) {
		return { depth, clear: false };
	}
	return { depth: resetOsFileDragDepth(), clear: true };
}
