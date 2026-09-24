export type VideoContainerScan = {
	types: string[];
	hasMoov: boolean;
	truncatedType: string | null;
	invalid: boolean;
	ebml: boolean;
	/** Set when the file starts with an EBML header. WebM is playable; Matroska is not. */
	docType: 'webm' | 'matroska' | null;
};

export type VideoContainerProblem = 'no-moov' | 'truncated' | 'invalid' | 'matroska';

const EBML = [0x1a, 0x45, 0xdf, 0xa3];

function boxType(bytes: Uint8Array): string | null {
	if (bytes.length < 4) return null;
	let text = '';
	for (let i = 0; i < 4; i++) {
		const code = bytes[i] ?? 0;
		if (code < 0x20 || code > 0x7e) return null;
		text += String.fromCharCode(code);
	}
	return text;
}

function u32(bytes: Uint8Array): number {
	return (
		(((bytes[0] ?? 0) << 24) |
			((bytes[1] ?? 0) << 16) |
			((bytes[2] ?? 0) << 8) |
			(bytes[3] ?? 0)) >>>
		0
	);
}

function u64(bytes: Uint8Array): number | null {
	if (bytes.length < 8) return null;
	let value = 0;
	for (let i = 0; i < 8; i++) value = value * 256 + (bytes[i] ?? 0);
	if (!Number.isSafeInteger(value)) return null;
	return value;
}

/** Walk top-level ISO BMFF boxes. `read` must return the next bytes at `position`. */
export function scanVideoContainer(
	fileSize: number,
	read: (position: number, length: number) => Uint8Array
): VideoContainerScan {
	const empty: VideoContainerScan = {
		types: [],
		hasMoov: false,
		truncatedType: null,
		invalid: false,
		ebml: false,
		docType: null
	};
	if (!Number.isFinite(fileSize) || fileSize < 4) return { ...empty, invalid: true };

	const head = read(0, 128);
	if (
		head.length >= 4 &&
		head[0] === EBML[0] &&
		head[1] === EBML[1] &&
		head[2] === EBML[2] &&
		head[3] === EBML[3]
	) {
		return { ...empty, ebml: true, docType: ebmlDocType(head) };
	}

	let pos = 0;
	const types: string[] = [];
	for (let i = 0; i < 40 && pos + 8 <= fileSize; i++) {
		const header = read(pos, 16);
		if (header.length < 8) return finish(types, null, true);
		let size = u32(header.subarray(0, 4));
		const type = boxType(header.subarray(4, 8));
		if (type == null) return finish(types, null, true);
		let headerLen = 8;
		if (size === 1) {
			const large = u64(header.subarray(8, 16));
			if (large == null || large < 16) return finish(types, null, true);
			size = large;
			headerLen = 16;
		} else if (size === 0) {
			size = fileSize - pos;
		} else if (size < 8) {
			return finish(types, null, true);
		}
		if (size < headerLen) return finish(types, null, true);
		types.push(type);
		if (pos + size > fileSize) return finish(types, type, false);
		pos += size;
	}
	return finish(types, null, false);
}

function finish(
	types: string[],
	truncatedType: string | null,
	invalid: boolean
): VideoContainerScan {
	const hasMoov = types.includes('moov');
	return {
		types,
		hasMoov,
		truncatedType,
		// Bytes after a finished moov are often a short tag, not a broken file.
		invalid: invalid && !hasMoov,
		ebml: false,
		docType: null
	};
}

/** DocType element id 0x4282. WebM is a playable EBML file; Matroska is not. */
function ebmlDocType(bytes: Uint8Array): 'webm' | 'matroska' | null {
	for (let i = 0; i + 4 < bytes.length; i++) {
		if (bytes[i] !== 0x42 || bytes[i + 1] !== 0x82) continue;
		const marker = bytes[i + 2] ?? 0;
		if ((marker & 0x80) === 0) continue;
		const len = marker & 0x7f;
		const start = i + 3;
		if (len < 1 || start + len > bytes.length) continue;
		let text = '';
		for (let j = 0; j < len; j++) text += String.fromCharCode(bytes[start + j] ?? 0);
		const name = text.toLowerCase();
		if (name === 'webm') return 'webm';
		if (name.startsWith('matroska')) return 'matroska';
	}
	return null;
}

export function videoContainerProblem(scan: VideoContainerScan): VideoContainerProblem | null {
	if (scan.ebml) return scan.docType === 'webm' ? null : 'matroska';
	if (scan.invalid) return 'invalid';
	if (scan.truncatedType) return 'truncated';
	if (!scan.hasMoov) return 'no-moov';
	return null;
}
