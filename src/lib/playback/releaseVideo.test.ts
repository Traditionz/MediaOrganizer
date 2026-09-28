import { describe, expect, test } from 'bun:test';
import { releaseVideoElement } from './releaseVideo';

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
});
