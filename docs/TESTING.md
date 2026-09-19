# Testing

This guide covers local setup and commands. [AGENTS.md](../AGENTS.md#testing-and-verification) defines check selection and E2E limits.

Use focused checks for routine tasks. Run full `bun run check` for an explicit release, a system-wide audit, or a change across the system:

`template:check -> architecture:check -> audit -> typecheck -> lint -> test -> test:build-contracts`.

The dependency audit needs package registry access. Backend integration needs Docker. Only the last test script builds the applications and writes `dist/`. It checks the production output of `webapp` and `website`.

`bun run template:check` checks `CHECKLIST.md`, the capability registry, the `AGENTS.md` import in `CLAUDE.md`, and Markdown links. It needs no extra dependencies. Run `bun run test:terraform` separately. It requires Terraform CLI.

## Test levels

- Contracts/unit: pure rules, Zod contracts, environment settings, JWT, password hashes, client refresh/retry, and token cleanup.
- Build contracts: properties of the completed `dist/`, such as CSS isolation and a separate hero scene. See [build contracts](#build-contracts).
- Backend integration: the real application and HTTP with isolated PostgreSQL. Check sign-in, permissions, profile storage, errors, and concurrency.
- Playwright: important successful paths through the real webapp and backend.
- Maestro: successful native paths in the Expo application on the `mobile` branch.

## Task checks

Follow the [rules](../AGENTS.md#testing-and-verification) and select a focused command below. Backend integration covers most profile changes. A client scenario can prove that a value persists after a reload. It must not depend on notification wording.

Open a browser only on explicit request. For such a run, record the route, initial state, action, and result.

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

# Focused checks for routine tasks:
bun run test:backend:unit -- src/modules/auth/password-reset-cooldown.test.ts -t "outbox retry"
bun run test:backend:integration -- src/db.integration.test.ts -t "different jobs"
bun test packages/contracts/src/users.test.ts -t "profile updates"
```

Files in `backend/src` and `backend/scripts` are discovered automatically. `backend/scripts/test-files.mjs` selects the runner by filename:

| Filename | Runner | Requirements |
| --- | --- | --- |
| `*.integration.test.ts` | `test:integration` | Docker PostgreSQL |
| `*.live.test.ts` | `test:live` | An external service or account that the runner does not start |
| Other `*.test.ts` and `*.test.mjs` files | `test:unit` | No external services |

Unit and integration runners accept exact discovered paths relative to `backend/` and the `-t`/`--test-name-pattern` filter. Without filters, they run the full suite.

Integration allows 30 seconds per test instead of Bun's default 5 seconds. Password hashing on a busy machine can take more than 5 seconds. A test body can continue after a timeout and interfere with cleanup for the next test. For a focused run, change the timeout with `--timeout=<ms>`.

`bun run test:backend:unit` does not require Docker. The root `bun run test` requires it because it includes integration tests. Do not put a live test in the unit suite. Run it explicitly:

```bash
bun run test:storage:s3          # starts local S3 and checks the contract
bun run --cwd backend test:live  # checks configured external services
```

`backend/scripts/test-live.mjs` defines the storage, Postbox, and Resend suites and their required variables. It runs fully configured suites. Partial configuration produces an error with the missing variable names. The command also fails if no suite is configured. See [STORAGE](STORAGE.md) and [EMAIL](EMAIL.md).

`packages/contracts/src/*.test.ts` checks request, response, and error contracts for backend and webapp. Webapp unit tests in `webapp/tests` check refresh/retry and `AuthProvider` state where full E2E tests would be expensive and fragile.

The provider test uses the real `react-dom/client`, React `act`, and small test doubles for the root container and `window`. The repository has no jsdom or happy-dom. Extend the existing test doubles. Do not add a DOM library. Check components that produce HTML, such as profile form validation, with `react-dom/server` and `renderToStaticMarkup`. The `mobile` branch extends the same model for Expo.

Backend tests are next to their modules. Integration checks authentication and users/admin RBAC through the application and transport with real PostgreSQL.

Each managed run creates a separate `${COMPOSE_PROJECT_NAME}-integration-<run>`. It starts `postgres_test`, waits for readiness, applies migrations, and runs the selected files. Without a filter, it runs all discovered integration tests.

`finally` removes only that run's service, `<run-project>_postgres_18_test_data` volume, and network. Cleanup also runs after a partial startup failure. The development database and local storage are not affected.

- `TEST_KEEP_DOCKER=1` keeps resources for diagnosis.
- For an external test database, set both `TEST_SKIP_DOCKER=1` and an explicit `TEST_DATABASE_URL`. Skipping Docker without a URL is prohibited. This mode does not start or clean up Docker.
- By default, the port is derived from the absolute repository path, and the URL is derived from the port. For a fixed database, set `POSTGRES_TEST_PORT` and `TEST_DATABASE_URL`.

Two runs from the same checkout get different Compose projects but the same derived port. If the port is occupied, the second run fails without stopping the first. To use another run's managed database, enable skip and supply its test URL.

Integration and Docker smoke require a database name with `_test` by default. A separate variable permits an intentional exception. This protects `web_app_demo` from test writes. See [LOCAL_DATABASE.md](LOCAL_DATABASE.md) for connection and reset instructions.

Docker smoke uses the repository Compose project and `postgres_test`. It selects a free backend port, builds the backend, waits for `/health/ready`, and checks authentication with the database. Cleanup removes the smoke container, test database service, and test database volume.

No runner uses `docker compose down`. That command is not limited to one service and can remove upload storage. Runners target only the test database service and its volume for removal.

The template has no GitHub Actions or other cloud test runner. Run task checks locally. Production releases and enabled automatic SSG rebuilds follow the hosting guide. They do not replace task tests.

## Build contracts

```bash
bun run test:build-contracts
```

The script builds `webapp` and `website`. It then runs `webapp/build-contracts/*.test.ts` and `website/build-contracts/*.test.ts`. These checks read the new `dist/` output:

- CSS excludes utilities used only by stories.
- Static HTML includes the hero fallback.
- The R3F scene remains a separate part that loads lazily.

`bun run test:webapp` and `bun run test:website` only read data. They do not create `dist/` or inherit the developer's build environment. Thus, `bun run check` builds and checks the output once, after the other tests.

A build-contract file run on its own checks the existing `dist/`. If it is missing, the error points to the build command. Add these checks only for properties of the completed output. Use unit tests for other properties.

## Webapp E2E

Playwright configuration is in `webapp/playwright.config.ts`. For the first run:

```bash
docker compose version
docker info
cp backend/.env.example backend/.env
bun run --cwd webapp e2e:install
bun run --cwd webapp e2e -- auth.spec.ts -g "registers, restores"
```

For a task, use `spec -g "test name"`. Reserve the full `bun run e2e:webapp` for an explicitly requested broad check. If Docker is unavailable, follow [LOCAL_DATABASE.md](LOCAL_DATABASE.md). Do not replace it with a native database for new users.

The E2E script:

- Runs `docker compose up -d postgres_test` unless `E2E_SKIP_DOCKER=1` is set.
- Selects ports based on the repository. If occupied, it selects the nearest free ports.
- Generates Prisma, applies migrations, and creates an E2E administrator. The administrator's password does not enter the browser build.
- Passes `TEST_DATABASE_URL` to the backend as `DATABASE_URL`.
- Starts the backend on `E2E_BACKEND_PORT` and Vite on `E2E_WEB_PORT`.
- Removes only `postgres_test` and its volume after the run unless `E2E_KEEP_DOCKER=1` is set.
- Stores test files in `webapp/e2e/.artifacts/storage`, not `backend/.storage`.
- Checks authentication and profiles, role routes and promotion, session coordination across tabs, and avatars.

The avatar scenario uses filesystem storage by default, with no extra container. To run the same scenario with real S3:

```bash
bun run e2e:webapp:s3
```

Use this check for storage changes or an explicit storage audit. It does not repeat the other authentication and RBAC scenarios. Extra arguments can set Playwright options, but the test file remains `avatar.spec.ts`.

Variables:

```bash
TEST_DATABASE_URL="postgresql://superuser:superpassword@localhost:<test-port>/web_app_demo_test?schema=public"
POSTGRES_TEST_PORT=<test-port>
E2E_BACKEND_PORT=<backend-port>
E2E_WEB_PORT=<web-port>
E2E_SKIP_DOCKER=1
E2E_KEEP_DOCKER=1
E2E_ALLOW_NON_TEST_DATABASE=1
```

Playwright requires a database name with `_test` by default. Only explicit `E2E_ALLOW_NON_TEST_DATABASE=1` removes this restriction. Backend uses a separate `TEST_ALLOW_NON_TEST_DATABASE`. These variables are not interchangeable.

`TEST_DATABASE_URL` is the documented input. Reserve `DATABASE_URL` for low-level overrides. `scripts/repo-env.mjs` derives the Compose project, service, volume, and port. E2E and backend integration share it.

Do not commit artifacts from `webapp/e2e/.artifacts/`. For interactive debugging:

```bash
bun run --cwd webapp e2e:ui
```

## Mobile Maestro E2E

The `master` branch has no working Expo application or Maestro runner. See the `mobile` branch for setup, dev client, stable React Native `testID` values, and `bun run --cwd mobile e2e:maestro:audit`.

## Dependency updates

Root package.json `overrides` set minimum safe versions for transitive packages that are not imported directly. After an update, remove constraints one at a time. Keep them removed if `bun run audit` passes. `bun update` respects the constraints.

If no fix is available, add a narrow temporary `temporaryAuditExceptions` entry in [scripts/dependency-audit.mjs](../scripts/dependency-audit.mjs). The entry records the vulnerability, lockfile versions, direct consumers, projects, and expiry date. It does not permit a direct application dependency or import.

Remove exceptions after a compatible fix is available.

See [ARCHITECTURE.md](ARCHITECTURE.md#prisma) for the Prisma version constraint.

## Official documentation

The repository contract is described above. Check runner behavior against the current official documentation:

- [Playwright](https://playwright.dev/docs/intro)
- [Playwright webServer](https://playwright.dev/docs/test-webserver)
- [baseURL, traces, screenshots, and video](https://playwright.dev/docs/test-use-options)
- [Playwright CLI](https://playwright.dev/docs/test-cli) and [browser installation](https://playwright.dev/docs/browsers)
- [Docker Compose](https://docs.docker.com/compose/)
- [Official PostgreSQL image](https://hub.docker.com/_/postgres)
