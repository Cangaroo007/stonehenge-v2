/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Linear-inspired design system palette
        // Primary action color - amber for emphasis
        primary: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706', // Primary action buttons
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
          950: '#451A03',
        },
        
        // Success states
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A', // Success indicators
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
          950: '#052E16',
        },
        
        // Warning states
        warning: {
          50: '#FEFCE8',
          100: '#FEF9C3',
          200: '#FEF08A',
          300: '#FDE047',
          400: '#FACC15',
          500: '#EAB308',
          600: '#CA8A04', // Warning indicators
          700: '#A16207',
          800: '#854D0E',
          900: '#713F12',
          950: '#422006',
        },
        
        // Danger/Error states
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626', // Error indicators
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
          950: '#450A0A',
        },
        
        // Info states
        info: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB', // Info indicators
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        
        // Neutral scale (zinc) - Linear's signature grayscale
        background: {
          DEFAULT: '#FAFAFA', // zinc-50 - main background
          surface: '#FFFFFF', // white - elevated surfaces (cards, modals)
          sidebar: '#18181B', // zinc-900 - dark sidebar/navigation
        },
        
        text: {
          primary: '#18181B',   // zinc-900 - primary text
          secondary: '#52525B', // zinc-600 - secondary text
          tertiary: '#A1A1AA',  // zinc-400 - tertiary/muted text
          inverse: '#FAFAFA',   // zinc-50 - text on dark backgrounds
        },
        
        border: {
          DEFAULT: '#E4E4E7',   // zinc-200 - default borders
          subtle: '#F4F4F5',    // zinc-100 - subtle borders
          strong: '#A1A1AA',    // zinc-400 - emphasized borders
        },
      },
      
      // Semantic spacing scale (Linear uses consistent 8px grid)
      spacing: {
        '18': '4.5rem',   // 72px
        '88': '22rem',    // 352px
        '104': '26rem',   // 416px
        '128': '32rem',   // 512px
      },
      
      // Typography enhancements
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Fira Code', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }], // 10px
      },
      
      // Border radius (Linear uses subtle rounding)
      borderRadius: {
        'sm': '0.25rem',  // 4px
        DEFAULT: '0.375rem', // 6px
        'md': '0.5rem',   // 8px
        'lg': '0.75rem',  // 12px
        'xl': '1rem',     // 16px
      },
      
      // Box shadows (Linear uses subtle, layered shadows)
      boxShadow: {
        'linear-sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'linear': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'linear-md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'linear-lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'linear-xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },
      
      // Animation timings (Linear uses snappy, purposeful animations)
      transitionDuration: {
        '250': '250ms',
      },

      transitionTimingFunction: {
        'linear-ease': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },

      animation: {
        shimmer: 'shimmer 1.5s infinite linear',
        'fade-in': 'fade-in 0.15s ease',
      },
    },
  },
  plugins: [],
}
