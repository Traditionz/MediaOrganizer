import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MediaLightboxInspector from './MediaLightboxInspector.svelte';
import { testMedia, testVideo } from '../../test-utils/fixtures';

describe('MediaLightboxInspector', () => {
	test('image crop fields submit a normalized box', async () => {
		const boxes: Array<{ id: string; left: number; width: number }> = [];
		await render(MediaLightboxInspector, {
			item: testMedia(),
			oncrop: (id, box) => {
				boxes.push({ id, left: box.left, width: box.width });
			}
		});
		await page.getByRole('textbox', { name: 'Crop left' }).fill('0.2');
		await page.getByRole('button', { name: 'Apply crop' }).click();
		expect(boxes[0]?.id).toBe('m1');
		expect(boxes[0]?.left).toBe(0.2);
	});

	test('top, width, and height fields feed the crop box', async () => {
		const boxes: Array<{ top: number; width: number; height: number }> = [];
		await render(MediaLightboxInspector, {
			item: testMedia(),
			oncrop: (_id, box) => {
				boxes.push({ top: box.top, width: box.width, height: box.height });
			}
		});
		await page.getByRole('textbox', { name: 'Crop top' }).fill('0.3');
		await page.getByRole('textbox', { name: 'Crop width' }).fill('0.5');
		await page.getByRole('textbox', { name: 'Crop height' }).fill('0.4');
		await page.getByRole('button', { name: 'Apply crop' }).click();
		expect(boxes).toEqual([{ top: 0.3, width: 0.5, height: 0.4 }]);
	});

	test('image without oncrop renders nothing', async () => {
		await render(MediaLightboxInspector, { item: testMedia() });
		expect(document.body.textContent?.includes('Crop')).toBe(false);
	});

	test('video with no oncrop renders nothing', async () => {
		await render(MediaLightboxInspector, { item: testVideo() });
		expect(document.body.textContent?.includes('Crop')).toBe(false);
	});
});
