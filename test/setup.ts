import { mock } from 'bun:test';

mock.module('$app/environment', () => ({
	browser: true,
	dev: true,
	building: false,
	version: 'test'
}));

mock.module('$env/dynamic/public', () => ({
	env: {}
}));

const storage = new Map<string, string>();

const localStorageMock: Storage = {
	get length() {
		return storage.size;
	},
	clear() {
		storage.clear();
	},
	getItem(key: string) {
		return storage.get(key) ?? null;
	},
	key(index: number) {
		return [...storage.keys()][index] ?? null;
	},
	removeItem(key: string) {
		storage.delete(key);
	},
	setItem(key: string, value: string) {
		storage.set(key, value);
	}
};

globalThis.localStorage = localStorageMock;

// SAFETY: bun preload stubs DOM Node for instanceof checks in unit tests.
globalThis.Node = class Node {
	nodeType = 1;
} as typeof Node;

// SAFETY: bun preload stubs DOM HTMLElement for instanceof checks in unit tests.
const NodeCtor = globalThis.Node as typeof Node;
// SAFETY: HTMLElement stub extends the Node stub for DOM helper tests.
globalThis.HTMLElement = class HTMLElement extends NodeCtor {} as typeof HTMLElement;

const htmlClassList = {
	add: () => {},
	remove: () => {}
};

// SAFETY: test preload only needs minimal document stubs for dragSession.
globalThis.document = {
	documentElement: { classList: htmlClassList },
	body: { appendChild: () => {} }
} as Document;
