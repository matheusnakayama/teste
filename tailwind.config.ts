import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f6ff',
          100: '#e3ebff',
          200: '#c2d1ff',
          300: '#98adff',
          400: '#6b82ff',
          500: '#4657f6',
          600: '#3640db',
          700: '#2c31ad',
          800: '#262a87',
          900: '#22266b',
        },
        surface: {
          DEFAULT: '#0f1117',
          soft: '#161923',
          card: '#1c1f2b',
          border: '#2a2e3d',
        },
        danger: '#ef4444',
        success: '#22c55e',
        warn: '#f59e0b',
      },
      keyframes: {
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(34,197,94,0.55)' },
          '100%': { boxShadow: '0 0 0 8px rgba(34,197,94,0)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        speaking: 'pulseRing 1.4s ease-out infinite',
        fadeIn: 'fadeIn 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
