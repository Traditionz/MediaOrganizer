import { describe, expect, test } from 'bun:test';
import { mergeExif, parseExifBuffer } from './exifParse';

class LeBuf {
	bytes: number[] = [];

	u8(n: number) {
		this.bytes.push(n & 0xff);
	}

	u16(n: number) {
		this.u8(n);
		this.u8(n >> 8);
	}

	u32(n: number) {
		this.u16(n);
		this.u16(n >> 16);
	}

	patchU32(at: number, n: number) {
		this.bytes[at] = n & 0xff;
		this.bytes[at + 1] = (n >> 8) & 0xff;
		this.bytes[at + 2] = (n >> 16) & 0xff;
		this.bytes[at + 3] = (n >> 24) & 0xff;
	}

	asciiZ(text: string) {
		for (let i = 0; i < text.length; i++) this.u8(text.charCodeAt(i));
		this.u8(0);
	}

	get length() {
		return this.bytes.length;
	}

	toUint8() {
		return new Uint8Array(this.bytes);
	}
}

function asciiInline(text: string): number {
	const buf = new Uint8Array(4);
	for (let i = 0; i < 4; i++) buf[i] = i < text.length ? text.charCodeAt(i) : 0;
	return buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24);
}

function buildExif(): Uint8Array {
	const b = new LeBuf();
	b.u8(0x49);
	b.u8(0x49);
	b.u16(42);
	b.u32(8);

	const ifd0Count = 5;
	b.u16(ifd0Count);
	const ifd0EntriesAt = b.length;
	for (let i = 0; i < ifd0Count; i++) {
		for (let k = 0; k < 12; k++) b.u8(0);
	}
	b.u32(0);

	const writeEntry = (index: number, tag: number, type: number, count: number, value: number) => {
		const at = ifd0EntriesAt + index * 12;
		b.bytes[at] = tag & 0xff;
		b.bytes[at + 1] = (tag >> 8) & 0xff;
		b.bytes[at + 2] = type & 0xff;
		b.bytes[at + 3] = (type >> 8) & 0xff;
		b.bytes[at + 4] = count & 0xff;
		b.bytes[at + 5] = (count >> 8) & 0xff;
		b.bytes[at + 6] = (count >> 16) & 0xff;
		b.bytes[at + 7] = (count >> 24) & 0xff;
		b.patchU32(at + 8, value);
	};

	writeEntry(0, 0x010f, 2, 4, asciiInline('ABC\0'));
	writeEntry(1, 0x0110, 2, 4, asciiInline('X\0\0\0'));

	const dt = '2020:05:10 14:30:00';
	const dtAt = b.length;
	b.asciiZ(dt);
	writeEntry(2, 0x0132, 2, dt.length + 1, dtAt);

	const exifIfdAt = b.length;
	b.u16(1);
	const exifEntryAt = b.length;
	for (let k = 0; k < 12; k++) b.u8(0);
	b.u32(0);
	const orig = '2019:06:01 08:09:10';
	const origAt = b.length;
	b.asciiZ(orig);
	b.bytes[exifEntryAt] = 0x03;
	b.bytes[exifEntryAt + 1] = 0x90;
	b.bytes[exifEntryAt + 2] = 2;
	b.bytes[exifEntryAt + 3] = 0;
	b.patchU32(exifEntryAt + 4, orig.length + 1);
	b.patchU32(exifEntryAt + 8, origAt);
	writeEntry(3, 0x8769, 4, 1, exifIfdAt);

	const gpsIfdAt = b.length;
	b.u16(4);
	const gpsEntriesAt = b.length;
	for (let i = 0; i < 4; i++) {
		for (let k = 0; k < 12; k++) b.u8(0);
	}
	b.u32(0);
	const gpsEntry = (index: number, tag: number, type: number, count: number, value: number) => {
		const at = gpsEntriesAt + index * 12;
		b.bytes[at] = tag & 0xff;
		b.bytes[at + 1] = (tag >> 8) & 0xff;
		b.bytes[at + 2] = type & 0xff;
		b.bytes[at + 3] = (type >> 8) & 0xff;
		b.patchU32(at + 4, count);
		b.patchU32(at + 8, value);
	};
	gpsEntry(0, 1, 2, 2, asciiInline('N\0\0\0'));
	const latAt = b.length;
	const rats = [37, 1, 30, 1, 0, 1];
	for (const n of rats) b.u32(n);
	gpsEntry(1, 2, 5, 3, latAt);
	gpsEntry(2, 3, 2, 2, asciiInline('W\0\0\0'));
	const lngAt = b.length;
	const lngRats = [115, 1, 48, 1, 0, 1];
	for (const n of lngRats) b.u32(n);
	gpsEntry(3, 4, 5, 3, lngAt);
	writeEntry(4, 0x8825, 4, 1, gpsIfdAt);

	return b.toUint8();
}

describe('parseExifBuffer', () => {
	test('returns empty for junk', () => {
		expect(parseExifBuffer(new Uint8Array([1, 2, 3]))).toEqual({
			capturedAt: null,
			cameraMake: null,
			cameraModel: null,
			gpsLat: null,
			gpsLng: null
		});
		expect(parseExifBuffer(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2]))).toEqual({
			capturedAt: null,
			cameraMake: null,
			cameraModel: null,
			gpsLat: null,
			gpsLng: null
		});
	});

	test('reads make, model, DateTimeOriginal, GPS', () => {
		const parsed = parseExifBuffer(buildExif());
		expect(parsed.cameraMake).toBe('ABC');
		expect(parsed.cameraModel).toBe('X');
		expect(parsed.capturedAt).toBe('2019-06-01T08:09:10.000Z');
		expect(parsed.gpsLat).toBeCloseTo(37.5, 5);
		expect(parsed.gpsLng).toBeCloseTo(-115.8, 5);
	});

	test('unwraps Exif\\0\\0 prefix', () => {
		const inner = buildExif();
		const prefixed = new Uint8Array(6 + inner.length);
		prefixed.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
		prefixed.set(inner, 6);
		expect(parseExifBuffer(prefixed).cameraMake).toBe('ABC');
	});

	test('unwraps JPEG APP1', () => {
		const inner = buildExif();
		const app1Len = 2 + 6 + inner.length;
		const jpeg = new Uint8Array(4 + app1Len + inner.length);
		jpeg[0] = 0xff;
		jpeg[1] = 0xd8;
		jpeg[2] = 0xff;
		jpeg[3] = 0xe1;
		jpeg[4] = (app1Len >> 8) & 0xff;
		jpeg[5] = app1Len & 0xff;
		jpeg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6);
		jpeg.set(inner, 12);
		expect(parseExifBuffer(jpeg).cameraMake).toBe('ABC');
	});

	test('mergeExif prefers extra', () => {
		const base = parseExifBuffer(new Uint8Array([1]));
		const extra = parseExifBuffer(buildExif());
		expect(mergeExif(base, extra).cameraMake).toBe('ABC');
		expect(mergeExif(extra, base).cameraMake).toBe('ABC');
	});
});
