import { appDefaults } from '$lib/config/defaults';
import { asPlainObject, ownString } from '$lib/parse';

/** Format bytes for display */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(iso: string): string {
	const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/** Format seconds as m:ss or h:mm:ss */
export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
	const s = Math.floor(seconds % 60);
	const m = Math.floor(seconds / 60) % 60;
	const h = Math.floor(seconds / 3600);
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export interface CollageItem {
	id: string;
	width: number;
	height: number;
}

export interface CollageLayout {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export type CollageResult = {
	layouts: CollageLayout[];
	totalHeight: number;
};

/** Shortest-column masonry layout */
export function layoutCollage(
	items: CollageItem[],
	columnCount: number,
	containerWidth: number,
	gap = 12
): CollageResult {
	const cols = Math.max(1, columnCount);
	const colWidth = (containerWidth - gap * (cols - 1)) / cols;
	const heights = Array.from({ length: cols }, () => 0);
	const layouts: CollageLayout[] = [];

	for (const item of items) {
		const col = heights.indexOf(Math.min(...heights));
		const aspect = item.width && item.height ? item.height / item.width : item.width ? 1 : 0.75;
		const h = Math.max(80, colWidth * aspect);
		layouts.push({
			id: item.id,
			x: col * (colWidth + gap),
			y: heights[col],
			w: colWidth,
			h
		});
		heights[col] += h + gap;
	}

	return {
		layouts,
		totalHeight: Math.max(0, ...heights) - (items.length ? gap : 0)
	};
}

const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic']);

function extOf(name: string): string {
	const i = name.lastIndexOf('.');
	return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Accept images/videos including MP4 with empty MIME (common for AV1/H264 exports). */
export function isSupportedMediaFile(file: File): boolean {
	if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true;
	const ext = extOf(file.name);
	return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
}

export function isVideoFile(file: File): boolean {
	if (file.type.startsWith('video/')) return true;
	return VIDEO_EXT.has(extOf(file.name));
}

export function isImageFile(file: File): boolean {
	if (file.type.startsWith('image/')) return true;
	return IMAGE_EXT.has(extOf(file.name));
}

const PROBE_SIZE_LIMIT = 50 * 1024 * 1024; // skip heavy probe above 50MB

/** Seek time for preview frames: 3% of the video's full duration. */
export function thumbnailSeekTime(duration: number): number {
	if (!Number.isFinite(duration) || duration <= 0) return 0;
	const at = duration * 0.03;
	// Stay slightly before the end for very short clips
	return Math.min(at, Math.max(0, duration - 0.05));
}

export function probeImageDimensions(
	file: File
): Promise<{ width: number; height: number } | null> {
	if (!isImageFile(file)) return Promise.resolve(null);
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			resolve({ width: img.naturalWidth, height: img.naturalHeight });
			URL.revokeObjectURL(url);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};
		img.src = url;
	});
}

export function probeVideoDimensions(
	file: File,
	timeoutMs = 4000
): Promise<{ width: number; height: number; duration: number | null } | null> {
	if (!isVideoFile(file)) return Promise.resolve(null);
	if (file.size > PROBE_SIZE_LIMIT) {
		return Promise.resolve({ width: 16, height: 9, duration: null });
	}

	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement('video');
		video.preload = 'metadata';
		let settled = false;

		const done = (value: { width: number; height: number; duration: number | null } | null) => {
			if (settled) return;
			settled = true;
			URL.revokeObjectURL(url);
			resolve(value);
		};

		const timer = setTimeout(() => done({ width: 16, height: 9, duration: null }), timeoutMs);

		video.onloadedmetadata = () => {
			clearTimeout(timer);
			const d = video.duration;
			done({
				width: video.videoWidth || 16,
				height: video.videoHeight || 9,
				duration: Number.isFinite(d) && d > 0 ? d : null
			});
		};
		video.onerror = () => {
			clearTimeout(timer);
			done({ width: 16, height: 9, duration: null });
		};
		video.src = url;
	});
}

/** Probe duration from a media URL (for lazy duration backfill). */
export function probeVideoDurationFromUrl(src: string, timeoutMs = 12000): Promise<number | null> {
	return new Promise((resolve) => {
		const video = document.createElement('video');
		video.preload = 'metadata';
		video.muted = true;
		video.playsInline = true;

		let settled = false;
		const finish = (value: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			video.removeAttribute('src');
			video.load();
			resolve(value);
		};

		const timer = setTimeout(() => finish(null), timeoutMs);

		const takeDuration = () => {
			const d = video.duration;
			if (Number.isFinite(d) && d > 0) finish(d);
		};

		video.onloadedmetadata = takeDuration;
		video.ondurationchange = takeDuration;
		video.onerror = () => finish(null);
		video.src = src;
	});
}

export async function persistMediaDuration(mediaId: string, duration: number): Promise<boolean> {
	if (!Number.isFinite(duration) || duration <= 0) return false;
	const res = await fetch('/api/media', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'set-duration', id: mediaId, duration })
	});
	return res.ok;
}

/** Capture a JPEG preview frame from a video File (for upload-time thumbnails). */
export function captureVideoThumbnail(file: File, maxEdge = 480): Promise<Blob | null> {
	if (!isVideoFile(file)) return Promise.resolve(null);

	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.preload = 'auto';

		let settled = false;
		const finish = (blob: Blob | null) => {
			if (settled) return;
			settled = true;
			URL.revokeObjectURL(url);
			resolve(blob);
		};

		const timer = setTimeout(() => finish(null), 8000);

		const draw = () => {
			try {
				const w = video.videoWidth;
				const h = video.videoHeight;
				if (!w || !h) {
					finish(null);
					return;
				}
				const scale = Math.min(1, maxEdge / Math.max(w, h));
				const canvas = document.createElement('canvas');
				canvas.width = Math.max(1, Math.round(w * scale));
				canvas.height = Math.max(1, Math.round(h * scale));
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					finish(null);
					return;
				}
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.82);
			} catch {
				finish(null);
			}
		};

		video.onloadeddata = () => {
			const seekTo = thumbnailSeekTime(video.duration) || 0.1;
			const onSeeked = () => {
				clearTimeout(timer);
				video.removeEventListener('seeked', onSeeked);
				draw();
			};
			video.addEventListener('seeked', onSeeked);
			try {
				video.currentTime = seekTo;
			} catch {
				clearTimeout(timer);
				draw();
			}
		};
		video.onerror = () => {
			clearTimeout(timer);
			finish(null);
		};
		video.src = url;
	});
}

/** Capture a JPEG preview from a media URL (for lazy thumbnail backfill). */
export function captureVideoThumbnailFromUrl(
	src: string,
	maxEdge = 480,
	timeoutMs = 20000
): Promise<Blob | null> {
	return new Promise((resolve) => {
		const video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.preload = 'auto';

		let settled = false;
		const finish = (blob: Blob | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			video.removeAttribute('src');
			video.load();
			resolve(blob);
		};

		const timer = setTimeout(() => finish(null), timeoutMs);

		const draw = () => {
			try {
				const w = video.videoWidth;
				const h = video.videoHeight;
				if (!w || !h) {
					finish(null);
					return;
				}
				const scale = Math.min(1, maxEdge / Math.max(w, h));
				const canvas = document.createElement('canvas');
				canvas.width = Math.max(1, Math.round(w * scale));
				canvas.height = Math.max(1, Math.round(h * scale));
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					finish(null);
					return;
				}
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				canvas.toBlob(
					(blob) => {
						// Reject near-empty / solid-color captures (bad seek)
						if (!blob || blob.size < 3000) {
							finish(null);
							return;
						}
						finish(blob);
					},
					'image/jpeg',
					0.85
				);
			} catch {
				finish(null);
			}
		};

		const seekAndCapture = () => {
			const seekTo = Math.max(0.25, thumbnailSeekTime(video.duration) || 0.5);
			const onSeeked = () => {
				video.removeEventListener('seeked', onSeeked);
				requestAnimationFrame(() => requestAnimationFrame(draw));
			};
			video.addEventListener('seeked', onSeeked);
			try {
				video.currentTime = Math.min(seekTo, Math.max(0, (video.duration || seekTo) - 0.05));
			} catch {
				video.removeEventListener('seeked', onSeeked);
				draw();
			}
		};

		video.addEventListener(
			'loadeddata',
			() => {
				if (video.readyState >= 2) seekAndCapture();
				else video.addEventListener('canplay', seekAndCapture, { once: true });
			},
			{ once: true }
		);
		video.onerror = () => finish(null);
		video.src = src;
	});
}

/** Capture a JPEG frame from an already-loaded video element. */
export function captureThumbnailFromVideoEl(
	video: HTMLVideoElement,
	maxEdge = 480
): Promise<Blob | null> {
	return new Promise((resolve) => {
		try {
			const w = video.videoWidth;
			const h = video.videoHeight;
			if (!w || !h) {
				resolve(null);
				return;
			}
			const scale = Math.min(1, maxEdge / Math.max(w, h));
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(w * scale));
			canvas.height = Math.max(1, Math.round(h * scale));
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				resolve(null);
				return;
			}
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
		} catch {
			resolve(null);
		}
	});
}

export async function uploadVideoThumbnail(mediaId: string, blob: Blob): Promise<boolean> {
	const res = await fetch(`/api/media/${mediaId}/thumbnail`, {
		method: 'PUT',
		headers: { 'Content-Type': 'image/jpeg' },
		body: blob
	});
	return res.ok;
}

export type UploadProgressInfo = {
	pct: number;
	loaded: number;
	total: number;
};

/** Stream upload via XHR for progress on large files. */
export function uploadMediaFile(
	file: File,
	options: {
		albumId: string | null;
		width?: number | null;
		height?: number | null;
		duration?: number | null;
		onProgress?: (info: UploadProgressInfo) => void;
		signal?: AbortSignal;
	}
): Promise<{ id: string; media_type?: string }> {
	return new Promise((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(new DOMException('Upload cancelled', 'AbortError'));
			return;
		}

		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/media');
		xhr.responseType = 'json';

		const mime =
			file.type && file.type !== 'application/octet-stream'
				? file.type
				: isVideoFile(file)
					? 'video/mp4'
					: 'application/octet-stream';

		xhr.setRequestHeader('Content-Type', mime);
		xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
		if (options.albumId) xhr.setRequestHeader('X-Album-Id', options.albumId);
		if (options.width != null) xhr.setRequestHeader('X-Width', String(options.width));
		if (options.height != null) xhr.setRequestHeader('X-Height', String(options.height));
		if (options.duration != null && Number.isFinite(options.duration) && options.duration > 0) {
			xhr.setRequestHeader('X-Duration', String(options.duration));
		}

		let settled = false;
		const succeed = (value: { id: string; media_type?: string }) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const fail = (err: Error) => {
			if (settled) return;
			settled = true;
			reject(err);
		};

		const onAbort = () => {
			xhr.abort();
			fail(new DOMException('Upload cancelled', 'AbortError'));
		};
		options.signal?.addEventListener('abort', onAbort, { once: true });

		xhr.upload.onprogress = (e) => {
			if (settled || options.signal?.aborted) return;
			if (!options.onProgress) return;
			const total = e.lengthComputable && e.total > 0 ? e.total : file.size;
			const loaded = e.loaded;
			const pct = total > 0 ? Math.min(95, Math.round((loaded / total) * 95)) : 0;
			options.onProgress({ pct, loaded, total });
		};

		xhr.onload = () => {
			options.signal?.removeEventListener('abort', onAbort);
			if (xhr.status >= 200 && xhr.status < 300) {
				options.onProgress?.({ pct: 100, loaded: file.size, total: file.size });
				const payload = asPlainObject(xhr.response);
				const id = payload ? ownString(payload, 'id') : null;
				if (!payload || !id) {
					fail(new Error(`Upload succeeded without media id for ${file.name}`));
					return;
				}
				succeed({ id, media_type: ownString(payload, 'media_type') ?? undefined });
			} else {
				const payload = asPlainObject(xhr.response);
				const msg =
					(payload ? (ownString(payload, 'message') ?? ownString(payload, 'error')) : null) ??
					`Failed to upload ${file.name}`;
				fail(new Error(msg));
			}
		};
		xhr.onabort = () => {
			options.signal?.removeEventListener('abort', onAbort);
			fail(new DOMException('Upload cancelled', 'AbortError'));
		};
		xhr.onerror = () => {
			options.signal?.removeEventListener('abort', onAbort);
			fail(new Error(`Network error uploading ${file.name}`));
		};
		xhr.ontimeout = () => {
			options.signal?.removeEventListener('abort', onAbort);
			fail(new Error(`Timed out uploading ${file.name}`));
		};
		xhr.timeout = 0;
		if (options.signal?.aborted) {
			options.signal.removeEventListener('abort', onAbort);
			fail(new DOMException('Upload cancelled', 'AbortError'));
			return;
		}
		xhr.send(file);
	});
}

export function isAbortError(err: Error): boolean {
	return err.name === 'AbortError';
}

/** Run async work over items with a fixed parallel pool (browser-friendly concurrency). */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<R>,
	signal?: AbortSignal
): Promise<R[]> {
	const results: R[] = [];
	let next = 0;
	const limit = Math.max(1, Math.min(concurrency, items.length || 1));

	async function runWorker() {
		while (true) {
			if (signal?.aborted) return;
			const i = next++;
			if (i >= items.length) return;
			if (signal?.aborted) return;
			results[i] = await worker(items[i], i);
		}
	}

	await Promise.all(Array.from({ length: limit }, () => runWorker()));
	return results;
}

/** Parallel upload slots — browsers typically allow ~6 connections per host. */
export const UPLOAD_CONCURRENCY = appDefaults.uploadConcurrency;
