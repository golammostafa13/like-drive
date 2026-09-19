"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Light and dark, with no flash and no hydration mismatch.
 *
 * The theme is already applied before React exists: an inline script in the
 * layout reads `localStorage` and sets the class on `<html>` before first
 * paint. So this provider's job is not to *apply* the theme — that has
 * happened — but to hold it as state the UI can read and change.
 *
 * Which is why the initial state is read back off the DOM rather than
 * defaulting to light and correcting itself in an effect. The version this was
 * adapted from did the latter, with a `mounted` flag and a `setState` in an
 * effect body, and it had two costs worth naming: a cascading second render on
 * every page load, and a window in which `resolvedTheme` said "light" while
 * the page was visibly dark — which any consumer reading it during that window
 * (the WebGL scenes, for one) would act on.
 *
 * On the server there is no DOM, so it starts light there; the class on
 * `<html>` is what the visitor actually sees either way, and the layout sets
 * `suppressHydrationWarning` on that element for exactly this reason.
 */

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Kept as a separate name because consumers read it; same value here. */
  resolvedTheme: Theme;
  systemTheme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "theme";

function systemPreference(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** What the pre-paint script already decided, read back off the element. */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(currentTheme);
  const [systemTheme, setSystemTheme] = useState<Theme>(systemPreference);

  // Subscribe only. Nothing is set synchronously here, so there is no
  // cascading render on mount — the state was already correct.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked site data: the choice still holds for
      // this page, it just will not be remembered.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolvedTheme: theme, systemTheme }),
    [theme, setTheme, systemTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
