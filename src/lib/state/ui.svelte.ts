import type { MediaItem } from '$lib/types';
import type { PasscodeModalMode } from '$lib/components/PasscodeModal.svelte';

const UPLOAD_PROGRESS_KEY = 'mo_upload_progress';

export type ConfirmKind = 'delete-album' | 'delete-media' | 'upload-duplicates';

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
	uploading = $state(false);
	uploadProgress = $state<number | null>(null);
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
	}

	private persistUploadProgress() {
		if (typeof sessionStorage === 'undefined') return;
		try {
			if (!this.uploading || this.uploadProgress == null) {
				sessionStorage.removeItem(UPLOAD_PROGRESS_KEY);
				return;
			}
			sessionStorage.setItem(
				UPLOAD_PROGRESS_KEY,
				JSON.stringify({ progress: this.uploadProgress })
			);
		} catch {
			/* ignore */
		}
	}

	private restoreUploadProgress() {
		if (typeof sessionStorage === 'undefined') return;
		try {
			const raw = sessionStorage.getItem(UPLOAD_PROGRESS_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as { progress?: number };
			if (typeof parsed.progress === 'number' && Number.isFinite(parsed.progress)) {
				this.uploading = true;
				this.uploadProgress = Math.min(100, Math.max(0, Math.round(parsed.progress)));
			}
		} catch {
			/* ignore */
		}
	}

	beginUpload() {
		this.errorMessage = '';
		this.convertResultMessage = '';
		this.uploading = true;
		this.uploadProgress = 0;
		this.persistUploadProgress();
	}

	setUploadProgress(pct: number) {
		this.uploadProgress = Math.min(100, Math.max(0, Math.round(pct)));
		this.persistUploadProgress();
	}

	endUpload() {
		this.uploading = false;
		this.uploadProgress = null;
		this.persistUploadProgress();
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

	openContextMenu(opts: {
		x: number;
		y: number;
		mediaIds: string[];
		kind: 'media' | 'empty';
	}) {
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
