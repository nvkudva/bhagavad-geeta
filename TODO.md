# TODO

Detail for each item lives in docs/ARCHITECTURE_PLAN.md and docs/DESIGN_PLAN.md.
Design plan §2 was rewritten for the dark-first premium direction; items below
marked SUPERSEDED were written against the earlier warm-paper direction.

## Data — blocked, needs a decision

- [x] Telugu: solved. te.wikisource.org carries a full per-verse Telugu translation (CC BY-SA 4.0) for all 701, and its chapter 13 has the same 35 verses this corpus does. See scripts/data-sources/README.md.
- [x] Kannada: no legally-usable source exists — kn.wikisource has only Sanskrit in Kannada script plus one unproofread OCR scan; the one 701-verse GitHub dataset is unlicensed and itself machine-generated; HuggingFace carries script transliterations, not translations; the PD-in-India 1936 archive.org text is old-Kannada ṣaṭpadi metre with no verse alignment. Shipped machine-assisted with a visible label instead.
- [ ] BLOCKED: source a clean per-verse English commentary. Sivananda is corrupted identically in every JSON mirror (13,006 commas replaced by `?`, letter `q` deleted corpus-wide). Sastry/Shankara OCR parses at only 52% — verse 2.47 does not survive either scan. Next viable step is re-OCR of the archive.org page images with Tesseract 5; alternatives are asking wisdomlib for their clean transcription, or switching to Swarupananda (parses at 84%).
- [x] Show an explicit "translation not yet available in this language" state instead of silently rendering English prose under a Kannada/Telugu heading.
- [x] Confirmed the chapter 13 recension: 35 verses, hence 701 total. te.wikisource independently carries the same 35, which is a second witness for it.
- [ ] Evaluate importing per-verse Sanskrit recitation MP3s from github.com/gita/gita (data/verse_recitation/, all 701 verses) for an audio playback feature.

## Architecture — P1, pending

- [ ] Switch PWA registerType from "autoUpdate" to "prompt", add an UpdatePrompt with useRegisterSW, hourly r.update(), and an "offline ready" confirmation.
- [ ] Implement ensureOffline() idle warm-up over manifest.json plus an "Available offline" indicator; honour saveData and 2g.
- [ ] Wire up prefetchChapter — it exists in src/lib/gita.ts but nothing calls it. Trigger on Link pointerenter/focus, the last and first 3 verses of a chapter, and home-screen idle.
- [ ] Wrap cross-chapter navigation in startTransition; render chapter metadata optimistically from chapters.json while the verse body resolves.
- [ ] Finish the memoisation pass: VerseBlock is memoised and handlers use useCallback, but Header and ChapterList are not, and there is no verse-number to index Map.
- [ ] Persist reading position to localStorage and add a "Continue reading" entry point on the home screen.

## Design — P1, pending

- [ ] Build the Settings screen — currently a placeholder. Move language and theme out of Header.tsx and delete the native <select>.
- [x] Add a reading-size control writing --reading-scale to documentElement, persisted to gita-reading-scale.
- [ ] Add a System theme option with a live prefers-color-scheme listener. Today the theme is a light/dark toggle only, defaulting to dark, with no way to follow the OS.
- [ ] Implement scroll-away nav bar and pager in the reader (hide on scroll down, show on scroll up, always show at top).
- [ ] Build a bottom-sheet primitive on <dialog> with grabber, scrim, drag-to-dismiss and spring presentation.
- [ ] Add orientation and display_override to the vite.config.ts PWA manifest.

## P2, pending

- [ ] Build the Search screen: lazy-loaded, loadSearchIndex() (~73 KB gz), useDeferredValue, plain includes over a normalised field, 2:47 jump syntax, grouped results, 16px-minimum input font. Currently a placeholder.
- [ ] Build the Saved screen with continue-reading card, bookmark list and swipe-to-delete. Currently a placeholder.
- [ ] Add double-tap-to-bookmark on the scripture with a bloom animation and navigator.vibrate?.(10).
- [ ] Add a verse action sheet (Share via navigator.share, Copy verse, Copy translation, Reading size).
- [ ] Add per-screen skeleton loaders shaped like their real content, disabled under reduced motion.
- [x] Add a >=900px sidebar layout replacing the bottom tab bar.
- [ ] Add a long-press context sheet on chapter rows (Start from verse 1, Bookmark chapter).
- [ ] Add document.startViewTransition around navigation, feature-detected and gated on prefers-reduced-motion.
- [ ] Inline all CSS into index.html and add a static app-shell skeleton; drop the CSS request.
- [ ] Add .github/workflows/ci.yml (typecheck, lint, format-check, build) plus Lighthouse CI with a budget.json.
- [ ] Add tests for build-data.mjs output shape, router path round-trip, and the language fallback selection.
- [ ] Run npx update-browserslist-db@latest.
- [ ] TRIGGER not a task: when translation_kannada coverage exceeds ~50% of 701, execute the per-language data split and bump data/v1 to data/v2.

## Superseded by a direction change

- [x] SUPERSEDED: rebuild ChapterList as an iOS inset grouped list — the dark-first premium direction uses cards instead.
- [x] SUPERSEDED: set manifest theme_color to #FBF9F5 — shipped as #0A0A0B, the dark ground.
- [x] SUPERSEDED: horizontal swipe paging with peeking neighbours — the reader is now a continuous chapter scroll driven by the pager.
- [x] SUPERSEDED: separate Chapter detail screen with a verse-index chip grid — opening a chapter now goes straight into the continuous scroll.

## Done

- [x] Architecture P0 (all 7): build-data.mjs, gita.ts loader, App on the loader, no-restricted-imports + gzip size gate, CacheFirst for /data/v1, pre-paint theme script, self-hosted fonts. Initial JS 376.9 KB gz to 66.9 KB.
- [x] Routing (all 3): src/lib/router.tsx, SPA rewrite via _redirects and a dist/404.html copy, manual scroll restoration.
- [x] Design P0 (all): viewport-fit and apple meta, token set, base rules, self-hosted Inter + Noto Sans Indic with per-script unicode-range, lang tagging, app shell, four-tab bottom bar, 44px targets, reduced-motion and hover gating.
- [x] Dark-first premium re-skin: palette, typography, dark as the first-run default, manifest colours. Contrast audit 0 failures, tightest pair 4.69:1.
- [x] Continuous chapter scroll: all verses in one card, pager scrolls between them, IntersectionObserver scroll-spy on replaceState only, content-visibility with re-anchor.
- [x] Contextual back button in the header; pinned prev/next pager above the tab bar with a position indicator.
- [x] Reduced type scale and line-heights; reduced padding via spacing tokens.
- [x] manualChunks react-vendor split; lucide-react tree-shaking verified.
- [x] @supports backdrop-filter opaque-chrome fallback; prefers-contrast: more overrides.
- [x] Fixed: fonts were being fully precached, defeating per-script loading.
- [x] Fixed: :lang() rules ordered so Kannada/Telugu translations fell back to a system font; :lang(sa) also matched sa-Latn.
- [x] Fixed: #root grid column sized to --measure, making the shell 568px wide in a 375px viewport.
- [x] Fixed: prev/next did not cross chapter boundaries.
- [x] Fixed: chapters.json chapter 13 count.

## Desktop — done in the desktop-ui pass

- [x] Re-base the desktop layer from 1024px to 900px and add a 1280px tier.
- [x] Replace the horizontal snap pager with a continuous verse column at >=900px; the pager stays below it.
- [x] Two-pane reader at >=1280px: sticky verse rail beside the reading column, commentary and word meanings side by side.
- [x] Keyboard layer (j/k, arrows, gg/G/gh, b, t, /, ?, Esc) and a Cmd-K command palette, both desktop-only.
- [x] Sidebar search launcher, active-row indicator, and a footer with the reading-size stepper and theme toggle.
- [x] Settings as a two-column form with a scroll-spy index at >=900px.
- [x] Two-column search results and a 2/3-column saved grid; hover-revealed remove and save controls.
- [x] Light-appearance fixes at width: tightened blooms, real card edges, firmer glass.
- [x] Selection colours, focus rings, scrollbars, tooltips and pointer hover states.

## Desktop — still open

- [ ] Verse context menu (Copy verse, Copy translation, Share) behind a hover-revealed ellipsis.
- [ ] Rail marker view-transition (`view-transition-name: rail-marker`) so the active row slides rather than cuts.
