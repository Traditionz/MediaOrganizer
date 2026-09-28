import { vi } from 'vitest';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type RequestBody = { [key: string]: JsonValue };

export function jsonResponse<T extends object>(body: T, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export function installFetch(
	handler: (url: string, init?: RequestInit) => Response | Promise<Response>
) {
	const spy = vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async (input, init) =>
			handler(input instanceof Request ? input.url : String(input), init)
		);
	return () => spy.mockRestore();
}

function parseRequestBody(init?: RequestInit): RequestBody {
	const text = init?.body == null ? '' : String(init.body);
	return text ? JSON.parse(text) : {};
}

export function installLibraryFetch(options?: {
	albums?: object[];
	tags?: object[];
	counts?: {
		totalCount?: number;
		trashCount?: number;
		favoritesCount?: number;
		unassignedCount?: number;
	};
	onPatch?: (url: string, body: RequestBody) => object;
	onPost?: (url: string, body: RequestBody) => object;
	onDelete?: (url: string, body: RequestBody) => object;
}) {
	return installFetch(async (url, init) => {
		const method = (init?.method ?? 'GET').toUpperCase();
		const body = parseRequestBody(init);
		if (method === 'GET' && url.startsWith('/api/albums')) {
			return jsonResponse(options?.albums ?? []);
		}
		if (method === 'GET' && url.startsWith('/api/tags')) {
			return jsonResponse(options?.tags ?? []);
		}
		if (method === 'GET' && url.startsWith('/api/media')) {
			if (url.includes('meta=1')) {
				return jsonResponse({
					totalCount: options?.counts?.totalCount ?? 1,
					trashCount: options?.counts?.trashCount ?? 0,
					favoritesCount: options?.counts?.favoritesCount ?? 0,
					unassignedCount: options?.counts?.unassignedCount ?? 0
				});
			}
			return jsonResponse({ items: [], total: 0, offset: 0, limit: 80, hasMore: false });
		}
		if (method === 'PATCH' && options?.onPatch) {
			return jsonResponse(options.onPatch(url, body));
		}
		if (method === 'POST' && options?.onPost) {
			return jsonResponse(options.onPost(url, body));
		}
		if (method === 'DELETE' && options?.onDelete) {
			return jsonResponse(options.onDelete(url, body));
		}
		return jsonResponse({});
	});
}
