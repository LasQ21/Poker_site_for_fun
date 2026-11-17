import { describe, expect, it } from "vitest";
import { en } from "./en";
import { uk } from "./uk";
import { isKey, pickLang, translate, type Plural } from "./index";

const placeholders = (v: string | Plural) =>
  [...new Set((typeof v === "string" ? v : Object.values(v).join(" ")).match(/\{\w+\}/g) ?? [])].sort();

describe("i18n dictionaries", () => {
  it("have the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(uk).sort());
  });

  it("use the same placeholders and shapes in every language", () => {
    for (const key of Object.keys(uk) as (keyof typeof uk)[]) {
      const u = uk[key] as string | Plural;
      const e = en[key] as string | Plural;
      expect(typeof e, key).toBe(typeof u);
      expect(placeholders(e), key).toEqual(placeholders(u));
      if (typeof e === "string") expect(e.length, key).toBeGreaterThan(0);
    }
  });

  it("have every plural category the language needs", () => {
    for (const [lang, dict] of [["uk", uk], ["en", en]] as const) {
      const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
      for (const [key, v] of Object.entries(dict)) {
        if (typeof v === "string") continue;
        for (const c of cats) expect((v as unknown as Record<string, string>)[c] ?? (v as Plural).other, `${lang} ${key} ${c}`).toBeTruthy();
      }
    }
  });
});

describe("translate", () => {
  it("fills placeholders and picks plural forms", () => {
    expect(translate("uk", "common.players", { n: 1 })).toBe("1 гравець");
    expect(translate("uk", "common.players", { n: 3 })).toBe("3 гравці");
    expect(translate("uk", "common.players", { n: 11 })).toBe("11 гравців");
    expect(translate("uk", "common.players", { n: 21 })).toBe("21 гравець");
    expect(translate("en", "common.players", { n: 1 })).toBe("1 player");
    expect(translate("en", "common.players", { n: 5 })).toBe("5 players");
    expect(translate("en", "game.codeCopied", { code: "1234" })).toBe("Code 1234 copied");
  });

  it("recognises keys", () => {
    expect(isKey("errors.hostOnly")).toBe(true);
    expect(isKey("nope")).toBe(false);
    expect(isKey(undefined)).toBe(false);
  });
});

describe("pickLang", () => {
  it("takes the first supported language, English for unsupported, Ukrainian by default", () => {
    expect(pickLang("en-US", "uk")).toBe("en");
    expect(pickLang(null, "uk-UA")).toBe("uk");
    expect(pickLang("de", "fr")).toBe("en");
    expect(pickLang("de", "uk")).toBe("uk");
    expect(pickLang(undefined, "")).toBe("uk");
    expect(pickLang()).toBe("uk");
  });
});
