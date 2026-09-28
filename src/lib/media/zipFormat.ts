/** CRC-32 + ZIP STORE headers (files must be < 4 GiB). */

const ZIP_MAX = 0xfffffffe;

const CRC_TABLE = makeCrcTable();

function makeCrcTable(): Uint32Array {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
}

export function crc32(bytes: Uint8Array, seed = 0): number {
	let c = seed ^ 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

export function zipNameBytes(name: string): Uint8Array {
	return new TextEncoder().encode(name.replaceAll('\\', '/'));
}

export function zipFileTooLarge(size: number): boolean {
	return !Number.isFinite(size) || size < 0 || size > ZIP_MAX;
}

/** Unique ZIP entry name; collapses slashes. */
export function zipUniqueName(name: string, used: Set<string>): string {
	const trimmed = name.replaceAll('\\', '/').replace(/^\/+/, '').trim() || 'file';
	if (!used.has(trimmed)) {
		used.add(trimmed);
		return trimmed;
	}
	const dot = trimmed.lastIndexOf('.');
	const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
	const ext = dot > 0 ? trimmed.slice(dot) : '';
	let n = 2;
	let next = `${base} (${n})${ext}`;
	while (used.has(next)) {
		n += 1;
		next = `${base} (${n})${ext}`;
	}
	used.add(next);
	return next;
}

function u16(view: DataView, offset: number, value: number) {
	view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number) {
	view.setUint32(offset, value, true);
}

export function zipLocalHeader(name: Uint8Array, crc: number, size: number): Uint8Array {
	const buf = new Uint8Array(30 + name.length);
	const view = new DataView(buf.buffer);
	u32(view, 0, 0x04034b50);
	u16(view, 4, 20);
	u16(view, 6, 0);
	u16(view, 8, 0);
	u16(view, 10, 0);
	u16(view, 12, 0);
	u32(view, 14, crc);
	u32(view, 18, size);
	u32(view, 22, size);
	u16(view, 26, name.length);
	u16(view, 28, 0);
	buf.set(name, 30);
	return buf;
}

export function zipCentralHeader(
	name: Uint8Array,
	crc: number,
	size: number,
	localOffset: number
): Uint8Array {
	const buf = new Uint8Array(46 + name.length);
	const view = new DataView(buf.buffer);
	u32(view, 0, 0x02014b50);
	u16(view, 4, 20);
	u16(view, 6, 20);
	u16(view, 8, 0);
	u16(view, 10, 0);
	u16(view, 12, 0);
	u16(view, 14, 0);
	u32(view, 16, crc);
	u32(view, 20, size);
	u32(view, 24, size);
	u16(view, 28, name.length);
	u16(view, 30, 0);
	u16(view, 32, 0);
	u16(view, 34, 0);
	u16(view, 36, 0);
	u32(view, 38, 0);
	u32(view, 42, localOffset);
	buf.set(name, 46);
	return buf;
}

export function zipEocd(count: number, centralSize: number, centralOffset: number): Uint8Array {
	const buf = new Uint8Array(22);
	const view = new DataView(buf.buffer);
	u32(view, 0, 0x06054b50);
	u16(view, 4, 0);
	u16(view, 6, 0);
	u16(view, 8, count);
	u16(view, 10, count);
	u32(view, 12, centralSize);
	u32(view, 16, centralOffset);
	u16(view, 20, 0);
	return buf;
}
