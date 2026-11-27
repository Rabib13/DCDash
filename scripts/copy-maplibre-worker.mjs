// MapLibre runs its tile parsing in a Web Worker. Bundlers don't pick that file up on their own,
// so we serve it as a static file and point MapLibre at it with setWorkerUrl().
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
copyFileSync(
  new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url),
  new URL("../public/maplibre-gl-worker.mjs", import.meta.url),
);
