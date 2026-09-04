import { useSyncExternalStore } from "react";

/* The two desktop tiers, kept in one place so the JS branches and the CSS
   media blocks cannot drift. Every `false` path in a component that reads
   these is the code that shipped before the desktop pass — a phone renders
   exactly as it did. */
export const WIDE = "(min-width: 900px)";
export const WIDE_PLUS = "(min-width: 1280px)";

type Store = { subscribe: (fn: () => void) => () => void; get: () => boolean };

const stores = new Map<string, Store>();

const storeFor = (query: string): Store => {
  const existing = stores.get(query);
  if (existing) return existing;

  const mql = typeof matchMedia === "function" ? matchMedia(query) : null;
  const store: Store = {
    subscribe: (fn) => {
      if (!mql) return () => undefined;
      mql.addEventListener("change", fn);
      return () => mql.removeEventListener("change", fn);
    },
    get: () => mql?.matches ?? false,
  };
  stores.set(query, store);
  return store;
};

const useMedia = (query: string): boolean => {
  const store = storeFor(query);
  // Server/prerender snapshot is `false`: the mobile rendering is the one that
  // must be correct without JS.
  return useSyncExternalStore(store.subscribe, store.get, () => false);
};

/** True at >=900px — sidebar, continuous reader, keyboard layer, palette. */
export const useWide = (): boolean => useMedia(WIDE);

/** True at >=1280px — two-pane reader with the verse rail, 3-column grids. */
export const useWidePlus = (): boolean => useMedia(WIDE_PLUS);
