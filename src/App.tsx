import { Check } from "lucide-react";
import type React from "react";
import { useEffect, useReducer } from "react";
import { ChapterList } from "./components/ChapterList";
import { Header } from "./components/Header";
import { SavedScreen } from "./components/SavedScreen";
import { SearchScreen } from "./components/SearchScreen";
import { Sidebar, TabBar } from "./components/TabBar";
import { VerseOfMoment } from "./components/VerseOfMoment";
import { VerseViewer } from "./components/VerseViewer";
import { getChapterMeta, getChapters, loadChapter, peekChapter } from "./lib/gita";
import type { Language, Verse } from "./lib/gita.types";
import { navigate, useRoute, useScrollRestoration } from "./lib/router";
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
      <ChapterList chapters={chapters} onSelectChapter={(id) => navigate({ name: "verse", chapter: id, verse: 1 })} />
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
      meta={meta}
      verses={verses}
      targetVerse={verse}
      language={language}
      // "preserve" leaves pendingScroll null so the router's restoration layout
      // effect (which runs after this child's) does not clobber the scroll the
      // reader is about to perform itself.
      onGoToVerse={(next) => navigate({ name: "verse", chapter, verse: next }, { scroll: "preserve" })}
      onPrevChapter={() => {
        if (chapter > FIRST_CHAPTER) navigate({ name: "verse", chapter: chapter - 1, verse: lastVerseOf(chapter - 1) }, { scroll: "preserve" });
      }}
      onNextChapter={() => {
        if (chapter < LAST_CHAPTER) navigate({ name: "verse", chapter: chapter + 1, verse: 1 });
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

const SettingsScreen: React.FC = () => {
  const { theme, toggleTheme, language, setLanguage, sections, toggleSection, font, setFont } = useSettings();

  return (
    <div className="animate-fade-in settings-screen">
      <h2 className="settings-heading">Settings</h2>

      <p className="settings-group-label">Language</p>
      <div className="settings-group">
        {LANGUAGES.map((lang) => (
          <button key={lang} type="button" className="settings-row pressable" aria-pressed={language === lang} onClick={() => setLanguage(lang)}>
            <span>{LANGUAGE_LABELS[lang]}</span>
            {language === lang && <Check size={18} aria-hidden />}
          </button>
        ))}
      </div>

      <p className="settings-group-label">Appearance</p>
      <div className="settings-group">
        <button type="button" className="settings-row pressable" aria-pressed={theme === "dark"} onClick={() => theme !== "dark" && toggleTheme()}>
          <span>Dark</span>
          {theme === "dark" && <Check size={18} aria-hidden />}
        </button>
        <button type="button" className="settings-row pressable" aria-pressed={theme === "light"} onClick={() => theme !== "light" && toggleTheme()}>
          <span>Light</span>
          {theme === "light" && <Check size={18} aria-hidden />}
        </button>
      </div>

      <p className="settings-group-label">Reading face</p>
      <div className="settings-group">
        {FONT_KEYS.map((key) => (
          <button key={key} type="button" className="settings-row pressable" aria-pressed={font === key} onClick={() => setFont(key)}>
            {/* Each option is set in itself — the label is the specimen. */}
            <span data-font-sample={key}>{FONT_LABELS[key]}</span>
            {font === key && <Check size={18} aria-hidden />}
          </button>
        ))}
      </div>
      <p className="settings-note">Applies to English only. Kannada and Telugu keep Noto Sans.</p>

      <p className="settings-group-label">Show in each verse</p>
      <div className="settings-group">
        {SECTION_KEYS.map((key) => (
          <button key={key} type="button" className="settings-row pressable" role="switch" aria-checked={sections[key]} onClick={() => toggleSection(key)}>
            <span>{SECTION_LABELS[key]}</span>
            {sections[key] && <Check size={18} aria-hidden />}
          </button>
        ))}
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
  const { language } = useSettings();
  useScrollRestoration(route);

  const inReader = route.name === "verse";

  return (
    <>
      <Sidebar route={route} title={APP_NAME[language]} />

      <Header
        onHomeClick={() => navigate({ name: "home" })}
        // iOS-style contextual leading item: absent on Home, and on a chapter it
        // is labelled with where it goes back to.
        back={inReader ? { label: "Home", onClick: () => navigate({ name: "home" }) } : undefined}
        title={inReader ? (getChapterMeta(route.chapter)?.name ?? APP_NAME[language]) : APP_NAME[language]}
      />

      <main className="app-main" data-reader={inReader ? "true" : "false"}>
        <Screen route={route} language={language} />
      </main>

      {!inReader && <TabBar route={route} />}
    </>
  );
};

export const App: React.FC = () => (
  <SettingsProvider>
    <AppShell />
  </SettingsProvider>
);

export default App;
