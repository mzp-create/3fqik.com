"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { en, type Dict } from "./en";
import { mm } from "./mm";

const dicts: Record<"en" | "mm", Dict> = { en, mm };
const Ctx = createContext<{
  t: Dict;
  lang: "en" | "mm";
  setLang: (l: "en" | "mm") => void;
}>({ t: en, lang: "en", setLang: () => {} });

export function I18nProvider({
  initial,
  children,
}: {
  initial: "en" | "mm";
  children: ReactNode;
}) {
  const [lang, setLang] = useState<"en" | "mm">(initial);
  return (
    <Ctx.Provider value={{ t: dicts[lang], lang, setLang }}>
      {children}
    </Ctx.Provider>
  );
}

export const useT = () => useContext(Ctx);
