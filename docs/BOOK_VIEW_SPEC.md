# Book View — desktop-only two-page reader

Status: spec, not built. Owner: design. Target: `>=900px` only.

The card reader (`src/components/VerseViewer.tsx`) is an *inspector*: one verse at a
time, sections in labelled panes, a rail, a pager. Book View is the opposite — a
**continuous typeset text** laid across two pages of a virtual book, with nothing
between the reader and the words. No cards, no pane labels, no tabs, no rail.

---

## 1. Content model of a spread

### 1.1 There is no left-page/right-page assignment

The single most important decision: **the two pages are not two content slots.**
They are columns 1 and 2 of one continuous flow. Text runs left page → right page →
(turn) → left page → right page. That is what makes it read as a book rather than as
a two-column dashboard, and it is why a card layout cannot be retrofitted into it.

The only exception is the opener:

| Spread | Left (verso) | Right (recto) |
| --- | --- | --- |
| 1 | Chapter opener: number, Sanskrit name, name meaning, `summary` | Flow begins at verse 1 |
| 2…n | continuous flow | continuous flow |

The opener block is `break-inside: avoid` and `break-after: column`, so it always owns
the verso alone.

### 1.2 The per-verse stream

Each verse contributes one uninterrupted run to the flow, in this order. Every item is
plain typeset matter: no background, no border, no radius, no label chip.

1. **Verse number.** `2.47`, set in `--fs-caption2` at `--tr-caps`, `--ink-4`, hanging
   in the outer margin (`float`-free: `position: absolute` inside a relatively
   positioned wrapper would break across columns, so use a `::before` on the scripture
   block with negative `margin-inline-start`). Carries `id="c2v47"` — the anchor.
2. **Scripture** — `verse.text` / `text_kannada` / `text_telugu` by reading language.
   Centred, `--fs-verse` / `--lh-verse`, one pada per line, `lang` tagged so the
   `[lang]` face rules apply. Gated on `sections.text`.
3. **Transliteration** — `--fs-translit`, italic, centred, `--ink-3`,
   `lang="sa-Latn"`. Gated on `sections.transliteration`.
4. **Translation** — full-measure prose, `--fs-trans` / `--lh-read`, `--ink-1`. No
   heading. This is the body text of the book. Gated on `sections.translation`.
5. **Commentary** — same measure, `--fs-comment` / `--lh-body`, `--ink-2`, first line
   indented `--sp-6`, no blank line before it (print convention: indent *or* space,
   never both). `commentary_author` follows as an em-dashed trailing clause in
   `--fs-caption1`, `--ink-4`. Gated on `sections.commentary`.
6. **Word meanings** — a single run-in paragraph, not a grid and not a list:
   `WORDS  aśocyān · the not-to-be-grieved-for · anvaśocaḥ · you grieve for · …`
   `--fs-gloss`, `--ink-3`, `lang="en"` (the corpus has `context_english` for 701/701
   and Kannada for 4). The run-in `WORDS` label is `--tr-caps`, `--ink-4`. Gated on
   `sections.words`.

Separation between verses is **space only**: `margin-block-start: var(--sp-8)`. No
rules, no dividers, no separators. The hanging number is the only visual marker.

### 1.3 What a page break may and may not split

| May split across the gutter or a spread | Must never split |
| --- | --- |
| Translation paragraph | Scripture block (all padas of one verse) |
| Commentary paragraph | Transliteration block |
| Word-meanings run-in | Verse number + first line of scripture |
| — | Chapter opener |

Implemented purely with fragmentation properties, no JS:

```css
.book-scripture,
.book-translit,
.book-opener { break-inside: avoid; }
.book-verse-head { break-after: avoid; }
.book-prose { orphans: 3; widows: 3; }
```

A scripture block taller than one page is impossible in this corpus (longest is 6
padas), so `break-inside: avoid` never produces an unfillable column.

---

## 2. Pagination

### 2.1 Technique: overflow multicol, translated

The whole chapter is rendered **once**, into one CSS multi-column box with a fixed
block size. The browser's own fragmenter produces the pages; JS never measures text.

```css
.book-viewport { overflow: hidden; height: var(--book-page-h); }
.book-flow {
  height: 100%;
  column-width: var(--book-page-w);   /* NOT column-count */
  column-gap: var(--book-gutter);
  column-fill: auto;
  transform: translate3d(calc(-1 * var(--book-page) * var(--book-step)), 0, 0);
}
```

`column-width` with `column-count: auto` and a fixed height makes a multicol box
**overflow in the inline direction**: columns beyond the box width keep being
generated off to the right. `--book-step` is `(page-w + gutter) * pages-per-spread`.
Turning a page is one `transform`. Total pages is read once per layout as
`flow.scrollWidth / (pageW + gutter)`.

### 2.2 Why this and not JS measurement

- The browser's fragmenter already honours `break-inside`, `orphans`, `widows`,
  bidi, Indic shaping and ligature-aware line breaking. A JS paginator re-implements
  all of it, badly, and would split a pada mid-line.
- Text length varies from 40 to 3 000 characters per verse. A JS measurer must lay out
  and read back every one of ~78 verses × 5 sections on every relayout; multicol costs
  one layout pass total.
- **Fonts load async.** With multicol, a late `swap` simply reflows and the page count
  changes — we re-read one number. With JS measurement every cached measurement is
  invalidated and must be redone.
- Reading scale, reading language, reading face and the section toggles all change the
  flow. Multicol absorbs all five for free.

### 2.3 Position is anchored to a verse, never to a page number

A page number is meaningless across a different window size, scale or language, so it
is never stored and never in the URL. State is `{ chapter, verse }`.

- **Verse → page** (on mount, and after every relayout): read
  `document.getElementById("c2v47")`, take `el.getBoundingClientRect().left` minus the
  flow's untranslated left, divide by `(pageW + gutter)`, floor, then round **down** to
  a multiple of `pagesPerSpread`.
- **Page → verse** (after every turn): the first `.book-verse-head` whose computed
  column index is `>= page` — i.e. the first verse that *starts* on this spread; if
  none does (a long commentary spans the whole spread) keep the previous anchor. Call
  `syncBookUrl(chapter, verse)` — a `replaceState`, no React re-render, exactly the
  contract `syncVerseUrl` already uses.

### 2.4 Relayout triggers

Re-measure and re-anchor on: `ResizeObserver` on `.book-viewport`;
`document.fonts.ready`; and a `useEffect` keyed on
`[language, readingScale, font, sections, chapter]`. Each is debounced to one
`requestAnimationFrame`. Because the anchor is a verse, a relayout can never strand
the reader on a page that no longer exists.

### 2.5 Loading

`loadReader(chapter)` is the same call the reader makes, so a reader → Book View jump
is instant (the chapter and its commentary are already resident). While loading, the
book frame is painted empty with the running heads suppressed and a single
`Loading chapter…` line centred in the spread — no skeleton cards.

---

## 3. Navigation

### 3.1 Keyboard

**No new bindings are invented and no existing binding changes meaning.** Book View
reuses the actions already in `src/lib/keys.ts`:

| Key | Existing action | Meaning in Book View |
| --- | --- | --- |
| `J` `↓` | `nextVerse` | Next spread |
| `K` `↑` | `prevVerse` | Previous spread |
| `→` | `nextChapter` | Next chapter (unchanged) |
| `←` | `prevChapter` | Previous chapter (unchanged) |
| `G G` | `firstVerse` | First spread |
| `⇧ G` | `lastVerse` | Last spread |
| `B` | `toggleSave` | Save the anchor verse |
| `Esc` | `escape` | Back to the card reader at the anchor verse |
| `T` `/` `⌘K` `?` `G H` | unchanged | unchanged |

The **only** change to `keys.ts` is adding four physical keys onto the two existing
actions, plus their `SHORTCUTS` rows:

```ts
case " ":
case "PageDown":
  event.preventDefault();
  a.nextVerse();
  break;
case "PageUp":
  event.preventDefault();
  event.shiftKey ? a.prevVerse() : a.prevVerse();
  break;
```

`Space` is already protected by `isTypingTarget`, and `Shift+Space` reaches the
switch because only `alt`/`meta`/`ctrl` are filtered — handle it as `prevVerse` in the
`" "` case when `event.shiftKey`. This also makes Space page the *card* reader, which
is correct behaviour there too.

`→`/`←` deliberately stay on chapters: in a book, the chapter is the larger unit, and
stealing the arrows for pages would make the two readers disagree about what an arrow
means.

### 3.2 Click zones

Two real `<button>`s, `--book-turn-zone: 4rem` wide, full page height, pinned to the
**outer** edge of each page — never over the measure, so text selection and link
clicks are untouched. Transparent; on hover a chevron fades in at `--ink-4` over
`--dur-fast`. Labelled "Previous page" / "Next page", in the tab order, carrying
`aria-keyshortcuts="J PageDown"` / `"K PageUp"`.

### 3.3 Wheel and trackpad

One `wheel` listener on `.book-viewport`, `{ passive: false }`:

- Horizontal intent (`|deltaX| > |deltaY|`): accumulate; turn at ±60 px; then **lock**
  until `|deltaX| < 10` for 200 ms. A single trackpad flick turns exactly one spread.
- Vertical intent: same accumulator, threshold ±120 px (a mouse wheel notch is ~100 px
  and one notch should not turn a page).
- `preventDefault()` only once the gesture is claimed, so a wheel over a scrolling
  sidebar is never swallowed.

### 3.4 Drag

`pointerdown` / `pointermove` / `pointerup` with `setPointerCapture` on the viewport.
A drag is claimed only when the pointer has moved `>8 px` horizontally **and**
`|dx| > 2 * |dy|` — below that it is a text selection and the handler stays out of the
way. Once claimed, `--book-drag` tracks the pointer and the transition is suspended.
On release the turn completes if `|dx| > 12%` of page width **or** velocity
`> 0.5 px/ms`; otherwise it springs back.

### 3.5 The transition

| Property | Value |
| --- | --- |
| Transform | `translate3d(x, 0, 0)` on `.book-flow` only |
| Duration | `--dur-book-turn: 420ms` (new token) |
| Easing | `var(--spring-gentle)` — the existing `linear()` spring |
| Spine | fixed gradient overlay in the gutter, always present |
| Leading edge | `.book-edge-shade` opacity `0 → 0.5 → 0` over the turn, `--dur-book-turn` |

No 3D curl. A real curl needs per-page 3D transforms, which force a repaint of every
glyph on both pages each frame, and it cannot be done without a second copy of the
text. The translate + a moving edge shadow is what actually reads as paper, costs one
composited layer, and is the reason no canvas or WebGL is needed.

### 3.6 `prefers-reduced-motion: reduce`

- `.book-flow { transition: none; }` — the turn is instantaneous.
- The drag handler is **not installed** (a drag is inherently animated motion).
- Wheel and keys still turn pages; they just cut.
- The substitute is a 120 ms `opacity` crossfade on `.book-viewport` (`0.6 → 1`),
  which conveys "something changed" without translation.
- Everything above lives in
  `@media (min-width: 900px) and (prefers-reduced-motion: no-preference)`, matching
  the existing structure at `src/desktop.css:1382`.

---

## 4. Chrome

### 4.1 Sidebar entry

`TABS` in `src/components/TabBar.tsx` drives **both** the phone tab bar and the
sidebar, so Book View must not be added to it. Add a separate constant and append it
to the sidebar list only:

```ts
const BOOK_TAB = { id: "book", label: "Book View", Icon: BookOpen, to: bookTarget() } as const;
const SIDEBAR_TABS = [TABS[0], BOOK_TAB, ...TABS.slice(2).filter((t) => t.id !== "search")];
```

`.app-sidebar` is `display: none` below 900 px, so the entry is structurally
unreachable on a phone — no width check in JS. Placement is directly under **Home**:
it is a reading destination, above the utility rows.

`bookTarget()` resolves, in order: the reader's current `{chapter, verse}` if
`route.name === "verse" | "book"`; else the last position from `src/lib/history.ts`;
else `{ chapter: 1, verse: 1 }`. Opening Book View therefore continues where you were.

`activeTab()` gains `case "book": return "book";`.

### 4.2 Entering and leaving

- **In:** a second round glass control in the reader's trailing nav slot (`BookOpen`,
  `aria-label="Book view"`, `data-tip="Book view"`), rendered only when `useWide()`.
  Navigates to `{ name: "book", chapter, verse }` at the reader's current anchor.
- **Out:** the header's leading item is labelled **"Reader"** (the same contextual
  back-item pattern the reader uses for "Home") and returns to
  `{ name: "verse", chapter, verse: anchor }`. `Esc` does the same via the existing
  `escape` action.
- The bottom `TabBar` is not rendered (the shell already suppresses it in the reader;
  extend that condition to the book route).

### 4.3 Position indicator

Three pieces, all print conventions, all `--ink-3`/`--ink-4`:

- **Verso running head:** `2 · SĀṄKHYA-YOGA` — chapter number and name, `--fs-caption1`,
  `--tr-caps`, top of the left page.
- **Recto running head:** the verse range on the spread, `47–51`, right-aligned.
- **Folios:** bottom **outer** corner of each page, `--fs-caption2`, `--ink-4`; the
  right one also carries the total, `8 / 17`.
- **Progress:** a 2 px hairline across the foot of the whole spread, track
  `var(--separator)`, fill `var(--accent)`, width `(page + perSpread) / pages`.

### 4.4 Shared URLs

`/book/chapter/2/verse/47` restores the **verse**, and §2.3 turns that into whatever
spread that verse falls on in the recipient's window, language, face and scale. Copying
a link from Book View copies the anchor verse. This is the only correct behaviour: a
page number would land a 4K reader and a 1280 px reader in different places.

---

## 5. Route

```ts
export type Route =
  | { name: "home" }
  | { name: "verse"; chapter: number; verse: number }
  | { name: "book"; chapter: number; verse: number }
  | { name: "search"; q: string }
  | { name: "saved" }
  | { name: "settings" };
```

- **URL:** `${BASE}/book/chapter/${chapter}/verse/${verse}`. `/book/chapter/2`
  canonicalises to `…/verse/1` through the existing `boot()` replaceState.
- **`parseLocation`:** `if (segments[0] === "book")` — chapter `Number(segments[2])`,
  guarded by `getChapterMeta` exactly as the reader is (unknown → `home`), verse from
  `segments[4]` through the existing `clampVerse`.
- **`sameScreen`:** extend so two `book` routes in the same chapter are the same
  screen. This is mandatory, and for the reason already documented in `router.tsx`: a
  view transition captures the document inside the update callback, and our page turn
  is our own animation. A page turn must never go through `startViewTransition`.
  Reader ↔ Book View in the same chapter *is* a screen change and keeps the lateral
  crossfade.
- **`syncBookUrl(chapter, verse)`:** a six-line twin of `syncVerseUrl` that builds the
  book path. Deliberately a twin rather than a parameter, so the reader's per-scroll-
  tick hot path is not touched.
- **Below 900 px:** the route stays *parseable* — a shared link must open something —
  but `Screen` renders the ordinary `Reader` and `replace`s the URL to
  `/chapter/n/verse/m` on mount. Unreachable from the UI, never a 404.

---

## 6. Typography and layout

### 6.1 Grid

At `>=1280px` the spread is two pages. At `900–1279px` there is not room for two
34 rem measures beside a sidebar, so the same flow renders **one page per spread** —
identical typography, identical turn logic, `pagesPerSpread: 1`. It is one arithmetic
change, not a second design.

New tokens, defined in the existing nested `:root` at the top of the `900px` block of
`src/desktop.css` (values must be `var()`s or `color-mix()` over existing tokens — the
size checker fails on colour literals outside a token block, and a `:root` nested in a
media query is **not** recognised as one):

| Token | Value | Note |
| --- | --- | --- |
| `--book-page-w` | `min(34rem, (100% - var(--book-gutter)) / 2)` | measure per page, ~66 ch |
| `--book-gutter` | `var(--sp-16)` | the spine; the widest space on the spread |
| `--book-margin-out` | `var(--sp-10)` | outer margin |
| `--book-margin-in` | `var(--sp-12)` | inner margin — wider, as in print |
| `--book-margin-y` | `var(--sp-10)` | head and foot |
| `--book-page-h` | `calc(100dvh - var(--nav-total) - 2 * var(--sp-8))` | fixed, drives the fragmenter |
| `--book-turn-zone` | `4rem` | click zone width |
| `--dur-book-turn` | `420ms` | |
| `--book-spine` | `linear-gradient(…, color-mix(in srgb, var(--ink-1) 8%, transparent), transparent)` | binding shadow |

Reused tokens, nothing new: type `--fs-verse` `--fs-translit` `--fs-trans`
`--fs-comment` `--fs-gloss` `--fs-caption1` `--fs-caption2`; leading `--lh-verse`
`--lh-read` `--lh-body` `--lh-indic`; tracking `--tr-caps` `--tr-body`; weight
`--fw-regular` `--fw-medium`; space `--sp-1…--sp-16`; ink `--ink-1…--ink-4`; surface
`--surface-1` (page face) on `--paper` (desk); `--separator`, `--accent`; elevation
`--el-3` (the book's drop shadow); radius `--r-md` on the two **outer** corners only —
the spine edges are square; motion `--spring-gentle`, `--dur-fast`.

Everything already scales: `--fs-*` reading sizes are `calc(… * var(--reading-scale))`,
and the `[lang]` rules in `index.css` pick `--font-knda` / `--font-telu` /
`--font-deva` and `--lh-indic`. Book View adds no font rules of its own.

### 6.2 Setting

- **Scripture:** centred, never justified.
- **Translation and commentary, `lang="en"`:** `text-align: justify; hyphens: auto;`.
  A justified book without hyphenation is a river of holes.
- **Translation and commentary, `lang="kn"` / `lang="te"`:** `text-align: start;
  hyphens: none`. Kannada and Telugu have no usable hyphenation dictionary, so
  justification would be worse than a ragged edge.
- **No glass, no blur, no `backdrop-filter` anywhere in Book View.** The page is opaque
  paper. This is the whole point of the screen and the one rule not to negotiate.

### 6.3 CSS budget

**1.0 KB gzip** for the entire feature, in `src/desktop.css`. Current desktop CSS is
4.9 / 6.0 KB, so the `desktopCss` gate in `scripts/check-size.mjs` must go to **7 KB**
(4.9 + 1.0 leaves 0.1 KB of headroom at 6, which is not a budget). Nothing goes into
the render-blocking sheet.

---

## 7. Accessibility

### 7.1 The whole chapter is always in the DOM

Off-spread columns are **clipped, not hidden**. No `display: none`, no
`content-visibility`, no virtualisation. Find-in-page, Select-All → Copy, and a screen
reader's virtual cursor all traverse the entire chapter. The cost is that an SR user is
not paginated — accepted deliberately, because a paginated SR experience would be
strictly worse than a continuous one.

The consequence to handle: moving focus (or the SR cursor) into a clipped column makes
the browser scroll `.book-viewport`. Guard it —

```ts
const onScroll = (e: Event) => {
  const el = e.currentTarget as HTMLElement;
  if (!el.scrollLeft) return;
  setPage((p) => snap(p + Math.round(el.scrollLeft / step) * perSpread));
  el.scrollLeft = 0;               // the transform, not scroll, owns position
};
```

— which converts a browser-driven scroll into a real page turn, so the visual and the
SR cursor never disagree.

### 7.2 Focus order

Header back item ("Reader") → **Previous page** → the flow region → **Next page** →
sidebar. The flow is `tabIndex={0}`, `role="region"`,
`aria-label="Chapter 2, Sāṅkhya-yoga, book view"`, so it can be focused and read as a
unit. Focus rings use the existing `.pressable` / `:focus-visible` conventions.

### 7.3 What a screen reader reads

Semantic DOM, unchanged by pagination: one `<article>` per verse; the verse number is a
real `<span id="c2v47">` inside an `<h2 class="sr-only">Verse 47</h2>` so the chapter
has a heading outline and heading navigation works; scripture, transliteration,
translation and commentary are `<p>`s with correct `lang`; word meanings are a `<p>`
with a `<b>` run-in (a run-in list read as a list would be 40 "list item"
announcements).

### 7.4 Live region

One visually hidden `<p aria-live="polite" aria-atomic="true">` outside the flow:

> `Page 8 of 17. Verses 47 to 51.`

Debounced 250 ms so holding `J` announces the destination, not every page crossed.
Nothing else in Book View is a live region.

### 7.5 Keyboard map

See §3.1. Zero collisions with `src/lib/keys.ts`: no key changes meaning, four physical
keys are added onto two existing actions, and both new rows are appended to `SHORTCUTS`
so the `?` sheet documents them.

---

## 8. Non-goals for v1

- **No 3D page curl.** §3.5.
- **No phone or tablet-portrait layout.** Below 900 px the route redirects to the
  reader.
- **No continuous flow across chapters.** Each chapter is its own volume; `→`/`←` step
  chapters, and the last spread of a chapter has an empty recto rather than bleeding
  into chapter 3.
- **No print stylesheet.** Tempting, out of scope.
- **No verse rail, no verse index sheet, no command-palette "go to page".**
- **No in-book search or find-highlighting.** Browser find-in-page works (§7.1); that
  is the v1 answer.
- **No user-adjustable margins, page size or pages-per-spread.** Reading scale already
  changes the density and is the one control.
- **No annotations, highlights, dog-ears, or a "resume where I left off" distinct from
  the existing history.**
- **No bookmark affordance inside the spread** beyond the existing `B` key — a bookmark
  ribbon is a card, and this screen has none.
- **No word-meanings tabs or panes.** Run-in prose only (§1.2).

---

## 9. Implementation plan

1. **`src/lib/router.tsx`** — add the `book` variant to `Route`; a `case "book"` in
   `toPath`; the `segments[0] === "book"` branch in `parseLocation`; extend
   `sameScreen`; add `syncBookUrl`.
2. **`src/lib/keys.ts`** — add `" "` (with the `shiftKey` split), `"PageDown"` and
   `"PageUp"` onto the existing `nextVerse` / `prevVerse` cases; append
   `{ keys: "Space", label: "Next page" }` and `{ keys: "⇧ Space / PgUp", label:
   "Previous page" }` to `SHORTCUTS`.
3. **`src/components/BookView.tsx`** *(new)* — the screen. `export default` so it is
   `React.lazy`-able. Owns: `loadReader`, the flow markup (§1.2), the measure/anchor
   effects (§2.3–2.4), the wheel/drag/click handlers (§3.2–3.4), running heads, folios,
   progress bar, live region. Reads `useSettings()` for `language`, `sections`,
   `readingScale`. Target ≤ 320 lines; if it exceeds that, lift the measurement maths
   into `src/lib/book.ts` — not before.
4. **`src/App.tsx`** —
   `const BookView = lazy(() => import("./components/BookView"))`; a `case "book"` in
   `Screen` that renders `<Suspense fallback>` when `useWide()` and otherwise renders
   `<Reader>` plus a `navigate(…, { replace: true })` to the verse route; extend the
   `inReader` chrome condition to the book route; the header back item ("Reader") and
   the reader's new `BookOpen` trailing button; point `escape` at the reader when
   `route.name === "book"`.
5. **`src/components/TabBar.tsx`** — `BOOK_TAB`, the `SIDEBAR_TABS` splice, and the
   `activeTab` case (§4.1). `TABS` itself is not touched.
6. **`src/desktop.css`** — new tokens in the nested `:root`; the Book View block inside
   `@media (min-width: 900px)`; the two-page override inside the existing
   `@media (min-width: 1280px)`; the turn transition inside
   `@media (min-width: 900px) and (prefers-reduced-motion: no-preference)`. No colour
   literals.
7. **`vite.config.ts`** — set `build.manifest: true` so the size checker can tell an
   initial chunk from a lazy one.
8. **`scripts/check-size.mjs`** — **required, or the build fails.** The `js` row sums
   *every* emitted `.js`, so a lazily-loaded chunk still counts against the 82 KB gate,
   which has 0.1 KB of headroom. Read `.vite/manifest.json`, walk the entry's `imports`
   transitively to get the initial set, keep that against `js: 82 KB`, and add a
   `lazyJs` row budgeted at 12 KB. Raise `desktopCss` to 7 KB (§6.3).
9. **`docs/ARCHITECTURE_PLAN.md` §6.5** — record the new `lazy JS` row and the raised
   desktop CSS row, with the reason.
10. **`docs/DESIGN_PLAN.md` §4** — add `4.8 Book View` pointing at this file.

---

## 10. Verification

Run `npm run build && node scripts/check-size.mjs` first; then in a browser:

1. **Reachability.** At 1440 px the sidebar shows Book View under Home. Narrow to
   880 px: the sidebar is gone and the phone tab bar has four items, not five.
2. **Continuity.** Chapter 2 at 1440 px: a translation paragraph visibly starts on the
   verso and finishes on the recto. No card, border, or panel anywhere on the spread.
3. **Break rules.** Page through all of chapter 2 and confirm no sloka is ever split
   across the gutter or a turn, and no verse number is ever orphaned at a column foot.
4. **Anchor round-trip.** Open `/book/chapter/2/verse/47`; the spread containing 47 is
   shown. Turn three pages; the URL follows. Reload — the same spread.
5. **Relayout.** On a mid-chapter spread, press `+` reading size three times, then
   switch language to ಕನ್ನಡ, then resize the window from 1440 → 1000 → 1440. The anchor
   verse stays on screen every time and the folio total changes.
6. **Font race.** Hard-reload with the cache disabled and throttled to Slow 3G. When
   the Indic face swaps in, the page count changes and the anchor verse is still shown.
7. **Sections.** Turn off Commentary and Words in Settings; the flow reflows and both
   are gone from the spread, with no empty space where they were.
8. **Turn interactions.** `J`/`K`, `Space`/`⇧Space`, `PageDown`/`PageUp`, the two outer
   click zones, a trackpad two-finger flick (exactly one spread), a mouse wheel notch
   (no turn) and two notches (one turn), and a pointer drag that springs back below
   12 % and completes above it.
9. **Chapters.** `→` from chapter 2 lands on chapter 3 spread 1 with the opener on the
   verso; `←` from chapter 1 does nothing.
10. **Reduced motion.** Enable it in OS settings: turns cut with a short crossfade, a
    drag does nothing, and no `transform` transition appears in DevTools' Animations
    panel.
11. **Selection.** Select a sentence spanning the gutter and copy it — the text is
    contiguous and correctly ordered. `⌘F` finds a word on spread 12 while spread 1 is
    displayed, and the view turns to it rather than scrolling.
12. **Screen reader.** VoiceOver: `VO+U` heading list shows every verse in the chapter;
    turning a page announces `Page 8 of 17. Verses 47 to 51.` once, not per page when
    `J` is held.
13. **Focus.** Tab from the header: Reader → Previous page → flow region → Next page →
    sidebar, with a visible ring at each stop.
14. **Theme and palette.** Toggle dark/light and each of the four palettes; the page
    face, spine shadow and progress fill all follow. `node scripts/check-size.mjs`
    reports zero colour literals.
15. **No regression.** The card reader at `/chapter/2/verse/47` is unchanged, and a
    phone-width window renders exactly as before.
