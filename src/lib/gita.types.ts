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
  translation_kannada?: string; // 4/701
  translation_telugu?: string; // 4/701
  context_english?: string; // 701/701
  context_kannada?: string; // 4/701
  context_telugu?: string; // 4/701
}

export interface ChapterMeta {
  id: number;
  name: string;
  name_meaning: string;
  verses_count: number;
  summary: string;
}
