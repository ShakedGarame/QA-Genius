import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // Gates every `hover:` utility behind `@media (hover: hover)` so taps on
  // touch devices don't leave sticky hover states behind.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
        surface: {
          900: "#0d1117",
          800: "#161b22",
          700: "#21262d",
          600: "#30363d",
          500: "#3d444d",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"],
      },
      // Motion tokens — strong custom curves; the built-in CSS easings are too
      // weak to feel intentional. Everything UI-facing stays under 300ms.
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
        160: "160ms",
      },
      animation: {
        "fade-in": "fadeIn 180ms cubic-bezier(0.23, 1, 0.32, 1)",
        "slide-up": "slideUp 220ms cubic-bezier(0.23, 1, 0.32, 1) both",
        "pop-in": "popIn 180ms cubic-bezier(0.23, 1, 0.32, 1)",
        "drawer-in": "drawerIn 320ms cubic-bezier(0.32, 0.72, 0, 1)",
        "bar-grow": "barGrow 480ms cubic-bezier(0.23, 1, 0.32, 1) both",
        shimmer: "shimmer 1.4s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        popIn: {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        drawerIn: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        barGrow: {
          "0%": { transform: "scaleY(0.001)" },
          "100%": { transform: "scaleY(1)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
