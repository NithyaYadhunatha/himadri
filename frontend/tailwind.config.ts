import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Kept in sync with src/app/globals.css's Tailwind v4 @theme block
        // (which is the actual source of truth for this app's build — see
        // that file's comment). Antarctic ice-blue palette.
        brand: {
          bg: '#E7F1F8',
          surface: '#F7FBFD',
          border: '#B9D6E6',
          'surface-2': '#EDF5FA',
          'surface-3': '#D9E9F2',
        },
        cyan: {
          DEFAULT: '#1868A0',
          dim: '#1868A033',
          glow: '#1868A066',
        },
        amber: {
          DEFAULT: '#B8720F',
          dim: '#B8720F33',
        },
        crimson: {
          DEFAULT: '#B23A2E',
          dim: '#B23A2E33',
        },
        emerald: {
          DEFAULT: '#1F9E6D',
          dim: '#1F9E6D33',
        },
        violet: {
          brand: '#6E7FCE',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '2px',
        md: '4px',
        lg: '4px', // capped at md per design spec
        xl: '4px',
        '2xl': '4px',
      },
      boxShadow: {
        'cyan-glow': '0 0 20px #1868A033',
        'amber-glow': '0 0 20px #B8720F33',
        'crimson-glow': '0 0 20px #B23A2E33',
        'emerald-glow': '0 0 20px #1F9E6D33',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern': `linear-gradient(rgba(185,214,230,0.5) 1px, transparent 1px),
          linear-gradient(90deg, rgba(185,214,230,0.5) 1px, transparent 1px)`,
      },
    },
  },
  plugins: [],
}

export default config
