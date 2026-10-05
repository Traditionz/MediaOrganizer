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

export type TimelineHeading = {
	label: string;
	detail: string | null;
};

/** Month name plus year. Unknown or invalid keys stay a single label. */
export function timelineMonthHeading(key: string): TimelineHeading {
	if (key === 'unknown') return { label: 'Unknown date', detail: null };
	const year = Number(key.slice(0, 4));
	const month = Number(key.slice(5, 7));
	if (!Number.isFinite(year) || month < 1 || month > 12) return { label: key, detail: null };
	return { label: MONTH_NAMES[month - 1] ?? key, detail: String(year) };
}

export function timelineMonthLabel(key: string): string {
	const heading = timelineMonthHeading(key);
	return heading.detail == null ? heading.label : `${heading.label} ${heading.detail}`;
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
