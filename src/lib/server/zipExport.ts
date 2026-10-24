import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import {
	crc32,
	zipCentralHeader,
	zipEocd,
	zipFileTooLarge,
	zipLocalHeader,
	zipNameBytes,
	zipUniqueName
} from '$lib/media/zipFormat';

export type ZipSource = {
	name: string;
	path: string;
};

export class ZipTooLargeError extends Error {
	constructor(name: string) {
		super(`File too large to zip: ${name}`);
	}
}

export class ZipEmptyError extends Error {
	constructor() {
		super('No files to export');
	}
}

/** Classic (non-ZIP64) archives cap offsets at 32 bits and entry counts at 16 bits. */
const ZIP_MAX_ENTRIES = 0xffff;

async function crc32File(path: string): Promise<number> {
	let crc = 0;
	const stream = createReadStream(path, { highWaterMark: 1024 * 1024 });
	stream.on('data', (chunk) => {
		crc = crc32(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), crc);
	});
	await finished(stream);
	return crc;
}

async function write(out: WriteStream, bytes: Uint8Array): Promise<void> {
	if (!out.write(bytes)) await once(out, 'drain');
}

async function pipeFile(out: WriteStream, path: string): Promise<void> {
	for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 })) {
		// SAFETY: fs read streams without an encoding yield Buffers.
		await write(out, chunk as Buffer);
	}
}

/**
 * Write a ZIP STORE archive, streaming each file so memory stays flat no matter how large the
 * export is. Rejects files ≥ 4 GiB and archives whose total size needs ZIP64.
 */
export async function writeStoreZip(
	sources: readonly ZipSource[],
	outPath: string
): Promise<number> {
	if (!sources.length) throw new ZipEmptyError();
	const present = sources.filter((source) => existsSync(source.path));
	if (!present.length) throw new ZipEmptyError();
	if (present.length > ZIP_MAX_ENTRIES) throw new ZipTooLargeError(`${present.length} files`);

	if (existsSync(outPath)) unlinkSync(outPath);
	const out = createWriteStream(outPath);
	const failed = new Promise<never>((_, reject) => out.once('error', reject));
	failed.catch(() => undefined);

	const used = new Set<string>();
	const centrals: Uint8Array[] = [];
	let offset = 0;

	const run = async () => {
		for (const source of present) {
			const size = statSync(source.path).size;
			if (zipFileTooLarge(size)) throw new ZipTooLargeError(source.name);
			const name = zipNameBytes(zipUniqueName(source.name, used));
			const crc = await crc32File(source.path);
			const local = zipLocalHeader(name, crc, size);
			if (zipFileTooLarge(offset + local.length + size)) throw new ZipTooLargeError('export');
			centrals.push(zipCentralHeader(name, crc, size, offset));
			await write(out, local);
			await pipeFile(out, source.path);
			offset += local.length + size;
		}

		let centralSize = 0;
		for (const c of centrals) {
			await write(out, c);
			centralSize += c.length;
		}
		await write(out, zipEocd(centrals.length, centralSize, offset));
		out.end();
		await finished(out);
	};

	try {
		await Promise.race([run(), failed]);
	} catch (err) {
		out.destroy();
		try {
			if (existsSync(outPath)) unlinkSync(outPath);
		} catch {
			/* ignore */
		}
		throw err;
	}
	return statSync(outPath).size;
}
