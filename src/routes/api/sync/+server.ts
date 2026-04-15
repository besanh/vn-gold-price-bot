import { json } from '@sveltejs/kit';
import { runSyncJob } from '$lib/server/gold';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ platform, url }) => {
    if (!platform) {
        return json({ error: 'Platform not found' }, { status: 500 });
    }

    const reset = url.searchParams.get('reset') === 'true';
    await runSyncJob(platform, true, reset);
    return json({ success: true });
};
