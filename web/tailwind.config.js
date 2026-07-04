/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0f1115',
          panel: '#171a21',
          border: '#262b36',
          accent: '#ffcd00',
          accent2: '#4ea1ff',
        },
      },
    },
  },
  plugins: [],
};
