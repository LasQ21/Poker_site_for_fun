/** Parses chip amounts typed in chat: "12500", "12 500", "12,5k", "1.2к", "3m". */
export function parseChips(input: string | undefined | null): number | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/[\s_  ']/g, "");
  const m = s.match(/^(\d+(?:[.,]\d+)?)([kкmм])?$/);
  if (!m) return null;
  const num = Number(m[1].replace(",", "."));
  const mult = m[2] === "k" || m[2] === "к" ? 1_000 : m[2] === "m" || m[2] === "м" ? 1_000_000 : 1;
  const v = Math.round(num * mult);
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}
