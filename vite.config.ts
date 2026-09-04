import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// SPA deep links on a first visit (before the service worker controls the page) need a
// host rewrite. public/_redirects covers Netlify and Cloudflare Pages; GitHub Pages has
// no rewrite at all and falls back to a byte copy of index.html at 404.html.
const spaFallback = (): Plugin => ({
  name: "spa-404-fallback",
  apply: "build",
  closeBundle() {
    const index = resolve(__dirname, "dist/index.html");
    if (existsSync(index)) copyFileSync(index, resolve(__dirname, "dist/404.html"));
  },
});

export default defineConfig({
  server: { host: true },
  build: {
    rollupOptions: {
      output: {
        // React changes on a framework upgrade; app code changes on every deploy.
        // Splitting them means a normal release only invalidates the app chunk
        // (ARCHITECTURE_PLAN §P2.2). Both chunks are still initial, so this buys
        // cache lifetime, not first-load bytes.
        // A predicate, not the id list: the app imports react-dom/client, whose
        // production module is not reachable from react-dom's own entry, so the
        // array form leaves the bulk of react-dom in the app chunk.
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
        },
      },
    },
  },
  plugins: [
    react(),
    spaFallback(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "Bhagavad-Geeta",
        short_name: "Bhagavad-Geeta",
        description: "A premium Bhagavad-Geeta progressive web app",
        // The dark ground, not white: the manifest colours are the splash screen and
        // the task-switcher card, i.e. the first paint an installed user sees.
        theme_color: "#0a0a0b",
        background_color: "#0a0a0b",
        display: "standalone",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}", "data/v1/manifest.json", "data/v1/chapters.json", "data/v1/chapter-01.json"],
        // Precaching every face pulls all 458 KB of fonts on first visit, which undoes
        // the per-script @font-face loading. Only the two faces the first paint actually
        // needs stay precached: inter-latin for the shell, noto-sans-devanagari because
        // every verse.text is Sanskrit. Kannada, Telugu and the latin-ext face that
        // carries the IAST diacritics are runtime-cached on first use.
        globIgnores: ["**/fonts/noto-sans-kannada.woff2", "**/fonts/noto-sans-telugu.woff2", "**/fonts/inter-latin-ext.woff2"],
        navigateFallback: "index.html",
        // Never serve index.html for a missing JSON: the loader would die in JSON.parse.
        navigateFallbackDenylist: [/^\/data\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3_000_000,
        runtimeCaching: [
          {
            // Corpus data is immutable within a version directory.
            urlPattern: /\/data\/v1\/.*\.json$/,
            handler: "CacheFirst",
            options: { cacheName: "gita-data-v1", cacheableResponse: { statuses: [200] } },
          },
          {
            // Fonts excluded from the precache above: cache on first use so a
            // script stays available offline once its reader has opened it.
            urlPattern: /\/fonts\/.*\.woff2$/,
            handler: "CacheFirst",
            options: { cacheName: "gita-fonts-v1", cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
});
