import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import type { Language } from "./Header";

interface Verse {
  chapter_id: number;
  verse_number: number;
  text: string;
  text_kannada?: string;
  text_telugu?: string;
  transliteration: string;
  translation_english: string;
  translation_kannada?: string;
  translation_telugu?: string;
  context_english?: string;
  context_kannada?: string;
  context_telugu?: string;
}

interface VerseViewerProps {
  verse: Verse | null;
  language: Language;
  onNext: () => void;
  onPrev: () => void;
  onBackToChapters: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

export const VerseViewer: React.FC<VerseViewerProps> = ({ verse, language, onNext, onPrev, onBackToChapters, hasNext, hasPrev }) => {
  if (!verse) {
    return (
      <div className="verse-viewer-empty">
        <BookOpen size={48} className="verse-viewer-empty-icon" />
        <p>Select a chapter to begin reading.</p>
      </div>
    );
  }

  // Determine text to show based on language
  let displayText = verse.text;
  let displayTranslation = verse.translation_english;
  let displayContext = verse.context_english;

  if (language === "kn") {
    if (verse.text_kannada) displayText = verse.text_kannada;
    if (verse.translation_kannada) displayTranslation = verse.translation_kannada;
    if (verse.context_kannada) displayContext = verse.context_kannada;
  } else if (language === "te") {
    if (verse.text_telugu) displayText = verse.text_telugu;
    if (verse.translation_telugu) displayTranslation = verse.translation_telugu;
    if (verse.context_telugu) displayContext = verse.context_telugu;
  }

  return (
    <div className="animate-fade-in verse-viewer-container">
      <button type="button" className="glass-button verse-viewer-back-btn" onClick={onBackToChapters}>
        <ChevronLeft size={16} /> Back to Chapters
      </button>

      <div className="glass-panel verse-viewer-panel">
        <div className="verse-viewer-title-wrapper">
          <h2 className="text-gradient verse-viewer-title">
            Chapter {verse.chapter_id} • Verse {verse.verse_number}
          </h2>
        </div>

        <div className="verse-text-wrapper">
          <p className="verse-text">{displayText}</p>
        </div>

        <div className="verse-transliteration-wrapper">
          <p className="verse-transliteration">{verse.transliteration}</p>
        </div>

        <div className="verse-section-card">
          <h3 className="verse-section-title">{language === "kn" ? "ಅನುವಾದ (Translation)" : language === "te" ? "అనువాదం (Translation)" : "Translation"}</h3>
          <p className="verse-section-content">{displayTranslation}</p>
        </div>

        {displayContext && (
          <div className="verse-section-card commentary">
            <h3 className="verse-section-title">{language === "kn" ? "ಭಾಷ್ಯ (Commentary)" : language === "te" ? "భాష్యం (Commentary)" : "Commentary"}</h3>
            <p className="verse-section-content">{displayContext}</p>
          </div>
        )}
      </div>

      <div className="verse-pagination-container">
        <button type="button" className="glass-button" onClick={onPrev} disabled={!hasPrev} style={{ opacity: hasPrev ? 1 : 0.5, cursor: hasPrev ? "pointer" : "not-allowed" }}>
          <ChevronLeft size={20} /> Previous
        </button>
        <button type="button" className="glass-button" onClick={onNext} disabled={!hasNext} style={{ opacity: hasNext ? 1 : 0.5, cursor: hasNext ? "pointer" : "not-allowed" }}>
          Next <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};
