import { json } from '@sveltejs/kit';
import { runSyncJob } from '$lib/server/gold';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
    if (!platform) {
        return json({ error: 'Platform not found' }, { status: 500 });
    }

    // Automated run (scheduled)
    await runSyncJob(platform, false);
    return json({ success: true, mode: 'automated' });
};
