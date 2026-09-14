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
// Decodes to exactly 32 bytes, which is what AES-256 needs.
environment['ENCRYPTION_KEY'] ??= 'YXJraGFtLXRlc3QtZW5jcnlwdGlvbi1rZXktMzJieXQ='
environment['DATABASE_URL'] ??= 'mysql://root:test@127.0.0.1:3306/test'
environment['LOG_LEVEL'] ??= 'silent'
