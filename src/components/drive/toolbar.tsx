"use client";

import { useEffect } from "react";
import { LayoutGrid, Library, List, Search } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { textClass } from "@/lib/i18n/content";
import { cn } from "@/lib/utils";
import type { SortKey, ViewMode } from "@/types";

/**
 * Search, sort and the view toggle.
 *
 * All three are local state in `DriveScreen` rather than URL parameters. The
 * folder's contents are already in the browser, so filtering is instant, and
 * putting a search term in the URL would mean a server round trip per
 * keystroke for a list of fifty rows.
 *
 * The chosen view is the one exception that outlives the page, because it is a
 * preference rather than a query — remembered in `localStorage`, per browser.
 */

const VIEW_KEY = "gdrive:view";

const VIEWS: { value: ViewMode; icon: typeof LayoutGrid; label: keyof Dictionary["drive"] }[] = [
  { value: "grid", icon: LayoutGrid, label: "viewGrid" },
  { value: "list", icon: List, label: "viewList" },
  { value: "shelf", icon: Library, label: "viewShelf" },
];

export function Toolbar({
  query,
  onQuery,
  sort,
  onSort,
  view,
  onView,
  dict,
  lang,
}: {
  query: string;
  onQuery: (value: string) => void;
  sort: SortKey;
  onSort: (value: SortKey) => void;
  view: ViewMode;
  onView: (value: ViewMode) => void;
  dict: Dictionary;
  lang: Locale;
}) {
  // Restored after mount, never during render: reading localStorage while
  // rendering gives the server and the client different output, and the
  // resulting hydration mismatch is silent in production.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored === "grid" || stored === "list" || stored === "shelf") {
        onView(stored);
      }
    } catch {
      // Blocked site data. The default view is a perfectly good answer.
    }
  }, [onView]);

  function chooseView(next: ViewMode) {
    onView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // See above; the choice still applies for this page.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={dict.drive.searchPlaceholder}
          aria-label={dict.drive.searchPlaceholder}
          className={cn(
            "h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint",
            textClass(lang),
          )}
        />
      </div>

      <label className="sr-only" htmlFor="sort">
        {dict.drive.sortBy}
      </label>
      <select
        id="sort"
        value={sort}
        onChange={(event) => onSort(event.target.value as SortKey)}
        className={cn(
          "h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink",
          textClass(lang),
        )}
      >
        <option value="name">{dict.drive.sortName}</option>
        <option value="newest">{dict.drive.sortNewest}</option>
        <option value="oldest">{dict.drive.sortOldest}</option>
        <option value="largest">{dict.drive.sortLargest}</option>
      </select>

      <div
        role="group"
        aria-label={dict.drive.sortBy}
        className="flex rounded-xl border border-line bg-surface p-1"
      >
        {VIEWS.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => chooseView(value)}
            // `aria-pressed` rather than a class alone: the selected view has
            // to be announced, not merely tinted.
            aria-pressed={view === value}
            title={dict.drive[label]}
            className={cn(
              "rounded-lg px-2.5 py-1.5 transition-colors",
              view === value
                ? "bg-accent-soft text-accent"
                : "text-ink-faint hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="sr-only">{dict.drive[label]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
