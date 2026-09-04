import { ChevronLeft, Globe, Moon, Sun } from "lucide-react";
import type React from "react";
import { Logo } from "./Logo";

export type Language = "en" | "kn" | "te";

interface HeaderProps {
  theme: "dark" | "light";
  toggleTheme: () => void;
  onHomeClick: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  /** iOS-style contextual leading item. Absent on Home; on a pushed screen it is
   *  labelled with the screen it returns to. */
  back?: { label: string; onClick: () => void };
  title: string;
}

/** The edge-to-edge sticky nav bar of DESIGN_PLAN §3.3. Language and theme stay
 *  here until the Settings screen exists (§4.7 is P1). */
export const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, onHomeClick, language, setLanguage, back, title }) => {
  return (
    <header className="app-nav">
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

      <div className="nav-actions">
        <div className="language-switcher">
          <Globe size={16} aria-hidden />
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="language-select" aria-label="Language">
            <option value="en">English</option>
            <option value="kn">ಕನ್ನಡ</option>
            <option value="te">తెలుగు</option>
          </select>
        </div>

        <button type="button" className="icon-button pressable" onClick={toggleTheme} aria-label="Toggle dark mode">
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  );
};
