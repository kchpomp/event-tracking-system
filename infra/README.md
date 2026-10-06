# Infrastructure as code

Terraform roots for Yandex Cloud. Run every operation through `scripts/infra.mjs`. Procedures and rules: [DEPLOYMENT](../docs/DEPLOYMENT.md). All commands: [COMMANDS](../docs/COMMANDS.md).

## Roots

Each root has its own state key in one remote bucket (S3 lockfile locking) and pinned provider versions.

- `bootstrap/`: the state bucket and its scoped key. Its state starts local.
- `production/`: persistent resources such as the network, database, registry, and storage. The CLI calls this root `foundation`; its state key is `production/terraform.tfstate`.
- `migration/` (Yandex): the one-shot migration container.
- `runtime/`: the API, jobs, domains, and the optional Yandex CDN.
- `operations/`: the production mutation lease.

Only `bootstrap/` and `production/` take a `terraform.tfvars`. The script writes other inputs as temporary `0600` files and deletes them and the saved plans on exit.

## Command flow

`infra:bootstrap` changes `bootstrap/`; pass `--new` only for the first create. `infra:apply` changes only the foundation. `release` requires a no-change foundation plan, then applies the release roots. `infra:plan`, `infra:output`, and `--dry-run` change nothing, and `release --dry-run` also skips the source check and the build. Each apply uses exactly the saved and checked plan; unsafe deletions are refused.

## Release source

A real release requires, and rechecks before each phase:

- a named branch equal to the foundation's `git_branch`, tracking that branch on a pushed upstream;
- `HEAD` equal to the freshly fetched upstream commit;
- a clean worktree;

Keep the checkout unchanged until the release ends: a change stops it at the next check, possibly after the migration. A later upstream push does not change the captured commit.

Docker and the Yandex static build use a `git archive` of that commit, not the worktree.

## Lease

Real `infra:apply`, `release`, and non-bootstrap `infra:import` take a provider-wide lease: a Terraform apply in `operations/` holds its state lock for the whole command. A second mutation stops at the lock. The script checks the lease around each phase and stops if it is lost. Other commands take only their roots' own locks.

If a crash leaves the lease locked:

1. Confirm that no `scripts/infra.mjs`, Terraform, or lease-holder process still runs.
2. In `infra/<provider>/operations`, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to the `TF_STATE_*` values from `infra/<provider>/.env.terraform-state`. Run `terraform init -reconfigure -backend-config=backend.backend.hcl`.
3. Run `terraform force-unlock <LOCK_ID>` with the ID of this operations lock from Terraform's output. Never unlock a live process.
4. If the next command stops at a lock on another root, unlock it the same way from that root's directory, but only when Terraform's lock info (`Who`, `Created`, `Operation`) shows the crashed run. A plan holds its roots' locks without the lease.

## Responsibilities

- `backend/src/job-schedules.json` drives the scheduler and the Yandex timers; change schedules and limits there.
- Use the provider console for observation, account access, and emergency diagnosis. Import a resource created by hand or revert the drift.
