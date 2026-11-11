import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          900: '#111827',
          700: '#374151',
          600: '#4B5563',
          400: '#9CA3AF',
          300: '#D1D5DB',
        },
        accent: {
          50: '#EEF0FF',
          100: '#E0E3FF',
          300: '#A5A8F0',
          500: '#5B5BD6',
          600: '#4C4CC4',
          700: '#4338CA',
        },
        canvas: '#F7F8FA',
        line: '#E9EBF0',
      },
      boxShadow: {
        card: '0 1px 2px rgba(17, 24, 39, 0.04), 0 8px 24px -16px rgba(17, 24, 39, 0.18)',
        lift: '0 2px 6px rgba(17, 24, 39, 0.06), 0 18px 36px -24px rgba(17, 24, 39, 0.24)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slide: {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
        slide: 'slide 200ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [animate],
};
