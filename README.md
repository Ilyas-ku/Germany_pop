# Germany Pop Buffer

Interactive map: **https://ilyas-ku.github.io/Germany_pop/**

Click anywhere in Germany: the map finds the smallest radius around that point that
holds as many people as Berlin had in the chosen year (1871 – 2019), using
municipality (Gemeinde) population data.

## Stack

Vite, MapLibre GL, PMTiles, Turf, a Web Worker for the radius search.

## Run locally

```bash
npm ci
npm run dev      # dev server
npm run build    # production build into dist/
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/static.yml`).
