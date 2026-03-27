export interface ToastMessage {
    id: number;
    type: 'success' | 'error' | 'info' | 'loading';
    message: { en: string; vi: string };
}

class ToastState {
    messages = $state<ToastMessage[]>([]);
    private nextId = 0;

    add(type: ToastMessage['type'], en: string, vi: string, durationMs = 4000): number {
        const id = this.nextId++;
        this.messages.push({ id, type, message: { en, vi } });
        if (durationMs > 0) setTimeout(() => this.remove(id), durationMs);
        return id;
    }

    remove(id: number) {
        this.messages = this.messages.filter(m => m.id !== id);
    }
}

export const toaster = new ToastState();
