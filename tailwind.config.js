/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light Mode Colors
        "bg-white": "#ffffff",
        "bg-subtle": "#ffffff", // Main and sidebar are essentially white with thin borders
        "sidebar-mint": "#ffffff", // The sidebar in the image does not have a tint 
        "border-thin": "#e5e7eb",
        "forest-green": "#86B371", // The muted sage green from the image
        
        // Dark Mode Colors
        "bg-dark": "#192019",
        "sidebar-dark": "#252f26",
        "card-dark": "#1f2b24",
        "card-hover": "#25332b",
        "border-dark": "#2a3830",
        "border-sage": "#3e5246",
        "active-green": "#2d4035",
        "chip-inactive": "#1c2621",

        // Semantic / Shared
        "text-main": "#111827",
        "text-main-dark": "#ecfdf5",
        "text-secondary": "#6b7280",
        "text-secondary-dark": "#9cc09f",
        "accent-herb": "#74c464",
        "herb-hover": "#5ea550",
        "herb-light": "#dcfce7",
      },
      fontFamily: {
        "sans": ["Inter", "sans-serif"],
        "display": ["Inter", "sans-serif"],
        "script": ["Dancing Script", "cursive"],
      },
      boxShadow: {
        'minimal': '0 4px 20px rgba(0,0,0,0.03)',
        'hover': '0 10px 40px rgba(0,0,0,0.06)',
        'card': '0 2px 10px rgba(0,0,0,0.02)',
        'card-dark': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.15)',
      },
      borderRadius: {
        'card': '0.5rem', // Light mode default
        'card-lg': '0.75rem', // Dark mode default
        'btn': '0.25rem',
        'pill': '9999px',
      },
      letterSpacing: {
        'tightest': '-0.02em',
      }
    },
  },
  plugins: [],
}
