import { Bookmark, House, Minus, Plus, Search, Settings2, SunMoon } from "lucide-react";
import type React from "react";
import type { Route } from "../lib/router";
import { Link, navigate } from "../lib/router";
import { LANGUAGE_LABELS, LANGUAGES, READING_SCALES, useSettings } from "../lib/settings";
import { Logo } from "./Logo";

type TabId = "read" | "search" | "saved" | "settings";

const TABS: readonly { id: TabId; label: string; Icon: typeof House; to: Route }[] = [
  { id: "read", label: "Home", Icon: House, to: { name: "home" } },
  { id: "search", label: "Search", Icon: Search, to: { name: "search", q: "" } },
  { id: "saved", label: "Saved", Icon: Bookmark, to: { name: "saved" } },
  { id: "settings", label: "Settings", Icon: Settings2, to: { name: "settings" } },
];

/** Search is the nav bar's own field at this width, not a row in the list. */
const SIDEBAR_TABS = TABS.filter((tab) => tab.id !== "search");

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
export const Sidebar: React.FC<{ route: Route; title: string }> = ({ route, title }) => {
  const active = activeTab(route);
  const { theme, toggleTheme, language, setLanguage, readingScale, setReadingScale } = useSettings();
  const scaleIndex = READING_SCALES.indexOf(readingScale);

  const row = ({ id, label, Icon, to }: (typeof SIDEBAR_TABS)[number]) => {
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
  };

  return (
    <nav className="app-sidebar" aria-label="Primary">
      <div className="app-sidebar-head">
        <Logo size={28} />
        <span className="app-sidebar-wordmark">{title}</span>
      </div>

      {SIDEBAR_TABS.map(row)}

      {/* The two settings a reader reaches for mid-sentence, kept where the
          cursor already is rather than three clicks away in Settings. */}
      <div className="app-sidebar-foot">
        {/* Sized from the table, not hard-coded: a fourth language widens the
            capsule into four slots without touching the CSS. */}
        <div className="sidebar-langs" role="group" aria-label="Language" style={{ "--slots": LANGUAGES.length, "--slot": LANGUAGES.indexOf(language) } as React.CSSProperties}>
          <span className="sidebar-langs-thumb" aria-hidden />
          {LANGUAGES.map((lang) => (
            <button key={lang} type="button" className="sidebar-lang" lang={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)}>
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>

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
