<script lang="ts">
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Film from '@lucide/svelte/icons/film';
	import ImageIcon from '@lucide/svelte/icons/image';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
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

	function barFill(file: TransferFile): string {
		if (file.status === 'error') return 'bg-destructive';
		if (file.status === 'cancelled') return 'bg-amber-500';
		if (file.status === 'done') return 'bg-emerald-500';
		if (file.status === 'saving') return 'bg-sky-500';
		return 'bg-primary';
	}
</script>

{#if ui.jobs.length}
	<div class="fixed right-4 bottom-4 z-40 flex max-w-full flex-col gap-3">
		{#each ui.jobs as job (job.id)}
			<div
				class="bg-card text-card-foreground ring-foreground/10 w-[min(100vw-2rem,24rem)] overflow-hidden rounded-2xl shadow-xl ring-1"
				role="status"
				aria-label="{jobTitle(job)} {job.progress}%"
				transition:fly={{ y: 16, duration: 180 }}
			>
				<div class="flex items-start gap-3 px-4 pt-3 pb-2">
					<div
						class="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
					>
						{#if job.kind === 'compress'}
							<Spinner class="size-4" />
						{:else}
							<Upload class="size-4" />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold">{jobTitle(job)}</p>
						<p class="text-muted-foreground text-xs">{jobSubtitle(job)}</p>
					</div>
					<div class="flex items-center gap-1">
						<span class="text-sm font-semibold tabular-nums" aria-live="polite"
							>{job.progress}%</span
						>
						<Button
							variant="ghost"
							size="icon-xs"
							onclick={() => ui.endTransfer(job.id)}
							aria-label="Hide transfer progress"
						>
							<X class="size-4" />
						</Button>
					</div>
				</div>

				<div class="px-4">
					<div class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
						<div class="bg-primary h-full" style:width="{job.progress}%"></div>
					</div>
				</div>

				{#if job.files.length}
					<ul class="mt-2 max-h-56 space-y-2 overflow-auto px-4 pb-3">
						{#each visibleFiles(job) as file (file.id)}
							<li class="min-w-0">
								<div class="flex items-center gap-2">
									{#if file.status === 'done'}
										<Check class="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
									{:else if file.status === 'error'}
										<CircleAlert class="text-destructive size-3.5 shrink-0" />
									{:else if file.status === 'cancelled'}
										<Ban class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
									{:else if file.kind === 'video'}
										<Film class="text-muted-foreground size-3.5 shrink-0" />
									{:else}
										<ImageIcon class="text-muted-foreground size-3.5 shrink-0" />
									{/if}
									<span class="min-w-0 flex-1 truncate text-xs" title={file.name}>{file.name}</span>
									<span
										class={[
											'shrink-0 text-[11px] tabular-nums',
											file.status === 'error' && 'text-destructive',
											file.status === 'cancelled' && 'text-amber-600 dark:text-amber-400',
											file.status !== 'error' &&
												file.status !== 'cancelled' &&
												'text-muted-foreground'
										]}
									>
										{file.status === 'uploading' || file.status === 'saving'
											? `${file.progress}%`
											: fileMeta(file)}
									</span>
								</div>
								<div class="bg-muted mt-1 h-1 w-full overflow-hidden rounded-full">
									<div class={['h-full', barFill(file)]} style:width="{file.progress}%"></div>
								</div>
								{#if file.status === 'uploading' || file.status === 'saving'}
									<p class="text-muted-foreground mt-0.5 text-[11px]">{fileMeta(file)}</p>
								{/if}
							</li>
						{/each}
					</ul>
					{#if job.files.length > 6}
						<Button
							variant="ghost"
							size="xs"
							class="text-muted-foreground w-full rounded-none"
							onclick={() => (expanded = !expanded)}
						>
							{expanded ? 'Show less' : `Show all ${job.files.length} files`}
						</Button>
					{/if}
				{:else}
					<div class="h-3"></div>
				{/if}

				{#if ui.canCancelTransfer(job)}
					<div class="border-border border-t px-4 py-2">
						<Button
							variant="destructive"
							size="xs"
							class="w-full"
							onclick={() => ui.cancelTransfer(job.id)}
						>
							<Ban class="size-3.5" />
							Cancel upload
						</Button>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
