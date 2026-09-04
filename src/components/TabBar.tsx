import { Bookmark, House, Search, Settings2 } from "lucide-react";
import type React from "react";
import type { Route } from "../lib/router";
import { Link, navigate } from "../lib/router";
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
export const Sidebar: React.FC<{ route: Route; title: string }> = ({ route, title }) => {
  const active = activeTab(route);

  return (
    <nav className="app-sidebar" aria-label="Primary">
      <div className="app-sidebar-head">
        <Logo size={28} />
        <span className="app-sidebar-wordmark">{title}</span>
      </div>
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
              event.preventDefault();
              if (id === "read" && route.name !== "home") navigate({ name: "home" });
              else window.scrollTo({ top: 0, behavior: "smooth" });
            }}>
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
            <span className="tab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
