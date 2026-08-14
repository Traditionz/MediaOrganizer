import type { MediaItem, PasscodeModalMode } from '$lib/types';

const UPLOAD_PROGRESS_KEY = 'mo_upload_jobs';

export type TransferKind = 'upload' | 'compress';

export type TransferFileStatus = 'queued' | 'uploading' | 'saving' | 'done' | 'error' | 'cancelled';

export type TransferFileKind = 'video' | 'image' | 'other';

export type TransferFile = {
	id: string;
	name: string;
	kind: TransferFileKind;
	progress: number;
	loaded: number;
	total: number;
	status: TransferFileStatus;
	error?: string;
};

export type TransferJob = {
	id: string;
	kind: TransferKind;
	label: string;
	progress: number;
	fileCount: number;
	files: TransferFile[];
};

export type ConfirmKind = 'delete-album' | 'delete-media' | 'upload-duplicates';

const FILE_STATUSES: readonly TransferFileStatus[] = [
	'queued',
	'uploading',
	'saving',
	'done',
	'error',
	'cancelled'
];
const FILE_KINDS: readonly TransferFileKind[] = ['video', 'image', 'other'];

function parseTransferFiles(raw: unknown): TransferFile[] {
	if (!Array.isArray(raw)) return [];
	const files: TransferFile[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const row = item as Partial<TransferFile>;
		if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
		const status = FILE_STATUSES.includes(row.status as TransferFileStatus)
			? (row.status as TransferFileStatus)
			: 'queued';
		const kind = FILE_KINDS.includes(row.kind as TransferFileKind)
			? (row.kind as TransferFileKind)
			: 'other';
		files.push({
			id: row.id,
			name: row.name,
			kind,
			progress:
				typeof row.progress === 'number' && Number.isFinite(row.progress)
					? Math.min(100, Math.max(0, Math.round(row.progress)))
					: 0,
			loaded:
				typeof row.loaded === 'number' && Number.isFinite(row.loaded) ? Math.max(0, row.loaded) : 0,
			total:
				typeof row.total === 'number' && Number.isFinite(row.total) ? Math.max(0, row.total) : 0,
			status,
			error: typeof row.error === 'string' ? row.error : undefined
		});
	}
	return files;
}

export type ProfileModalState = {
	open: boolean;
	mode: PasscodeModalMode;
	profileId: string | null;
	profileName: string;
	requiresPasscode: boolean;
	mediaCount: number;
	prefillName: string;
};

export type ConfirmModalState = {
	open: boolean;
	kind: ConfirmKind | null;
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
	destructive: boolean;
	albumId: string | null;
	mediaIds: string[];
};

export type PromptModalState = {
	open: boolean;
	title: string;
	label: string;
	initialValue: string;
	mediaId: string | null;
};

export type AlbumPickerState = {
	open: boolean;
	mediaIds: string[];
};

export type ContextMenuState = {
	open: boolean;
	x: number;
	y: number;
	mediaIds: string[];
	kind: 'media' | 'empty';
};

/** Ephemeral chrome: modals, upload progress, preview, clipboard, toasts. */
export class UiState {
	preview = $state<MediaItem | null>(null);
	jobs = $state<TransferJob[]>([]);
	uploading = $derived(this.jobs.some((job) => job.kind === 'upload'));
	private abortByJob = new Map<string, AbortController>();
	dragOver = $state(false);
	errorMessage = $state('');
	convertResultMessage = $state('');
	fileInput = $state<HTMLInputElement | undefined>();
	clipboard = $state<{ ids: string[]; mode: 'copy' | 'cut' } | null>(null);
	contextMenu = $state<ContextMenuState>({
		open: false,
		x: 0,
		y: 0,
		mediaIds: [],
		kind: 'empty'
	});

	profileModal = $state<ProfileModalState>({
		open: false,
		mode: 'unlock',
		profileId: null,
		profileName: '',
		requiresPasscode: false,
		mediaCount: 0,
		prefillName: ''
	});
	profileModalBusy = $state(false);
	profileModalError = $state('');

	confirmModal = $state<ConfirmModalState>({
		open: false,
		kind: null,
		title: 'Confirm',
		message: '',
		confirmLabel: 'Confirm',
		cancelLabel: 'Cancel',
		destructive: false,
		albumId: null,
		mediaIds: []
	});
	confirmModalBusy = $state(false);

	promptModal = $state<PromptModalState>({
		open: false,
		title: 'Rename',
		label: 'Name',
		initialValue: '',
		mediaId: null
	});
	promptModalBusy = $state(false);
	promptModalError = $state('');

	albumPicker = $state<AlbumPickerState>({
		open: false,
		mediaIds: []
	});

	constructor() {
		this.restoreUploadProgress();
		if (typeof window === 'undefined') return;
		window.addEventListener('pagehide', this.onPageHide);
		window.addEventListener('beforeunload', this.onPageHide);
	}

	private onPageHide = () => {
		for (const controller of this.abortByJob.values()) {
			if (!controller.signal.aborted) controller.abort();
		}
		this.abortByJob.clear();
		this.jobs = [];
		try {
			sessionStorage.removeItem(UPLOAD_PROGRESS_KEY);
		} catch {
			/* ignore */
		}
	};

	private persistTimer: ReturnType<typeof setTimeout> | null = null;

	private persistUploadProgress(immediate = false) {
		if (typeof sessionStorage === 'undefined') return;
		if (!immediate) {
			if (this.persistTimer) return;
			this.persistTimer = setTimeout(() => {
				this.persistTimer = null;
				this.flushUploadProgress();
			}, 300);
			return;
		}
		if (this.persistTimer) {
			clearTimeout(this.persistTimer);
			this.persistTimer = null;
		}
		this.flushUploadProgress();
	}

	private flushUploadProgress() {
		try {
			if (!this.jobs.length) {
				sessionStorage.removeItem(UPLOAD_PROGRESS_KEY);
				return;
			}
			sessionStorage.setItem(UPLOAD_PROGRESS_KEY, JSON.stringify(this.jobs));
		} catch {
			/* ignore */
		}
	}

	private restoreUploadProgress() {
		if (typeof sessionStorage === 'undefined') return;
		try {
			const raw = sessionStorage.getItem(UPLOAD_PROGRESS_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as unknown;
			if (!Array.isArray(parsed)) return;
			const jobs: TransferJob[] = [];
			for (const item of parsed) {
				if (!item || typeof item !== 'object') continue;
				const row = item as Partial<TransferJob>;
				if (typeof row.id !== 'string' || (row.kind !== 'upload' && row.kind !== 'compress')) {
					continue;
				}
				const progress =
					typeof row.progress === 'number' && Number.isFinite(row.progress)
						? Math.min(100, Math.max(0, Math.round(row.progress)))
						: 0;
				const files = parseTransferFiles(row.files);
				const inFlight =
					files.some(
						(file) =>
							file.status === 'queued' || file.status === 'uploading' || file.status === 'saving'
					) ||
					(row.kind === 'compress' && progress < 100) ||
					(row.kind === 'upload' && !files.length && progress < 100);
				// Hard refresh kills XHR — never revive a live series.
				if (inFlight) continue;
				if (files.length && files.every((file) => file.status === 'cancelled')) continue;
				jobs.push({
					id: row.id,
					kind: row.kind,
					label: typeof row.label === 'string' ? row.label : 'Transfer',
					progress,
					fileCount:
						typeof row.fileCount === 'number' && Number.isFinite(row.fileCount)
							? Math.max(1, Math.round(row.fileCount))
							: 1,
					files
				});
			}
			this.jobs = jobs;
			this.flushUploadProgress();
		} catch {
			/* ignore */
		}
	}

	beginTransfer(opts: {
		kind: TransferKind;
		label: string;
		fileCount: number;
		files?: TransferFile[];
	}): string {
		const id = crypto.randomUUID();
		this.jobs.push({
			id,
			kind: opts.kind,
			label: opts.label,
			progress: 0,
			fileCount: Math.max(1, opts.fileCount),
			files: opts.files ?? []
		});
		this.abortByJob.set(id, new AbortController());
		this.persistUploadProgress(true);
		return id;
	}

	setTransferProgress(id: string, pct: number) {
		const job = this.jobs.find((item) => item.id === id);
		if (!job) return;
		job.progress = Math.min(100, Math.max(0, Math.round(pct)));
		this.persistUploadProgress();
	}

	setFileProgress(
		jobId: string,
		fileId: string,
		patch: Partial<Pick<TransferFile, 'progress' | 'loaded' | 'total' | 'status' | 'error'>>
	) {
		const job = this.jobs.find((item) => item.id === jobId);
		if (!job) return;
		const file = job.files.find((item) => item.id === fileId);
		if (!file) return;
		if (file.status === 'cancelled') return;
		if (patch.progress != null && Number.isFinite(patch.progress)) {
			file.progress = Math.min(100, Math.max(0, Math.round(patch.progress)));
		}
		if (patch.loaded != null && Number.isFinite(patch.loaded)) {
			file.loaded = Math.max(0, patch.loaded);
		}
		if (patch.total != null && Number.isFinite(patch.total)) {
			file.total = Math.max(0, patch.total);
		}
		if (patch.status) file.status = patch.status;
		if (patch.error !== undefined) file.error = patch.error;
		if (job.files.length) {
			const sum = job.files.reduce((acc, item) => acc + item.progress, 0);
			job.progress = Math.round(sum / job.files.length);
		}
		this.persistUploadProgress();
	}

	endTransfer(id: string) {
		this.abortByJob.delete(id);
		this.jobs = this.jobs.filter((item) => item.id !== id);
		this.persistUploadProgress(true);
	}

	transferSignal(id: string): AbortSignal | undefined {
		return this.abortByJob.get(id)?.signal;
	}

	isTransferCancelled(id: string): boolean {
		return this.abortByJob.get(id)?.signal.aborted === true;
	}

	canCancelTransfer(job: TransferJob): boolean {
		if (job.kind !== 'upload') return false;
		return job.files.some(
			(file) => file.status === 'queued' || file.status === 'uploading' || file.status === 'saving'
		);
	}

	cancelTransfer(id: string) {
		const controller = this.abortByJob.get(id);
		if (controller && !controller.signal.aborted) controller.abort();
		const job = this.jobs.find((item) => item.id === id);
		if (job) {
			for (const file of job.files) {
				if (file.status === 'queued' || file.status === 'uploading' || file.status === 'saving') {
					file.status = 'cancelled';
				}
			}
			this.persistUploadProgress(true);
		}
		if (!controller) this.endTransfer(id);
	}

	attachFileInput = (node: HTMLInputElement) => {
		this.fileInput = node;
		return () => {
			if (this.fileInput === node) this.fileInput = undefined;
		};
	};

	setError(message: string) {
		this.errorMessage = message;
	}

	clearError() {
		this.errorMessage = '';
	}

	closeConfirmModal() {
		this.confirmModal = { ...this.confirmModal, open: false, kind: null };
		this.confirmModalBusy = false;
	}

	openConfirmModal(opts: {
		kind: ConfirmKind;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		destructive?: boolean;
		albumId?: string | null;
		mediaIds?: string[];
	}) {
		this.confirmModalBusy = false;
		this.confirmModal = {
			open: true,
			kind: opts.kind,
			title: opts.title,
			message: opts.message,
			confirmLabel: opts.confirmLabel ?? 'Confirm',
			cancelLabel: opts.cancelLabel ?? 'Cancel',
			destructive: opts.destructive ?? false,
			albumId: opts.albumId ?? null,
			mediaIds: opts.mediaIds ?? []
		};
	}

	closePromptModal() {
		this.promptModal = { ...this.promptModal, open: false, mediaId: null };
		this.promptModalBusy = false;
		this.promptModalError = '';
	}

	openRenamePrompt(mediaId: string, initialValue: string) {
		this.promptModalBusy = false;
		this.promptModalError = '';
		this.promptModal = {
			open: true,
			title: 'Rename',
			label: 'Name',
			initialValue,
			mediaId
		};
	}

	openAlbumPicker(mediaIds: string[]) {
		this.albumPicker = { open: true, mediaIds: [...mediaIds] };
	}

	closeAlbumPicker() {
		this.albumPicker = { open: false, mediaIds: [] };
	}

	closeProfileModal() {
		this.profileModal = { ...this.profileModal, open: false };
		this.profileModalBusy = false;
		this.profileModalError = '';
	}

	openContextMenu(opts: { x: number; y: number; mediaIds: string[]; kind: 'media' | 'empty' }) {
		this.contextMenu = {
			open: true,
			x: opts.x,
			y: opts.y,
			mediaIds: opts.mediaIds,
			kind: opts.kind
		};
	}

	closeContextMenu() {
		this.contextMenu = { ...this.contextMenu, open: false };
	}

	setClipboard(ids: string[], mode: 'copy' | 'cut') {
		this.clipboard = { ids: [...ids], mode };
	}
}
