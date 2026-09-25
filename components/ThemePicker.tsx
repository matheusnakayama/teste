'use client';

import { useEffect, useState } from 'react';

const THEMES = [
  { id: 'violet', name: 'Roxo', color: '#a855f7' },
  { id: 'rose', name: 'Rosa', color: '#f43f5e' },
  { id: 'emerald', name: 'Verde', color: '#10b981' },
  { id: 'amber', name: 'Âmbar', color: '#f59e0b' },
  { id: 'cyan', name: 'Ciano', color: '#06b6d4' },
  { id: 'blue', name: 'Azul', color: '#4657f6' },
] as const;

type ThemeId = (typeof THEMES)[number]['id'];
const STORAGE_KEY = 'videochamada-theme';

export default function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>('violet');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Se o navegador bloquear armazenamento, o tema ainda pode ser usado nesta aba.
    }
    const initial = THEMES.some((option) => option.id === saved) ? (saved as ThemeId) : 'violet';
    setTheme(initial);
    document.documentElement.dataset.theme = initial;

    function syncTheme(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !THEMES.some((option) => option.id === event.newValue)) return;
      const next = event.newValue as ThemeId;
      setTheme(next);
      document.documentElement.dataset.theme = next;
    }

    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  function chooseTheme(next: ThemeId) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A alteração visual continua valendo nesta aba mesmo sem persistência.
    }
  }

  const selected = THEMES.find((option) => option.id === theme) ?? THEMES[0];

  return (
    <div className="fixed right-3 top-3 z-[100] sm:right-5 sm:top-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Escolher cor visual da página"
        className="flex h-10 items-center gap-2 rounded-full border border-surface-border bg-surface-card/95 px-3 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-surface-border"
      >
        <span className="h-4 w-4 rounded-full ring-2 ring-white/30" style={{ backgroundColor: selected.color }} />
        <span className="hidden sm:inline">Tema</span>
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Cor visual da página"
          className="absolute right-0 mt-2 w-64 rounded-2xl border border-surface-border bg-surface-card p-4 text-white shadow-2xl"
        >
          <h2 className="text-sm font-semibold">Cor da página</h2>
          <p className="mt-1 text-xs text-white/55">Só muda a aparência neste navegador.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {THEMES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseTheme(option.id)}
                aria-pressed={theme === option.id}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                  theme === option.id
                    ? 'border-brand-400 bg-brand-500/15'
                    : 'border-surface-border hover:bg-surface-soft'
                }`}
              >
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
                {option.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded-lg bg-surface-soft px-3 py-2 text-xs text-white/80 hover:bg-surface-border"
          >
            Fechar
          </button>
        </section>
      )}
    </div>
  );
}
