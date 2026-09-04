# Bhagavad-Geeta — Design Plan

Scope: visual and interaction design only. Caching, bundle size, code splitting and data
loading are owned elsewhere and are deliberately not discussed.

Target fidelity: iOS 18/26-era native reading app, installed to Home Screen, that degrades
gracefully to Android Chrome and desktop.

Files this plan touches: `src/index.css`, `src/App.tsx`, `src/components/Header.tsx`,
`src/components/ChapterList.tsx`, `src/components/VerseViewer.tsx`, `index.html`,
`vite.config.ts` (manifest block only), plus new components named in §4.

---

## 1. Honest critique of the current design

The app currently looks like a 2021 SaaS landing page that happens to contain scripture. The
problem is not polish — several things are well executed — it is that the visual language is
borrowed from a category that has nothing to do with reading a sacred text. Specific faults,
by selector:

### 1.1 The accent is a generic gradient, and it is everywhere

`--accent-gradient: linear-gradient(135deg, #fe5196 0%, #f77062 100%)` (`index.css:9`) is the
hot-pink→coral pairing shipped in every free UI kit since 2019. It carries no meaning here.
Worse, it is applied to six unrelated things: `.home-title:212`, `.text-gradient:67` (used by
`.header-title`), `.header-icon-wrapper:251`, `.chapter-badge:329`, and via
`--accent-color` to `.chapter-meaning:352`, `.verse-text:411` and the `border-left` of
`.verse-section-card:432`. When everything is the accent, nothing is.

The single worst instance is `.verse-text { color: var(--accent-color) }` (`index.css:411`).
The Devanagari/Kannada/Telugu scripture — the reason the app exists — is rendered in
`#f77062` coral at `font-weight: 600`. That fails contrast on the light background
(approx. 3.0:1 against `#fdfbfb`, below the 4.5:1 body-text floor), it makes the primary
content read as a decorative callout rather than as text, and coral is a colour with no
relationship to the material. Sacred text should be the highest-contrast, most neutral,
most typographically authoritative element on the screen. Right now it is styled like a
promotional pull-quote.

`.chapter-badge` (`index.css:328`) applies the same gradient to a pill that says
"Chapter 1" — pure decoration on a label that only needs to be legible.

### 1.2 Glassmorphism is applied structurally, not selectively

`.glass-panel`, `.glass-card`, `.glass-button` (`index.css:75, 103, 122`) all set
`backdrop-filter: blur(12px|10px|8px)`. Apple uses materials for *floating chrome over
content* — nav bars, tab bars, sheets, popovers. It never uses them for the content
substrate itself. Here `.glass-panel` is the container that holds the verse
(`VerseViewer.tsx`, `.verse-viewer-panel:387`) and `.glass-card` is every chapter tile.
So blur is applied to 18 grid items at once on the home screen, over a `background-attachment:
fixed` gradient (`index.css:39`) that never moves. The blur therefore composites a lot of
work per frame to produce no visual information — nothing is actually behind those cards.

Two concrete consequences:

- On iOS Safari, `backdrop-filter` combined with `background-attachment: fixed` forces
  repaint of the fixed layer during momentum scroll. This is the single most likely source
  of scroll jank in the app.
- The `.glass-panel::before` sheen sweep (`index.css:86–101`) animates `left` from `-100%`
  to `200%` on hover. Animating `left` is a layout-triggering property, and the effect is a
  glossy-web-button cliché. On touch devices `:hover` is emulated on tap, so the sheen fires
  spuriously after a tap on the header and on the verse panel.

Delete the sheen entirely. Restrict material to header, tab bar and sheets.

### 1.3 There is no type scale — sizes are ad hoc

Counted from `index.css`, the distinct font sizes in use are:
`2.5rem, 1.5rem, 1.25rem, 1.2rem, 1.15rem, 1.1rem, 1rem, 0.95rem, 0.9rem, 0.85rem`.
That is ten sizes, several of them one twentieth of a rem apart
(`.verse-section-content: 1.15rem` at `:449` vs `.commentary .verse-section-content: 1.1rem`
at `:455` vs `.verse-transliteration: 1.1rem` at `:421`). A 0.05rem difference is invisible
to the reader and expensive to maintain. There is no modular relationship between any two of
them and no named tokens — every size is a magic number at its use site.

`.home-title { font-size: 2.5rem }` (`index.css:210`) is fixed: it does not shrink on a
375px viewport, so "Bhagavad-Geeta" at 40px in `Outfit` 600 sits uncomfortably close to the
gutters.

### 1.4 "Outfit" is the wrong typeface, and the other two scripts have no font at all

`@import url(".../Outfit:wght@300;400;500;600;700")` (`index.css:1`) then
`font-family: "Outfit", sans-serif` on `body` (`index.css:37`).

- Outfit is a geometric display sans. It has near-circular bowls and a large x-height
  optimised for headlines, not for sustained reading of long commentary paragraphs.
- Outfit contains **no Devanagari, no Kannada and no Telugu glyphs**. The `sans-serif`
  fallback means the entire scriptural payload — `verse.text`, `text_kannada`,
  `text_telugu`, and the Kannada/Telugu translations and commentary rendered by
  `VerseViewer.tsx` — falls through to whatever the OS picks. On iOS that is Devanagari
  Sangam MN / Kannada Sangam MN / Telugu Sangam MN; on Android, Noto; on Windows, Nirmala
  UI. The app has no control over the appearance of its own primary content, and the three
  scripts have wildly different vertical metrics from Outfit, so line-height inherited from
  Latin rules produces clipped superscript vowel signs in Devanagari and Telugu.
- The `@import` at the top of the CSS file is also a render-blocking, non-preloadable
  request, and there is no `font-display` control beyond the URL's `&display=swap`.

### 1.5 Spacing has no rhythm

Values in use: `0.25rem, 0.25rem, 1rem, 1.5rem, 2rem, 3rem, 4rem` mixed with pixel values
`4px 12px, 6px 12px, 8px, 10px, 10px 20px, 12px`. `.verse-viewer-panel` uses
`padding: 3rem 2rem !important` (`index.css:388`) with a comment admitting it is fighting
`.glass-panel`. `.app-main { padding: 0 1rem }` (`:197`) and then
`.chapter-list-container { padding: 2rem 1rem }` (`:300`) and
`.verse-viewer-container { padding: 2rem 1rem }` (`:379`) each add another 1rem, so real
content inset is 32px on mobile — too much on a 375px screen where every horizontal pixel
of measure matters for Devanagari.

`.app-main { padding-bottom: 4rem }` is an arbitrary guess that will be wrong once a tab bar
exists.

### 1.6 Touch targets are below 44pt, and several are not targets at all

- `.language-select` (`index.css:281`) is a bare `<select>` inside a `.language-switcher`
  with `padding: 6px 12px`. Total height lands around 30px. iOS HIG minimum is 44pt.
  A native `<select>` also cannot be styled and renders as an iOS wheel picker — acceptable
  as a mechanism, but it is the wrong *pattern* for a three-item, high-frequency choice.
- `.theme-toggle { padding: 10px }` (`:292`) around a 20px icon gives 40px. Just under.
- `.glass-button { padding: 10px 20px; font-size: 1rem }` (`:122`) gives roughly 41px tall.
  Just under.
- `.chapter-card` is a `<button>` with `padding: 1.5rem` — fine on size, but it has no
  `:active` state and no `-webkit-tap-highlight-color: transparent`, so iOS paints its
  default grey flash over the card on tap. That single default is the loudest "this is a
  website" signal in the app.

### 1.7 Dark theme is a different app, not a dark version of this one

`[data-theme="dark"] { --bg-gradient: linear-gradient(135deg, #0f2027, #203a43 50%, #2c5364) }`
(`index.css:20`) is a saturated teal-to-slate gradient. Light mode is a neutral
off-white-to-grey (`:5`). These are not the same design in two appearances; they are two
different visual identities. A reading app's dark mode must be *quiet* — near-neutral,
low-chroma, so the text is the only thing with presence. A blue-teal gradient behind
paragraphs of commentary tints the perceived colour of the text and causes eye strain in
exactly the low-light condition dark mode exists to serve.

`--text-primary: #ffffff` in dark (`:21`) is also wrong: pure white on a dark ground blooms
and increases halation. Use ~`#F2F2F7`-class values.

`--accent-color` is explicitly kept identical across themes (`:23`, with the comment "Kept
vivid for contrast"). Coral on the dark teal is worse, not better.

### 1.8 Motion is web-idiom, not iOS-idiom

- `--transition-speed: 0.3s` (`:15`) is applied uniformly to `all` on three selectors
  (`:110, :138`, and `body:44`). `transition: all` on `body` including `background-image`
  means the theme toggle tries to interpolate two gradients — which browsers cannot do, so
  it hard-cuts. The theme switch has no animation at all despite the code implying one.
- Every timing function is `ease`, `ease-out`, or `cubic-bezier(0.25, 0.8, 0.25, 1)`
  (Material's standard curve). None of these are iOS. iOS motion is spring-derived: fast
  attack, gentle settle, and — critically — 0.2–0.4s not 0.3s-for-everything.
- `.glass-card:hover { transform: translateY(-4px) }` (`:115`) is a mouse affordance shipped
  to a touch-first PWA, where it fires on tap and sticks until the next tap elsewhere.
- `.animate-fade-in` with `.delay-100/200/300` (`:164–176`) staggers by *column position*
  (`ChapterList.tsx`: `delay-${(index % 3) * 100}`), so on a one-column mobile layout the
  stagger is 0, 100, 200, 0, 100, 200 — visually random. And because `App.tsx` re-renders
  the whole home block on every nav, the entrance animation replays on every back-navigation.
- No `prefers-reduced-motion` block exists anywhere in the file.

### 1.9 Architectural gaps that are design problems

- `App.tsx` has no router. `selectedChapterId`/`selectedVerseId` are React state, so the
  Android hardware back button and the iOS edge-swipe-back gesture exit the PWA instead of
  going back a level. That is the most damaging single defect for "feels native".
- `App.tsx:54–63` `handleSelectChapter` jumps straight from the chapter grid to verse 1.
  There is no chapter-detail screen, so the reader never sees a verse index and cannot
  resume mid-chapter.
- `handleNextVerse`/`handlePrevVerse` (`:65–77`) call `window.scrollTo({behavior:"smooth"})`
  after a state change. The user sees the new verse's *bottom* for ~300ms while the page
  scrolls up to it. Verse changes must be instant-top, with the transition carrying the
  continuity instead.
- `VerseViewer.tsx` sets `style={{ opacity: hasNext ? 1 : 0.5 }}` inline on the Prev/Next
  buttons in addition to the `disabled` attribute — disabled styling belongs in CSS.
- `index.html` has `<meta name="theme-color" content="#ffffff">` hardcoded and no
  `apple-mobile-web-app-*` meta, no `viewport-fit=cover`. In standalone mode the status bar
  region will be unstyled white in dark mode.
- `vite.config.ts` manifest sets `theme_color`/`background_color` to `#ffffff`, so the PWA
  splash flashes white before a dark-themed app.

---

## 2. Design system

### 2.1 Design direction

**Palette concept: ink, paper, and a single saffron.** Paper is a warm near-white; ink is a
warm near-black. One accent — a deep saffron/marigold — used sparingly for the active tab,
the bookmark fill, and the selected verse marker. Nothing else is coloured. The scripture
itself is ink, at the highest contrast on the screen.

Saffron is chosen because it is the colour actually associated with the material, and
because at the specified values it passes 4.5:1 on both grounds, which the current coral
does not.

### 2.2 Typography: font stacks per script

Four faces, each doing one job. All loaded self-hosted or via Google Fonts with explicit
`unicode-range` so a Latin-only screen never downloads Kannada.

| Role | Family | Why |
| --- | --- | --- |
| UI / Latin chrome | `-apple-system` → `SF Pro` on Apple, `Inter var` elsewhere | Native metric match; UI must look like the OS, not like a brand |
| Latin reading (translation, commentary, transliteration) | **Literata** (Google Fonts, variable 200–900 + italic) | Designed by TypeTogether for Google Play Books; a screen-first text serif with real italics for the transliteration, and it carries the full Latin Extended + combining diacritics IAST needs (ā ī ū ṛ ṝ ḷ ṃ ḥ ṅ ñ ṭ ḍ ṇ ś ṣ) |
| Devanagari scripture | **Adishila** or **Noto Serif Devanagari** (Google Fonts, variable wght) | Serif Devanagari with proper shirorekha weight; matches Literata's colour on the page. Noto Serif Devanagari is the safe default — it is complete, variable, and hinted |
| Kannada | **Noto Serif Kannada** (Google Fonts, variable wght 100–900) | Complete conjunct coverage; the serif cut sits with Literata. `Baloo Tamma 2` is the sans alternative if a lighter feel is wanted |
| Telugu | **Noto Serif Telugu** (Google Fonts, variable wght 100–900) | Same rationale; correct vertical extents for the stacked vowel signs |

**Loading.** Remove the `@import` on `index.css:1`. In `index.html` `<head>`, before the
stylesheet:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,300..700;1,7..72,300..600&display=swap"
/>
```

The three Indic faces are loaded *conditionally* by `<link>` injected when the language is
selected, or — simpler and preferred — declared as separate stylesheet links with
`media="print" onload="this.media='all'"` so they never block first paint:

```html
<link rel="stylesheet" media="print" onload="this.media='all'"
  href="https://fonts.googleapis.com/css2?family=Noto+Serif+Devanagari:wght@400..700&display=swap" />
<link rel="stylesheet" media="print" onload="this.media='all'"
  href="https://fonts.googleapis.com/css2?family=Noto+Serif+Kannada:wght@400..700&display=swap" />
<link rel="stylesheet" media="print" onload="this.media='all'"
  href="https://fonts.googleapis.com/css2?family=Noto+Serif+Telugu:wght@400..700&display=swap" />
```

Devanagari always loads (the Sanskrit `verse.text` is always present); Kannada and Telugu
can be gated on `language`.

**Per-script line-height is mandatory.** Indic scripts stack marks above and below the
baseline. A `line-height` that is comfortable for Latin clips them. Apply
`--lh-indic: 1.9` to any element rendering Devanagari/Kannada/Telugu, versus `--lh-body: 1.65`
for Latin. Set it via a `[lang]` attribute selector — and set `lang` on the elements in
`VerseViewer.tsx` (`lang="sa"`, `lang="kn"`, `lang="te"`) which is also the correct thing
to do for screen readers and hyphenation.

### 2.3 Token set — paste this over the top of `src/index.css`

```css
:root {
  /* ---------- Font stacks ---------- */
  --font-ui:
    -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text",
    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-read:
    "Literata", ui-serif, Georgia, "Times New Roman", serif;
  --font-deva:
    "Noto Serif Devanagari", "Devanagari Sangam MN", "Nirmala UI", serif;
  --font-knda:
    "Noto Serif Kannada", "Kannada Sangam MN", "Nirmala UI", serif;
  --font-telu:
    "Noto Serif Telugu", "Telugu Sangam MN", "Nirmala UI", serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

  /* ---------- Type scale (major-third-ish, capped, iOS-named) ---------- */
  /* Base is 17px = iOS body. All sizes are rem off a 16px root.          */
  --fs-caption2: 0.6875rem; /* 11px */
  --fs-caption1: 0.75rem;   /* 12px */
  --fs-footnote: 0.8125rem; /* 13px */
  --fs-subhead:  0.9375rem; /* 15px */
  --fs-callout:  1rem;      /* 16px */
  --fs-body:     1.0625rem; /* 17px  <- default reading size */
  --fs-headline: 1.0625rem; /* 17px semibold */
  --fs-title3:   1.25rem;   /* 20px */
  --fs-title2:   1.375rem;  /* 22px */
  --fs-title1:   1.75rem;   /* 28px */
  --fs-large:    2.125rem;  /* 34px  <- iOS large title */

  /* Scripture is its own ramp, driven by the reading-size control (§3.10) */
  --reading-scale: 1;                                  /* 0.85 … 1.35 */
  --fs-verse:   calc(1.5rem   * var(--reading-scale)); /* 24px @ 1.0 */
  --fs-translit: calc(1.0625rem * var(--reading-scale));
  --fs-trans:   calc(1.125rem * var(--reading-scale)); /* 18px @ 1.0 */
  --fs-comment: calc(1.0625rem * var(--reading-scale));

  /* ---------- Line heights ---------- */
  --lh-tight: 1.2;
  --lh-snug: 1.35;
  --lh-body: 1.65;
  --lh-read: 1.72;
  --lh-indic: 1.95;   /* required: marks above + below baseline */
  --lh-verse: 2.05;   /* scripture, generous */

  /* ---------- Tracking ---------- */
  --tr-large: -0.022em;
  --tr-title: -0.015em;
  --tr-body: -0.005em;
  --tr-caps: 0.06em;

  /* ---------- Weights ---------- */
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;

  /* ---------- Spacing (4px base, iOS rhythm) ---------- */
  --sp-0: 0;
  --sp-1: 0.25rem;  /* 4  */
  --sp-2: 0.5rem;   /* 8  */
  --sp-3: 0.75rem;  /* 12 */
  --sp-4: 1rem;     /* 16 <- standard iOS margin */
  --sp-5: 1.25rem;  /* 20 */
  --sp-6: 1.5rem;   /* 24 */
  --sp-8: 2rem;     /* 32 */
  --sp-10: 2.5rem;  /* 40 */
  --sp-12: 3rem;    /* 48 */
  --sp-16: 4rem;    /* 64 */
  --gutter: var(--sp-4);
  --measure: 34rem; /* ~66ch of Literata at 17px */

  /* ---------- Radii ---------- */
  --r-xs: 6px;
  --r-sm: 10px;
  --r-md: 14px;   /* iOS grouped-list cell */
  --r-lg: 20px;   /* cards */
  --r-xl: 28px;   /* sheets */
  --r-pill: 999px;

  /* ---------- Hit targets ---------- */
  --tap-min: 44px;
  --tap-comfortable: 48px;

  /* ---------- Motion ---------- */
  --ease-out-ios: cubic-bezier(0.25, 0.1, 0.25, 1);
  --ease-in-out-ios: cubic-bezier(0.42, 0, 0.58, 1);
  --spring-gentle: linear(
    0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%,
    0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%, 1.015 60%, 1.006 80%, 1
  );
  --spring-snappy: linear(
    0, 0.045, 0.19 6%, 0.62 15%, 0.86 22%, 0.98 28%, 1.04 34%, 1.05 42%, 1.01 60%, 1
  );
  --dur-instant: 100ms;
  --dur-fast: 180ms;
  --dur-base: 280ms;
  --dur-slow: 400ms;
  --dur-sheet: 480ms;

  /* ---------- Light appearance ---------- */
  color-scheme: light;

  --paper:        #FBF9F5;  /* app background — warm, not white */
  --surface-1:    #FFFFFF;  /* cards, list cells */
  --surface-2:    #F3F0EA;  /* recessed wells, commentary block */
  --surface-3:    #E8E4DB;  /* dividers-as-blocks, skeletons */
  --separator:    rgba(60, 50, 35, 0.14);
  --separator-opaque: #E3DED3;

  --ink-1:        #1C1A17;  /* primary text, scripture */
  --ink-2:        #55504A;  /* secondary */
  --ink-3:        #8A8379;  /* tertiary, captions */
  --ink-4:        #B6AEA2;  /* quaternary, disabled */

  --accent:       #B5651D;  /* saffron/marigold, 4.9:1 on --paper */
  --accent-hi:    #D4832E;  /* hover / large-text only */
  --accent-soft:  rgba(181, 101, 29, 0.10);
  --accent-line:  rgba(181, 101, 29, 0.28);
  --on-accent:    #FFFFFF;

  --danger:       #C0392B;
  --success:      #2E7D52;

  /* Materials — reserved for floating chrome ONLY */
  --mat-chrome:   rgba(251, 249, 245, 0.72);
  --mat-blur:     saturate(180%) blur(20px);
  --mat-border:   rgba(60, 50, 35, 0.08);

  /* Elevation — soft, warm-tinted, never black */
  --el-0: none;
  --el-1: 0 1px 2px rgba(50, 40, 25, 0.05);
  --el-2: 0 2px 6px rgba(50, 40, 25, 0.06), 0 1px 2px rgba(50, 40, 25, 0.04);
  --el-3: 0 8px 24px rgba(50, 40, 25, 0.09), 0 2px 6px rgba(50, 40, 25, 0.05);
  --el-sheet: 0 -8px 40px rgba(30, 24, 14, 0.16);

  /* Safe areas — always read through these, never env() at use site */
  --sa-top: env(safe-area-inset-top, 0px);
  --sa-right: env(safe-area-inset-right, 0px);
  --sa-bottom: env(safe-area-inset-bottom, 0px);
  --sa-left: env(safe-area-inset-left, 0px);

  --nav-h: 44px;   /* iOS nav bar */
  --tab-h: 49px;   /* iOS tab bar */
  --large-title-h: 52px;
}

[data-theme="dark"] {
  color-scheme: dark;

  --paper:        #131211;
  --surface-1:    #1D1B19;
  --surface-2:    #242220;
  --surface-3:    #2E2B28;
  --separator:    rgba(255, 248, 235, 0.12);
  --separator-opaque: #33302C;

  --ink-1:        #F2EFE9;  /* not #fff — avoids halation */
  --ink-2:        #B9B3AA;
  --ink-3:        #857F76;
  --ink-4:        #5A554E;

  --accent:       #E3A24A;  /* lifted + desaturated for dark, 8.1:1 on --paper */
  --accent-hi:    #F0B463;
  --accent-soft:  rgba(227, 162, 74, 0.14);
  --accent-line:  rgba(227, 162, 74, 0.32);
  --on-accent:    #1A1613;

  --danger:       #E2685A;
  --success:      #5BB98B;

  --mat-chrome:   rgba(19, 18, 17, 0.72);
  --mat-border:   rgba(255, 248, 235, 0.10);

  --el-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --el-2: 0 2px 8px rgba(0, 0, 0, 0.45);
  --el-3: 0 8px 28px rgba(0, 0, 0, 0.55);
  --el-sheet: 0 -8px 40px rgba(0, 0, 0, 0.6);
}
```

### 2.4 Base rules that replace the current globals

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

html {
  -webkit-text-size-adjust: 100%;      /* stop iOS auto-inflating text in landscape */
  overscroll-behavior-y: none;         /* kill Chrome pull-to-refresh in standalone */
}

body {
  font-family: var(--font-ui);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  letter-spacing: var(--tr-body);
  background: var(--paper);            /* flat colour, NOT a gradient */
  color: var(--ink-1);
  min-height: 100dvh;                  /* dvh, not vh — iOS URL-bar collapse */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-synthesis-weight: none;
}

/* No tap flash, anywhere. This one line does the most for native feel. */
* { -webkit-tap-highlight-color: transparent; }

button, a, [role="button"] {
  -webkit-touch-callout: none;
  touch-action: manipulation;          /* removes the 300ms dbl-tap-zoom delay */
  user-select: none;
}

/* Text the user should be able to select and share stays selectable */
.verse-text, .verse-translit, .verse-translation, .verse-commentary {
  user-select: text;
  -webkit-user-select: text;
  -webkit-touch-callout: default;
}

/* Per-script typography, driven by lang attributes set in VerseViewer */
:lang(sa), [lang="hi"], .script-deva {
  font-family: var(--font-deva);
  line-height: var(--lh-indic);
  font-feature-settings: "kern" 1;
}
:lang(kn), .script-knda { font-family: var(--font-knda); line-height: var(--lh-indic); }
:lang(te), .script-telu { font-family: var(--font-telu); line-height: var(--lh-indic); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

@media (prefers-contrast: more) {
  :root { --ink-2: #3A362F; --ink-3: #5A554C; --separator: rgba(60,50,35,0.30); }
  [data-theme="dark"] { --ink-2: #D8D2C8; --ink-3: #A9A296; }
}
```

Delete outright: `--bg-gradient`, `--accent-gradient`, `--glass-*`, `--card-hover-translate`,
`--transition-speed`, `.text-gradient`, `.glass-panel::before`, `.glass-panel:hover::before`,
`.delay-100/200/300`, and `background-attachment: fixed`.

---

## 3. Native-iOS-fidelity specification

### 3.1 `index.html` head

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
<meta name="theme-color" content="#FBF9F5" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#131211" media="(prefers-color-scheme: dark)" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Gita" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

`viewport-fit=cover` is what makes `env(safe-area-inset-*)` return non-zero. Without it the
whole safe-area system is inert. `user-scalable=no` is acceptable here *only because* §3.10
provides an in-app reading-size control that scales text; without that control it would be
an accessibility failure — implement them together.

Also update `vite.config.ts` manifest: `theme_color: "#FBF9F5"`,
`background_color: "#FBF9F5"`, and add `"orientation": "portrait-primary"`,
`"display_override": ["standalone", "minimal-ui"]`, `"categories": ["books", "education"]`.
Splash flash is the only thing this changes visually, but it is the first frame of the app.

### 3.2 Standalone-mode detection

```css
@media (display-mode: standalone) {
  body { overscroll-behavior: none; }
  .install-prompt { display: none; }
}
```

In `App.tsx`, expose it as a class on `<html>` so components can branch:
`window.matchMedia("(display-mode: standalone)").matches`.

### 3.3 Layout shell and safe areas

Replace the current `#root { display: flex; flex-direction: column }` +
`.app-main { padding-bottom: 4rem }` with an explicit three-band shell:

```css
#root {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.app-nav {                                  /* replaces .header-container */
  position: sticky;
  top: 0;
  z-index: 100;
  padding-top: var(--sa-top);
  padding-left: max(var(--gutter), var(--sa-left));
  padding-right: max(var(--gutter), var(--sa-right));
  background: var(--mat-chrome);
  -webkit-backdrop-filter: var(--mat-blur);
  backdrop-filter: var(--mat-blur);
  border-bottom: 0.5px solid var(--mat-border);   /* hairline, iOS-style */
  transition: border-color var(--dur-fast) var(--ease-out-ios);
}
.app-nav[data-scrolled="false"] { border-bottom-color: transparent; }

.app-main {
  padding-left: max(var(--gutter), var(--sa-left));
  padding-right: max(var(--gutter), var(--sa-right));
  /* content clears the tab bar; no magic 4rem */
  padding-bottom: calc(var(--tab-h) + var(--sa-bottom) + var(--sp-6));
}

.app-tabbar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 100;
  height: calc(var(--tab-h) + var(--sa-bottom));
  padding-bottom: var(--sa-bottom);
  background: var(--mat-chrome);
  -webkit-backdrop-filter: var(--mat-blur);
  backdrop-filter: var(--mat-blur);
  border-top: 0.5px solid var(--mat-border);
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}
```

Note `max(var(--gutter), var(--sa-left))` — in landscape on a notched iPhone the safe inset
exceeds the gutter and must win; in portrait the gutter wins. This is the correct pattern
and should be used everywhere rather than adding the two together.

### 3.4 Bottom tab bar (new navigation pattern)

Four tabs. This replaces the current single-header-with-a-logo-that-goes-home model, which
gives the user exactly one navigation affordance.

| Tab | Icon (lucide) | Destination |
| --- | --- | --- |
| Read | `BookOpen` | Chapter list → chapter detail → verse reader |
| Search | `Search` | Search screen |
| Saved | `Bookmark` | Bookmarks + continue reading |
| Settings | `Settings2` | Language, theme, reading size |

Tab item anatomy: 24px icon, 4px gap, 10px SF-style label, whole item `min-height: 49px`
and full column width so the tap target is ~90×49 — well over 44pt. Active tab uses
`--accent` for both icon and label; inactive uses `--ink-3`. Tapping the already-active tab
scrolls that tab's scroll view to top (native behaviour worth replicating). Tapping the
already-active **Read** tab while inside a verse pops back to the chapter list.

On viewports ≥ 900px the tab bar moves to a fixed left sidebar 260px wide, and `.app-main`
gets `margin-left: 260px` and its bottom padding drops back to `--sp-8`.

### 3.5 Large-title collapse

The Read tab's chapter list uses the iOS large-title pattern. Implement with an
`IntersectionObserver` on a zero-height sentinel placed directly under the large title, not
with a scroll listener:

- Scroll offset 0 → nav bar is transparent, no hairline; a 34px `--fs-large` title
  "Bhagavad Gita" sits in the content flow below it.
- Sentinel leaves the viewport → nav bar gains `--mat-chrome` + hairline, and an inline
  17px semibold title cross-fades in over `--dur-fast` with `var(--ease-out-ios)`, sliding
  up 8px.

```css
.nav-inline-title {
  opacity: 0; transform: translateY(8px);
  transition: opacity var(--dur-fast) var(--ease-out-ios),
              transform var(--dur-fast) var(--ease-out-ios);
}
.app-nav[data-scrolled="true"] .nav-inline-title { opacity: 1; transform: none; }
```

Do not attempt the iOS rubber-band title stretch on over-scroll; it is not reproducible in
a browser and a bad approximation reads worse than none.

### 3.6 Sheets and modals

Every secondary surface is a bottom sheet, never a centred web modal. Used for: language
picker, reading-size control, verse actions (share / bookmark / copy).

Anatomy: `--r-xl` top corners only, a 36×5px `--ink-4` grabber at 8px from the top, a 56px
title row with a right-aligned "Done", content, then
`padding-bottom: calc(var(--sa-bottom) + var(--sp-4))`.

Presentation: sheet translates from `translateY(100%)` to `0` over `--dur-sheet` with
`--spring-gentle`; a scrim fades `0 → 0.4` opacity `rgba(0,0,0,1)` over `--dur-base`.
Dismiss: tap scrim, tap Done, swipe down past 40% of sheet height or with velocity
> 0.5px/ms. Track the drag with `pointermove` and `transform: translateY()`; on release
either spring back to 0 or continue out. Use `detents`-like behaviour only if a sheet needs
two heights — for these three sheets, one detent (`max-height: 60dvh`) is enough.

Use `<dialog>` with `showModal()` for focus trapping and Esc handling, and style the
`::backdrop`. This gets keyboard/desktop correctness free.

### 3.7 Scroll, overscroll, momentum

```css
.scroll-region {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;   /* sheet scroll never chains to the page */
  scrollbar-width: none;
}
.scroll-region::-webkit-scrollbar { display: none; }

html { scroll-behavior: auto; }   /* NOT smooth globally */
```

Replace the `window.scrollTo({ behavior: "smooth" })` calls in `App.tsx:68` and `:75` with
an instant `window.scrollTo(0, 0)` performed *in the same frame as the verse change*, so
the new verse's transition plays from the top. Smooth-scrolling to top after a content swap
is the current bug and it is very visible.

Keep the current `::-webkit-scrollbar` styling (`index.css:179–194`) for desktop only, under
`@media (hover: hover) and (pointer: fine)`.

### 3.8 Springs and pressed states

```css
.pressable {
  transition: transform var(--dur-instant) var(--ease-out-ios),
              background-color var(--dur-instant) linear,
              opacity var(--dur-instant) linear;
}
.pressable:active { transform: scale(0.97); background-color: var(--surface-2); }

/* Restore hover only where a real cursor exists */
@media (hover: hover) and (pointer: fine) {
  .pressable:hover { background-color: var(--surface-2); }
}

.pressable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
```

`scale(0.97)` at 100ms with settle on release is the iOS cell-press feel. Larger cards
(chapter cards) use `scale(0.985)` — the same absolute movement, so the perceived press is
consistent across sizes.

All `.glass-card:hover { transform: translateY(-4px) }` rules go away. `:hover` is gated
behind the media query above throughout.

Haptics: on tab change, bookmark toggle and sheet-dismiss commit, call
`navigator.vibrate?.(10)`. iOS Safari ignores it; Android honours it. Harmless, and it is
the only haptic channel a PWA has.

### 3.9 Touch targets

Every interactive element gets `min-height: var(--tap-min); min-width: var(--tap-min)`.
Where the visual affordance must be smaller than 44pt (e.g. a 28px icon button), keep the
visual small and expand the target with padding, or with a `::after` overlay:

```css
.icon-button { position: relative; }
.icon-button::after {
  content: ""; position: absolute; inset: 50% 50%;
  width: var(--tap-min); height: var(--tap-min);
  transform: translate(-50%, -50%);
}
```

Specific fixes: `.theme-toggle` padding 10px → 12px; `.glass-button`'s successor gets
`min-height: 44px`; the `<select>` disappears entirely (replaced by a sheet).

### 3.10 Reading-size control (dynamic type)

iOS apps respect Dynamic Type; a PWA cannot read the OS setting, so ship an explicit control
in Settings and in the reader's action sheet. Five steps, mapped to `--reading-scale`:

| Step | Scale | Verse px | Translation px |
| --- | --- | --- | --- |
| XS | 0.85 | 20 | 15 |
| S | 0.925 | 22 | 17 |
| M (default) | 1.0 | 24 | 18 |
| L | 1.15 | 28 | 21 |
| XL | 1.35 | 32 | 24 |

Set on `document.documentElement.style.setProperty("--reading-scale", v)` and persist to
`localStorage` under `gita-reading-scale`, matching the existing `gita-theme`/`gita-language`
convention in `App.tsx`. Only the four scripture-related sizes reference `--reading-scale`;
UI chrome stays fixed so the layout never breaks.

Present it as a segmented control (`Aa` small → `Aa` large) plus a live preview line of the
current verse. Changing size animates `font-size` over `--dur-fast`.

### 3.11 Theme

Add a third option: Light / Dark / System. `App.tsx` currently reads
`prefers-color-scheme` only once on mount and then never again; add a `change` listener on
the media query so System actually tracks. Persist `"light" | "dark" | "system"`.

Theme switch must not animate `background-image` (it cannot interpolate). With flat
`--paper` colours it *can* animate `background-color` — do it over `--dur-base`, and add
`transition: background-color var(--dur-base) var(--ease-out-ios), color var(--dur-base) var(--ease-out-ios)`
to `body` only. Also update the `<meta name="theme-color">` content on toggle so the iOS
status bar and Android system bar follow.

### 3.12 Android / Chrome degradation

| iOS behaviour | Android/Chrome result | Action |
| --- | --- | --- |
| `env(safe-area-inset-*)` | Returns 0 on most Android; gesture nav handled by the OS | Fallback `0px` already in the tokens; nothing breaks |
| `backdrop-filter` | Supported Chrome 76+ | Add `@supports not (backdrop-filter: blur(1px))` fallback: opaque `--surface-1` chrome |
| Edge-swipe back | Android uses hardware/gesture back | Solved by real routing (§3.13) — same code path |
| `navigator.vibrate` | Works | Feature-detect only |
| `-webkit-overflow-scrolling` | No-op, native momentum already | Harmless |
| Pull-to-refresh | Chrome reloads the PWA | `overscroll-behavior-y: none` on `html` (already in §2.4) |
| `100dvh` | Supported Chrome 108+ | Fallback `min-height: 100vh` declared first |
| Bottom tab bar | Sits above Android gesture pill | `--sa-bottom` is 0 there; add `min-height` on the bar so the pill does not overlap labels |
| `linear()` easing | Chrome 113+, Safari 17.2+ | Declare a `cubic-bezier` fallback line before each `linear()` |
| `<dialog>` sheets | Fully supported | None |

### 3.13 Routing — prerequisite for gestures

Introduce a router (or a minimal `history.pushState` wrapper) so that
`/`, `/chapter/:id`, `/chapter/:id/verse/:n`, `/search`, `/saved`, `/settings` are real URLs.
Without this there is no back gesture, no deep link, no share target, and no share button
that produces a useful URL. This is a design requirement, not an implementation detail — the
entire §3 gesture model depends on it.

---

## 4. Screen-by-screen specs

### 4.1 Home — Chapter list (Read tab root)

**Layout.** Single scroll view. Large title "Bhagavad Gita" (`--fs-large`, `--fw-bold`,
`--tr-large`, `--font-read`) with a `--fs-subhead` `--ink-3` subtitle "18 chapters · 701
verses". Below it, a **Continue reading** card if `localStorage` has a last position. Then
the chapter list.

**Kill the current card grid.** `.chapter-grid { repeat(auto-fill, minmax(300px, 1fr)) }`
with `.glass-card` produces 18 blurred boxes each carrying a full paragraph of
`chapter.summary`. That is a wall of text with no scanning affordance. Replace with an
**inset grouped list** — the iOS Settings/Books pattern:

```
┌─────────────────────────────────────────┐
│  ①   Arjuna Viṣāda Yoga            47 › │   <- 64px row
│      Arjuna's Dilemma                   │
├─────────────────────────────────────────┤
│  ②   Sāṅkhya Yoga                  72 › │
│      Transcendental Knowledge           │
└─────────────────────────────────────────┘
```

Row anatomy: 64px min-height; left a 28px circular numeral in `--accent-soft` with `--accent`
text (`--fs-footnote`, `--fw-semibold`, tabular numerals); centre a two-line stack — chapter
name at `--fs-body`/`--fw-semibold`/`--ink-1`, meaning at `--fs-subhead`/`--ink-3`; right a
verse count in `--fs-footnote`/`--ink-3` and a 16px chevron in `--ink-4`. Separator is a
0.5px `--separator` hairline inset to the left of the text column (starts at 60px), not full
bleed — this is the detail that reads as iOS.

Group container: `background: var(--surface-1)`, `border-radius: var(--r-md)`,
`box-shadow: var(--el-1)`, `overflow: hidden`, `margin-inline: 0` (the `.app-main` gutter
already insets it). No blur, no border.

`chapter.summary` moves off this screen entirely and onto the chapter detail screen — it is
detail, not an index affordance.

**Continue-reading card.** Full-width, `--r-lg`, `--surface-1`, `--el-2`. Left: "CONTINUE"
in `--fs-caption1`/`--tr-caps`/uppercase/`--accent`. Then "Chapter 2 · Verse 47" at
`--fs-headline`, then the first line of that verse's translation truncated to two lines in
`--ink-2`. A thin 2px progress bar at the bottom showing position within the chapter in
`--accent` on `--surface-3`.

**States.**
- Loading: three skeleton rows, `--surface-3` blocks at `--r-xs`, shimmering via a
  `background-position` animation (compositor-friendly), 1.4s loop, disabled under
  `prefers-reduced-motion`.
- Empty: not reachable — chapters are static.
- Error: full-screen centred `BookOpen` at `--ink-4`, `--fs-title3` "Couldn't load the
  chapters", `--fs-subhead` `--ink-3` body, and a filled `--accent` "Try again" button.

**Gestures.** Tap row → push chapter detail. Long-press row (500ms) → context sheet with
"Start from verse 1" / "Bookmark chapter". Scroll only; no horizontal gestures at this level.

**Entrance.** Replace `.animate-fade-in` + `delay-${index % 3}` with a single group fade of
the whole list container (opacity 0→1, translateY 6px→0, `--dur-base`, `--ease-out-ios`),
and only on first mount. Per-row staggering of 18 rows is noise.

### 4.2 Chapter detail (new screen)

Currently missing: `App.tsx:54` jumps straight to verse 1. This screen is what lets a reader
orient, resume, and choose.

**Layout.** Large title = chapter name; subtitle = name meaning in `--accent`,
`--fs-subhead`, `--fw-medium`. Below: the `summary` paragraph in `--font-read`,
`--fs-body`, `--lh-read`, `--ink-2`, max-width `--measure`. Then a primary action row:
a filled `--accent` pill "Start reading" (or "Continue from verse 24" when progress exists),
`min-height: 50px`, `--r-pill`, `--fs-headline`, `--on-accent`.

Then the **verse index**: a grid of numeral chips, `repeat(auto-fill, minmax(48px, 1fr))`,
gap `--sp-2`, each chip 48×48, `--r-sm`, `--surface-1`, `--fs-subhead`, tabular numerals.
Read verses get `--surface-2` + `--ink-3`; bookmarked verses get a 4px `--accent` dot at
top-right; the resume position gets `--accent-soft` fill + `--accent` text.

A segmented control at the top of the index toggles **Grid | List**; List shows each verse
number with its first line of translation, for readers who scan by content.

**States.** Loading: title skeleton + 24 chip skeletons. Empty (chapter with no verses in
the data): centred `--ink-3` "No verses available for this chapter yet."

**Gestures.** Swipe-right from the left edge (or Android back) → back to chapter list. Tap
chip → verse reader at that verse.

### 4.3 Verse reader — the product

This is the screen the whole app exists for. Treat every other screen as a way to arrive
here.

**Chrome.** Minimal nav: back chevron (44pt), centre title "2 : 47" in `--fs-footnote`
`--ink-3` tabular numerals, right a bookmark toggle and an overflow `…` button. On scroll
down the nav bar and tab bar both slide out (`translateY(-100%)` / `translateY(100%)`,
`--dur-fast`, `--ease-out-ios`); on scroll up they return. Immersive reading, chrome on
demand. Never hide chrome within the first 60px of scroll, and always restore it at the top.

**Content stack**, all inside `max-width: var(--measure)`, `margin-inline: auto`:

1. **Verse marker.** Small centred `--fs-caption1`, `--tr-caps`, uppercase, `--ink-3`,
   "Chapter 2 · Verse 47", with a 24px hairline rule either side. Replaces the current
   gradient `h2` at `VerseViewer.tsx`'s `.verse-viewer-title`.
2. **Scripture.** `lang="sa"` (or `kn`/`te`), `.script-deva`, `--fs-verse`, `--lh-verse`,
   `--fw-regular` (not 600 — Devanagari at semibold muddies conjuncts), `color: var(--ink-1)`,
   `text-align: center`, `text-wrap: balance`, `white-space: pre-wrap` (kept — the data has
   line breaks). **This is the highest-contrast text on the screen.** No accent colour, no
   gradient.
3. **Transliteration.** `--font-read` italic, `--fs-translit`, `--lh-read`, `--ink-3`,
   centred. Collapsible — a `--fs-footnote` "Transliteration" disclosure that remembers its
   state. Many readers of Kannada/Telugu do not need IAST.
4. **Divider.** A 32px centred ornament — a single `·` or a thin `--separator-line` at 40px
   wide — separating sacred text from human translation. This is the most important
   hierarchical break on the screen and currently there is nothing there.
5. **Translation.** Label "TRANSLATION" `--fs-caption1`/`--tr-caps`/`--ink-3`. Body in
   `--font-read` (Latin) or the script font when `language` is kn/te, `--fs-trans`,
   `--lh-read` (or `--lh-indic`), `--ink-1`, **left-aligned** — the current centred layout at
   `.verse-section-content` makes multi-line prose hard to track.
6. **Commentary.** Same label treatment. Rendered in a recessed well: `--surface-2`,
   `--r-md`, `padding: var(--sp-5)`, `--fs-comment`, `--ink-2`. Drop the
   `border-left: 4px solid` at `index.css:432` — the well already does the grouping, and a
   coloured left rule on a block of prose is a blog-quote idiom.

Replace `.verse-section-card { background: rgba(0,0,0,0.03) }` (`index.css:429`): a hardcoded
black alpha is invisible in dark mode. Use `--surface-2`.

**Pagination.** Remove the two `.glass-button` Prev/Next at
`.verse-pagination-container` (`index.css:458`) as the *primary* mechanism. Primary
navigation between verses is a **horizontal swipe** (see below). Keep a slim persistent
footer above the tab bar: `‹ 2:46`, a centre "46 of 72" tap target that opens the verse
index sheet, and `2:48 ›`. Each side target 44pt tall. Disabled state: `--ink-4`,
`pointer-events: none` — in CSS, not the inline `style={{opacity}}` currently in
`VerseViewer.tsx`.

**Gestures.**
- **Swipe left/right** → next/previous verse. Implement as a horizontal pager: track
  `pointermove` deltas, translate the verse content, commit past 25% width or velocity
  > 0.4px/ms, spring back otherwise with `--spring-snappy`. Adjacent verses render as
  peeking neighbours so the drag shows real content, not a blank.
- **Swipe down from top** at scroll 0 → returns to chapter detail (mirrors sheet dismiss).
- **Double-tap** anywhere on the scripture → toggle bookmark, with a brief `--accent` heart
  /bookmark bloom (scale 0.6→1.1→1, `--spring-snappy`) and `navigator.vibrate?.(10)`.
- **Long-press** on scripture → native selection (this is why `.verse-text` keeps
  `user-select: text`).
- **Tap the `…`** → action sheet: Share (uses `navigator.share` with the deep link from
  §3.13), Copy verse, Copy translation, Reading size, Report an error.

**Transitions between verses.** Outgoing verse translates -24px and fades to 0 over
`--dur-fast`; incoming enters from +24px with `--spring-gentle` over `--dur-base`. Direction
mirrors the swipe. On a tap-through from the index, use a plain cross-fade instead. Never
scroll-animate; jump to top instantly (§3.7).

**States.**
- Loading: skeleton with a 3-line block at verse size and a 5-line block at body size —
  shaped like the content, so nothing jumps.
- Empty: the current `.verse-viewer-empty` (`index.css:365`) is fine in structure but is
  currently reachable only through a bug; keep it as a genuine error state with a "Back to
  chapters" button.
- Missing translation for the selected language: do not silently fall back to English (which
  `VerseViewer.tsx` currently does). Show the English text with a `--fs-footnote` `--ink-3`
  note "Kannada translation not yet available — showing English." Honesty about data gaps is
  a design decision, and this app's Kannada/Telugu fields are optional in the `Verse`
  interface.

### 4.4 Search (new)

**Layout.** Nav bar contains only a search field: `--surface-2`, `--r-sm`, 36px tall inside
a 52px row, `Search` icon at 16px `--ink-3`, placeholder "Verse, chapter, or word", a
trailing clear `×` when non-empty, and a "Cancel" text button that slides in on focus.

`inputmode="search"`, `enterkeyhint="search"`, `autocomplete="off"`,
`autocorrect="off"`, `font-size: 1rem` minimum (anything under 16px triggers iOS zoom-on-
focus — a classic non-native tell).

**Content.** Before typing: "Recent searches" list and a "Jump to verse" hint accepting
`2:47` / `2.47` syntax. While typing: grouped results — Chapters, then Verses. Each verse
result row shows `2:47` in `--accent` tabular numerals, the matched translation line with
the query term in `--fw-semibold` (not a background highlight — too loud), truncated to two
lines.

**States.** Empty query → recents. No results → centred `--ink-3` "No results for
'karma yoga'" plus a "Search all languages" secondary action. Searching → the results list
keeps the previous results at `opacity: 0.5` rather than blanking (avoids flash).

**Gestures.** Scroll dismisses the keyboard (`blur` on `scroll` start). Tap result → verse
reader. Swipe-back returns and restores the query.

### 4.5 Saved (new)

Two sections in one scroll view.

**Continue reading** at the top — the same card as §4.1, larger. Then **Bookmarks**: an
inset grouped list, each row showing `2:47`, two lines of translation, and the date saved in
`--fs-caption1`/`--ink-3`.

**Gestures.** Swipe-left on a row reveals a `--danger` "Remove" action (44pt wide, full row
height, `--r-md` right corners); swiping past 50% commits directly. This is the one place a
destructive swipe belongs.

**States.** Empty: a centred `Bookmark` glyph at `--ink-4` 44px, `--fs-title3` "Nothing
saved yet", `--fs-subhead` `--ink-3` "Double-tap any verse to save it here", and a
`--accent` text button "Browse chapters".

Storage: `localStorage` key `gita-bookmarks` as `[{chapter, verse, savedAt}]`, matching the
existing `gita-*` key convention.

### 4.6 Settings (new)

Inset grouped lists, iOS Settings pattern. Three groups:

1. **Reading** — Language (row with current value + chevron → sheet with the three options
   and a checkmark on the active one, replacing the `<select>` in `Header.tsx`), Reading size
   (inline segmented control + live preview), Show transliteration (switch), Show commentary
   (switch).
2. **Appearance** — Appearance (Light / Dark / System segmented control), with a live
   miniature preview card above it.
3. **About** — Version, Data source attribution, a link to report a translation error.

Row anatomy: 44pt min-height, label `--fs-body` `--ink-1` left, value `--fs-body` `--ink-3`
right, 16px chevron `--ink-4`. Group header labels in `--fs-footnote`/`--tr-caps`/uppercase/
`--ink-3`, 8px above the group.

Switches: build a real iOS-style toggle (51×31, `--r-pill`, knob 27px with `--el-2`,
`--accent` when on, `--surface-3` when off, knob translates 20px with `--spring-snappy` over
`--dur-fast`). A checkbox will not read as native.

### 4.7 Header component's fate

`Header.tsx` currently carries logo, language `<select>` and theme toggle. After this
redesign it becomes a thin `NavBar` component taking `{ title, largeTitle?, leading?,
trailing? }`. Language and theme move to Settings; the logo/home action is replaced by the
tab bar. `.header-container`'s `margin: 1rem` + `position: sticky; top: 1rem` (which produces
a floating pill that visibly detaches from the status bar in standalone mode) is deleted in
favour of §3.3's edge-to-edge sticky bar.

---

## 5. Implementation checklist

### P0 — nothing else lands correctly without these

- [ ] Add `viewport-fit=cover`, `apple-mobile-web-app-*` meta, and paired light/dark `theme-color` tags to `index.html`.
- [ ] Replace the entire `:root` / `[data-theme="dark"]` block in `src/index.css` with the token set from §2.3.
- [ ] Add the global base rules from §2.4, including `-webkit-tap-highlight-color: transparent` and `touch-action: manipulation`.
- [ ] Remove the `@import` on `index.css:1`; add the Literata + Noto Serif Devanagari/Kannada/Telugu links to `index.html` per §2.2.
- [ ] Add `lang="sa" | "kn" | "te"` attributes to the scripture, translation and commentary elements in `VerseViewer.tsx`, and add the `:lang()` font rules.
- [ ] Delete `.verse-text { color: var(--accent-color) }` and set scripture to `--ink-1`, `--fw-regular`, `--fs-verse`, `--lh-verse`.
- [ ] Delete `--bg-gradient`, `--accent-gradient`, `.text-gradient`, `.glass-panel::before` and its `:hover` rule, and `background-attachment: fixed` on `body`.
- [ ] Introduce routing (`/`, `/chapter/:id`, `/chapter/:id/verse/:n`, `/search`, `/saved`, `/settings`) replacing the `selectedChapterId`/`selectedVerseId` state in `App.tsx`, so back gesture and back button work.
- [ ] Replace `window.scrollTo({behavior:"smooth"})` in `App.tsx:68,75` with instant `window.scrollTo(0,0)` in the same frame as the verse change.
- [ ] Build the `.app-nav` / `.app-main` / `.app-tabbar` shell from §3.3 using `max(gutter, safe-area)` insets and `100dvh`.
- [ ] Build the four-tab bottom tab bar (Read / Search / Saved / Settings) per §3.4.
- [ ] Raise every interactive element to `min-height: 44px` — `.theme-toggle`, `.glass-button`'s successor, tab items, list rows.
- [ ] Add a `prefers-reduced-motion` block and gate all `:hover` rules behind `@media (hover: hover) and (pointer: fine)`.

### P1 — the screens

- [ ] Rebuild `ChapterList.tsx` as the inset grouped list from §4.1 (numeral, name, meaning, count, chevron, inset hairline); drop `.chapter-grid` and `.glass-card`.
- [ ] Remove the `delay-${(index % 3) * 100}` stagger in `ChapterList.tsx`; use a single container fade on first mount only.
- [ ] Add the Chapter detail screen (§4.2) with summary, primary "Start / Continue" action, and the verse-index chip grid.
- [ ] Rebuild `VerseViewer.tsx` to the §4.3 content stack: verse marker, scripture, collapsible transliteration, ornament divider, left-aligned translation, recessed commentary well.
- [ ] Replace `.verse-section-card`'s `rgba(0,0,0,0.03)` with `--surface-2` and delete its `border-left`.
- [ ] Move the Prev/Next `disabled` styling out of the inline `style` prop in `VerseViewer.tsx` into a CSS `:disabled` rule.
- [ ] Implement horizontal swipe paging between verses with peeking neighbours and `--spring-snappy` commit/spring-back.
- [ ] Implement the scroll-away nav bar and tab bar in the reader (hide on scroll down, show on scroll up, always show at top).
- [ ] Build the bottom-sheet primitive on `<dialog>` with grabber, scrim, drag-to-dismiss, and `--spring-gentle` presentation (§3.6).
- [ ] Build the Settings screen (§4.6) and move language and theme out of `Header.tsx`; delete the native `<select>`.
- [ ] Implement the reading-size control writing `--reading-scale` to `documentElement` and persisting to `gita-reading-scale`.
- [ ] Add Light / Dark / System with a live `prefers-color-scheme` change listener, and update `<meta name="theme-color">` on switch.
- [ ] Update the `vite.config.ts` manifest `theme_color`/`background_color` to `#FBF9F5` and add `orientation` and `display_override`.

### P2 — depth and polish

- [ ] Build the Search screen (§4.4) with `2:47` jump syntax, grouped results, and 16px-minimum input font.
- [ ] Build the Saved screen (§4.5) with continue-reading card, bookmark list, and swipe-to-delete.
- [ ] Add double-tap-to-bookmark on the scripture with the bloom animation and `navigator.vibrate?.(10)`.
- [ ] Add the verse action sheet (Share via `navigator.share`, Copy verse, Copy translation, Reading size).
- [ ] Add per-screen skeleton loaders shaped like their real content, disabled under reduced motion.
- [ ] Show an explicit "translation not yet available" note instead of silently falling back to English in `VerseViewer.tsx`.
- [ ] Add the `@supports not (backdrop-filter: blur(1px))` opaque-chrome fallback.
- [ ] Add the ≥900px sidebar layout replacing the bottom tab bar.
- [ ] Add `prefers-contrast: more` overrides and verify every text/background pair at 4.5:1 (3:1 for ≥24px scripture).
- [ ] Add a long-press context sheet on chapter rows ("Start from verse 1", "Bookmark chapter").
