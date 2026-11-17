import { describe, expect, it } from "vitest";
import { resolveLang } from "./lang";

describe("resolveLang", () => {
  it("an explicit setting wins", () => {
    expect(resolveLang({ setting: "en", userLang: "uk", telegramCode: "uk" })).toBe("en");
    expect(resolveLang({ setting: "uk", telegramCode: "en" })).toBe("uk");
  });

  it("then the choice stored on the server", () => {
    expect(resolveLang({ setting: "auto", userLang: "en", telegramCode: "uk" })).toBe("en");
  });

  it("then the Telegram language (unsupported → English), ignoring the browser", () => {
    expect(resolveLang({ setting: "auto", userLang: null, telegramCode: "en-US", browser: ["uk"] })).toBe("en");
    expect(resolveLang({ setting: "auto", telegramCode: "de", browser: ["uk-UA"] })).toBe("en");
    expect(resolveLang({ setting: "auto", telegramCode: "uk", browser: ["en"] })).toBe("uk");
  });

  it("browser languages only without a Telegram language", () => {
    expect(resolveLang({ setting: "auto", browser: ["de", "en-GB"] })).toBe("en");
    expect(resolveLang({ setting: "auto", browser: ["uk-UA", "en"] })).toBe("uk");
    expect(resolveLang({ setting: "auto", browser: [] })).toBe("uk");
  });
});
