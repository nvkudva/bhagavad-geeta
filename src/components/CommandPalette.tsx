import { Bookmark, Book, CornerDownLeft, Search, Settings2, SunMoon } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { chapterName, chapterText, getChapters } from "../lib/gita";
import { navigate } from "../lib/router";
import type { Route } from "../lib/router";
import { loadIndex, parseReference, peekIndex, search } from "../lib/search";
import { useSettings } from "../lib/settings";

const chapters = getChapters();

type Item = {
  id: string;
  group: string;
  ref?: string;
  label: string;
  lang?: string;
  run: () => void;
};

const go = (route: Route) => () => navigate(route);

/** ⌘K. A native <dialog>, so the focus trap, Esc and the scrim backdrop are the
 *  platform's rather than ours. Mounted only at desktop width — on a phone the
 *  /search route is the whole search experience and this never exists. */
export const CommandPalette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(peekIndex);
  const [cursor, setCursor] = useState(0);
  const { language, toggleTheme } = useSettings();

  // showModal, not the `open` attribute: only the former gives the top layer,
  // the ::backdrop and the focus trap. Mounted only while open, so there is no
  // stale query to reset.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (rows) return;
    let cancelled = false;
    loadIndex()
      .then((loaded) => {
        if (!cancelled) setRows(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const items = useMemo<Item[]>(() => {
    const trimmed = query.trim();
    const out: Item[] = [];

    const reference = parseReference(trimmed);
    if (reference) {
      out.push({
        id: `ref-${reference.chapter}.${reference.verse}`,
        group: "Go to",
        ref: `${reference.chapter}.${reference.verse}`,
        label: chapterName(reference.chapter, language) ?? "Verse",
        run: go({ name: "verse", chapter: reference.chapter, verse: reference.verse }),
      });
    }

    if (trimmed.length >= 2) {
      const q = trimmed.toLowerCase();
      for (const chapter of chapters) {
        // Matched against every script the chapter has a name in, so a reader
        // typing "Sankhya" finds it while reading in Kannada, and one typing
        // ಸಾಂಖ್ಯ finds it while reading in English.
        const haystack = [chapter.id, chapter.name, chapter.name_meaning, chapter.name_kannada, chapter.name_telugu, chapter.name_meaning_kannada, chapter.name_meaning_telugu].join(" ").toLowerCase();
        if (!haystack.includes(q)) continue;
        const name = chapterText(chapter, "name", language);
        const meaning = chapterText(chapter, "name_meaning", language);
        out.push({
          id: `ch-${chapter.id}`,
          group: "Chapters",
          ref: `${chapter.id}`,
          label: `${name.text} — ${meaning.text}`,
          lang: name.lang === meaning.lang ? name.lang : undefined,
          run: go({ name: "verse", chapter: chapter.id, verse: 1 }),
        });
        if (out.length > 12) break;
      }

      if (rows && !reference) {
        for (const hit of search(rows, trimmed, 8)) {
          out.push({
            id: `v-${hit.chapter}.${hit.verse}`,
            group: "Verses",
            ref: `${hit.chapter}.${hit.verse}`,
            label: hit.snippet,
            lang: hit.snippetLang,
            run: go({ name: "verse", chapter: hit.chapter, verse: hit.verse }),
          });
        }
      }

      if (trimmed.length >= 2) {
        out.push({
          id: "all-results",
          group: "Verses",
          label: `Search all verses for “${trimmed}”`,
          run: go({ name: "search", q: trimmed }),
        });
      }
    }

    if (trimmed.length < 2) {
      out.push(
        { id: "a-home", group: "Go to", label: "Chapters", run: go({ name: "home" }) },
        { id: "a-saved", group: "Go to", label: "Saved verses", run: go({ name: "saved" }) },
        { id: "a-settings", group: "Go to", label: "Settings", run: go({ name: "settings" }) },
        { id: "a-theme", group: "Actions", label: "Toggle light / dark", run: toggleTheme },
      );
    }

    return out;
  }, [query, rows, language, toggleTheme]);

  // Keep the highlighted row in view as the cursor walks past the fold.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const runAt = (i: number): void => {
    const item = items[i];
    if (!item) return;
    onClose();
    item.run();
  };

  let lastGroup = "";

  return (
    <dialog
      ref={dialogRef}
      className="desk-dialog"
      aria-label="Command palette"
      onClose={onClose}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop: the
        // content is all inside children.
        if (event.target === dialogRef.current) onClose();
      }}>
      <div className="palette-field">
        <Search size={18} aria-hidden />
        {/* The palette exists to be typed into; focusing it is the point. */}
        <input
          autoFocus
          type="text"
          className="palette-input"
          value={query}
          placeholder="Search verses, chapters, or type 2.47…"
          aria-label="Search verses, chapters, or a verse reference"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={items[cursor] ? `palette-${items[cursor].id}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((c) => (items.length === 0 ? 0 : (c + 1) % items.length));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((c) => (items.length === 0 ? 0 : (c - 1 + items.length) % items.length));
            } else if (event.key === "Enter") {
              event.preventDefault();
              runAt(cursor);
            }
          }}
        />
        <kbd>Esc</kbd>
      </div>

      <ul className="palette-list" id="palette-list" role="listbox" aria-label="Results" ref={listRef}>
        {items.length === 0 ? (
          <li className="palette-empty">No matches</li>
        ) : (
          items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id}>
                {header && <div className="palette-group">{header}</div>}
                <div id={`palette-${item.id}`} role="option" aria-selected={i === cursor} className="palette-option" data-active={i === cursor ? "true" : "false"} onMouseMove={() => setCursor(i)} onClick={() => runAt(i)}>
                  {item.ref ? (
                    <span className="palette-option-ref">{item.ref}</span>
                  ) : (
                    <span className="palette-option-ref" aria-hidden>
                      {item.group === "Actions" ? <SunMoon size={15} /> : item.id === "a-saved" ? <Bookmark size={15} /> : item.id === "a-settings" ? <Settings2 size={15} /> : <Book size={15} />}
                    </span>
                  )}
                  <span className="palette-option-text" lang={item.lang}>
                    {item.label}
                  </span>
                  {i === cursor && <CornerDownLeft size={14} aria-hidden style={{ opacity: 0.5 }} />}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </dialog>
  );
};
