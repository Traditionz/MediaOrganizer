import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CopyableTextHost from '../../test-utils/CopyableTextHost.svelte';

describe('CopyableText', () => {
	test('renders children and is not draggable', async () => {
		await render(CopyableTextHost);
		const el = document.querySelector('.copyable-text');
		expect(el?.textContent).toContain('copy me');
		expect(el?.className).toContain('extra');
	});
});
