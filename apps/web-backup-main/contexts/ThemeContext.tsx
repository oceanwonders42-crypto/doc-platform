"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "onyx-theme";
export type ThemeId = "dark" | "light" | "gradient";

function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";
  const s = window.localStorage.getItem(STORAGE_KEY);
  if (s === "light" || s === "gradient") return s;
  return "dark";
}

type ThemeContextValue = { theme: ThemeId; setTheme: (id: ThemeId) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() =>
    typeof window !== "undefined" ? readStoredTheme() : "dark"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch (_) {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: "dark", setTheme: () => {} };
  return ctx;
}
