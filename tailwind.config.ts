import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['Roboto', 'system-ui', 'sans-serif'] },
      colors: {
        bg: {
          base:    'var(--bg-base)',
          surface: 'var(--bg-surface)',
          card:    'var(--bg-card)',
          hover:   'var(--bg-hover)',
          border:  'var(--bg-border)',
        },
        accent: {
          DEFAULT: 'var(--c-accent)',
          hover:   'var(--c-accent-h)',
          dim:     'var(--c-accent-dim)',
        },
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          dim:       'var(--text-dim)',
        },
        emerald: 'var(--c-emerald)',
        amber:   'var(--c-amber)',
        pink:    'var(--c-pink)',
        danger:  'var(--c-danger)',
      },
      borderRadius: {
        sm:    '14px',
        xl:    '19px',
        '2xl': '24px',
        '3xl': '32px',
        full:  '9999px',
      },
      backgroundImage: {
        glass: 'var(--glass-bg)',
      },
      boxShadow: {
        card:      'var(--shadow-card)',
        glow:      '0 0 20px rgba(129,115,245,0.22)',
        'glow-sm': '0 0 10px rgba(129,115,245,0.14)',
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200px 0' },
          to:   { backgroundPosition: 'calc(200px + 100%) 0' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in':  'fade-in 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        shimmer:    'shimmer 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config