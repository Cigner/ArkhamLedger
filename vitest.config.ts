import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * Test configuration.
 *
 * Two projects with different needs. `unit` covers pure domain logic and React
 * components and must stay fast enough to run on every save. `integration`
 * starts a real MySQL container per run, so it gets long timeouts and forked
 * workers — container handles do not survive worker threads.
 *
 * Inline projects inherit this file's plugins and aliases, so neither is repeated.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup/unit.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      {
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            /*
             * `server-only` throws outside a bundler that understands the
             * react-server condition. Aliased to its own empty entry here, and
             * deliberately NOT in the unit project: a unit test that reaches into
             * a server-only module should still fail loudly.
             */
            'server-only': fileURLToPath(
              new URL('./node_modules/server-only/empty.js', import.meta.url),
            ),
          },
        },
        test: {
          name: 'integration',
          environment: 'node',
          globals: true,
          include: ['tests/integration/**/*.{test,spec}.ts'],
          setupFiles: ['./tests/setup/integration.ts'],
          globalSetup: ['./tests/integration/global-setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          pool: 'forks',
          fileParallelism: false,
        },
      },
    ],
  },
})
