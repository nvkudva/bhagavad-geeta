import { BookOpen, Globe, Moon, Sun } from "lucide-react";
import type React from "react";

export type Language = "en" | "kn" | "te";

interface HeaderProps {
  theme: "dark" | "light";
  toggleTheme: () => void;
  onHomeClick: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, onHomeClick, language, setLanguage }) => {
  return (
    <header className="glass-panel header-container">
      <button type="button" onClick={onHomeClick} className="header-logo-button">
        <div className="header-icon-wrapper">
          <BookOpen color="white" size={24} />
        </div>
        <h1 className="text-gradient header-title">Bhagavad-Geeta</h1>
      </button>

      <div className="header-actions">
        <div className="language-switcher">
          <Globe size={16} />
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="language-select">
            <option value="en">English</option>
            <option value="kn">ಕನ್ನಡ (Kannada)</option>
            <option value="te">తెలుగు (Telugu)</option>
          </select>
        </div>

        <button type="button" className="glass-button theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  );
};
