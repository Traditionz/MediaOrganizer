import { removeConfiguredE2eDataDir } from '../src/lib/server/e2eDataCleanup';

/** Playwright globalSetup / globalTeardown: wipe the preview sandbox after (and before) a run. */
export default function cleanupE2eData(): void {
	removeConfiguredE2eDataDir(process.cwd(), process.env.MEDIA_DATA_DIR ?? 'e2e-data');
}
