export function renameWithExt(name: string, ext: string): string {
	const base = name.replace(/\.[^.]+$/, '');
	return `${base}${ext}`;
}
