import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GroupHeading from './GroupHeading.svelte';

describe('GroupHeading', () => {
	test('month heading is one chip with label, year, and count', async () => {
		await render(GroupHeading, { label: 'September', detail: '2026', count: 12 });
		const heading = document.querySelector('h2');
		expect(heading?.className).toContain('w-fit');
		expect(heading?.className).not.toContain('bg-background');
		expect(heading?.textContent).toContain('September');
		expect(heading?.textContent).toContain('2026');
		expect(heading?.textContent).toContain('12');
		expect(heading?.querySelector('[data-slot="badge"]')?.className).toContain('text-lg');
		expect(heading?.querySelectorAll('[data-slot="badge"]').length).toBe(1);
		expect(heading?.querySelector('[data-slot="separator"]')).toBeNull();
		expect(document.querySelector('h3')).toBeNull();
	});

	test('letter heading omits the year and still shows a zero count', async () => {
		await render(GroupHeading, { label: 'B', count: 0, level: 3, class: 'px-1' });
		const heading = document.querySelector('h3');
		expect(heading?.textContent?.replace(/\s+/g, ' ').trim()).toBe('B 0');
		expect(heading?.className).toContain('w-fit');
		expect(heading?.className).toContain('px-1');
		expect(heading?.querySelectorAll('[data-slot="badge"]').length).toBe(1);
		expect(heading?.querySelector('[data-slot="separator"]')).toBeNull();
		expect(document.querySelector('h2')).toBeNull();
	});

	test('heading without a count is just the label', async () => {
		await render(GroupHeading, { label: 'Unknown date' });
		const heading = document.querySelector('h2');
		expect(heading?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Unknown date');
		expect(heading?.querySelectorAll('[data-slot="badge"]').length).toBe(1);
	});
});
