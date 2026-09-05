/* eslint-disable react-refresh/only-export-components */
// Theme and language are durable user preferences, not routing state. They live here
// so that changing them does not re-render the router (ARCHITECTURE_PLAN §3.3).
import type React from "react";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import type { Language } from "./gita.types";

export type Theme = "light" | "dark";

/** The five parts of a verse the reader can turn off independently. Someone
 *  memorising works from the sloka alone; someone studying wants the glosses
 *  and nothing else. */
/** The Latin reading face. Kannada and Telugu are unaffected — [lang] rules in
 *  index.css override font-family for those scripts whatever this says. */
export type FontKey = "literata" | "source" | "newsreader" | "faustina" | "system";

export const FONT_KEYS: readonly FontKey[] = ["literata", "source", "newsreader", "faustina", "system"];

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
  font: FontKey;
  setFont: (key: FontKey) => void;
  /** Multiplier on every reading size. Drives --reading-scale on the root. */
  readingScale: number;
  setReadingScale: (scale: number) => void;
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

// The pre-paint script in index.html has already applied the face, the same way
// it applies the theme; "literata" is the default and carries no attribute.
const readFont = (): FontKey => {
  const saved = document.documentElement.dataset.font;
  return FONT_KEYS.includes(saved as FontKey) ? (saved as FontKey) : "literata";
};

/** Five steps either side of 1.0, coarse enough that a step is visible. */
export const READING_SCALES: readonly number[] = [0.85, 0.925, 1, 1.1, 1.2, 1.35];

const readReadingScale = (): number => {
  const saved = Number(localStorage.getItem("gita-reading-scale"));
  return READING_SCALES.includes(saved) ? saved : 1;
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

/** Every language the reader can choose, in the order they are offered. The
 *  settings list and the sidebar's quick switch both read this one table, so
 *  adding a language is a line here and a line in gita.types. */
export const LANGUAGES: readonly Language[] = ["en", "kn", "te"];

export const LANGUAGE_LABELS: Record<Language, string> = { en: "English", kn: "ಕನ್ನಡ", te: "తెలుగు" };

const readLanguage = (): Language => {
  const saved = localStorage.getItem("gita-language");
  return LANGUAGES.includes(saved as Language) ? (saved as Language) : "en";
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [language, setLanguageState] = useState<Language>(readLanguage);
  const [sections, setSections] = useState<Sections>(readSections);
  const [font, setFontState] = useState<FontKey>(readFont);
  const [readingScale, setReadingScaleState] = useState<number>(readReadingScale);

  // Applied here rather than in a pre-paint script: the scale only affects the
  // reading sizes, so a first paint at 1.0 reflows text but never the shell.
  useEffect(() => {
    document.documentElement.style.setProperty("--reading-scale", String(readingScale));
  }, [readingScale]);

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

  const setReadingScale = useCallback((scale: number) => {
    setReadingScaleState(scale);
    localStorage.setItem("gita-reading-scale", String(scale));
  }, []);

  const setFont = useCallback((key: FontKey) => {
    setFontState(key);
    document.documentElement.dataset.font = key;
    localStorage.setItem("gita-font", key);
  }, []);

  const value = useMemo<Settings>(() => ({ theme, toggleTheme, language, setLanguage, sections, toggleSection, font, setFont, readingScale, setReadingScale }), [theme, toggleTheme, language, setLanguage, sections, toggleSection, font, setFont, readingScale, setReadingScale]);

  return <SettingsContext value={value}>{children}</SettingsContext>;
};

export function useSettings(): Settings {
  const value = use(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside <SettingsProvider>");
  return value;
}
