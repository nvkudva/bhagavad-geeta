export type ChapterId = number; // 1..18, validated at the router edge
export type Language = "en" | "kn" | "te";

export interface Verse {
  chapter_id: number;
  verse_number: number;
  text: string; // Devanagari, 701/701
  text_kannada?: string; // 701/701
  text_telugu?: string; // 701/701
  transliteration: string; // 701/701
  translation_english: string; // 701/701
  translation_kannada?: string; // 701/701 — machine-assisted; see scripts/data-sources/README.md
  translation_telugu?: string; // 701/701 — te.wikisource CC BY-SA 4.0, except the three below
  /** Set on the three verses te.wikisource left absent or unfinished, which
   *  were composed instead and so cannot carry the Wikisource credit. */
  translation_telugu_machine?: boolean; // 3/701
  context_english?: string; // 701/701 — word-by-word glosses
  commentary_english?: string; // 631/701 — Swami Sivananda, via vedicscriptures.github.io
  commentary_author?: string;
  context_kannada?: string; // 4/701
  context_telugu?: string; // 22/701
}

export interface ChapterMeta {
  id: number;
  name: string;
  name_meaning: string;
  verses_count: number;
  summary: string;
}
