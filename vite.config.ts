import { defineConfig } from "vite";

// `base: "./"` keeps the built asset paths relative, so the contents of `dist/`
// can be opened from any directory or hosted in a sub-path without rewriting URLs.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
  },
});
