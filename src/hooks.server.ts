import { runSyncJob } from '$lib/server/gold';

// Note: scheduled handler is now managed in worker.js to ensure 
// Cloudflare correctly exports the handler after SvelteKit build.
