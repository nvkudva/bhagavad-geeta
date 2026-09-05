/* eslint-disable react-refresh/only-export-components */
// A ~200-line History API router. Every component consumes routing through
// useRoute()/navigate()/<Link>, never through `history` directly, so swapping in
// react-router later is a single-file change (docs/ARCHITECTURE_PLAN.md §3.1).
import type React from "react";
import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { getChapterMeta } from "./gita";

export type Route = { name: "home" } | { name: "verse"; chapter: number; verse: number } | { name: "search"; q: string } | { name: "saved" } | { name: "settings" };

type NavigateOptions = {
  replace?: boolean;
  scroll?: "top" | "preserve" | "restore";
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SCROLL_STORAGE_KEY = "gita-scroll-positions";

const newKey = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/* ------------------------------------------------------------------ parsing */

// Deviation from §3.2: the upper bound is NOT clamped against chapters.json here.
// `verses_count` is not authoritative (chapter 13 says 34, the corpus has 35), so
// clamping at the router edge would make /chapter/13/verse/35 unreachable. The edge
// only rejects non-numbers and verse < 1; the Reader replaceStates to the nearest
// verse that actually exists once the chapter is resident, which is the same
// "land somewhere useful" guarantee against real data.
const clampVerse = (verse: number): number => (Number.isFinite(verse) && verse >= 1 ? Math.floor(verse) : 1);

/** An out-of-range chapter or verse lands somewhere useful rather than erroring:
 *  a truncated shared link should still open a verse. */
function parseLocation(pathname: string, search: string): Route {
  const path = (pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname).replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "search") {
    return { name: "search", q: new URLSearchParams(search).get("q") ?? "" };
  }

  if (segments[0] === "saved") return { name: "saved" };
  if (segments[0] === "settings") return { name: "settings" };

  if (segments[0] === "chapter") {
    const chapter = Number(segments[1]);
    if (!getChapterMeta(chapter)) return { name: "home" };
    const verse = segments[2] === "verse" ? Number(segments[3]) : 1;
    return { name: "verse", chapter, verse: clampVerse(verse) };
  }

  return { name: "home" };
}

function toPath(route: Route): string {
  switch (route.name) {
    case "home":
      return `${BASE}/`;
    case "verse":
      return `${BASE}/chapter/${route.chapter}/verse/${route.verse}`;
    case "search":
      return route.q ? `${BASE}/search?q=${encodeURIComponent(route.q)}` : `${BASE}/search`;
    case "saved":
      return `${BASE}/saved`;
    case "settings":
      return `${BASE}/settings`;
  }
}

const sameRoute = (a: Route, b: Route): boolean => JSON.stringify(a) === JSON.stringify(b);

/* -------------------------------------------------------------- scroll state */

const positions = new Map<string, number>();
let currentKey = newKey();
/** Set immediately before a commit that must move the viewport; consumed by
 *  useScrollRestoration in a layout effect so the user never sees a flash. */
let pendingScroll: number | null = null;
/** How the current route was reached. The reader consults this to decide whether
 *  it owns the viewport (a push/replace) or scroll restoration does (a pop). */
let navKind: "boot" | "push" | "replace" | "pop" = "boot";

function initScroll(): void {
  if (typeof window === "undefined") return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  try {
    const saved = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (saved) for (const [k, y] of JSON.parse(saved) as [string, number][]) positions.set(k, y);
  } catch {
    /* ignore */
  }

  const state = history.state as { key?: string } | null;
  if (state?.key) currentKey = state.key;
  else history.replaceState({ key: currentKey }, "", location.href);

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        positions.set(currentKey, window.scrollY);
        ticking = false;
      });
    },
    { passive: true },
  );

  window.addEventListener("pagehide", () => {
    try {
      positions.set(currentKey, window.scrollY);
      sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify([...positions]));
    } catch {
      /* ignore */
    }
  });
}

/* --------------------------------------------------------------- the store */

const listeners = new Set<() => void>();
let current: Route = typeof window === "undefined" ? { name: "home" } : parseLocation(location.pathname, location.search);

const emit = (): void => {
  for (const listener of listeners) listener();
};

const setRoute = (route: Route): void => {
  if (sameRoute(route, current)) return;
  current = route;
  emit();
};

/** Swap screens inside a view transition so index.css can animate the change.
 *  Every transition is the lateral blur crossfade: a sliding push carries a
 *  spatial claim this app cannot honour — the chapter grid and a chapter are
 *  not stacked, and the back item returns to a scroll offset, not a frame.
 *  The attribute has to be on <html> *before* the old frame is captured, hence
 *  setting it here rather than in an effect. flushSync is required: the
 *  transition callback must leave the DOM in its new state when it returns, and
 *  React 19 would otherwise batch the render past the capture. */
/** Two verses of one chapter are the same screen, so moving between them is not
 *  a screen change: the reader scrolls to the verse, or the pager slides to it.
 *  It must not go through a view transition — inside the update callback the
 *  document is captured, and a scroll performed there is discarded, which
 *  leaves the URL on the new verse and the viewport on the old one. */
const sameScreen = (a: Route, b: Route): boolean => a.name === "verse" && b.name === "verse" && a.chapter === b.chapter;

const setRouteAnimated = (route: Route, kind: "push" | "pop" | "replace"): void => {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (kind === "replace" || sameScreen(route, current) || typeof doc.startViewTransition !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setRoute(route);
    return;
  }
  document.documentElement.dataset.nav = "lateral";
  const transition = doc.startViewTransition(() => {
    flushSync(() => setRoute(route));
  }) as { ready?: Promise<void>; finished?: Promise<void> } | undefined;
  // A transition interrupted by the next one rejects `ready` and `finished`
  // with AbortError. Nothing here awaits them, so without this the browser
  // reports an unhandled rejection every time two navigations overlap — which
  // holding down J does constantly.
  transition?.ready?.catch(() => undefined);
  transition?.finished?.catch(() => undefined);
};

function boot(): void {
  if (typeof window === "undefined") return;
  initScroll();

  // One-shot ?lang override so a link can be shared in a specific language.
  const params = new URLSearchParams(location.search);
  const lang = params.get("lang");
  if (lang === "en" || lang === "kn" || lang === "te") {
    try {
      localStorage.setItem("gita-language", lang);
    } catch {
      /* ignore */
    }
    params.delete("lang");
  }

  // Canonicalise: /chapter/2 -> /chapter/2/verse/1, unknown paths -> /, clamped verses.
  const canonical = toPath(current);
  const rest = params.toString();
  const target = current.name === "search" ? canonical : canonical + (rest ? `?${rest}` : "");
  if (target !== location.pathname + location.search) {
    history.replaceState({ key: currentKey }, "", target);
  }

  window.addEventListener("popstate", (event) => {
    const state = event.state as { key?: string } | null;
    currentKey = state?.key ?? newKey();
    navKind = "pop";
    pendingScroll = positions.get(currentKey) ?? 0;
    setRouteAnimated(parseLocation(location.pathname, location.search), "pop");
  });
}

boot();

export function navigate(to: Route, opts: NavigateOptions = {}): void {
  const url = toPath(to);
  if (url === location.pathname + location.search && sameRoute(to, current)) return;

  positions.set(currentKey, window.scrollY);

  navKind = opts.replace ? "replace" : "push";

  if (opts.replace) {
    history.replaceState({ key: currentKey }, "", url);
  } else {
    currentKey = newKey();
    history.pushState({ key: currentKey }, "", url);
  }

  const scroll = opts.scroll ?? "top";
  pendingScroll = scroll === "preserve" ? null : scroll === "restore" ? (positions.get(currentKey) ?? 0) : 0;

  setRouteAnimated(to, navKind === "replace" ? "replace" : "push");
}

/** Scroll-spy hook: point the URL at the verse now under the header without
 *  touching the back stack and without waking React. `replaceState` keeps the
 *  same history key, so the saved scroll offset for this entry stays valid, and
 *  the store is updated silently — re-rendering 78 verse blocks on every scroll
 *  tick is exactly the work continuous scroll exists to avoid. */
export function syncVerseUrl(chapter: number, verse: number): void {
  const route: Route = { name: "verse", chapter, verse };
  const url = toPath(route);
  if (url === location.pathname + location.search) return;
  history.replaceState({ key: currentKey }, "", url);
  current = route;
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): Route => current;

/** useSyncExternalStore, not useState+useEffect: the latter can tear under
 *  React 19 concurrent rendering. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Restores the viewport after the destination has committed, before paint. */
export function useScrollRestoration(route: Route): void {
  useLayoutEffect(() => {
    if (pendingScroll === null) return;
    window.scrollTo(0, pendingScroll);
    pendingScroll = null;
  }, [route]);
}

/* ----------------------------------------------------------------- <Link/> */

type LinkProps = { to: Route; replace?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

const isPlainLeftClick = (e: React.MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** A real <a href> so middle-click, cmd-click and "copy link address" all work. */
export const Link: React.FC<LinkProps> = ({ to, replace, onClick, ...rest }) => {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || !isPlainLeftClick(event)) return;
      event.preventDefault();
      navigate(to, { replace });
    },
    [to, replace, onClick],
  );

  return <a href={toPath(to)} onClick={handleClick} {...rest} />;
};

/** Chapter ids that exist, for callers that need to validate at an edge. */
