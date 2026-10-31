import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Midnight-blue / charcoal scale for the AI-lab look.
        // Teal-black scale shared with the Design A hero.
        base: {
          950: "#03080b",
          900: "#061015",
          850: "#08151b",
          800: "#0b1c23",
          700: "#12262e",
          600: "#1c3640",
          500: "#2c4b57",
        },
        // Design A: teal-black cinematic palette.
        ink: { 950: "#020608", 900: "#041014", 800: "#071a1f", 700: "#0c252b" },
        teal: { DEFAULT: "#19d3c5", soft: "#5eead4", glow: "#a0fff0" },
        accent: {
          DEFAULT: "#6366f1",
          cyan: "#19d3c5",
          violet: "#8b5cf6",
          emerald: "#34d399",
          amber: "#fbbf24",
        },
      },
      fontFamily: {
        hero: ["var(--font-hero)", "var(--font-display)", "ui-sans-serif", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(to right, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.06) 1px, transparent 1px)",
        "radial-fade":
          "radial-gradient(circle at 50% 0%, rgba(99,102,241,0.18), transparent 60%)",
      },
      backgroundSize: {
        grid: "42px 42px",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
        "spin-slow": "spin 12s linear infinite",
        blink: "blink 1s step-end infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
