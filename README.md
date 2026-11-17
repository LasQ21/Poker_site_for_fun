# Poker Tracker

Облік стеків у домашньому покері **не на гроші**: сайт + Telegram-бот + Mini App в одному Next.js-застосунку.

- кеш і турніри; бай-іни/ребаї/аддони у фішках; результат у фішках і в «бай-інах»; контроль суми фішок;
- таймер блайндів (шаблони + редактор структури), звук і вібрація на зміну рівня, повідомлення в групу;
- графік стеків у часі, живий синк (polling ~3,5 с);
- лідерборд по групі й сезонах (турніри — очки `N − місце + 1`, +2 переможцю; кеш — сума бай-інів);
- історія ігор і експорт CSV; нагадування «оновіть стеки» в групу;
- вхід у гру за 4-значним кодом: на головній, `/join 1234` у бота (і в приваті) або посилання `startapp=1234`;
- права: хост змінює все, гравець — лише свій стек, гість за посиланням — лише перегляд (без Telegram ID);
- кожна дія з грою — транзакція з блокуванням рядка гри (Neon по WebSocket), тож одночасні дії не конфліктують;
- захист коду гри від перебору (≤10 невдалих спроб за 10 хв), коди «покинутих» ігор (>24 год без дій) звільняються;
- сезонами керують адміни групи або ті, хто проводив у ній ігри.

## Стек

Next.js 15 (App Router) · TypeScript · Tailwind 4 · Postgres (Neon) + Drizzle · grammY (webhook) · Recharts · SWR · Upstash QStash.

## Локальний запуск

```bash
cp .env.example .env.local        # DATABASE_URL на локальний Postgres, DEV_LOGIN=1
npm install
npm run db:migrate
npm run dev
```

`DEV_LOGIN=1` вмикає кнопки «Dev: Олег / Анна» замість входу через Telegram (лише поза production).

## Перевірки

```bash
npm run lint && npm run typecheck && npm test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/poker npm test   # + інтеграційні тести (бот, сервіс ігор)
```

## Деплой (Vercel)

1. Імпортувати репозиторій у Vercel, підключити **Neon** і **Upstash QStash** через Marketplace
   (вони самі додають `DATABASE_URL`, `QSTASH_*`).
2. Додати змінні: `BOT_TOKEN`, `BOT_USERNAME`, `MINIAPP_SHORT_NAME`, `WEBHOOK_SECRET`, `SETUP_SECRET`, `SESSION_SECRET`
   (і `APP_URL`, якщо домен не `*.vercel.app` проєкту).
3. `npm run build` спершу застосовує міграції (`scripts/migrate.mjs`).
4. Вимкнути Deployment Protection для production, щоб Telegram досягав webhook.
5. Один раз викликати `POST https://<домен>/api/setup` з заголовком `x-setup-secret: <SETUP_SECRET>` —
   встановлює webhook (із `secret_token`), команди й кнопку меню Mini App.

У @BotFather: `/newapp` (URL = домен Vercel, short name = `MINIAPP_SHORT_NAME`), `/setdomain` (для входу на сайті).

## Структура

```
app/                 сторінки (/, /new, /g/[id], /g/[id]/summary, /leaderboard, /history) і API
app/api/bot          webhook бота;  app/api/jobs/*  — виклики від QStash (перевірка підпису)
lib/game             чиста логіка: блайнди, результати/очки/лідерборд, парсинг фішок (+ тести)
lib/auth/telegram.ts HMAC-валідація initData Mini App і Telegram Login Widget, сесійна кука
lib/server           доступ до БД, права, сервіс ігор і лідерборду
lib/bot              команди бота
components/          UI
drizzle/             міграції
```
