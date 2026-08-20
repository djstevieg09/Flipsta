import type { Config } from "tailwindcss";

// Colour system carried over 1:1 from the approved HTML mockups so the real
// app looks identical to what's already been signed off.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0e17",
        surface: "#121729",
        surface2: "#1a2138",
        surface3: "#212a45",
        border: "#262f4a",
        text: "#eef1f8",
        textDim: "#8891ab",
        textFaint: "#5b6a8f",
        brand: "#5b7cfa",
        brand2: "#22d3ee",
        gold: "#f2b545",
        gold2: "#f59e0b",
        green: "#2fd77a",
        red: "#f2495c",
      },
      borderRadius: {
        DEFAULT: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
