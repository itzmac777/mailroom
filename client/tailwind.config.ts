import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#151513",
        paper: "#fbfaf4",
        panel: "#fffefa",
        line: "#d8d2c6",
        muted: "#68665f",
        leaf: "#1f5f4b",
        clay: "#b85f2d",
        steel: "#365f91"
      },
      boxShadow: {
        hard: "8px 8px 0 #d6cfbf",
        hardSm: "5px 5px 0 #d6cfbf"
      }
    }
  },
  plugins: []
};

export default config;
