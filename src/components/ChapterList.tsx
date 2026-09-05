import { Book } from "lucide-react";
import type React from "react";
import { chapterText } from "../lib/gita";
import type { ChapterMeta, Language } from "../lib/gita.types";

interface ChapterListProps {
  chapters: readonly ChapterMeta[];
  language: Language;
  onSelectChapter: (id: number) => void;
}

/** "Chapter 7" and "47 Verses" in the reader's own language. The number is
 *  interpolated rather than concatenated because Kannada and Telugu put the
 *  count before the noun, as English does, but the word order is not something
 *  to assume — each language states its own template. */
const CHAPTER_LABEL: Record<Language, (n: number) => string> = {
  en: (n) => `Chapter ${n}`,
  kn: (n) => `ಅಧ್ಯಾಯ ${n}`,
  te: (n) => `అధ్యాయం ${n}`,
};

const VERSES_LABEL: Record<Language, (n: number) => string> = {
  en: (n) => `${n} Verses`,
  kn: (n) => `${n} ಶ್ಲೋಕಗಳು`,
  te: (n) => `${n} శ్లోకాలు`,
};

export const ChapterList: React.FC<ChapterListProps> = ({ chapters, language, onSelectChapter }) => {
  return (
    <div className="chapter-list-container">
      <div className="chapter-grid">
        {chapters.map((chapter) => {
          // Per field, not per card: a chapter can have its name in Kannada and
          // fall back to English for the summary, and the two must be tagged
          // separately or the Latin prose is painted in an Indic face.
          const name = chapterText(chapter, "name", language);
          const meaning = chapterText(chapter, "name_meaning", language);
          const summary = chapterText(chapter, "summary", language);

          return (
            <button key={chapter.id} type="button" className="chapter-card pressable pressable-lg" onClick={() => onSelectChapter(chapter.id)}>
              <div className="chapter-card-header">
                <span className="chapter-badge" lang={language}>
                  {CHAPTER_LABEL[language](chapter.id)}
                </span>
                <div className="chapter-stats" lang={language}>
                  <Book size={14} />
                  {VERSES_LABEL[language](chapter.verses_count)}
                </div>
              </div>

              <h2 className="chapter-name" lang={name.lang}>
                {name.text}
              </h2>
              <h3 className="chapter-meaning" lang={meaning.lang}>
                {meaning.text}
              </h3>

              <p className="chapter-summary" lang={summary.lang}>
                {summary.text}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
