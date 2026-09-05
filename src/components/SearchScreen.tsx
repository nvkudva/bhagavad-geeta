import { Clock, Search, X } from "lucide-react";
import type React from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { chapterName } from "../lib/gita";
import type { Language } from "../lib/gita.types";
import { clearSearchHistory, rememberSearch, useSearchHistory } from "../lib/history";
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

const Result: React.FC<{ hit: SearchHit; language: Language; onOpen: () => void }> = ({ hit, language, onOpen }) => (
  <Link to={{ name: "verse", chapter: hit.chapter, verse: hit.verse }} className="search-result pressable" onClick={onOpen}>
    <span className="search-result-ref">
      {hit.chapter}.{hit.verse}
      <span className="search-result-chapter">{chapterName(hit.chapter, language)}</span>
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
  const [focused, setFocused] = useState(false);
  const history = useSearchHistory();

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

  // Recorded on the two gestures that mean the reader meant it — submitting the
  // query, or opening one of its results. Recording as they type would file a
  // trail of every prefix of the word.
  const remember = () => rememberSearch(value);

  const showRecents = trimmed.length < 2 && history.length > 0;

  return (
    <div className="animate-fade-in search-screen" data-empty={value === "" && !focused ? "true" : "false"}>
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
          // The field rises on focus, not on the first keystroke: on iOS the
          // keyboard scrolls the focused element into view, and a field sitting
          // 200-odd px down a page that is barely taller than the viewport gets
          // scrolled clean off the top.
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            remember();
            inputRef.current?.blur();
          }}
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
          <span className="search-result-chapter">{chapterName(reference.chapter, language)}</span>
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
              <Result key={`${hit.chapter}.${hit.verse}`} hit={hit} language={language} onOpen={remember} />
            ))}
          </div>
        </>
      )}

      {showRecents && (
        <section className="search-recents">
          <div className="search-recents-head">
            <h3 className="settings-group-label">Recent</h3>
            <button type="button" className="search-recents-clear pressable" onClick={clearSearchHistory}>
              Clear
            </button>
          </div>
          {history.map((item) => (
            <button
              key={item}
              type="button"
              className="search-recent pressable"
              onClick={() => {
                setValue(item);
                inputRef.current?.focus();
              }}>
              <Clock size={16} aria-hidden />
              <span className="search-recent-label">{item}</span>
            </button>
          ))}
        </section>
      )}

      {!failed && !showRecents && trimmed.length < 2 && (
        <p className="search-hint">Search the Sanskrit, the transliteration or the English translation — or type a reference like 2.47.</p>
      )}
    </div>
  );
};
