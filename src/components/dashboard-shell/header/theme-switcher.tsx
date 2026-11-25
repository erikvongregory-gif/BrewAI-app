"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const THEME_CYCLE = ["light", "dark", "system"] as const;

const THEME_LABELS: Record<(typeof THEME_CYCLE)[number], string> = {
  light: "Hell",
  dark: "Dunkel",
  system: "System",
};

export function ThemeSwitcher() {
  const { themeMode, setPreference } = usePreferencesStore(
    useShallow((state) => ({
      themeMode: state.values.theme_mode,
      setPreference: state.setPreference,
    })),
  );

  const cycleTheme = () => {
    const currentIndex = THEME_CYCLE.indexOf(themeMode);
    const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];

    setPreference("theme_mode", nextTheme);
  };

  const nextTheme = THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
  const label = `Darstellung: ${THEME_LABELS[themeMode] ?? themeMode}. Wechseln zu ${THEME_LABELS[nextTheme]}`;

  // Outline statt Primärfarbe: Die Akzentfarbe bleibt Hauptaktionen wie „Neu erstellen“ vorbehalten.
  return (
    <Button size="icon" variant="outline" onClick={cycleTheme} aria-label={label} title={label}>
      {/* SYSTEM */}
      <Monitor className="hidden [html[data-theme-mode=system]_&]:block" />

      {/* DARK (resolved) */}
      <Sun className="hidden dark:block [html[data-theme-mode=system]_&]:hidden" />

      {/* LIGHT (resolved) */}
      <Moon className="block dark:hidden [html[data-theme-mode=system]_&]:hidden" />
    </Button>
  );
}
