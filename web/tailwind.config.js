/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f6fc',
          100: '#e3ebf7',
          200: '#c2d4ee',
          300: '#93b4e0',
          400: '#5d8bcc',
          500: '#386bb3',
          600: '#285497',
          700: '#23447a',
          800: '#213b66',
          900: '#1d3356',
          950: '#0f172a',
        },
        accent: {
          50: '#fffaeb',
          100: '#fff0c6',
          200: '#ffe088',
          300: '#ffcb4a',
          400: '#ffb420',
          500: '#f99307',
          600: '#dd6c02',
          700: '#b74c06',
          800: '#943b0c',
          900: '#7a310d',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Tahoma', '"Noto Kufi Arabic"', '"Cairo"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.12)',
        pop: '0 20px 50px -12px rgba(15,23,42,.3)',
      },
      borderRadius: { xl2: '1.1rem' },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(-12px)' }, to: { opacity: '1', transform: 'none' } },
        pulse2: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.4' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'slide-in': 'slide-in .2s ease-out',
        pulse2: 'pulse2 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
