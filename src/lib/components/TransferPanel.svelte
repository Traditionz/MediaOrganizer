<script lang="ts">
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Film from '@lucide/svelte/icons/film';
	import ImageIcon from '@lucide/svelte/icons/image';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LiquidGlass from '$lib/components/LiquidGlass.svelte';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cn } from '$lib/cn.js';
	import { getAppState } from '$lib/state';
	import type { TransferJob } from '$lib/transfer/types.js';
	import {
		FILE_PREVIEW_LIMIT,
		fileMeta,
		fileProgressClass,
		jobSubtitle,
		jobTitle,
		visibleFiles
	} from '$lib/transfer/panel.js';
	import { formatBytes } from '$lib/utils';
	import { fly } from 'svelte/transition';

	const { ui } = getAppState();

	let panelMinimized = $state<Record<string, boolean>>({});
	let filesExpanded = $state<Record<string, boolean>>({});

	function isPanelMinimized(jobId: string): boolean {
		return panelMinimized[jobId] ?? false;
	}

	function isFilesExpanded(jobId: string): boolean {
		return filesExpanded[jobId] ?? false;
	}

	function togglePanel(jobId: string) {
		panelMinimized[jobId] = !isPanelMinimized(jobId);
	}

	function toggleFiles(jobId: string) {
		filesExpanded[jobId] = !isFilesExpanded(jobId);
	}

	function listHeight(job: TransferJob, showAllFiles: boolean): string {
		if (showAllFiles) return 'h-[min(18rem,50vh)]';
		return job.files.length > FILE_PREVIEW_LIMIT ? 'h-48' : 'h-auto max-h-48';
	}
</script>

{#if ui.jobs.length}
	<div class="fixed right-4 bottom-4 z-40 flex max-w-full flex-col gap-3">
		{#each ui.jobs as job (job.id)}
			{@const minimized = isPanelMinimized(job.id)}
			{@const showAllFiles = isFilesExpanded(job.id)}
			{@const files = visibleFiles(job, showAllFiles)}
			<div transition:fly={{ y: 16, duration: 180 }}>
				<LiquidGlass class="w-[min(100vw-2rem,24rem)] shadow-xl" radius={16}>
					<Card.Root
						class="border-0 bg-transparent shadow-none"
						role="status"
						aria-label="{jobTitle(job)} {job.progress}%"
					>
						<Card.Header class="grid-cols-[auto_1fr_auto] gap-3 pb-2">
							<div
								class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg"
							>
								{#if job.kind === 'compress'}
									<Spinner class="size-4" />
								{:else}
									<Upload class="size-4" />
								{/if}
							</div>
							<div class="min-w-0">
								<Card.Title class="truncate text-sm">{jobTitle(job)}</Card.Title>
								<Card.Description class="truncate">{jobSubtitle(job, minimized)}</Card.Description>
							</div>
							<div class="flex items-center gap-0.5 self-start">
								{#if job.files.length > 0}
									<Button
										variant="ghost"
										size="icon-xs"
										onclick={() => togglePanel(job.id)}
										aria-label={minimized ? 'Expand upload details' : 'Minimize upload panel'}
										aria-expanded={!minimized}
									>
										{#if minimized}
											<ChevronUp class="size-4" />
										{:else}
											<ChevronDown class="size-4" />
										{/if}
									</Button>
								{/if}
								<Button
									variant="ghost"
									size="icon-xs"
									onclick={() => ui.endTransfer(job.id)}
									aria-label="Hide transfer progress"
								>
									<X class="size-4" />
								</Button>
							</div>
						</Card.Header>

						<Card.Content class="flex items-center gap-2.5 pb-3">
							<Progress value={job.progress} class="h-2 min-w-0 flex-1" />
							<span
								class="text-foreground w-9 shrink-0 text-right text-xs font-semibold tabular-nums"
								aria-live="polite"
							>
								{job.progress}%
							</span>
						</Card.Content>

						{#if !minimized && job.files.length}
							<ScrollArea type="always" class={cn('min-h-0', listHeight(job, showAllFiles))}>
								<Card.Content class="space-y-2 pt-0 pb-2">
									<ul class="space-y-2" aria-label="Upload file list">
										{#each files as file (file.id)}
											<li class="min-w-0">
												<div class="flex items-center gap-2">
													{#if file.status === 'done'}
														<Check
															class="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
														/>
													{:else if file.status === 'error'}
														<CircleAlert class="text-destructive size-3.5 shrink-0" />
													{:else if file.status === 'cancelled'}
														<Ban class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
													{:else if file.kind === 'video'}
														<Film class="text-muted-foreground size-3.5 shrink-0" />
													{:else}
														<ImageIcon class="text-muted-foreground size-3.5 shrink-0" />
													{/if}
													<span class="min-w-0 flex-1 truncate text-xs" title={file.name}
														>{file.name}</span
													>
													<span
														class={cn(
															'shrink-0 text-[11px] tabular-nums',
															file.status === 'error' && 'text-destructive',
															file.status === 'cancelled' && 'text-amber-600 dark:text-amber-400',
															file.status !== 'error' &&
																file.status !== 'cancelled' &&
																'text-muted-foreground'
														)}
													>
														{file.status === 'uploading' || file.status === 'saving'
															? `${file.progress}%`
															: fileMeta(file, formatBytes)}
													</span>
												</div>
												<div class="mt-1 flex items-center gap-2">
													<Progress
														value={file.progress}
														class={cn('h-1 min-w-0 flex-1', fileProgressClass(file))}
													/>
												</div>
												{#if file.status === 'uploading' || file.status === 'saving'}
													<p class="text-muted-foreground mt-0.5 text-[11px]">
														{fileMeta(file, formatBytes)}
													</p>
												{/if}
											</li>
										{/each}
									</ul>
								</Card.Content>
							</ScrollArea>
							{#if job.files.length > FILE_PREVIEW_LIMIT}
								<Button
									variant="ghost"
									size="xs"
									class="text-muted-foreground w-full rounded-none"
									onclick={() => toggleFiles(job.id)}
									aria-expanded={showAllFiles}
								>
									{showAllFiles ? 'Show less' : `Show all ${job.files.length} files`}
								</Button>
							{/if}
						{/if}

						{#if !minimized && ui.canCancelTransfer(job)}
							<Card.Footer class="border-t bg-transparent">
								<Button
									variant="destructive"
									size="xs"
									class="w-full"
									onclick={() => ui.cancelTransfer(job.id)}
								>
									<Ban class="size-3.5" />
									Cancel upload
								</Button>
							</Card.Footer>
						{/if}
					</Card.Root>
				</LiquidGlass>
			</div>
		{/each}
	</div>
{/if}
