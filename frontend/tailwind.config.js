/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF8F3",
        tomato: { DEFAULT: "#E65B45", dark: "#C94632", soft: "#FCE9E5" },
        forest: { DEFAULT: "#34785B", dark: "#285C46", soft: "#E3F0E9" },
        mustard: { DEFAULT: "#E9B44C", soft: "#FBF1D9" },
        ink: { DEFAULT: "#2B2622", soft: "#6F665E" },
        crumb: "#EDE6D8",
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(43,38,34,.04), 0 8px 24px -12px rgba(43,38,34,.12)",
        pop: "0 20px 50px -20px rgba(43,38,34,.35)",
      },
      borderRadius: { "4xl": "2rem" },
    },
  },
  plugins: [],
};
