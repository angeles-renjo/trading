import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Trading-desk palette
        up: "#16c784",
        down: "#ea3943",
        panel: "#11161c",
        "panel-soft": "#161d26",
        line: "#222c38",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
