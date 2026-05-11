import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: { sans:['Roboto','system-ui','sans-serif'] },
      colors: {
        bg: { base:'#000', surface:'#000', card:'rgba(0,0,0,0.75)', hover:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.10)' },
        accent: { DEFAULT:'#00F0FF', dim:'rgba(0,240,255,0.12)', hover:'#33F4FF' },
        text: { primary:'#FFFFFF', secondary:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.2)' },
      },
      borderRadius: { sm:'14px', xl:'19px', '2xl':'24px', '3xl':'42px', full:'9999px' },
      backgroundImage: {
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      },
      boxShadow: {
        card:  '0 1px 1px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.4)',
        glow:  '0 0 20px rgba(123,110,246,0.25)',
        'glow-sm': '0 0 10px rgba(123,110,246,0.15)',
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to:   { transform: 'translateY(0)', opacity: '1' },
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
        shimmer:    'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
