import chaptersData from "../data/chapters.json";
import type { ChapterId, ChapterMeta, CommentaryRow, Language, Verse } from "./gita.types";

export type { ChapterId, ChapterMeta, CommentaryRow, Language, Verse } from "./gita.types";

const chapters: readonly ChapterMeta[] = chaptersData as ChapterMeta[];
const chapterById = new Map<ChapterId, ChapterMeta>(chapters.map((c) => [c.id, c]));

const memo = new Map<ChapterId, readonly Verse[]>();
/** Stable promise identity per chapter: doubles as the in-flight de-duplication map
 *  and as the resolved resource `use()` needs to see the same object every render. */
const inflight = new Map<ChapterId, Promise<readonly Verse[]>>();

/** Chapters whose commentary has been merged into `memo`. */
const withCommentary = new Set<ChapterId>();
const commentaryInflight = new Map<ChapterId, Promise<readonly CommentaryRow[]>>();

const dataUrl = (id: ChapterId): string => `${import.meta.env.BASE_URL}data/v1/chapter-${String(id).padStart(2, "0")}.json`;
const commentaryUrl = (id: ChapterId): string => `${import.meta.env.BASE_URL}data/v1/commentary-${String(id).padStart(2, "0")}.json`;

/** Sync. Bundled (5 KB). Safe to call during render. */
export function getChapters(): readonly ChapterMeta[] {
  return chapters;
}

export function getChapterMeta(id: ChapterId): ChapterMeta | undefined {
  return chapterById.get(id);
}

/* Chapter metadata in the reader's language, falling back to the romanised
   Sanskrit and the English. One helper per field rather than a localised copy
   of the record, because callers want one string and the fallback has to be
   per-field: a chapter can have its name in Kannada and not its summary. */

type ChapterField = "name" | "name_meaning" | "summary";

const SUFFIX: Record<Language, "" | "_kannada" | "_telugu"> = { en: "", kn: "_kannada", te: "_telugu" };

/** The tag to put on the element, so the `[lang]` font rules pick the right
 *  face: a field that fell back to English must not be painted in an Indic one. */
export function chapterText(meta: ChapterMeta, field: ChapterField, language: Language): { text: string; lang: Language } {
  const localised = meta[`${field}${SUFFIX[language]}` as keyof ChapterMeta];
  if (language !== "en" && typeof localised === "string" && localised) return { text: localised, lang: language };
  return { text: meta[field], lang: "en" };
}

/** Just the name, for the many places that only need that one string. */
export function chapterName(id: ChapterId, language: Language): string | undefined {
  const meta = chapterById.get(id);
  return meta && chapterText(meta, "name", language).text;
}

/** Sync cache probe. Returns undefined if the chapter is not resident. */
export function peekChapter(id: ChapterId): readonly Verse[] | undefined {
  return memo.get(id);
}

/** Async load, memoised by chapter id and de-duplicated in flight. */
export function loadChapter(id: ChapterId): Promise<readonly Verse[]> {
  const existing = inflight.get(id);
  if (existing) return existing;

  const request = fetch(dataUrl(id))
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load chapter ${id}: ${res.status}`);
      return res.json() as Promise<Verse[]>;
    })
    .then((verses) => {
      memo.set(id, verses);
      return verses as readonly Verse[];
    })
    .catch((err: unknown) => {
      // A failed load must not be cached, or the chapter is permanently broken.
      inflight.delete(id);
      throw err;
    });

  inflight.set(id, request);
  return request;
}

function loadCommentaryRows(id: ChapterId): Promise<readonly CommentaryRow[]> {
  const existing = commentaryInflight.get(id);
  if (existing) return existing;

  const request = fetch(commentaryUrl(id))
    .then((res) => (res.ok ? (res.json() as Promise<CommentaryRow[]>) : []))
    .catch(() => {
      commentaryInflight.delete(id);
      // Commentary is a supplement, not the scripture. A reader who cannot reach it
      // should still get the chapter, so this resolves empty rather than rejecting.
      return [] as CommentaryRow[];
    });

  commentaryInflight.set(id, request);
  return request;
}

/** True once `peekChapter(id)` would return verses that carry their commentary. */
export function isReaderResident(id: ChapterId): boolean {
  return withCommentary.has(id);
}

/** The reader's load: the chapter and its commentary in parallel, merged before
 *  either is shown. Merging up front is what keeps CLS at 0 and stops the
 *  commentary/word-meanings tab from flipping its default under the reader once
 *  a late fetch lands. New verse objects, not a mutation, so React.memo on a
 *  VerseBlock sees the identity change. */
export function loadReader(id: ChapterId): Promise<readonly Verse[]> {
  if (withCommentary.has(id)) return Promise.resolve(memo.get(id) ?? []);

  return Promise.all([loadChapter(id), loadCommentaryRows(id)]).then(([verses, rows]) => {
    // A concurrent loadReader for the same id may have merged already.
    if (withCommentary.has(id)) return memo.get(id) ?? verses;
    const byVerse = new Map(rows.map((r) => [r.verse_number, r]));
    const merged = verses.map((v) => {
      const row = byVerse.get(v.verse_number);
      return row ? { ...v, commentary_english: row.commentary_english, commentary_author: row.commentary_author } : v;
    });
    memo.set(id, merged);
    withCommentary.add(id);
    return merged as readonly Verse[];
  });
}

/** Fire-and-forget warm-up of everything the reader needs. Never rejects, never
 *  blocks. Idempotent. */
export function prefetchChapter(id: ChapterId): void {
  if (!chapterById.has(id) || withCommentary.has(id) || commentaryInflight.has(id)) return;
  void loadReader(id).catch(() => undefined);
}

