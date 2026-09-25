import { page } from 'vitest/browser';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import MediaCard from './MediaCard.svelte';
import { renderWithApp } from '../../test-utils/renderWithApp';
import { testLoad, testMedia, testVideo } from '../../test-utils/fixtures';
import { installFetch } from '../../test-utils/mockFetch';
import { endInternalDrag, getInternalDrag } from '$lib/dragSession';
import { MEDIA_IDS_MIME } from '$lib/mediaDropTargets';

let restoreFetch: (() => void) | null = null;

function useFetch(handler: Parameters<typeof installFetch>[0]) {
	restoreFetch?.();
	restoreFetch = installFetch(handler);
}

function thumbPosts(status: number) {
	const posts: string[] = [];
	useFetch((url, init) => {
		if (init?.method === 'POST') posts.push(url);
		return new Response(null, { status });
	});
	return posts;
}

const card = () => document.querySelector<HTMLElement>('.media-card');
const img = () => document.querySelector<HTMLImageElement>('.media-card img');

function drag(type: 'dragstart' | 'dragend', dataTransfer?: DataTransfer) {
	card()?.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
}

function key(k: string) {
	card()?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

beforeEach(() => {
	useFetch(() => new Response(null, { status: 500 }));
});

afterEach(() => {
	endInternalDrag();
});

afterAll(() => {
	restoreFetch?.();
});

describe('MediaCard', () => {
	test('renders image name and album chip', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia() }
		});
		await expect.element(page.getByText('Trip').first()).toBeVisible();
	});

	test('shows checkbox when selected', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia(), selected: true, selectMode: true }
		});
		await expect.element(page.getByRole('checkbox')).toBeVisible();
	});

	test('fires favorite from heart for a video', async () => {
		let fav: { id: string; favorite: boolean } | null = null;
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: {
				item: testVideo({ favorite: false }),
				onfavorite: (id, favorite) => {
					fav = { id, favorite };
				}
			}
		});
		await page.getByRole('button', { name: 'Favorite' }).click();
		expect(fav).toEqual({ id: 'v1', favorite: true });
	});

	test('unfavorite from a favorited item', async () => {
		let fav: { id: string; favorite: boolean } | null = null;
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: {
				item: testMedia({ favorite: true, has_thumbnail: true }),
				onfavorite: (id, favorite) => {
					fav = { id, favorite };
				}
			}
		});
		const button = document.querySelector<HTMLButtonElement>('button[aria-label="Unfavorite"]');
		button?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		button?.click();
		expect(fav).toEqual({ id: 'm1', favorite: false });
		expect(document.querySelector('.mo-favorite-icon')).toBeTruthy();
	});

	test('favorite without handler shows a static heart', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia({ favorite: true, has_thumbnail: true }) }
		});
		expect(document.querySelector('.mo-favorite-icon')).toBeTruthy();
		expect(document.querySelector('button[aria-label]')).toBeNull();
	});

	test('context menu callback', async () => {
		let saw = false;
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: {
				item: testMedia(),
				oncontextmenu: () => {
					saw = true;
				}
			}
		});
		expect(card()).toBeTruthy();
		card()?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		expect(saw).toBe(true);
	});

	test('context menu without handler still prevents the native menu', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia({ has_thumbnail: true }) }
		});
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		card()?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});

	test('album chip shows overflow count, hides for empty or missing albums', async () => {
		const screen = await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia({ album_names: ['Trip', 'Beach'], has_thumbnail: true }) }
		});
		await expect.element(page.getByText('Trip +1').first()).toBeVisible();
		expect(document.querySelector('[title="Trip, Beach"]')).toBeTruthy();
		await screen.rerender({
			componentProps: { item: testMedia({ album_names: [], has_thumbnail: true }) }
		});
		await expect.poll(() => document.body.textContent?.includes('Trip')).toBe(false);
		await screen.rerender({
			componentProps: { item: testMedia({ album_names: undefined, has_thumbnail: true }) }
		});
		expect(document.body.textContent?.includes('Trip')).toBe(false);
	});

	test('album chip moves into the footer when the checkbox shows', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia({ has_thumbnail: true }), selectMode: true }
		});
		expect(document.querySelectorAll('[title="Trip"]')).toHaveLength(1);
	});

	test('keyboard Enter and Space activate; other keys do not', async () => {
		const clicks: string[] = [];
		const screen = await renderWithApp(MediaCard, {
			load: testLoad(),
			props: {
				item: testMedia({ has_thumbnail: true }),
				onclick: (e) => clicks.push(e.type)
			}
		});
		key('Enter');
		key(' ');
		key('a');
		expect(clicks).toEqual(['keydown', 'keydown']);
		await screen.rerender({ componentProps: { item: testMedia({ has_thumbnail: true }) } });
		key('Enter');
		expect(clicks).toHaveLength(2);
	});

	test('checkbox toggles through onclick without bubbling to the card', async () => {
		const clicks: string[] = [];
		const screen = await renderWithApp(MediaCard, {
			load: testLoad(),
			props: {
				item: testMedia({ has_thumbnail: true }),
				selectMode: true,
				onclick: (e) => clicks.push(e.type)
			}
		});
		const box = page.getByRole('checkbox');
		box.element().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await box.click();
		expect(clicks).toEqual(['click']);
		await screen.rerender({
			componentProps: { item: testMedia({ has_thumbnail: true }), selectMode: true }
		});
		await box.click();
		expect(clicks).toEqual(['click']);
	});

	test('drag without dataTransfer is ignored', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia({ has_thumbnail: true }) }
		});
		drag('dragstart');
		expect(getInternalDrag()).toBeNull();
		expect(card()?.classList.contains('opacity-40')).toBe(false);
	});

	test('drag uses the multi-selection when the card is part of it', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia({ has_thumbnail: true }), selectedIds: new Set(['m1', 'm2']) }
		});
		const dt = new DataTransfer();
		drag('dragstart', dt);
		expect(getInternalDrag()?.mediaIds).toEqual(['m1', 'm2']);
		expect(dt.getData(MEDIA_IDS_MIME)).toBe('["m1","m2"]');
		expect(dt.getData('text/plain')).toBe('media:m1,m2');
		await expect.poll(() => card()?.classList.contains('opacity-40')).toBe(true);
		drag('dragend');
		expect(getInternalDrag()).toBeNull();
		await expect.poll(() => card()?.classList.contains('opacity-40')).toBe(false);
	});

	test.each([
		['no selection set', undefined],
		['single selection', new Set(['m1'])],
		['selection without this card', new Set(['m2', 'm3'])]
	])('drag falls back to the card id with %s', async (_name, selectedIds) => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia({ has_thumbnail: true }), selectedIds }
		});
		const dt = new DataTransfer();
		drag('dragstart', dt);
		expect(getInternalDrag()?.mediaIds).toEqual(['m1']);
	});

	test('image thumbnail retries, then falls back to the original', async () => {
		thumbPosts(200);
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia({ has_thumbnail: true }) }
		});
		await expect
			.poll(() => {
				img()?.dispatchEvent(new Event('error'));
				return img()?.getAttribute('src');
			})
			.toBe('/api/media/m1');
		img()?.dispatchEvent(new Event('error'));
		expect(img()?.getAttribute('src')).toBe('/api/media/m1');
		img()?.removeAttribute('src');
		img()?.dispatchEvent(new Event('error'));
		expect(img()?.getAttribute('src')).toBeNull();
	});

	test('video poster errors regenerate the thumbnail twice, then stop', async () => {
		const posts = thumbPosts(200);
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testVideo({ has_thumbnail: true }) }
		});
		await expect
			.poll(() => {
				img()?.dispatchEvent(new Event('error'));
				return posts.length;
			})
			.toBe(2);
		img()?.dispatchEvent(new Event('error'));
		img()?.setAttribute('src', '/elsewhere.jpg');
		img()?.dispatchEvent(new Event('error'));
		img()?.removeAttribute('src');
		img()?.dispatchEvent(new Event('error'));
		await new Promise((r) => setTimeout(r, 30));
		expect(posts).toEqual(['/api/media/v1/thumbnail', '/api/media/v1/thumbnail']);
	});

	test('lazy thumbnail generates for an on-screen video', async () => {
		const { promise, resolve } = Promise.withResolvers<void>();
		const posts: string[] = [];
		useFetch(async (url, init) => {
			if (init?.method === 'POST') posts.push(url);
			await promise;
			return new Response(null, { status: 200 });
		});
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testVideo({ id: 'lazy' }) }
		});
		await expect.element(page.getByLabelText('Generating thumbnail')).toBeVisible();
		expect(img()).toBeNull();
		await expect.poll(() => posts).toContain('/api/media/lazy/thumbnail');
		resolve();
		await expect.poll(() => img()).toBeTruthy();
		expect(page.getByLabelText('Generating thumbnail').query()).toBeNull();
	});

	test('lazy thumbnail success marks the library item as having a thumbnail', async () => {
		thumbPosts(200);
		const video = testVideo({ id: 'marked' });
		const { app } = await renderWithApp(MediaCard, {
			load: testLoad({ media: [video] }),
			props: { item: video }
		});
		await expect.poll(() => img()).toBeTruthy();
		await expect
			.poll(() => app.library.media.find((m) => m.id === 'marked')?.has_thumbnail)
			.toBe(true);
	});

	test('failed or throwing thumbnail requests leave the placeholder', async () => {
		const posts = thumbPosts(500);
		const screen = await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testVideo() }
		});
		await expect.poll(() => posts.length).toBe(1);
		await expect.poll(() => page.getByLabelText('Generating thumbnail').query()).toBeNull();
		await screen.rerender({ componentProps: { item: testVideo({ view_count: 3 }) } });
		await new Promise((r) => setTimeout(r, 30));
		expect(posts).toHaveLength(1);
		expect(img()).toBeNull();
	});

	test('throwing thumbnail request leaves the placeholder', async () => {
		let calls = 0;
		useFetch(() => {
			calls += 1;
			throw new Error('offline');
		});
		await renderWithApp(MediaCard, { load: testLoad(), props: { item: testVideo() } });
		await expect.poll(() => calls).toBe(1);
		await expect.poll(() => page.getByLabelText('Generating thumbnail').query()).toBeNull();
		expect(img()).toBeNull();
	});

	test('runs thumbnail work immediately without IntersectionObserver', async () => {
		const posts = thumbPosts(500);
		const saved = globalThis.IntersectionObserver;
		Reflect.deleteProperty(globalThis, 'IntersectionObserver');
		try {
			const screen = await renderWithApp(MediaCard, {
				load: testLoad(),
				props: { item: testMedia() }
			});
			await expect.poll(() => posts.length).toBe(1);
			screen.unmount();
		} finally {
			globalThis.IntersectionObserver = saved;
		}
	});

	test('off-screen cards wait for intersection before generating', async () => {
		const posts = thumbPosts(500);
		const saved = globalThis.IntersectionObserver;
		let callbacks = 0;
		globalThis.IntersectionObserver = class extends saved {
			constructor(cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
				super((entries, observer) => {
					callbacks += 1;
					cb(entries, observer);
				}, init);
			}
		};
		try {
			await renderWithApp(MediaCard, {
				load: testLoad(),
				props: {
					item: testMedia(),
					style: 'position: fixed; top: 100000px; left: 0; width: 10px; height: 10px'
				}
			});
			await expect.poll(() => callbacks).toBeGreaterThan(0);
			expect(posts).toEqual([]);
		} finally {
			globalThis.IntersectionObserver = saved;
		}
	});

	test('cards that need no thumbnail clean up on unmount', async () => {
		const screen = await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testVideo({ has_thumbnail: true, duration: null }), variant: 'collage' }
		});
		expect(card()?.classList.contains('rounded-lg')).toBe(true);
		screen.unmount();
		expect(card()).toBeNull();
	});
});
