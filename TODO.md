# TODO

Detail for each item lives in docs/ARCHITECTURE_PLAN.md and docs/DESIGN_PLAN.md.
Design plan §2 was rewritten for the dark-first premium direction; items below
marked SUPERSEDED were written against the earlier warm-paper direction.

## Data — blocked, needs a decision

- [x] Telugu: solved. te.wikisource.org carries a full per-verse Telugu translation (CC BY-SA 4.0) for all 701, and its chapter 13 has the same 35 verses this corpus does. See scripts/data-sources/README.md.
- [x] Kannada: no legally-usable source exists — kn.wikisource has only Sanskrit in Kannada script plus one unproofread OCR scan; the one 701-verse GitHub dataset is unlicensed and itself machine-generated; HuggingFace carries script transliterations, not translations; the PD-in-India 1936 archive.org text is old-Kannada ṣaṭpadi metre with no verse alignment. Shipped machine-assisted with a visible label instead — all 701 verses, rendered from the Sanskrit with the English and Telugu alongside, deliberately without reference to any copyrighted Kannada edition.
- [ ] Commentary QUALITY, not coverage: `commentary_english` is 701/701 [M 2026-09-05], attributed Sivananda 631 / Ramanuja 48 / Shankaracharya 22. What remains: 52 verses share a commentary string across 8 groups (chapter 1 pastes one 1,885-char essay onto 14 consecutive verses), 8.5 and 18.77 hold placeholder strings, and 4 verses say "Swami Sivananda did not comment on this sloka". These need a `span` schema field and an empty state, not a new source.
- [x] Credit each translation under the verse — "AI translated" for the Kannada, the Wikisource licence for the Telugu — and suppress the credit where the section fell back to English, so no English prose is ever labelled as a Kannada or Telugu rendering.
- [x] Confirmed the chapter 13 recension: 35 verses, hence 701 total. te.wikisource independently carries the same 35, which is a second witness for it.
- [ ] Evaluate importing per-verse Sanskrit recitation MP3s from github.com/gita/gita (data/verse_recitation/, all 701 verses) for an audio playback feature.

## Architecture — P1, pending

- [ ] Switch PWA registerType from "autoUpdate" to "prompt", add an UpdatePrompt with useRegisterSW, hourly r.update(), and an "offline ready" confirmation.
- [ ] Implement ensureOffline() idle warm-up over manifest.json plus an "Available offline" indicator; honour saveData and 2g.
- [ ] Add the two remaining prefetchChapter triggers: Link pointerenter/focus (guarded behind `pointer: fine`) and a home-screen idle warm-up. The chapter ± 1 idle warm is already wired at src/App.tsx:77-78 [M 2026-09-05].
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
- [ ] Add .github/workflows/ci.yml (typecheck, lint, format-check, build) plus Lighthouse CI with a budget.json. Lighthouse 13 has NO pwa category (removed after LH 11) — gate on lighthouse@11 for PWA and lighthouse@13 for mobile Performance, or the gate asserts a category that does not exist.
- [ ] Add tests for build-data.mjs output shape, router path round-trip, and the language fallback selection.
- [ ] Run npx update-browserslist-db@latest.
- [ ] TRIGGER MET but SUPERSEDED: translation_kannada is 701/701 [M 2026-09-05]. Measurement says the per-language axis is wrong — kn+te translations are 21% of corpus bytes, commentary alone is 29%. Split by section (commentary-NN.json), which is additive and needs no v2 bump.

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
- [ ] 1.13 has no Telugu translation (te.wikisource carried only bhāṣya for it) — source a rendering
- [ ] 13.1 translation_english is an editorial note, not a translation (Gambhirananda omits the verse)
- [ ] transliteration field is a ṛi/ṣh/ch hybrid, not IAST — decide: rename the field or convert all 701
- [ ] 220 `?` in commentary_english sit before a capital — comma or real question is undecidable, left alone
- [ ] combined-verse groups (1.32-34, 1.38-39, 2.42-43, 5.8-9, 5.27-28, 10.12-13) repeat one English blob, unmarked

## Commentary translation — Kannada first, in this order

Drafts for both languages are in `scripts/data-sources/commentary-{kannada,telugu}-mt.json`
[M 2026-09-05], IndicTrans2. After the mechanical passes below, Kannada scans
700/700 clean and both languages together 694/700, the residue being the
cross-script list. Nothing is merged. Telugu is held until Kannada has been
through this list once.

- [x] Restore the Devanagari scripture quotations the model dropped in 13.21, 13.31, 15.6, 15.7, 15.9, 15.14, 17.8, 17.15 — copy the runs verbatim from `commentary_english`. No check catches this: the Devanagari test passes because the Devanagari is gone.
- [x] Fix ದ್ವೇಶ to ದ್ವೇಷ across all 11 occurrences in 8 verses; the gloss beside each one is already correct. Mechanical.
- [x] Re-translate the ~25 Kannada fragments where a word came through in English glued to a citation marker (`heaven.-Tr`, `self.-Tr`, `support.-V.S.A`); strip the marker first, then splice the result back.
- [ ] Check the 6 cross-script divergences by hand — ವಾರ್ಷ್ಣೇಯ/వర్ష్ణేయ, ಧ್ರುವನಾ/ద్రువనా at 9.32 and 10.23, ಆಸ್ತಿಭತಿಪ್ರಿಯ/ఆస్థిభతిప్రియ, ಸ್ವಾಸನ್/స్వసన్, ಭ್ರಮಧ್ಯ/భ్రుమధ్య. All six are proper nouns or compounds where Kannada carries the aspiration and vowel length and Telugu drops them, so they block Telugu, not Kannada.
- [ ] Hold back the 70 bhāṣya verses (Śaṅkara 22, Rāmānuja 48) and regenerate them with a frontier model via path 2 of the translator skill. IndicTrans2 flattens the register; this is not a settings problem.
- [ ] Have a Kannada reader review a stratified sample of 20 Sivananda verses — short and long, early and late chapters. The automated scan proves script and structure, not that the prose reads.
- [ ] Merge Kannada only: `merge-language.mjs --field commentary_kannada --script kannada --machine-flag --dry` first, then for real.
- [ ] Run `fix-corpus` / `check-corpus` / `build-data` / `check-size` as a unit, and confirm the reader shows the "AI translated" credit on the commentary block.
- [ ] Then repeat the whole list for Telugu, which has its own scan output and its own 53-verse untranslated-word list.

## Language — still open

- [ ] Localise the rest of the UI chrome. The chapter cards, the reader's chapter title, search and saved rows now follow the reader's language, but "Verse N", "Previous chapter", the verse rail, the tab labels and the Settings screen are still English in every language.
- [ ] context_kannada is 4/701 and context_telugu 22/701 [M 2026-09-05], so a Kannada or Telugu reader gets English commentary on nearly every verse. It is labelled as such; sourcing it is a separate problem from the translations.
- [ ] Hindi as a fourth language. No cleanly-licensed verse-aligned Hindi prose exists [M 2026-09-05]: the open JSON datasets (gita/gita Unlicense, vedicscriptures GPL, DharmicData ODbL) all carry Ramsukhdas / Chinmayananda / Tejomayananda from IIT-K gitasupersite, in copyright in India; hi.wikisource has only an unproofread (pagequality=1) Gita Press scan. The one public-domain human translation is Gandhi's अनासक्तियोग (1930, archive.org in.ernet.dli.2015.343352) — verse numerals survive but the DLI OCR is ~75-85%, so it needs a fresh vision-OCR pass and proofreading. Otherwise machine-assisted like Kannada. Decide the source before touching Language in gita.types.ts and LANGUAGES/LANGUAGE_LABELS in settings.tsx.
