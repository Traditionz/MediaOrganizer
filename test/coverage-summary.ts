import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type JsonSummary = {
	total: {
		lines: { total: number; covered: number; pct: number };
		statements: { total: number; covered: number; pct: number };
		functions: { total: number; covered: number; pct: number };
		branches: { total: number; covered: number; pct: number };
	};
};

const summaryPath = join(process.cwd(), 'coverage', 'coverage-summary.json');

function bar(ratio: number, width = 24): string {
	const filled = Math.round(Math.min(1, Math.max(0, ratio)) * width);
	return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function readSummary(): JsonSummary {
	const raw = readFileSync(summaryPath, 'utf8');
	return JSON.parse(raw) as JsonSummary;
}

function printMetric(label: string, covered: number, total: number, reportedPct: number) {
	const ratio = total === 0 ? 1 : covered / total;
	console.log(
		`${label.padEnd(14)} ${reportedPct.toFixed(2).padStart(7)}%  (${String(covered).padStart(4)}/${String(total).padStart(4)})  ${bar(ratio)}`
	);
}

const summary = readSummary();
const { total } = summary;

console.log('\nCoverage summary');
console.log('================');
printMetric('Lines', total.lines.covered, total.lines.total, total.lines.pct);
printMetric('Statements', total.statements.covered, total.statements.total, total.statements.pct);
printMetric('Functions', total.functions.covered, total.functions.total, total.functions.pct);
printMetric('Branches', total.branches.covered, total.branches.total, total.branches.pct);
console.log(`\nReports: coverage/lcov.info, coverage/coverage-summary.json\n`);
