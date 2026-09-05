// Saved verses. localStorage, not IndexedDB: the whole set is a few hundred
// bytes of ids and it has to be readable synchronously during render so a verse
// never paints with the wrong bookmark state. useSyncExternalStore over a module
// store keeps every mounted toggle in agreement, including across tabs.
import { useSyncExternalStore } from "react";

const KEY = "gita-bookmarks";
const SCHEMA = 1;

export interface Bookmark {
  chapter: number;
  verse: number;
  /** Epoch ms. The Saved screen lists most-recent first. */
  savedAt: number;
}

const idOf = (chapter: number, verse: number): string => `${chapter}.${verse}`;

const isBookmark = (x: unknown): x is Bookmark => {
  if (typeof x !== "object" || x === null) return false;
  const b = x as Record<string, unknown>;
  return typeof b.chapter === "number" && typeof b.verse === "number" && typeof b.savedAt === "number";
};

function read(): readonly Bookmark[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as { schema?: number; items?: unknown };
    if (parsed.schema !== SCHEMA || !Array.isArray(parsed.items)) return EMPTY;
    return parsed.items.filter(isBookmark);
  } catch {
    // Private-mode denial or corrupt JSON: an empty shelf beats a crashed app.
    return EMPTY;
  }
}

const EMPTY: readonly Bookmark[] = [];

/** Sorted newest-first once, at the store, so every consumer shares one array
 *  identity and useSyncExternalStore never sees a "changed" snapshot it isn't. */
let snapshot: readonly Bookmark[] = [...read()].sort((a, b) => b.savedAt - a.savedAt);
let index = new Set(snapshot.map((b) => idOf(b.chapter, b.verse)));

const listeners = new Set<() => void>();

const commit = (next: readonly Bookmark[]): void => {
  snapshot = next;
  index = new Set(next.map((b) => idOf(b.chapter, b.verse)));
  try {
    localStorage.setItem(KEY, JSON.stringify({ schema: SCHEMA, items: next }));
  } catch {
    // Quota or private mode: the in-memory store still works for this session.
  }
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  // Another tab saved something. `key === null` is a storage clear.
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== KEY) return;
    snapshot = [...read()].sort((a, b) => b.savedAt - a.savedAt);
    index = new Set(snapshot.map((b) => idOf(b.chapter, b.verse)));
    for (const listener of listeners) listener();
  });
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): readonly Bookmark[] => snapshot;

function isSaved(chapter: number, verse: number): boolean {
  return index.has(idOf(chapter, verse));
}

/** Returns the state it moved to, so a caller can announce it. */
export function toggleBookmark(chapter: number, verse: number): boolean {
  if (isSaved(chapter, verse)) {
    commit(snapshot.filter((b) => !(b.chapter === chapter && b.verse === verse)));
    return false;
  }
  commit([{ chapter, verse, savedAt: Date.now() }, ...snapshot]);
  return true;
}

export function removeBookmark(chapter: number, verse: number): void {
  if (isSaved(chapter, verse)) commit(snapshot.filter((b) => !(b.chapter === chapter && b.verse === verse)));
}

export function useBookmarks(): readonly Bookmark[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribed per verse so toggling one bookmark does not re-render the others. */
export function useIsSaved(chapter: number, verse: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => index.has(idOf(chapter, verse)),
    () => false,
  );
}
