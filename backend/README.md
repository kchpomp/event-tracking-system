# Backend

The backend serves the API and owns sign-in, data storage, integrations, and server-side business rules. Module layers, auth internals, and Prisma rules are in [ARCHITECTURE](../docs/ARCHITECTURE.md).

## Stack

Bun, Hono with `@hono/zod-openapi`, Prisma 7 on PostgreSQL 18, Zod, `jose`, and TypeScript.

## Commands

[COMMANDS](../docs/COMMANDS.md) indexes the scripts, and [TESTING](../docs/TESTING.md) covers the test runners. Backend-only commands, from the root:

```bash
bun run --cwd backend dev              # API and scheduler, with watch
bun run --cwd backend start:api        # API only, as deployed
bun run --cwd backend prisma:generate  # client in src/generated/prisma
```

`dev` runs the scheduler next to the API, so the outbox drains and local reset links appear within a minute. `dev`, `typecheck`, `build`, and `start:api` run `prisma:generate` first. [LOCAL_DATABASE](../docs/LOCAL_DATABASE.md) sets up PostgreSQL and `backend/.env`.

## Entry points

All processes share the Prisma schema, the `backend/Dockerfile` image, and `src/runtime.ts`. Jobs are declared in `src/jobs.ts`. [BACKGROUND_JOBS](../docs/BACKGROUND_JOBS.md) explains when to run each process.

| Process | Command | File |
| --- | --- | --- |
| API | `start:api` | `src/index.ts` |
| One job, then exit | `start:cron -- <job>` | `src/cron.ts` |
| Schedule from `src/job-schedules.json` | `start:scheduler` | `src/scheduler.ts` |
| Loops; empty by default | `start:worker` | `src/worker.ts` |
| Continuous push pipeline; optional | `start:worker:notifications` | `src/worker.ts` |

Cron, the scheduler, and the worker use `createBackgroundRuntime`. It replaces `JWT_SECRET` with a placeholder, so the background runtime never carries the token-signing key.

## Environment

`backend/.env.example` documents each variable. `src/env.ts` rejects invalid combinations at startup. Non-obvious choices:

- `RATE_LIMIT_STORE`: `memory` (default) counts inside one process, up to 10,000 keys. Use it while one API process serves every request. `database` shares counters across processes through one PostgreSQL upsert per limited request; Terraform sets it for Yandex. Its `rate_limit_buckets` rows hold client addresses or user IDs, which are temporary personal data. Only the auth cleanup deletes them, in `maintenance:process` every 15 minutes, so every deployment with `database` must run the scheduled jobs.
- `SESSION_RETENTION_DAYS`: the auth cleanup keeps revoked and expired sessions this long, then deletes them. It also deletes expired reset tokens and spent rate-limit windows. `maintenance:process` runs it, and `auth:sessions:cleanup` runs it alone.
- `TRUST_PROXY`: behind a proxy, set `TRUST_PROXY=true` and the proxy's `TRUSTED_PROXY_CLIENT_IP_HEADER`. Otherwise all clients share the proxy's rate-limit key. Set `TRUSTED_PROXY_CLIENT_IP_POSITION=last` only if the proxy appends the client address. Terraform sets both for its providers.
- `EMAIL_DELIVERY`: the schema default is `disabled`; `.env.example` sets `console`, which prints reset links. Production refuses `console`. With `disabled`, a reset request answers normally but creates no token or task. See [EMAIL](../docs/EMAIL.md).
- `PRIVATE_STORAGE_DRIVER`: `filesystem` (default) writes to `backend/.storage` without cloud or Docker. `s3` works with the local container (`bun run storage:local:start`) or a real bucket. Production refuses `filesystem`. See [STORAGE](../docs/STORAGE.md).
- Production-like runtimes (`NODE_ENV=production` or `COOKIE_SECURE=true`) require HTTPS `CORS_ORIGINS` and a `JWT_SECRET` of at least 64 hex characters (`openssl rand -hex 32`). `NODE_ENV=production` also requires `COOKIE_SECURE=true`.
- `EVENT_RATE_LIMIT_MAX` and `EVENT_RATE_LIMIT_WINDOW_SECONDS`: the per-address budget of `/api/event/*` (default 6000 a minute). A whole venue shares one Wi-Fi address, so the 60 a minute of the account budget cannot serve it. Auth routes keep their own budget.
- `src/db.ts` adds `uselibpqcompat=true` to a `DATABASE_URL` with `sslmode=require`, so TLS behaves as in libpq.
- Seeds: `bun run dev:seed` creates the local admin and user from `DEV_SEED_*`, with no subscription or premium access. It refuses production and non-loopback database URLs. A rerun with unchanged passwords keeps the hashes, sessions, and push registrations. A changed password is rehashed, and that account's sessions and push registrations are revoked. `dev:seed`, `event:seed` and `db:deploy` also create the first event with its 15 stations, only when the database has none, so printed QR codes are never regenerated. `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` feed only `db:deploy`, which creates the first production admin (12–128 characters, no placeholder or repeated pattern).
- `bun run --cwd backend dev:seed:team` creates two teams («Тестовая команда А» and «Б») with six participants (five with a generated placeholder portrait) from `TEST_USER_<n>_EMAIL` and `_PASSWORD` in the ignored `backend/.env.test-users`; a first run writes that file with random passwords. It needs `SEED_CONFIRM_DB_HOST` equal to the host of `DATABASE_URL`. It refuses any non-loopback host (no override), a `host` or `hostaddr` parameter in the URL, and production.
- Push: `ENABLE_TEST_PUSH=true` opens the test endpoint; keep it off outside a check. `EXPO_PUSH_ACCESS_TOKEN` is needed only when the Expo project enables push security. APNs and FCM keys live in Expo, not here.

## API

`GET /openapi.json` lists every `/api` route. Endpoint families:

| Prefix | Owner | Purpose |
| --- | --- | --- |
| `/api/auth/*` | auth | Browser cookie sessions, `/api/auth/token/*` for native apps, password reset |
| `/api/users/*` | users | The current user's profile |
| `/api/admin/stations`, `/api/admin/event` | event | Station list with QR tokens, opening and closing the event; `admin` only |
| `/api/admin/network` | event | The venue network screen; `admin` and `screen` (with `/api/admin/flask`, the only routes a `screen` account may read besides sign-in, session, and `GET /api/event/schedule`) |
| `/api/admin/flask` | event | The «Колба идей» screen feed: latest 40 ideas (who and when, no idea text) and the total; `admin` and `screen`, same read budget as the network |
| `/api/admin/planned-participants` | event | The guest list: five columns (email, first name, last name, department, city), photos; `admin` only |
| `/api/registration/*` | event | Public: whether sign-up is open; the department and city lists, taken from the participant list |
| `/api/hostess/*` | event | Participant search, station awards, team list, `POST /api/hostess/team-award`, and the merch badge: `GET`/`POST /api/hostess/participants/{id}/badge` (status; issue, `201`, or `409` if fewer than 3 activities or already issued); `hostess` and `admin` |
| `/api/event/*` | event | A participant's profile and progress, stations, scan, connections, ideas, leaderboard, team and `GET /api/event/badge`; `user` only. `GET /api/event/schedule` (the teams' performance slots, `serverNow`, and `live`: `{override, teamId}`) is open to every signed-in role |
| `/api/admin/teams` | event | Teams with member counts and slots; `PUT /api/admin/teams/{teamId}/schedule` sets or clears a slot; `PUT /api/admin/schedule/live` with `{mode:'auto'}`, `{mode:'none'}` or `{mode:'team', teamId}` sets who performs now and returns `live`; `admin` only |
| `/api/uploads/*` | uploads | Avatar upload, finalize, read, and delete |
| `/api/notifications/*` | notifications | Push token registration and unregistration; a test push only with `ENABLE_TEST_PUSH=true` |
| `/storage/*` | storage | Signed local URLs; `filesystem` driver only |
| `/health/live`, `/health/ready` | app | Liveness; readiness (`SELECT 1`, cached for one second, `200` or `503`) |


Each client address gets `AUTH_RATE_LIMIT_MAX` writes per window under `/api/auth/*`, a separate equal budget under users, admin, and uploads, and a third under `/api/notifications/*`. `AUTH_BODY_LIMIT_BYTES` caps those request bodies. Both limits run before authentication. The removed `INGRESS_RATE_LIMIT_PROVIDER=yandex-sws` stops the backend at startup ([YANDEX_CLOUD](../docs/YANDEX_CLOUD.md#removed-smart-web-security-mode)). `GET /api/admin/users` has its own per-admin budget (`ADMIN_USERS_READ_RATE_LIMIT_*`), and so does the venue network screen's `GET /api/admin/network` (`ADMIN_NETWORK_READ_RATE_LIMIT_*`). `POST /api/event/ideas` (10 a minute) and `POST /api/event/diffusion/connections` (30 a minute) have a per-participant budget; the number of ideas stays unlimited. The public `GET /api/registration` and `/reference` answer from a 3 s in-process cache (this process's event switch and list import clear it). `POST /api/admin/planned-participants` takes bodies up to 1 MiB; every other account route keeps `AUTH_BODY_LIMIT_BYTES`. Session, token, reset, and role rules are in [ARCHITECTURE](../docs/ARCHITECTURE.md).

Sign-in also counts failed passwords per account (the SHA-256 of the address, so unknown addresses count alike) in `rate_limit_buckets` under the `login-failures` policy, whatever `RATE_LIMIT_STORE` says. After 10 in a clock-aligned 15-minute window the address gets `429 AUTH_LOGIN_LOCKED` with `Retry-After`, even with the right password; a success clears the count, and password reset is not limited by it.
Tradeoff: anyone who knows an address can lock its password sign-in for up to 15 minutes. Password reset still works, and the per-address ingress limit slows the attacker.

`notifications` registers Expo push tokens per app installation and queues pushes in PostgreSQL. Unregistering keeps an inactive installation row with a newer generation. The test push allows one message per user per minute. `notifications:process` or `start:worker:notifications` sends the queue and checks receipts ([BACKGROUND_JOBS](../docs/BACKGROUND_JOBS.md#push-pipeline)).

## Deploy

Follow [DEPLOYMENT](../docs/DEPLOYMENT.md) and the guide for the provider in `CHECKLIST.md`. `bun run release -- <provider>` runs `db:deploy` before it switches traffic. `db:deploy` checks database ownership, applies migrations, restricts privileges, optionally creates the first admin, and requires a login-capable admin. If the ownership check fails on an existing database, follow the `db:adopt-owner` steps in DEPLOYMENT.
