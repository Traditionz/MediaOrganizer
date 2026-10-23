import { describe, expect, test } from 'bun:test';
import { PLAYER_RELEASE_EVENT, releasePlayersIn, releaseVideoElement } from './releaseVideo';

function fakeVideo() {
	const calls: string[] = [];
	const attrs = new Map<string, string>([['src', 'blob:test']]);
	const video = {
		onloadedmetadata: () => {},
		ondurationchange: () => {},
		onloadeddata: () => {},
		oncanplay: () => {},
		onerror: () => {},
		pause() {
			calls.push('pause');
		},
		removeAttribute(name: string) {
			calls.push(`remove:${name}`);
			attrs.delete(name);
		},
		load() {
			calls.push('load');
		}
	};
	return { video: video as unknown as HTMLVideoElement, calls };
}

describe('releaseVideoElement', () => {
	test('pauses, clears handlers, drops src, then load', () => {
		const { video, calls } = fakeVideo();
		releaseVideoElement(video);
		expect(video.onloadedmetadata).toBeNull();
		expect(video.ondurationchange).toBeNull();
		expect(video.onloadeddata).toBeNull();
		expect(video.oncanplay).toBeNull();
		expect(video.onerror).toBeNull();
		expect(calls).toEqual(['pause', 'remove:src', 'load']);
	});

	test('still clears src when pause throws', () => {
		const { video, calls } = fakeVideo();
		video.pause = () => {
			throw new Error('detached');
		};
		releaseVideoElement(video);
		expect(calls).toEqual(['remove:src', 'load']);
	});

	test('tolerates load throwing', () => {
		const { video, calls } = fakeVideo();
		video.load = () => {
			throw new Error('detached');
		};
		expect(() => releaseVideoElement(video)).not.toThrow();
		expect(calls).toEqual(['pause', 'remove:src']);
	});
});

describe('releasePlayersIn', () => {
	test('dispatches the release event on every player under the root', () => {
		const seen: string[] = [];
		const player = (name: string) => ({
			dispatchEvent(e: Event) {
				seen.push(`${name}:${e.type}`);
				return true;
			}
		});
		const root = {
			querySelectorAll(selector: string) {
				expect(selector).toBe('.custom-player');
				return [player('a'), player('b')];
			}
		};
		expect(releasePlayersIn(root)).toBe(2);
		expect(seen).toEqual([`a:${PLAYER_RELEASE_EVENT}`, `b:${PLAYER_RELEASE_EVENT}`]);
	});

	test('does nothing when no player is mounted', () => {
		expect(releasePlayersIn({ querySelectorAll: () => [] })).toBe(0);
	});
});
