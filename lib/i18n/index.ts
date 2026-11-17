import { uk } from "./uk";
import { en } from "./en";

export type Lang = "uk" | "en";
export const LANGS: Lang[] = ["uk", "en"];
export const DEFAULT_LANG: Lang = "uk";

/** Plural forms by Intl.PluralRules category (uk: one/few/many, en: one/other). */
export interface Plural {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

type Source = typeof uk;
export type Key = keyof Source;
export type Dict = { [K in Key]: Source[K] extends string ? string : Plural };
export type Params = Record<string, string | number | null | undefined>;

const dicts: Record<Lang, Dict> = { uk: uk as Dict, en };
const rules: Partial<Record<Lang, Intl.PluralRules>> = {};

export function isKey(k: unknown): k is Key {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(uk, k);
}

/** Translates `key`; `{name}` placeholders are filled from params, plurals are chosen by `params.n`. */
export function translate(lang: Lang, key: Key, params?: Params): string {
  const entry = (dicts[lang] ?? dicts.uk)[key] ?? dicts.uk[key];
  let text: string;
  if (typeof entry === "string") text = entry;
  else {
    const n = Number(params?.n ?? 0);
    rules[lang] ??= new Intl.PluralRules(lang);
    const cat = rules[lang]!.select(n) as keyof Plural;
    text = entry[cat] ?? entry.other;
  }
  return params ? text.replace(/\{(\w+)\}/g, (m, p: string) => (params[p] != null ? String(params[p]) : m)) : text;
}

export type T = (key: Key, params?: Params) => string;

export function makeT(lang: Lang): T {
  return (key, params) => translate(lang, key, params);
}

function known(code: string | null | undefined): Lang | null {
  const c = (code ?? "").toLowerCase();
  if (c.startsWith("uk")) return "uk";
  if (c.startsWith("en")) return "en";
  return null;
}

/**
 * Picks a language from candidate codes (most preferred first): the first supported one wins;
 * if only unsupported languages are given, English; with no information at all, Ukrainian.
 */
export function pickLang(...codes: (string | null | undefined)[]): Lang {
  for (const c of codes) {
    const l = known(c);
    if (l) return l;
  }
  return codes.some((c) => c) ? "en" : DEFAULT_LANG;
}

export function localeOf(lang: Lang) {
  return lang === "en" ? "en-GB" : "uk-UA";
}
