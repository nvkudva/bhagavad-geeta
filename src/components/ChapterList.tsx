import { Book } from "lucide-react";
import type React from "react";

interface Chapter {
  id: number;
  name: string;
  name_meaning: string;
  verses_count: number;
  summary: string;
}

interface ChapterListProps {
  chapters: readonly Chapter[];
  onSelectChapter: (id: number) => void;
}

export const ChapterList: React.FC<ChapterListProps> = ({ chapters, onSelectChapter }) => {
  return (
    <div className="chapter-list-container">
      <div className="chapter-grid">
        {chapters.map((chapter, index) => (
          <button key={chapter.id} type="button" className={`glass-card chapter-card animate-fade-in delay-${(index % 3) * 100}`} onClick={() => onSelectChapter(chapter.id)}>
            <div className="chapter-card-header">
              <span className="chapter-badge">Chapter {chapter.id}</span>
              <div className="chapter-stats">
                <Book size={14} />
                {chapter.verses_count} Verses
              </div>
            </div>

            <h2 className="chapter-name">{chapter.name}</h2>
            <h3 className="chapter-meaning">{chapter.name_meaning}</h3>

            <p className="chapter-summary">{chapter.summary}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
