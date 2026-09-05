import { ChevronLeft, Search, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";

interface HeaderProps {
  onHomeClick: () => void;
  /** iOS-style contextual leading item. Absent on Home; on a pushed screen it is
   *  labelled with the screen it returns to. */
  back?: { label: string; onClick: () => void };
  title: string;
  /** When present, a 34px large title sits below the bar and collapses into it
   *  on scroll, the way a UINavigationBar with prefersLargeTitles does. */
  largeTitle?: string;
  /** Trailing bar item, in the slot a UINavigationItem's rightBarButtonItem
   *  occupies. Used to reach Settings on screens with no tab bar. */
  trailing?: React.ReactNode;
  /** The search field itself, sitting in the bar. Only supplied at the widths
   *  where the tab bar's Search destination is not on screen. */
  search?: { query: string; placeholder: string; onQueryChange: (query: string) => void };
}

/** The scroll distance the condense is spread over — one line of the large
 *  title, so the material is fully in by the time that title has slid under it. */
const CONDENSE_OVER = 52;

/** A live field, not a launcher: typing walks the search route forward, and the
 *  route walking back — a shared link, the back button — writes the field. */
const NavSearch: React.FC<NonNullable<HeaderProps["search"]>> = ({ query, placeholder, onQueryChange }) => {
  const [value, setValue] = useState(query);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(query);
  }, [query]);

  // One history-less navigation per pause in the typing, the same 250ms the
  // search screen's own field used before it moved up here.
  useEffect(() => {
    if (value === query) return;
    const id = setTimeout(() => onQueryChange(value), 250);
    return () => clearTimeout(id);
  }, [value, query, onQueryChange]);

  return (
    <div className="nav-search">
      <Search size={16} strokeWidth={2} aria-hidden />
      <input
        ref={ref}
        type="search"
        className="search-input nav-search-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setValue("");
            ref.current?.blur();
          }
        }}
      />
      {value && (
        <button
          type="button"
          className="search-clear pressable"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            ref.current?.focus();
          }}>
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
};

/** The edge-to-edge sticky nav bar of DESIGN_PLAN §3.3. Global navigation lives
 *  in the bottom tab bar; the nav carries only the leading item and the title. */
export const Header: React.FC<HeaderProps> = ({ onHomeClick, back, title, largeTitle, trailing, search }) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let frame = 0;
    // Material, hairline and large-title collapse all hang off this one 0→1
    // variable, written straight onto the element: the bar tracks the finger,
    // and React never re-renders on scroll.
    const write = () => {
      frame = 0;
      const progress = Math.min(1, Math.max(0, window.scrollY / CONDENSE_OVER));
      ref.current?.style.setProperty("--nav-progress", progress.toFixed(3));
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(write);
    };
    write();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className="app-nav" ref={ref} data-large={largeTitle ? "true" : "false"}>
      <div className="app-nav-bar">
        {back ? (
          <button type="button" onClick={back.onClick} className="nav-back-button pressable" aria-label={back.label}>
            <ChevronLeft size={17} strokeWidth={2.5} aria-hidden />
          </button>
        ) : (
          <button type="button" onClick={onHomeClick} className="nav-logo-button pressable" aria-label={title}>
            <Logo size={40} />
            {!largeTitle && <span className="nav-title">{title}</span>}
          </button>
        )}

        {(back || largeTitle) && <span className="nav-title nav-title-compact">{title}</span>}

        {search && <NavSearch {...search} />}

        {trailing}
      </div>

      {largeTitle && <h1 className="nav-large-title">{largeTitle}</h1>}
    </header>
  );
};
