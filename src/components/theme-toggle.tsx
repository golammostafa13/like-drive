"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

/**
 * Light and dark, as one button.
 *
 * Nothing here reads the theme during render — the icon is drawn from state
 * the provider sets after mount, and before that both icons are present with
 * one hidden by CSS. Rendering the "correct" icon on the server is impossible
 * (the server does not know the visitor's preference) and attempting it is the
 * usual source of a hydration mismatch on a theme toggle.
 */
export function ThemeToggle({ label }: { label: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-lg text-ink-mute hover:bg-accent-soft hover:text-accent"
    >
      <Sun className="size-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-4 dark:block" aria-hidden="true" />
    </button>
  );
}
