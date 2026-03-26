export const uiState = $state({
    lang: 'vi',
    theme: 'dark'
});

export function initUIState() {
    if (typeof localStorage !== 'undefined') {
        uiState.lang = localStorage.getItem('lang') || 'vi';
        uiState.theme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(uiState.theme);
        applyLang(uiState.lang);
    }
}

export function setLang(l: string) {
    uiState.lang = l;
    localStorage.setItem('lang', l);
    applyLang(l);
}

export function toggleTheme() {
    uiState.theme = uiState.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', uiState.theme);
    applyTheme(uiState.theme);
}

function applyTheme(t: string) {
    if (t === 'light') document.documentElement.classList.add('light-mode');
    else document.documentElement.classList.remove('light-mode');
}

function applyLang(l: string) {
    document.documentElement.setAttribute('lang', l);
}
