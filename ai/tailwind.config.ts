import type { Config } from 'tailwindcss';

/** Every colour is a CSS variable (defined in globals.css) so the light theme - toggled by the
 * header's moon/sun button, same `theme` localStorage key as the static mes.fm pages - can swap
 * them all at once. `html.light` flips the gray scale end for end (gray-100 text becomes
 * gray-900), which is what turns the dark-built dashboards into a readable light page without a
 * light: variant on every class. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: v('c-bg'),
          panel: v('c-panel'),
          border: v('c-border'),
        },
        accent: {
          DEFAULT: v('c-accent'),
          muted: v('c-accent-muted'),
        },
        gain: v('c-gain'),
        loss: v('c-loss'),
        gray: {
          50: v('g-50'),
          100: v('g-100'),
          200: v('g-200'),
          300: v('g-300'),
          400: v('g-400'),
          500: v('g-500'),
          600: v('g-600'),
          700: v('g-700'),
          800: v('g-800'),
          900: v('g-900'),
          950: v('g-950'),
        },
      },
    },
  },
  plugins: [],
};

export default config;
