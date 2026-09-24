import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('CustomPlayer video attachment', () => {
	test('syncs the media clock inside untrack so playback cannot retrigger the attachment', () => {
		const src = readFileSync(new URL('../components/CustomPlayer.svelte', import.meta.url), 'utf8');
		const attach = src.slice(src.indexOf('function attachVideo'), src.indexOf('function attachPlayer'));
		const syncAt = attach.indexOf('untrack(');
		expect(syncAt).toBeGreaterThan(-1);
		expect(attach.indexOf('applyMediaClock')).toBeGreaterThan(syncAt);
		expect(attach.indexOf('ensurePlay')).toBeGreaterThan(syncAt);
		expect(src.includes('$effect(')).toBe(false);
		expect(attach.includes('savePosition(true, boundId)')).toBe(true);
	});
});
