import { mediaMonthKey, type DateFields } from './captureDate';

export type TimelineSection<T extends DateFields & { id: string }> = {
	key: string;
	label: string;
	items: T[];
};

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

export function timelineMonthLabel(key: string): string {
	if (key === 'unknown') return 'Unknown date';
	const year = Number(key.slice(0, 4));
	const month = Number(key.slice(5, 7));
	if (!Number.isFinite(year) || month < 1 || month > 12) return key;
	return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function groupMediaByMonth<T extends DateFields & { id: string }>(
	items: readonly T[]
): TimelineSection<T>[] {
	const order: string[] = [];
	const buckets = new Map<string, T[]>();
	for (const item of items) {
		const key = mediaMonthKey(item);
		const list = buckets.get(key);
		if (list) {
			list.push(item);
		} else {
			buckets.set(key, [item]);
			order.push(key);
		}
	}
	return order.map((key) => ({
		key,
		label: timelineMonthLabel(key),
		items: buckets.get(key) ?? []
	}));
}
