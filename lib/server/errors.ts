export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Не знайдено") => new AppError(404, what);
export const forbidden = (what = "Недостатньо прав") => new AppError(403, what);
export const badRequest = (what: string) => new AppError(400, what);
export const unauthorized = () => new AppError(401, "Потрібно увійти через Telegram");
