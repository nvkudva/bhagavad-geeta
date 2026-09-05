# Bhagavad-Geeta PWA — Architecture, Data, Caching & Performance Plan

Scope: application architecture, data loading, routing, caching/offline, and runtime
performance. Visual design (colour, typography, spacing) is explicitly out of scope and
owned elsewhere; where this document touches the UI it only specifies **component and
state contracts** that the visual layer must be built against.

All numbers tagged **[M]** are measured on this repo at the time of writing. Numbers
tagged **[E]** are estimates and say how they were derived.

---

## 1. Current-state assessment

### 1.1 What the app is today

Four source files carry the whole application:

| File | Bytes **[M]** | Role |
|---|---|---|
| `src/App.tsx` | 3,748 | All state, all navigation, all data selection |
| `src/components/Header.tsx` | 1,458 | Theme toggle + language `<select>` |
| `src/components/ChapterList.tsx` | 1,245 | 18 chapter cards |
| `src/components/VerseViewer.tsx` | 3,719 | Single-verse reader + prev/next |
| `src/index.css` | 8,835 | All styling, plus a Google Fonts `@import` |
| `src/data/chapters.json` | 5,042 | 18 chapter metadata objects |
| `src/data/verses.json` | 1,181,758 | 701 verse objects, flat array |

### 1.2 Measured build output

`npx vite build` on the current tree **[M]**:

```
dist/assets/index-*.js    raw 1,336,720 B   gzip 376,943 B
dist/assets/index-*.css   raw     6,983 B   gzip   2,082 B
PWA precache              8 entries, 1,313.06 KiB
Rollup warning: "Some chunks are larger than 500 kB after minification"
```

**One JavaScript chunk of 377 KB gzipped is the entire product surface.** `verses.json` is
statically imported in `App.tsx:9`, so Rollup inlines all 701 verses into that chunk as a
JavaScript object literal. Every cold start downloads, decompresses, and **parses as
JavaScript** ~1.18 MB of scripture before React can render the 18-card home screen — a
screen that needs only `chapters.json` (5 KB).

App-shell size excluding the corpus: **~155 KB raw / ~50 KB gzip [E]** (1,336,720 minus the
~1.18 MB of embedded JSON; gzip share estimated by proportion). That is the number the
initial download *should* be.

### 1.3 Corpus shape (measured with `python3 -c 'json.load(...)'`, file never read into context)

- 701 verses, 18 chapters **[M]**
- Verses per chapter **[M]**: `{1:47, 2:72, 3:43, 4:42, 5:29, 6:47, 7:30, 8:28, 9:34, 10:42, 11:55, 12:20, 13:35, 14:27, 15:20, 16:24, 17:28, 18:78}` — **max 78 (ch. 18), min 20 (ch. 12)**
- Per-chapter payload, minified JSON, gzip **[M]**:
  `{1:21.7, 2:33.9, 3:19.5, 4:19.1, 5:14.1, 6:20.6, 7:14.0, 8:13.1, 9:16.0, 10:19.2, 11:29.7, 12:9.3, 13:15.5, 14:11.7, 15:10.7, 16:11.7, 17:12.7, 18:33.6}` KB
  → **largest chapter 33.9 KB gz, smallest 9.3 KB gz, whole corpus 306.5 KB gz [M]**
- Field weight across the corpus, raw KB **[M]**: `context_english 221.2`, `text 176.4`,
  `text_kannada 170.7`, `text_telugu 170.7`, `translation_english 115.6`,
  `transliteration 85.7`, and then a cliff — `context_kannada 3.0`,
  `translation_kannada 2.9`, `context_telugu 3.0`, `translation_telugu 2.8`.
- **Field coverage, non-empty, out of 701 [M]**:
  `text 701`, `text_kannada 701`, `text_telugu 701`, `transliteration 701`,
  `translation_english 701`, `context_english 701`,
  **`translation_kannada 4`, `translation_telugu 4`, `context_kannada 4`, `context_telugu 4`**.

That last line is the most important fact in this document and it changes the data
architecture. The Kannada and Telugu **script** of the verse exists for all 701 verses, but
the Kannada and Telugu **translation and commentary exist for 4 verses**. Switching language
today changes the Devanagari/script line and silently falls back to English prose for 697 of
701 verses (`VerseViewer.tsx` `if (verse.translation_kannada)` guard). Any per-language file
split done *now* would be splitting a corpus that is ~99% English-plus-scripts, and would
have to be redesigned the moment the translations are backfilled.

Language-projection sizes if we split today **[M]**:

| Projection | raw KB | gzip KB |
|---|---|---|
| core (`chapter_id`, `verse_number`, `text`, `transliteration`) | 304.8 | 76.8 |
| en (`translation_english`, `context_english`) | 366.8 | 109.9 |
| kn (all three kn fields) | 186.3 | 36.0 |
| te (all three te fields) | 185.6 | 35.9 |

### 1.4 Defects and gaps, grounded in the code

1. **`App.tsx:49`** — `versesData.filter(v => v.chapter_id === selectedChapterId)` runs on
   **every render**, scanning 701 objects. It runs again independently at **`App.tsx:57`**
   inside `handleSelectChapter`. Theme toggle, language change, and every verse advance all
   pay this scan. It is O(701) and cheap in isolation (~0.05 ms **[E]**) but it allocates a
   fresh array each render, so every downstream `useMemo`/`memo` boundary you add later will
   be defeated by identity churn. Fix it before adding memoisation, not after.
2. **No router.** Navigation is `useState` in `App.tsx:16-17`. Consequences: no deep link to
   a verse, browser Back exits the app instead of returning to the chapter grid (a PWA
   correctness bug — on Android Back closes the installed app), no shareable verse URL, no
   scroll restoration, no analytics-addressable pages, no SEO surface.
3. **`App.tsx:68,75`** — `window.scrollTo` is called synchronously inside the click handler,
   *before* React commits the new verse. It scrolls the old DOM. With `behavior:"smooth"`
   the animation races the commit.
4. **`VerseViewer.tsx`** pagination buttons carry inline `style={{opacity, cursor}}` that
   changes on every verse, forcing per-navigation style recalculation and defeating CSS rule
   caching. The `disabled` attribute is already set; `:disabled` in CSS does this for free.
5. **`src/index.css:1`** — `@import url("https://fonts.googleapis.com/css2?family=Outfit...")`.
   A CSS `@import` is the slowest possible way to load a font: the browser cannot discover
   the Google Fonts stylesheet until `index.css` has downloaded and begun parsing, and the
   font files cannot be discovered until *that* stylesheet arrives. Three serialised RTTs on
   the critical path. Also: `Outfit` has no Kannada or Telugu coverage, so those scripts
   render in a system fallback with an unrelated metric — a layout-shift source at language
   switch even though the visual choice itself is out of scope here.
6. **PWA config (`vite.config.ts`)**: `registerType: "autoUpdate"` with no user-visible
   update UX — a deploy can swap assets under a reader mid-verse. `runtimeCaching` covers
   only Google Fonts. No `navigateFallback`, so once routing is added, a deep link will
   404 offline. No `cleanupOutdatedCaches`, no `globPatterns` tuning, no manual chunks.
   Because the corpus lives *inside the hashed JS chunk*, **every code-only deploy
   invalidates and re-downloads all 701 verses (377 KB gz)**. This is the single worst
   caching property of the current build.
7. `React.StrictMode` in `main.tsx` — correct, dev-only double render, leave it.
8. Browserslist DB is 7 months stale **[M, from build output]**.
9. No tests, no CI, `eslint` defined in `package.json` but not run by `build`.

---

## 2. Data architecture

### 2.1 Decision

**Move the corpus out of the JS bundle into per-chapter static JSON under a versioned path,
fetched on demand, cached by the service worker in Cache Storage, and memoised in a module
level `Map`.** Keep `chapters.json` (5 KB) statically imported — it is needed for first
paint and is not worth a request.

Do **not** split per language yet. Rationale is measured, not aesthetic: the kn/te
translation and commentary fields are populated for 4 of 701 verses **[M]**, so a language
split saves nothing today while doubling request count and adding a join at render time.
The file layout below is chosen so that the split becomes **additive** when the
translations are backfilled — no consumer change, only a new file suffix and one branch in
the loader.

### 2.2 File layout

```
public/
  data/
    v1/
      manifest.json            # {schema:1, generated:"<iso>", chapters:[{id, verses, bytes, sha}]}
      chapters.json            #  5 KB  — chapter metadata (also statically imported)
      chapter-01.json          # 21.7 KB gz  [M]
      chapter-02.json          # 33.9 KB gz  [M]
      ...
      chapter-18.json          # 33.6 KB gz  [M]
      search-index.json        # 224.4 KB gz [M 2026-09-05] (see 2.5)
scripts/
  build-data.mjs               # canonical src/data/verses.json -> public/data/v1/*
src/
  data/
    verses.json                # stays as the CANONICAL editable source, no longer imported
    chapters.json              # stays, still statically imported
  lib/
    gita.ts                    # the loader module (2.4)
    gita.types.ts              # Verse, ChapterMeta, ChapterId
```

`src/data/verses.json` remains the single editable source of truth and stays in git. It is
**no longer imported by any module** — `scripts/build-data.mjs` (run from `prebuild` and
`predev`) is the only consumer. An ESLint `no-restricted-imports` rule on
`**/data/verses.json` makes the 1.18 MB regression impossible to reintroduce by accident.

Files under `public/data/v1/` are emitted minified with stable key order so that a chapter
whose text did not change produces a byte-identical file and keeps its Workbox precache
revision — which is what makes code-only deploys stop re-downloading scripture.

### 2.3 Why `v1/` in the path

The directory is the cache-invalidation unit for **shape** changes. Content edits are
handled by Workbox precache revisions (per-file hash). A breaking schema change (e.g. the
per-language split in 2.6) bumps to `v2/` and the SW `activate` handler deletes any
`gita-data-v*` cache whose version is not current. This gives two independent invalidation
axes and means we never have to hand-write a cache-busting query string.

### 2.4 Loader module API

`src/lib/gita.ts` — the entire data surface of the app. No component fetches directly.

```ts
export type ChapterId = number;              // 1..18, validated at the router edge
export type Language = "en" | "kn" | "te";

export interface Verse {
  chapter_id: number;
  verse_number: number;
  text: string;                 // Devanagari, 701/701 [M]
  text_kannada?: string;        // 701/701 [M]
  text_telugu?: string;         // 701/701 [M]
  transliteration: string;      // 701/701 [M]
  translation_english: string;  // 701/701 [M]
  translation_kannada?: string; // 701/701 [M 2026-09-05]
  translation_telugu?: string;  // 701/701 [M 2026-09-05]
  context_english?: string;     // 701/701 [M]
  context_kannada?: string;     // 4/701   [M 2026-09-05]
  context_telugu?: string;      // 22/701  [M 2026-09-05]
}

export interface ChapterMeta {
  id: number; name: string; name_meaning: string;
  verses_count: number; summary: string;
}

/** Sync. Bundled (5 KB). Safe to call during render. */
export function getChapters(): readonly ChapterMeta[];
export function getChapterMeta(id: ChapterId): ChapterMeta | undefined;

/** Sync cache probe. Returns undefined if the chapter is not resident.
 *  This is what makes navigation feel instant: render optimistically on a hit,
 *  suspend only on a miss. Safe to call during render. */
export function peekChapter(id: ChapterId): readonly Verse[] | undefined;
export function peekVerse(c: ChapterId, v: number): Verse | undefined;

/** Async load. Memoised by chapter id AND de-duplicated in flight:
 *  two concurrent calls for the same chapter share one Response. */
export function loadChapter(id: ChapterId): Promise<readonly Verse[]>;
export function loadVerse(c: ChapterId, v: number): Promise<Verse | undefined>;

/** Fire-and-forget warm-up. Never rejects, never blocks, low priority
 *  (fetch(..., {priority:"low"}) where supported). Idempotent. */
export function prefetchChapter(id: ChapterId): void;

/** Lazy, ~73 KB gz [M]. Only loaded when search UI is opened. */
export function loadSearchIndex(): Promise<SearchIndex>;

/** Offline-completeness. Warms every chapter into Cache Storage at idle.
 *  onProgress fires 0..1 so the UI can show "Available offline". */
export function ensureOffline(onProgress?: (p: number) => void): Promise<void>;
export function offlineStatus(): Promise<{ cached: number; total: number }>;
```

Internals: `const memo = new Map<ChapterId, readonly Verse[]>()` plus
`const inflight = new Map<ChapterId, Promise<readonly Verse[]>>()`. `loadChapter` checks
`memo` → `inflight` → `fetch('/data/v1/chapter-NN.json')`. Because the service worker holds
a `CacheFirst` rule on `/data/v1/`, a warm fetch resolves from Cache Storage without
touching the network and typically in <5 ms **[E]**.

Memory ceiling if a user reads every chapter in one session: 1.18 MB of JSON as live JS
objects ≈ 3–4 MB heap **[E]**. Acceptable; no eviction needed. If it ever matters, evict
from `memo` with an LRU of 4 chapters — Cache Storage still backs it, so re-entry is a
parse, not a download.

### 2.5 Search

The index now carries Devanagari, Kannada, Telugu, transliteration *and* English for all
701 verses: **743.5 KB raw / 224.4 KB gzip [M 2026-09-05]**. (It was 202.0 KB raw /
72.8 KB gzip when it held only `translation_english + transliteration`.) It is deliberately
outside the precache and served by the `/data/v1/*.json` CacheFirst rule, so offline search
works only after a first online search until `ensureOffline()` warms it.

Recommendation: **ship a plain array and use `String.prototype.includes` over a
pre-normalised lowercase/diacritic-folded field.** 701 documents × ~300 chars is ~200 KB of
string scan per keystroke, which is sub-millisecond **[E]** and does not need a library.
Wrap the query in `useDeferredValue` and the result list in `startTransition`.

Rejected: `minisearch` / `flexsearch` / `lunr`. They add 15–30 KB gz **[E]** and an index
build step to solve a ranking problem that 701 documents do not have. Revisit only if the
product needs stemming, fuzzy matching, or Kannada/Telugu tokenisation — the last of which
becomes real once the kn/te translations are backfilled, and is the actual trigger for
reopening this decision.

### 2.6 Rejected alternatives (data)

**IndexedDB as the offline store.** Rejected. Cache Storage already gives durable,
origin-scoped, quota-managed persistence keyed by URL, and the service worker populates it
for free as a side effect of the precache/runtime rules we need anyway. IndexedDB would
duplicate all of that, add an async `open()` + version-upgrade handler on the critical
path, add a schema migration surface, and give us nothing in return — we have no queries
that a URL key cannot answer, no partial updates, and no writes. IndexedDB becomes correct
the day the app stores *user* data (bookmarks, highlights, reading position history); at
that point add it for **that** data only, not for the corpus.

**Dynamic `import()` of per-chapter JSON modules** (`import('../data/chapters/01.json')`).
Rejected, though it is the closest runner-up. Pros: fully typed, no separate manifest, Vite
handles hashing and preload. Cons that decided it: (a) JSON arriving through the module
graph is parsed as JavaScript source, which is measurably slower than
`Response.json()`'s dedicated JSON parser for payloads of this size; (b) the chunk URLs are
build-hashed, so the SW precache manifest and the loader have to agree through generated
glue rather than a stable path we control; (c) it keeps the corpus inside the module graph
where a future careless `import` can re-flatten it into the entry chunk — exactly the
failure mode we are fixing. The `public/data/v1/` path is boring, greppable, and
inspectable in DevTools.

**One `verses.json` fetched once, lazily, after first paint.** Rejected. It fixes the
*bundle* problem but not the *transfer* problem: a reader who opens chapter 12 downloads
306 KB gz **[M]** to display 9.3 KB gz **[M]** of content. Per-chapter is 3–33× less data
for the first read.

**Server/API.** Rejected — the corpus is static, finite, and the product is offline-first.
Any network dependency is a regression.

**Per-language split, now.** Rejected on the coverage measurement in 1.3. Adopt when
`translation_kannada` coverage crosses ~50% of 701; the layout is then
`chapter-NN.core.json` (Devanagari + transliteration + all three scripts) plus
`chapter-NN.en.json` / `.kn.json` / `.te.json`, precache core + the user's language, runtime
cache the other two. Loader change is confined to `loadChapter`, which gains a `lang`
argument and merges two responses; component contracts do not change.

---

## 3. Routing

### 3.1 Decision: a ~90-line custom History API router, not React Router

The app has **three** routes and no data-loader, no nested layout, no form actions, no
error boundary hierarchy, and no server rendering. `react-router` v7 in its minimal
declarative form is roughly 12–18 KB gz **[E]**; against a target initial bundle of ~65 KB gz
that is a 20–28% tax to route three screens. The features we would actually consume — path
parsing, `popstate`, `<Link>` — are about 90 lines.

The one thing a hand-rolled router usually gets wrong is scroll restoration, and React
Router does not solve that for us either (`<ScrollRestoration>` is data-router-only). So we
implement it deliberately, once, in section 3.4.

Escape hatch, written down so the reversal is cheap: if the app ever grows nested layouts,
route-level data loaders, or more than ~6 routes, replace `src/lib/router.tsx` with
`react-router`. Because every component consumes routing through `useRoute()` /
`navigate()` and never touches `history` directly, that swap is a single-file change.

### 3.2 URL scheme

```
/                                 Home — chapter grid
/chapter/:n                       Chapter n, opens at its first verse (canonicalises
                                  via history.replaceState to /chapter/:n/verse/:m)
/chapter/:n/verse/:m              A verse. The shareable, deep-linkable unit.
/search?q=<query>                 Search (q is debounced into replaceState, not pushState)
*                                 404 -> render home, replaceState("/")
```

`:n` is 1..18 and `:m` is the verse's `verse_number` (**not** an array index — verse numbers
are the stable public identifier and appear in the UI). Both are validated against
`chapters.json` `verses_count` at the router edge; an out-of-range `:m` clamps and
`replaceState`s to the nearest valid verse rather than rendering an error, because a
truncated shared link should still land somewhere useful.

**Language stays out of the path.** It is a durable user preference in `localStorage`
(`gita-language`, already implemented at `App.tsx:31`), and putting it in the path would
create three URLs per verse and fragment sharing. Support `?lang=kn` as a **one-shot
override** so a link can be shared in a specific language: on mount, if `?lang` is present
and valid, apply it, persist it, then `replaceState` the parameter away. Theme likewise
stays in `localStorage` only.

History API, not hash. Hash URLs are ugly, are not indexed, and break `navigateFallback`
semantics. This requires an SPA rewrite from the host:

- **Any host**: the service worker's `navigateFallback: "index.html"` covers every
  navigation once the SW is installed — including all offline and installed-PWA
  navigation. This is the case that matters most for this product.
- **First visit / SW not yet controlling**: needs a host rewrite. Netlify `_redirects`
  (`/* /index.html 200`), Vercel `rewrites`, Cloudflare Pages `_redirects`, nginx
  `try_files $uri /index.html`. **GitHub Pages** has no rewrite: emit a `dist/404.html`
  that is a byte copy of `index.html` (a `closeBundle` hook in `vite.config.ts`, four
  lines). Decide the host before shipping routing, and add the corresponding file in the
  same PR.
- If a host genuinely cannot do either, fall back to hash routing — `src/lib/router.tsx`
  should read the mode from one constant so this is a one-line change.

### 3.3 Router contract

```ts
export type Route =
  | { name: "home" }
  | { name: "verse"; chapter: number; verse: number }
  | { name: "search"; q: string };

export function useRoute(): Route;                       // subscribes via useSyncExternalStore
export function navigate(to: Route, opts?: {
  replace?: boolean;      // replaceState instead of pushState
  scroll?: "top" | "preserve" | "restore";  // default "top"; "restore" on popstate
}): void;
export function Link(props: { to: Route } & AnchorProps): JSX.Element;
```

`Link` renders a real `<a href>` (so middle-click, cmd-click, "copy link address", and the
browser's own status bar all work), calls `preventDefault` only for plain left clicks, and
fires `prefetchChapter(to.chapter)` on `pointerenter` and `focus`.

`useRoute` is built on `useSyncExternalStore` over `popstate` + a custom `navigate` event,
which keeps it correct under React 19 concurrent rendering — a `useState`+`useEffect`
router can tear during a transition.

**`App.tsx` shrinks to a route switch.** Theme and language move to a small
`SettingsContext` (they are read by `Header` and `VerseViewer`, and should not re-render
the router). Chapter/verse selection state is deleted entirely — the URL is the state.

### 3.4 Back/forward and scroll restoration

1. On boot: `if ("scrollRestoration" in history) history.scrollRestoration = "manual"`.
   The browser's automatic restoration fires before React has rendered the target route and
   scrolls to a position in a DOM that does not exist yet.
2. Every `pushState`/`replaceState` carries `{ key: crypto.randomUUID() }` in its state.
3. Keep `const positions = new Map<string, number>()`. Immediately **before** any
   navigation, write `positions.set(currentKey, window.scrollY)`.
4. After the destination commits, restore in a `useLayoutEffect` keyed on the route:
   `popstate` → `scrollTo(0, positions.get(key) ?? 0)`; a fresh push → `scrollTo(0,0)`.
   `useLayoutEffect`, not `useEffect`, so the restore happens before paint and the user
   never sees the top of the page flash.
5. Restoration must not run until the destination's **content** is present, or it will
   restore against a short skeleton and clamp to the document height. This is why
   cross-chapter navigation uses `startTransition` (section 4.4): React keeps the previous
   screen on-screen until the new chapter's data resolves, so by the time the layout effect
   runs the real content is committed and the saved offset is valid.
6. Persist `positions` to `sessionStorage` on `pagehide` so restoration survives the
   bfcache-miss reload path.

Reading-position memory (distinct from scroll restoration): persist
`{chapter, verse}` to `localStorage` on every verse change and offer "Continue reading" on
the home screen. This is the behaviour users of a scripture app actually want from a
"resume", and it is three lines given the URL-as-state model.

---

## 4. Rendering performance

### 4.1 Virtualisation: NOT needed. Do not add it.

Measured: the largest chapter is **78 verses (ch. 18) [M]**, and the current UI renders
**one verse at a time** — roughly 30 DOM nodes on screen. Virtualisation would be pure cost.

Even under the likely future "continuous chapter scroll" mode, 78 verse blocks × ~8 nodes
≈ 620 nodes **[E]** — comfortably under the ~1,500-node threshold where list virtualisation
starts to pay for itself, and far below the point where it beats the browser's own
optimisations. If that mode ships and profiles badly, reach for CSS first:
`content-visibility: auto` + `contain-intrinsic-size: 0 320px` on each verse block gives
most of the win with zero JavaScript, no scroll-anchoring bugs, no broken Ctrl+F, and no
broken deep-link-to-verse. Only if *that* is measurably insufficient should
`react-window`/`virtua` be reconsidered — and it would then break the anchor-scroll
deep-linking in section 3.2, which is a product regression, not just a complexity cost.

**Decision: no virtualisation library, now or at the next milestone.**

### 4.2 Memoisation points

The `versesData.filter` at `App.tsx:49` and `App.tsx:57` disappears with the loader — that
is the largest single win and it comes free with section 2.

What remains, in order of value:

1. **Verse index map.** `useMemo(() => new Map(verses.map((v,i) => [v.verse_number, i])), [verses])`.
   Replaces the `findIndex` at `App.tsx:51`. O(1) prev/next, and — more importantly — a
   stable identity that downstream memos can depend on. `verses` itself is already stable
   because `peekChapter`/`loadChapter` return the memoised array by reference.
2. **`useCallback` on every handler passed to a memoised child** — `toggleTheme`,
   `setLanguage`, `onNext`, `onPrev`. Without this, `React.memo` below does nothing.
   With the router, `onNext`/`onPrev` become `navigate()` calls with no closure over
   changing state, so they can be module-level constants derived from the route.
3. **`React.memo(ChapterList)`** — its `chapters` prop is a module constant and
   `onSelectChapter` becomes a stable `Link`, so after memoisation the 18 cards render
   exactly once per session.
4. **`React.memo(Header)`** — currently re-renders on every verse change for no reason.
5. **`React.memo(VerseViewer)`** — cheap insurance; its props are `(verse, language)` and
   both are stable references.
6. **Hoist the language-selection logic** in `VerseViewer.tsx` into a pure
   `selectVerseText(verse, language)` in `src/lib/verse.ts`, memoised on
   `[verse, language]`. It is currently a mutable `let` cascade re-executed on every render
   including theme toggles.

Do **not** reach for the React Compiler yet. It would subsume points 1–5, but it is a
build-level change with its own eslint plugin and bailout debugging; make the app correct
and measurable first, then evaluate the compiler as a simplification and delete the manual
memos it makes redundant.

### 4.3 Avoiding layout thrash

- **Delete `window.scrollTo` from the click handlers** (`App.tsx:68,75`). It runs against
  the pre-commit DOM. Scroll belongs in the router's `useLayoutEffect` (3.4), once, for
  all navigation.
- **Remove the inline `style={{opacity, cursor}}`** from the pagination buttons in
  `VerseViewer.tsx`. The `disabled` attribute is already there; style it with `:disabled`.
  Inline styles that change per verse force a style recalculation on every navigation and
  cannot be cached by the CSS engine. (This is a rendering-cost point, not a visual one —
  the resulting appearance is the design owner's call.)
- **Reserve space for the verse body.** The commentary block is conditional
  (`{displayContext && ...}`) and its length varies; give the panel a
  `min-height` so navigating between a long and a short verse does not reflow the
  pagination controls into a new position under the user's finger.
- **Never animate `height`/`top`/`width`.** Entrance animations must use `transform` and
  `opacity` only (the existing `animate-fade-in` class should be audited against this).

### 4.4 Making navigation feel instant

The target is that **prev/next within a chapter is a synchronous state change with zero
async work** — because the whole chapter is already resident. That is the main reason the
split is per-chapter and not per-verse.

- **Same-chapter navigation**: `peekChapter(n)` hits, render synchronously. No Suspense
  boundary is entered, no spinner is ever mounted. This should be a <16 ms commit **[E]**.
- **Cross-chapter navigation**: wrap `navigate()` in `startTransition`. React keeps the
  current verse on screen while `loadChapter(n)` resolves, and `useTransition`'s
  `isPending` drives a subtle inline progress affordance rather than a full-screen
  skeleton. On a warm Cache Storage hit this resolves in <5 ms **[E]** and the pending
  state never becomes visible.
- **Prefetch, in three places**:
  1. `pointerenter` / `focus` on any chapter card or `Link` → `prefetchChapter(n)`.
     Median hover-to-click latency is ~150–300 ms **[E]**, which covers a 9–34 KB gz fetch.
  2. On entering the **last 3 verses** of chapter *n* → `prefetchChapter(n+1)`.
     Symmetrically, the first 3 verses → `prefetchChapter(n-1)`.
  3. On home-screen idle (`requestIdleCallback`) → `prefetchChapter(1)`, plus the user's
     stored reading-position chapter.
  All three funnel through the same idempotent, in-flight-deduplicated `prefetchChapter`,
  so over-triggering is free.
- **Optimistic render on cold cross-chapter navigation**: `chapters.json` is already
  resident, so the destination's chapter name, meaning, verse count, and verse number can
  render immediately from metadata while only the verse *body* suspends. The user sees the
  page change instantly and text fill in, rather than a blank screen. This is what makes a
  cold navigation feel warm.
- **View Transitions**: use the **DOM API directly** —
  `document.startViewTransition(() => flushSync(() => navigate(to)))` — behind
  `if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches)`.
  Do **not** use React's `<ViewTransition>` component: it ships only in
  `react@experimental`, and this project is on stable `react@^19.2.0` **[M, package.json]**.
  Keep the transition to `opacity`/`transform` on the verse body only; a whole-page cross
  fade on every next-verse tap reads as lag. Assign
  `view-transition-name` to the verse panel, not the header, so the chrome stays put.

### 4.5 Language switching

Switching language re-renders the verse body with different strings. The data is already in
memory, so the React work is trivial; the perceived cost is **font and glyph**.

- Wrap `setLanguage` in `startTransition` so the select stays responsive and React can
  interrupt the re-render.
- `useDeferredValue(language)` for the commentary block specifically — it is the longest
  text node and the least urgent, so it can lag the verse line by a frame.
- Preload the Kannada/Telugu webfont **on `pointerenter` of the language select**, not at
  page load. That converts a visible FOUT at switch time into an invisible one.
- Because 697/701 verses have no kn/te translation **[M]**, `VerseViewer` silently shows
  English prose under a Kannada heading. That is a correctness/UX bug that belongs in the
  data plan: `selectVerseText` should return
  `{ text, translation, context, translationLang }`, and the UI must be able to mark
  "translation not yet available in this language". The component contract is specified
  here; the visual treatment is the design owner's.

---

## 5. Caching & offline

### 5.1 The guarantee

**Every one of the 701 verses is readable offline after the first successful visit,
without the user having visited those chapters.** Total data to satisfy this:
**306.5 KB gzip / 1.18 MB raw [M]** for the corpus, plus ~73 KB gz **[M]** for the search
index, plus a ~50 KB gz **[E]** app shell. Call it **~430 KB gz [M+E]** for the complete
offline product — small enough that the guarantee is affordable, large enough that we
should not block the service worker's `install` event on it.

### 5.2 Strategy: precache the shell, warm the corpus at idle

Keep `generateSW` (do not move to `injectManifest` — everything below is declarative).

**Precached at install** (blocking, must be small and fast):
app shell JS/CSS/HTML, icons, manifest, `data/v1/manifest.json`, `data/v1/chapters.json`,
and `data/v1/chapter-01.json` **[M: 21.7 KB gz]**. Roughly 80 KB gz **[E]** total —
an install that completes in well under a second on 4G.

**Warmed at idle** (non-blocking, gives the guarantee):
after first paint, the page schedules `ensureOffline()` in `requestIdleCallback`, which
walks `manifest.json` and `cache.addAll()`s the remaining 17 chapters plus the search index
into the `gita-data-v1` cache. Progress drives a small, dismissible "Available offline"
indicator. Skip the warm-up when `navigator.connection.saveData` is true or
`effectiveType` is `2g`/`slow-2g`, and expose a manual "Download for offline" control for
those users. This respects metered connections without weakening the default guarantee.

Rejected: precaching all 18 chapters in the Workbox manifest. It works and is one config
line, but it makes `install` responsible for ~330 KB gz before the SW activates, which
delays offline-readiness on exactly the slow connections that need it most, and it
re-runs on every deploy that changes any chapter. Idle warm-up gets the same end state with
better first-visit behaviour and per-file revisioning.

### 5.3 Workbox configuration (shape, in `vite.config.ts`)

```
registerType: "prompt"                      // was "autoUpdate" — see 5.5
workbox: {
  globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
  globIgnores: ["data/v1/chapter-{02,03,...,18}.json", "data/v1/search-index.json"],
  navigateFallback: "index.html",
  navigateFallbackDenylist: [/^\/data\//],  // never serve HTML for a data miss
  cleanupOutdatedCaches: true,
  clientsClaim: false,                      // paired with "prompt"; see 5.5
  skipWaiting: false,
  maximumFileSizeToCacheInBytes: 3_000_000,
  runtimeCaching: [ ... see 5.4 ... ],
}
```

`navigateFallback` is what makes deep links (`/chapter/9/verse/22`) work offline and in the
installed PWA — without it, section 3 is broken the moment the network is gone.
`navigateFallbackDenylist` on `/data/` prevents the classic failure where a missing JSON
returns `index.html` and the loader dies in `JSON.parse` with an incomprehensible
`Unexpected token '<'`.

### 5.4 Runtime caching rules, per asset class

| Class | Pattern | Handler | Cache | Notes |
|---|---|---|---|---|
| Corpus data | `/data/v1/*.json` | `CacheFirst` | `gita-data-v1` | Immutable per version dir. No expiration. `cacheableResponse: {statuses:[200]}`. This is the cache `ensureOffline` populates. |
| App shell | precache | — | workbox precache | Revisioned per file |
| Self-hosted fonts | `*.woff2` | precache | workbox precache | See 5.6 — removes the two rules below |
| Google Fonts CSS | `fonts.googleapis.com` | `StaleWhileRevalidate` | `google-fonts-css` | **Change from `CacheFirst`.** `CacheFirst` on the stylesheet pins the font-file URLs it names for a year, so Google can never rotate them and a font update is unreachable. SWR keeps it instant *and* fresh. Only needed until self-hosting lands. |
| Google font files | `fonts.gstatic.com` | `CacheFirst` | `gstatic-fonts` | Correct as-is: the URLs are content-addressed. 1-year expiry, `maxEntries: 30` (10 is too few once Kannada + Telugu subsets are added). |

Note the existing config uses `cacheableResponse: {statuses: [0, 200]}` for fonts —
`0` (opaque) is required for `fonts.gstatic.com` and must be kept there, but must **not**
be used for `/data/`, where a cached opaque response would be an unrecoverable poisoned
entry.

### 5.5 Update flow

Change `registerType` from `"autoUpdate"` to `"prompt"`, with `skipWaiting: false` and
`clientsClaim: false`. Rationale: `autoUpdate` swaps assets under a live reader; in a
scripture app a mid-verse reload is a real annoyance, and with the current single-chunk
build it is a 377 KB gz **[M]** surprise download.

```tsx
// src/components/UpdatePrompt.tsx  (contract only; visuals are the design owner's)
const { needRefresh, offlineReady, updateServiceWorker } =
  useRegisterSW({
    onRegisteredSW(url, r) {
      // check hourly; a reader may keep the PWA open for days
      r && setInterval(() => r.update(), 60 * 60 * 1000);
    },
  });
// needRefresh  -> non-blocking toast: "A new version is available"  [Reload]
//                 onClick => updateServiceWorker(true)
// offlineReady -> one-shot confirmation: "Ready to read offline"
```

`updateServiceWorker(true)` posts `SKIP_WAITING` and reloads once the new SW controls. The
prompt must be dismissible and must never steal focus from the verse text.

### 5.6 Fonts

Self-host. Replace the `@import` at `src/index.css:1` with `@fontsource-variable/outfit`
(or a build-time fetch of the woff2 files) so the fonts are precached with the shell,
subject to the same revisioning, and available offline on first launch — which the current
Google Fonts `CacheFirst` rule cannot guarantee, since a first visit that is already offline
gets no font at all. Self-hosting also deletes two cross-origin round trips
(`fonts.googleapis.com` then `fonts.gstatic.com`), removes two DNS+TLS handshakes, and lets
both runtime-caching rules in 5.4 be deleted.

Subset aggressively: Latin for `Outfit`, and separate Kannada/Telugu faces loaded only on
demand (4.5). Every face needs `font-display: swap` and a `size-adjust`-tuned fallback in
the stack so the swap does not shift layout. *(Which faces, and how they look, is the
design owner's call — this section only fixes how they are delivered and cached.)*

### 5.7 Cache versioning and invalidation

- **Shape changes** → bump `data/v1` → `data/v2`. In the SW `activate` (or, with
  `generateSW`, in a tiny `additionalManifestEntries`-adjacent cleanup registered from the
  page), delete every `caches.keys()` entry matching `/^gita-data-v(\d+)$/` whose version is
  not current.
- **Content changes** → handled per-file by Workbox precache revisions for the precached
  subset, and by `manifest.json`'s per-chapter `sha` for the idle-warmed subset:
  `ensureOffline` compares the cached entry's recorded sha and re-fetches only changed
  chapters. This is why `build-data.mjs` must emit byte-stable output for unchanged input.
- `cleanupOutdatedCaches: true` handles the workbox-precache generation churn.
- **Never** cache `index.html` with a long max-age at the CDN — it must be
  `Cache-Control: no-cache` so the SW registration and asset hashes can roll. Hashed assets
  under `/assets/` get `immutable, max-age=31536000`. `/data/v1/*` likewise
  (`immutable`), since the version is in the path.

---

## 6. Startup and the critical path

### 6.1 Critical path today (measured artefacts)

```
index.html (522 B)
  └─ /assets/index-*.css (2,082 B gz)          render-blocking
       └─ @import fonts.googleapis.com/css2    discovered only after CSS parses
            └─ fonts.gstatic.com/*.woff2       third serialised RTT
  └─ /assets/index-*.js (376,943 B gz)         parse+execute ALL 701 verses
       └─ React mounts → first meaningful paint
```

Three serialised network round trips before a glyph can paint, and ~1.18 MB of JSON parsed
as JavaScript before React's first commit.

### 6.2 Target critical path

```
index.html  (~4 KB: inlined CSS + inlined app-shell skeleton + preload hints)
  ├─ <link rel="modulepreload" /assets/react-vendor-*.js>
  ├─ <link rel="modulepreload" /assets/index-*.js>
  ├─ <link rel="preload" as="font" type="font/woff2" crossorigin /assets/outfit-*.woff2>
  └─ (chapters.json is inside the app chunk, 5 KB — no extra request)
```

One HTML request paints the shell; two preloaded module chunks hydrate it; zero corpus
bytes on the home screen.

### 6.3 What to inline

- **All of the CSS.** Measured at **6,983 B raw / 2,082 B gz [M]** — well under the ~10 KB
  threshold where inlining stops paying. Inline it into `<head>` and delete the CSS request
  entirely. (`vite-plugin-css-injected-by-js` or a small `transformIndexHtml` hook.)
- **A static app-shell skeleton** into `<div id="root">`: the header bar and a chapter-grid
  placeholder, as plain HTML. This makes LCP independent of JavaScript. React's client
  render replaces it on mount. Keep it under ~1.5 KB.
- **Theme resolution**, as a 6-line blocking inline script that reads
  `localStorage["gita-theme"]` / `prefers-color-scheme` and sets
  `document.documentElement.dataset.theme` **before first paint**. Currently this happens in
  a `useEffect` (`App.tsx:20-35`), which guarantees a light-theme flash for every dark-mode
  user on every cold start. This is the cheapest visible win in the whole document.

### 6.4 Code-splitting boundaries

The corpus split (section 2) is the real win; code splitting is secondary because the shell
is small. Still:

- `manualChunks: { "react-vendor": ["react", "react-dom"] }` — react-dom is ~45 KB gz **[E]**
  and never changes between deploys, so isolating it means an app-code deploy invalidates
  ~15 KB, not ~60 KB.
- **Lazy-load search**: `React.lazy(() => import("./features/search/SearchScreen"))`,
  which also defers `loadSearchIndex()`'s 73 KB gz **[M]**.
- **Do not** route-split home vs. reader. They are a few KB each and both are reachable in
  one tap; splitting them adds a waterfall to the most common navigation in the app.
- Audit `lucide-react`: named imports are tree-shaken by ESM, so `Book`, `BookOpen`,
  `ChevronLeft`, `ChevronRight`, `Globe`, `Moon`, `Sun` should cost ~1 KB total **[E]**.
  Verify with the bundle visualiser (section 7); if the whole icon set is landing in the
  chunk, switch to `lucide-react/icons/<name>` deep imports.

### 6.5 Explicit budgets

Enforced in CI (section 7). "Fails the build" means fails the build.

| Budget | Target | Today **[M]** |
|---|---|---|
| Initial JS, gzip (all chunks needed for first paint) | **≤ 65 KB** | 377 KB |
| — of which `react-vendor` | ≤ 50 KB | (bundled together) |
| — of which app code | ≤ 15 KB | (bundled together) |
| Inlined CSS, gzip | ≤ 3 KB | 2.08 KB (as a separate request) |
| Corpus bytes on home screen | **0 KB** | 306.5 KB |
| Largest single chapter fetch, gzip | ≤ 40 KB | 33.9 KB (ch. 18) — already passing |
| Total precached at install, gzip | ≤ 100 KB | 1,313 KiB raw |
| Total offline-complete footprint, gzip | ≤ 500 KB | ~430 KB **[M+E]** — passing |
| LCP, Moto G4 / Slow 4G | ≤ 1.8 s | not measured |
| TTI, Moto G4 / Slow 4G | ≤ 2.5 s | not measured |
| INP p75 (verse next/prev) | ≤ 200 ms | not measured |
| Same-chapter verse navigation | ≤ 16 ms, no spinner ever | n/a |
| Lighthouse PWA + Performance | ≥ 95 | not measured |

Baseline device for the field targets: mid-tier Android on Slow 4G, since the audience for
Kannada/Telugu scripture is disproportionately on mid-tier hardware in India.

---

## 7. Build and tooling gaps

Short list, all cheap:

- **CI workflow** (`.github/workflows/ci.yml`): `tsc -b --noEmit`, `eslint .`,
  `prettier --check .`, `vite build`. `build` already runs `tsc -b` **[M, package.json]**
  but `lint` is never run by anything.
- **Bundle analysis**: `rollup-plugin-visualizer` behind `ANALYZE=1`, committed as
  `npm run analyze`. Needed to verify the `lucide-react` and `manualChunks` assumptions
  in 6.4.
- **Size budget gate**: `size-limit` (or a 20-line script over `dist/assets/*`) asserting
  the gzip rows in 6.5. This is the guard that stops `verses.json` from being re-imported.
- **`no-restricted-imports`** ESLint rule banning `src/data/verses.json` outside
  `scripts/`.
- **Lighthouse CI** with a `budget.json` mirroring 6.5, run against `vite preview`.
- `npx update-browserslist-db@latest` — the DB is 7 months stale **[M, build output]**.
- Tests: none exist. The highest-value first tests are pure and fast — `build-data.mjs`
  output shape (701 verses across 18 files, counts match `chapters.json`), the router's
  path parse/serialise round trip, and `selectVerseText` fallback behaviour. A DOM test
  runner is not needed for any of them.

---

## 8. Prioritised implementation checklist

Each line is independently shippable and leaves the app working.

**P0 — correctness and the 377 KB problem**

- [ ] P0.1 Add `scripts/build-data.mjs`; emit `public/data/v1/{manifest,chapters,chapter-NN}.json`; wire to `prebuild`/`predev`. No app change yet.
- [ ] P0.2 Add `src/lib/gita.ts` (`getChapters`/`peekChapter`/`loadChapter`/`prefetchChapter`) with in-memory memo + in-flight dedup.
- [ ] P0.3 Switch `App.tsx` to the loader, delete the `verses.json` import and both `versesData.filter` calls — initial JS drops from 377 KB gz to ~50 KB gz **[E]**.
- [ ] P0.4 Add `no-restricted-imports` on `src/data/verses.json` and the `size-limit` gate so P0.3 cannot regress.
- [ ] P0.5 Add the `/data/v1/*.json` `CacheFirst` runtime rule and `navigateFallback` + `navigateFallbackDenylist` to `vite.config.ts`.
- [ ] P0.6 Inline the pre-paint theme script in `index.html`; remove the theme half of the `useEffect` in `App.tsx` — kills the dark-mode flash.
- [ ] P0.7 Replace the `@import` in `src/index.css:1` with self-hosted woff2 + `<link rel="preload">`; delete the two Google Fonts runtime rules.

**P1 — routing, offline guarantee, and perceived speed**

- [ ] P1.1 Add `src/lib/router.tsx` (`useRoute`/`navigate`/`Link` on `useSyncExternalStore`), reduce `App.tsx` to a route switch, move theme/language to `SettingsContext`.
- [ ] P1.2 Add the host SPA rewrite (`_redirects` / `vercel.json` / `dist/404.html` copy) in the same PR as P1.1.
- [ ] P1.3 Implement `history.scrollRestoration = "manual"` + per-history-key scroll map + `useLayoutEffect` restore; delete both `window.scrollTo` calls from `App.tsx`.
- [ ] P1.4 Switch `registerType` to `"prompt"`, add `UpdatePrompt` with `useRegisterSW`, hourly `r.update()`, and an "offline ready" confirmation.
- [ ] P1.5 Implement `ensureOffline()` idle warm-up over `manifest.json` + the "Available offline" indicator; honour `saveData`/`2g`.
- [ ] P1.6 Add `prefetchChapter` triggers: `Link` `pointerenter`/`focus`, last/first 3 verses of a chapter, home-screen idle.
- [ ] P1.7 Wrap cross-chapter `navigate` in `startTransition`; render chapter metadata optimistically from `chapters.json` while the verse body resolves.
- [ ] P1.8 Memoisation pass: verse-number→index `Map`, `useCallback` handlers, `React.memo` on `Header`/`ChapterList`/`VerseViewer`, extract `selectVerseText`.
- [ ] P1.9 Persist reading position to `localStorage`; add "Continue reading" on the home screen.

**P2 — polish, budgets, and the next data milestone**

- [ ] P2.1 Inline all CSS into `index.html` and add the static app-shell skeleton; drop the CSS request.
- [ ] P2.2 Add `manualChunks: { "react-vendor": [...] }` and verify `lucide-react` tree-shaking with `rollup-plugin-visualizer`.
- [ ] P2.3 Replace the inline `style={{opacity,cursor}}` pagination styling with `:disabled`; add `min-height` to the verse panel.
- [ ] P2.4 Add `document.startViewTransition` around navigation, guarded by feature detection and `prefers-reduced-motion`, scoped to the verse panel.
- [ ] P2.5 Lazy-loaded search screen + `loadSearchIndex()` (73 KB gz **[M]**) with `useDeferredValue`; plain `includes` over a normalised field, no search library.
- [ ] P2.6 `.github/workflows/ci.yml` (typecheck, lint, format-check, build) + Lighthouse CI with `budget.json` from §6.5.
- [ ] P2.7 Language-switch polish: `startTransition` on `setLanguage`, font preload on `pointerenter`, explicit "translation unavailable in this language" state (697/701 verses **[M]**).
- [ ] P2.8 Tests for `build-data.mjs` output shape, router path round-trip, and `selectVerseText` fallback.
- [ ] P2.9 `npx update-browserslist-db@latest`.
- [ ] P2.10 **Trigger, not a task**: when `translation_kannada` coverage exceeds ~50% of 701, execute the per-language split described in §2.6 and bump `data/v1` → `data/v2`.
