import { Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toggleBookmark, useIsSaved } from "../lib/bookmarks";
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
  onGoToVerse: (verse: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  hasPrevChapter: boolean;
  hasNextChapter: boolean;
}

/** BCP-47 tag for a field, so the `[lang]` font and line-height rules pick the
 *  right script. A field that fell back to English must be tagged "en" or the
 *  Latin prose would be painted in an Indic face at Indic line-height. */
type Tagged = { text: string; lang: "sa" | "kn" | "te" | "en" };

const pick = (language: Language, english: string | undefined, kannada: string | undefined, telugu: string | undefined, englishLang: "sa" | "en"): Tagged | null => {
  if (language === "kn" && kannada) return { text: kannada, lang: "kn" };
  if (language === "te" && telugu) return { text: telugu, lang: "te" };
  return english ? { text: english, lang: englishLang } : null;
};

/* Section headings in the reader's own language. The label is tagged with its
   script so the [lang] font rules pick up Noto Sans Kannada/Telugu — the UI
   stack deliberately carries no Indic fallback, because one there would pull
   both faces on every screen for the sake of the language <select>. */
const COMMENTARY_LABEL: Record<Language, string> = { en: "Commentary", kn: "\u0cad\u0cbe\u0cb7\u0ccd\u0caf", te: "\u0c2d\u0c3e\u0c37\u0c4d\u0c2f\u0c02" };
const WORD_MEANINGS_LABEL = "Word meanings";
const SECTION_LANG: Record<Language, string> = { en: "en", kn: "kn", te: "te" };

const verseDomId = (chapter: number, verse: number): string => `c${chapter}v${verse}`;

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
      aria-pressed={saved}
      aria-label={saved ? `Remove verse ${chapter}.${verse} from saved` : `Save verse ${chapter}.${verse}`}
      onClick={() => toggleBookmark(chapter, verse)}>
      <Bookmark size={18} fill={saved ? "currentColor" : "none"} aria-hidden />
    </button>
  );
};

/** One verse. Memoised: prev/next re-renders the whole chapter, and a 78-verse
 *  chapter must bail out of all of them cheaply (ARCHITECTURE_PLAN §4.2). */
const VerseBlock = memo<{ chapter: number; verse: Verse; language: Language; sections: Sections }>(({ chapter, verse, language, sections }) => {
  // Scripture: Devanagari is the source text; kn/te are transliterations of it.
  const scripture = pick(language, verse.text, verse.text_kannada, verse.text_telugu, "sa") as Tagged;
  const translation = pick(language, verse.translation_english, verse.translation_kannada, verse.translation_telugu, "en") as Tagged;
  const commentary = sections.commentary ? pick(language, verse.commentary_english, verse.context_kannada, verse.context_telugu, "en") : null;
  // Word-by-word glosses are English only; there is no Kannada or Telugu set.
  const wordMeanings = sections.words && language === "en" ? verse.context_english : undefined;
  const [tab, setTab] = useState<"words" | "commentary">(commentary ? "commentary" : "words");
  // "term—gloss; term—gloss" from the source, split to one term per line.
  const glosses = wordMeanings?.split(";").map((g) => g.trim().replace(/\s*—\s*/, ": ")).filter(Boolean);

  return (
    <article className="verse-block" id={verseDomId(chapter, verse.verse_number)} data-verse={verse.verse_number}>
      <div className="verse-viewer-title-wrapper">
        <h2 className="verse-viewer-title">Verse {verse.verse_number}</h2>
        <SaveButton chapter={chapter} verse={verse.verse_number} />
      </div>

      {sections.text && (
        <div className="verse-text-wrapper">
          <p className="verse-text" lang={scripture.lang}>
            {/* The corpus separates pada with blank lines; under pre-wrap those
                render as a gap mid-verse. Collapse to a single line break. */}
            {scripture.text.replace(/\n\s*\n/g, "\n").trim()}
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
        </div>
      )}

      {(wordMeanings || commentary) && (
        <div className="verse-section-card commentary">
          <div className="verse-tabs" role="tablist">
            {commentary && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "commentary"}
                className="verse-tab"
                onClick={() => setTab("commentary")}
                lang={SECTION_LANG[language]}
              >
                {COMMENTARY_LABEL[language]}
              </button>
            )}
            {wordMeanings && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "words"}
                className="verse-tab"
                onClick={() => setTab("words")}
                lang="en"
              >
                {WORD_MEANINGS_LABEL}
              </button>
            )}
          </div>

          {tab === "words" && glosses ? (
            <ul className="verse-glosses" lang="en">
              {glosses.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : (
            commentary && (
              <>
                <p className="verse-section-content" lang={commentary.lang}>
                  {commentary.text}
                </p>
                {commentary.lang === "en" && verse.commentary_author && (
                  <p className="verse-section-attribution">{verse.commentary_author}</p>
                )}
              </>
            )
          )}
        </div>
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
export const VerseViewer: React.FC<VerseViewerProps> = ({ chapter, verses, targetVerse, language, onGoToVerse, onPrevChapter, onNextChapter, hasPrevChapter, hasNextChapter }) => {
  const { sections } = useSettings();
  const trackRef = useRef<HTMLDivElement | null>(null);
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
  if (seenTarget !== targetVerse) {
    setSeenTarget(targetVerse);
    setActive(targetVerse);
  }

  const count = verses.length;
  const first = count > 0 ? verses[0].verse_number : 1;
  const last = count > 0 ? verses[count - 1].verse_number : 1;

  const index = Math.max(0, verses.findIndex((v) => v.verse_number === active));
  const start = Math.max(0, index - WINDOW);
  const end = Math.min(count - 1, index + WINDOW);

  // Route -> track. Layout effect so a deep link never paints the wrong verse
  // first, and after the render that put the target slide in the window.
  useLayoutEffect(() => {
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
  }, [chapter, index, active, count]);

  // The track can only be one height, and it has to be the height of the verse
  // being read. Observed rather than computed once: the card resizes when the
  // reading face, the shown sections or the window width change.
  useLayoutEffect(() => {
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
  }, [chapter, active, count]);

  // A card is as tall as its verse, so the page's scroll extent changes with the
  // page. Every verse starts at its own top: without this the browser would clamp
  // a deep scroll position against a shorter neighbour and jog the view sideways
  // mid-swipe.
  useEffect(() => {
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  }, [active]);

  // Track -> route. replaceState only: paging must never push history.
  useEffect(() => {
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
  }, [chapter, verses, count]);

  // Slide width is the track width, so a rotation or a window resize leaves
  // scrollLeft pointing between two verses. Re-anchor on the active one.
  useEffect(() => {
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
  }, [verses]);

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
              <VerseBlock chapter={chapter} verse={verse} language={language} sections={sections} />
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
