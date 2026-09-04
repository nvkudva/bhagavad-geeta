import { ChevronLeft } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
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

/** Past this many pixels the bar condenses: material, hairline and specular
 *  fade in, the large title is pulled up. 40 is roughly one line of the title,
 *  so the collapse starts as soon as it begins to slide under the bar. */
const CONDENSE_AT = 40;

/** The edge-to-edge sticky nav bar of DESIGN_PLAN §3.3. Global navigation lives
 *  in the bottom tab bar; the nav carries only the leading item and the title. */
export const Header: React.FC<HeaderProps> = ({ onHomeClick, back, title, largeTitle }) => {
  const [scrolled, setScrolled] = useState(() => window.scrollY > CONDENSE_AT);

  useEffect(() => {
    // Passive and idempotent: the listener only ever writes when the boolean
    // actually flips, so a scroll frame costs one comparison and no React work.
    const onScroll = () => setScrolled((was) => (window.scrollY > CONDENSE_AT) === was ? was : !was);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="app-nav" data-scrolled={scrolled ? "true" : "false"}>
      <div className="app-nav-bar">
        {back ? (
          <button type="button" onClick={back.onClick} className="nav-back-button pressable">
            <ChevronLeft size={22} aria-hidden />
            <span className="nav-back-label">{back.label}</span>
          </button>
        ) : (
          <button type="button" onClick={onHomeClick} className="nav-logo-button pressable">
            <Logo size={40} />
            <span className="nav-title">{title}</span>
          </button>
        )}

        {back && <span className="nav-title nav-title-centered">{title}</span>}
      </div>

      {largeTitle && <h1 className="nav-large-title">{largeTitle}</h1>}
    </header>
  );
};
