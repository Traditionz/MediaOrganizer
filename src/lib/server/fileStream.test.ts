import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FILE_STREAM_CHUNK_BYTES, openFileReadStream } from './media';

const dir = mkdtempSync(join(tmpdir(), 'mo-file-stream-'));
const file = join(dir, 'sample.bin');
writeFileSync(file, Buffer.from('0123456789'));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function read(stream: ReturnType<typeof openFileReadStream>): Promise<string> {
	let out = '';
	for await (const chunk of stream) out += String(chunk);
	return out;
}

describe('openFileReadStream', () => {
	test('reads in 1 MB chunks', () => {
		const stream = openFileReadStream(file);
		expect(stream.readableHighWaterMark).toBe(FILE_STREAM_CHUNK_BYTES);
		stream.destroy();
	});

	test('streams the whole file', async () => {
		expect(await read(openFileReadStream(file))).toBe('0123456789');
	});

	test('honours byte ranges', async () => {
		expect(await read(openFileReadStream(file, { start: 2, end: 5 }))).toBe('2345');
	});
});
