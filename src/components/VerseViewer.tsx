import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChapterMeta, Verse } from "../lib/gita.types";
import { getNavKind, syncVerseUrl } from "../lib/router";
import type { Language } from "./Header";

interface VerseViewerProps {
  chapter: number;
  meta: ChapterMeta;
  verses: readonly Verse[];
  /** The verse the URL points at: "render chapter n, scrolled to verse m". */
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

const verseDomId = (chapter: number, verse: number): string => `c${chapter}v${verse}`;

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One verse. Memoised: prev/next re-renders the whole chapter, and a 78-verse
 *  chapter must bail out of all of them cheaply (ARCHITECTURE_PLAN §4.2). */
const VerseBlock = memo<{ chapter: number; verse: Verse; language: Language }>(({ chapter, verse, language }) => {
  // Scripture: Devanagari is the source text; kn/te are transliterations of it.
  const scripture = pick(language, verse.text, verse.text_kannada, verse.text_telugu, "sa") as Tagged;
  const translation = pick(language, verse.translation_english, verse.translation_kannada, verse.translation_telugu, "en") as Tagged;
  const commentary = pick(language, verse.context_english, verse.context_kannada, verse.context_telugu, "en");

  return (
    <article className="verse-block" id={verseDomId(chapter, verse.verse_number)} data-verse={verse.verse_number}>
      <div className="verse-viewer-title-wrapper">
        <h2 className="verse-viewer-title">Verse {verse.verse_number}</h2>
      </div>

      <div className="verse-text-wrapper">
        <p className="verse-text" lang={scripture.lang}>
          {/* The corpus separates pada with blank lines; under pre-wrap those
              render as a gap mid-verse. Collapse to a single line break. */}
          {scripture.text.replace(/\n\s*\n/g, "\n").trim()}
        </p>
      </div>

      <div className="verse-transliteration-wrapper">
        <p className="verse-transliteration" lang="sa-Latn">
          {verse.transliteration}
        </p>
      </div>

      <div className="verse-section-card">
        <h3 className="verse-section-title">{language === "kn" ? "ಅನುವಾದ (Translation)" : language === "te" ? "అనువాదం (Translation)" : "Translation"}</h3>
        <p className="verse-section-content" lang={translation.lang}>
          {translation.text}
        </p>
      </div>

      {commentary && (
        <div className="verse-section-card commentary">
          <h3 className="verse-section-title">{language === "kn" ? "ಭಾಷ್ಯ (Commentary)" : language === "te" ? "భాష్యం (Commentary)" : "Commentary"}</h3>
          <p className="verse-section-content" lang={commentary.lang}>
            {commentary.text}
          </p>
        </div>
      )}
    </article>
  );
});
VerseBlock.displayName = "VerseBlock";

/** The whole chapter in one scroll. `/chapter/:n/verse/:m` means "render chapter
 *  n, scrolled to verse m"; prev/next scrolls between verses instead of swapping
 *  content, and an IntersectionObserver replaceStates the URL back as you scroll. */
export const VerseViewer: React.FC<VerseViewerProps> = ({ chapter, meta, verses, targetVerse, language, onGoToVerse, onPrevChapter, onNextChapter, hasPrevChapter, hasNextChapter }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** The verse currently positioned under the header. Mirrors `active` without
   *  the render lag, so the scroll effect can tell an external nav from a scroll-spy one. */
  const activeRef = useRef<number | null>(null);
  const chapterRef = useRef<number>(chapter);
  const [active, setActive] = useState(targetVerse);
  // Adjusting state during render, the React-sanctioned way to follow a changed
  // prop: when the URL moves the target verse, the pager follows it. A move that
  // came from the scroll-spy below has already set `active`, so this bails out.
  const [seenTarget, setSeenTarget] = useState(targetVerse);
  if (seenTarget !== targetVerse) {
    setSeenTarget(targetVerse);
    setActive(targetVerse);
  }

  const first = verses.length > 0 ? verses[0].verse_number : 1;
  const last = verses.length > 0 ? verses[verses.length - 1].verse_number : 1;

  const scrollToVerse = useCallback(
    (verse: number, smooth: boolean) => {
      const el = document.getElementById(verseDomId(chapter, verse));
      if (!el) return;
      el.scrollIntoView({ behavior: smooth && !reducedMotion() ? "smooth" : "auto", block: "start" });
      // `content-visibility: auto` sizes off-screen blocks from
      // contain-intrinsic-size, so a long jump lands approximately and the real
      // heights resolve a frame later. Re-anchor once the neighbours are laid out.
      if (!smooth) requestAnimationFrame(() => document.getElementById(verseDomId(chapter, verse))?.scrollIntoView({ block: "start" }));
    },
    [chapter],
  );

  // Route -> viewport. Runs before paint so a deep link never shows the top first.
  useLayoutEffect(() => {
    if (verses.length === 0) return;
    if (chapterRef.current !== chapter) {
      chapterRef.current = chapter;
      activeRef.current = null;
    }
    if (activeRef.current === targetVerse) return; // already there (scroll-spy)

    const cold = activeRef.current === null;
    activeRef.current = targetVerse;

    // Back/forward: the router's manual scroll restoration owns the viewport.
    if (getNavKind() === "pop") return;
    // Opening a chapter at its first verse means the top of the chapter, header included.
    if (cold && targetVerse === first) return;
    scrollToVerse(targetVerse, !cold);
  }, [chapter, targetVerse, verses, first, scrollToVerse]);

  // Viewport -> route. replaceState only: scrolling must never push history.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || verses.length === 0) return;

    // The spy's decision line must be the SAME line scroll-margin-top anchors to,
    // or a verse scrolled to by prev/next sits just below the line and the spy
    // reports its predecessor. Read it off the block rather than re-deriving it.
    const anchor = Number.parseFloat(getComputedStyle(root.querySelector("[data-verse]") as HTMLElement).scrollMarginTop) || 60;
    const line = anchor + 4;
    const visible = new Set<HTMLElement>();
    let frame = 0;

    const flush = (): void => {
      frame = 0;
      if (visible.size === 0) return;
      const sorted = [...visible].sort((a, b) => Number(a.dataset.verse) - Number(b.dataset.verse));
      // The block occupying the band is the last one that starts above it.
      let chosen = sorted[0];
      for (const el of sorted) if (el.getBoundingClientRect().top <= line) chosen = el;
      const verse = Number(chosen.dataset.verse);
      if (!Number.isFinite(verse) || verse === activeRef.current) return;
      activeRef.current = verse;
      setActive(verse);
      syncVerseUrl(chapter, verse);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
          else visible.delete(entry.target as HTMLElement);
        }
        if (!frame) frame = requestAnimationFrame(flush);
      },
      { rootMargin: `-${Math.round(line)}px 0px -70% 0px`, threshold: 0 },
    );

    for (const el of root.querySelectorAll<HTMLElement>("[data-verse]")) io.observe(el);
    return () => {
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [chapter, verses]);

  const goPrev = useCallback(() => {
    const index = verses.findIndex((v) => v.verse_number === active);
    if (index > 0) return onGoToVerse(verses[index - 1].verse_number);
    onPrevChapter();
  }, [active, verses, onGoToVerse, onPrevChapter]);

  const goNext = useCallback(() => {
    const index = verses.findIndex((v) => v.verse_number === active);
    if (index !== -1 && index < verses.length - 1) return onGoToVerse(verses[index + 1].verse_number);
    onNextChapter();
  }, [active, verses, onGoToVerse, onNextChapter]);

  const hasPrev = active > first || hasPrevChapter;
  const hasNext = active < last || hasNextChapter;

  return (
    <div className="verse-viewer-container" ref={containerRef}>
      <header className="chapter-head">
        <span className="chapter-badge">Chapter {chapter}</span>
        <h1 className="chapter-head-name">{meta.name}</h1>
        <p className="chapter-meaning">{meta.name_meaning}</p>
        <p className="chapter-summary">{meta.summary}</p>
      </header>

      {verses.length === 0 ? (
        <p className="verse-viewer-loading">Loading chapter…</p>
      ) : (
        verses.map((verse) => <VerseBlock key={verse.verse_number} chapter={chapter} verse={verse} language={language} />)
      )}

      <div className="verse-pager">
        <button type="button" className="btn btn-compact pressable" onClick={goPrev} disabled={!hasPrev} aria-label="Previous verse">
          <ChevronLeft size={18} /> Prev
        </button>
        <span className="verse-pager-label" aria-live="polite">
          {chapter}.{active} <span className="verse-pager-total">of {last}</span>
        </span>
        <button type="button" className="btn btn-compact pressable" onClick={goNext} disabled={!hasNext} aria-label="Next verse">
          Next <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};
