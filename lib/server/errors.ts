import { translate, type Key, type Lang, type Params } from "@/lib/i18n";

/**
 * An error shown to the user. Carries an i18n key + params: the API returns both (clients translate
 * into the UI language) and `message` is the Ukrainian text for logs and old clients.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    public key: Key,
    public params?: Params,
  ) {
    super(translate("uk", key, params));
  }

  text(lang: Lang) {
    return translate(lang, this.key, this.params);
  }
}

export const notFound = (key: Key = "errors.notFound") => new AppError(404, key);
export const forbidden = (key: Key = "errors.forbidden") => new AppError(403, key);
export const badRequest = (key: Key, params?: Params) => new AppError(400, key, params);
export const unauthorized = () => new AppError(401, "errors.unauthorized");
