<script lang="ts">
	import { formatDuration } from '$lib/utils';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';

	interface Props {
		src: string;
		onmetadata?: (meta: { w: number; h: number; duration: number }) => void;
	}

	const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

	let { src, onmetadata }: Props = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let playerEl: HTMLDivElement | undefined = $state();
	let playing = $state(false);
	let muted = $state(false);
	let volume = $state(1);
	let current = $state(0);
	let duration = $state(0);
	let buffered = $state(0);
	let scrubbing = $state(false);
	let showControls = $state(true);
	let hovered = $state(false);
	let playbackRate = $state(1);
	let speedMenuOpen = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	const progress = $derived(duration > 0 ? (current / duration) * 100 : 0);
	const bufferPct = $derived(duration > 0 ? (buffered / duration) * 100 : 0);
	const speedLabel = $derived(playbackRate === 1 ? '1x' : `${playbackRate}x`);

	function clearHideTimer() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	function scheduleHide() {
		clearHideTimer();
		if (!playing || scrubbing || speedMenuOpen) return;
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

	function attachVideo(node: HTMLVideoElement) {
		videoEl = node;
		node.playbackRate = playbackRate;
		return () => {
			if (videoEl === node) videoEl = undefined;
		};
	}

	function attachPlayer(node: HTMLDivElement) {
		playerEl = node;
		return () => {
			if (playerEl === node) playerEl = undefined;
		};
	}

	function onMeta() {
		if (!videoEl) return;
		duration = videoEl.duration || 0;
		if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
			onmetadata?.({
				w: videoEl.videoWidth,
				h: videoEl.videoHeight,
				duration: Number.isFinite(duration) ? duration : 0
			});
		}
	}

	function onTime() {
		if (!videoEl || scrubbing) return;
		current = videoEl.currentTime;
		if (videoEl.buffered.length > 0) {
			buffered = videoEl.buffered.end(videoEl.buffered.length - 1);
		}
	}

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused) {
			void videoEl.play();
		} else {
			videoEl.pause();
		}
		revealControls();
	}

	function toggleMute() {
		if (!videoEl) return;
		videoEl.muted = !videoEl.muted;
		muted = videoEl.muted;
		revealControls();
	}

	function onVolumeInput(e: Event) {
		if (!videoEl) return;
		const value = Number((e.currentTarget as HTMLInputElement).value);
		volume = value;
		videoEl.volume = value;
		videoEl.muted = value === 0;
		muted = videoEl.muted;
		revealControls();
	}

	function seekFromClientX(clientX: number, hit: HTMLElement) {
		if (!videoEl || duration <= 0) return;
		const track = hit.querySelector<HTMLElement>('.custom-progress') ?? hit;
		const rect = track.getBoundingClientRect();
		if (rect.width <= 0) return;
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		const t = ratio * duration;
		videoEl.currentTime = t;
		current = t;
	}

	function onScrubPointerDown(e: PointerEvent) {
		const track = e.currentTarget as HTMLElement;
		scrubbing = true;
		showControls = true;
		track.setPointerCapture(e.pointerId);
		seekFromClientX(e.clientX, track);
	}

	function onScrubPointerMove(e: PointerEvent) {
		if (!scrubbing) return;
		seekFromClientX(e.clientX, e.currentTarget as HTMLElement);
	}

	function onScrubPointerUp(e: PointerEvent) {
		if (!scrubbing) return;
		scrubbing = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
		scheduleHide();
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

	function onPlayerKeydown(e: KeyboardEvent) {
		if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
			e.preventDefault();
			togglePlay();
		} else if (e.key === 'm' || e.key === 'M') {
			e.preventDefault();
			toggleMute();
		} else if (e.key === 'f' || e.key === 'F') {
			e.preventDefault();
			toggleFullscreen();
		} else if (e.key === 'ArrowLeft' && videoEl) {
			e.preventDefault();
			videoEl.currentTime = Math.max(0, videoEl.currentTime - 5);
			revealControls();
		} else if (e.key === 'ArrowRight' && videoEl) {
			e.preventDefault();
			videoEl.currentTime = Math.min(duration, videoEl.currentTime + 5);
			revealControls();
		} else if (e.key === '<' || e.key === ',') {
			e.preventDefault();
			cyclePlaybackRate(-1);
		} else if (e.key === '>' || e.key === '.') {
			e.preventDefault();
			cyclePlaybackRate(1);
		} else if (e.key === 'Escape' && speedMenuOpen) {
			e.preventDefault();
			speedMenuOpen = false;
			scheduleHide();
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (!hovered) return;
		onPlayerKeydown(e);
	}}
/>

<div
	{@attach attachPlayer}
	class="custom-player group/player relative h-full w-full overflow-hidden bg-black outline-none"
	class:controls-visible={showControls || !playing || scrubbing || speedMenuOpen}
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
		if (playing && !scrubbing && !speedMenuOpen) showControls = false;
	}}
>
	<video
		{@attach attachVideo}
		{src}
		class="h-full w-full object-contain"
		autoplay
		playsinline
		onloadedmetadata={onMeta}
		ontimeupdate={onTime}
		ondurationchange={onMeta}
		onplay={() => {
			playing = true;
			scheduleHide();
		}}
		onpause={() => {
			playing = false;
			showControls = true;
			clearHideTimer();
		}}
		onvolumechange={() => {
			if (!videoEl) return;
			muted = videoEl.muted;
			volume = videoEl.volume;
		}}
		onended={() => {
			playing = false;
			showControls = true;
		}}
		onratechange={() => {
			if (!videoEl) return;
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

	<!-- Floating chrome: transparent over video, contrast via shadows -->
	<div class="custom-chrome absolute inset-x-0 bottom-0 z-20">
		<div class="px-3">
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
				onkeydown={(e) => {
					if (!videoEl) return;
					if (e.key === 'ArrowLeft') {
						e.preventDefault();
						videoEl.currentTime = Math.max(0, videoEl.currentTime - 5);
					} else if (e.key === 'ArrowRight') {
						e.preventDefault();
						videoEl.currentTime = Math.min(duration, videoEl.currentTime + 5);
					}
				}}
			>
				<div
					class="custom-progress relative mb-1 h-[3px] w-full overflow-visible rounded-full bg-white/35 transition-[height] group-hover/player:h-1"
				>
					<div
						class="absolute inset-y-0 left-0 rounded-full bg-white/55"
						style:width="{bufferPct}%"
					></div>
					<div class="absolute inset-y-0 left-0 rounded-full bg-[#f00]" style:width="{progress}%">
						<span
							class="custom-knob absolute top-1/2 right-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f00] opacity-0 shadow transition-opacity group-hover/player:opacity-100"
							class:opacity-100={scrubbing}
						></span>
					</div>
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
				{:else}
					<Volume2 class="h-6 w-6" fill="currentColor" />
				{/if}
			</button>

			<input
				type="range"
				class="custom-volume"
				min="0"
				max="1"
				step="0.05"
				value={muted ? 0 : volume}
				aria-label="Volume"
				oninput={onVolumeInput}
				onclick={(e) => e.stopPropagation()}
			/>

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
								class="custom-speed-option"
								class:active={playbackRate === rate}
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

	.custom-volume {
		width: 4.5rem;
		height: 0.25rem;
		accent-color: #fff;
		cursor: pointer;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.7));
	}

	.custom-progress-hit:hover .custom-progress,
	.custom-progress-hit:active .custom-progress {
		height: 0.35rem;
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
