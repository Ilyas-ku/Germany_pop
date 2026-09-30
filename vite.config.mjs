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
        commute: page("./commute.html"),
        flats: page("./flats.html"),
        warm: page("./warm.html"),
        netwage: page("./netwage.html"),
        warmrent: page("./warmrent.html"),
        agglo: page("./agglo.html"),
      },
    },
  },
});
