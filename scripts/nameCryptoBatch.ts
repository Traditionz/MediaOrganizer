import { batchNameCrypto } from '../src/lib/server/nameCrypto.ts';

if (import.meta.main) {
	const raw = await Bun.stdin.text();
	if (!raw.trim()) {
		console.error('Expected JSON on stdin: { decrypt?: string[], encrypt?: string[] }');
		process.exit(1);
	}
	process.stdout.write(JSON.stringify(batchNameCrypto(JSON.parse(raw))));
}
