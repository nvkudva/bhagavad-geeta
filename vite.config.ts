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
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}", "data/v1/manifest.json", "data/v1/chapters.json", "data/v1/chapter-01.json"],
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
        ],
      },
    }),
  ],
});
