<script lang="ts">
	import { formatDuration } from '$lib/utils';
	import {
		clearPlaybackPosition,
		resumePlaybackPosition,
		setPlaybackPosition
	} from '$lib/playbackPosition';
	import {
		canSafelyResumeSeek,
		classifyPlayError,
		shouldRetryMediaError,
		shouldRetryPlayAfterAbort,
		shouldRetryPlayMuted
	} from '$lib/playback/logic';
	import { syncMediaElementPlaybackProps, VOLUME_WRITE_EPSILON } from '$lib/playback/attachSync';
	import { clockFromMediaElement, shouldPublishMediaClock } from '$lib/playback/mediaClock';
	import { accumulateWatchDelta } from '$lib/media/views';
	import {
		clampSeekTime,
		PLAYER_VOLUME_STEP,
		playerHotkey,
		playerSeekDelta,
		playerWheelAction,
		type PlayerKeyAction
	} from '$lib/media/playerKeys';
	import { isLightboxTypingTarget } from '$lib/media/lightboxNav';
	import {
		parseStoryboardMeta,
		STORYBOARD_REQUEST_DELAY_MS,
		storyboardBackground,
		storyboardUrl,
		type StoryboardMeta
	} from '$lib/media/storyboard';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Volume1 from '@lucide/svelte/icons/volume-1';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	import { eventHtml, eventTargetHtml } from '$lib/parse';
	import { releaseVideoElement } from '$lib/playback/releaseVideo';
	import { untrack } from 'svelte';

	interface Props {
		src: string;
		/** Media id — used to resume where playback left off */
		mediaId?: string;
		/** When false, left/right arrows do not seek. */
		arrowSeek?: boolean;
		onmetadata?: (meta: { w: number; h: number; duration: number }) => void;
		onwatchprogress?: (watchedSeconds: number, durationSeconds: number) => void;
	}

	const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
	const PREVIEW_H_REM = 9.34375;
	const PREVIEW_MAX_W_REM = 17.875;
	const SAVE_INTERVAL_MS = 2500;

	let { src, mediaId = '', arrowSeek = true, onmetadata, onwatchprogress }: Props = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let playerEl: HTMLDivElement | undefined = $state();
	let playing = $state(false);
	let muted = $state(false);
	let volume = $state(0.175);
	let lastVolume = $state(0.3);
	let current = $state(0);
	let duration = $state(0);
	let buffered = $state(0);
	let scrubbing = $state(false);
	let volumeDragging = $state(false);
	let showControls = $state(true);
	let hovered = $state(false);
	let playbackRate = $state(1);
	let speedMenuOpen = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | null = null;
	let rafId = 0;
	let playRetryRaf = 0;
	let pendingSeek: number | null = null;
	let timelineHover = $state(false);
	let hoverRatio = $state(0);
	let hoverTime = $state(0);
	let storyboard = $state<{ id: string; meta: StoryboardMeta } | null>(null);
	let resumeApplied = false;
	let errorRetried = false;
	let retryAt: number | null = null;
	let wantPlay = true;
	let abortPlayRetryScheduled = false;
	let ignoreMediaEcho = false;
	let lastSaveAt = 0;
	let watchedSeconds = 0;
	let lastMediaTime = NaN;

	const progress = $derived(duration > 0 ? current / duration : 0);
	const bufferPct = $derived(duration > 0 ? Math.min(1, buffered / duration) : 0);
	const volumePct = $derived(muted ? 0 : volume);
	const speedLabel = $derived(playbackRate === 1 ? '1x' : `${playbackRate}x`);
	const chromeOpen = $derived(
		showControls || !playing || scrubbing || volumeDragging || speedMenuOpen || timelineHover
	);
	const previewAr = $derived.by(() => {
		if (storyboard) return storyboard.meta.tileW / storyboard.meta.tileH;
		const w = videoEl?.videoWidth ?? 0;
		const h = videoEl?.videoHeight ?? 0;
		return w > 0 && h > 0 ? w / h : 16 / 9;
	});
	const previewWRem = $derived(Math.min(PREVIEW_MAX_W_REM, PREVIEW_H_REM * previewAr));
	const previewHalfRem = $derived(previewWRem / 2);
	const sprite = $derived(
		storyboard
			? {
					url: `url(${storyboardUrl(storyboard.id)})`,
					...storyboardBackground(storyboard.meta, hoverTime)
				}
			: null
	);

	function clearHideTimer() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	function scheduleHide() {
		clearHideTimer();
		if (!playing || scrubbing || volumeDragging || speedMenuOpen || timelineHover) return;
		hideTimer = setTimeout(() => {
			showControls = false;
			speedMenuOpen = false;
		}, 2500);
	}

	function revealControls() {
		showControls = true;
		scheduleHide();
	}

	function formatSpeed(rate: number): string {
		return rate === 1 ? 'Normal' : `${rate}`;
	}

	function setPlaybackRate(rate: number) {
		playbackRate = rate;
		if (videoEl) videoEl.playbackRate = rate;
		speedMenuOpen = false;
		revealControls();
	}

	function cyclePlaybackRate(delta: number) {
		let currentIdx = SPEED_OPTIONS.findIndex((rate) => rate === playbackRate);
		if (currentIdx < 0) {
			currentIdx = SPEED_OPTIONS.reduce(
				(best, rate, i) =>
					Math.abs(rate - playbackRate) < Math.abs(SPEED_OPTIONS[best] - playbackRate) ? i : best,
				0
			);
		}
		const nextIdx = Math.min(SPEED_OPTIONS.length - 1, Math.max(0, currentIdx + delta));
		setPlaybackRate(SPEED_OPTIONS[nextIdx]);
	}

	function toggleSpeedMenu() {
		speedMenuOpen = !speedMenuOpen;
		showControls = true;
		if (speedMenuOpen) clearHideTimer();
		else scheduleHide();
	}

	function readBuffer() {
		if (!videoEl || videoEl.buffered.length === 0) return;
		buffered = videoEl.buffered.end(videoEl.buffered.length - 1);
	}

	function syncTime() {
		if (!videoEl || scrubbing) return;
		if (pendingSeek != null) {
			if (current !== pendingSeek) current = pendingSeek;
			return;
		}
		const next = videoEl.currentTime;
		if (!shouldPublishMediaClock(current, next)) return;
		current = next;
	}

	function savePosition(force = false, id = mediaId) {
		if (!id || !videoEl) return;
		const t = pendingSeek ?? videoEl.currentTime;
		const d = duration || videoEl.duration || 0;
		if (!Number.isFinite(t)) return;
		const now = Date.now();
		if (!force && now - lastSaveAt < SAVE_INTERVAL_MS) return;
		lastSaveAt = now;
		setPlaybackPosition(id, t, d);
	}

	function applyResume() {
		if (resumeApplied || !mediaId || !videoEl) return;
		const d = videoEl.duration || duration || 0;
		if (!Number.isFinite(d) || d <= 0) return;
		if (!canSafelyResumeSeek(videoEl.readyState)) return;
		const resume = resumePlaybackPosition(mediaId, d);
		resumeApplied = true;
		if (resume == null || resume <= 0) return;
		pendingSeek = resume;
		current = resume;
		wantPlay = true;
		try {
			videoEl.currentTime = resume;
		} catch {
			/* seek may fail until more data is buffered */
		}
	}

	async function ensurePlay() {
		const video = videoEl;
		if (!video || !wantPlay || !video.paused) return;
		try {
			await video.play();
		} catch (err) {
			// Element was detached or swapped while play() was pending.
			if (videoEl !== video) return;
			const name = err instanceof DOMException || err instanceof Error ? err.name : '';
			const kind = classifyPlayError(name);
			if (shouldRetryPlayMuted(kind, video.muted)) {
				video.muted = true;
				muted = true;
				try {
					await video.play();
				} catch {
					/* ignore second failure */
				}
				return;
			}
			if (shouldRetryPlayAfterAbort(kind, wantPlay) && !abortPlayRetryScheduled) {
				abortPlayRetryScheduled = true;
				playRetryRaf = requestAnimationFrame(() => {
					playRetryRaf = 0;
					abortPlayRetryScheduled = false;
					void ensurePlay();
				});
			}
		}
	}

	function tick() {
		syncTime();
		if (pendingSeek != null || scrubbing) {
			lastMediaTime = NaN;
		} else if (playing && videoEl) {
			const t = videoEl.currentTime;
			watchedSeconds += accumulateWatchDelta(lastMediaTime, t);
			lastMediaTime = t;
			onwatchprogress?.(watchedSeconds, duration || videoEl.duration || 0);
		}
		if (playing && !scrubbing) savePosition(false);
		rafId = playing && !scrubbing ? requestAnimationFrame(tick) : 0;
	}

	function startTick() {
		if (rafId) return;
		rafId = requestAnimationFrame(tick);
	}

	function stopTick() {
		if (!rafId) return;
		cancelAnimationFrame(rafId);
		rafId = 0;
	}

	function attachVideo(node: HTMLVideoElement) {
		videoEl = node;
		resumeApplied = false;
		wantPlay = true;
		abortPlayRetryScheduled = false;
		lastSaveAt = 0;
		watchedSeconds = 0;
		lastMediaTime = NaN;
		// Capture id now. A later pagehide can read the prop after the lightbox item is gone.
		// untrack: the prop getter reads the parent's item object; tracking it re-runs this
		// attachment on every item replacement and the teardown strips the live video's src.
		const boundId = untrack(() => mediaId);

		const onPageHide = () => savePosition(true, boundId);
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') savePosition(true, boundId);
		};
		window.addEventListener('pagehide', onPageHide);
		document.addEventListener('visibilitychange', onVisibility);
		// Metadata and play can fire before this attachment runs. Read the element now.
		// untrack: reading `current` here and writing it back re-runs this attachment
		// on every clock tick and trips effect_update_depth_exceeded, freezing the UI at 0:00.
		ignoreMediaEcho = true;
		untrack(() => {
			syncMediaElementPlaybackProps(node, { playbackRate, volume, muted });
			applyMediaClock(node);
			void ensurePlay();
		});
		ignoreMediaEcho = false;

		return () => {
			savePosition(true, boundId);
			window.removeEventListener('pagehide', onPageHide);
			document.removeEventListener('visibilitychange', onVisibility);
			stopTick();
			clearHideTimer();
			if (playRetryRaf) {
				cancelAnimationFrame(playRetryRaf);
				playRetryRaf = 0;
			}
			abortPlayRetryScheduled = false;
			releaseVideoElement(node);
			if (videoEl === node) videoEl = undefined;
		};
	}

	function attachPlayer(node: HTMLDivElement) {
		playerEl = node;
		const onVolumeWheel = (e: WheelEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			const hit = e.target instanceof HTMLElement ? e.target : null;
			if (
				isLightboxTypingTarget(
					hit
						? { tagName: hit.tagName, isContentEditable: hit.isContentEditable, role: hit.role }
						: null
				)
			) {
				return;
			}
			const action = playerWheelAction(e.deltaY, e.deltaX);
			if (!action) return;
			e.preventDefault();
			applyPlayerAction(action);
		};
		window.addEventListener('wheel', onVolumeWheel, { passive: false });
		return () => {
			window.removeEventListener('wheel', onVolumeWheel);
			playerEl = undefined;
		};
	}

	/** Hover thumbnails come from one server-built sprite, so hovering never decodes video. */
	function attachStoryboard(_node: HTMLElement) {
		// untrack: a new item object for the same id must not refetch the sheet.
		const id = untrack(() => mediaId);
		if (!id) return;
		let alive = true;
		// Delay so flipping through many videos does not queue a sprite build for each.
		const timer = setTimeout(async () => {
			try {
				const res = await fetch(storyboardUrl(id), { method: 'POST' });
				if (!res.ok) return;
				const meta = parseStoryboardMeta(await res.json());
				if (alive && meta) storyboard = { id, meta };
			} catch {
				/* hover keeps the time label only */
			}
		}, STORYBOARD_REQUEST_DELAY_MS);
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}

	function updateTimelineHover(e: PointerEvent) {
		if (duration <= 0) return;
		const hit = eventHtml(e);
		if (!hit) return;
		const ratio = ratioFromClientX(e.clientX, hit, '.custom-progress');
		hoverRatio = ratio;
		hoverTime = ratio * duration;
		timelineHover = true;
	}

	function hideTimelineHover() {
		if (scrubbing) return;
		timelineHover = false;
		scheduleHide();
	}

	function applyMediaClock(node: HTMLVideoElement) {
		const clock = clockFromMediaElement(node, { scrubbing, pendingSeek, current, duration });
		duration = clock.duration;
		if (!scrubbing && pendingSeek == null) current = clock.current;
		playing = clock.playing;
		if (playing) startTick();
		else stopTick();
		if (node.videoWidth > 0 && node.videoHeight > 0) {
			onmetadata?.({
				w: node.videoWidth,
				h: node.videoHeight,
				duration: clock.duration
			});
		}
	}

	function mediaNode(e?: Event): HTMLVideoElement | undefined {
		return e?.currentTarget instanceof HTMLVideoElement ? e.currentTarget : videoEl;
	}

	function onMeta(e: Event) {
		const node = mediaNode(e);
		if (!node) return;
		videoEl = node;
		applyMediaClock(node);
		applyResume();
		// load() fires durationchange with no metadata yet; a seek then is dropped and playback restarts at 0.
		if (retryAt != null && node.readyState >= HTMLMediaElement.HAVE_METADATA) {
			pendingSeek = retryAt;
			node.currentTime = retryAt;
			retryAt = null;
		}
	}

	function onLoadedData(e: Event) {
		const node = mediaNode(e);
		if (node) applyMediaClock(node);
		applyResume();
	}

	function onCanPlay(e: Event) {
		const node = mediaNode(e);
		if (node) applyMediaClock(node);
		applyResume();
		if (wantPlay && videoEl?.paused) void ensurePlay();
	}

	function onWaiting() {
		showControls = true;
	}

	function onStalled() {
		showControls = true;
	}

	function onVideoError(e: Event) {
		const node = mediaNode(e);
		if (node && shouldRetryMediaError(node.error?.code, errorRetried)) {
			errorRetried = true;
			retryAt = pendingSeek ?? current;
			node.load();
			return;
		}
		wantPlay = false;
		showControls = true;
	}

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused) {
			wantPlay = true;
			void ensurePlay();
		} else {
			wantPlay = false;
			videoEl.pause();
		}
		revealControls();
	}

	function applyVolume(value: number) {
		if (!videoEl) return;
		const next = Math.min(1, Math.max(0, value));
		volume = next;
		videoEl.volume = next;
		videoEl.muted = next === 0;
		muted = videoEl.muted;
		if (next > 0) lastVolume = next;
	}

	function toggleMute() {
		if (!videoEl) return;
		if (videoEl.muted || volume === 0) {
			videoEl.muted = false;
			applyVolume(lastVolume);
		} else {
			lastVolume = volume;
			videoEl.muted = true;
			muted = true;
		}
		revealControls();
	}

	function ratioFromClientX(clientX: number, hit: HTMLElement, trackSelector: string): number {
		const track = hit.querySelector<HTMLElement>(trackSelector) ?? hit;
		const rect = track.getBoundingClientRect();
		if (rect.width <= 0) return 0;
		return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
	}

	function previewSeek(clientX: number, hit: HTMLElement) {
		if (duration <= 0) return;
		current = ratioFromClientX(clientX, hit, '.custom-progress') * duration;
	}

	function commitSeek() {
		if (!videoEl || duration <= 0) return;
		const t = Math.min(duration, Math.max(0, current));
		pendingSeek = t;
		lastMediaTime = NaN;
		videoEl.currentTime = t;
		savePosition(true);
	}

	function onScrubPointerDown(e: PointerEvent) {
		const track = eventHtml(e);
		if (!track) return;
		scrubbing = true;
		pendingSeek = null;
		lastMediaTime = NaN;
		showControls = true;
		stopTick();
		track.setPointerCapture(e.pointerId);
		updateTimelineHover(e);
		previewSeek(e.clientX, track);
	}

	function onScrubPointerMove(e: PointerEvent) {
		updateTimelineHover(e);
		if (!scrubbing) return;
		const hit = eventHtml(e);
		if (hit) previewSeek(e.clientX, hit);
	}

	function onScrubPointerUp(e: PointerEvent) {
		if (scrubbing) {
			const hit = eventHtml(e);
			if (hit) previewSeek(e.clientX, hit);
			commitSeek();
			scrubbing = false;
			try {
				eventHtml(e)?.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			if (playing) startTick();
			scheduleHide();
		}
		const node = eventHtml(e);
		if (!node) {
			hideTimelineHover();
			return;
		}
		const rect = node.getBoundingClientRect();
		const inside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (inside) updateTimelineHover(e);
		else hideTimelineHover();
	}

	function onVolumePointerDown(e: PointerEvent) {
		const hit = eventHtml(e);
		if (!hit) return;
		volumeDragging = true;
		showControls = true;
		hit.setPointerCapture(e.pointerId);
		applyVolume(ratioFromClientX(e.clientX, hit, '.custom-volume-track'));
	}

	function onVolumePointerMove(e: PointerEvent) {
		if (!volumeDragging) return;
		const hit = eventHtml(e);
		if (!hit) return;
		applyVolume(ratioFromClientX(e.clientX, hit, '.custom-volume-track'));
	}

	function onVolumePointerUp(e: PointerEvent) {
		if (!volumeDragging) return;
		const hit = eventHtml(e);
		if (!hit) return;
		applyVolume(ratioFromClientX(e.clientX, hit, '.custom-volume-track'));
		volumeDragging = false;
		try {
			eventHtml(e)?.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
		scheduleHide();
	}

	function onVolumeKeydown(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			nudgeVolume(-PLAYER_VOLUME_STEP);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			nudgeVolume(PLAYER_VOLUME_STEP);
		} else if (e.key === 'Home') {
			e.preventDefault();
			applyVolume(0);
			revealControls();
		} else if (e.key === 'End') {
			e.preventDefault();
			applyVolume(1);
			revealControls();
		}
	}

	function toggleFullscreen() {
		if (!playerEl) return;
		if (document.fullscreenElement === playerEl) {
			void document.exitFullscreen();
		} else {
			void playerEl.requestFullscreen();
		}
		revealControls();
	}

	function nudgeVolume(delta: number) {
		applyVolume((muted ? 0 : volume) + delta);
		revealControls();
	}

	function applyPlayerAction(action: PlayerKeyAction) {
		const seek = playerSeekDelta(action);
		if (seek != null) {
			/* v8 ignore next -- keydown listener is torn down before the video attachment clears videoEl */
			if (!videoEl) return;
			current = clampSeekTime(pendingSeek ?? videoEl.currentTime, duration, seek);
			commitSeek();
			revealControls();
			return;
		}
		if (action === 'play') {
			togglePlay();
			return;
		}
		if (action === 'mute') {
			toggleMute();
			return;
		}
		if (action === 'fullscreen') {
			toggleFullscreen();
			return;
		}
		if (action === 'volumeUp') {
			nudgeVolume(PLAYER_VOLUME_STEP);
			return;
		}
		if (action === 'volumeDown') {
			nudgeVolume(-PLAYER_VOLUME_STEP);
			return;
		}
		if (action === 'slower') {
			cyclePlaybackRate(-1);
			return;
		}
		if (action === 'faster') {
			cyclePlaybackRate(1);
			return;
		}
		speedMenuOpen = false;
		scheduleHide();
	}

	function onPlayerKeydown(e: KeyboardEvent) {
		const el = eventTargetHtml(e);
		const action = playerHotkey(e.key, {
			reserved: isLightboxTypingTarget(
				el
					? {
							tagName: el.tagName,
							isContentEditable: el.isContentEditable,
							role: el.getAttribute('role')
						}
					: null
			),
			ctrlKey: e.ctrlKey,
			metaKey: e.metaKey,
			altKey: e.altKey,
			shiftKey: e.shiftKey,
			arrowSeek,
			speedMenuOpen
		});
		if (!action) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		applyPlayerAction(action);
	}
</script>

<svelte:window onkeydown={onPlayerKeydown} />

<div
	{@attach attachPlayer}
	class={[
		'custom-player group/player relative h-full w-full overflow-visible bg-black outline-none',
		chromeOpen && 'controls-visible'
	]}
	role="group"
	aria-label="Video player"
	onmousemove={() => {
		hovered = true;
		revealControls();
	}}
	onmouseenter={() => {
		hovered = true;
	}}
	onmouseleave={() => {
		hovered = false;
		hideTimelineHover();
		if (playing && !scrubbing && !volumeDragging && !speedMenuOpen && !timelineHover) {
			showControls = false;
		}
	}}
>
	<video
		{@attach attachVideo}
		{src}
		class="custom-video block h-full w-full max-w-none rounded-lg object-contain"
		autoplay
		playsinline
		preload="auto"
		onloadedmetadata={onMeta}
		ondurationchange={onMeta}
		onloadeddata={onLoadedData}
		oncanplay={onCanPlay}
		onprogress={readBuffer}
		onwaiting={onWaiting}
		onstalled={onStalled}
		onerror={onVideoError}
		onplay={(e) => {
			const node = mediaNode(e);
			if (node) applyMediaClock(node);
			else {
				playing = true;
				startTick();
			}
			scheduleHide();
		}}
		onpause={(e) => {
			const node = mediaNode(e);
			if (node) applyMediaClock(node);
			else {
				playing = false;
				stopTick();
			}
			syncTime();
			savePosition(true);
			showControls = true;
			clearHideTimer();
		}}
		onseeked={(e) => {
			pendingSeek = null;
			lastMediaTime = NaN;
			const node = mediaNode(e);
			if (node) applyMediaClock(node);
			else syncTime();
			readBuffer();
			savePosition(true);
			if (wantPlay) void ensurePlay();
		}}
		onvolumechange={() => {
			if (!videoEl || ignoreMediaEcho) return;
			if (videoEl.muted !== muted) muted = videoEl.muted;
			if (Math.abs(videoEl.volume - volume) > VOLUME_WRITE_EPSILON) volume = videoEl.volume;
		}}
		onended={() => {
			wantPlay = false;
			playing = false;
			stopTick();
			syncTime();
			if (mediaId) clearPlaybackPosition(mediaId);
			showControls = true;
		}}
		onratechange={() => {
			if (!videoEl || ignoreMediaEcho) return;
			playbackRate = videoEl.playbackRate;
		}}
		onclick={() => {
			if (speedMenuOpen) {
				speedMenuOpen = false;
				return;
			}
			togglePlay();
		}}
	>
		<track kind="captions" />
	</video>

	<div class="custom-chrome absolute inset-x-0 bottom-0 z-[25]">
		<div class="relative px-3">
			<div
				{@attach attachStoryboard}
				class={['custom-hover-preview', timelineHover && 'is-visible']}
				style:--x={hoverRatio}
				style:--preview-w={`${previewWRem}rem`}
				style:--preview-h="{PREVIEW_H_REM}rem"
				style:--preview-half={`${previewHalfRem}rem`}
				aria-hidden="true"
			>
				{#if sprite}
					<div class="custom-hover-frame">
						<div
							class="custom-hover-sprite"
							style:background-image={sprite.url}
							style:background-size={sprite.size}
							style:background-position={sprite.position}
						></div>
					</div>
				{/if}
				<span class="custom-hover-time">{formatDuration(hoverTime)}</span>
			</div>
			<div
				class="custom-progress-hit flex h-4 cursor-pointer items-end"
				role="slider"
				aria-label="Seek"
				aria-valuemin={0}
				aria-valuemax={Math.round(duration)}
				aria-valuenow={Math.round(current)}
				tabindex="0"
				onpointerdown={onScrubPointerDown}
				onpointermove={onScrubPointerMove}
				onpointerup={onScrubPointerUp}
				onpointercancel={onScrubPointerUp}
				onpointerleave={hideTimelineHover}
				onkeydown={(e) => {
					if (!videoEl) return;
					if (e.key === 'ArrowLeft') {
						e.preventDefault();
						e.stopPropagation();
						current = Math.max(0, (pendingSeek ?? videoEl.currentTime) - 5);
						commitSeek();
					} else if (e.key === 'ArrowRight') {
						e.preventDefault();
						e.stopPropagation();
						current = Math.min(duration, (pendingSeek ?? videoEl.currentTime) + 5);
						commitSeek();
					}
				}}
			>
				<div
					class="custom-progress relative mb-1 h-[3px] w-full overflow-visible rounded-full bg-white/35 transition-[height] group-hover/player:h-1"
					style:--progress={progress}
					style:--buffer={bufferPct}
					style:--hover={hoverRatio}
				>
					<div class="custom-progress-buffer"></div>
					<div class="custom-progress-played"></div>
					<span class={['custom-hover-tick', timelineHover && 'is-active']}></span>
					<span class={['custom-knob', scrubbing && 'is-active']}></span>
				</div>
			</div>
		</div>

		<div class="custom-controls flex items-center gap-1 bg-transparent px-2 pt-0.5 pb-2 text-white">
			<button
				type="button"
				class="custom-btn"
				aria-label={playing ? 'Pause' : 'Play'}
				onclick={(e) => {
					e.stopPropagation();
					togglePlay();
				}}
			>
				{#if playing}
					<Pause class="h-6 w-6" fill="currentColor" />
				{:else}
					<Play class="h-6 w-6" fill="currentColor" />
				{/if}
			</button>

			<div class="custom-volume-cluster flex items-center">
				<button
					type="button"
					class="custom-btn"
					aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
					onclick={(e) => {
						e.stopPropagation();
						toggleMute();
					}}
				>
					{#if muted || volume === 0}
						<VolumeX class="h-6 w-6" fill="currentColor" />
					{:else if volume < 0.5}
						<Volume1 class="h-6 w-6" fill="currentColor" />
					{:else}
						<Volume2 class="h-6 w-6" fill="currentColor" />
					{/if}
				</button>

				<div
					class="custom-volume-hit"
					style:--volume={volumePct}
					role="slider"
					aria-label="Volume"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(volumePct * 100)}
					tabindex="0"
					onpointerdown={onVolumePointerDown}
					onpointermove={onVolumePointerMove}
					onpointerup={onVolumePointerUp}
					onpointercancel={onVolumePointerUp}
					onkeydown={onVolumeKeydown}
					onclick={(e) => e.stopPropagation()}
				>
					<div class="custom-volume-track">
						<div class="custom-volume-fill"></div>
						<span class="custom-volume-knob"></span>
					</div>
				</div>
			</div>

			<span class="custom-time ml-2 text-xs font-medium tracking-wide select-none">
				{formatDuration(current)} / {formatDuration(duration)}
			</span>

			<span class="flex-1"></span>

			<div class="relative">
				{#if speedMenuOpen}
					<div
						class="custom-speed-menu absolute right-0 bottom-full mb-1 min-w-[5.5rem] overflow-hidden rounded-md py-1"
						role="menu"
						aria-label="Playback speed"
					>
						{#each SPEED_OPTIONS as rate (rate)}
							<button
								type="button"
								class={['custom-speed-option', playbackRate === rate && 'active']}
								role="menuitemradio"
								aria-checked={playbackRate === rate}
								onclick={(e) => {
									e.stopPropagation();
									setPlaybackRate(rate);
								}}
							>
								{formatSpeed(rate)}
							</button>
						{/each}
					</div>
				{/if}

				<button
					type="button"
					class="custom-speed-btn"
					aria-label={`Playback speed ${speedLabel}`}
					aria-haspopup="menu"
					aria-expanded={speedMenuOpen}
					onclick={(e) => {
						e.stopPropagation();
						toggleSpeedMenu();
					}}
				>
					{speedLabel}
				</button>
			</div>

			<button
				type="button"
				class="custom-btn"
				aria-label="Fullscreen"
				onclick={(e) => {
					e.stopPropagation();
					toggleFullscreen();
				}}
			>
				<Maximize class="h-6 w-6" fill="currentColor" />
			</button>
		</div>
	</div>
</div>

<style>
	.custom-player .custom-chrome {
		opacity: 0;
		pointer-events: none;
		transition: opacity 160ms ease;
	}

	.custom-player.controls-visible .custom-chrome,
	.custom-player:focus-within .custom-chrome {
		opacity: 1;
		pointer-events: auto;
	}

	.custom-video {
		transform: translateZ(0);
	}

	.custom-controls {
		background: transparent;
	}

	.custom-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2.25rem;
		width: 2.25rem;
		border-radius: 9999px;
		color: #fff;
		background: transparent;
		border: 0;
		cursor: pointer;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.85));
	}

	.custom-btn:hover {
		background: rgb(255 255 255 / 0.14);
	}

	.custom-time {
		color: #fff;
		text-shadow:
			0 1px 2px rgb(0 0 0 / 0.9),
			0 0 6px rgb(0 0 0 / 0.55);
	}

	.custom-progress-buffer,
	.custom-progress-played {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		transform-origin: left center;
		will-change: transform;
	}

	.custom-progress-buffer {
		background: rgb(255 255 255 / 0.55);
		transform: scaleX(var(--buffer, 0));
	}

	.custom-progress-played {
		background: #f00;
		transform: scaleX(var(--progress, 0));
	}

	.custom-knob {
		position: absolute;
		top: 50%;
		left: calc(var(--progress, 0) * 100%);
		height: 0.75rem;
		width: 0.75rem;
		border-radius: 9999px;
		background: #f00;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.45);
		opacity: 0;
		pointer-events: none;
		transform: translate(-50%, -50%);
		transition: opacity 120ms ease;
	}

	.custom-player:hover .custom-knob,
	.custom-knob.is-active {
		opacity: 1;
	}

	.custom-hover-tick {
		position: absolute;
		top: 50%;
		left: calc(var(--hover, 0) * 100%);
		width: 2px;
		height: 0.7rem;
		border-radius: 1px;
		background: #fff;
		opacity: 0;
		pointer-events: none;
		transform: translate(-50%, -50%);
		box-shadow: 0 0 4px rgb(0 0 0 / 0.6);
	}

	.custom-hover-tick.is-active {
		opacity: 0.95;
	}

	.custom-hover-preview {
		position: absolute;
		bottom: 1.15rem;
		left: clamp(
			var(--preview-half, 8.94rem),
			calc(var(--x, 0) * 100%),
			calc(100% - var(--preview-half, 8.94rem))
		);
		z-index: 6;
		display: flex;
		width: var(--preview-w, 17.875rem);
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		transform: translate3d(-50%, 0, 0);
		opacity: 0;
		pointer-events: none;
		transition: opacity 90ms ease;
	}

	.custom-hover-preview.is-visible {
		opacity: 1;
	}

	.custom-hover-frame {
		box-sizing: border-box;
		width: 100%;
		height: var(--preview-h, 9.34375rem);
		overflow: hidden;
		border: 0;
		border-radius: 0.4rem;
		background: #000;
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.22),
			0 6px 22px rgb(0 0 0 / 0.55);
	}

	.custom-hover-sprite {
		width: 100%;
		height: 100%;
		background-color: #000;
		background-repeat: no-repeat;
	}

	.custom-hover-time {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #fff;
		padding: 0.12rem 0.45rem;
		border-radius: 0.25rem;
		background: rgb(0 0 0 / 0.72);
		text-shadow: 0 1px 2px rgb(0 0 0 / 0.85);
	}

	.custom-progress-hit:hover .custom-progress,
	.custom-progress-hit:active .custom-progress {
		height: 0.35rem;
	}

	.custom-volume-hit {
		display: flex;
		align-items: center;
		height: 2.25rem;
		padding: 0 0.4rem 0 0.15rem;
		cursor: pointer;
	}

	.custom-volume-track {
		position: relative;
		width: 5.5rem;
		height: 4px;
		border-radius: 9999px;
		background: rgb(255 255 255 / 0.35);
		overflow: visible;
		transition: height 120ms ease;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.7));
	}

	.custom-volume-hit:hover .custom-volume-track,
	.custom-volume-hit:active .custom-volume-track {
		height: 6px;
	}

	.custom-volume-fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: #fff;
		pointer-events: none;
		transform-origin: left center;
		transform: scaleX(var(--volume, 0));
	}

	.custom-volume-knob {
		position: absolute;
		top: 50%;
		left: calc(var(--volume, 0) * 100%);
		height: 0.75rem;
		width: 0.75rem;
		border-radius: 9999px;
		background: #fff;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
		pointer-events: none;
		transform: translate(-50%, -50%) scale(0.85);
		transition: transform 120ms ease;
	}

	.custom-volume-hit:hover .custom-volume-knob,
	.custom-volume-hit:active .custom-volume-knob {
		transform: translate(-50%, -50%) scale(1);
	}

	.custom-speed-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.5rem;
		height: 2.25rem;
		padding: 0 0.4rem;
		border-radius: 9999px;
		border: 0;
		background: transparent;
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		cursor: pointer;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.85));
		text-shadow:
			0 1px 2px rgb(0 0 0 / 0.9),
			0 0 6px rgb(0 0 0 / 0.55);
	}

	.custom-speed-btn:hover {
		background: rgb(255 255 255 / 0.14);
	}

	.custom-speed-menu {
		background: rgb(28 28 28 / 0.92);
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.45);
		backdrop-filter: blur(8px);
	}

	.custom-speed-option {
		display: block;
		width: 100%;
		border: 0;
		background: transparent;
		color: #fff;
		font-size: 0.8rem;
		line-height: 1.2;
		text-align: left;
		padding: 0.4rem 0.75rem;
		cursor: pointer;
	}

	.custom-speed-option:hover {
		background: rgb(255 255 255 / 0.12);
	}

	.custom-speed-option.active {
		color: #f00;
		font-weight: 600;
	}
</style>
