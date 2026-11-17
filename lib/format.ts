import { localeOf, translate, type Lang } from "@/lib/i18n";

/** Default language of the formatters; the client switches it together with the UI language. */
let fmtLang: Lang = "uk";

export function setFormatLang(lang: Lang) {
  fmtLang = lang;
}

export function getFormatLang(): Lang {
  return fmtLang;
}

export function fmtChips(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function fmtSigned(n: number): string {
  if (n === 0) return "0";
  return (n > 0 ? "+" : "−") + fmtChips(Math.abs(n));
}

export function fmtBuyins(n: number, lang: Lang = fmtLang): string {
  const v = Math.round(n * 100) / 100;
  const s = Math.abs(v).toString().replace(".", lang === "uk" ? "," : ".");
  const unit = translate(lang, "unit.bi");
  return v === 0 ? `0 ${unit}` : `${v > 0 ? "+" : "−"}${s} ${unit}`;
}

/**
 * Date/time formatters. `timeZone` defaults to the runtime's zone (the user's on the client);
 * server-side callers (the bot) pass an explicit zone so output doesn't depend on the server.
 */
export function fmtDate(d: Date | string | null | undefined, lang: Lang = fmtLang, timeZone?: string): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(localeOf(lang), { day: "numeric", month: "short", year: "numeric", timeZone });
}

export function fmtDateShort(d: Date | string | null | undefined, lang: Lang = fmtLang, timeZone?: string): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(localeOf(lang), { day: "numeric", month: "short", timeZone });
}

export function fmtDateTime(d: Date | string | null | undefined, lang: Lang = fmtLang, timeZone?: string): string {
  if (!d) return "";
  return new Date(d).toLocaleString(localeOf(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });
}

export function fmtTime(t: number | Date, lang: Lang = fmtLang, timeZone?: string): string {
  return new Date(t).toLocaleTimeString(localeOf(lang), { hour: "2-digit", minute: "2-digit", timeZone });
}

export function fmtMonth(d: Date | string, lang: Lang = fmtLang, timeZone?: string): string {
  return new Date(d).toLocaleDateString(localeOf(lang), { month: "long", year: "numeric", timeZone });
}

export function fmtDecimal(n: number, lang: Lang = fmtLang): string {
  return String(n).replace(".", lang === "uk" ? "," : ".");
}
