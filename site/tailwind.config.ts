import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cornflower: {
          50: "#f0effe",
          100: "#dfdcfe",
          200: "#c4bffe",
          300: "#a89ffe",
          400: "#8577fb",
          500: "#614efa",
          600: "#5038e8",
          700: "#4229c9",
          800: "#3621a5",
          900: "#2c1b85",
          950: "#1a1060",
        },
        fog: {
          50: "#faf9ff",
          100: "#dfdcfe",
          200: "#d0ccfd",
          300: "#c1bcfc",
          400: "#b2adfb",
          500: "#a39efa",
          600: "#8f89f8",
          700: "#7b74f6",
          800: "#6760f4",
          900: "#534cf2",
          950: "#3f38ef",
        },
        haiti: {
          50: "#e8e7f0",
          100: "#c5c3d9",
          200: "#9e9bc0",
          300: "#7773a7",
          400: "#5a558f",
          500: "#3d3777",
          600: "#352f6a",
          700: "#2b265a",
          800: "#211d4a",
          900: "#1a1639",
          950: "#131032",
        },
      },
      fontFamily: {
        heading: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        sans: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      animation: {
        "wave-bar": "wave-bar 1.2s ease-in-out infinite",
        "fade-up": "fade-up 0.7s ease-out forwards",
      },
      keyframes: {
        "wave-bar": {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(1.25rem)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
