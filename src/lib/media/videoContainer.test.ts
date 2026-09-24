import { describe, expect, test } from 'bun:test';
import { scanVideoContainer, videoContainerProblem } from './videoContainer';

function box(type: string, payload = new Uint8Array()): Uint8Array {
	const size = 8 + payload.length;
	const out = new Uint8Array(size);
	out[0] = (size >>> 24) & 0xff;
	out[1] = (size >>> 16) & 0xff;
	out[2] = (size >>> 8) & 0xff;
	out[3] = size & 0xff;
	out[4] = type.charCodeAt(0);
	out[5] = type.charCodeAt(1);
	out[6] = type.charCodeAt(2);
	out[7] = type.charCodeAt(3);
	out.set(payload, 8);
	return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function reader(bytes: Uint8Array) {
	return (position: number, length: number) => bytes.subarray(position, position + length);
}

describe('scanVideoContainer', () => {
	test('accepts a file with moov', () => {
		const bytes = concat([box('ftyp', new Uint8Array(8)), box('moov'), box('mdat', new Uint8Array(4))]);
		const scan = scanVideoContainer(bytes.length, reader(bytes));
		expect(scan.hasMoov).toBe(true);
		expect(scan.types).toEqual(['ftyp', 'moov', 'mdat']);
		expect(videoContainerProblem(scan)).toBeNull();
	});

	test('flags a missing moov', () => {
		const bytes = concat([box('ftyp', new Uint8Array(8)), box('mdat', new Uint8Array(4))]);
		const scan = scanVideoContainer(bytes.length, reader(bytes));
		expect(videoContainerProblem(scan)).toBe('no-moov');
	});

	test('flags a box that runs past the file', () => {
		const full = concat([box('ftyp', new Uint8Array(8)), box('mdat', new Uint8Array(20))]);
		const cut = full.subarray(0, full.length - 8);
		const scan = scanVideoContainer(cut.length, reader(cut));
		expect(scan.truncatedType).toBe('mdat');
		expect(videoContainerProblem(scan)).toBe('truncated');
	});

	test('flags garbage and empty input', () => {
		const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(videoContainerProblem(scanVideoContainer(garbage.length, reader(garbage)))).toBe(
			'invalid'
		);
		expect(videoContainerProblem(scanVideoContainer(0, () => new Uint8Array()))).toBe('invalid');
	});

	test('ignores trailing bytes after a finished moov', () => {
		const bytes = concat([
			box('ftyp', new Uint8Array(8)),
			box('moov'),
			box('mdat', new Uint8Array(4)),
			new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
		]);
		const scan = scanVideoContainer(bytes.length, reader(bytes));
		expect(scan.hasMoov).toBe(true);
		expect(videoContainerProblem(scan)).toBeNull();
	});

	test('flags matroska and accepts webm', () => {
		const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
		const scan = scanVideoContainer(bytes.length, reader(bytes));
		expect(scan.ebml).toBe(true);
		expect(videoContainerProblem(scan)).toBe('matroska');

		const webm = new Uint8Array([
			0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d
		]);
		expect(videoContainerProblem(scanVideoContainer(webm.length, reader(webm)))).toBeNull();

		const matroska = new Uint8Array([
			0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b, 0x61
		]);
		expect(videoContainerProblem(scanVideoContainer(matroska.length, reader(matroska)))).toBe(
			'matroska'
		);
	});

	test('treats a zero size as the rest of the file and rejects a short largesize', () => {
		const rest = new Uint8Array(12);
		rest[4] = 'm'.charCodeAt(0);
		rest[5] = 'o'.charCodeAt(0);
		rest[6] = 'o'.charCodeAt(0);
		rest[7] = 'v'.charCodeAt(0);
		const scan = scanVideoContainer(rest.length, reader(rest));
		expect(scan.hasMoov).toBe(true);
		expect(videoContainerProblem(scan)).toBeNull();

		const short = new Uint8Array(12);
		short[3] = 1;
		short[4] = 'f'.charCodeAt(0);
		short[5] = 't'.charCodeAt(0);
		short[6] = 'y'.charCodeAt(0);
		short[7] = 'p'.charCodeAt(0);
		expect(videoContainerProblem(scanVideoContainer(short.length, reader(short)))).toBe('invalid');
	});

	test('reads a 64-bit box size', () => {
		const payload = new Uint8Array(4);
		const size = 16 + payload.length;
		const header = new Uint8Array(16 + payload.length);
		header[3] = 1;
		header[4] = 'f'.charCodeAt(0);
		header[5] = 't'.charCodeAt(0);
		header[6] = 'y'.charCodeAt(0);
		header[7] = 'p'.charCodeAt(0);
		header[15] = size & 0xff;
		header.set(payload, 16);
		const bytes = concat([header, box('moov')]);
		const scan = scanVideoContainer(bytes.length, reader(bytes));
		expect(scan.types[0]).toBe('ftyp');
		expect(scan.hasMoov).toBe(true);
		expect(videoContainerProblem(scan)).toBeNull();

		const huge = new Uint8Array(16);
		huge[3] = 1;
		huge[4] = 'f'.charCodeAt(0);
		huge[5] = 't'.charCodeAt(0);
		huge[6] = 'y'.charCodeAt(0);
		huge[7] = 'p'.charCodeAt(0);
		huge[8] = 0x7f;
		expect(videoContainerProblem(scanVideoContainer(huge.length, reader(huge)))).toBe('invalid');
	});
});
