import { describe, expect, test } from 'bun:test';
import { syncMediaElementPlaybackProps } from './attachSync';

function fakeMedia(init: {
	playbackRate: number;
	volume: number;
	muted: boolean;
}): HTMLVideoElement {
	return { ...init } as HTMLVideoElement;
}

describe('syncMediaElementPlaybackProps', () => {
	test('writes only when values differ (avoids redundant volumechange)', () => {
		const node = fakeMedia({ playbackRate: 1, volume: 0.5, muted: false });
		const writes: string[] = [];
		const proxied = new Proxy(node, {
			set(target, prop, value) {
				writes.push(String(prop));
				Reflect.set(target, prop, value);
				return true;
			}
		}) as HTMLVideoElement;

		syncMediaElementPlaybackProps(proxied, {
			playbackRate: 1,
			volume: 0.5,
			muted: false
		});
		expect(writes).toEqual([]);

		syncMediaElementPlaybackProps(proxied, {
			playbackRate: 1.25,
			volume: 0.2,
			muted: true
		});
		expect(writes.sort()).toEqual(['muted', 'playbackRate', 'volume'].sort());

		writes.length = 0;
		syncMediaElementPlaybackProps(proxied, {
			playbackRate: 1.25,
			volume: 0.2001,
			muted: true
		});
		expect(writes).toEqual([]);
		expect(proxied.playbackRate).toBe(1.25);
		expect(proxied.volume).toBe(0.2);
		expect(proxied.muted).toBe(true);
	});
});
