import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { PlaybackJobStatus } from '$lib/media/playbackEncode';
import { getMediaByIds } from '$lib/server/media';
import { playbackJobStatuses, queuePlaybackJobs } from '$lib/server/playbackJobs';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { own, readJsonObject, stringList } from '$lib/parse';

function requireProfileId(cookies: Parameters<RequestHandler>[0]['cookies']): string {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile.id;
}

function respond(profileId: string, jobs: PlaybackJobStatus[]) {
	const done = jobs.filter((job) => job.state === 'done').map((job) => job.id);
	return json({ jobs, items: getMediaByIds(profileId, done) });
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const profileId = requireProfileId(cookies);
	const body = await readJsonObject(request);
	const ids = stringList(body ? own(body, 'ids') : undefined);
	if (!ids.length) throw error(400, 'At least one media id is required');
	return respond(profileId, queuePlaybackJobs(profileId, ids));
};

export const GET: RequestHandler = async ({ url, cookies }) => {
	const profileId = requireProfileId(cookies);
	const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
	if (!ids.length) throw error(400, 'At least one media id is required');
	return respond(profileId, playbackJobStatuses(profileId, ids));
};
