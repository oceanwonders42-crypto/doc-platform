"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import enMessages from "@/locales/en.json";
import esMessages from "@/locales/es.json";

const STORAGE_KEY = "onyx-locale";
export type LocaleId = "en" | "es";

type Messages = Record<string, unknown>;

const localeMessages: Record<LocaleId, Messages> = {
  en: enMessages as Messages,
  es: esMessages as Messages,
};

function getNested(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function interpolate(str: string, vars: Record<string, string | number>): string {
  let out = str;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
  }
  return out;
}

type I18nContextValue = {
  locale: LocaleId;
  setLocale: (id: LocaleId) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): LocaleId {
  if (typeof window === "undefined") return "en";
  const s = window.localStorage.getItem(STORAGE_KEY);
  if (s === "es") return "es";
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(() =>
    typeof window !== "undefined" ? readStoredLocale() : "en"
  );
  const ready = true;

  const setLocale = useCallback((id: LocaleId) => {
    setLocaleState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch (_) {}
  }, []);

  const messages = localeMessages[locale] ?? localeMessages.en;

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const val = getNested(messages, key);
      const str = typeof val === "string" ? val : key;
      return vars ? interpolate(str, vars) : str;
    },
    [messages]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, ready }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx)
    return {
      locale: "en",
      setLocale: () => {},
      t: (k) => k,
      ready: false,
    };
  return ctx;
}
