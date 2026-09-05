import { Bookmark, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { removeBookmark, useBookmarks } from "../lib/bookmarks";
import { chapterName } from "../lib/gita";
import type { Language } from "../lib/gita.types";
import { Link } from "../lib/router";
import { loadIndex, peekIndex } from "../lib/search";

/** Previews come from the search index, not from the chapter files: a reader
 *  with saved verses spread over ten chapters would otherwise pull a megabyte
 *  to render ten two-line cards. */
type Row = readonly [number, number, string, string, string, string, string];

const scriptureOf = (row: Row, language: Language): { text: string; lang: string } => {
  if (language === "kn" && row[3]) return { text: row[3], lang: "kn" };
  if (language === "te" && row[4]) return { text: row[4], lang: "te" };
  return { text: row[2], lang: "sa" };
};

export const SavedScreen: React.FC<{ language: Language }> = ({ language }) => {
  const bookmarks = useBookmarks();
  const [rows, setRows] = useState(peekIndex);

  useEffect(() => {
    if (rows || bookmarks.length === 0) return;
    let cancelled = false;
    loadIndex()
      .then((loaded) => {
        if (!cancelled) setRows(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rows, bookmarks.length]);

  const byId = useMemo(() => new Map((rows ?? []).map((row) => [`${row[0]}.${row[1]}`, row as Row])), [rows]);

  if (bookmarks.length === 0) {
    return (
      <div className="animate-fade-in screen-placeholder">
        <div className="screen-placeholder-icon">
          <Bookmark size={44} />
        </div>
        <h2>Nothing saved yet</h2>
        <p>Tap the bookmark on any verse to keep it here. Saved verses stay on this device and work offline.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in saved-screen">
      <h2 className="settings-heading">Saved</h2>
      <p className="saved-count">
        {bookmarks.length} {bookmarks.length === 1 ? "verse" : "verses"}
      </p>

      <div className="saved-list">
        {bookmarks.map((bookmark) => {
          const row = byId.get(`${bookmark.chapter}.${bookmark.verse}`);
          const scripture = row ? scriptureOf(row, language) : null;
          return (
            <div key={`${bookmark.chapter}.${bookmark.verse}`} className="saved-item">
              <Link to={{ name: "verse", chapter: bookmark.chapter, verse: bookmark.verse }} className="saved-item-link pressable">
                <span className="search-result-ref">
                  {bookmark.chapter}.{bookmark.verse}
                  <span className="search-result-chapter">{chapterName(bookmark.chapter, language)}</span>
                </span>
                {scripture && (
                  <span className="saved-item-text" lang={scripture.lang}>
                    {scripture.text.replace(/\n\s*\n/g, "\n").trim()}
                  </span>
                )}
                {row && <span className="saved-item-translation">{row[6]}</span>}
              </Link>

              <button
                type="button"
                className="saved-item-remove pressable"
                aria-label={`Remove verse ${bookmark.chapter}.${bookmark.verse} from saved`}
                onClick={() => removeBookmark(bookmark.chapter, bookmark.verse)}>
                <Trash2 size={17} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
