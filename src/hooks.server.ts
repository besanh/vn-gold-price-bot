import { runSyncJob } from '$lib/server/gold';

/** @type {import('@sveltejs/kit').Handle} */
export const scheduled = async ({ platform }: any) => {
    if (platform) {
        await runSyncJob(platform, false);
    }
};
