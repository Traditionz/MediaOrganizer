/** Stop decode and drop the media source so a detached video does not keep buffering. */
export function releaseVideoElement(video: HTMLVideoElement) {
	video.onloadedmetadata = null;
	video.ondurationchange = null;
	video.onloadeddata = null;
	video.oncanplay = null;
	video.onerror = null;
	try {
		video.pause();
	} catch {
		/* already detached */
	}
	video.removeAttribute('src');
	try {
		video.load();
	} catch {
		/* ignore */
	}
}
