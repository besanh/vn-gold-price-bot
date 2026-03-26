import { getDashboardData } from '$lib/server/gold';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
    if (!platform) {
        // Mock data for local development if platform is missing
        return {
            current: [],
            history: {}
        };
    }

    const data = await getDashboardData(platform);
    return data;
};
