import { describe, expect, test } from 'bun:test';
import { duplicateHashSet, watchedFileDecision } from './contentHash';

describe('content hash', () => {
	test('watchedFileDecision', () => {
		const paths = new Set(['a.jpg']);
		const hashes = new Set(['abc']);
		expect(watchedFileDecision('a.jpg', 'zzz', paths, hashes)).toBe('skip-path');
		expect(watchedFileDecision('b.jpg', 'abc', paths, hashes)).toBe('skip-hash');
		expect(watchedFileDecision('b.jpg', 'nope', paths, hashes)).toBe('import');
		expect(watchedFileDecision('b.jpg', '', paths, hashes)).toBe('import');
	});

	test('duplicateHashSet', () => {
		expect(
			duplicateHashSet([{ content_hash: 'a' }, { content_hash: 'a' }, { content_hash: 'b' }]).has(
				'a'
			)
		).toBe(true);
		expect(duplicateHashSet([{ content_hash: 'a' }, { content_hash: null }]).size).toBe(0);
	});
});
