'use client';

import { useEffect, useState } from 'react';

const THEMES = [
  { id: 'violet', name: 'Roxo', colors: ['#6b21a8', '#a855f7', '#c084fc', '#e9d5ff'] },
  { id: 'rose', name: 'Rosa', colors: ['#9f1239', '#f43f5e', '#fb7185', '#fecdd3'] },
  { id: 'emerald', name: 'Verde', colors: ['#065f46', '#10b981', '#4ade80', '#bbf7d0'] },
  { id: 'amber', name: 'Âmbar', colors: ['#92400e', '#f59e0b', '#fbbf24', '#fde68a'] },
  { id: 'cyan', name: 'Ciano', colors: ['#155e75', '#06b6d4', '#22d3ee', '#a5f3fc'] },
  { id: 'blue', name: 'Azul', colors: ['#2c31ad', '#4657f6', '#818cf8', '#c7d2fe'] },
  { id: 'indigo', name: 'Índigo', colors: ['#3730a3', '#6366f1', '#a5b4fc', '#c7d2fe'] },
  { id: 'orange', name: 'Laranja', colors: ['#9a3412', '#f97316', '#fb923c', '#fed7aa'] },
  { id: 'black', name: 'Nigga', colors: ['#111827', '#475569', '#94a3b8', '#cbd5e1'] },
  { id: 'mint', name: 'Menta', colors: ['#0f766e', '#2dd4bf', '#5eead4', '#ccfbf1'] },
  { id: 'sunset', name: 'Pôr do sol', colors: ['#be123c', '#fb7185', '#fb923c', '#fcd34d'] },
  { id: 'ocean', name: 'Oceano', colors: ['#1d4ed8', '#0ea5e9', '#22d3ee', '#99f6e4'] },
  { id: 'candy', name: 'Candy', colors: ['#be185d', '#ec4899', '#d946ef', '#c4b5fd'] },
  { id: 'graphite', name: 'Grafite', colors: ['#1f2937', '#475569', '#64748b', '#cbd5e1'] },
] as const;

type ThemeId = (typeof THEMES)[number]['id'];
const STORAGE_KEY = 'videochamada-theme';

function applyTheme(themeId: ThemeId) {
  const option = THEMES.find((candidate) => candidate.id === themeId) ?? THEMES[0];
  document.documentElement.dataset.theme = themeId;
  option.colors.forEach((color, index) => {
    document.documentElement.style.setProperty(`--theme-gradient-${index + 1}`, color);
  });
}

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
    applyTheme(initial);

    function syncTheme(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !THEMES.some((option) => option.id === event.newValue)) return;
      const next = event.newValue as ThemeId;
      setTheme(next);
      applyTheme(next);
    }

    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  function chooseTheme(next: ThemeId) {
    setTheme(next);
    applyTheme(next);
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
        <span
          className="h-4 w-4 rounded-full ring-2 ring-white/30"
          style={{ background: `linear-gradient(135deg, ${selected.colors.join(', ')})` }}
        />
        <span className="hidden sm:inline">Tema</span>
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Cor visual da página"
          className="absolute right-0 mt-2 max-h-[calc(100vh-4rem)] w-64 overflow-y-auto rounded-2xl border border-surface-border bg-surface-card p-4 text-white shadow-2xl"
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
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ background: `linear-gradient(135deg, ${option.colors.join(', ')})` }}
                />
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
