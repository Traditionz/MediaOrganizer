/** Props applied to the media element that must stay out of {@attach} setup scope. */
export type MediaElementPlaybackProps = {
	playbackRate: number;
	volume: number;
	muted: boolean;
};

/** Ignore sub-percent volume noise so the element echo cannot retrigger the effect. */
export const VOLUME_WRITE_EPSILON = 0.005;

/**
 * Apply rate/volume/mute to a media element.
 * Call from `{@attach}` inside `untrack`, not from a `$effect` that also reads
 * `volume` / `muted` / `playbackRate`. The media element's echo events write
 * those fields back, and a tracked read+write hits effect_update_depth_exceeded.
 */
export function syncMediaElementPlaybackProps(
	node: Pick<HTMLVideoElement, 'playbackRate' | 'volume' | 'muted'>,
	props: MediaElementPlaybackProps
): void {
	if (node.playbackRate !== props.playbackRate) node.playbackRate = props.playbackRate;
	if (Math.abs(node.volume - props.volume) > VOLUME_WRITE_EPSILON) node.volume = props.volume;
	if (node.muted !== props.muted) node.muted = props.muted;
}
