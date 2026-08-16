<script lang="ts">
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Film from '@lucide/svelte/icons/film';
	import ImageIcon from '@lucide/svelte/icons/image';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import { getAppState } from '$lib/state';
	import type { TransferFile, TransferJob } from '$lib/state/ui.svelte';
	import { formatBytes } from '$lib/utils';
	import { fly } from 'svelte/transition';

	const { ui } = getAppState();

	const STATUS_RANK = {
		uploading: 0,
		saving: 1,
		error: 2,
		cancelled: 3,
		queued: 4,
		done: 5
	} as const;

	let expanded = $state(true);

	function jobTitle(job: TransferJob): string {
		if (job.kind === 'compress') return 'Compressing';
		const videos = job.files.filter((file) => file.kind === 'video').length;
		const active = job.files.some(
			(file) => file.status === 'queued' || file.status === 'uploading' || file.status === 'saving'
		);
		const cancelled = job.files.some((file) => file.status === 'cancelled');
		if (!active && cancelled) return 'Upload cancelled';
		if (videos && videos === job.files.length) {
			return videos === 1 ? 'Uploading video' : `Uploading ${videos} videos`;
		}
		if (job.fileCount === 1) return 'Uploading';
		return `Uploading ${job.fileCount} files`;
	}

	function jobSubtitle(job: TransferJob): string {
		if (!job.files.length) return `${job.progress}%`;
		const done = job.files.filter((file) => file.status === 'done').length;
		const failed = job.files.filter((file) => file.status === 'error').length;
		const cancelled = job.files.filter((file) => file.status === 'cancelled').length;
		const parts = [`${done} of ${job.files.length} done`];
		if (failed) parts.push(`${failed} failed`);
		if (cancelled) parts.push(`${cancelled} cancelled`);
		return parts.join(' · ');
	}

	function orderedFiles(job: TransferJob): TransferFile[] {
		return [...job.files].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
	}

	function visibleFiles(job: TransferJob): TransferFile[] {
		const files = orderedFiles(job);
		if (expanded || files.length <= 6) return files;
		const active = files.filter(
			(file) => file.status === 'uploading' || file.status === 'saving' || file.status === 'error'
		);
		return active.length ? active : files.slice(0, 6);
	}

	function fileMeta(file: TransferFile): string {
		if (file.status === 'queued') return 'Waiting';
		if (file.status === 'saving') return 'Saving…';
		if (file.status === 'done') return 'Done';
		if (file.status === 'cancelled') return 'Cancelled';
		if (file.status === 'error') return file.error || 'Failed';
		if (file.total > 0) return `${formatBytes(file.loaded)} / ${formatBytes(file.total)}`;
		return `${file.progress}%`;
	}

	function progressClass(file: TransferFile): string {
		if (file.status === 'error') return 'progress progress-error';
		if (file.status === 'cancelled') return 'progress progress-warning';
		if (file.status === 'done') return 'progress progress-success';
		if (file.status === 'saving') return 'progress progress-info';
		return 'progress progress-primary';
	}
</script>

{#if ui.jobs.length}
	<div class="toast toast-end toast-bottom z-40 max-w-full p-4">
		{#each ui.jobs as job (job.id)}
			<div
				class="border-base-300 bg-base-100 w-[min(100vw-2rem,24rem)] overflow-hidden rounded-2xl border shadow-xl"
				role="status"
				aria-label="{jobTitle(job)} {job.progress}%"
				transition:fly={{ y: 16, duration: 180 }}
			>
				<div class="flex items-start gap-3 px-4 pt-3 pb-2">
					<div
						class="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
					>
						{#if job.kind === 'compress'}
							<LoaderCircle class="size-4 animate-spin" />
						{:else}
							<Upload class="size-4" />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold">{jobTitle(job)}</p>
						<p class="text-base-content/60 text-xs">{jobSubtitle(job)}</p>
					</div>
					<div class="flex items-center gap-1">
						<span class="text-sm font-semibold tabular-nums" aria-live="polite"
							>{job.progress}%</span
						>
						<button
							class="btn btn-ghost btn-xs btn-square"
							onclick={() => ui.endTransfer(job.id)}
							aria-label="Hide transfer progress"
						>
							<X class="size-4" />
						</button>
					</div>
				</div>

				<div class="px-4">
					<progress class="progress progress-primary h-1.5 w-full" value={job.progress} max="100"
					></progress>
				</div>

				{#if job.files.length}
					<ul class="mt-2 max-h-56 space-y-2 overflow-auto px-4 pb-3">
						{#each visibleFiles(job) as file (file.id)}
							<li class="min-w-0">
								<div class="flex items-center gap-2">
									{#if file.status === 'done'}
										<Check class="text-success size-3.5 shrink-0" />
									{:else if file.status === 'error'}
										<CircleAlert class="text-error size-3.5 shrink-0" />
									{:else if file.status === 'cancelled'}
										<Ban class="text-warning size-3.5 shrink-0" />
									{:else if file.kind === 'video'}
										<Film class="text-base-content/55 size-3.5 shrink-0" />
									{:else}
										<ImageIcon class="text-base-content/55 size-3.5 shrink-0" />
									{/if}
									<span class="min-w-0 flex-1 truncate text-xs" title={file.name}>{file.name}</span>
									<span
										class={[
											'shrink-0 text-[11px] tabular-nums',
											file.status === 'error' && 'text-error',
											file.status === 'cancelled' && 'text-warning',
											file.status !== 'error' &&
												file.status !== 'cancelled' &&
												'text-base-content/55'
										]}
									>
										{file.status === 'uploading' || file.status === 'saving'
											? `${file.progress}%`
											: fileMeta(file)}
									</span>
								</div>
								<progress
									class={[progressClass(file), 'mt-1 h-1 w-full']}
									value={file.progress}
									max="100"
								></progress>
								{#if file.status === 'uploading' || file.status === 'saving'}
									<p class="text-base-content/45 mt-0.5 text-[11px]">{fileMeta(file)}</p>
								{/if}
							</li>
						{/each}
					</ul>
					{#if job.files.length > 6}
						<button
							class="btn btn-ghost btn-xs text-base-content/60 w-full rounded-none"
							onclick={() => (expanded = !expanded)}
						>
							{expanded ? 'Show less' : `Show all ${job.files.length} files`}
						</button>
					{/if}
				{:else}
					<div class="h-3"></div>
				{/if}

				{#if ui.canCancelTransfer(job)}
					<div class="border-base-300 border-t px-4 py-2">
						<button
							class="btn btn-error btn-outline btn-xs w-full"
							onclick={() => ui.cancelTransfer(job.id)}
						>
							<Ban class="size-3.5" />
							Cancel upload
						</button>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
