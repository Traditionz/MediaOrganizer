import { describe, expect, test } from 'bun:test';
import {
	asFiniteNumber,
	asPlainObject,
	asString,
	own,
	ownNumber,
	ownString,
	parseJsonText,
	stringList,
	tagOf
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
		expect(asPlainObject({ a: 1 })).toEqual({ a: 1 });
		expect(asPlainObject([])).toBeNull();
		expect(asPlainObject(null)).toBeNull();
	});

	test('own helpers read object keys', () => {
		const obj = { name: 'test', count: 3 };
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
		expect(parseJsonText('{"ok":true}')).toEqual({ ok: true });
	});
});
