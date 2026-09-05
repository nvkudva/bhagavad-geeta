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
  commentary_kannada?: string; // 695/701, machine-translated from commentary_english
  commentary_telugu?: string; // 695/701, machine-translated from commentary_english
  context_english?: string; // 701/701 — word-by-word glosses
  context_kannada?: string; // 4/701 — the one real remaining coverage gap
  context_telugu?: string; // 22/701
  /* Not in chapter-NN.json. Commentary is 29% of the corpus and is never on screen
     at first paint, so it ships as commentary-NN.json and loadReader() merges it in
     before the reader renders. Only the reader route ever asks for it: the home
     screen's verse card would otherwise pay 30 KB for an essay it does not show.
     Coverage is generated per build into public/data/v1/manifest.json; these
     comments are a convenience and the manifest is the source of truth. */
  commentary_english?: string; // 700/701 — Sivananda 631 / Ramanuja 48 / Shankaracharya 22
  commentary_author?: string; // 701/701
}

/** One row of commentary-NN.json. */
export interface CommentaryRow {
  verse_number: number;
  commentary_english?: string;
  commentary_author?: string;
}

export interface ChapterMeta {
  id: number;
  /** The Sanskrit chapter name, romanised. The Indic forms are the same name in
   *  their own script — the traditional title, not a translation of the Latin. */
  name: string;
  name_kannada?: string;
  name_telugu?: string;
  name_meaning: string;
  name_meaning_kannada?: string;
  name_meaning_telugu?: string;
  verses_count: number;
  summary: string;
  summary_kannada?: string;
  summary_telugu?: string;
}
