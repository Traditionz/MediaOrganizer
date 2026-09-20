import { describe, expect, test } from 'bun:test';
import {
	crc32,
	zipCentralHeader,
	zipEocd,
	zipFileTooLarge,
	zipLocalHeader,
	zipNameBytes,
	zipUniqueName
} from './zipFormat';

describe('zip format', () => {
	test('crc32 of empty is 0', () => {
		expect(crc32(new Uint8Array())).toBe(0);
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
	});

	test('headers round-trip sizes', () => {
		const name = zipNameBytes('folder\\a.jpg');
		expect(new TextDecoder().decode(name)).toBe('folder/a.jpg');
		const local = zipLocalHeader(name, 1, 2);
		expect(local[0]).toBe(0x50);
		expect(local.length).toBe(30 + name.length);
		const central = zipCentralHeader(name, 1, 2, 0);
		expect(central.length).toBe(46 + name.length);
		const eocd = zipEocd(1, central.length, local.length + 2);
		expect(eocd.length).toBe(22);
		expect(zipFileTooLarge(-1)).toBe(true);
		expect(zipFileTooLarge(10)).toBe(false);
		expect(zipFileTooLarge(0xffffffff)).toBe(true);
		const used = new Set<string>();
		expect(zipUniqueName('a.jpg', used)).toBe('a.jpg');
		expect(zipUniqueName('a.jpg', used)).toBe('a (2).jpg');
		expect(zipUniqueName('a.jpg', used)).toBe('a (3).jpg');
		expect(zipUniqueName('', used)).toBe('file');
		expect(zipUniqueName('\\x', used)).toBe('x');
	});
});
