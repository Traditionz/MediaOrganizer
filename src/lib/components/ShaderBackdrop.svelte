<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { cn } from '$lib/cn.js';
	import {
		SHADER_FRAG,
		SHADER_VERT,
		clampShaderSpeed,
		prefersReducedMotion,
		resolveShaderPalette,
		type Rgb
	} from '$lib/visual/shaderBackdrop';

	interface Props {
		class?: string;
		speed?: number;
		/** When true, cover parent instead of viewport. */
		inset?: boolean;
	}

	let { class: className, speed = 0.22, inset = false }: Props = $props();

	let useCssFallback = $state(false);

	const attachShader: Attachment<HTMLCanvasElement> = (canvas) => {
		if (prefersReducedMotion()) {
			useCssFallback = true;
			return;
		}

		const gl = canvas.getContext('webgl2', {
			alpha: false,
			antialias: false,
			powerPreference: 'low-power'
		});
		if (!gl) {
			useCssFallback = true;
			return;
		}

		const dark = document.documentElement.classList.contains('dark');
		const styles = getComputedStyle(document.documentElement);
		const palette = resolveShaderPalette(
			styles.getPropertyValue('--shader-a').trim() || undefined,
			styles.getPropertyValue('--shader-b').trim() || undefined,
			styles.getPropertyValue('--shader-c').trim() || undefined,
			dark
		);

		const vs = compile(gl, gl.VERTEX_SHADER, SHADER_VERT);
		const fs = compile(gl, gl.FRAGMENT_SHADER, SHADER_FRAG);
		if (!vs || !fs) {
			useCssFallback = true;
			return;
		}
		const prog = gl.createProgram();
		if (!prog) {
			useCssFallback = true;
			return;
		}
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			useCssFallback = true;
			return;
		}

		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW
		);
		const loc = gl.getAttribLocation(prog, 'a_pos');
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.useProgram(prog);

		const uTime = gl.getUniformLocation(prog, 'u_time');
		const uSpeed = gl.getUniformLocation(prog, 'u_speed');
		const uC1 = gl.getUniformLocation(prog, 'u_c1');
		const uC2 = gl.getUniformLocation(prog, 'u_c2');
		const uC3 = gl.getUniformLocation(prog, 'u_c3');
		setColor(gl, uC1, palette[0]);
		setColor(gl, uC2, palette[1]);
		setColor(gl, uC3, palette[2]);
		gl.uniform1f(uSpeed, clampShaderSpeed(speed));

		let raf = 0;
		let alive = true;
		const start = performance.now();

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			const tw = Math.max(1, Math.floor(w * dpr));
			const th = Math.max(1, Math.floor(h * dpr));
			if (canvas.width !== tw || canvas.height !== th) {
				canvas.width = tw;
				canvas.height = th;
				gl.viewport(0, 0, tw, th);
			}
		};

		const frame = (now: number) => {
			if (!alive) return;
			resize();
			gl.uniform1f(uTime, (now - start) / 1000);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			raf = requestAnimationFrame(frame);
		};

		resize();
		raf = requestAnimationFrame(frame);
		const ro = new ResizeObserver(() => resize());
		ro.observe(canvas);

		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			ro.disconnect();
			gl.deleteProgram(prog);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			gl.deleteBuffer(buf);
		};
	};

	function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
		const sh = gl.createShader(type);
		if (!sh) return null;
		gl.shaderSource(sh, src);
		gl.compileShader(sh);
		if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
			gl.deleteShader(sh);
			return null;
		}
		return sh;
	}

	function setColor(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, c: Rgb) {
		if (!loc) return;
		gl.uniform3f(loc, c[0], c[1], c[2]);
	}
</script>

<div
	class={cn(
		'pointer-events-none overflow-hidden',
		inset ? 'absolute inset-0' : 'fixed inset-0 -z-10',
		className
	)}
	aria-hidden="true"
>
	{#if useCssFallback}
		<div class="mo-shader-fallback absolute inset-0"></div>
	{:else}
		<canvas {@attach attachShader} class="absolute inset-0 h-full w-full"></canvas>
	{/if}
</div>

<style>
	.mo-shader-fallback {
		background:
			radial-gradient(120% 80% at 10% 20%, var(--shader-a) 0%, transparent 55%),
			radial-gradient(100% 90% at 90% 10%, var(--shader-b) 0%, transparent 50%),
			radial-gradient(90% 70% at 50% 100%, var(--shader-c) 0%, transparent 55%), var(--background);
		background-size: 140% 140%;
		animation: mo-shader-drift 28s ease-in-out infinite alternate;
	}
	@keyframes mo-shader-drift {
		from {
			background-position:
				0% 20%,
				100% 0%,
				50% 100%;
		}
		to {
			background-position:
				20% 0%,
				70% 30%,
				40% 80%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.mo-shader-fallback {
			animation: none;
			background-size: 100% 100%;
		}
	}
</style>
