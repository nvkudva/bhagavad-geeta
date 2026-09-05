import { Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toggleBookmark, useIsSaved } from "../lib/bookmarks";
import { useWide, useWidePlus } from "../lib/media";
import type { Verse } from "../lib/gita.types";
import { syncVerseUrl } from "../lib/router";
import type { Language } from "../lib/gita.types";
import type { Sections } from "../lib/settings";
import { useSettings } from "../lib/settings";

interface VerseViewerProps {
  chapter: number;
  verses: readonly Verse[];
  /** The verse the URL points at: "render chapter n, paged to verse m". */
  targetVerse: number;
  language: Language;
  /** The chapter's name in the reader's language, for the rail header. */
  chapterName?: string;
  onGoToVerse: (verse: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  hasPrevChapter: boolean;
  hasNextChapter: boolean;
}

/** BCP-47 tag for a field, so the `[lang]` font and line-height rules pick the
 *  right script. A field that fell back to English must be tagged "en" or the
 *  Latin prose would be painted in an Indic face at Indic line-height. */
type Tagged = { text: string; lang: "sa" | "kn" | "te" | "en"; fellBack: boolean };

/* Every line of scripture closes with its own number between double dandas —
   "।।2.13।।" in Devanagari, "|| ೧೩ ||" in the Kannada and Telugu settings of the
   same text. The heading above the verse already says which verse this is, so the
   number and the pair that closes it are noise in the reading view. The opening
   danda stays: it is the sentence's full stop, not part of the number. The corpus
   is untouched — search and the word-gloss import both key off the number. */
const stripVerseNumber = (text: string): string => text.replace(/(।।|॥|\|\|)[\s.\d\u0966-\u096f\u0c66-\u0c6f\u0ce6-\u0cef]+(?:।।|॥|\|\|)\s*$/u, "$1");

/* A danda is a full stop, and a full stop does not start a line. The corpus
   spaces it off the last word, so on a narrow column the pada wraps and leaves
   the mark stranded at the head of the next line; a no-break space glues it to
   the word it closes. */
const bindDanda = (text: string): string => text.replace(/[ \t]+(?=(?:।|॥|\|)+)/g, "\u00a0");

const pick = (language: Language, english: string | undefined, kannada: string | undefined, telugu: string | undefined, englishLang: "sa" | "en"): Tagged | null => {
  if (language === "kn" && kannada) return { text: kannada, lang: "kn", fellBack: false };
  if (language === "te" && telugu) return { text: telugu, lang: "te", fellBack: false };
  // `fellBack` is the whole point: a reader who asked for Kannada and is given
  // English prose has to be told so, rather than left to assume the corpus has
  // no more to say (docs/TODO "translation not yet available in this language").
  return english ? { text: english, lang: englishLang, fellBack: language !== "en" } : null;
};

/* Provenance, in English in every language. These are metadata about the text
   rather than part of it: rendering them in the reader's script made them
   compete with the scripture for attention, and "AI translated" is understood
   as it stands. Stated here rather than shipped per verse — it is the same
   sentence for all 701. */
const TRANSLATION_SOURCE: Partial<Record<Language, string>> = {
  kn: "AI translated",
  te: "Telugu Wikisource · CC BY-SA 4.0",
};

/* Three Telugu verses the source left absent or unfinished were composed
   instead, so they cannot carry the Wikisource credit. */
const TELUGU_COMPOSED = "AI translated";

/* The commentary is Sivananda's, Ramanuja's or Shankaracharya's in every
   language; only the rendering into Kannada is generated. So the credit names
   the commentator either way and adds the provenance when the reader is not
   looking at the English. */
const COMMENTARY_TRANSLATED = "AI translated";

/* Section headings in the reader's own language. The label is tagged with its
   script so the [lang] font rules pick up Noto Sans Kannada/Telugu — the UI
   stack deliberately carries no Indic fallback, because one there would pull
   both faces on every screen for the sake of the language <select>. */
const COMMENTARY_LABEL: Record<Language, string> = { en: "Commentary", kn: "\u0cad\u0cbe\u0cb7\u0ccd\u0caf", te: "\u0c2d\u0c3e\u0c37\u0c4d\u0c2f\u0c02" };
const WORD_MEANINGS_LABEL = "Word meanings";
const SECTION_LANG: Record<Language, string> = { en: "en", kn: "kn", te: "te" };

const verseDomId = (chapter: number, verse: number): string => `c${chapter}v${verse}`;

/** Which way the rail should slide. Written before the navigation, because the
 *  view transition captures the old frame the moment `navigate` is called. */
// eslint-disable-next-line react-refresh/only-export-components -- a DOM side effect called before navigate(); it belongs beside the rail it drives.
export const setRailDirection = (dir: "prev" | "next"): void => {
  document.documentElement.dataset.railDir = dir;
};

const railStep = (go: () => void, dir: "prev" | "next"): void => {
  setRailDirection(dir);
  go();
};

/** Slides kept either side of the active verse. One: scroll-snap-stop makes a
 *  gesture reach exactly one neighbour, so that neighbour is always painted
 *  before the finger moves — and the track is only ever as tall as the tallest
 *  slide mounted, so a wider window would strand the short card in a tall one's
 *  dead space. */
const WINDOW = 1;

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Subscribes to this verse's bookmark only, so saving one does not re-render
 *  the other 77 blocks in the chapter. */
const SaveButton: React.FC<{ chapter: number; verse: number }> = ({ chapter, verse }) => {
  const saved = useIsSaved(chapter, verse);
  return (
    <button
      type="button"
      className="verse-save pressable"
      data-tip={saved ? "Saved — B" : "Save verse — B"}
      aria-keyshortcuts="b"
      aria-pressed={saved}
      aria-label={saved ? `Remove verse ${chapter}.${verse} from saved` : `Save verse ${chapter}.${verse}`}
      onClick={() => toggleBookmark(chapter, verse)}>
      <Bookmark size={18} fill={saved ? "currentColor" : "none"} aria-hidden />
    </button>
  );
};

/** One verse. Memoised: prev/next re-renders the whole chapter, and a 78-verse
 *  chapter must bail out of all of them cheaply (ARCHITECTURE_PLAN §4.2). */
const VerseBlock = memo<{ chapter: number; verse: Verse; language: Language; sections: Sections; panes: boolean }>(({ chapter, verse, language, sections, panes }) => {
  // Scripture: Devanagari is the source text; kn/te are transliterations of it.
  const scripture = pick(language, verse.text, verse.text_kannada, verse.text_telugu, "sa") as Tagged;
  const translation = pick(language, verse.translation_english, verse.translation_kannada, verse.translation_telugu, "en") as Tagged;
  /* Both languages prefer the full translated commentary over context_kannada
     and context_telugu, which cover 4 and 22 verses with a short summary — one
     register across the chapter beats a better paragraph on a couple of dozen
     verses. Five verses hold a placeholder rather than commentary and are
     deliberately untranslated, so those fall back to the English, which says
     plainly that Sivananda did not comment. */
  const commentary = sections.commentary
    ? pick(
        language,
        verse.commentary_english,
        verse.commentary_kannada ?? verse.context_kannada,
        verse.commentary_telugu ?? verse.context_telugu,
        "en",
      )
    : null;
  // There is no Kannada or Telugu gloss set, and the panel is worth more in
  // English than it is missing: the list is tagged `lang="en"` and shown in
  // every reading language.
  const wordMeanings = sections.words ? verse.context_english : undefined;
  const [tab, setTab] = useState<"words" | "commentary">(commentary ? "commentary" : "words");
  const translationSource = language === "te" && verse.translation_telugu_machine ? TELUGU_COMPOSED : TRANSLATION_SOURCE[language];
  const commentaryAttribution = commentary
    ? [verse.commentary_author, commentary.lang === "en" ? null : COMMENTARY_TRANSLATED].filter(Boolean).join(" \u00b7 ")
    : "";
  /* "term—gloss; term—gloss" from the source. Split at the FIRST em dash only:
     a gloss may contain one. The separator is chosen here rather than in CSS so
     that a copied line carries a real character. */
  const glosses = wordMeanings
    ?.split(";")
    .map((g) => {
      const [term, ...rest] = g.trim().split(/\s*—\s*/);
      return { term, gloss: rest.join(" — ") };
    })
    .filter((g) => g.term);
  const glossSep = panes ? " = " : ": ";

  const glossList = glosses && (
    <ul className="verse-glosses" lang="en">
      {glosses.map(({ term, gloss }, i) => (
        <li key={`${i}-${term}`}>
          <span className="verse-gloss-term">{term}</span>
          <span className="verse-gloss-sep" aria-hidden>
            {glossSep}
          </span>
          {gloss}
        </li>
      ))}
    </ul>
  );

  return (
    <article className="verse-row" id={verseDomId(chapter, verse.verse_number)} data-verse={verse.verse_number}>
      <div className="verse-block">
      <div className="verse-viewer-title-wrapper">
        <h2 className="verse-viewer-title">Verse {verse.verse_number}</h2>
        <SaveButton chapter={chapter} verse={verse.verse_number} />
      </div>

      {sections.text && (
        <div className="verse-text-wrapper">
          <p className="verse-text" lang={scripture.lang}>
            {/* The corpus separates pada with blank lines; under pre-wrap those
                render as a gap mid-verse. Collapse to a single line break. */}
            {bindDanda(stripVerseNumber(scripture.text.replace(/\n\s*\n/g, "\n").trim()))}
          </p>
        </div>
      )}

      {sections.transliteration && (
        <div className="verse-transliteration-wrapper">
          <p className="verse-transliteration" lang="sa-Latn">
            {verse.transliteration}
          </p>
        </div>
      )}

      {sections.translation && (
        <div className="verse-section-card">
          <p className="verse-section-content" lang={translation.lang}>
            {translation.text}
          </p>
          {/* Suppressed on a fallback: the text on screen is then the English
              translation, which neither credit describes. */}
          {!translation.fellBack && translationSource && (
            <p className="verse-section-note" lang="en">
              {translationSource}
            </p>
          )}
        </div>
      )}

      {/* At 1280 both bands run the full width of the card, stacked. Side by
          side they were 326px columns — 32 characters of commentary, which is
          below any prose floor. Page length is nearly free with a wheel and a
          sticky rail; measure is not. */}
      {panes && commentary ? (
        <div className="verse-section-card commentary">
          <h3 className="verse-pane-label" lang={SECTION_LANG[language]}>
            {COMMENTARY_LABEL[language]}
          </h3>
          <p className="verse-section-content" lang={commentary.lang}>
            {commentary.text}
          </p>
          {commentaryAttribution && <p className="verse-section-attribution">{commentaryAttribution}</p>}
        </div>
      ) : panes ? null : (
        (wordMeanings || commentary) && (
          <div className="verse-section-card commentary">
            <div className="verse-tabs" role="tablist">
              {commentary && (
                <button type="button" role="tab" aria-selected={tab === "commentary"} className="verse-tab" onClick={() => setTab("commentary")} lang={SECTION_LANG[language]}>
                  {COMMENTARY_LABEL[language]}
                </button>
              )}
              {glossList && (
                <button type="button" role="tab" aria-selected={tab === "words"} className="verse-tab" onClick={() => setTab("words")} lang="en">
                  {WORD_MEANINGS_LABEL}
                </button>
              )}
            </div>

            {/* Both panels share one grid cell, so the card stands as tall as
                the taller of them: the words tab fills the same envelope the
                commentary does instead of collapsing the verse under it. */}
            <div className="verse-tabpanels">
              {commentary && (
                <div className="verse-tabpanel" data-active={tab === "commentary"}>
                  <p className="verse-section-content" lang={commentary.lang}>
                    {commentary.text}
                  </p>
                  {commentaryAttribution && <p className="verse-section-attribution">{commentaryAttribution}</p>}
                </div>
              )}
              {glossList && (
                <div className="verse-tabpanel" data-active={tab === "words"}>
                  {glossList}
                </div>
              )}
            </div>
          </div>
        )
      )}
      </div>

      {/* Beside the card, not in it: the glosses are a lookup column the eye
          leaves the verse for and comes back from, and inside the card they
          pushed the next verse a screenful down. */}
      {panes && glossList && (
        <aside className="verse-glosses-aside" aria-label={`Word meanings for verse ${verse.verse_number}`}>
          <h3 className="verse-pane-label" lang="en">
            {WORD_MEANINGS_LABEL}
          </h3>
          {glossList}
        </aside>
      )}
    </article>
  );
});
VerseBlock.displayName = "VerseBlock";

/** One chapter, one horizontal pager. `/chapter/:n/verse/:m` means "render
 *  chapter n, paged to verse m": each verse is a full-width slide on a
 *  scroll-snap track, so a swipe is native scrolling — momentum, rubber-band
 *  and the snap itself all run off the main thread — and prev/next is the same
 *  motion driven by scrollTo. Only WINDOW*2+1 slides are ever mounted; two flex
 *  spacers stand in for the rest so the scroll extent still spans the chapter. */
export const VerseViewer: React.FC<VerseViewerProps> = ({ chapter, verses, targetVerse, language, chapterName, onGoToVerse, onPrevChapter, onNextChapter, hasPrevChapter, hasNextChapter }) => {
  const { sections } = useSettings();
  const wide = useWide();
  const widePlus = useWidePlus();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const activeSlideRef = useRef<HTMLDivElement | null>(null);
  /** The verse currently under the snap point. Mirrors `active` without the
   *  render lag, so the scroll listener can tell a settled page from a new one. */
  const activeRef = useRef<number | null>(null);
  const chapterRef = useRef<number>(chapter);
  const [active, setActive] = useState(targetVerse);
  // Adjusting state during render, the React-sanctioned way to follow a changed
  // prop: when the URL moves the target verse, the pager follows it. A move that
  // came from the scroll listener below has already set `active`, so this bails out.
  const [seenTarget, setSeenTarget] = useState(targetVerse);
  /** Bumped only when the target changed because something outside the reader
   *  asked for it — a rail click, the pager, a keystroke, a deep link. The
   *  scroll-spy below never bumps it, so following the reader's own scroll
   *  cannot fight the reader. */
  const [targetNonce, setTargetNonce] = useState(0);
  if (seenTarget !== targetVerse) {
    setSeenTarget(targetVerse);
    setActive(targetVerse);
    setTargetNonce((n) => n + 1);
  }

  const count = verses.length;
  const first = count > 0 ? verses[0].verse_number : 1;
  const last = count > 0 ? verses[count - 1].verse_number : 1;

  const index = Math.max(
    0,
    verses.findIndex((v) => v.verse_number === active),
  );
  const start = Math.max(0, index - WINDOW);
  const end = Math.min(count - 1, index + WINDOW);
  /** The one verse the wide reader mounts. `index` is already clamped, so this
   *  is defined whenever the chapter has arrived. */
  const shown = verses[index];

  // Route -> track. Layout effect so a deep link never paints the wrong verse
  // first, and after the render that put the target slide in the window.
  useLayoutEffect(() => {
    if (wide) return;
    const track = trackRef.current;
    if (!track || count === 0) return;

    if (chapterRef.current !== chapter) {
      chapterRef.current = chapter;
      activeRef.current = null;
    }
    const cold = activeRef.current === null;
    activeRef.current = active;

    const width = track.clientWidth;
    if (width === 0) return;
    const at = Math.round(track.scrollLeft / width);
    if (at === index) return;

    // One page animates; a jump of several would be a blur, and a cold open has
    // nothing to animate from.
    const smooth = !cold && Math.abs(at - index) === 1 && !reducedMotion();
    track.scrollTo({ left: index * width, behavior: smooth ? "smooth" : "auto" });
  }, [chapter, index, active, count, wide]);

  // The track can only be one height, and it has to be the height of the verse
  // being read. Observed rather than computed once: the card resizes when the
  // reading face, the shown sections or the window width change.
  useLayoutEffect(() => {
    if (wide) return;
    const track = trackRef.current;
    const slide = activeSlideRef.current;
    if (!track || !slide) return;
    const write = (): void => track.style.setProperty("--track-h", `${slide.offsetHeight}px`);
    write();
    const observer = new ResizeObserver(write);
    observer.observe(slide);
    return () => observer.disconnect();
    // `count` because the track only exists once the chapter has arrived, which
    // is a render later than the one that set `active` on a cold open.
  }, [chapter, active, count, wide]);

  // A card is as tall as its verse, so the page's scroll extent changes with the
  // page. Every verse starts at its own top: without this the browser would clamp
  // a deep scroll position against a shorter neighbour and jog the view sideways
  // mid-swipe.
  useEffect(() => {
    if (wide) return;
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  }, [active, wide]);

  // Track -> route. replaceState only: paging must never push history.
  useEffect(() => {
    if (wide) return;
    const track = trackRef.current;
    if (!track || count === 0) return;
    let frame = 0;

    const read = (): void => {
      frame = 0;
      const width = track.clientWidth;
      if (width === 0) return;
      const i = Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / width)));
      const verse = verses[i].verse_number;
      if (verse === activeRef.current) return;
      activeRef.current = verse;
      setActive(verse);
      syncVerseUrl(chapter, verse);
    };

    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [chapter, verses, count, wide]);

  // Slide width is the track width, so a rotation or a window resize leaves
  // scrollLeft pointing between two verses. Re-anchor on the active one.
  useEffect(() => {
    if (wide) return;
    const track = trackRef.current;
    if (!track) return;
    let width = track.clientWidth;
    const observer = new ResizeObserver(() => {
      const next = track.clientWidth;
      if (next === 0 || next === width) return;
      width = next;
      const i = verses.findIndex((v) => v.verse_number === activeRef.current);
      track.scrollLeft = Math.max(0, i) * next;
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [verses, wide]);

  /* ---------------------------------------------------------- wide reader
     A continuous column, so paging is scrolling and the four track effects
     above are all inert. */

  // Route -> column. Only an external move scrolls; the scroll-spy below never
  // sets wantScrollRef, so following the reader cannot fight the reader.
  useLayoutEffect(() => {
    if (!wide || count === 0) return;
    // Already the verse under the reading position — this is the URL catching
    // up with the scroll, not a request to move.
    if (activeRef.current === targetVerse) return;
    activeRef.current = targetVerse;
    // The new verse is the only thing mounted, so the reading position is the
    // top of the page — not the top of the card, which scrollIntoView would put
    // flush against the bar and eat the gutter above it. Always instant: a
    // smooth scroll lands late enough to read as lag.
    window.scrollTo({ top: 0, behavior: "auto" });
    // The cut that leaves is softened by a dissolve rather than by animating the
    // scroll: the destination resolves in place, so nothing travels. Opacity
    // alone at 160ms read as a flicker, not a blend — the card comes in out of
    // focus and settles, which is long enough to see and short enough to hold J
    // through. Any dissolve still running is cancelled first, so holding J is
    // one steady blend rather than a stack of them beating against each other.
    const column = columnRef.current;
    if (column && !reducedMotion()) {
      for (const running of column.getAnimations()) running.cancel();
      column.animate([{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: 260, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" });
    }
  }, [wide, chapter, count, targetVerse, targetNonce]);

  // The rail never scrolls, and nothing scrolls it: the whole chapter fits the
  // sticky box as a grid of numbers. Following the active row — however gently
  // — moved the index out from under the cursor on every click and on every
  // reading scroll, and an index taller than its box moves anyway the moment
  // the wheel passes over it.

  /* The active-verse thumb is placed from the row's measured offsets rather
     than from cell arithmetic, so it stays exact whatever the grid resolves the
     cell width to, and it can transition between two positions instead of the
     ground teleporting from cell to cell. */
  /* The rail never follows the reading position — that pulled cards out from
     under the cursor on every click. It does bring the active card into view
     once per chapter, so a deep link into chapter 18 does not open with its
     own card scrolled out of sight. */
  const placedRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const card = grid?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!grid || !card || placedRef.current === chapter) return;
    placedRef.current = chapter;
    grid.scrollTop = card.offsetTop - grid.clientHeight / 2 + card.offsetHeight / 2;
  }, [active, count, chapter, widePlus]);

  // Column -> route. The band is the middle of the viewport: a verse owns the
  // URL while its top third is in the reading position.
  useLayoutEffect(() => {
    if (!wide) return;
    if (chapterRef.current !== chapter) {
      chapterRef.current = chapter;
      activeRef.current = null;
    }
  }, [wide, chapter]);

  useEffect(() => {
    if (!wide || count === 0) return;
    const column = columnRef.current;
    if (!column) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Topmost intersecting block wins, so scrolling up and down agree.
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!visible) return;
        const verse = Number((visible.target as HTMLElement).dataset.verse);
        if (!Number.isFinite(verse) || verse === activeRef.current) return;
        activeRef.current = verse;
        setActive(verse);
        syncVerseUrl(chapter, verse);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );

    for (const block of column.querySelectorAll(".verse-row")) observer.observe(block);
    return () => observer.disconnect();
  }, [wide, chapter, count]);

  const goPrev = useCallback(() => {
    const i = verses.findIndex((v) => v.verse_number === active);
    if (i > 0) return onGoToVerse(verses[i - 1].verse_number);
    onPrevChapter();
  }, [active, verses, onGoToVerse, onPrevChapter]);

  const goNext = useCallback(() => {
    const i = verses.findIndex((v) => v.verse_number === active);
    if (i !== -1 && i < verses.length - 1) return onGoToVerse(verses[i + 1].verse_number);
    onNextChapter();
  }, [active, verses, onGoToVerse, onNextChapter]);

  const hasPrev = active > first || hasPrevChapter;
  const hasNext = active < last || hasNextChapter;

  if (wide) {
    return (
      <div className="verse-viewer-container">
        {widePlus && count > 0 && (
          <nav className="verse-rail" aria-label={`Verses in chapter ${chapter}`} ref={railRef}>
            <div className="verse-rail-head">
              <button
                type="button"
                className="verse-rail-step pressable"
                onClick={() => railStep(onPrevChapter, "prev")}
                disabled={!hasPrevChapter}
                data-tip={`Chapter ${chapter - 1}`}
                aria-label={`Chapter ${chapter - 1}`}>
                <ChevronLeft size={14} strokeWidth={2.4} aria-hidden />
              </button>
              <span className="verse-rail-head-text">
                <span className="verse-rail-eyebrow">Chapter {chapter}</span>
                {chapterName && <span className="verse-rail-name">{chapterName}</span>}
              </span>
              <button
                type="button"
                className="verse-rail-step pressable"
                onClick={() => railStep(onNextChapter, "next")}
                disabled={!hasNextChapter}
                data-tip={`Chapter ${chapter + 1}`}
                aria-label={`Chapter ${chapter + 1}`}>
                <ChevronRight size={14} strokeWidth={2.4} aria-hidden />
              </button>
            </div>

            <div className="verse-rail-grid" ref={gridRef}>
              {verses.map((v) => (
                <a
                  key={v.verse_number}
                  href={`#${verseDomId(chapter, v.verse_number)}`}
                  className="verse-rail-item"
                  aria-current={v.verse_number === active ? "true" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    onGoToVerse(v.verse_number);
                  }}>
                  <span className="verse-rail-item-label">Verse</span>
                  <span className="verse-rail-item-n">{v.verse_number}</span>
                </a>
              ))}
            </div>
          </nav>
        )}

        {count === 0 ? (
          <p className="verse-viewer-loading">Loading chapter…</p>
        ) : (
          /* One verse at a time, as on the phone. The column used to mount the
             whole chapter and let the wheel page through it, but a card that
             fills the window then always showed a sliver of its neighbours, and
             the rail — which is the pager here — was navigating a page the
             reader was also scrolling. Navigation is the rail, the pager and
             J/K; the wheel only reads down a long commentary. */
          <div className="verse-column" ref={columnRef}>
            <VerseBlock key={shown.verse_number} chapter={chapter} verse={shown} language={language} sections={sections} panes={widePlus} />
          </div>
        )}

        {/* The rail is the pager at 1280; below that the floating capsule is
            still the only chapter-level control on the screen. */}
        <div className="verse-pager">
          <button type="button" className="pager-btn pressable" data-tip="Previous verse — K" aria-keyshortcuts="k" onClick={goPrev} disabled={!hasPrev} aria-label="Previous verse">
            <ChevronLeft size={18} strokeWidth={2.5} aria-hidden />
          </button>
          <span className="verse-pager-label" aria-live="polite">
            {chapter}.{active} <span className="verse-pager-total">of {last}</span>
          </span>
          <button type="button" className="pager-btn pressable" data-tip="Next verse — J" aria-keyshortcuts="j" onClick={goNext} disabled={!hasNext} aria-label="Next verse">
            <ChevronRight size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="verse-viewer-container">
      {count === 0 ? (
        <p className="verse-viewer-loading">Loading chapter…</p>
      ) : (
        <div className="verse-track" ref={trackRef}>
          {/* Percentage flex-basis resolves against the track's own width, so
              the unmounted verses cost exactly their page each and no layout
              measurement is needed to size them. */}
          <div className="verse-track-spacer" style={{ flexBasis: `${start * 100}%` }} aria-hidden />
          {verses.slice(start, end + 1).map((verse) => (
            <div className="verse-slide" key={verse.verse_number} ref={verse.verse_number === active ? activeSlideRef : undefined}>
              <VerseBlock chapter={chapter} verse={verse} language={language} sections={sections} panes={false} />
            </div>
          ))}
          <div className="verse-track-spacer" style={{ flexBasis: `${(count - 1 - end) * 100}%` }} aria-hidden />
        </div>
      )}

      <div className="verse-pager">
        <button type="button" className="pager-btn pressable" onClick={goPrev} disabled={!hasPrev} aria-label="Previous verse">
          <ChevronLeft size={18} strokeWidth={2.5} aria-hidden />
        </button>
        <span className="verse-pager-label" aria-live="polite">
          {chapter}.{active} <span className="verse-pager-total">of {last}</span>
        </span>
        <button type="button" className="pager-btn pressable" onClick={goNext} disabled={!hasNext} aria-label="Next verse">
          <ChevronRight size={18} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
};
