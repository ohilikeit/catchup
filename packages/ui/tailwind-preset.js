/**
 * CatchUP Tailwind preset — maps Tailwind utilities onto the semantic CSS
 * variables defined in src/styles/tokens.css. Components use role utilities
 * (bg-background, text-text-secondary, border-border-subtle) instead of raw
 * colors, so a token swap (.dark) re-themes everything with no edits.
 *
 * Shared via `presets: [require('@app/ui/tailwind-preset')]` in every app.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Raw Carbon ramps (use sparingly — prefer the semantic roles below)
        gray: {
          10: 'var(--gray-10)', 20: 'var(--gray-20)', 30: 'var(--gray-30)',
          40: 'var(--gray-40)', 50: 'var(--gray-50)', 60: 'var(--gray-60)',
          70: 'var(--gray-70)', 80: 'var(--gray-80)', 90: 'var(--gray-90)',
          100: 'var(--gray-100)',
        },
        blue: {
          10: 'var(--blue-10)', 20: 'var(--blue-20)', 30: 'var(--blue-30)',
          40: 'var(--blue-40)', 50: 'var(--blue-50)', 60: 'var(--blue-60)',
          70: 'var(--blue-70)', 80: 'var(--blue-80)', 90: 'var(--blue-90)',
          100: 'var(--blue-100)',
        },
        red: {
          10: 'var(--red-10)', 20: 'var(--red-20)', 30: 'var(--red-30)',
          40: 'var(--red-40)', 50: 'var(--red-50)', 60: 'var(--red-60)',
          70: 'var(--red-70)', 80: 'var(--red-80)', 90: 'var(--red-90)',
        },
        green: {
          10: 'var(--green-10)', 30: 'var(--green-30)', 40: 'var(--green-40)',
          50: 'var(--green-50)', 60: 'var(--green-60)',
        },
        yellow: {
          10: 'var(--yellow-10)', 20: 'var(--yellow-20)', 30: 'var(--yellow-30)',
        },

        // Semantic roles (the ones components should use)
        background: {
          DEFAULT: 'var(--background)',
          inverse: 'var(--background-inverse)',
          hover: 'var(--background-hover)',
          active: 'var(--background-active)',
        },
        layer: {
          '01': 'var(--layer-01)',
          '02': 'var(--layer-02)',
          '03': 'var(--layer-03)',
          'hover-01': 'var(--layer-hover-01)',
          'accent-01': 'var(--layer-accent-01)',
        },
        field: {
          '01': 'var(--field-01)',
          '02': 'var(--field-02)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          placeholder: 'var(--text-placeholder)',
          helper: 'var(--text-helper)',
          'on-color': 'var(--text-on-color)',
          disabled: 'var(--text-disabled)',
          error: 'var(--text-error)',
          inverse: 'var(--text-inverse)',
        },
        icon: {
          primary: 'var(--icon-primary)',
          secondary: 'var(--icon-secondary)',
          'on-color': 'var(--icon-on-color)',
          disabled: 'var(--icon-disabled)',
        },
        link: {
          primary: 'var(--link-primary)',
          'primary-hover': 'var(--link-primary-hover)',
          visited: 'var(--link-visited)',
        },
        border: {
          'subtle-00': 'var(--border-subtle-00)',
          'subtle-01': 'var(--border-subtle-01)',
          'strong-01': 'var(--border-strong-01)',
          interactive: 'var(--border-interactive)',
          inverse: 'var(--border-inverse)',
        },
        interactive: 'var(--interactive)',
        focus: 'var(--focus)',
        highlight: 'var(--highlight)',
        button: {
          primary: 'var(--button-primary)',
          'primary-hover': 'var(--button-primary-hover)',
          'primary-active': 'var(--button-primary-active)',
          secondary: 'var(--button-secondary)',
          'secondary-hover': 'var(--button-secondary-hover)',
          'secondary-active': 'var(--button-secondary-active)',
          tertiary: 'var(--button-tertiary)',
          danger: 'var(--button-danger-primary)',
          'danger-hover': 'var(--button-danger-hover)',
          'danger-active': 'var(--button-danger-active)',
          disabled: 'var(--button-disabled)',
        },
        support: {
          error: 'var(--support-error)',
          success: 'var(--support-success)',
          warning: 'var(--support-warning)',
          info: 'var(--support-info)',
        },
        notification: {
          error: 'var(--notification-error-bg)',
          success: 'var(--notification-success-bg)',
          warning: 'var(--notification-warning-bg)',
          info: 'var(--notification-info-bg)',
        },
      },

      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
        serif: 'var(--font-serif)',
      },

      // Carbon is sharp by default; only tags/tooltips soften.
      borderRadius: {
        none: 'var(--radius-none)',
        sm: 'var(--radius-sm)',
        pill: 'var(--radius-pill)',
        DEFAULT: 'var(--radius-none)',
      },

      spacing: {
        '01': 'var(--spacing-01)', '02': 'var(--spacing-02)',
        '03': 'var(--spacing-03)', '04': 'var(--spacing-04)',
        '05': 'var(--spacing-05)', '06': 'var(--spacing-06)',
        '07': 'var(--spacing-07)', '08': 'var(--spacing-08)',
        '09': 'var(--spacing-09)', '10': 'var(--spacing-10)',
        '11': 'var(--spacing-11)', '12': 'var(--spacing-12)',
        '13': 'var(--spacing-13)',
      },

      height: {
        'control-sm': 'var(--size-sm)',
        'control-md': 'var(--size-md)',
        'control-lg': 'var(--size-lg)',
      },

      boxShadow: {
        menu: 'var(--shadow-menu)',
        overlay: 'var(--shadow-overlay)',
        modal: 'var(--shadow-modal)',
        tooltip: 'var(--shadow-tooltip)',
        // Carbon's signature 2px inset focus ring
        focus: 'inset 0 0 0 2px var(--focus)',
        'focus-inset': 'inset 0 0 0 1px var(--focus), inset 0 0 0 2px var(--focus-inset)',
        none: 'none',
      },

      transitionTimingFunction: {
        productive: 'var(--ease-productive-standard)',
        entrance: 'var(--ease-productive-entrance)',
        exit: 'var(--ease-productive-exit)',
        expressive: 'var(--ease-expressive-standard)',
      },

      transitionDuration: {
        'fast-01': '70ms',
        'fast-02': '110ms',
        'moderate-01': '150ms',
        'moderate-02': '240ms',
        'slow-01': '400ms',
        'slow-02': '700ms',
      },
    },
  },
  plugins: [],
};
