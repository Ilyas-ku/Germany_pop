import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const page = (f) => fileURLToPath(new URL(f, import.meta.url));

export default defineConfig({
  base: "/Germany_pop/",
  build: {
    rollupOptions: {
      input: {
        main: page("./index.html"),
        ratio: page("./ratio.html"),
      },
    },
  },
});
