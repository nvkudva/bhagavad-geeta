import type React from "react";
import { useEffect, useState } from "react";
import { ChapterList } from "./components/ChapterList";
import type { Language } from "./components/Header";
import { Header } from "./components/Header";
import { VerseViewer } from "./components/VerseViewer";

import chaptersData from "./data/chapters.json";
import versesData from "./data/verses.json";

type Theme = "light" | "dark";

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("en");
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [selectedVerseId, setSelectedVerseId] = useState<number | null>(null);

  // Initialize theme from system preference or localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("gita-theme") as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    }

    // Also init language if saved
    const savedLanguage = localStorage.getItem("gita-language") as Language;
    if (savedLanguage) {
      setLanguage(savedLanguage);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("gita-theme", newTheme);
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("gita-language", lang);
  };

  const currentChapterVerses = selectedChapterId ? versesData.filter((v) => v.chapter_id === selectedChapterId) : [];

  const currentIndex = currentChapterVerses.findIndex((v) => v.verse_number === selectedVerseId);
  const currentVerse = currentIndex !== -1 ? currentChapterVerses[currentIndex] : null;

  const handleSelectChapter = (id: number) => {
    setSelectedChapterId(id);

    const chapterVerses = versesData.filter((v) => v.chapter_id === id);
    if (chapterVerses.length > 0) {
      setSelectedVerseId(chapterVerses[0].verse_number);
    } else {
      setSelectedVerseId(null);
    }
  };

  const handleNextVerse = () => {
    if (currentIndex < currentChapterVerses.length - 1) {
      setSelectedVerseId(currentChapterVerses[currentIndex + 1].verse_number);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevVerse = () => {
    if (currentIndex > 0) {
      setSelectedVerseId(currentChapterVerses[currentIndex - 1].verse_number);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <>
      <Header theme={theme} toggleTheme={toggleTheme} onHomeClick={() => setSelectedChapterId(null)} language={language} setLanguage={handleLanguageChange} />

      <main className="app-main">
        {!selectedChapterId ? (
          <div className="animate-fade-in home-container">
            <h2 className="home-title">Bhagavad-Geeta</h2>
            <p className="home-description">Explore the divine wisdom of the Bhagavad-Geeta through a beautifully designed, distraction-free reading experience.</p>
            <ChapterList chapters={chaptersData} onSelectChapter={handleSelectChapter} />
          </div>
        ) : (
          <VerseViewer verse={currentVerse} language={language} onNext={handleNextVerse} onPrev={handlePrevVerse} onBackToChapters={() => setSelectedChapterId(null)} hasNext={currentIndex < currentChapterVerses.length - 1} hasPrev={currentIndex > 0} />
        )}
      </main>
    </>
  );
};

export default App;
