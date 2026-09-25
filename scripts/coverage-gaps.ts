import { readFileSync } from 'node:fs';

type Loc = { start: { line: number }; end: { line: number } };
type FileCov = {
	path: string;
	statementMap: Record<string, Loc>;
	s: Record<string, number>;
	fnMap: Record<string, { name: string; loc: Loc }>;
	f: Record<string, number>;
	branchMap: Record<string, { loc: Loc; type: string; locations: Loc[] }>;
	b: Record<string, number[]>;
};

const data: Record<string, FileCov> = JSON.parse(
	readFileSync('coverage/coverage-final.json', 'utf8')
);
const filter = process.argv[2];

for (const cov of Object.values(data)) {
	const rel = cov.path.replace(/\\/g, '/').replace(/.*MediaOrganizer\//, '');
	if (filter && !rel.includes(filter)) continue;
	const stmts = Object.entries(cov.s)
		.filter(([, n]) => n === 0)
		.map(([k]) => cov.statementMap[k].start.line);
	const fns = Object.entries(cov.f)
		.filter(([, n]) => n === 0)
		.map(([k]) => `${cov.fnMap[k].name}@${cov.fnMap[k].loc.start.line}`);
	const branches: string[] = [];
	for (const [k, hits] of Object.entries(cov.b)) {
		hits.forEach((n, i) => {
			if (n === 0) {
				const loc = cov.branchMap[k].locations[i] ?? cov.branchMap[k].loc;
				branches.push(`${loc.start.line}.${i}`);
			}
		});
	}
	if (!stmts.length && !fns.length && !branches.length) continue;
	console.log(`\n## ${rel}`);
	if (stmts.length) console.log(`stmts: ${[...new Set(stmts)].join(',')}`);
	if (fns.length) console.log(`fns: ${fns.join(', ')}`);
	if (branches.length) console.log(`branches: ${branches.join(',')}`);
}
