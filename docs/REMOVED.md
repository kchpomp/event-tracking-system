# Removed code ledger

What was deleted on purpose, so it can be restored on request. Audit: `reports/ponytail-audit.md`, 2026-10-29.

The code was uncommitted-tree work when removed. Restore from git history of the last commit before the owner's next commit (`git log -- <path>`, `git show <commit>:<path>`). If that history is gone, re-create it from the descriptions below. Ask: "restore X from audit 2026-10-29".

## DigitalOcean support in `scripts/infra.mjs` (about 560 lines of 3250)

Hosting is Yandex Cloud only ([DEPLOYMENT](DEPLOYMENT.md)). The `infra/digitalocean` roots were already gone, so this code could not run.

| Symbol | What it did |
| --- | --- |
| `digitalOceanRuntimeStateProblems`, `digitalOceanAppList`, `digitalOceanDeployedApps` | Refused a foundation change when runtime state had no API app ID but `doctl apps list` still showed the app. |
| `digitalOceanCliEnvironment`, `runDigitalOceanCli` | Ran `doctl` with the Terraform token and the `default` context. |
| `digitalOceanSpacesKeyProblems`, `digitalOceanTeamIdentityProblems` | Checked the Spaces key and the team UUID (`DO_EXPECTED_TEAM_UUID`) before any mutation. Ran inside `assertProviderIdentity`. |
| `assertDigitalOceanRuntimeState`, `syncDigitalOceanFirewallInput` | Wrote `trusted_api_app_id` so the database firewall trusted the API app. |
| `ensureDigitalOceanReleaseBranch`, `immutableReleaseBranch` | Pushed an immutable `infra-release/<commit>` branch for App Platform static sites. |
| `verifyDigitalOceanStaticCommit`, `activeDeploymentCommitProblems` | Polled `doctl apps list-deployments` until the ACTIVE deployment had the release commit. |
| `githubRepositoryFromRemoteUrl` and the `configuredGithubRepo` / `githubRepositoryRequired` checks in `releaseGitProblems` | Matched the git upstream to the GitHub repo that App Platform builds. |
| DigitalOcean branches | `safeOutputNames.digitalocean`, `providerRootNames.digitalocean` (foundation, runtime, static), `static` root path, protected-resource patterns for `digitalocean_*`, Spaces backend endpoint with region `us-east-1`, `digitalocean_spaces_key` as non-importable, `DIGITALOCEAN_TOKEN` and `SPACES_*` in the build-secret filter, `doctl registry login`, the `digitalocean` promotion pipeline (runtime, tighten firewall, static, verify), the DigitalOcean release flow in `release()`, planning of existing runtime and static roots, import inputs for `runtime` and `static`, flags `--release-revision=` and `--source-branch=`. |

Tests removed with it: about 290 lines of `scripts/infra.test.mjs` (1759 to 1469) and one example endpoint in `scripts/repo-env.test.mjs`. Tests that only used `digitalocean` as a sample provider now use `yandex`.

To restore, ask for a DigitalOcean provider. It also needs the `infra/digitalocean` Terraform roots and a guide, which are gone.

Stale DigitalOcean mentions were reworded in `backend/.env.example`, `backend/src/env.ts`, `backend/scripts/deploy-database.ts`, `website/astro.config.mjs`.

## `passwordResetAccepted` in `backend/src/modules/auth/application/ports.ts` (3 lines)

A constant `{ accepted: true }` typed as `PasswordResetRequestResponse`. It had no users. The type import went with it.

## Narrowed exports (behavior unchanged)

The `export` keyword was removed where the symbol is used only in its own file. Add `export` back if another file needs it.

- `validationErrorResponse` (`backend/src/http/errors.ts`)
- `toBillingAppError`, `toUploadsAppError` (their `transport/errors.ts`)
- `unregisterPushToken`, `hasActivePushToken` (`notifications/infrastructure/notification-operations.ts`)
- `terminalStatuses` (`backend/src/outbox/store.ts`)
- `teamMembersQueryOptions` (`webapp/src/features/event/queries.ts`)
- `networkQueryOptions`, `NETWORK_POLL_MS`, `NETWORK_RETRY_MS` (`webapp/src/features/network/queries.ts`)
- `neighbourDistance`, `FRESH_MS`, `FRESH_MAX` (`webapp/src/features/network/model.ts`)
- `SectionMetric` (`webapp/src/components/dashboard/SectionCards.tsx`)
- `LIQUID_FULL_AT` (`flask/model.ts`), `FLASK_POLL_MS`, `FLASK_RETRY_MS`, `flaskQueryOptions` (`flask/queries.ts`), `REMINDER_MS` (`event/schedule-model.ts`)

Left exported on purpose: `toAuthAppError`, `toUsersAppError`, `toEventAppError`, `NEUTRAL_INITIALS` (other work in progress in those modules).


## `mobile/` (the Expo app)

The whole app was removed: the product runs in the phone browser through `webapp`. Restore it from git history before the commit that deleted `mobile/`.