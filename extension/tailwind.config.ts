import type { Config } from "tailwindcss";
import { tailwindThemeColors } from "./src/shared/brand";

export default {
  content: ["./src/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: tailwindThemeColors,
    },
  },
  plugins: [],
} satisfies Config;
