# Тестирование

Здесь описаны локальная настройка и команды. Выбор проверок и ограничения E2E заданы в [AGENTS.md](../AGENTS.md#тестирование-и-проверка).

Обычная задача требует узкой проверки. Полный `bun run check` нужен для явного релиза, аудита или сквозного изменения:

`template:check -> architecture:check -> audit -> typecheck -> lint -> test -> test:build-contracts`.

Аудиту нужен реестр пакетов, backend integration — Docker. Только последний тестовый скрипт собирает приложения и пишет `dist/`. Он проверяет production-результат `webapp` и `website`.

`bun run template:check` быстро проверяет `CHECKLIST.md`, реестр возможностей, импорт `AGENTS.md` из `CLAUDE.md` и Markdown-ссылки. Дополнительных зависимостей нет. `bun run test:terraform` выполняется отдельно и требует Terraform CLI.

## Уровни тестов

- Contracts/unit: чистые правила, Zod-контракты, env, JWT, хеши паролей, клиентский refresh/retry и очистка токенов.
- Контракты сборки: свойства только готового `dist/`, например CSS и отдельная hero-сцена. См. [контракты сборки](#контракты-сборки).
- Backend integration: реальные приложение/HTTP и изолированный PostgreSQL; вход, права, сохранение профиля, ошибки и конкуренция.
- Playwright: важные успешные пути через реальный webapp и backend.
- Maestro: нативные успешные пути рабочего Expo-приложения в ветке `mobile`.

## Проверка задачи

Следуй [правилам](../AGENTS.md#тестирование-и-проверка) и выбери узкую команду ниже. Изменение профиля в основном проверяет backend integration. Клиентский сценарий может доказать сохранение значения после перезагрузки, но не должен зависеть от текста уведомления.

Браузер запускай только по явному запросу. Для такого прогона запиши маршрут, исходное состояние, действие и результат.

## Backend

```bash
docker compose version
docker info
cp backend/.env.example backend/.env
docker compose --env-file backend/.env up -d postgres
bun run test
bun run test:contracts
bun run test:backend
bun run test:backend:integration
bun run test:webapp
bun run --cwd backend prisma:validate
bun run smoke:backend:docker

# Узкие проверки для обычных задач:
bun run test:backend:unit -- src/modules/auth/password-reset-cooldown.test.ts -t "outbox retry"
bun run test:backend:integration -- src/db.integration.test.ts -t "different jobs"
bun test packages/contracts/src/users.test.ts -t "profile updates"
```

Файлы в `backend/src` и `backend/scripts` обнаруживаются автоматически. `backend/scripts/test-files.mjs` выбирает исполнитель по имени:

| Имя | Исполнитель | Требования |
| --- | --- | --- |
| `*.integration.test.ts` | `test:integration` | Docker PostgreSQL |
| `*.live.test.ts` | `test:live` | Внешний сервис/аккаунт, который исполнитель сам не запускает |
| Остальные `*.test.ts` и `*.test.mjs` | `test:unit` | Без внешних сервисов |

Unit/integration принимают точные найденные пути относительно `backend/` и фильтр `-t`/`--test-name-pattern`. Без фильтров выполняется весь набор.

Integration даёт тесту 30 секунд вместо стандартных 5 секунд Bun. Хеширование пароля на загруженной машине может занять больше 5 секунд. После таймаута тело теста ещё может работать и мешать очистке следующего теста. Для узкого запуска срок меняется через `--timeout=<ms>`.

`bun run test:backend:unit` не требует Docker. Корневой `bun run test` требует, поскольку включает integration. Не помещай live-тест в unit-набор. Запускай его явно:

```bash
bun run test:storage:s3          # запускает локальный S3 и проверяет контракт
bun run --cwd backend test:live  # проверяет настроенные внешние сервисы
```

`backend/scripts/test-live.mjs` задаёт наборы storage, Postbox и Resend с нужными переменными. Полностью настроенные наборы запускаются. Частичная настройка вызывает ошибку с недостающими именами. Если ни один набор не настроен, команда также завершается ошибкой. См. [STORAGE](STORAGE.md) и [EMAIL](EMAIL.md).

Контракты проверяются в `packages/contracts/src/*.test.ts`: запросы, ответы и ошибки для backend/webapp. Unit-тесты webapp в `webapp/tests` проверяют refresh/retry и состояние `AuthProvider`, где полный E2E был бы дорогим и хрупким.

Тест провайдера использует реальный `react-dom/client`, React `act` и малые подставные root-container/`window`. В репозитории нет jsdom/happy-dom. Расширяй существующую подстановку, не добавляй DOM-библиотеку. Компоненты с HTML, например валидацию формы профиля, проверяй через `react-dom/server` и `renderToStaticMarkup`. Ветка `mobile` расширяет ту же модель для Expo.

Backend-тесты лежат рядом с модулями. Integration проверяет auth и users/admin RBAC через приложение/transport и настоящий PostgreSQL.

Каждый управляемый запуск создаёт отдельный `${COMPOSE_PROJECT_NAME}-integration-<run>`, запускает `postgres_test`, ждёт готовности, применяет миграции и выполняет выбранные файлы. Без фильтра выполняются все найденные integration-тесты.

`finally` удаляет только сервис, том `<run-project>_postgres_18_test_data` и сеть этого запуска, в том числе после частичной ошибки старта. БД разработки и локальное хранилище не затрагиваются.

- `TEST_KEEP_DOCKER=1` сохраняет ресурсы для диагностики.
- Для внешней тестовой БД задай вместе `TEST_SKIP_DOCKER=1` и явный `TEST_DATABASE_URL`. Без URL skip запрещён. В этом режиме Docker не запускается и не очищается.
- По умолчанию порт определяется из абсолютного пути репозитория, а URL — из порта. Для фиксированной БД задай `POSTGRES_TEST_PORT` и `TEST_DATABASE_URL`.

Два запуска из одной копии получают разные Compose-проекты, но один вычисленный порт. Если он занят, второй запуск завершается без остановки первого. Для использования чужой управляемой БД укажи skip и её тестовый URL.

Integration и Docker smoke по умолчанию требуют имя БД с `_test`. Осознанное исключение задаётся отдельной переменной. Это защищает `web_app_demo` от тестовой записи. Подключение и сброс — в [LOCAL_DATABASE.md](LOCAL_DATABASE.md).

Docker smoke собирает образ backend, запускает его с `postgres_test`, ждёт `/health/ready` и удаляет только свой smoke-контейнер.

Ни один исполнитель не использует `docker compose down`: эта команда не ограничивается сервисом и может удалить хранилище загрузок. Удаление сервиса тестовой БД и его тома выполняется адресно.

В шаблоне нет GitHub Actions или другого облачного исполнителя проверок. Выполняй проверки задачи локально. Production-релиз и включённая автопересборка SSG следуют инструкции хостинга и не заменяют тесты задачи.

## Контракты сборки

```bash
bun run test:build-contracts
```

Скрипт собирает `webapp` и `website`, затем запускает `webapp/build-contracts/*.test.ts` и `website/build-contracts/*.test.ts`. Проверки читают свежие `dist/`:

- CSS не содержит утилиты, нужные только stories.
- Статический HTML содержит запасную hero-версию.
- R3F-сцена остаётся отдельной лениво загружаемой частью.

`bun run test:webapp` и `bun run test:website` только читают данные. Они не создают `dist/` и не наследуют окружение сборки разработчика. Поэтому `bun run check` собирает и проверяет результат один раз, после остальных тестов.

Отдельно запущенный файл контракта проверяет имеющийся `dist/`. Если его нет, ошибка указывает на команду сборки. Добавляй такие проверки только для свойств готового результата. Остальное проверяй unit-тестами.

## Webapp E2E

Настройки Playwright: `webapp/playwright.config.ts`. Первый запуск:

```bash
docker compose version
docker info
cp backend/.env.example backend/.env
bun run --cwd webapp e2e:install
bun run --cwd webapp e2e -- auth.spec.ts -g "registers, restores"
```

Для задачи используй `spec -g "test name"`. Полный `bun run e2e:webapp` оставь для явной широкой проверки. Если Docker недоступен, следуй [LOCAL_DATABASE.md](LOCAL_DATABASE.md); не заменяй его нативной БД для новых пользователей.

Скрипт E2E:

- Запускает `docker compose up -d postgres_test`, кроме `E2E_SKIP_DOCKER=1`.
- Выбирает порты по репозиторию; при занятости берёт ближайшие свободные.
- Генерирует Prisma, применяет миграции и создаёт E2E-администратора. Его пароль не попадает в браузерную сборку.
- Передаёт `TEST_DATABASE_URL` в backend как `DATABASE_URL`.
- Запускает backend на `E2E_BACKEND_PORT`, Vite на `E2E_WEB_PORT`.
- После прогона удаляет только `postgres_test` и его том, кроме `E2E_KEEP_DOCKER=1`.
- Хранит тестовые файлы в `webapp/e2e/.artifacts/storage`, не в `backend/.storage`.
- Проверяет auth/profile, маршруты ролей и повышение роли, согласование сессий вкладок и аватар.

Аватар по умолчанию использует filesystem, без дополнительного контейнера. Для того же сценария с реальным S3:

```bash
bun run e2e:webapp:s3
```

Используй эту проверку при изменении хранения или его явном аудите. Она не повторяет остальные auth/RBAC-сценарии. Дополнительные аргументы могут задавать опции Playwright, но файл остаётся `avatar.spec.ts`.

Переменные:

```bash
TEST_DATABASE_URL="postgresql://superuser:superpassword@localhost:<test-port>/web_app_demo_test?schema=public"
POSTGRES_TEST_PORT=<test-port>
E2E_BACKEND_PORT=<backend-port>
E2E_WEB_PORT=<web-port>
E2E_SKIP_DOCKER=1
E2E_KEEP_DOCKER=1
E2E_ALLOW_NON_TEST_DATABASE=1
```

Playwright по умолчанию требует БД с `_test`. Только явный `E2E_ALLOW_NON_TEST_DATABASE=1` снимает это ограничение. Backend использует отдельный `TEST_ALLOW_NON_TEST_DATABASE`; переменные не заменяют друг друга.

Документированный вход — `TEST_DATABASE_URL`. `DATABASE_URL` оставь для низкоуровневого переопределения. Имена Compose-проекта, сервиса, тома и порт вычисляет `scripts/repo-env.mjs`, общий для E2E и backend integration.

Артефакты в `webapp/e2e/.artifacts/` не коммитятся. Для интерактивной отладки:

```bash
bun run --cwd webapp e2e:ui
```

## Mobile Maestro E2E

В основной ветке нет рабочего Expo-приложения и Maestro. Настройку, dev-client, стабильные React Native `testID` и `bun run --cwd mobile e2e:maestro:audit` смотри в ветке `mobile`.

## Официальная документация

Контракт репозитория описан выше. Поведение исполнителей проверяй по актуальной документации:

- [Playwright](https://playwright.dev/docs/intro)
- [Playwright webServer](https://playwright.dev/docs/test-webserver)
- [baseURL, трассировки, снимки и видео](https://playwright.dev/docs/test-use-options)
- [Playwright CLI](https://playwright.dev/docs/test-cli) и [установка браузеров](https://playwright.dev/docs/browsers)
- [Docker Compose](https://docs.docker.com/compose/)
- [Официальный образ PostgreSQL](https://hub.docker.com/_/postgres)
