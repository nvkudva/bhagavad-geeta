import type React from "react";
import { useEffect, useReducer } from "react";
import { ChapterList } from "./components/ChapterList";
import { Header } from "./components/Header";
import { VerseViewer } from "./components/VerseViewer";
import { getChapterMeta, getChapters, loadChapter, peekChapter } from "./lib/gita";
import type { Verse } from "./lib/gita.types";
import { navigate, useRoute, useScrollRestoration } from "./lib/router";
import { SettingsProvider, useSettings } from "./lib/settings";

const chapters = getChapters();
const NO_VERSES: readonly Verse[] = [];
const FIRST_CHAPTER = chapters[0].id;
const LAST_CHAPTER = chapters[chapters.length - 1].id;

const Home: React.FC = () => (
  <div className="animate-fade-in home-container">
    <h2 className="home-title">Bhagavad-Geeta</h2>
    <p className="home-description">Explore the divine wisdom of the Bhagavad-Geeta through a beautifully designed, distraction-free reading experience.</p>
    <ChapterList chapters={chapters} onSelectChapter={(id) => navigate({ name: "verse", chapter: id, verse: 1 })} />
  </div>
);

const Reader: React.FC<{ chapter: number; verse: number }> = ({ chapter, verse }) => {
  const { language } = useSettings();
  const [, onChapterLoaded] = useReducer((n: number) => n + 1, 0);

  // Sync read of the resident chapter; the effect only wakes the component once a
  // cold chapter has arrived, so nothing is set synchronously during an effect.
  const verses = peekChapter(chapter) ?? NO_VERSES;

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

  const current = index !== -1 ? verses[index] : null;
  // Prev/next run past a chapter boundary: the last verse of n leads into n+1.
  const hasPrev = index > 0 || chapter > FIRST_CHAPTER;
  const hasNext = (index !== -1 && index < verses.length - 1) || chapter < LAST_CHAPTER;

  // The previous chapter's last verse number, best-effort: the resident array is
  // authoritative, metadata is the fallback, and the Reader clamps to the nearest
  // real verse once that chapter arrives.
  const lastVerseOf = (id: number): number => {
    const resident = peekChapter(id);
    if (resident && resident.length > 0) return resident[resident.length - 1].verse_number;
    return getChapterMeta(id)?.verses_count ?? 1;
  };

  const goNext = () => {
    if (index !== -1 && index < verses.length - 1) return navigate({ name: "verse", chapter, verse: verses[index + 1].verse_number });
    if (chapter < LAST_CHAPTER) navigate({ name: "verse", chapter: chapter + 1, verse: 1 });
  };

  const goPrev = () => {
    if (index > 0) return navigate({ name: "verse", chapter, verse: verses[index - 1].verse_number });
    if (chapter > FIRST_CHAPTER) navigate({ name: "verse", chapter: chapter - 1, verse: lastVerseOf(chapter - 1) });
  };

  return (
    <VerseViewer
      verse={current}
      language={language}
      onNext={goNext}
      onPrev={goPrev}
      onBackToChapters={() => navigate({ name: "home" })}
      hasNext={hasNext}
      hasPrev={hasPrev}
    />
  );
};

const AppShell: React.FC = () => {
  const route = useRoute();
  const { theme, toggleTheme, language, setLanguage } = useSettings();
  useScrollRestoration(route);

  return (
    <>
      <Header theme={theme} toggleTheme={toggleTheme} onHomeClick={() => navigate({ name: "home" })} language={language} setLanguage={setLanguage} />

      <main className="app-main">{route.name === "verse" && getChapterMeta(route.chapter) ? <Reader chapter={route.chapter} verse={route.verse} /> : <Home />}</main>
    </>
  );
};

export const App: React.FC = () => (
  <SettingsProvider>
    <AppShell />
  </SettingsProvider>
);

export default App;
