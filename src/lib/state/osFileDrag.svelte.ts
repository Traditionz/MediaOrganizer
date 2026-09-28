import {
	applyOsFileDragLeave,
	nextOsFileDragEnterDepth,
	resetOsFileDragDepth,
	shouldShowOsFileDragOverlay,
	type DragZoneHost
} from '$lib/dragUpload';
import type { UiState } from './ui.svelte';

/** OS file-drag depth + overlay flag. */
export class OsFileDrag {
	private depth = 0;

	constructor(private readonly ui: UiState) {}

	clear() {
		this.depth = resetOsFileDragDepth();
		this.ui.dragOver = false;
	}

	enter(hasFiles: boolean) {
		this.depth = nextOsFileDragEnterDepth(this.depth);
		if (hasFiles) this.ui.dragOver = shouldShowOsFileDragOverlay(this.depth);
	}

	leave(host: DragZoneHost | null, related: EventTarget | null) {
		const result = applyOsFileDragLeave(this.depth, host, related);
		this.depth = result.depth;
		if (result.clear) this.ui.dragOver = false;
	}
}
