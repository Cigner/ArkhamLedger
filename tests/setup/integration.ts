/**
 * Integration test bootstrap.
 *
 * Sets the minimum environment the application modules validate at import time.
 * The database URL is replaced per suite by the MySQL testcontainer helper.
 */
const environment = process.env as Record<string, string | undefined>

environment['NODE_ENV'] = 'test'
environment['TZ'] = 'UTC'
environment['BETTER_AUTH_SECRET'] ??= 'test-secret-that-is-at-least-32-chars-long'
environment['BETTER_AUTH_URL'] ??= 'http://localhost:3000'
environment['ENCRYPTION_KEY'] ??= 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcy1sb25nISE='
environment['DATABASE_URL'] ??= 'mysql://root:test@127.0.0.1:3306/test'
environment['LOG_LEVEL'] ??= 'silent'
