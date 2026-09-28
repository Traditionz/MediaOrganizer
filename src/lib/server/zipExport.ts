import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from 'node:fs';
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

async function readAll(path: string): Promise<Uint8Array> {
	const chunks: Buffer[] = [];
	const stream = createReadStream(path);
	stream.on('data', (chunk) => {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	});
	await finished(stream);
	return new Uint8Array(Buffer.concat(chunks));
}

/** Write a ZIP STORE archive. Rejects files ≥ 4 GiB. */
export async function writeStoreZip(
	sources: readonly ZipSource[],
	outPath: string
): Promise<number> {
	if (!sources.length) throw new ZipEmptyError();
	const used = new Set<string>();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;

	for (const source of sources) {
		if (!existsSync(source.path)) continue;
		const size = statSync(source.path).size;
		if (zipFileTooLarge(size)) throw new ZipTooLargeError(source.name);
		const bytes = await readAll(source.path);
		const name = zipNameBytes(zipUniqueName(source.name, used));
		const crc = crc32(bytes);
		const local = zipLocalHeader(name, crc, bytes.length);
		centrals.push(zipCentralHeader(name, crc, bytes.length, offset));
		const part = new Uint8Array(local.length + bytes.length);
		part.set(local, 0);
		part.set(bytes, local.length);
		locals.push(part);
		offset += part.length;
	}

	if (!locals.length) throw new ZipEmptyError();

	let centralSize = 0;
	for (const c of centrals) centralSize += c.length;
	const eocd = zipEocd(centrals.length, centralSize, offset);

	if (existsSync(outPath)) unlinkSync(outPath);
	const out = createWriteStream(outPath);
	for (const part of locals) out.write(part);
	for (const part of centrals) out.write(part);
	out.write(eocd);
	await new Promise<void>((resolve, reject) => {
		out.end(() => resolve());
		out.on('error', reject);
	});
	return statSync(outPath).size;
}
