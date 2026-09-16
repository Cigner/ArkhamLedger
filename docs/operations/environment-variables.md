# Environment variables

Parsed once at startup by `src/lib/env.ts`. A misconfigured deployment fails
immediately rather than at the first request that happens to need the missing
value.

`NEXT_PUBLIC_*` values are inlined at build time and cannot come from this file.
Nothing here is public.

## Required

| Variable             | Format                                           | If it is wrong                                  |
| -------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `DATABASE_URL`       | `mysql://user:pass@host:3306/db?charset=utf8mb4` | Nothing starts                                  |
| `BETTER_AUTH_SECRET` | ≥32 random bytes                                 | Nothing starts. Rotating it signs everybody out |
| `BETTER_AUTH_URL`    | the public origin, e.g. `https://arkham.example` | Links in emails point at the wrong host         |
| `ENCRYPTION_KEY`     | base64 decoding to **exactly 32 bytes**          | Nothing starts                                  |

Generate the two secrets with:

```bash
openssl rand -base64 32
```

`ENCRYPTION_KEY` is validated by decoding, not by length. A 44-character string
that is not a 32-byte key passes a length check and then fails at the first
webhook save — in production, months later. That was a real bug.

Rotating `ENCRYPTION_KEY` makes every stored Discord webhook unreadable. They
are reported as absent and logged; the remedy is to paste them again.

## Database container

| Variable                        | Note                       |
| ------------------------------- | -------------------------- |
| `MYSQL_ROOT_PASSWORD`           | Used by backup and restore |
| `MYSQL_DATABASE`                | Defaults to `arkham`       |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Must match `DATABASE_URL`  |

## Optional

| Variable                              | Default         | Note                                                                                                                                                          |
| ------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_ORIGINS`                     | empty           | Comma-separated; feeds `serverActions.allowedOrigins`. **Required in production** — without it, either every action is refused or the CSRF check is worthless |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | unset           | Without all three, mail goes to the log in development and the **worker refuses to start in production**                                                      |
| `SMTP_USER`, `SMTP_PASSWORD`          | unset           | Omit for an unauthenticated relay                                                                                                                             |
| `SMTP_SECURE`                         | `false`         | `true` for implicit TLS                                                                                                                                       |
| `SMTP_REQUIRE_TLS`                    | `false`         | Require STARTTLS when using port 587; sending fails if the relay cannot upgrade                                                                               |
| `SMTP_TLS_REJECT_UNAUTHORIZED`        | `true`          | Set `false` only for a trusted private relay with a self-signed certificate                                                                                   |
| `SMTP_TLS_SERVERNAME`                 | unset           | Certificate name to validate when `SMTP_HOST` is an IP address                                                                                                |
| `LOG_LEVEL`                           | `info`          | `fatal`…`trace`, or `silent` for tests                                                                                                                        |
| `DEFAULT_TIMEZONE`                    | `Europe/Warsaw` | For new accounts and campaigns                                                                                                                                |
| `NODE_ENV`                            | `development`   | `production` tightens CSP and refuses the logging mail transport                                                                                              |
| `TZ`                                  | —               | Set to `UTC` in every container                                                                                                                               |

## Handling

`.env` lives outside version control, `chmod 600`. `.env.example` is committed
with every key and no value.

Nothing in this file is ever logged. Tokens appear in logs as an eight-character
prefix at most; secrets do not appear at all.
