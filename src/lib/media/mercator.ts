const MAX_LAT = 85.05112878;

export type MapPoint = {
	id: string;
	x: number;
	y: number;
	lat: number;
	lng: number;
};

export function clampLat(lat: number): number {
	return Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
}

/** Project WGS84 to 0–1 Web Mercator. */
export function lngLatToMercator(lng: number, lat: number): { x: number; y: number } | null {
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	const x = (lng + 180) / 360;
	const clamped = clampLat(lat) * (Math.PI / 180);
	const mercN = Math.log(Math.tan(Math.PI / 4 + clamped / 2));
	const y = 0.5 - mercN / (2 * Math.PI);
	return { x, y };
}

export function mediaMapPoints(
	items: ReadonlyArray<{ id: string; gps_lat?: number | null; gps_lng?: number | null }>
): MapPoint[] {
	const out: MapPoint[] = [];
	for (const item of items) {
		if (item.gps_lat == null || item.gps_lng == null) continue;
		const xy = lngLatToMercator(item.gps_lng, item.gps_lat);
		if (!xy) continue;
		out.push({
			id: item.id,
			x: xy.x,
			y: xy.y,
			lat: item.gps_lat,
			lng: item.gps_lng
		});
	}
	return out;
}
