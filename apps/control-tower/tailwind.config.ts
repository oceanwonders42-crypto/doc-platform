import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#142033",
        steel: "#516179",
        paper: "#f4f7fb",
        shell: "#e6edf5",
        signal: "#1d4ed8",
        moss: "#2f6f4f",
        ember: "#b45309",
        rose: "#be123c",
      },
      boxShadow: {
        panel: "0 16px 40px -24px rgba(20, 32, 51, 0.32)",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "SF Pro Display", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
