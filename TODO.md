# TODO

Detail for each item lives in docs/ARCHITECTURE_PLAN.md and docs/DESIGN_PLAN.md.

## Data — blocked, needs a decision

- [ ] BLOCKED: source Kannada + Telugu translations for 697 of 701 verses — no open dataset carries them (checked vedicscriptures/bhagavad-gita, gita/gita, ravisiyer/gita-data, saurabh2k1, praneshp1org: all english/hindi/sanskrit only; sanskritdocuments link hub has none; gitasupersite.in claims 11 Indian languages but exposes no data API and is IIT-Kanpur copyrighted). Options: commission a translation, license one, machine-translate with a visible label, or ship English fallback.
- [ ] BLOCKED: source a clean per-verse English commentary — the Sivananda commentary in every JSON mirror is corrupted identically (13,006 commas replaced by `?`, letter `q` deleted corpus-wide: "conquered"→"conered"). dlshq.org/download2/bgita.pdf is clean and official but comments on only ~103 of 701 verses. Prabhupada's is clean in vedicscriptures but BBT-copyrighted.
- [ ] Show an explicit "translation not yet available in this language" state instead of silently rendering English prose under a Kannada/Telugu heading (VerseViewer.tsx falls through to translation_english for 697 verses).
- [ ] Decide the chapter 13 recension: verses.json has 35 verses (hence 701 total, not 700) because some traditions open the chapter with an extra verse. chapters.json said 34 and has been corrected to 35 to match the data; confirm this is the recension you want to ship.
- [ ] Evaluate importing per-verse Sanskrit recitation MP3s from github.com/gita/gita (data/verse_recitation/, all 701 verses) for an audio playback feature.

## Architecture — P0

- [ ] Add scripts/build-data.mjs emitting public/data/v1/{manifest,chapters,chapter-NN}.json; wire to prebuild/predev.
- [ ] Add src/lib/gita.ts (getChapters/peekChapter/loadChapter/prefetchChapter/chapterResource) with in-memory memo and in-flight dedup.
- [ ] Switch App.tsx to the loader and delete the src/data/verses.json import plus both versesData.filter calls — initial JS drops from 377 KB gz to ~50 KB gz.
- [ ] Add a no-restricted-imports rule on src/data/verses.json and a size-limit gate so the bundle cannot regress.
- [ ] Add a CacheFirst runtime rule for /data/v1/*.json plus navigateFallback and navigateFallbackDenylist to vite.config.ts.
- [ ] Inline a pre-paint theme script in index.html and remove the theme half of the useEffect in App.tsx to kill the dark-mode flash.
- [ ] Replace the Google Fonts @import at src/index.css:1 with self-hosted woff2 files and <link rel="preload">; delete the two Google Fonts runtime caching rules.

## Design — P0

- [ ] Add viewport-fit=cover, apple-mobile-web-app-* meta, and paired light/dark theme-color tags to index.html.
- [ ] Replace the whole :root and [data-theme="dark"] block in src/index.css with the warm ink/paper + saffron token set (colour ramps, iOS type scale, 4px spacing, radii, elevation, spring linear() curves).
- [ ] Add global base rules including -webkit-tap-highlight-color: transparent and touch-action: manipulation.
- [ ] Load Literata + Noto Serif Devanagari/Kannada/Telugu; no font currently in the app has any Indic glyphs, so all scripture falls to OS defaults with Latin line-heights.
- [ ] Add lang="sa"/"kn"/"te" to the scripture, translation and commentary elements in VerseViewer.tsx and add matching :lang() font rules with --lh-indic: 1.95.
- [ ] Delete .verse-text { color: var(--accent-color) } (index.css:411) — scripture renders in coral at ~3.0:1 contrast; set it to --ink-1 at regular weight.
- [ ] Delete --bg-gradient, --accent-gradient, .text-gradient, .glass-panel::before and its :hover rule, and background-attachment: fixed on body.
- [ ] Build the .app-nav / .app-main / .app-tabbar shell using max(gutter, safe-area) insets and 100dvh.
- [ ] Build the four-tab bottom tab bar (Read / Search / Saved / Settings).
- [ ] Raise every interactive element to min-height 44px — .theme-toggle, .glass-button's successor, tab items, list rows.
- [ ] Add a prefers-reduced-motion block and gate all :hover rules behind @media (hover: hover) and (pointer: fine).

## Routing — P0/P1, shared by both plans

- [ ] Add src/lib/router.tsx (useRoute/navigate/Link on useSyncExternalStore, ~90 lines) for /, /chapter/:n, /chapter/:n/verse/:m, /search, /saved, /settings; App.tsx currently uses useState only, so iOS edge-swipe-back and Android back exit the PWA.
- [ ] Add the host SPA rewrite (_redirects / vercel.json / dist/404.html copy) in the same change as the router.
- [ ] Set history.scrollRestoration = "manual" with a per-history-key scroll map restored in useLayoutEffect; delete both window.scrollTo calls in App.tsx:68,75.

## Architecture — P1

- [ ] Switch PWA registerType to "prompt", add an UpdatePrompt with useRegisterSW, hourly r.update(), and an "offline ready" confirmation.
- [ ] Implement ensureOffline() idle warm-up over manifest.json plus an "Available offline" indicator; honour saveData and 2g.
- [ ] Add prefetchChapter triggers on Link pointerenter/focus, the last and first 3 verses of a chapter, and home-screen idle.
- [ ] Wrap cross-chapter navigate in startTransition; render chapter metadata optimistically from chapters.json while the verse body resolves.
- [ ] Memoisation pass: verse-number→index Map, useCallback handlers, React.memo on Header/ChapterList/VerseViewer, extract selectVerseText.
- [ ] Persist reading position to localStorage and add a "Continue reading" entry point on the home screen.

## Design — P1

- [ ] Rebuild ChapterList.tsx as an iOS inset grouped list (numeral, name, meaning, count, chevron, inset hairline); drop .chapter-grid and .glass-card.
- [ ] Remove the delay-${(index % 3) * 100} stagger in ChapterList.tsx; use a single container fade on first mount only.
- [ ] Add a Chapter detail screen with summary, a primary Start/Continue action, and a verse-index chip grid.
- [ ] Rebuild VerseViewer.tsx to the reader content stack: verse marker, scripture, collapsible transliteration, ornament divider, left-aligned translation, recessed commentary well.
- [ ] Replace .verse-section-card's rgba(0,0,0,0.03) with --surface-2 and delete its border-left.
- [ ] Move the Prev/Next disabled styling out of the inline style prop in VerseViewer.tsx into a CSS :disabled rule.
- [ ] Implement horizontal swipe paging between verses with peeking neighbours and a snappy spring commit/spring-back.
- [ ] Implement scroll-away nav bar and tab bar in the reader (hide on scroll down, show on scroll up, always show at top).
- [ ] Build a bottom-sheet primitive on <dialog> with grabber, scrim, drag-to-dismiss and gentle-spring presentation.
- [ ] Build a Settings screen and move language and theme out of Header.tsx; delete the native <select>.
- [ ] Implement a reading-size control writing --reading-scale to documentElement, persisted to gita-reading-scale.
- [ ] Add Light/Dark/System with a live prefers-color-scheme listener, updating <meta name="theme-color"> on switch.
- [ ] Update the vite.config.ts manifest theme_color/background_color to #FBF9F5 and add orientation and display_override.

## P2

- [ ] Inline all CSS into index.html and add a static app-shell skeleton; drop the CSS request.
- [ ] Add manualChunks for react-vendor and verify lucide-react tree-shaking with rollup-plugin-visualizer.
- [ ] Add document.startViewTransition around navigation, feature-detected and gated on prefers-reduced-motion, scoped to the verse panel.
- [ ] Build the Search screen: lazy-loaded, loadSearchIndex() (~73 KB gz), useDeferredValue, plain includes over a normalised field, 2:47 jump syntax, grouped results, 16px-minimum input font.
- [ ] Build the Saved screen with continue-reading card, bookmark list and swipe-to-delete.
- [ ] Add double-tap-to-bookmark on the scripture with a bloom animation and navigator.vibrate?.(10).
- [ ] Add a verse action sheet (Share via navigator.share, Copy verse, Copy translation, Reading size).
- [ ] Add per-screen skeleton loaders shaped like their real content, disabled under reduced motion.
- [ ] Add the @supports not (backdrop-filter: blur(1px)) opaque-chrome fallback.
- [ ] Add a >=900px sidebar layout replacing the bottom tab bar.
- [ ] Add prefers-contrast: more overrides and verify every text/background pair at 4.5:1 (3:1 for >=24px scripture).
- [ ] Add a long-press context sheet on chapter rows (Start from verse 1, Bookmark chapter).
- [ ] Add .github/workflows/ci.yml (typecheck, lint, format-check, build) plus Lighthouse CI with a budget.json.
- [ ] Add tests for build-data.mjs output shape, router path round-trip, and selectVerseText fallback.
- [ ] Run npx update-browserslist-db@latest.
- [ ] TRIGGER not a task: when translation_kannada coverage exceeds ~50% of 701, execute the per-language data split and bump data/v1 to data/v2.
