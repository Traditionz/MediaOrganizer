import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { finished } from 'node:stream/promises';

export function sha256Hex(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

/** Stream SHA-256 of a file on disk. */
export async function sha256File(path: string): Promise<string> {
	const hash = createHash('sha256');
	const stream = createReadStream(path);
	stream.on('data', (chunk) => {
		hash.update(chunk);
	});
	await finished(stream);
	return hash.digest('hex');
}
