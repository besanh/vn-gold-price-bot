export interface ToastMessage {
    id: number;
    type: 'success' | 'error' | 'info';
    message: { en: string; vi: string };
}

class ToastState {
    messages = $state<ToastMessage[]>([]);
    private nextId = 0;

    add(type: ToastMessage['type'], en: string, vi: string) {
        const id = this.nextId++;
        this.messages.push({ id, type, message: { en, vi } });
        setTimeout(() => this.remove(id), 4000);
    }

    remove(id: number) {
        this.messages = this.messages.filter(m => m.id !== id);
    }
}

export const toaster = new ToastState();
