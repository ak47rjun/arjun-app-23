import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', './src/app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        arjun: {
          bg: '#030d09',
          bg2: '#052015',
          panel: '#071f16',
          line: 'rgba(52, 211, 153, 0.14)',
          emerald: '#10b981',
          emerald2: '#34d399',
          mint: '#a7f3d0',
          cyan: '#67e8f9',
          text: '#e9f7f0',
          muted: '#8fb8a5',
          danger: '#fb7185',
          warn: '#fbbf24',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        glow: '0 0 24px rgba(16, 185, 129, 0.25)',
        'glow-lg': '0 0 60px rgba(16, 185, 129, 0.35)',
      },
      backdropBlur: {
        glass: '20px',
      },
      backgroundImage: {
        'aurora': 'radial-gradient(60% 50% at 50% 0%, rgba(16,185,129,0.14), transparent 70%)',
        'aurora-2': 'radial-gradient(40% 40% at 80% 20%, rgba(103,232,249,0.07), transparent 70%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(16,185,129,0.25)' },
          '50%': { boxShadow: '0 0 44px rgba(16,185,129,0.5)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.6s ease both',
        float: 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 4s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        'spin-slow': 'spin-slow 24s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
