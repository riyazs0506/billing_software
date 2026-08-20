/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm restaurant branding (08-UI-UX: "warm palette consistent with
        // restaurant branding"). Spice-red primary, turmeric accent.
        brand: {
          50: '#fdf5f3',
          100: '#fbe8e3',
          200: '#f7d0c7',
          300: '#f0ae9e',
          400: '#e57f66',
          500: '#d65a3c',
          600: '#c03f22',
          700: '#a1321c',
          800: '#852c1b',
          900: '#6f291c',
          950: '#3c120a',
        },
        saffron: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        ink: {
          50: '#f6f6f5',
          100: '#e7e7e4',
          200: '#d1d0cb',
          300: '#b1afa6',
          400: '#8b8880',
          500: '#706d66',
          600: '#5a5852',
          700: '#4a4844',
          800: '#3e3d3a',
          900: '#2b2a28',
          950: '#1a1917',
        },
        // Table status colours, fixed by the UI spec:
        // green = empty, yellow = occupied, orange = bill-pending.
        table: {
          empty: '#16a34a',
          occupied: '#eab308',
          pending: '#f97316',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Inter', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(26, 25, 23, 0.05), 0 8px 24px -12px rgba(26, 25, 23, 0.18)',
        lift: '0 2px 4px rgba(26, 25, 23, 0.06), 0 18px 40px -18px rgba(26, 25, 23, 0.28)',
        inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      },
      borderRadius: {
        xl2: '1rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(214, 90, 60, 0.45)' },
          '70%': { boxShadow: '0 0 0 10px rgba(214, 90, 60, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(214, 90, 60, 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.8s infinite',
      },
    },
  },
  plugins: [],
}
