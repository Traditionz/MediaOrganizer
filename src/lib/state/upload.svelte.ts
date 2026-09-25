import { existingIdsFromNameLookup, parseOkMediaItems } from '$lib/library/mutationHandlers';
import type { MediaItem } from '$lib/types';
import {
	UPLOAD_CONCURRENCY,
	captureVideoThumbnail,
	isAbortError,
	isSupportedMediaFile,
	isVideoFile,
	mapWithConcurrency,
	requestServerThumbnail,
	uploadMediaFile,
	uploadVideoThumbnail
} from '$lib/utils';
import type { LibraryState } from './library.svelte';
import type { PreferencesState } from './preferences.svelte';
import type { UiState } from './ui.svelte';

export type DuplicatePrompt = (names: string[]) => Promise<boolean | null>;

/** Upload pipeline: dup prompt, transfer jobs, thumbnail backfill. */
export class UploadController {
	duplicateResolver: ((uploadDuplicates: boolean | null) => void) | null = null;

	constructor(
		private readonly library: LibraryState,
		private readonly ui: UiState,
		private readonly prefs: PreferencesState,
		private readonly refreshCounts: () => Promise<void>
	) {}

	resolveDuplicatePrompt(uploadDuplicates: boolean | null) {
		const resolve = this.duplicateResolver;
		this.duplicateResolver = null;
		resolve?.(uploadDuplicates);
	}

	askDuplicates(names: string[]): Promise<boolean | null> {
		const unique = [...new Set(names)];
		const sample = unique.slice(0, 5).join(', ');
		const extra = unique.length > 5 ? ` and ${unique.length - 5} more` : '';
		const message =
			unique.length === 1
				? `"${unique[0]}" is already in your library. Skip it, or upload another copy as a duplicate?`
				: `${unique.length} files already exist by name (${sample}${extra}). Skip them, or upload as duplicates?`;

		return new Promise((resolve) => {
			this.duplicateResolver = resolve;
			this.ui.openConfirmModal({
				kind: 'upload-duplicates',
				title: 'Duplicates found',
				message,
				confirmLabel: 'Skip duplicates',
				cancelLabel: 'Upload as duplicates'
			});
		});
	}

	async uploadFiles(fileList: FileList | File[]) {
		const files = [...fileList].filter(isSupportedMediaFile);
		if (!files.length) {
			this.ui.errorMessage = 'Only image and video files are supported.';
			return;
		}

		const found = await this.library.lookupNames(files.map((file) => file.name));
		const uniqueFiles: File[] = [];
		const duplicateFiles: File[] = [];
		const seenInBatch = new Set<string>();

		for (const file of files) {
			const key = file.name.toLowerCase();
			if ((found[key]?.length ?? 0) > 0 || seenInBatch.has(key)) {
				duplicateFiles.push(file);
			} else {
				uniqueFiles.push(file);
				seenInBatch.add(key);
			}
		}

		const albumId = this.library.pasteTargetAlbumId();
		let filesToUpload = uniqueFiles;
		let uploadDupes = false;

		if (duplicateFiles.length) {
			if (this.prefs.warnDuplicateUploads) {
				const choice = await this.askDuplicates(duplicateFiles.map((f) => f.name));
				if (choice == null) return;
				uploadDupes = choice;
				if (uploadDupes) filesToUpload = [...uniqueFiles, ...duplicateFiles];
			} else {
				uploadDupes = false;
			}
		}

		if (duplicateFiles.length && !uploadDupes && albumId) {
			const existingIds = existingIdsFromNameLookup(
				found,
				duplicateFiles.map((file) => file.name)
			);
			if (existingIds.length) {
				const res = await fetch('/api/media', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'add-to-album', ids: existingIds, albumId })
				});
				if (res.ok) {
					this.library.upsertMedia(parseOkMediaItems(await res.json()));
					await this.refreshCounts();
				}
			}
		}

		if (!filesToUpload.length) {
			await this.refreshCounts();
			const linked = albumId
				? existingIdsFromNameLookup(
						found,
						duplicateFiles.map((file) => file.name)
					).length
				: 0;
			this.ui.convertResultMessage =
				linked > 0
					? `Skipped ${duplicateFiles.length} duplicate(s); added ${linked} existing item(s) to album.`
					: `Skipped ${duplicateFiles.length} duplicate name(s).`;
			return;
		}

		const transferFiles = filesToUpload.map((file) => ({
			id: crypto.randomUUID(),
			name: file.name,
			kind: isVideoFile(file) ? ('video' as const) : ('image' as const),
			progress: 0,
			loaded: 0,
			total: file.size,
			status: 'queued' as const
		}));

		const jobId = this.ui.beginTransfer({
			kind: 'upload',
			label: filesToUpload.length === 1 ? filesToUpload[0]!.name : `${filesToUpload.length} files`,
			fileCount: filesToUpload.length,
			files: transferFiles
		});

		const errors: string[] = [];
		const signal = this.ui.transferSignal(jobId);

		try {
			await mapWithConcurrency(
				filesToUpload,
				UPLOAD_CONCURRENCY,
				async (file, i) => {
					const fileId = transferFiles[i]!.id;
					this.ui.setFileProgress(jobId, fileId, { status: 'uploading' });
					try {
						const uploaded = await uploadMediaFile(file, {
							albumId,
							signal,
							onProgress: ({ pct, loaded, total }) => {
								this.ui.setFileProgress(jobId, fileId, {
									progress: pct,
									loaded,
									total,
									status: pct >= 95 ? 'saving' : 'uploading'
								});
							}
						});

						if (signal?.aborted) return;

						this.library.prependMedia([uploaded]);

						void this.backfillThumb(file, uploaded).catch(() => {
							/* thumbnail backfill is optional */
						});
						this.ui.setFileProgress(jobId, fileId, {
							progress: 100,
							loaded: file.size,
							total: file.size,
							status: 'done'
						});
					} catch (err) {
						if ((err instanceof Error && isAbortError(err)) || signal?.aborted) {
							this.ui.setFileProgress(jobId, fileId, { status: 'cancelled' });
							return;
						}
						const message = err instanceof Error ? err.message : `Failed to upload ${file.name}`;
						this.ui.setFileProgress(jobId, fileId, {
							status: 'error',
							progress: 100,
							error: message
						});
						errors.push(message);
					}
				},
				signal
			);

			if (this.ui.isTransferCancelled(jobId) || signal?.aborted) {
				/* cancelled series */
			} else if (errors.length) {
				this.ui.errorMessage =
					errors.length === 1
						? errors[0]!
						: `${errors.length} of ${filesToUpload.length} uploads failed: ${errors[0]}`;
			} else if (duplicateFiles.length && !uploadDupes) {
				const linked = albumId
					? existingIdsFromNameLookup(
							found,
							duplicateFiles.map((file) => file.name)
						).length
					: 0;
				this.ui.convertResultMessage =
					linked > 0
						? `Uploaded ${uniqueFiles.length} file(s); skipped ${duplicateFiles.length} duplicate(s) and added ${linked} to album.`
						: `Uploaded ${uniqueFiles.length} file(s); skipped ${duplicateFiles.length} duplicate name(s).`;
			}
		} catch (err) {
			if (!(err instanceof Error && isAbortError(err)) && !signal?.aborted) {
				this.ui.errorMessage = err instanceof Error ? err.message : 'Upload failed';
			}
		} finally {
			void this.refreshCounts().catch(() => {
				/* list refresh is best-effort after upload */
			});
			if (this.ui.isTransferCancelled(jobId) || signal?.aborted) {
				await new Promise((resolve) => setTimeout(resolve, 900));
				this.ui.endTransfer(jobId);
				return;
			}
			if (errors.length) return;
			await new Promise((resolve) => setTimeout(resolve, 1400));
			this.ui.endTransfer(jobId);
		}
	}

	private async backfillThumb(file: File, uploaded: MediaItem) {
		let ok = false;
		if (isVideoFile(file)) {
			const blob = await captureVideoThumbnail(file);
			if (blob) ok = await uploadVideoThumbnail(uploaded.id, blob);
		}
		if (!ok) ok = await requestServerThumbnail(uploaded.id);
		if (ok) this.library.markHasThumbnail(uploaded.id);
	}
}
