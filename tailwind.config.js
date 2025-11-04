/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Inter', 'sans-serif'],
      },
      colors: {
        'vedit-pink': '#ff69b4',
        'vedit-purple': '#9b5de5',
        'vedit-blue': '#00bbf9',
        'vedit-glass': 'rgba(255, 255, 255, 0.1)',
      },
      backdropBlur: {
        xl: '20px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(155, 93, 229, 0.6)',
        'glow-strong': '0 0 30px rgba(0, 187, 249, 0.8)',
      },
      dropShadow: {
        glow: '0 0 10px rgba(155, 93, 229, 0.8)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(0, 187, 249, 0.4)' },
          '50%': { boxShadow: '0 0 25px rgba(255, 105, 180, 0.8)' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 1s ease forwards',
        float: 'float 3s ease-in-out infinite',
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
