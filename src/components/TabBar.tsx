import { BookOpen, Bookmark, Search, Settings2 } from "lucide-react";
import type React from "react";
import type { Route } from "../lib/router";
import { Link, navigate } from "../lib/router";

type TabId = "read" | "search" | "saved" | "settings";

const TABS: readonly { id: TabId; label: string; Icon: typeof BookOpen; to: Route }[] = [
  { id: "read", label: "Read", Icon: BookOpen, to: { name: "home" } },
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
            className="tab-item"
            aria-current={isActive ? "page" : undefined}
            onClick={(event) => {
              if (!isActive) return;
              // Native behaviour: re-tapping the active tab returns to its root,
              // and if you are already at the root it scrolls that view to top.
              event.preventDefault();
              if (id === "read" && route.name !== "home") navigate({ name: "home" });
              else window.scrollTo(0, 0);
            }}>
            <Icon size={24} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
};
