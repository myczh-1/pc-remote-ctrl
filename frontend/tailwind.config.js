/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0B0F14",
          soft: "#0F141A",
          softer: "#0C1117",
        },
        card: {
          DEFAULT: "#0F141A",
          stroke: "#1E2630"
        },
        prime: {
          50: '#ECFEFF', 100: '#CFFAFE', 200: '#A5F3FC', 300: '#67E8F9',
          400: '#22D3EE', 500: '#06B6D4', 600: '#0891B2', 700: '#0E7490'
        },
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,0.35)',
        ring: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(2,8,23,0.6)'
      },
      backdropBlur: { 
        xs: '2px' 
      },
    }
  },
  plugins: [],
}
