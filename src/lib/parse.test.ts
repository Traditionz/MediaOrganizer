import { describe, expect, test } from 'bun:test';
import {
	asFiniteNumber,
	asPlainObject,
	asString,
	eventHtml,
	eventTargetHtml,
	eventTargetNode,
	own,
	ownNumber,
	ownString,
	parseJsonText,
	readJsonObject,
	stringList,
	tagOf,
	type JsonObject,
	type JsonValue
} from '$lib/parse';

describe('parse', () => {
	test('tagOf identifies primitives', () => {
		expect(tagOf('x')).toBe('[object String]');
		expect(tagOf(1)).toBe('[object Number]');
		expect(tagOf(null)).toBe('[object Null]');
	});

	test('asString accepts strings only', () => {
		expect(asString('hello')).toBe('hello');
		expect(asString(1)).toBeNull();
		expect(asString(null)).toBeNull();
	});

	test('asFiniteNumber accepts finite numbers and numeric strings', () => {
		expect(asFiniteNumber(42)).toBe(42);
		expect(asFiniteNumber('3.5')).toBe(3.5);
		expect(asFiniteNumber(Infinity)).toBeNull();
		expect(asFiniteNumber('nope')).toBeNull();
	});

	test('asPlainObject rejects arrays and null', () => {
		expect(asPlainObject({ a: 1 } as JsonValue)).toEqual({ a: 1 } as JsonObject);
		expect(asPlainObject([])).toBeNull();
		expect(asPlainObject(null)).toBeNull();
	});

	test('own helpers read object keys', () => {
		const obj = { name: 'test', count: 3 } as JsonValue;
		const bag = asPlainObject(obj)!;
		expect(ownString(bag, 'name')).toBe('test');
		expect(ownNumber(bag, 'count')).toBe(3);
		expect(own(bag, 'missing')).toBeUndefined();
	});

	test('stringList filters non-strings', () => {
		expect(stringList(['a', 1, 'b'])).toEqual(['a', 'b']);
		expect(stringList('x')).toEqual([]);
	});

	test('parseJsonText parses JSON', () => {
		expect(parseJsonText('{"ok":true}')).toEqual({ ok: true } as JsonObject);
	});

	test('readJsonObject parses request JSON', async () => {
		const request = new Request('https://example.com', {
			method: 'POST',
			body: JSON.stringify({ ok: true })
		});
		expect(await readJsonObject(request)).toEqual({ ok: true } as JsonObject);
	});

	test('event helpers narrow event targets', () => {
		const el = new HTMLElement();
		// SAFETY: synthetic Event bag for DOM helper unit tests.
		const htmlEvent = { currentTarget: el, target: el } as unknown as Event;
		expect(eventHtml(htmlEvent)).toBe(el);
		expect(eventTargetHtml(htmlEvent)).toBe(el);
		expect(eventTargetNode(htmlEvent)).toBe(el);

		const text = new Node();
		Object.defineProperty(text, 'nodeType', { value: 3 });
		// SAFETY: synthetic Event bag for non-HTMLElement target branch.
		const nodeEvent = { currentTarget: null, target: text } as unknown as Event;
		expect(eventHtml(nodeEvent)).toBeNull();
		expect(eventTargetHtml(nodeEvent)).toBeNull();
		expect(eventTargetNode(nodeEvent)).toBe(text);
	});
});
