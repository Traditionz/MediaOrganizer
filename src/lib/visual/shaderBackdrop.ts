/** Pure helpers for ShaderBackdrop (shadergradient-inspired). */

export type Rgb = readonly [number, number, number];

export function prefersReducedMotion(
	matchMedia: (query: string) => { matches: boolean } = globalThis.matchMedia?.bind(globalThis) ??
		(() => ({ matches: false }))
): boolean {
	try {
		return matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch {
		return false;
	}
}

/** Clamp animation speed for WebGL uniform. */
export function clampShaderSpeed(speed: number): number {
	if (!Number.isFinite(speed)) return 0.25;
	return Math.min(1.5, Math.max(0, speed));
}

/**
 * Parse CSS color strings like `oklch(...)` is hard without canvas —
 * accept `#rgb` / `#rrggbb` / `rgb()` / `rgba()` for uniforms.
 */
export function parseCssRgb(input: string): Rgb | null {
	const raw = input.trim();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
	if (hex) {
		const h = hex[1];
		if (h.length === 3) {
			return [
				Number.parseInt(h[0] + h[0], 16) / 255,
				Number.parseInt(h[1] + h[1], 16) / 255,
				Number.parseInt(h[2] + h[2], 16) / 255
			];
		}
		return [
			Number.parseInt(h.slice(0, 2), 16) / 255,
			Number.parseInt(h.slice(2, 4), 16) / 255,
			Number.parseInt(h.slice(4, 6), 16) / 255
		];
	}
	const rgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(raw);
	if (rgb) {
		return [
			Math.min(1, Math.max(0, Number(rgb[1]) / 255)),
			Math.min(1, Math.max(0, Number(rgb[2]) / 255)),
			Math.min(1, Math.max(0, Number(rgb[3]) / 255))
		];
	}
	return null;
}

export const DEFAULT_SHADER_COLORS: readonly Rgb[] = [
	[0.82, 0.86, 0.88],
	[0.72, 0.8, 0.78],
	[0.9, 0.86, 0.8]
];

export const DEFAULT_SHADER_COLORS_DARK: readonly Rgb[] = [
	[0.12, 0.16, 0.18],
	[0.1, 0.18, 0.2],
	[0.18, 0.14, 0.12]
];

export function resolveShaderPalette(
	a: string | undefined,
	b: string | undefined,
	c: string | undefined,
	dark: boolean
): readonly [Rgb, Rgb, Rgb] {
	const fallback = dark ? DEFAULT_SHADER_COLORS_DARK : DEFAULT_SHADER_COLORS;
	return [
		(a ? parseCssRgb(a) : null) ?? fallback[0],
		(b ? parseCssRgb(b) : null) ?? fallback[1],
		(c ? parseCssRgb(c) : null) ?? fallback[2]
	];
}

export const SHADER_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const SHADER_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform float u_speed;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;

float n(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float soft(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = n(i);
  float b = n(i + vec2(1.0, 0.0));
  float c = n(i + vec2(0.0, 1.0));
  float d = n(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  float t = u_time * u_speed;
  vec2 uv = v_uv;
  float f1 = soft(uv * 2.2 + vec2(t * 0.15, t * 0.08));
  float f2 = soft(uv * 3.1 + vec2(-t * 0.1, t * 0.12));
  float f3 = soft(uv * 1.4 + vec2(t * 0.05, -t * 0.07));
  vec3 col = mix(u_c1, u_c2, smoothstep(0.2, 0.8, f1));
  col = mix(col, u_c3, smoothstep(0.15, 0.85, f2) * 0.65);
  col += (f3 - 0.5) * 0.04;
  outColor = vec4(col, 1.0);
}`;
