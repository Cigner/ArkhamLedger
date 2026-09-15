import { build } from 'esbuild'

/**
 * Bundles the worker and the migrator into standalone files.
 *
 * Both used to run from source through tsx, which cannot work in the production
 * image: `output: standalone` ships a traced subset of node_modules, so tsx and
 * the application's own source are simply not there. Bundling produces one file
 * each that plain node can run, with no path aliases to resolve at runtime and
 * no compiler in the runtime image.
 *
 * Two deliberate exclusions:
 *
 *   - Packages that resolve their own files at run time stay external. mysql2
 *     builds the path to an authentication plugin from the server's reply, and
 *     pino starts its transport by spawning a worker thread from a path relative
 *     to its own directory — inside a bundle that directory does not exist, and
 *     the process dies on the first log line. Every external is already in the
 *     standalone output because the web tier imports it too.
 *   - the `react-server` condition is set so `server-only` resolves to its empty
 *     entry rather than to the module whose whole purpose is to throw.
 */
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  conditions: ['react-server', 'node', 'import'],
  external: ['mysql2', 'mysql2/promise', 'pino', 'pino-pretty', 'nodemailer'],
  logLevel: 'info',
  // Bundled ESM has no require(); a few dependencies still reach for it.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
}

await build({
  ...shared,
  entryPoints: ['src/worker/index.ts'],
  outfile: 'dist-worker/worker.js',
})

await build({
  ...shared,
  entryPoints: ['src/db/migrate.ts'],
  outfile: 'dist-worker/migrate.js',
})

// The production seed creates the first administrator, and it is the only way
// to do so: every other account is made in-app by somebody already signed in.
// It has to be bundled for the same reason the migrator is — the runtime image
// ships neither tsx nor the application sources, so `npm run db:seed` cannot
// run there. Without this the deployed stack has no route to its first login.
await build({
  ...shared,
  entryPoints: ['src/db/seed/index.ts'],
  outfile: 'dist-worker/seed.js',
})
