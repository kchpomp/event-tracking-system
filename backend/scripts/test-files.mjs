import { Glob } from 'bun'

/**
 * Splits the backend test files between the three runners, by filename.
 *
 * A test that needs the database is named `*.integration.test.ts`; a test that needs a service no
 * runner starts for it - the local S3 container, or an email provider - is named
 * `*.live.test.ts`; everything else runs with nothing installed. That third category keeps the
 * unit runner useful without Docker or provider credentials. The root `bun run test` still needs
 * Docker because it intentionally includes the integration runner.
 */
export function backendTestFiles(backendRoot) {
  const all = [...new Glob('{src,scripts}/**/*.test.{ts,mjs}').scanSync(backendRoot)].sort()

  return {
    all,
    unit: all.filter(
      (file) => !file.includes('.integration.test.') && !file.includes('.live.test.'),
    ),
    integration: all.filter((file) => file.includes('.integration.test.')),
    live: all.filter((file) => file.includes('.live.test.')),
  }
}
