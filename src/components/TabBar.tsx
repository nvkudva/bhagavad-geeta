import { Bookmark, House, Minus, Plus, Search, Settings2, SunMoon } from "lucide-react";
import type React from "react";
import { modKeyLabel } from "../lib/keys";
import type { Route } from "../lib/router";
import { Link, navigate } from "../lib/router";
import { READING_SCALES, useSettings } from "../lib/settings";
import { Logo } from "./Logo";

type TabId = "read" | "search" | "saved" | "settings";

const TABS: readonly { id: TabId; label: string; Icon: typeof House; to: Route }[] = [
  { id: "read", label: "Read", Icon: House, to: { name: "home" } },
  { id: "search", label: "Search", Icon: Search, to: { name: "search", q: "" } },
  { id: "saved", label: "Saved", Icon: Bookmark, to: { name: "saved" } },
  { id: "settings", label: "Settings", Icon: Settings2, to: { name: "settings" } },
];

/** The Read tab owns the chapter list and everything pushed on top of it. */
const activeTab = (route: Route): TabId => {
  switch (route.name) {
    case "search":
      return "search";
    case "saved":
      return "saved";
    case "settings":
      return "settings";
    default:
      return "read";
  }
};

export const TabBar: React.FC<{ route: Route }> = ({ route }) => {
  const active = activeTab(route);

  return (
    <nav className="app-tabbar" aria-label="Primary">
      {TABS.map(({ id, label, Icon, to }) => {
        const isActive = active === id;
        return (
          <Link
            key={id}
            to={to}
            className="tab-item pressable"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            onClick={(event) => {
              if (!isActive) return;
              // Native behaviour: re-tapping the active tab returns to its root,
              // and if you are already at the root it scrolls that view to top.
              event.preventDefault();
              if (id === "read" && route.name !== "home") navigate({ name: "home" });
              else window.scrollTo({ top: 0, behavior: "smooth" });
            }}>
            <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
            <span className="tab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

/* The same four destinations, rendered for a pointer and a wide window: a
   persistent sidebar is what a Mac or an iPad in landscape expects, and a
   floating bottom capsule is what a phone expects. One TABS table, two
   presentations — which one is visible is decided entirely in CSS. */
export const Sidebar: React.FC<{ route: Route; title: string; onOpenPalette: () => void }> = ({ route, title, onOpenPalette }) => {
  const active = activeTab(route);
  const { theme, toggleTheme, readingScale, setReadingScale } = useSettings();
  const scaleIndex = READING_SCALES.indexOf(readingScale);

  return (
    <nav className="app-sidebar" aria-label="Primary">
      <div className="app-sidebar-head">
        <Logo size={28} />
        <span className="app-sidebar-wordmark">{title}</span>
      </div>

      {/* The palette is the desktop's front door to search; the Search tab
          below it is still the results page. */}
      <button type="button" className="sidebar-search pressable" data-current={active === "search" ? "true" : undefined} onClick={onOpenPalette} aria-keyshortcuts="Meta+K Control+K">
        <Search size={20} strokeWidth={1.8} aria-hidden />
        <span className="sidebar-search-label">Search</span>
        <kbd>{modKeyLabel()}</kbd>
      </button>
      {/* Search is the launcher above, not a fifth row saying the same word. */}
      {TABS.filter((tab) => tab.id !== "search").map(({ id, label, Icon, to }) => {
        const isActive = active === id;
        return (
          <Link
            key={id}
            to={to}
            className="tab-item pressable"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            onClick={(event) => {
              if (!isActive) return;
              event.preventDefault();
              if (id === "read" && route.name !== "home") navigate({ name: "home" });
              else window.scrollTo({ top: 0, behavior: "smooth" });
            }}>
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
            <span className="tab-label">{label}</span>
          </Link>
        );
      })}

      {/* The two settings a reader reaches for mid-sentence, kept where the
          cursor already is rather than three clicks away in Settings. */}
      <div className="app-sidebar-foot">
        <div className="sidebar-scale">
          <span className="sidebar-scale-label">Reading size</span>
          <button type="button" className="sidebar-step" aria-label="Smaller reading size" disabled={scaleIndex <= 0} onClick={() => setReadingScale(READING_SCALES[Math.max(0, scaleIndex - 1)])}>
            <Minus size={14} aria-hidden />
          </button>
          <button type="button" className="sidebar-step" aria-label="Larger reading size" disabled={scaleIndex >= READING_SCALES.length - 1} onClick={() => setReadingScale(READING_SCALES[Math.min(READING_SCALES.length - 1, scaleIndex + 1)])}>
            <Plus size={14} aria-hidden />
          </button>
        </div>
        <button type="button" className="sidebar-search pressable" onClick={toggleTheme} aria-keyshortcuts="t">
          <SunMoon size={20} strokeWidth={1.8} aria-hidden />
          <span className="sidebar-search-label">{theme === "dark" ? "Dark" : "Light"}</span>
          <kbd>T</kbd>
        </button>
      </div>
    </nav>
  );
};
