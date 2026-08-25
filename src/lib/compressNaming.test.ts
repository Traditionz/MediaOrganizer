import { describe, expect, test } from 'bun:test';
import { renameWithExt } from '$lib/compressNaming';

describe('compressNaming', () => {
	test('renameWithExt swaps extension', () => {
		expect(renameWithExt('photo.jpg', '.avif')).toBe('photo.avif');
		expect(renameWithExt('clip.mov', '.mp4')).toBe('clip.mp4');
		expect(renameWithExt('noext', '.webp')).toBe('noext.webp');
	});
});
