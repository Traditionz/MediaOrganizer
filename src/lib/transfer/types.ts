export type TransferKind = 'upload' | 'compress';

export type TransferFileStatus =
	| 'queued'
	| 'uploading'
	| 'saving'
	| 'done'
	| 'error'
	| 'cancelled';

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
