import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { setBookTurn } from "../lib/book";
import { chapterText, getChapterMeta, isReaderResident, loadReader, peekChapter } from "../lib/gita";
import type { Verse } from "../lib/gita.types";
import { syncBookUrl } from "../lib/router";
import { readableScripture } from "../lib/scripture";
import { useSettings } from "../lib/settings";

/* Book View: one chapter set as a continuous flow and fragmented into pages by
   the browser's own multicol engine (docs/BOOK_VIEW_SPEC.md). Nothing here is a
   card — the spread is paper, and the only chrome is what a printed page has:
   running heads, folios, and a spine.

   The whole chapter stays in the DOM. Off-spread columns are clipped, not
   hidden, so find-in-page, Select All and a screen reader's virtual cursor all
   traverse the chapter as one text. */

const NO_VERSES: readonly Verse[] = [];

/** Turn threshold for a trackpad flick, and for a mouse wheel notch (~100px),
 *  which must not turn a page on its own. */
const WHEEL_X = 60;
const WHEEL_Y = 120;
/** How still the pointer must be before another flick is allowed. */
const WHEEL_REST_MS = 200;
/** Past this fraction of a page, a release completes the turn. */
const DRAG_COMMIT = 0.12;
const DRAG_VELOCITY = 0.5;

const anchorId = (chapter: number, verse: number): string => `c${chapter}v${verse}`;

/** The gloss string is "term—meaning; term—meaning". Set as one run-in
 *  paragraph: read as a list it would be forty "list item" announcements. */
const glossRun = (context: string): string =>
  context
    .split(";")
    .map((pair) => pair.trim().replace(/—/g, " · "))
    .filter(Boolean)
    .join(" · ");

const VerseRun: React.FC<{ verse: Verse; chapter: number; language: string; sections: ReturnType<typeof useSettings>["sections"] }> = ({ verse, chapter, language, sections }) => {
  const scripture = language === "kn" ? (verse.text_kannada ?? verse.text) : language === "te" ? (verse.text_telugu ?? verse.text) : verse.text;
  const scriptureLang = language === "en" ? "sa" : language;
  const translation = language === "kn" ? (verse.translation_kannada ?? verse.translation_english) : language === "te" ? (verse.translation_telugu ?? verse.translation_english) : verse.translation_english;
  const translationLang = language === "kn" && verse.translation_kannada ? "kn" : language === "te" && verse.translation_telugu ? "te" : "en";
  const commentary = language === "kn" ? (verse.commentary_kannada ?? verse.commentary_english) : language === "te" ? (verse.commentary_telugu ?? verse.commentary_english) : verse.commentary_english;
  const commentaryLang = language === "kn" && verse.commentary_kannada ? "kn" : language === "te" && verse.commentary_telugu ? "te" : "en";

  return (
    <article className="book-verse">
      <h2 className="book-sr-only">Verse {verse.verse_number}</h2>
      {sections.text && (
        <p className="book-scripture book-verse-head" lang={scriptureLang}>
          <span className="book-folio-num" id={anchorId(chapter, verse.verse_number)} aria-hidden>
            {chapter}.{verse.verse_number}
          </span>
          {readableScripture(scripture)}
        </p>
      )}
      {sections.transliteration && (
        <p className="book-translit" lang="sa-Latn">
          {verse.transliteration}
        </p>
      )}
      {sections.translation && translation && (
        <p className="book-prose book-trans" lang={translationLang}>
          {translation}
        </p>
      )}
      {sections.commentary && commentary && (
        <p className="book-prose book-comment" lang={commentaryLang}>
          {commentary}
          {verse.commentary_author && <span className="book-attrib"> — {verse.commentary_author}</span>}
        </p>
      )}
      {sections.words && verse.context_english && (
        <p className="book-prose book-words" lang="en">
          <b className="book-words-label">Words </b>
          {glossRun(verse.context_english)}
        </p>
      )}
    </article>
  );
};

const BookView: React.FC<{ chapter: number; verse: number }> = ({ chapter, verse }) => {
  const { language, sections, readingScale, font } = useSettings();
  const [, onChapterLoaded] = useReducer((n: number) => n + 1, 0);
  const verses = peekChapter(chapter) ?? NO_VERSES;
  const meta = getChapterMeta(chapter);

  const viewportRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  /* Page geometry, read from layout rather than computed from tokens: the step
     is whatever the fragmenter actually produced. */
  const geom = useRef({ step: 1, perSpread: 1, pages: 1 });
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [drag, setDrag] = useState(0);
  const [announce, setAnnounce] = useState("");
  /** The verse the spread is anchored to. A page number means nothing across a
   *  different window, scale or language, so it is never stored. */
  const anchor = useRef(verse);

  useEffect(() => {
    if (isReaderResident(chapter)) return;
    let cancelled = false;
    void loadReader(chapter).then(() => {
      if (!cancelled) onChapterLoaded();
    });
    return () => {
      cancelled = true;
    };
  }, [chapter]);

  /** Which page a verse's run starts on. */
  const pageOfVerse = useCallback(
    (target: number): number => {
      const flow = flowRef.current;
      const el = document.getElementById(anchorId(chapter, target));
      if (!flow || !el) return 0;
      const { step, perSpread } = geom.current;
      // The flow is translated, so measure against the flow's own box rather
      // than the viewport's.
      const offset = el.getBoundingClientRect().left - flow.getBoundingClientRect().left;
      return Math.max(0, Math.floor(Math.floor(offset / step) / perSpread) * perSpread);
    },
    [chapter],
  );

  /* One measure per layout: the fragmenter has already done the work, so all
     that is read back is how wide it ended up. Re-anchoring on the verse rather
     than the page is what makes a font swap, a resize or a language change
     land the reader back where they were. */
  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const flow = flowRef.current;
    if (!viewport || !flow) return;
    const styles = getComputedStyle(flow);
    const gap = Number.parseFloat(styles.columnGap) || 0;
    const frame = flow.clientWidth;
    /* The count is declared, so the step is exact: the browser divides the box
       it has into that many columns and one gap between each. */
    const perSpread = Math.max(1, Number.parseInt(styles.columnCount, 10) || 1);
    const step = (frame + gap) / perSpread;
    const total = Math.max(1, Math.round((flow.scrollWidth + gap) / step));
    geom.current = { step, perSpread, pages: total };
    flow.style.setProperty("--book-step", `${step}px`);
    setPages(total);
    setPage(pageOfVerse(anchor.current));
  }, [pageOfVerse]);

  useLayoutEffect(measure, [measure, verses, language, sections, readingScale, font, chapter]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(() => ((frame = 0), measure()));
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    // A late font swap reflows the whole chapter and changes the page count.
    void document.fonts?.ready.then(schedule);
    return () => {
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [measure]);

  /* The anchor follows the page: the first verse that starts on this spread. A
     spread taken up entirely by one long commentary keeps the verse it began
     with rather than reporting the one before it. */
  useEffect(() => {
    if (!verses.length) return;
    const { step, perSpread } = geom.current;
    const flow = flowRef.current;
    if (!flow) return;
    const left = flow.getBoundingClientRect().left;
    let found = 0;
    for (const v of verses) {
      const el = document.getElementById(anchorId(chapter, v.verse_number));
      if (!el) continue;
      const col = Math.floor((el.getBoundingClientRect().left - left) / step);
      if (col >= page && col < page + perSpread) {
        found = v.verse_number;
        break;
      }
    }
    if (found) anchor.current = found;
    syncBookUrl(chapter, anchor.current);

    const first = page + 1;
    const last = Math.min(pages, page + perSpread);
    const id = setTimeout(() => setAnnounce(`Page ${first}${last > first ? ` to ${last}` : ""} of ${pages}. Verse ${anchor.current}.`), 250);
    return () => clearTimeout(id);
  }, [page, pages, chapter, verses]);

  const turn = useCallback((delta: number) => {
    const { perSpread, pages: total } = geom.current;
    const last = Math.max(0, (Math.ceil(total / perSpread) - 1) * perSpread);
    setPage((p) => Math.min(Math.max(0, p + delta * perSpread), last));
  }, []);

  // J/K, Space, PageUp/Down and gg/G all arrive through the shell's key layer.
  useEffect(() => {
    setBookTurn((to) => {
      if (to === "first") return setPage(0);
      if (to === "last") {
        const { perSpread, pages: total } = geom.current;
        return setPage(Math.max(0, (Math.ceil(total / perSpread) - 1) * perSpread));
      }
      turn(to);
    });
    return () => setBookTurn(null);
  }, [turn]);

  /* One wheel listener, claimed only once the gesture is unambiguous, so a
     wheel that belongs to the sidebar is never swallowed. */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let acc = 0;
    let locked = false;
    let restTimer = 0;
    const onWheel = (event: WheelEvent) => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = horizontal ? event.deltaX : event.deltaY;
      const threshold = horizontal ? WHEEL_X : WHEEL_Y;
      window.clearTimeout(restTimer);
      restTimer = window.setTimeout(() => {
        acc = 0;
        locked = false;
      }, WHEEL_REST_MS);
      if (locked) {
        event.preventDefault();
        return;
      }
      acc += delta;
      if (Math.abs(acc) < threshold) return;
      event.preventDefault();
      turn(acc > 0 ? 1 : -1);
      acc = 0;
      locked = true;
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      window.clearTimeout(restTimer);
    };
  }, [turn]);

  /* A drag is animated motion, so it is not installed at all under
     prefers-reduced-motion. Below the claim threshold the pointer belongs to
     text selection and this handler stays out of the way. */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let claimed = false;
    let active = false;

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      active = true;
      claimed = false;
      startX = event.clientX;
      startY = event.clientY;
      startTime = event.timeStamp;
    };
    const onMove = (event: PointerEvent) => {
      if (!active) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!claimed) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < 2 * Math.abs(dy)) return;
        claimed = true;
        viewport.setPointerCapture(event.pointerId);
      }
      setDrag(dx);
    };
    const onUp = (event: PointerEvent) => {
      if (!active) return;
      active = false;
      if (!claimed) return;
      const dx = event.clientX - startX;
      const velocity = Math.abs(dx) / Math.max(1, event.timeStamp - startTime);
      setDrag(0);
      if (Math.abs(dx) > DRAG_COMMIT * geom.current.step || velocity > DRAG_VELOCITY) turn(dx < 0 ? 1 : -1);
    };

    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerup", onUp);
    viewport.addEventListener("pointercancel", onUp);
    return () => {
      viewport.removeEventListener("pointerdown", onDown);
      viewport.removeEventListener("pointermove", onMove);
      viewport.removeEventListener("pointerup", onUp);
      viewport.removeEventListener("pointercancel", onUp);
    };
  }, [turn]);

  /* Moving focus or a screen reader's cursor into a clipped column makes the
     browser scroll the viewport. Convert that into a real turn so the visible
     spread and the cursor never disagree — the transform owns position. */
  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (!el.scrollLeft) return;
    const { step, perSpread } = geom.current;
    const moved = Math.round(el.scrollLeft / step);
    el.scrollLeft = 0;
    if (moved) setPage((p) => Math.max(0, Math.floor((p + moved) / perSpread) * perSpread));
  };

  if (!meta) return null;

  const name = chapterText(meta, "name", language);
  const meaning = chapterText(meta, "name_meaning", language);
  const summary = chapterText(meta, "summary", language);
  const { perSpread } = geom.current;
  const lastOnSpread = Math.min(pages, page + perSpread);
  const progress = pages > 0 ? Math.min(1, lastOnSpread / pages) : 0;

  return (
    <div className="book" style={{ "--book-page": page, "--book-drag": `${drag}px` } as React.CSSProperties}>
      <div className="book-spread">
        <button type="button" className="book-turn book-turn-prev" onClick={() => turn(-1)} disabled={page === 0} aria-label="Previous page" aria-keyshortcuts="K PageUp" />

        <div className="book-viewport" ref={viewportRef} onScroll={onScroll}>
          <div className="book-flow" ref={flowRef} tabIndex={0} role="region" aria-label={`Chapter ${chapter}, ${name.text}, book view`}>
            <header className="book-opener">
              <p className="book-opener-number">Chapter {chapter}</p>
              <h1 className="book-opener-name" lang={name.lang}>
                {name.text}
              </h1>
              <p className="book-opener-meaning" lang={meaning.lang}>
                {meaning.text}
              </p>
              <p className="book-opener-summary" lang={summary.lang}>
                {summary.text}
              </p>
            </header>

            {verses.length === 0 ? <p className="book-loading">Loading chapter…</p> : verses.map((v) => <VerseRun key={v.verse_number} verse={v} chapter={chapter} language={language} sections={sections} />)}
          </div>
        </div>

        <button type="button" className="book-turn book-turn-next" onClick={() => turn(1)} disabled={lastOnSpread >= pages} aria-label="Next page" aria-keyshortcuts="J PageDown" />

        {/* Print furniture: a running head on the verso, the folio on each
            outer corner, and a hairline of progress across the foot. */}
        <p className="book-head book-head-verso" aria-hidden>
          {chapter} · {name.text}
        </p>
        <p className="book-head book-head-recto" aria-hidden>
          Verse {anchor.current}
        </p>
        <p className="book-folio book-folio-verso" aria-hidden>
          {page + 1}
        </p>
        <p className="book-folio book-folio-recto" aria-hidden>
          {lastOnSpread} / {pages}
        </p>
        <div className="book-progress" aria-hidden>
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>

      <p className="book-sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
    </div>
  );
};

export default BookView;
