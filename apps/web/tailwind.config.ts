import type { Config } from "tailwindcss";

// 16 Sept 2026, Steven: shared the Flippy Coins shop design (black
// background, gold as the dominant accent, Flippy mascot) and asked for
// "the rest of the website to match this layout and theme." Sitewide
// re-theme done here at the token level — brand/brand2 (previously a
// blue/cyan pair used for every primary-action gradient across the app)
// now resolve to the gold family already used for gold/gold2, so every
// component already built against these semantic tokens (bg-brand,
// text-brand2, border-brand2, etc. — ~80 usages across the app) picks up
// the new look automatically without a per-component rewrite. bg/surface
// were already very dark and close to black, so left as-is rather than
// risking a wider contrast regression for a subtle hue shift nobody asked
// for. A handful of places had this same gradient hardcoded as a raw hex
// string instead of going through Tailwind (bypassing this token change) —
// those were fixed to match in the same round, see the deployment note.
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
        brand: "#f2b545",
        brand2: "#ffd77a",
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
