// Recent searches. Same shape as the bookmarks store — localStorage, read
// synchronously, one module-level snapshot behind useSyncExternalStore — so the
// list is correct on first paint and agrees across tabs.
import { useSyncExternalStore } from "react";

const KEY = "gita-search-history";
const SCHEMA = 1;

/** Enough to be useful, short enough that the list never becomes a screen of
 *  its own below the field. */
const LIMIT = 8;

const EMPTY: readonly string[] = [];

function read(): readonly string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as { schema?: number; items?: unknown };
    if (parsed.schema !== SCHEMA || !Array.isArray(parsed.items)) return EMPTY;
    return parsed.items.filter((q): q is string => typeof q === "string" && q.length > 0).slice(0, LIMIT);
  } catch {
    return EMPTY;
  }
}

let snapshot: readonly string[] = read();

const listeners = new Set<() => void>();

const commit = (next: readonly string[]): void => {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ schema: SCHEMA, items: next }));
  } catch {
    // Quota or private mode: the in-memory list still works for this session.
  }
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== KEY) return;
    snapshot = read();
    for (const listener of listeners) listener();
  });
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): readonly string[] => snapshot;

/** Case-insensitively de-duplicated and moved to the front, so refining a query
 *  leaves one entry rather than a trail of prefixes of itself. */
export function rememberSearch(query: string): void {
  const q = query.trim();
  if (q.length < 2) return;
  const folded = q.toLocaleLowerCase();
  const rest = snapshot.filter((item) => item.toLocaleLowerCase() !== folded);
  if (rest.length === snapshot.length - 1 && snapshot[0]?.toLocaleLowerCase() === folded) return;
  commit([q, ...rest].slice(0, LIMIT));
}

export function forgetSearch(query: string): void {
  commit(snapshot.filter((item) => item !== query));
}

export function clearSearchHistory(): void {
  commit(EMPTY);
}

export function useSearchHistory(): readonly string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
