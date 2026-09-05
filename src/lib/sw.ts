/** Service-worker lifecycle: the update toast and the Settings row both read it.
 *
 *  Hand-rolled rather than virtual:pwa-register because that module pulls in
 *  workbox-window — 6 KB of client code to do what this file does, against an
 *  81 KB shell budget. sw.js is generated with registerType "prompt", so it
 *  already answers the SKIP_WAITING message and activates nothing on its own. */

const SW_URL = import.meta.env.DEV ? "/dev-sw.js?dev-sw" : "/sw.js";
const SW_TYPE: WorkerType = import.meta.env.DEV ? "module" : "classic";

/** A tab that is never navigated (an installed PWA resumed from the switcher for
 *  weeks) never re-fetches sw.js on its own, so poll for a new one. */
const CHECK_MS = 60 * 60 * 1000;

/** Long enough for a worker that has already installed to reach the listeners,
 *  short enough that an up-to-date app answers immediately. */
const SETTLE_MS = 800;
/** A worker that is genuinely installing precaches ~840 KB first. */
const INSTALL_MS = 30_000;

let registration: ServiceWorkerRegistration | null = null;
let waiting: ServiceWorker | null = null;
let started = false;
const listeners = new Set<() => void>();

export const subscribeUpdate = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getWaitingWorker = (): ServiceWorker | null => waiting;

/** A first install has no controller: that worker activates by itself and there
 *  is nothing to announce. Only a replacement is news. */
const offer = (sw: ServiceWorker | null): void => {
  if (!sw || sw.state !== "installed" || !navigator.serviceWorker.controller) return;
  waiting = sw;
  for (const fn of listeners) fn();
};

const watch = (sw: ServiceWorker | null): void => {
  if (!sw) return;
  offer(sw);
  sw.addEventListener("statechange", () => offer(sw));
};

/** Resolves true as soon as a replacement worker is ready, false if none turns
 *  up inside `ms`. */
const waitForWorker = (ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const stop = subscribeUpdate(() => {
      stop();
      clearTimeout(timer);
      resolve(true);
    });
    const timer = setTimeout(() => {
      stop();
      resolve(false);
    }, ms);
  });

/** Asks the network for a new sw.js. True when a new build is ready to install.
 *
 *  reg.update() resolves once the fetch is done, which is not the same moment
 *  the new worker reaches `installed` — so the answer is a short wait, not a
 *  read. An "updatefound" means a worker is definitely on its way and worth
 *  waiting on: installing means precaching the whole app, which on a slow
 *  connection is not quick. */
export const checkForUpdate = async (): Promise<boolean> => {
  const reg = registration ?? (await navigator.serviceWorker?.getRegistration("/")) ?? null;
  if (!reg) return false;
  let found = false;
  const onFound = () => {
    found = true;
  };
  reg.addEventListener("updatefound", onFound);
  try {
    await reg.update();
    if (waiting) return true;
    if (await waitForWorker(SETTLE_MS)) return true;
    return found ? await waitForWorker(INSTALL_MS) : false;
  } finally {
    reg.removeEventListener("updatefound", onFound);
  }
};

/** The new worker displaces the old one on skipWaiting, which is what makes the
 *  reload land on the new build rather than re-serving the old precache. */
export const applyUpdate = (): void => {
  if (!waiting) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  waiting.postMessage({ type: "SKIP_WAITING" });
};

export const registerServiceWorker = (): void => {
  if (started || !("serviceWorker" in navigator)) return;
  started = true;

  const register = async (): Promise<void> => {
    registration = await navigator.serviceWorker.register(SW_URL, { type: SW_TYPE, scope: "/" });
    const reg = registration;
    watch(reg.waiting);
    reg.addEventListener("updatefound", () => watch(reg.installing));

    const check = () => {
      if (navigator.onLine) void reg.update();
    };
    setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  };

  // After paint: registration competes with the first load for bandwidth.
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
};
