/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        sync: {
          teal: '#2A9D8F',
          'teal-light': '#3DBFAE',
          'teal-dark': '#1F7A6E',
          cyan: '#06B6D4',
          honey: '#D4A843',
          'honey-dark': '#B8922E',
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(42, 157, 143, 0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(6, 182, 212, 0.7)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
    },
  },
  plugins: [],
};
