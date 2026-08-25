import { describe, expect, test } from 'bun:test';
import { cn } from '$lib/cn';

describe('cn', () => {
	test('merges class names and resolves tailwind conflicts', () => {
		expect(cn('px-2', 'px-4')).toBe('px-4');
		expect(cn('text-sm', 'font-bold')).toBe('text-sm font-bold');
	});
});
