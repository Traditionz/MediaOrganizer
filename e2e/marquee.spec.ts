import { expect, test } from '@playwright/test';
import {
	createProfile,
	fixtures,
	library,
	mediaCards,
	openProfileGate,
	uniqueName,
	uploadFiles,
	waitForUploadIdle
} from './helpers';

async function dragMarquee(
	page: import('@playwright/test').Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
	options?: { modifiers?: ('ControlOrMeta' | 'Shift' | 'Alt')[] }
) {
	if (options?.modifiers?.includes('ControlOrMeta')) {
		await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
	}
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 16 });
}

async function releaseMarquee(
	page: import('@playwright/test').Page,
	options?: { modifiers?: ('ControlOrMeta' | 'Shift' | 'Alt')[] }
) {
	await page.mouse.up();
	if (options?.modifiers?.includes('ControlOrMeta')) {
		await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
	}
}

test.describe('marquee selection', () => {
	test.beforeEach(async ({ page }) => {
		await openProfileGate(page);
		await createProfile(page, uniqueName('Marquee'));
		await page.getByRole('radio', { name: 'Grid' }).click();
		await uploadFiles(page, [fixtures.photoA, fixtures.photoB, fixtures.vacation]);
		await waitForUploadIdle(page);
		await expect(mediaCards(page)).toHaveCount(3);
	});

	test('drag empty space shows rect and selects cards live', async ({ page }) => {
		const surface = library(page);
		const box = await surface.boundingBox();
		if (!box) throw new Error('library surface missing');

		const cards = mediaCards(page);
		const first = await cards.nth(0).boundingBox();
		const last = await cards.nth(2).boundingBox();
		if (!first || !last) throw new Error('cards missing boxes');

		const start = { x: box.x + 8, y: Math.min(first.y, last.y) - 8 };
		const end = {
			x: Math.max(first.x + first.width, last.x + last.width) + 8,
			y: Math.max(first.y + first.height, last.y + last.height) + 8
		};

		await dragMarquee(page, start, end);

		const rect = surface.locator('.pointer-events-none.absolute.z-20.border');
		await expect(rect).toBeVisible();
		await expect(page.getByText(/\d+ selected/)).toBeVisible();
		await expect(surface.locator('.media-card.ring-2')).not.toHaveCount(0);

		await releaseMarquee(page);
		await expect(rect).toBeHidden();
		await expect(page.getByText(/\d+ selected/)).toBeVisible();
	});

	test('tiny click on empty space clears selection', async ({ page }) => {
		await mediaCards(page).first().click();
		await expect(page.getByText(/selected/)).toBeVisible();

		const surface = library(page);
		const box = await surface.boundingBox();
		if (!box) throw new Error('library surface missing');

		await page.mouse.move(box.x + 6, box.y + 6);
		await page.mouse.down();
		await page.mouse.move(box.x + 7, box.y + 7);
		await page.mouse.up();

		await expect(page.getByRole('button', { name: 'Select' })).toBeVisible();
		await expect(surface.locator('.media-card.ring-2')).toHaveCount(0);
	});

	test('pointer down on card does not start marquee', async ({ page }) => {
		const card = mediaCards(page).first();
		const box = await card.boundingBox();
		if (!box) throw new Error('card missing box');

		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, {
			steps: 10
		});

		await expect(library(page).locator('.pointer-events-none.absolute.z-20.border')).toHaveCount(
			0
		);
		await page.mouse.up();
	});

	test('ctrl marquee unions with existing selection', async ({ page }) => {
		const cards = mediaCards(page);
		await cards.nth(0).click();
		await expect(page.getByText('1 selected')).toBeVisible();

		const second = await cards.nth(1).boundingBox();
		const third = await cards.nth(2).boundingBox();
		if (!second || !third) throw new Error('cards missing boxes');

		const start = { x: second.x - 4, y: second.y - 4 };
		const end = {
			x: third.x + third.width + 4,
			y: third.y + third.height + 4
		};

		await dragMarquee(page, start, end, { modifiers: ['ControlOrMeta'] });
		await expect(page.getByText(/[23] selected/)).toBeVisible();
		await releaseMarquee(page, { modifiers: ['ControlOrMeta'] });
		await expect(page.getByText(/[23] selected/)).toBeVisible();
	});
});
