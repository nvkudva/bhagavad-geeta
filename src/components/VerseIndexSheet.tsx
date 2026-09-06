import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Verse } from "../lib/gita.types";

interface VerseIndexSheetProps {
  open: boolean;
  chapter: number;
  chapterName?: string;
  verses: readonly Verse[];
  active: number;
  onGoToVerse: (verse: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  hasPrevChapter: boolean;
  hasNextChapter: boolean;
  onClose: () => void;
}

/** Past this the sheet is going away rather than being nudged. */
const DISMISS_PX = 64;

/** The phone's answer to the wide reader's `.verse-rail`: the whole chapter as
 *  a grid of numbers, raised from the pager. The rail can be a permanent
 *  sidebar because a wide window has room to spare; 375pt does not, so the
 *  index is summoned and dismissed instead of standing there costing a third of
 *  the reading column. */
export const VerseIndexSheet: React.FC<VerseIndexSheetProps> = ({
  open,
  chapter,
  chapterName,
  verses,
  active,
  onGoToVerse,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter,
  hasNextChapter,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  /** Where the finger went down, and how far it has pulled the sheet since. */
  const dragFrom = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A chapter is up to 78 numbers, so the grid scrolls; opening it with verse 47
  // below the fold would be an index that has to be searched. Centre the verse
  // being read — the same placement the rail makes on a deep link.
  useLayoutEffect(() => {
    if (!open) return;
    const grid = gridRef.current;
    const cell = grid?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!grid || !cell) return;
    grid.scrollTop = cell.offsetTop - grid.clientHeight / 2 + cell.offsetHeight / 2;
  }, [open, chapter, active]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === "mouse") return;
    dragFrom.current = event.clientY;
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (dragFrom.current === null) return;
    // Downward only: dragging up would lift the sheet off its own bottom edge.
    setDragY(Math.max(0, event.clientY - dragFrom.current));
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragFrom.current === null) return;
    dragFrom.current = null;
    setDragY((y) => {
      if (y > DISMISS_PX) onClose();
      return 0;
    });
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="verse-sheet"
      aria-label={`Verses in chapter ${chapter}`}
      style={dragY > 0 ? { translate: `0 ${dragY}px`, transition: "none" } : undefined}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}>
      <div
        className="verse-sheet-drag"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}>
        <div className="verse-sheet-grabber" aria-hidden />
        <div className="verse-sheet-head">
          <button
            type="button"
            className="pager-btn pressable"
            onClick={onPrevChapter}
            disabled={!hasPrevChapter}
            aria-label={`Chapter ${chapter - 1}`}>
            <ChevronLeft size={18} strokeWidth={2.5} aria-hidden />
          </button>
          <span className="verse-sheet-head-text">
            <span className="verse-sheet-eyebrow">Chapter {chapter}</span>
            {chapterName && <span className="verse-sheet-name">{chapterName}</span>}
          </span>
          <button
            type="button"
            className="pager-btn pressable"
            onClick={onNextChapter}
            disabled={!hasNextChapter}
            aria-label={`Chapter ${chapter + 1}`}>
            <ChevronRight size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

      <div className="verse-sheet-grid" ref={gridRef}>
        {verses.map((v) => (
          <button
            key={v.verse_number}
            type="button"
            className="verse-sheet-cell pressable"
            aria-current={v.verse_number === active ? "true" : undefined}
            aria-label={`Verse ${chapter}.${v.verse_number}`}
            onClick={() => {
              onGoToVerse(v.verse_number);
              onClose();
            }}>
            {v.verse_number}
          </button>
        ))}
      </div>
    </dialog>
  );
};
