# Event Tracking System («Формула Будущего»)

Игра с QR-кодами для форума на 500–3000 участников. Участники регистрируются, проходят станции, сканируют QR станций и друг друга, предлагают идеи и видят свой рейтинг. Всё на русском и рассчитано на телефон в браузере. Это перенос проекта Event Station Tracker (Supabase) на стек шаблона: Hono, Prisma, React, Astro, хостинг в Yandex Cloud.

Проект собран из шаблона [di-sukharev/vibe](https://github.com/di-sukharev/vibe). Правила работы агентов: [AGENTS.md](AGENTS.md). Решения по продукту и реестр возможностей: [CHECKLIST.md](CHECKLIST.md).

## Приложения

| Путь | Назначение | Руководство |
| --- | --- | --- |
| `backend` | API на Bun/Hono, Prisma/PostgreSQL, Zod, JWT, OpenAPI, задачи. Модуль события: `backend/src/modules/event` | [backend/README.md](backend/README.md) |
| `webapp` | React SPA: регистрация, вход, экраны участника (`/app`), хостес (`/hostess`), администратор (`/admin`) | [webapp/README.md](webapp/README.md) |
| `website` | Astro: публичная страница входа | [website/README.md](website/README.md) |
| `packages/contracts` | Общие схемы Zod и типы API | [packages/contracts/README.md](packages/contracts/README.md) |
| `mobile` | Приложение Expo. Отложено: участники работают в браузере телефона | [mobile/README.md](mobile/README.md) |

## Быстрый старт

Нужны Bun (версия в [.bun-version](.bun-version)) и Docker. Из корня репозитория:

```bash
bun install --frozen-lockfile
docker compose version
docker info
```

```bash
cp backend/.env.example backend/.env
docker compose --env-file backend/.env up -d --wait postgres
bun run --cwd backend prisma:deploy
bun run dev:seed
```

В PowerShell вместо `cp` используйте `Copy-Item backend/.env.example backend/.env`. В `backend/.env` сгенерируйте `JWT_SECRET` (например, `openssl rand -hex 32`) и не коммитьте файл. Если Docker не стартует, смотрите [LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md). PostgreSQL запускайте через Compose, не нативной установкой.

`dev:seed` создаёт демо-аккаунты из `DEV_SEED_*` в `backend/.env`, первое мероприятие и 15 станций со случайными QR-токенами. Демо-аккаунты публичные, в production их не используйте:

| Роль | Email | Пароль | Страница |
| --- | --- | --- | --- |
| Администратор | `admin@example.com` | `local-admin-password` | `/admin` |
| Участник | `user@example.com` | `local-user-password` | `/app` |

Запуск приложений, каждое в своём терминале:

```bash
bun run dev:backend    # http://localhost:3000
bun run dev:webapp     # http://localhost:5173
bun run dev:website    # http://localhost:4321
```

Браузерный адрес должен совпадать с `CORS_ORIGINS` в `backend/.env`: `http://localhost:5173` и `http://127.0.0.1:5173` считаются разными. QR-коды станций печатайте со страницы `/admin/stations` (войдите администратором). Камера работает в браузере только на HTTPS или на `localhost`: чтобы проверить сканирование на телефоне, откройте сайт по HTTPS-адресу (например, через туннель) либо проверяйте через API, как в `webapp/e2e/specs/participant.spec.ts`.

## Проверки

Агенты выбирают точечные проверки по [AGENTS.md](AGENTS.md). Полный `bun run check` требует Docker и доступ к реестру пакетов. На Windows `bun` из `npm install -g bun` не находится скриптами, которые запускают его без оболочки (`spawnSync`): поставьте путь к `bun.exe` первым в `PATH` и запускайте e2e в установленном Chrome командой с `E2E_BROWSER_CHANNEL=chrome` (подробнее в [TESTING.md](docs/TESTING.md)).

## Документация

| Тема | Руководство |
| --- | --- |
| Команды | [COMMANDS.md](docs/COMMANDS.md) |
| Архитектура, авторизация, Prisma | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Интерфейс и скриншоты | [UI.md](docs/UI.md) |
| Тесты | [TESTING.md](docs/TESTING.md) |
| Приложения, данные, корзины, оплата | [WEB_SURFACES.md](docs/WEB_SURFACES.md) |
| Задачи и outbox | [BACKGROUND_JOBS.md](docs/BACKGROUND_JOBS.md) |
| Локальный PostgreSQL | [LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md) |
| Файлы, почта | [STORAGE.md](docs/STORAGE.md), [EMAIL.md](docs/EMAIL.md) |
| Вход через Apple и Google, подписки магазинов (выключены) | [SOCIAL_AUTH.md](docs/SOCIAL_AUTH.md), [IAP.md](docs/IAP.md) |
| Деплой, справочники | [DEPLOYMENT.md](docs/DEPLOYMENT.md), [YANDEX_CLOUD.md](docs/YANDEX_CLOUD.md), [infra/README.md](infra/README.md) |

## Лицензия

Apache License 2.0. При распространении копии, форка или производного проекта сохраняйте [LICENSE](LICENSE) и [NOTICE](NOTICE). Сохраняйте указание авторства Dima Sukharev, его аккаунта GitHub и исходного репозитория.
