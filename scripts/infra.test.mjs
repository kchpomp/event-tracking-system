import { describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  backendEnvironment,
  bootstrapStateMode,
  bootstrapTemporaryAccess,
  digestFromRepoDigests,
  dockerfileBaseImages,
  discardDisposableSecrets,
  executePromotionPipeline,
  nonImportableResourceProblem,
  importReleaseInputs,
  parseArguments,
  parseSimpleAssignments,
  planSafetyProblems,
  prepareBootstrapBackend,
  protectedYandexSecretVersionDestroyAddresses,
  finalizeStateRecovery,
  prepareStateRecoveryAccess,
  productionMutationNeedsLease,
  redactArguments,
  releaseGitProblems,
  renderBackendConfig,
  safeTerraformOutputs,
  safeYandexFoundationDestroyAddresses,
  safeYandexMigrationSeedDestroyAddresses,
  sanitizedBuildEnvironment,
  safeYandexSecretVersionDestroyAddresses,
  s3CredentialEnvironment,
  seedVariables,
  stateKeyForRoot,
  stateRecoveryOutputs,
  staticUploadSteps,
  verifyYandexStaticCommit,
  verifyYandexStaticReadsAfterApply,
  verifyYandexWebappFallback,
  withProductionMutationLease,
  yandexDatabaseRotationProblems,
  yandexRuntimeStateProblems,
  writeDisposableRootInputs,
  writeYandexStaticReleaseMarkers,
  yieldToProcessEvents,
} from './infra.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('Terraform configuration helpers', () => {
  test('reads only simple top-level tfvars without evaluating interpolation', () => {
    expect(
      parseSimpleAssignments(`
        # Durable project configuration.
        cloud_id = "cloud-id"
        git_branch = 'master' # trailing comment
        enable_cdn = false
        runtime_image_digest = null
        database_blue_password = "\${NOT_EXECUTED}"
        subnets = {
          ru-central1-a = "10.20.0.0/24"
        }
      `),
    ).toEqual({
      cloud_id: 'cloud-id',
      git_branch: 'master',
      enable_cdn: false,
      runtime_image_digest: null,
      database_blue_password: '${NOT_EXECUTED}',
    })
  })

  test('renders credential-free backend configuration', () => {
    const yandex = renderBackendConfig('yandex', {
      bucket: 'product-state',
      key: 'production/terraform.tfstate',
      region: 'ru-central1',
    })

    expect(yandex).toContain('https://storage.yandexcloud.net')
    expect(yandex).toContain('region = "ru-central1"')
    expect(yandex).toContain('skip_s3_checksum')
    expect(yandex.match(/skip_credentials_validation/g)).toHaveLength(1)
    expect(yandex).not.toContain('secret')
    expect(yandex).not.toContain('access_key')
  })

  test('keeps foundation state compatible while isolating release roots', () => {
    expect(stateKeyForRoot('bootstrap')).toBe('bootstrap/terraform.tfstate')
    expect(stateKeyForRoot('foundation')).toBe('production/terraform.tfstate')
    expect(stateKeyForRoot('migration')).toBe('migration/terraform.tfstate')
    expect(stateKeyForRoot('runtime')).toBe('runtime/terraform.tfstate')
    expect(stateKeyForRoot('static')).toBe('static/terraform.tfstate')
  })

  test('protects the database credential slot used by the live Yandex runtime', () => {
    const current = {
      fingerprints: { blue: 'blue-old', green: 'green-old', jwt: 'jwt-old' },
      versions: { blue: 1, green: 1 },
    }

    expect(
      yandexDatabaseRotationProblems({
        current,
        liveSlot: 'blue',
        desired: {
          activeSlot: 'green',
          fingerprints: {
            blue: 'blue-old',
            green: 'green-new',
            jwt: 'jwt-old',
          },
          versions: { blue: 1, green: 2 },
        },
      }),
    ).toEqual([])

    expect(
      yandexDatabaseRotationProblems({
        current: {
          fingerprints: {
            blue: 'blue-old',
            green: 'green-new',
            jwt: 'jwt-old',
          },
          versions: { blue: 1, green: 2 },
        },
        liveSlot: 'green',
        desired: {
          activeSlot: 'green',
          fingerprints: {
            blue: 'blue-new',
            green: 'green-new',
            jwt: 'jwt-old',
          },
          versions: { blue: 2, green: 2 },
        },
      }),
    ).toEqual([])

    expect(
      yandexDatabaseRotationProblems({
        current,
        liveSlot: 'blue',
        desired: {
          activeSlot: 'green',
          fingerprints: { blue: 'blue-new', green: 'green-new' },
          versions: { blue: 2, green: 2 },
        },
      }),
    ).toEqual([
      'database credential slot blue is still used by the live runtime; rotate only the inactive slot before switching',
    ])

    expect(
      yandexDatabaseRotationProblems({
        current: {
          fingerprints: {
            blue: 'blue-old',
            green: 'green-new',
            jwt: 'jwt-old',
          },
          versions: { blue: 1, green: 2 },
        },
        liveSlot: 'blue',
        desired: {
          activeSlot: 'green',
          fingerprints: {
            blue: 'blue-old',
            green: 'green-new',
            jwt: 'jwt-old',
          },
          versions: { blue: 1, green: 2 },
        },
      }),
    ).toEqual([])

    expect(
      yandexDatabaseRotationProblems({
        current: null,
        liveSlot: 'blue',
        desired: {
          activeSlot: 'green',
          fingerprints: {
            blue: 'blue-old',
            green: 'green-new',
            jwt: 'jwt-old',
          },
          versions: { blue: 1, green: 2 },
        },
      }),
    ).toEqual([
      'the live runtime reports database slot blue, but foundation rotation metadata is missing; import or reconcile state before changing credentials',
    ])

    expect(
      yandexDatabaseRotationProblems({
        current,
        liveSlot: 'blue',
        desired: {
          activeSlot: 'green',
          fingerprints: {
            blue: 'blue-old',
            green: 'green-old',
            jwt: 'jwt-new',
          },
          versions: { blue: 1, green: 1 },
        },
      }),
    ).toEqual([
      'JWT_SECRET is present in both persistent runtime slot versions; rotate it only after implementing an application key-overlap flow',
    ])
  })

  test('fails closed when Yandex runtime resources exist without runtime state', () => {
    const foundationMetadata = {
      fingerprints: { blue: 'blue', green: 'green', jwt: 'jwt' },
      versions: { blue: 1, green: 1 },
    }

    expect(
      yandexRuntimeStateProblems({
        foundationMetadata: null,
        deployedContainerNames: ['example-product-prod-api'],
        projectSlug: 'example-product',
      }),
    ).toEqual([])
    expect(
      yandexRuntimeStateProblems({
        foundationMetadata,
        deployedContainerNames: ['example-product-prod-migration'],
        projectSlug: 'example-product',
      }),
    ).toEqual([])
    expect(
      yandexRuntimeStateProblems({
        foundationMetadata,
        deployedContainerNames: [
          'example-product-prod-api',
          'example-product-prod-outbox',
        ],
        projectSlug: 'example-product',
      }),
    ).toEqual([
      'Yandex runtime state has no credential slot, but deployed runtime containers still exist: example-product-prod-api, example-product-prod-outbox. Recover or import the runtime state before changing foundation credentials.',
    ])
  })

  test('allows replacement only for non-live Yandex Lockbox versions', () => {
    expect(safeYandexSecretVersionDestroyAddresses('blue')).toEqual([
      'yandex_lockbox_secret_version_hashed.runtime["green"]',
      'yandex_lockbox_secret_version_hashed.migration_database',
    ])
    expect(safeYandexSecretVersionDestroyAddresses(null)).toEqual([
      'yandex_lockbox_secret_version_hashed.runtime["blue"]',
      'yandex_lockbox_secret_version_hashed.runtime["green"]',
      'yandex_lockbox_secret_version_hashed.migration_database',
    ])
    expect(protectedYandexSecretVersionDestroyAddresses('blue')).toEqual([
      'yandex_lockbox_secret_version_hashed.runtime["blue"]',
    ])
  })

  test('allows only the known ephemeral Yandex cleanup deletes on restart', () => {
    const interruptedFoundationPlan = {
      resource_changes: [
        {
          address:
            'yandex_resourcemanager_folder_iam_member.storage_manager[0]',
          change: { actions: ['delete'] },
        },
      ],
    }
    const interruptedSeedCleanupPlan = {
      resource_changes: [
        {
          address: 'yandex_lockbox_secret.admin_seed[0]',
          change: { actions: ['delete'] },
        },
        {
          address:
            'yandex_lockbox_secret_version_hashed.admin_seed[0]',
          change: { actions: ['delete'] },
        },
        {
          address: 'yandex_lockbox_secret_iam_member.admin_seed[0]',
          change: { actions: ['delete'] },
        },
      ],
    }

    expect(
      planSafetyProblems(
        interruptedFoundationPlan,
        safeYandexFoundationDestroyAddresses(),
      ),
    ).toEqual([])
    expect(
      planSafetyProblems(
        interruptedSeedCleanupPlan,
        safeYandexMigrationSeedDestroyAddresses(),
      ),
    ).toEqual([])
    expect(safeYandexFoundationDestroyAddresses()).toEqual([
      'yandex_resourcemanager_folder_iam_member.storage_manager[0]',
    ])
    expect(safeYandexMigrationSeedDestroyAddresses()).toEqual([
      'yandex_lockbox_secret.admin_seed[0]',
      'yandex_lockbox_secret_version_hashed.admin_seed[0]',
      'yandex_lockbox_secret_iam_member.admin_seed[0]',
    ])
  })

  test('copyable production examples leave environment-injected secrets unassigned', () => {
    const yandex = parseSimpleAssignments(
      readFileSync(
        resolve(repoRoot, 'infra/yandex/production/terraform.tfvars.example'),
        'utf8',
      ),
    )

    expect(yandex).not.toHaveProperty('database_blue_password')
    expect(yandex).not.toHaveProperty('database_green_password')
    expect(yandex).not.toHaveProperty('database_owner_password')
    expect(yandex).not.toHaveProperty('jwt_secret')
  })

  test('resumes local-to-remote migration after an interrupted bootstrap', () => {
    expect(
      bootstrapStateMode({ hasStateEnvironment: false, hasLocalState: false }),
    ).toBe('ambiguous')
    expect(
      bootstrapStateMode({
        hasStateEnvironment: false,
        hasLocalState: false,
        newBootstrap: true,
      }),
    ).toBe('local')
    expect(
      bootstrapStateMode({ hasStateEnvironment: false, hasLocalState: true }),
    ).toBe('local')
    expect(
      bootstrapStateMode({ hasStateEnvironment: true, hasLocalState: true }),
    ).toBe('migrate')
    expect(
      bootstrapStateMode({ hasStateEnvironment: true, hasLocalState: false }),
    ).toBe('remote')
    expect(
      bootstrapStateMode({
        hasStateEnvironment: false,
        hasLocalState: false,
        recoverExisting: true,
      }),
    ).toBe('recover')
  })

  test('honors the temporary state role only from tfvars and never during recovery', () => {
    const env = {}
    for (const value of [true, 'true']) {
      expect(
        bootstrapTemporaryAccess({
          provider: 'yandex',
          tfvars: { bootstrap_folder_storage_access: value },
          stateMode: 'remote',
          env,
        }),
      ).toEqual({ requested: true, problem: null })
    }
    expect(
      bootstrapTemporaryAccess({
        provider: 'yandex',
        tfvars: { bootstrap_folder_storage_access: false },
        stateMode: 'remote',
        env,
      }),
    ).toEqual({ requested: false, problem: null })
    expect(
      bootstrapTemporaryAccess({
        provider: 'yandex',
        tfvars: {},
        stateMode: 'local',
        env,
      }),
    ).toEqual({ requested: false, problem: null })

    const recovery = bootstrapTemporaryAccess({
      provider: 'yandex',
      tfvars: { bootstrap_folder_storage_access: true },
      stateMode: 'recover',
      env,
    })
    expect(recovery.requested).toBe(true)
    expect(recovery.problem).toContain('before state recovery')

    const exported = bootstrapTemporaryAccess({
      provider: 'yandex',
      tfvars: {},
      stateMode: 'remote',
      env: { TF_VAR_bootstrap_folder_storage_access: 'false' },
    })
    expect(exported.requested).toBe(false)
    expect(exported.problem).toContain('Unset TF_VAR_bootstrap_folder_storage_access')
  })

  test('builds reattach configuration only from paired recovery signals', () => {
    expect(
      stateRecoveryOutputs(
        { bucket: 'existing-state', region: 'fra1' },
        {
          TF_STATE_RECOVERY_ACCESS_KEY_ID: 'temporary-id',
          TF_STATE_RECOVERY_SECRET_ACCESS_KEY: 'temporary-secret',
        },
      ),
    ).toEqual({
      state_bucket: 'existing-state',
      state_region: 'fra1',
      state_access_key_id: 'temporary-id',
      state_secret_access_key: 'temporary-secret',
    })
    expect(() =>
      stateRecoveryOutputs(
        { bucket: 'existing-state', region: 'fra1' },
        { TF_STATE_RECOVERY_ACCESS_KEY_ID: 'temporary-id' },
      ),
    ).toThrow('TF_STATE_RECOVERY_SECRET_ACCESS_KEY')
  })

  test('keeps temporary recovery credentials in memory so an interrupted reattach can retry', () => {
    const outputs = {
      state_bucket: 'existing-state',
      state_region: 'fra1',
      state_access_key_id: 'temporary-id',
      state_secret_access_key: 'temporary-secret',
    }
    const events = []
    const prepare = () =>
      prepareStateRecoveryAccess(
        {
          provider: 'yandex',
          outputs,
          paths: { roots: { foundation: '/foundation' } },
          baseEnvironment: { KEEP_ME: 'yes' },
        },
        {
          writeConfiguration: () => events.push('write-backend-config'),
        },
      )

    expect(prepare()).toEqual({
      KEEP_ME: 'yes',
      AWS_ACCESS_KEY_ID: 'temporary-id',
      AWS_SECRET_ACCESS_KEY: 'temporary-secret',
    })
    expect(prepare()).toEqual(prepare())
    expect(events).toEqual([
      'write-backend-config',
      'write-backend-config',
      'write-backend-config',
    ])
  })

  test('writes the managed recovery marker only after every backend accepts the managed key', () => {
    const events = []
    const input = {
      provider: 'yandex',
      paths: { bootstrapRoot: '/bootstrap', roots: { runtime: '/runtime' } },
      managedOutputs: {
        state_bucket: 'state-bucket',
        state_region: 'ru-central1',
        state_access_key_id: 'managed-id',
        state_secret_access_key: 'managed-secret',
      },
      expectedStateBucket: 'state-bucket',
      baseEnvironment: {},
    }
    const operations = {
      verifyBootstrap: () => events.push('verify-bootstrap'),
      initializeRoot: (rootName) => events.push(`init-${rootName}`),
      writeArtifacts: () => events.push('write-marker'),
    }

    finalizeStateRecovery(input, operations)
    expect(events).toEqual([
      'verify-bootstrap',
      'init-runtime',
      'write-marker',
    ])

    events.length = 0
    expect(() =>
      finalizeStateRecovery(input, {
        ...operations,
        initializeRoot: () => {
          throw new Error('runtime backend rejected managed key')
        },
      }),
    ).toThrow('runtime backend rejected managed key')
    expect(events).toEqual(['verify-bootstrap'])
  })

  test('verifies migrated state before deleting local recovery state', () => {
    const events = []
    const outputs = {
      state_bucket: 'state-bucket',
      state_region: 'fra1',
      state_access_key_id: 'scoped-id',
      state_secret_access_key: 'scoped-secret',
    }

    prepareBootstrapBackend(
      {
        provider: 'yandex',
        paths: { bootstrapRoot: '/bootstrap', productionRoot: '/production' },
        stateMode: 'migrate',
        dryRun: false,
        remoteEnvironment: { AWS_ACCESS_KEY_ID: 'scoped-id' },
        expectedStateBucket: 'state-bucket',
      },
      {
        initialize: (_root, _env, args) => events.push(['init', ...args]),
        readOutputs: () => {
          events.push(['verify'])
          return outputs
        },
        removeLocalState: () => events.push(['remove-local-state']),
        writeArtifacts: () => events.push(['write-artifacts']),
      },
    )

    expect(events).toEqual([
      [
        'init',
        '-migrate-state',
        '-force-copy',
        '-backend-config=backend.backend.hcl',
      ],
      ['verify'],
      ['remove-local-state'],
      ['write-artifacts'],
    ])
  })

  test('keeps local state when remote migration verification fails', () => {
    const events = []

    expect(() =>
      prepareBootstrapBackend(
        {
          provider: 'yandex',
          paths: { bootstrapRoot: '/bootstrap', productionRoot: '/production' },
          stateMode: 'migrate',
          dryRun: false,
          remoteEnvironment: {},
          expectedStateBucket: 'expected-state-bucket',
        },
        {
          initialize: () => events.push('init'),
          readOutputs: () => ({
            state_bucket: 'wrong-state-bucket',
            state_region: 'ru-central1',
            state_access_key_id: 'scoped-id',
            state_secret_access_key: 'scoped-secret',
          }),
          removeLocalState: () => events.push('remove-local-state'),
          writeArtifacts: () => events.push('write-artifacts'),
        },
      ),
    ).toThrow('different state bucket')
    expect(events).toEqual(['init'])
  })

  test('refuses to plan against an empty remote bootstrap state', () => {
    expect(() =>
      prepareBootstrapBackend(
        {
          provider: 'yandex',
          paths: { bootstrapRoot: '/bootstrap', productionRoot: '/production' },
          stateMode: 'remote',
          dryRun: false,
          remoteEnvironment: {},
        },
        {
          initialize: () => {},
          readOutputs: () => ({}),
        },
      ),
    ).toThrow('required state outputs')
  })

  test('maps the scoped state key only to the S3 backend environment', () => {
    expect(
      backendEnvironment(
        {
          TF_STATE_ACCESS_KEY_ID: 'scoped-id',
          TF_STATE_SECRET_ACCESS_KEY: 'scoped-secret',
        },
        {
          KEEP_ME: 'yes',
          AWS_SESSION_TOKEN: 'stale-session',
          AWS_SECURITY_TOKEN: 'stale-security-token',
        },
      ),
    ).toEqual({
      KEEP_ME: 'yes',
      AWS_ACCESS_KEY_ID: 'scoped-id',
      AWS_SECRET_ACCESS_KEY: 'scoped-secret',
    })
    expect(() =>
      backendEnvironment({ TF_STATE_ACCESS_KEY_ID: 'only-one' }),
    ).toThrow('state backend credentials')

    expect(
      s3CredentialEnvironment(
        { accessKey: 'publisher-id', secretKey: 'publisher-secret' },
        {
          AWS_SESSION_TOKEN: 'stale-session',
          AWS_SECURITY_TOKEN: 'stale-security-token',
        },
      ),
    ).toEqual({
      AWS_ACCESS_KEY_ID: 'publisher-id',
      AWS_SECRET_ACCESS_KEY: 'publisher-secret',
    })
  })
})

describe('release safety', () => {
  test('holds one production lease until the complete mutation settles', async () => {
    const events = []
    await expect(
      withProductionMutationLease(
        async () => ({
          assertHeld: () => events.push('assert-held'),
          release: () => events.push('release'),
        }),
        async ({ assertHeld }) => {
          events.push('runtime')
          assertHeld()
          events.push('static')
          return 'complete'
        },
      ),
    ).resolves.toBe('complete')
    expect(events).toEqual([
      'assert-held',
      'runtime',
      'assert-held',
      'static',
      'assert-held',
      'release',
    ])

    events.length = 0
    await expect(
      withProductionMutationLease(
        async () => ({ release: () => events.push('release') }),
        async () => {
          throw new Error('mutation failed')
        },
      ),
    ).rejects.toThrow('mutation failed')
    expect(events).toEqual(['release'])
  })

  test('serializes competing production mutations and releases the scope for retry', async () => {
    let held = false
    const acquire = async () => {
      if (held) throw new Error('lease already held')
      held = true
      return {
        assertHeld: () => {
          if (!held) throw new Error('lease lost')
        },
        release: () => {
          held = false
        },
      }
    }
    let finishFirst
    const first = withProductionMutationLease(
      acquire,
      () => new Promise((resolve) => (finishFirst = resolve)),
    )
    await Promise.resolve()

    await expect(
      withProductionMutationLease(acquire, async () => 'second'),
    ).rejects.toThrow('lease already held')
    finishFirst('first')
    await expect(first).resolves.toBe('first')
    await expect(
      withProductionMutationLease(acquire, async () => 'retry'),
    ).resolves.toBe('retry')
  })

  test('locks only commands that mutate provider production state', () => {
    expect(
      productionMutationNeedsLease({ command: 'apply', dryRun: false }),
    ).toBe(true)
    expect(
      productionMutationNeedsLease({ command: 'release', dryRun: false }),
    ).toBe(true)
    expect(
      productionMutationNeedsLease({
        command: 'import',
        rootName: 'runtime',
        dryRun: false,
      }),
    ).toBe(true)
    expect(
      productionMutationNeedsLease({
        command: 'import',
        rootName: 'bootstrap',
        dryRun: false,
      }),
    ).toBe(false)
    expect(
      productionMutationNeedsLease({ command: 'apply', dryRun: true }),
    ).toBe(false)
    expect(
      productionMutationNeedsLease({ command: 'plan', dryRun: true }),
    ).toBe(false)
  })

  test('refuses a dirty, detached, unpushed, or wrong-ref release source', () => {
    expect(
      releaseGitProblems({
        currentBranch: 'master',
        configuredBranch: 'production',
        upstreamRef: 'origin/other',
        headCommit: 'local-commit',
        upstreamCommit: 'remote-commit',
        dirtyLines: [' M backend/src/index.ts'],
      }),
    ).toHaveLength(4)

    expect(
      releaseGitProblems({
        currentBranch: 'master',
        configuredBranch: 'master',
        upstreamRef: 'origin/master',
        headCommit: 'same-commit',
        upstreamCommit: 'same-commit',
        dirtyLines: [],
      }),
    ).toEqual([])

    expect(
      releaseGitProblems({
        currentBranch: 'master',
        configuredBranch: 'master',
        upstreamRef: 'origin/master',
        headCommit: 'new-commit',
        upstreamCommit: 'new-commit',
        expectedCommit: 'captured-commit',
        dirtyLines: [],
      }),
    ).toEqual([
      'release source changed after preflight: expected captured-commit, found new-commit',
    ])

    expect(
      releaseGitProblems({
        currentBranch: 'master',
        configuredBranch: 'master',
        upstreamRef: 'origin/master',
        headCommit: 'captured-commit',
        upstreamCommit: 'newer-upstream-commit',
        expectedCommit: 'captured-commit',
        dirtyLines: [],
      }),
    ).toEqual([])

    expect(
      releaseGitProblems({
        currentBranch: 'feature',
        configuredBranch: undefined,
        upstreamRef: 'origin/feature',
        headCommit: 'same-commit',
        upstreamCommit: 'same-commit',
        dirtyLines: [],
      }),
    ).toEqual([
      'Terraform foundation state does not identify the configured release branch; run bun run infra:apply for the selected provider',
    ])
  })

  test('shows only explicitly safe Terraform outputs', () => {
    expect(
      safeTerraformOutputs('yandex', {
        api_url: 'https://api.example.com',
        database_credential_slot: 'green',
        required_dns_records: { api: { value: 'gateway.example' } },
        static_publisher_access_key_id: 'public-but-operationally-secret',
        static_publisher_secret_access_key: 'secret',
      }),
    ).toEqual({
      api_url: 'https://api.example.com',
      database_credential_slot: 'green',
      required_dns_records: { api: { value: 'gateway.example' } },
    })
  })

  test('allows creates and updates, but requires exact opt-in for ordinary deletes', () => {
    const plan = {
      resource_changes: [
        { address: 'yandex_cm_certificate.api', change: { actions: ['update'] } },
        {
          address: 'yandex_cm_certificate.website',
          change: { actions: ['delete'] },
        },
      ],
    }

    expect(planSafetyProblems(plan, [])).toEqual([
      'yandex_cm_certificate.website would be deleted; pass --allow-destroy=yandex_cm_certificate.website only after reviewing that exact resource',
    ])
    expect(planSafetyProblems(plan, ['yandex_cm_certificate.website'])).toEqual(
      [],
    )
  })

  test('never accepts deletion or replacement of protected stateful resources', () => {
    const plan = {
      resource_changes: [
        {
          address: 'yandex_mdb_postgresql_cluster.production',
          change: { actions: ['delete', 'create'] },
        },
        {
          address: 'yandex_storage_bucket.media',
          change: { actions: ['delete'] },
        },
        {
          address:
            'yandex_iam_service_account_static_access_key.terraform_state',
          change: { actions: ['delete', 'create'] },
        },
        {
          address:
            'yandex_iam_service_account_static_access_key.media',
          change: { actions: ['delete', 'create'] },
        },
        {
          address:
            'yandex_iam_service_account_static_access_key.postbox[0]',
          change: { actions: ['delete', 'create'] },
        },
      ],
    }

    const problems = planSafetyProblems(plan, [
      'yandex_mdb_postgresql_cluster.production',
      'yandex_storage_bucket.media',
      'yandex_iam_service_account_static_access_key.terraform_state',
      'yandex_iam_service_account_static_access_key.media',
      'yandex_iam_service_account_static_access_key.postbox[0]',
    ])
    expect(problems).toHaveLength(5)
    expect(problems.every((problem) => problem.includes('protected'))).toBe(
      true,
    )
  })

  test('never accepts manual deletion of the active Yandex runtime secret version', () => {
    const activeVersion =
      'yandex_lockbox_secret_version_hashed.runtime["blue"]'
    const plan = {
      resource_changes: [
        {
          address: activeVersion,
          change: { actions: ['delete', 'create'] },
        },
      ],
    }

    expect(
      planSafetyProblems(
        plan,
        [activeVersion],
        protectedYandexSecretVersionDestroyAddresses('blue'),
      ),
    ).toEqual([
      `${activeVersion} is protected and would be replaced; this release path refuses it`,
    ])
  })

  test('executes phases in migration-gated order', async () => {
    const yandexEvents = []
    await expect(
      executePromotionPipeline('yandex', {
        deployMigration: async () => {
          yandexEvents.push('migration-revision')
          return { url: 'migration-url' }
        },
        invokeMigration: async () => {
          yandexEvents.push('invoke-migration')
          throw new Error('migration failed')
        },
        removeMigrationSeed: async () => yandexEvents.push('remove-seed'),
        deployRuntime: async () => yandexEvents.push('runtime'),
        publishStatic: async () => yandexEvents.push('static'),
        verify: async () => yandexEvents.push('verify'),
      }),
    ).rejects.toThrow('migration failed')
    expect(yandexEvents).toEqual(['migration-revision', 'invoke-migration'])

    const successfulYandexEvents = []
    await executePromotionPipeline('yandex', {
      deployMigration: async () => {
        successfulYandexEvents.push('migration-revision')
        return { url: 'migration-url' }
      },
      invokeMigration: async () => successfulYandexEvents.push('migration-ok'),
      removeMigrationSeed: async () =>
        successfulYandexEvents.push('remove-seed'),
      deployRuntime: async () => {
        successfulYandexEvents.push('runtime')
        return { api_url: 'https://api.example.com' }
      },
      publishStatic: async () => successfulYandexEvents.push('static'),
      verify: async () => successfulYandexEvents.push('verify'),
    })
    expect(successfulYandexEvents).toEqual([
      'migration-revision',
      'migration-ok',
      'remove-seed',
      'runtime',
      'static',
      'verify',
    ])
  })

  test('stops promotion before the next phase when the production lease is lost', async () => {
    const events = []
    let held = true

    await expect(
      executePromotionPipeline(
        'yandex',
        {
          deployMigration: async () => {
            events.push('migration')
            held = false
          },
          verify: async () => events.push('verify'),
        },
        () => {
          events.push('assert-held')
          if (!held) throw new Error('production mutation lease was lost')
        },
      ),
    ).rejects.toThrow('production mutation lease was lost')
    expect(events).toEqual(['assert-held', 'migration', 'assert-held'])
  })

  test('observes a lease process exit after a synchronous phase', async () => {
    const events = []
    let leaseChild
    let settled = false

    try {
      await expect(
        executePromotionPipeline(
          'yandex',
          {
            deployMigration: async () => {
              events.push('migration')
              leaseChild = spawn(process.execPath, ['-e', 'process.exit(7)'], {
                stdio: 'ignore',
              })
              leaseChild.once('close', () => {
                settled = true
              })
              Atomics.wait(
                new Int32Array(new SharedArrayBuffer(4)),
                0,
                0,
                150,
              )
            },
            verify: async () => events.push('verify'),
          },
          async () => {
            await yieldToProcessEvents()
            events.push('assert-held')
            if (settled) throw new Error('production mutation lease was lost')
          },
        ),
      ).rejects.toThrow('production mutation lease was lost')
    } finally {
      if (leaseChild && !settled) {
        leaseChild.kill('SIGTERM')
        await new Promise((resolveClose) =>
          leaseChild.once('close', resolveClose),
        )
      }
    }

    expect(events).toEqual(['assert-held', 'migration', 'assert-held'])
  })

  test('requires adoption inputs that materialize release roots', () => {
    const digest = `sha256:${'a'.repeat(64)}`
    expect(
      importReleaseInputs('yandex', 'migration', {
        runtimeImageDigest: digest,
      }),
    ).toMatchObject({ migration_image_digest: digest })
    expect(() => importReleaseInputs('yandex', 'runtime', {})).toThrow(
      '--runtime-image-digest',
    )
  })

  test('rejects provider access keys that cannot be imported or recover secrets', () => {
    expect(
      nonImportableResourceProblem(
        'yandex',
        'yandex_iam_service_account_static_access_key.static_publisher',
      ),
    ).toContain('create a new Terraform-owned key')
    expect(
      nonImportableResourceProblem(
        'yandex',
        'yandex_storage_bucket.media',
      ),
    ).toBeNull()
  })

  test('parses explicit import roots', () => {
    expect(
      parseArguments([
        'import',
        'yandex',
        'migration',
        'yandex_storage_bucket.media',
        'bucket-id',
        `--runtime-image-digest=sha256:${'a'.repeat(64)}`,
      ]),
    ).toMatchObject({
      provider: 'yandex',
      rootName: 'migration',
      resourceAddress: 'yandex_storage_bucket.media',
      resourceId: 'bucket-id',
    })
  })

  test('requires explicit and unambiguous bootstrap creation or recovery flags', () => {
    expect(parseArguments(['bootstrap', 'yandex', '--new'])).toMatchObject({
      newBootstrap: true,
    })
    expect(
      parseArguments([
        'bootstrap',
        'yandex',
        '--recover-state-bucket=existing-state',
        '--recover-state-region=fra1',
      ]),
    ).toMatchObject({
      recoverStateBucket: 'existing-state',
      recoverStateRegion: 'fra1',
    })
    expect(() =>
      parseArguments([
        'bootstrap',
        'yandex',
        '--recover-state-bucket=existing-state',
      ]),
    ).toThrow('both --recover-state-bucket and --recover-state-region')
    expect(() =>
      parseArguments([
        'bootstrap',
        'yandex',
        '--new',
        '--recover-state-bucket=existing-state',
        '--recover-state-region=ru-central1',
      ]),
    ).toThrow('mutually exclusive')
  })

  test('extracts only a digest belonging to the pushed repository', () => {
    const digest = 'sha256:d'.padEnd(71, 'd')
    expect(
      digestFromRepoDigests(
        [
          'registry.example/other@sha256:eeee',
          `registry.example/product/backend@${digest}`,
        ],
        'registry.example/product/backend',
      ),
    ).toBe(digest)
    expect(() =>
      digestFromRepoDigests([], 'registry.example/product/backend'),
    ).toThrow('immutable digest')
  })

  test('redacts credential-shaped arguments before logging commands', () => {
    const rendered = redactArguments([
      'plan',
      '-var',
      'jwt_secret=super-secret',
      '--header',
      'Authorization: Bearer token-value',
      '--normal',
      'visible',
    ]).join(' ')

    expect(rendered).not.toContain('super-secret')
    expect(rendered).not.toContain('token-value')
    expect(rendered).toContain('visible')
    expect(rendered).toContain('[REDACTED]')
  })

  test('does not expose cloud or Terraform secrets to frontend build processes', () => {
    expect(
      sanitizedBuildEnvironment({
        PATH: '/tools',
        HOME: '/home/builder',
        TF_VAR_database_blue_password: 'blue-database-secret',
        TF_VAR_database_green_password: 'green-database-secret',
        AWS_SECRET_ACCESS_KEY: 'aws-secret',
        YC_TOKEN: 'yc-secret',
        ADMIN_SEED_PASSWORD: 'seed-secret',
        DATABASE_URL: 'database-url',
        JWT_SECRET: 'jwt-secret',
      }),
    ).toEqual({ PATH: '/tools', HOME: '/home/builder' })
  })

  test('accepts an administrator bootstrap pair but refuses a partial secret', () => {
    expect(
      seedVariables({
        ADMIN_SEED_EMAIL: ' owner@example.com ',
        ADMIN_SEED_PASSWORD: 'one-time-password',
      }),
    ).toEqual({
      admin_seed_email: 'owner@example.com',
      admin_seed_password: 'one-time-password',
    })
    expect(seedVariables({})).toBeNull()
    expect(() =>
      seedVariables({ ADMIN_SEED_EMAIL: 'owner@example.com' }),
    ).toThrow('must be supplied together')
  })
})

describe('Yandex static publishing', () => {
  test('keeps old immutable assets but deletes stale mutable routes', () => {
    const steps = staticUploadSteps({
      distDirectory: '/repo/webapp/dist',
      bucket: 'app.example.com',
      immutableDirectory: 'assets',
    })

    expect(steps).toHaveLength(2)
    expect(steps[0].args.join(' ')).toContain('--include assets/*')
    expect(steps[0].args.join(' ')).toContain('immutable')
    expect(steps[0].args).not.toContain('--delete')
    expect(steps[1].args.join(' ')).toContain('--exclude assets/*')
    expect(steps[1].args).toContain('--delete')
  })

  test('publishes and verifies the captured commit instead of accepting stale content', async () => {
    const commit = '0123456789abcdef0123456789abcdef01234567'
    const artifactRoot = mkdtempSync(resolve(tmpdir(), 'infra-static-marker-'))

    try {
      writeYandexStaticReleaseMarkers(artifactRoot, commit)
      expect(
        readFileSync(
          resolve(artifactRoot, 'webapp', '.well-known', 'release-revision'),
          'utf8',
        ),
      ).toBe(`${commit}\n`)
      expect(
        readFileSync(
          resolve(artifactRoot, 'website', '.well-known', 'release-revision'),
          'utf8',
        ),
      ).toBe(`${commit}\n`)
    } finally {
      rmSync(artifactRoot, { recursive: true, force: true })
    }

    const requestedUrls = []
    await verifyYandexStaticCommit(
      {
        webapp_url: 'https://app.example.com',
        website_url: 'https://www.example.com',
      },
      commit,
      {
        fetchImpl: async (url) => {
          requestedUrls.push(String(url))
          return new Response(`${commit}\n`, { status: 200 })
        },
        sleepImpl: async () => {},
      },
    )
    expect(requestedUrls).toEqual([
      `https://app.example.com/.well-known/release-revision?revision=${commit}`,
      `https://www.example.com/.well-known/release-revision?revision=${commit}`,
    ])

    await expect(
      verifyYandexStaticCommit(
        {
          webapp_url: 'https://app.example.com',
          website_url: 'https://www.example.com',
        },
        commit,
        {
          fetchImpl: async () => new Response('stale-commit\n', { status: 200 }),
          sleepImpl: async () => {},
        },
      ),
    ).rejects.toThrow(`expected ${commit}`)
  })

  test('the webapp fallback probe accepts the index shell for a missing path and rejects an access error', async () => {
    const commit = 'b'.repeat(40)
    const shell = '<!doctype html><html><body><div id="root"></div></body></html>'
    const requestedUrls = []

    for (const status of [200, 404, 403]) {
      await verifyYandexWebappFallback(
        { webapp_url: 'https://app.example.com' },
        commit,
        {
          fetchImpl: async (url) => {
            requestedUrls.push(String(url))
            return new Response(shell, { status })
          },
          sleepImpl: async () => {},
        },
      )
    }
    expect(requestedUrls).toEqual(
      Array(3).fill(
        `https://app.example.com/app/release-fallback-probe?revision=${commit}`,
      ),
    )

    let attempts = 0
    await expect(
      verifyYandexWebappFallback(
        { webapp_url: 'https://app.example.com' },
        commit,
        {
          fetchImpl: async () => {
            attempts += 1
            return new Response(
              '<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>',
              { status: 403 },
            )
          },
          sleepImpl: async () => {},
        },
      ),
    ).rejects.toThrow('HTTP 403 without the web app index shell')
    expect(attempts).toBe(12)

    await expect(
      verifyYandexWebappFallback(
        { webapp_url: 'https://app.example.com' },
        commit,
        {
          fetchImpl: async () => new Response('<html>not found</html>', { status: 404 }),
          sleepImpl: async () => {},
        },
      ),
    ).rejects.toThrow('HTTP 404 without the web app index shell')

    await expect(
      verifyYandexWebappFallback(
        { webapp_url: 'https://app.example.com' },
        commit,
        {
          fetchImpl: async () => new Response(shell, { status: 503 }),
          sleepImpl: async () => {},
        },
      ),
    ).rejects.toThrow('HTTP 503 with the web app index shell')
  })

  test('the post-apply static check runs once a release exists and requires both domains and the shell', async () => {
    const commit = 'c'.repeat(40)
    const shell = '<!doctype html><html><body><div id="root"></div></body></html>'
    const outputs = {
      webapp_url: 'https://app.example.com',
      website_url: 'https://www.example.com',
    }
    const ok = (body = '') => () => new Response(body, { status: 200 })
    const server = (handlers) => async (url) => {
      const { host, pathname } = new URL(url)
      const handler = handlers[`${host}${pathname}`]
      if (!handler) throw new Error(`unexpected request ${url}`)
      return handler(url)
    }
    const healthy = (probe) => ({
      'app.example.com/.well-known/release-revision': ok(`${commit}\n`),
      'app.example.com/': ok(shell),
      'www.example.com/.well-known/release-revision': ok(commit),
      'www.example.com/': ok('<html>website</html>'),
      'app.example.com/app/release-fallback-probe': probe,
    })

    const skipped = []
    for (const partial of [{}, { webapp_url: outputs.webapp_url }]) {
      await verifyYandexStaticReadsAfterApply(partial, {
        fetchImpl: async (url) => {
          throw new Error(`unexpected request ${url}`)
        },
        sleepImpl: async () => {},
        log: (line) => skipped.push(line),
      })
    }
    expect(skipped).toEqual(
      Array(2).fill(
        '[infra] yandex: no release has run yet; the first release verifies the static reads and the missing-path fallback.',
      ),
    )

    const requested = []
    await verifyYandexStaticReadsAfterApply(outputs, {
      fetchImpl: async (url) => {
        requested.push(new URL(url))
        return server(healthy(() => new Response(shell, { status: 404 })))(url)
      },
      sleepImpl: async () => {},
      log: () => {
        throw new Error('a released install must not be skipped')
      },
    })
    expect(requested.map((url) => `${url.host}${url.pathname}`)).toEqual([
      'app.example.com/.well-known/release-revision',
      'app.example.com/',
      'www.example.com/.well-known/release-revision',
      'www.example.com/',
      'app.example.com/app/release-fallback-probe',
    ])
    for (const url of requested.slice(0, 4)) {
      expect(url.searchParams.get('revision')).toStartWith('apply-')
    }
    expect(requested[4].searchParams.get('revision')).toBe(commit)

    const probeUrls = []
    await verifyYandexStaticReadsAfterApply(outputs, {
      fetchImpl: server({
        ...healthy((url) => {
          probeUrls.push(String(url))
          return new Response(shell, { status: 200 })
        }),
        'app.example.com/.well-known/release-revision': ok(''),
      }),
      sleepImpl: async () => {},
    })
    expect(probeUrls).toEqual([
      'https://app.example.com/app/release-fallback-probe?revision=apply',
    ])

    let websiteAttempts = 0
    let probed = 0
    await expect(
      verifyYandexStaticReadsAfterApply(outputs, {
        fetchImpl: server({
          ...healthy(() => {
            probed += 1
            return new Response(shell, { status: 200 })
          }),
          'www.example.com/': () => {
            websiteAttempts += 1
            return new Response(
              '<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>',
              { status: 403 },
            )
          },
        }),
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow(
      /^website index at https:\/\/www\.example\.com\/\?revision=apply-\d+ is not readable after the apply: HTTP 403\./,
    )
    expect(websiteAttempts).toBe(12)
    expect(probed).toBe(0)

    await expect(
      verifyYandexStaticReadsAfterApply(outputs, {
        fetchImpl: server(
          healthy(
            () =>
              new Response(
                '<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>',
                { status: 403 },
              ),
          ),
        ),
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow('HTTP 403 without the web app index shell')
  })
})

describe('managed root inputs', () => {
  test('cross-state secrets leave the working tree when the command ends', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'infra-managed-root-'))
    const foundationPath = resolve(root, 'foundation.auto.tfvars.json')
    const releasePath = resolve(root, 'release.auto.tfvars.json')

    try {
      writeDisposableRootInputs(
        root,
        { jwt_secret: 'test-jwt-secret-value', media_secret_access_key: 'test-media-key' },
        { runtime_image_digest: 'sha256:0000' },
      )

      expect(readFileSync(foundationPath, 'utf8')).toContain('test-jwt-secret-value')
      expect(readFileSync(releasePath, 'utf8')).toContain('sha256:0000')

      discardDisposableSecrets()

      expect(existsSync(foundationPath)).toBe(false)
      expect(existsSync(releasePath)).toBe(false)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  test('discarding twice is safe and forgets what it already removed', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'infra-managed-root-'))

    try {
      writeDisposableRootInputs(root, { jwt_secret: 'test-jwt-secret-value' }, {})
      discardDisposableSecrets()
      writeFileSync(resolve(root, 'foundation.auto.tfvars.json'), 'written by an operator')

      discardDisposableSecrets()

      expect(readFileSync(resolve(root, 'foundation.auto.tfvars.json'), 'utf8')).toBe(
        'written by an operator',
      )
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})

describe('Docker base images', () => {
  test('lists each external base image once and skips stage aliases and scratch', () => {
    const dockerfile = [
      'FROM oven/bun:1.4.2 AS build',
      'FROM oven/bun:1.4.2 AS runtime',
      'FROM --platform=linux/amd64 node:22-alpine AS tools',
      'FROM build AS again',
      'FROM scratch AS export',
    ].join('\n')

    expect(dockerfileBaseImages(dockerfile)).toEqual(['oven/bun:1.4.2', 'node:22-alpine'])
  })

  test('reads the real Dockerfiles', () => {
    for (const path of ['backend/Dockerfile', 'infra/yandex/static.Dockerfile']) {
      const images = dockerfileBaseImages(readFileSync(resolve(repoRoot, path), 'utf8'))
      expect(images).toEqual(['oven/bun:1.4.2'])
    }
  })
})
