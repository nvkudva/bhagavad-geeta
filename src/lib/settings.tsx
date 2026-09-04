/* eslint-disable react-refresh/only-export-components */
// Theme and language are durable user preferences, not routing state. They live here
// so that changing them does not re-render the router (ARCHITECTURE_PLAN §3.3).
import type React from "react";
import { createContext, use, useCallback, useMemo, useState } from "react";
import type { Language } from "./gita.types";

export type Theme = "light" | "dark";

/** The five parts of a verse the reader can turn off independently. Someone
 *  memorising works from the sloka alone; someone studying wants the glosses
 *  and nothing else. */
export type SectionKey = "text" | "transliteration" | "translation" | "commentary" | "words";
export type Sections = Record<SectionKey, boolean>;

export const SECTION_KEYS: readonly SectionKey[] = ["text", "transliteration", "translation", "commentary", "words"];

interface Settings {
  theme: Theme;
  toggleTheme: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  sections: Sections;
  toggleSection: (key: SectionKey) => void;
}

const SettingsContext = createContext<Settings | null>(null);

// The pre-paint inline script in index.html has already resolved and applied the theme.
const readTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

// The browser/OS chrome has to follow the app's theme, not the OS setting, because
// the app is dark by default on a light OS.
const THEME_COLOR: Record<Theme, string> = { dark: "#0A0A0B", light: "#FFFFFF" };
const paintThemeColor = (theme: Theme): void => {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
};

const ALL_ON: Sections = { text: true, transliteration: true, translation: true, commentary: true, words: true };

/** Everything is on unless it was explicitly turned off, so a stored value from
 *  an older build that predates a key still yields a visible section. */
const readSections = (): Sections => {
  try {
    const saved = JSON.parse(localStorage.getItem("gita-sections") ?? "null") as Partial<Sections> | null;
    if (!saved) return ALL_ON;
    return { ...ALL_ON, ...Object.fromEntries(SECTION_KEYS.map((k) => [k, saved[k] !== false])) } as Sections;
  } catch {
    return ALL_ON;
  }
};

const readLanguage = (): Language => {
  const saved = localStorage.getItem("gita-language");
  return saved === "kn" || saved === "te" || saved === "en" ? saved : "en";
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [language, setLanguageState] = useState<Language>(readLanguage);
  const [sections, setSections] = useState<Sections>(readSections);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      paintThemeColor(next);
      localStorage.setItem("gita-theme", next);
      return next;
    });
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("gita-language", lang);
  }, []);

  const toggleSection = useCallback((key: SectionKey) => {
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("gita-sections", JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<Settings>(
    () => ({ theme, toggleTheme, language, setLanguage, sections, toggleSection }),
    [theme, toggleTheme, language, setLanguage, sections, toggleSection],
  );

  return <SettingsContext value={value}>{children}</SettingsContext>;
};

export function useSettings(): Settings {
  const value = use(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside <SettingsProvider>");
  return value;
}
