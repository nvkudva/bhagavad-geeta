import { Check, Settings2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ChapterList } from "./components/ChapterList";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsSheet } from "./components/ShortcutsSheet";
import { Header } from "./components/Header";
import { SavedScreen } from "./components/SavedScreen";
import { SEARCH_PLACEHOLDER, SearchScreen } from "./components/SearchScreen";
import { Sidebar, TabBar } from "./components/TabBar";
import { VerseOfMoment } from "./components/VerseOfMoment";
import { setRailDirection, VerseViewer } from "./components/VerseViewer";
import { toggleBookmark } from "./lib/bookmarks";
import { chapterName, getChapterMeta, getChapters, loadChapter, peekChapter } from "./lib/gita";
import type { Language, Verse } from "./lib/gita.types";
import type { KeyActions } from "./lib/keys";
import { installKeys } from "./lib/keys";
import { useWide } from "./lib/media";
import type { Route } from "./lib/router";
import { Link, navigate, useRoute, useScrollRestoration } from "./lib/router";
import type { FontKey, SectionKey } from "./lib/settings";
import { FONT_KEYS, SECTION_KEYS, SettingsProvider, useSettings } from "./lib/settings";

const chapters = getChapters();
const NO_VERSES: readonly Verse[] = [];
const FIRST_CHAPTER = chapters[0].id;
const LAST_CHAPTER = chapters[chapters.length - 1].id;

// The app name in the script the reader has chosen; "en" gets the IAST romanisation.
const APP_NAME: Record<Language, string> = { en: "Bhagavad Geeta", kn: "ಭಗವದ್ ಗೀತೆ", te: "భగవద్గీత" };

/** No title or corpus line: the nav bar already names the app, and the random
 *  verse is what should greet the reader. */
const Home: React.FC<{ language: Language }> = ({ language }) => {
  return (
    <div className="animate-fade-in home-container">
      <VerseOfMoment language={language} />
      <ChapterList chapters={chapters} language={language} onSelectChapter={(id) => navigate({ name: "verse", chapter: id, verse: 1 })} />
    </div>
  );
};

const Reader: React.FC<{ chapter: number; verse: number }> = ({ chapter, verse }) => {
  const { language } = useSettings();
  const [, onChapterLoaded] = useReducer((n: number) => n + 1, 0);

  // Sync read of the resident chapter; the effect only wakes the component once a
  // cold chapter has arrived, so nothing is set synchronously during an effect.
  const verses = peekChapter(chapter) ?? NO_VERSES;
  const meta = getChapterMeta(chapter);

  useEffect(() => {
    if (peekChapter(chapter)) return;
    let cancelled = false;
    loadChapter(chapter)
      .then(() => {
        if (!cancelled) onChapterLoaded();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chapter]);

  const index = verses.findIndex((v) => v.verse_number === verse);

  // A deep link to a verse number this chapter does not have lands on the nearest one.
  useEffect(() => {
    if (verses.length === 0 || index !== -1) return;
    const nearest = verses.reduce((best, v) => (Math.abs(v.verse_number - verse) < Math.abs(best.verse_number - verse) ? v : best), verses[0]);
    navigate({ name: "verse", chapter, verse: nearest.verse_number }, { replace: true, scroll: "preserve" });
  }, [verses, index, chapter, verse]);

  // The previous chapter's last verse number, best-effort: the resident array is
  // authoritative, metadata is the fallback, and the Reader clamps to the nearest
  // real verse once that chapter arrives.
  const lastVerseOf = (id: number): number => {
    const resident = peekChapter(id);
    if (resident && resident.length > 0) return resident[resident.length - 1].verse_number;
    return getChapterMeta(id)?.verses_count ?? 1;
  };

  if (!meta) return <Home language={language} />;

  return (
    <VerseViewer
      chapter={chapter}
      verses={verses}
      targetVerse={verse}
      language={language}
      chapterName={chapterName(chapter, language)}
      // "preserve" leaves pendingScroll null so the router's restoration layout
      // effect (which runs after this child's) does not clobber the scroll the
      // reader is about to perform itself.
      onGoToVerse={(next) => navigate({ name: "verse", chapter, verse: next }, { scroll: "preserve" })}
      onPrevChapter={() => {
        if (chapter > FIRST_CHAPTER) navigate({ name: "verse", chapter: chapter - 1, verse: lastVerseOf(chapter - 1) }, { scroll: "preserve" });
      }}
      onNextChapter={() => {
        if (chapter < LAST_CHAPTER) navigate({ name: "verse", chapter: chapter + 1, verse: 1 }, { scroll: "preserve" });
      }}
      hasPrevChapter={chapter > FIRST_CHAPTER}
      hasNextChapter={chapter < LAST_CHAPTER}
    />
  );
};

const LANGUAGE_LABELS: Record<Language, string> = { en: "English", kn: "ಕನ್ನಡ", te: "తెలుగు" };
const LANGUAGES: readonly Language[] = ["en", "kn", "te"];

/** Language and appearance moved off the nav bar and onto their own screen, so
 *  the bar carries navigation only. */
const SECTION_LABELS: Record<SectionKey, string> = {
  text: "Verse text",
  transliteration: "Transliteration",
  translation: "Translation",
  commentary: "Commentary",
  words: "Word meanings",
};

const FONT_LABELS: Record<FontKey, string> = {
  literata: "Literata",
  source: "Source Serif 4",
  newsreader: "Newsreader",
  faustina: "Faustina",
  system: "System",
};

/** A grouped-inset settings list: sections carry a header and, where a rule
 *  needs stating, a footer; exclusive choices are a radio group with a tinted
 *  checkmark, and booleans are switches. */
const SettingsSection: React.FC<{ id?: string; header: string; footer?: string; radio?: boolean; children: React.ReactNode }> = ({ id, header, footer, radio, children }) => (
  <section className="settings-section" id={id}>
    <h3 className="settings-group-label">{header}</h3>
    <div className="settings-group" role={radio ? "radiogroup" : undefined} aria-label={radio ? header : undefined}>
      {children}
    </div>
    {footer && <p className="settings-note">{footer}</p>}
  </section>
);

const SettingsChoice: React.FC<{ selected: boolean; onSelect: () => void; children: React.ReactNode }> = ({ selected, onSelect, children }) => (
  <button type="button" className="settings-row pressable" role="radio" aria-checked={selected} onClick={onSelect}>
    <span className="settings-row-label">{children}</span>
    <Check className="settings-check" size={18} strokeWidth={2.5} aria-hidden data-on={selected ? "true" : "false"} />
  </button>
);

const SettingsSwitch: React.FC<{ on: boolean; onToggle: () => void; label: string }> = ({ on, onToggle, label }) => (
  <button type="button" className="settings-row pressable" role="switch" aria-checked={on} onClick={onToggle}>
    <span className="settings-row-label">{label}</span>
    <span className="settings-switch" data-on={on ? "true" : "false"} aria-hidden>
      <span className="settings-switch-knob" />
    </span>
  </button>
);

const SETTINGS_SECTIONS: readonly { id: string; label: string }[] = [
  { id: "language", label: "Language" },
  { id: "appearance", label: "Appearance" },
  { id: "reading-face", label: "Reading face" },
  { id: "sections", label: "Show in each verse" },
];

const SettingsScreen: React.FC = () => {
  const { theme, toggleTheme, language, setLanguage, sections, toggleSection, font, setFont } = useSettings();
  const wide = useWide();
  const [current, setCurrent] = useState(SETTINGS_SECTIONS[0].id);

  // Scroll-spy for the desktop index. Nothing runs below the breakpoint, where
  // the index is not rendered at all. Reading position rather than
  // intersection: this screen is barely taller than the window, so the last
  // sections can never reach a band and an observer would strand the highlight
  // on whichever one happens to sit there.
  useEffect(() => {
    if (!wide) return;
    const pick = (): void => {
      const doc = document.documentElement;
      // At the end of the scroll the last section owns the index, however
      // little of it the window had room to bring up.
      if (window.scrollY >= doc.scrollHeight - window.innerHeight - 2) {
        setCurrent(SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id);
        return;
      }
      const line = window.innerHeight * 0.3;
      let id = SETTINGS_SECTIONS[0].id;
      for (const section of SETTINGS_SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= line) id = section.id;
      }
      setCurrent(id);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    return () => window.removeEventListener("scroll", pick);
  }, [wide]);

  return (
    <div className="animate-fade-in settings-screen">
      <h2 className="settings-heading">Settings</h2>

      {wide && (
        <nav className="settings-index" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map(({ id, label }) => (
            <button key={id} type="button" className="settings-index-link" aria-current={current === id ? "true" : undefined} onClick={() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" })}>
              {label}
            </button>
          ))}
        </nav>
      )}

      <div className="settings-body">
        <SettingsSection id="language" header="Language" radio>
          {LANGUAGES.map((lang) => (
            <SettingsChoice key={lang} selected={language === lang} onSelect={() => setLanguage(lang)}>
              {LANGUAGE_LABELS[lang]}
            </SettingsChoice>
          ))}
        </SettingsSection>

        <SettingsSection id="appearance" header="Appearance">
          {/* Two mutually exclusive rows for a binary is a radio group doing a
            switch's job; one switch says the same thing in half the height. */}
          <SettingsSwitch on={theme === "dark"} onToggle={toggleTheme} label="Dark mode" />
        </SettingsSection>

        <SettingsSection id="reading-face" header="Reading face" footer="Applies to English only. Kannada and Telugu keep Noto Sans." radio>
          {FONT_KEYS.map((key) => (
            <SettingsChoice key={key} selected={font === key} onSelect={() => setFont(key)}>
              {/* Each option is set in itself — the label is the specimen. */}
              <span data-font-sample={key}>{FONT_LABELS[key]}</span>
            </SettingsChoice>
          ))}
        </SettingsSection>

        <SettingsSection id="sections" header="Show in each verse" footer="Hidden sections stay in the verse for search, they are only left out of the reading view.">
          {SECTION_KEYS.map((key) => (
            <SettingsSwitch key={key} on={sections[key]} onToggle={() => toggleSection(key)} label={SECTION_LABELS[key]} />
          ))}
        </SettingsSection>
      </div>
    </div>
  );
};

const Screen: React.FC<{ route: ReturnType<typeof useRoute>; language: Language }> = ({ route, language }) => {
  switch (route.name) {
    case "verse":
      return <Reader chapter={route.chapter} verse={route.verse} />;
    case "search":
      // Keyed on nothing: remounting on every query change would drop focus.
      return <SearchScreen query={route.q} language={language} />;
    case "saved":
      return <SavedScreen language={language} />;
    case "settings":
      return <SettingsScreen />;
    default:
      return <Home language={language} />;
  }
};

const AppShell: React.FC = () => {
  const route = useRoute();
  const { language, toggleTheme } = useSettings();
  const wide = useWide();
  useScrollRestoration(route);

  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  const inReader = route.name === "verse";

  const runSearch = useCallback((q: string) => navigate({ name: "search", q }, { replace: route.name === "search", scroll: "preserve" }), [route.name]);

  /* The keyboard layer. Read through a ref so the listener is installed once
     and never re-bound as the route moves, and installed only at desktop
     width — on a phone no handler exists at all. */
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  const step = useCallback((delta: number) => {
    const current = routeRef.current;
    if (current.name !== "verse") return;
    const resident = peekChapter(current.chapter);
    if (!resident || resident.length === 0) return;
    const i = resident.findIndex((v) => v.verse_number === current.verse);
    const next = resident[Math.max(0, Math.min(resident.length - 1, (i === -1 ? 0 : i) + delta))];
    if (!next || next.verse_number === current.verse) return;
    const to: Route = { name: "verse", chapter: current.chapter, verse: next.verse_number };
    // Written here as well as in the effect below: two j presses inside one
    // frame must not both read the same starting verse.
    routeRef.current = to;
    navigate(to, { scroll: "preserve" });
  }, []);

  const edge = useCallback((which: "first" | "last") => {
    const current = routeRef.current;
    if (current.name !== "verse") return;
    const resident = peekChapter(current.chapter);
    if (!resident || resident.length === 0) return;
    const target = which === "first" ? resident[0] : resident[resident.length - 1];
    const to: Route = { name: "verse", chapter: current.chapter, verse: target.verse_number };
    routeRef.current = to;
    navigate(to, { scroll: "preserve" });
  }, []);

  const chapterStep = useCallback((delta: number) => {
    const current = routeRef.current;
    if (current.name !== "verse") return;
    const next = current.chapter + delta;
    if (next < FIRST_CHAPTER || next > LAST_CHAPTER) return;
    const resident = peekChapter(next);
    const verse = delta < 0 && resident && resident.length > 0 ? resident[resident.length - 1].verse_number : 1;
    setRailDirection(delta < 0 ? "prev" : "next");
    const to: Route = { name: "verse", chapter: next, verse };
    routeRef.current = to;
    /* "preserve", like the rail's own chapter steps: the reader positions
       itself on the target verse in a layout effect, and a parent's layout
       effect runs after the child's — so a scroll-to-top here lands on the
       verse and is then dragged back, leaving the URL on 3.43 and the page on
       3.1. */
    navigate(to, { scroll: "preserve" });
  }, []);

  const actions = useCallback(
    (): KeyActions => ({
      nextVerse: () => step(1),
      prevVerse: () => step(-1),
      nextChapter: () => chapterStep(1),
      prevChapter: () => chapterStep(-1),
      firstVerse: () => edge("first"),
      lastVerse: () => edge("last"),
      toggleSave: () => {
        const current = routeRef.current;
        if (current.name === "verse") toggleBookmark(current.chapter, current.verse);
      },
      openPalette: () => {
        setShortcuts(false);
        setPalette(true);
      },
      focusSearch: () => {
        const field = document.querySelector<HTMLInputElement>(".search-input");
        if (field) field.focus();
        else {
          setShortcuts(false);
          setPalette(true);
        }
      },
      toggleTheme,
      openShortcuts: () => {
        setPalette(false);
        setShortcuts(true);
      },
      goHome: () => navigate({ name: "home" }),
      escape: () => {
        setPalette(false);
        setShortcuts(false);
      },
    }),
    [step, edge, chapterStep, toggleTheme],
  );

  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    if (!wide) return;
    return installKeys(() => actionsRef.current());
  }, [wide]);

  return (
    <>
      <Sidebar route={route} title={APP_NAME[language]} />

      <Header
        onHomeClick={() => navigate({ name: "home" })}
        // iOS-style contextual leading item: absent on Home, and on a chapter it
        // is labelled with where it goes back to.
        back={inReader ? { label: "Home", onClick: () => navigate({ name: "home" }) } : undefined}
        title={inReader ? (chapterName(route.chapter, language) ?? APP_NAME[language]) : APP_NAME[language]}
        // Only Home takes a large title. The reader's masthead was removed on
        // purpose, so its chapter name stays in the compact bar.
        largeTitle={inReader ? undefined : APP_NAME[language]}
        // The tab bar is gone in the reader, so Settings needs a door: the
        // trailing bar slot, as a round glass control matching the back item.
        // The sidebar's search row became this field; a phone still reaches
        // search through its tab bar, so it is a wide-width item only.
        search={wide ? { query: route.name === "search" ? route.q : "", placeholder: SEARCH_PLACEHOLDER[language], onQueryChange: runSearch } : undefined}
        trailing={
          inReader ? (
            <Link to={{ name: "settings" }} className="nav-action-button pressable" aria-label="Settings">
              <Settings2 size={17} strokeWidth={2.2} aria-hidden />
            </Link>
          ) : undefined
        }
      />

      <main className="app-main" data-reader={inReader ? "true" : "false"}>
        <Screen route={route} language={language} />
      </main>

      {!inReader && <TabBar route={route} />}

      {/* Desktop only: below the breakpoint neither dialog is ever mounted and
          no keyboard listener exists to open them. */}
      {wide && palette && <CommandPalette onClose={() => setPalette(false)} />}
      {wide && <ShortcutsSheet open={shortcuts} onClose={() => setShortcuts(false)} />}
    </>
  );
};

export const App: React.FC = () => (
  <SettingsProvider>
    <AppShell />
  </SettingsProvider>
);

export default App;
