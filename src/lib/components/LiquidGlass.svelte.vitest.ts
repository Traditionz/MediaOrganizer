import { describe, expect, test } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import LiquidGlass from './LiquidGlass.svelte';

const children = createRawSnippet(() => ({ render: () => '<span>inside</span>' }));

describe('LiquidGlass', () => {
	test('mounts a glass shell', async () => {
		const screen = await render(LiquidGlass, { class: 'glass-host', radius: 12, children });
		expect(screen.container.textContent).toContain('inside');
		expect(screen.container.querySelector('.glass-host')).toBeTruthy();
	});

	test('static glass skips the entry animation', async () => {
		const screen = await render(LiquidGlass, { animate: false });
		expect(screen.container.querySelector('.mo-liquid-glass-static')).toBeTruthy();
	});
});
