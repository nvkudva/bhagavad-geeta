import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { transform } from "esbuild";
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

// A stylesheet reached only through a <link> in index.html (src/desktop.css) is
// emitted as a copied asset, not as a bundled CSS chunk, so Vite's own cssMinify
// never touches it. Without this it ships at ~2x the size of index.css for the
// same amount of CSS, which would make the >=900px split look like a regression.
const minifyLinkedCss = (): Plugin => ({
  name: "minify-linked-css",
  apply: "build",
  async generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
      const source = typeof file.source === "string" ? file.source : Buffer.from(file.source).toString("utf8");
      if (!source.includes("\n")) continue; // already minified by the CSS pipeline
      file.source = (await transform(source, { loader: "css", minify: true })).code;
    }
  },
});

export default defineConfig({
  server: { host: true, allowedHosts: ["vijaymac.merino-brill.ts.net"] },
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
    minifyLinkedCss(),
    VitePWA({
      registerType: "autoUpdate",
      // Without this the manifest and service worker only exist in a build, so
      // "Add to Home Screen" on a phone pointed at the dev server installs nothing.
      devOptions: { enabled: true, type: "module" },
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "logo.svg", "mask-icon.png"],
      manifest: {
        id: "/",
        name: "Geeta",
        short_name: "Geeta",
        start_url: "/",
        scope: "/",
        description: "Geeta — a premium Bhagavad Gita progressive web app",
        // The dark ground, not white: the manifest colours are the splash screen and
        // the task-switcher card, i.e. the first paint an installed user sees.
        theme_color: "#0a0a0b",
        background_color: "#0a0a0b",
        display: "standalone",
        // No `orientation`: the app has a real two-pane layout at >=900px, so locking
        // it to portrait would be wrong on every tablet and desktop install.
        display_override: ["standalone", "minimal-ui"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // A separate maskable art file: Android crops "any" art to its own shape, which
          // would eat the squircle rim. This one is full-bleed with the lotus inside the
          // centre 80% safe zone.
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // data/v1/chapters.json is NOT here: src/lib/gita.ts statically imports
        // src/data/chapters.json, so the same 20 KB is already inside the JS shell and
        // nothing ever fetches the emitted copy. It is still emitted, just not
        // downloaded twice on every install.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}", "data/v1/manifest.json", "data/v1/chapter-01.json"],
        // Precaching every face pulls all of fonts/ on first visit, which undoes the
        // per-script @font-face loading. Only the two the first paint actually needs
        // stay precached: literata-latin (the default reading face — the UI takes the
        // platform's own face and downloads nothing) and noto-sans-devanagari, because
        // every verse.text is Sanskrit. Kannada, Telugu, the latin-ext files that carry
        // the IAST diacritics, and the three alternative reading faces are all
        // runtime-cached the first time a reader actually asks for them.
        globIgnores: ["**/fonts/noto-sans-kannada.woff2", "**/fonts/noto-sans-telugu.woff2", "**/fonts/*-latin-ext.woff2", "**/fonts/source-serif-4-*.woff2", "**/fonts/newsreader-*.woff2", "**/fonts/faustina-*.woff2"],
        navigateFallback: "index.html",
        // Never serve index.html for a missing JSON: the loader would die in JSON.parse.
        navigateFallbackDenylist: [/^\/data\//],
        cleanupOutdatedCaches: true,
        // Tight enough that search-index.json (726 KB) fails the build loudly if it
        // ever matches a globPattern, rather than silently landing in the precache.
        maximumFileSizeToCacheInBytes: 500_000,
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
