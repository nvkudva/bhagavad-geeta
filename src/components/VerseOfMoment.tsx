import { ChevronRight } from "lucide-react";
import type React from "react";
import { useEffect, useReducer, useState } from "react";
import { getChapters, loadChapter, peekChapter } from "../lib/gita";
import type { Language, Verse } from "../lib/gita.types";
import { Link } from "../lib/router";

const chapters = getChapters();

/** Weighted by chapter length, so every verse in the corpus is equally likely
 *  rather than every chapter. */
function pickRandom(): { chapter: number; verse: number } {
  const total = chapters.reduce((sum, c) => sum + c.verses_count, 0);
  let n = Math.floor(Math.random() * total);
  for (const c of chapters) {
    if (n < c.verses_count) return { chapter: c.id, verse: n + 1 };
    n -= c.verses_count;
  }
  return { chapter: 1, verse: 1 };
}

const scriptureOf = (verse: Verse, language: Language): { text: string; lang: string } => {
  if (language === "kn" && verse.text_kannada) return { text: verse.text_kannada, lang: "kn" };
  if (language === "te" && verse.text_telugu) return { text: verse.text_telugu, lang: "te" };
  return { text: verse.text, lang: "sa" };
};

const translationOf = (verse: Verse, language: Language): { text: string; lang: string } => {
  if (language === "kn" && verse.translation_kannada) return { text: verse.translation_kannada, lang: "kn" };
  if (language === "te" && verse.translation_telugu) return { text: verse.translation_telugu, lang: "te" };
  return { text: verse.translation_english, lang: "en" };
};

const LABEL: Record<Language, string> = { en: "Verse for you", kn: "ನಿಮಗಾಗಿ ಒಂದು ಶ್ಲೋಕ", te: "మీ కొరకు ఒక శ్లోకం" };
const SECTION_LANG: Record<Language, string> = { en: "en", kn: "kn", te: "te" };

/** One randomly chosen verse, re-rolled on every visit to Home. Only the verse
 *  and its translation — the card is an invitation into the reader, not a
 *  second place to read. */
export const VerseOfMoment: React.FC<{ language: Language }> = ({ language }) => {
  const [pick] = useState(pickRandom);
  const [, onLoaded] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (peekChapter(pick.chapter)) return;
    let cancelled = false;
    loadChapter(pick.chapter)
      .then(() => {
        if (!cancelled) onLoaded();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pick.chapter]);

  const resident = peekChapter(pick.chapter);
  const verse = resident?.find((v) => v.verse_number === pick.verse) ?? resident?.[0];

  // No skeleton: the card would pop in at a different height and shove the
  // chapter list. It occupies its space silently until the chapter lands.
  if (!verse) return <div className="verse-of-moment-placeholder" aria-hidden />;

  const scripture = scriptureOf(verse, language);
  const translation = translationOf(verse, language);

  return (
    <Link to={{ name: "verse", chapter: verse.chapter_id, verse: verse.verse_number }} className="verse-of-moment pressable pressable-lg">
      <div className="verse-of-moment-head">
        <span className="verse-of-moment-label" lang={SECTION_LANG[language]}>
          {LABEL[language]}
        </span>
        <span className="verse-of-moment-ref">
          {verse.chapter_id}.{verse.verse_number}
          <ChevronRight size={16} aria-hidden />
        </span>
      </div>

      <p className="verse-of-moment-text" lang={scripture.lang}>
        {scripture.text.replace(/\n\s*\n/g, "\n").trim()}
      </p>

      <p className="verse-of-moment-translation" lang={translation.lang}>
        {translation.text}
      </p>
    </Link>
  );
};
