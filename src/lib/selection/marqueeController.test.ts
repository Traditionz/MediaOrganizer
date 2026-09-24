import { describe, expect, test } from 'bun:test';
import { shouldStartMarquee } from './marqueeController';

function el(className: string, attrs: Record<string, string> = {}) {
	return {
		className,
		closest(sel: string) {
			if (sel === '.media-card' && (className.includes('media-card') || attrs.card)) {
				return this;
			}
			if (
				sel === '[data-slot="scroll-area-scrollbar"]' &&
				attrs.slot === 'scroll-area-scrollbar'
			) {
				return this;
			}
			return null;
		}
	} as unknown as HTMLElement;
}

describe('shouldStartMarquee', () => {
	test('false on missing target', () => {
		expect(shouldStartMarquee(null)).toBe(false);
	});

	test('false on a media card', () => {
		expect(shouldStartMarquee(el('media-card'))).toBe(false);
	});

	test('false on a scrollbar', () => {
		expect(shouldStartMarquee(el('thumb', { slot: 'scroll-area-scrollbar' }))).toBe(false);
	});

	test('true on empty library surface', () => {
		expect(shouldStartMarquee(el('surface'))).toBe(true);
	});
});
