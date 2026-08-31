import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0e14',
          panel: '#131722',
          border: '#232838',
        },
        accent: {
          DEFAULT: '#f0b90b',
          muted: '#8a6d00',
        },
        gain: '#22c55e',
        loss: '#ef4444',
      },
    },
  },
  plugins: [],
};

export default config;
