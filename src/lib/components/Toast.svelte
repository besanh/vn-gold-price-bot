<script lang="ts">
    import { toaster } from '$lib/toast.svelte';
    import { uiState } from '$lib/uiState.svelte';
    import { flip } from 'svelte/animate';
    import { fly } from 'svelte/transition';
</script>

<div class="toast-container" aria-live="polite">
    {#each toaster.messages as toast (toast.id)}
        <div 
            class="toast {toast.type}" 
            animate:flip={{ duration: 300 }}
            in:fly={{ y: 50, duration: 300 }}
            out:fly={{ opacity: 0, x: 50, duration: 300 }}
            role="alert"
        >
            <div class="icon" aria-hidden="true">
                {#if toast.type === 'success'}
                    ✓
                {:else if toast.type === 'error'}
                    ✕
                {:else}
                    ℹ
                {/if}
            </div>
            <div class="message">
                {uiState.lang === 'vi' ? toast.message.vi : toast.message.en}
            </div>
            <button class="close" aria-label="Close notification" onclick={() => toaster.remove(toast.id)}>✕</button>
        </div>
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        bottom: 2.5rem;
        right: 2.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        z-index: 9999;
        pointer-events: none;
    }

    .toast {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.25rem;
        border-radius: 12px;
        background: var(--card-bg, rgba(30, 41, 59, 0.95));
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
        border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
        color: var(--text, #f8fafc);
        font-family: 'Outfit', sans-serif;
        min-width: 280px;
        max-width: 400px;
    }

    .toast.success .icon { color: var(--up, #34d399); }
    .toast.error .icon { color: var(--down, #fca5a5); }

    .icon {
        font-size: 1.25rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .message {
        flex: 1;
        font-size: 0.95rem;
        font-weight: 500;
    }

    .close {
        background: none;
        border: none;
        color: var(--text-muted, #cbd5e1);
        cursor: pointer;
        padding: 0.25rem;
        font-size: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s ease;
    }

    .close:hover {
        color: var(--text);
        background: rgba(255, 255, 255, 0.1);
    }

    @media (max-width: 640px) {
        .toast-container {
            bottom: 1.5rem;
            right: 1.5rem;
            left: 1.5rem;
        }
        .toast {
            min-width: unset;
            width: 100%;
            box-sizing: border-box;
        }
    }
</style>
