import { Search, X } from "lucide-react";
import type React from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { getChapterMeta } from "../lib/gita";
import type { Language } from "../lib/gita.types";
import { Link, navigate } from "../lib/router";
import type { SearchHit } from "../lib/search";
import { loadIndex, parseReference, peekIndex, search } from "../lib/search";

const PLACEHOLDER: Record<Language, string> = { en: "Search verses", kn: "ಶ್ಲೋಕಗಳನ್ನು ಹುಡುಕಿ", te: "శ్లోకాలను వెతకండి" };

/** The matched run, marked. The index carries plain strings, so this is a slice,
 *  not dangerouslySetInnerHTML. */
const Highlighted: React.FC<{ hit: SearchHit }> = ({ hit }) => {
  if (!hit.match) return <>{hit.snippet}</>;
  const [start, end] = hit.match;
  return (
    <>
      {hit.snippet.slice(0, start)}
      <mark>{hit.snippet.slice(start, end)}</mark>
      {hit.snippet.slice(end)}
    </>
  );
};

const Result: React.FC<{ hit: SearchHit }> = ({ hit }) => (
  <Link to={{ name: "verse", chapter: hit.chapter, verse: hit.verse }} className="search-result pressable">
    <span className="search-result-ref">
      {hit.chapter}.{hit.verse}
      <span className="search-result-chapter">{getChapterMeta(hit.chapter)?.name}</span>
    </span>
    <span className="search-result-snippet" lang={hit.snippetLang}>
      <Highlighted hit={hit} />
    </span>
  </Link>
);

/** Search is entirely local: one build-time index, fetched on first use and then
 *  offline forever. The URL carries the query so a search is shareable and
 *  survives back/forward. */
export const SearchScreen: React.FC<{ query: string; language: Language }> = ({ query, language }) => {
  const [value, setValue] = useState(query);
  const [rows, setRows] = useState(peekIndex);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Deferred so typing stays responsive while 701 rows are scanned; the scan
  // itself is ~1 ms, the render of 60 results is what benefits.
  const deferred = useDeferredValue(value);

  useEffect(() => {
    if (rows) return;
    let cancelled = false;
    loadIndex()
      .then((loaded) => {
        if (!cancelled) setRows(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  // A shared /search?q=… link should show its results without the reader typing.
  useEffect(() => {
    setValue(query);
  }, [query]);

  // Keep the URL in step, without a history entry per keystroke.
  useEffect(() => {
    const id = setTimeout(() => navigate({ name: "search", q: deferred }, { replace: true, scroll: "preserve" }), 250);
    return () => clearTimeout(id);
  }, [deferred]);

  const reference = useMemo(() => parseReference(deferred), [deferred]);
  const hits = useMemo(() => (rows && !reference ? search(rows, deferred) : []), [rows, deferred, reference]);

  const trimmed = deferred.trim();

  return (
    <div className="animate-fade-in search-screen">
      <div className="search-field">
        <Search size={18} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={PLACEHOLDER[language]}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label={PLACEHOLDER[language]}
        />
        {value && (
          <button
            type="button"
            className="search-clear pressable"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
            }}>
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      {reference && (
        <Link to={{ name: "verse", chapter: reference.chapter, verse: reference.verse }} className="search-reference pressable">
          Go to verse {reference.chapter}.{reference.verse}
          <span className="search-result-chapter">{getChapterMeta(reference.chapter)?.name}</span>
        </Link>
      )}

      {failed && <p className="search-status">Search data could not be loaded. Check your connection and try again.</p>}

      {!failed && !reference && trimmed.length >= 2 && (
        <>
          <p className="search-status" aria-live="polite">
            {!rows ? "Preparing search…" : hits.length === 0 ? `No verses match “${trimmed}”` : `${hits.length}${hits.length === 60 ? "+" : ""} ${hits.length === 1 ? "verse" : "verses"}`}
          </p>
          <div className="search-results">
            {hits.map((hit) => (
              <Result key={`${hit.chapter}.${hit.verse}`} hit={hit} />
            ))}
          </div>
        </>
      )}

      {!failed && trimmed.length < 2 && <p className="search-hint">Search the Sanskrit, the transliteration or the English translation — or type a reference like 2.47.</p>}
    </div>
  );
};
