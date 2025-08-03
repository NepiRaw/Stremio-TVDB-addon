/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00A86B',
        'primary-light': '#8EC7B4',
        'bg-dark': '#1a2526',
        'bg-darker': '#0d1a1b',
        'card-bg': 'rgba(34, 45, 46, 0.92)',
        'card-secondary': 'rgba(42, 53, 54, 0.6)',
        'card-tertiary': 'rgba(50, 61, 62, 0.6)',
      },
      boxShadow: {
        'custom-hover': '0 10px 20px rgba(0, 0, 0, 0.3)',
      },
      fontFamily: {
        'roboto': ['Roboto', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.6s ease-out',
        'fade-in': 'fadeIn 0.3s ease',
      },
      keyframes: {
        slideUp: {
          from: {
            opacity: '0',
            transform: 'translateY(30px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        fadeIn: {
          from: { 
            opacity: '0', 
            transform: 'translateY(-5px)' 
          },
          to: { 
            opacity: '1', 
            transform: 'translateY(0)' 
          },
        },
      },
    },
  },
  plugins: [],
}
