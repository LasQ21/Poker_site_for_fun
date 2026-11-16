export function fmtChips(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function fmtSigned(n: number): string {
  if (n === 0) return "0";
  return (n > 0 ? "+" : "−") + fmtChips(Math.abs(n));
}

export function fmtBuyins(n: number): string {
  const v = Math.round(n * 100) / 100;
  const s = Math.abs(v).toString().replace(".", ",");
  return v === 0 ? "0 БІ" : `${v > 0 ? "+" : "−"}${s} БІ`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function pluralUk(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
