import { Bookmark, Check, Search } from "lucide-react";
import type React from "react";
import { useEffect, useReducer } from "react";
import { ChapterList } from "./components/ChapterList";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { VerseViewer } from "./components/VerseViewer";
import { getChapterMeta, getChapters, loadChapter, peekChapter } from "./lib/gita";
import type { Language, Verse } from "./lib/gita.types";
import { navigate, useRoute, useScrollRestoration } from "./lib/router";
import { SettingsProvider, useSettings } from "./lib/settings";

const chapters = getChapters();
const NO_VERSES: readonly Verse[] = [];
const FIRST_CHAPTER = chapters[0].id;
const LAST_CHAPTER = chapters[chapters.length - 1].id;
const TOTAL_VERSES = chapters.reduce((sum, c) => sum + c.verses_count, 0);

// The app name in the script the reader has chosen; "en" gets the IAST romanisation.
const APP_NAME: Record<Language, string> = { en: "Geeta", kn: "ಗೀತೆ", te: "గీత" };
const HOME_TITLE: Record<Language, string> = { en: "Bhagavad Geeta", kn: "ಭಗವದ್ ಗೀತೆ", te: "భగవద్గీత" };

const Home: React.FC = () => {
  return (
    <div className="animate-fade-in home-container">
      <p className="home-description">
        {chapters.length} chapters · {TOTAL_VERSES} verses
      </p>
      <ChapterList chapters={chapters} onSelectChapter={(id) => navigate({ name: "verse", chapter: id, verse: 1 })} />
    </div>
  );
};

/** Reachable, routed placeholders so the tab bar is complete. The screens
 *  themselves are DESIGN_PLAN §4.4–4.6 (P1/P2). */
const Placeholder: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({ icon, title, body }) => (
  <div className="animate-fade-in screen-placeholder">
    <div className="screen-placeholder-icon">{icon}</div>
    <h2>{title}</h2>
    <p>{body}</p>
  </div>
);

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

  if (!meta) return <Home />;

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
const SettingsScreen: React.FC = () => {
  const { theme, toggleTheme, language, setLanguage } = useSettings();

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
    </div>
  );
};

const Screen: React.FC<{ route: ReturnType<typeof useRoute> }> = ({ route }) => {
  switch (route.name) {
    case "verse":
      return <Reader chapter={route.chapter} verse={route.verse} />;
    case "search":
      return <Placeholder icon={<Search size={44} />} title="Search" body="Verse and chapter search is not built yet." />;
    case "saved":
      return <Placeholder icon={<Bookmark size={44} />} title="Nothing saved yet" body="Bookmarks will appear here." />;
    case "settings":
      return <SettingsScreen />;
    default:
      return <Home />;
  }
};

const AppShell: React.FC = () => {
  const route = useRoute();
  const { language } = useSettings();
  useScrollRestoration(route);

  const inReader = route.name === "verse";

  return (
    <>
      <Header
        onHomeClick={() => navigate({ name: "home" })}
        // iOS-style contextual leading item: absent on Home, and on a chapter it
        // is labelled with where it goes back to.
        back={inReader ? { label: "Home", onClick: () => navigate({ name: "home" }) } : undefined}
        title={inReader ? (getChapterMeta(route.chapter)?.name ?? APP_NAME[language]) : APP_NAME[language]}
        largeTitle={route.name === "home" ? HOME_TITLE[language] : undefined}
      />

      <main className="app-main" data-reader={inReader ? "true" : "false"}>
        <Screen route={route} />
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
