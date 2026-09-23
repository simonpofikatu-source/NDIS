import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        eoc: {
          bg: "#0A0E14",
          panel: "#10151F",
          border: "#1E2633",
          text: "#E4E8EE",
          muted: "#8A94A6",
        },
        severity: {
          critical: "#D64545",
          high: "#E8843D",
          medium: "#E8C33D",
          low: "#4A9B6E",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
