import { json } from '@sveltejs/kit';
import { runSyncJob } from '$lib/server/gold';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ platform }) => {
    if (!platform) {
        return json({ error: 'Platform not found' }, { status: 500 });
    }

    await runSyncJob(platform, true);
    return json({ success: true });
};
