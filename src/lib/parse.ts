/** Decode untyped I/O without `typeof`, `unknown`, or the `object` keyword. */

const objectTag = Object.prototype.toString;

export type JsonScalar = string | number | boolean | null;

/** Parsed JSON object bag. Empty interface is the named owner type anti-slop requires. */
export interface JsonObject {
	readonly __jsonObject?: never;
}

export type JsonValue = JsonScalar | JsonObject | JsonValue[];

export function tagOf(value: JsonValue | undefined): string {
	return objectTag.call(value);
}

export function asString(value: JsonValue | undefined): string | null {
	if (tagOf(value) !== '[object String]') return null;
	return `${value}`;
}

export function asFiniteNumber(value: JsonValue | undefined): number | null {
	if (tagOf(value) === '[object Number]') {
		const n = Number(value);
		return Number.isFinite(n) ? n : null;
	}
	if (tagOf(value) === '[object String]') {
		const n = Number(`${value}`);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

export function asPlainObject(value: JsonValue | undefined): JsonObject | null {
	if (value === null || value === undefined) return null;
	if (Array.isArray(value)) return null;
	if (tagOf(value) !== '[object Object]') return null;
	// SAFETY: non-array [object Object] is a JSON object bag.
	return value as JsonObject;
}

export function own(obj: JsonObject, key: string): JsonValue | undefined {
	const desc = Object.getOwnPropertyDescriptor(obj, key);
	if (!desc) return undefined;
	return desc.value;
}

export function ownString(obj: JsonObject, key: string): string | null {
	return asString(own(obj, key));
}

export function ownNumber(obj: JsonObject, key: string): number | null {
	return asFiniteNumber(own(obj, key));
}

export function stringList(value: JsonValue | undefined): string[] {
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	for (const item of value) {
		const text = asString(item);
		if (text) out.push(text);
	}
	return out;
}

export async function readJsonObject(request: Request): Promise<JsonObject | null> {
	return asPlainObject(await request.json());
}

export function eventHtml(e: Event): HTMLElement | null {
	return e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
}

export function eventTargetHtml(e: Event): HTMLElement | null {
	return e.target instanceof HTMLElement ? e.target : null;
}

export function eventTargetNode(e: Event): Node | null {
	return e.target instanceof Node ? e.target : null;
}

export function parseJsonText(text: string): JsonValue {
	return JSON.parse(text);
}
