import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const catchupPreset = require('@app/ui/tailwind-preset');

const config: Config = {
  // Shared preset = every app inherits the same Carbon tokens.
  presets: [catchupPreset],
  content: [
    './app/**/*.{ts,tsx}',
    // Scan the design-system packages so their utility classes are emitted.
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/core/src/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
