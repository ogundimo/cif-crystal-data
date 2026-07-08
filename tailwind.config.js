/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mica: '#f3f3f3',
        accent: '#0067c0',
        'accent-soft': '#cce4f7',
        stroke: '#e5e5e5',
        'stroke-strong': '#d0d0d0',
        'text-dim': '#5d5d5d'
      },
      fontFamily: {
        segoe: ['"Segoe UI Variable Text"', '"Segoe UI"', 'sans-serif']
      }
    }
  },
  plugins: []
};
