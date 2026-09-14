import next from 'eslint-config-next'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'

/**
 * ESLint configuration.
 *
 * Beyond the usual correctness rules, this config is the enforcement mechanism
 * for the architectural boundaries described in docs/architecture/modules.md.
 * Boundary violations are errors, not warnings: a rule that only warns stops
 * being followed within weeks.
 *
 * The three invariants enforced here:
 *   1. `domain/` is pure — no I/O, no framework, no ambient clock or randomness.
 *   2. A module never reaches into another module's `data/` or `actions/`.
 *   3. Nothing outside `lib/auth` imports the auth library directly.
 */

const DOMAIN_PURITY_MESSAGE =
  'domain/ must stay pure: no framework, no I/O, no database. Move this to data/ or actions/.'

const LAYERING_MESSAGE =
  'This import crosses a layer boundary. See docs/architecture/modules.md.'

const AUTH_WRAPPER_MESSAGE = 'Import from @/lib/auth instead of the auth library directly.'

/**
 * `no-restricted-imports` replaces rather than merges across flat-config blocks,
 * so every block that needs it composes the full pattern list it wants to apply.
 */
const authWrapperPatterns = [
  { group: ['better-auth', 'better-auth/*'], message: AUTH_WRAPPER_MESSAGE },
]

const domainPurityPatterns = [
  { group: ['react', 'react-dom', 'next', 'next/*'], message: DOMAIN_PURITY_MESSAGE },
  { group: ['drizzle-orm', 'drizzle-orm/*', 'mysql2', 'mysql2/*'], message: DOMAIN_PURITY_MESSAGE },
  { group: ['better-auth', 'better-auth/*'], message: DOMAIN_PURITY_MESSAGE },
  { group: ['server-only', 'node:*', 'fs', 'path'], message: DOMAIN_PURITY_MESSAGE },
  { group: ['@/db', '@/db/*', '@/lib/auth', '@/lib/auth/*'], message: DOMAIN_PURITY_MESSAGE },
  { group: ['@/modules/*/data', '@/modules/*/data/*'], message: DOMAIN_PURITY_MESSAGE },
  { group: ['@/modules/*/actions', '@/modules/*/actions/*'], message: DOMAIN_PURITY_MESSAGE },
  { group: ['@/modules/*/ui', '@/modules/*/ui/*'], message: DOMAIN_PURITY_MESSAGE },
]

const dataLayerPatterns = [
  ...authWrapperPatterns,
  { group: ['@/modules/*/actions', '@/modules/*/actions/*'], message: LAYERING_MESSAGE },
  { group: ['@/modules/*/ui', '@/modules/*/ui/*'], message: LAYERING_MESSAGE },
  { group: ['react', 'react-dom'], message: LAYERING_MESSAGE },
]

const dbLayerPatterns = [
  ...authWrapperPatterns,
  { group: ['@/modules', '@/modules/*'], message: LAYERING_MESSAGE },
]

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist-worker/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/db/migrations/**',
      'next-env.d.ts',
    ],
  },

  ...next,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Config files and build scripts live outside the tsconfig include globs.
          allowDefaultProject: ['*.mjs', '*.js', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: './tsconfig.json' }),
      ],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Structured logging only — see src/lib/logger.ts.
      'no-console': 'error',

      // XSS: there is no legitimate use of raw HTML injection in this app.
      'react/no-danger': 'error',

      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-warning-comments': [
        'warn',
        { terms: ['fixme', 'xxx'], location: 'anywhere' },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Architectural boundaries
  //
  // Two mechanisms on purpose. `no-restricted-paths` understands resolved files
  // and catches relative imports; `no-restricted-imports` works on the specifier
  // text and therefore also fires on a module that does not exist yet.
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: import.meta.dirname,
          zones: [
            { target: './src/modules/*/domain', from: './src/modules/*/data', message: DOMAIN_PURITY_MESSAGE },
            { target: './src/modules/*/domain', from: './src/modules/*/actions', message: DOMAIN_PURITY_MESSAGE },
            { target: './src/modules/*/domain', from: './src/modules/*/ui', message: DOMAIN_PURITY_MESSAGE },
            { target: './src/modules/*/domain', from: './src/db', message: DOMAIN_PURITY_MESSAGE },
            { target: './src/modules/*/domain', from: './src/lib/auth', message: DOMAIN_PURITY_MESSAGE },
            { target: './src/modules/*/data', from: './src/modules/*/actions', message: LAYERING_MESSAGE },
            { target: './src/modules/*/data', from: './src/modules/*/ui', message: LAYERING_MESSAGE },
            { target: './src/db', from: './src/modules', message: LAYERING_MESSAGE },
          ],
        },
      ],
    },
  },

  // The auth library is wrapped by lib/auth so a breaking upgrade touches one place.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/auth/**', 'src/app/api/auth/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: authWrapperPatterns }],
    },
  },

  // `domain/` purity: no framework, no I/O, no ambient clock, no ambient randomness.
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: domainPurityPatterns }],
      'no-restricted-syntax': [
        'error',
        {
          /*
           * Only the zero-argument form reads the clock. `new Date(instant)` and
           * `new Date(millis)` are parsing and arithmetic over a value the caller
           * supplied, which is exactly what a pure module is supposed to do —
           * banning those forced the opposite of the rule's intent.
           */
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'domain/ must not read the ambient clock. Accept the current time as a parameter.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'domain/ must not read the ambient clock. Accept the current time as a parameter.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'domain/ must be deterministic. Inject a random source instead.',
        },
      ],
    },
  },

  // `data/` sits below actions and presentation and must not import upwards.
  {
    files: ['src/modules/*/data/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: dataLayerPatterns }],
    },
  },

  // The database layer knows nothing about domain modules.
  {
    files: ['src/db/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: dbLayerPatterns }],
    },
  },

  // Tests may reach anywhere and may use the real clock.
  {
    files: ['tests/**/*.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts'],
    rules: {
      'import-x/no-restricted-paths': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Scripts and the worker entrypoint run outside Next and may log to stdout.
  {
    files: ['scripts/**/*.ts', 'src/db/seed/**/*.ts', 'src/db/migrate.ts'],
    rules: { 'no-console': 'off' },
  },

  // Build-time config files: Next's own types require async signatures here, and
  // the flat-config files themselves are not part of the typed program.
  {
    files: ['*.config.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['*.mjs', '*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { 'no-console': 'off' },
  },
)
