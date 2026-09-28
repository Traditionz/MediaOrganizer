import { exifDateToIso } from './captureDate';

export type ParsedExif = {
	capturedAt: string | null;
	cameraMake: string | null;
	cameraModel: string | null;
	gpsLat: number | null;
	gpsLng: number | null;
};

const TYPE_BYTE = 1;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_SLONG = 9;
const TYPE_SRATIONAL = 10;

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;

const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LNG_REF = 0x0003;
const GPS_LNG = 0x0004;

function emptyExif(): ParsedExif {
	return {
		capturedAt: null,
		cameraMake: null,
		cameraModel: null,
		gpsLat: null,
		gpsLng: null
	};
}

function skipJpegToTiff(bytes: Uint8Array): Uint8Array {
	if (bytes.length >= 6 && bytes[0] === 0x45 && bytes[1] === 0x78 && bytes[2] === 0x69) {
		// "Exif\0\0"
		return bytes.subarray(6);
	}
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
		let offset = 2;
		while (offset + 4 < bytes.length) {
			if (bytes[offset] !== 0xff) break;
			const marker = bytes[offset + 1];
			const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
			if (marker === 0xe1 && offset + 4 + 6 <= bytes.length) {
				const start = offset + 4;
				if (bytes[start] === 0x45 && bytes[start + 1] === 0x78 && bytes[start + 2] === 0x69) {
					return bytes.subarray(start + 6);
				}
			}
			offset += 2 + size;
		}
	}
	return bytes;
}

function u16(view: DataView, offset: number, le: boolean): number {
	if (offset + 2 > view.byteLength) return 0;
	return view.getUint16(offset, le);
}

function u32(view: DataView, offset: number, le: boolean): number {
	if (offset + 4 > view.byteLength) return 0;
	return view.getUint32(offset, le);
}

function i32(view: DataView, offset: number, le: boolean): number {
	if (offset + 4 > view.byteLength) return 0;
	return view.getInt32(offset, le);
}

function typeSize(type: number): number {
	if (type === TYPE_BYTE || type === TYPE_ASCII) return 1;
	if (type === TYPE_SHORT) return 2;
	if (type === TYPE_LONG || type === TYPE_SLONG) return 4;
	if (type === TYPE_RATIONAL || type === TYPE_SRATIONAL) return 8;
	return 0;
}

function asciiAt(bytes: Uint8Array, offset: number, count: number): string {
	const end = Math.min(bytes.length, offset + count);
	let out = '';
	for (let i = offset; i < end; i++) {
		const c = bytes[i];
		if (c === 0) break;
		out += String.fromCharCode(c);
	}
	return out.trim();
}

type IfdEntry = {
	tag: number;
	type: number;
	count: number;
	valueOffset: number;
};

function readIfd(view: DataView, bytes: Uint8Array, ifdOffset: number, le: boolean): IfdEntry[] {
	if (ifdOffset < 0 || ifdOffset + 2 > view.byteLength) return [];
	const count = u16(view, ifdOffset, le);
	if (count <= 0 || count > 256) return [];
	const entries: IfdEntry[] = [];
	for (let i = 0; i < count; i++) {
		const at = ifdOffset + 2 + i * 12;
		if (at + 12 > view.byteLength) break;
		entries.push({
			tag: u16(view, at, le),
			type: u16(view, at + 2, le),
			count: u32(view, at + 4, le),
			valueOffset: u32(view, at + 8, le)
		});
	}
	return entries;
}

function readAscii(bytes: Uint8Array, view: DataView, entry: IfdEntry, le: boolean): string | null {
	if (entry.type !== TYPE_ASCII || entry.count < 2) return null;
	const size = entry.count;
	if (size <= 4) {
		const buf = new Uint8Array(4);
		const v = entry.valueOffset;
		if (le) {
			buf[0] = v & 0xff;
			buf[1] = (v >> 8) & 0xff;
			buf[2] = (v >> 16) & 0xff;
			buf[3] = (v >> 24) & 0xff;
		} else {
			buf[0] = (v >> 24) & 0xff;
			buf[1] = (v >> 16) & 0xff;
			buf[2] = (v >> 8) & 0xff;
			buf[3] = v & 0xff;
		}
		return asciiAt(buf, 0, size);
	}
	const off = entry.valueOffset;
	if (off < 0 || off + size > bytes.length) return null;
	return asciiAt(bytes, off, size);
}

function readLong(entry: IfdEntry): number {
	return entry.valueOffset;
}

function readRationals(view: DataView, entry: IfdEntry, le: boolean, signed: boolean): number[] {
	const n = entry.count;
	if (n <= 0 || n > 8) return [];
	const off = entry.valueOffset;
	const out: number[] = [];
	for (let i = 0; i < n; i++) {
		const at = off + i * 8;
		const num = signed ? i32(view, at, le) : u32(view, at, le);
		const den = signed ? i32(view, at + 4, le) : u32(view, at + 4, le);
		if (den === 0) return [];
		out.push(num / den);
	}
	return out;
}

function dmsToDecimal(parts: number[], ref: string): number | null {
	if (parts.length < 3) return null;
	const deg = parts[0] + parts[1] / 60 + parts[2] / 3600;
	if (!Number.isFinite(deg)) return null;
	const upper = ref.trim().toUpperCase();
	if (upper === 'S' || upper === 'W') return -deg;
	return deg;
}

function applyGps(
	parsed: ParsedExif,
	view: DataView,
	bytes: Uint8Array,
	gpsOffset: number,
	le: boolean
) {
	const entries = readIfd(view, bytes, gpsOffset, le);
	let latRef = 'N';
	let lngRef = 'E';
	let latParts: number[] = [];
	let lngParts: number[] = [];
	for (const entry of entries) {
		if (entry.tag === GPS_LAT_REF) {
			latRef = readAscii(bytes, view, entry, le) ?? latRef;
		} else if (entry.tag === GPS_LNG_REF) {
			lngRef = readAscii(bytes, view, entry, le) ?? lngRef;
		} else if (entry.tag === GPS_LAT) {
			latParts = readRationals(view, entry, le, false);
		} else if (entry.tag === GPS_LNG) {
			lngParts = readRationals(view, entry, le, false);
		}
	}
	const lat = dmsToDecimal(latParts, latRef);
	const lng = dmsToDecimal(lngParts, lngRef);
	if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
		parsed.gpsLat = lat;
		parsed.gpsLng = lng;
	}
}

function applyExifIfd(
	parsed: ParsedExif,
	view: DataView,
	bytes: Uint8Array,
	offset: number,
	le: boolean
) {
	const entries = readIfd(view, bytes, offset, le);
	let digitized: string | null = null;
	for (const entry of entries) {
		if (entry.tag === TAG_DATETIME_ORIGINAL) {
			const text = readAscii(bytes, view, entry, le);
			if (text) parsed.capturedAt = exifDateToIso(text);
		} else if (entry.tag === TAG_DATETIME_DIGITIZED) {
			const text = readAscii(bytes, view, entry, le);
			if (text) digitized = exifDateToIso(text);
		}
	}
	if (!parsed.capturedAt) parsed.capturedAt = digitized;
}

/** Parse TIFF or JPEG APP1 EXIF bytes. */
export function parseExifBuffer(input: Uint8Array): ParsedExif {
	const parsed = emptyExif();
	const tiff = skipJpegToTiff(input);
	if (tiff.length < 8) return parsed;
	const le = tiff[0] === 0x49 && tiff[1] === 0x49;
	const be = tiff[0] === 0x4d && tiff[1] === 0x4d;
	if (!le && !be) return parsed;
	const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
	const magic = u16(view, 2, le);
	if (magic !== 42) return parsed;
	const ifd0 = u32(view, 4, le);
	const entries = readIfd(view, tiff, ifd0, le);
	let datetimeFallback: string | null = null;
	for (const entry of entries) {
		if (entry.tag === TAG_MAKE) {
			parsed.cameraMake = readAscii(tiff, view, entry, le);
		} else if (entry.tag === TAG_MODEL) {
			parsed.cameraModel = readAscii(tiff, view, entry, le);
		} else if (entry.tag === TAG_DATETIME) {
			const text = readAscii(tiff, view, entry, le);
			if (text) datetimeFallback = exifDateToIso(text);
		} else if (entry.tag === TAG_EXIF_IFD) {
			applyExifIfd(parsed, view, tiff, readLong(entry), le);
		} else if (entry.tag === TAG_GPS_IFD) {
			applyGps(parsed, view, tiff, readLong(entry), le);
		}
	}
	if (!parsed.capturedAt) parsed.capturedAt = datetimeFallback;
	return parsed;
}

export function mergeExif(base: ParsedExif, extra: ParsedExif): ParsedExif {
	return {
		capturedAt: extra.capturedAt ?? base.capturedAt,
		cameraMake: extra.cameraMake ?? base.cameraMake,
		cameraModel: extra.cameraModel ?? base.cameraModel,
		gpsLat: extra.gpsLat ?? base.gpsLat,
		gpsLng: extra.gpsLng ?? base.gpsLng
	};
}
