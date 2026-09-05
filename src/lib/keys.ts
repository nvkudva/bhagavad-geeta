/* The desktop keyboard layer. One listener, registered by AppShell and only
   when the wide media query matches — on a phone nothing here is ever
   attached, so the touch behaviour is provably unchanged.

   Actions are supplied by the caller through a ref, so the listener is
   installed once and never re-bound as the route changes. */

export interface KeyActions {
  nextVerse: () => void;
  prevVerse: () => void;
  nextChapter: () => void;
  prevChapter: () => void;
  firstVerse: () => void;
  lastVerse: () => void;
  toggleSave: () => void;
  openPalette: () => void;
  focusSearch: () => void;
  toggleTheme: () => void;
  openShortcuts: () => void;
  goHome: () => void;
  escape: () => void;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

/** `g` is a prefix: `gg` goes to the top of the chapter, `gh` goes home. */
const PREFIX_MS = 900;

export function installKeys(actions: () => KeyActions): () => void {
  let pendingG = 0;

  const onKeyDown = (event: KeyboardEvent): void => {
    const a = actions();
    const mod = event.metaKey || event.ctrlKey;

    // The palette opens from anywhere, including from inside a text field.
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      a.openPalette();
      return;
    }

    if (event.key === "Escape") {
      a.escape();
      return;
    }

    // Everything below is a bare key, so a field owns it and so does any other
    // modifier chord the browser or OS has claimed.
    if (isTypingTarget(event.target) || mod || event.altKey) return;

    const g = pendingG !== 0 && Date.now() - pendingG < PREFIX_MS;
    pendingG = 0;

    if (g) {
      if (event.key === "g") {
        event.preventDefault();
        a.firstVerse();
        return;
      }
      if (event.key === "h") {
        event.preventDefault();
        a.goHome();
        return;
      }
      // Any other key after `g` falls through and is handled on its own.
    }

    switch (event.key) {
      case "j":
      case "ArrowDown":
        event.preventDefault();
        a.nextVerse();
        break;
      case "k":
      case "ArrowUp":
        event.preventDefault();
        a.prevVerse();
        break;
      case "ArrowRight":
        event.preventDefault();
        a.nextChapter();
        break;
      case "ArrowLeft":
        event.preventDefault();
        a.prevChapter();
        break;
      case "g":
        pendingG = Date.now();
        break;
      case "G":
        event.preventDefault();
        a.lastVerse();
        break;
      case "b":
        event.preventDefault();
        a.toggleSave();
        break;
      case "t":
        event.preventDefault();
        a.toggleTheme();
        break;
      case "/":
        event.preventDefault();
        a.focusSearch();
        break;
      case "?":
        event.preventDefault();
        a.openShortcuts();
        break;
      default:
        break;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}


export const SHORTCUTS: readonly { keys: string; label: string }[] = [
  { keys: "J / ↓", label: "Next verse" },
  { keys: "K / ↑", label: "Previous verse" },
  { keys: "→", label: "Next chapter" },
  { keys: "←", label: "Previous chapter" },
  { keys: "G G", label: "First verse" },
  { keys: "⇧ G", label: "Last verse" },
  { keys: "G H", label: "Home" },
  { keys: "B", label: "Save this verse" },
  { keys: "/", label: "Search" },
  { keys: "⌘ K", label: "Command palette" },
  { keys: "T", label: "Toggle theme" },
  { keys: "?", label: "This list" },
  { keys: "Esc", label: "Close" },
];
