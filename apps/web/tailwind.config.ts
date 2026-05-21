import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          900: '#0c0e12',
          800: '#1a1d23',
          700: '#2a2e36',
          500: '#6b7280',
          300: '#9ca3af',
          200: '#d1d5db',
          100: '#e5e7eb',
        },
        accent: {
          50: '#f6f3ef',
          100: '#ece5dc',
          400: '#8a7a5e',
          600: '#5a4d36',
          700: '#3f3624',
        },
        signal: {
          danger: '#b91c1c',
          warn: '#a16207',
          ok: '#15803d',
          info: '#1e40af',
        },
      },
    },
  },
  plugins: [],
};

export default config;
