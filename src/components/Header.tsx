import { ChevronLeft } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
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
}

/** The scroll distance the condense is spread over — one line of the large
 *  title, so the material is fully in by the time that title has slid under it. */
const CONDENSE_OVER = 52;

/** The edge-to-edge sticky nav bar of DESIGN_PLAN §3.3. Global navigation lives
 *  in the bottom tab bar; the nav carries only the leading item and the title. */
export const Header: React.FC<HeaderProps> = ({ onHomeClick, back, title, largeTitle }) => {
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

        {(back || largeTitle) && <span className="nav-title nav-title-centered">{title}</span>}
      </div>

      {largeTitle && <h1 className="nav-large-title">{largeTitle}</h1>}
    </header>
  );
};
