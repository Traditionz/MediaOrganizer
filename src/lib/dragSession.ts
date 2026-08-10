/** In-memory drag session — custom MIME types are unreliable during dragover. */
export type InternalDragKind = 'media';

let kind: InternalDragKind | null = null;
let mediaIds: string[] = [];
let dragGhostEl: HTMLElement | null = null;

export function beginMediaDrag(ids: string[]) {
	kind = 'media';
	mediaIds = ids.filter((id) => typeof id === 'string' && id.length > 0);
}

export function endInternalDrag() {
	kind = null;
	mediaIds = [];
	clearDragGhost();
}

function clearDragGhost() {
	dragGhostEl?.remove();
	dragGhostEl = null;
}

/**
 * Tiny drag preview so drop targets stay visible under the cursor.
 * Call from dragstart; cleaned up in endInternalDrag / dragend.
 */
export function setCompactMediaDragImage(
	dt: DataTransfer,
	sourceEl: HTMLElement,
	count: number
) {
	clearDragGhost();

	const size = 52;
	const ghost = document.createElement('div');
	ghost.setAttribute('aria-hidden', 'true');
	ghost.style.cssText = [
		'position:fixed',
		'top:-9999px',
		'left:-9999px',
		`width:${size}px`,
		`height:${size}px`,
		'border-radius:10px',
		'overflow:hidden',
		'box-shadow:0 6px 18px rgba(0,0,0,0.4)',
		'background:#1f2937',
		'pointer-events:none',
		'z-index:99999'
	].join(';');

	const media = sourceEl.querySelector('img, video') as
		| HTMLImageElement
		| HTMLVideoElement
		| null;
	if (media) {
		const preview = document.createElement('img');
		preview.alt = '';
		preview.draggable = false;
		preview.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';

		if (media instanceof HTMLImageElement && media.currentSrc) {
			preview.src = media.currentSrc;
		} else if (media instanceof HTMLVideoElement) {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d');
				if (ctx && media.videoWidth > 0) {
					ctx.drawImage(media, 0, 0, size, size);
					preview.src = canvas.toDataURL('image/jpeg', 0.7);
				}
			} catch {
				/* ignore */
			}
		}
		ghost.appendChild(preview);
	}

	if (count > 1) {
		const badge = document.createElement('span');
		badge.textContent = String(count);
		badge.style.cssText = [
			'position:absolute',
			'right:3px',
			'bottom:3px',
			'min-width:1.1rem',
			'height:1.1rem',
			'padding:0 4px',
			'border-radius:999px',
			'background:#3b82f6',
			'color:#fff',
			'font:600 11px/1.1rem system-ui,sans-serif',
			'text-align:center',
			'box-shadow:0 1px 3px rgba(0,0,0,0.35)'
		].join(';');
		ghost.style.position = 'fixed';
		ghost.appendChild(badge);
	}

	document.body.appendChild(ghost);
	dragGhostEl = ghost;
	dt.setDragImage(ghost, size / 2, size / 2);
}

export function getInternalDrag(): {
	kind: InternalDragKind;
	mediaIds: string[];
} | null {
	if (!kind) return null;
	return { kind, mediaIds: [...mediaIds] };
}

export function isInternalDragActive(): boolean {
	return kind !== null;
}
