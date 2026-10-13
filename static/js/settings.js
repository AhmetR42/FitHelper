// Personal preferences, kept in this browser only.

const KEY = 'fithelper:settings';

export const DEFAULTS = {
    theme: 'auto',
    accent: 'violet',
    weeklyGoal: 3,
    restSeconds: 90,
    sound: true,
    autoTimer: false,
    motion: 'full',
};

function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return { ...DEFAULTS, ...saved };
    } catch {
        return { ...DEFAULTS };
    }
}

export const settings = load();

export function applySettings() {
    const root = document.documentElement;
    if (settings.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    root.dataset.accent = settings.accent;
    root.dataset.motion = settings.motion;
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#161925' : '#f4f5fa');
}

export function saveSettings(patch) {
    Object.assign(settings, patch);
    try {
        localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
        // Private mode: the setting still works until the page is closed.
    }
    applySettings();
}

export const calm = () => settings.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
