import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ShaderBackdrop from './ShaderBackdrop.svelte';

const gl2 = WebGL2RenderingContext.prototype;
const fallback = () => document.querySelector('.mo-shader-fallback');

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('ShaderBackdrop', () => {
	test('mounts canvas or CSS fallback', async () => {
		const screen = await render(ShaderBackdrop, { speed: 0.1, inset: true, class: 'bg' });
		expect(
			screen.container.querySelector('canvas') ?? screen.container.querySelector('.bg')
		).toBeTruthy();
		screen.unmount();
	});

	test('reduced motion uses the CSS fallback in viewport mode', async () => {
		const always = window.matchMedia('(min-width: 0px)');
		vi.spyOn(window, 'matchMedia').mockReturnValue(always);
		const screen = await render(ShaderBackdrop);
		await expect.poll(fallback).toBeTruthy();
		expect(screen.container.querySelector('.fixed.inset-0')).toBeTruthy();
	});

	test('missing WebGL2 context falls back to CSS', async () => {
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		await render(ShaderBackdrop, { inset: true });
		await expect.poll(fallback).toBeTruthy();
	});

	test('null shader falls back to CSS', async () => {
		vi.spyOn(gl2, 'createShader').mockReturnValue(null);
		await render(ShaderBackdrop, { inset: true });
		await expect.poll(fallback).toBeTruthy();
	});

	test('shader compile failure deletes the shader and falls back', async () => {
		vi.spyOn(gl2, 'getShaderParameter').mockReturnValue(false);
		const del = vi.spyOn(gl2, 'deleteShader');
		await render(ShaderBackdrop, { inset: true });
		await expect.poll(fallback).toBeTruthy();
		expect(del).toHaveBeenCalled();
	});

	test('null program falls back to CSS', async () => {
		// SAFETY: older WebGL implementations return null from createProgram; lib.dom types omit it.
		vi.spyOn(gl2, 'createProgram').mockReturnValue(null as never);
		await render(ShaderBackdrop, { inset: true });
		await expect.poll(fallback).toBeTruthy();
	});

	test('link failure falls back to CSS', async () => {
		vi.spyOn(gl2, 'getProgramParameter').mockReturnValue(false);
		await render(ShaderBackdrop, { inset: true });
		await expect.poll(fallback).toBeTruthy();
	});

	test('renders frames, resizes, skips missing uniforms, and tears down', async () => {
		vi.spyOn(gl2, 'getUniformLocation').mockReturnValue(null);
		const uniform3f = vi.spyOn(gl2, 'uniform3f');
		const draw = vi.spyOn(gl2, 'drawArrays');
		const viewport = vi.spyOn(gl2, 'viewport');
		const delProgram = vi.spyOn(gl2, 'deleteProgram');
		vi.stubGlobal('devicePixelRatio', 0);
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
			frames.push(cb);
			return frames.length;
		});
		const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
		const screen = await render(ShaderBackdrop, { inset: true, speed: 0.5 });
		const canvas = screen.container.querySelector('canvas');
		expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		expect(uniform3f).not.toHaveBeenCalled();
		frames[0]?.(performance.now());
		expect(draw).toHaveBeenCalledTimes(1);
		canvas?.style.setProperty('width', '12px');
		canvas?.style.setProperty('height', '6px');
		await expect.poll(() => viewport.mock.lastCall).toEqual([0, 0, 12, 6]);
		frames[1]?.(performance.now());
		expect(draw).toHaveBeenCalledTimes(2);
		screen.unmount();
		expect(cancel).toHaveBeenCalled();
		expect(delProgram).toHaveBeenCalled();
		frames[2]?.(performance.now());
		expect(draw).toHaveBeenCalledTimes(2);
	});

	test('uniform colors upload when locations exist', async () => {
		const uniform3f = vi.spyOn(gl2, 'uniform3f');
		const screen = await render(ShaderBackdrop, { inset: true });
		expect(uniform3f).toHaveBeenCalledTimes(3);
		screen.unmount();
	});
});
