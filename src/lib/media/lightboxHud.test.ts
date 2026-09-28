import { describe, expect, test } from 'bun:test';
import {
	LIGHTBOX_CHIP_ACTIVE,
	LIGHTBOX_CHIP_BASE,
	LIGHTBOX_CLOSE_CHIP,
	LIGHTBOX_ICON_CHIP,
	lightboxActionChipClass,
	lightboxFavoriteChipClass,
	lightboxInfoChipClass
} from './lightboxHud';

describe('lightboxFavoriteChipClass', () => {
	test('idle when not favorited', () => {
		const cls = lightboxFavoriteChipClass(false);
		expect(cls).toBe(LIGHTBOX_ICON_CHIP);
		expect(cls).not.toContain(LIGHTBOX_CHIP_ACTIVE);
	});

	test('active when favorited', () => {
		const cls = lightboxFavoriteChipClass(true);
		expect(cls).toContain(LIGHTBOX_ICON_CHIP);
		expect(cls).toContain(LIGHTBOX_CHIP_ACTIVE);
		expect(cls).toContain('size-8');
	});
});

describe('lightboxInfoChipClass', () => {
	test('idle when panel closed', () => {
		const cls = lightboxInfoChipClass(false);
		expect(cls).toBe(LIGHTBOX_CHIP_BASE);
		expect(cls).not.toContain(LIGHTBOX_CHIP_ACTIVE);
	});

	test('active when panel open', () => {
		const cls = lightboxInfoChipClass(true);
		expect(cls).toContain(LIGHTBOX_CHIP_BASE);
		expect(cls).toContain(LIGHTBOX_CHIP_ACTIVE);
	});
});

describe('lightboxActionChipClass', () => {
	test('returns idle chip base for rotate and similar', () => {
		expect(lightboxActionChipClass()).toBe(LIGHTBOX_CHIP_BASE);
		expect(LIGHTBOX_CLOSE_CHIP).toBe(LIGHTBOX_ICON_CHIP);
		expect(LIGHTBOX_CLOSE_CHIP).toContain('size-8');
	});
});
