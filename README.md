# Poker Tracker

Облік стеків у домашньому покері **не на гроші**: сайт + Telegram-бот + Mini App в одному Next.js-застосунку.

- кеш і турніри; бай-іни/ребаї/аддони у фішках; **стеки під час гри не рахуються** — хост вносить фінальні стеки один раз, у кінці (з контролем суми фішок);
- таймер блайндів (шаблони + редактор структури), звук за хвилину до підвищення і на зміну рівня, повідомлення в групу;
- таймер ходу (20/30/45/60 с або вимк.): торкнувся кола — пішов відлік для наступного гравця, +15 с, пауза; працює локально на пристрої, пробіл на клавіатурі теж перезапускає;
- профілі гравців зі статистикою й графіками: ігри, перемоги, топ-3, серії; турніри — очки наростаючим підсумком і розподіл місць; кеш — баланс у бай-інах і результат кожної гри;
  профіль у межах групи (`/profile/<key>?chat=<publicId>`) або всі ігри Telegram-користувача (`/profile`, бачать лише ті, хто з ним грає);
- лідерборд по групі й сезонах (турніри — очки `N − місце + 1`, +2 переможцю; кеш — сума бай-інів), рядки ведуть у профілі;
- історія ігор і експорт CSV;
- вхід у гру за 4-значним кодом: на головній, `/join 1234` у бота (і в приваті) або посилання `startapp=1234`;
- групи з гілками (темами): бот пише про блайнди, вибування, підсумки й сезони в «покерну» гілку — її задає `/topic` у потрібній гілці
  (або перша гра, створена в гілці через `/newgame`); `/topic off` — назад у загальний чат; якщо гілку видалили, бот пише в загальний чат;
- бот: `/topic`, `/rebuy`, `/out`, `/standings`, `/endgame`, `/stats` (моя статистика), `/leaderboard`, `/season`, `/history`;
- права: хост змінює все, гравець — лише свої ребаї/вибування, гість за посиланням — лише перегляд.

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
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/poker npm test   # + інтеграційний тест бота
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
