# ADR-0003: Better Auth, with authorization in the data layer

**Status:** Accepted · 2026-09-13

## Context

Two questions, often confused: who is this, and what may they do.

For the first, the landscape moved. Auth.js merged into Better Auth in September
2025 and NextAuth is maintenance-only; Lucia was deprecated in March 2025 and now
exists as reference material.

For the second, CVE-2025-29927 (CVSS 9.1) let a forged `x-middleware-subrequest`
header skip Next.js middleware entirely — and with it every authorization check
that lived there.

## Decision

Better Auth for identity, sessions and global roles, wrapped behind
`src/lib/auth/` so nothing else imports the library.

Authorization lives in `modules/*/data/`. Every protected query calls a guard
immediately before running. `proxy.ts` checks only that a session cookie exists
and redirects — it makes no authorization decision at all.

## Alternatives

**Authorization in middleware.** Fast, central, and exactly what the CVE
defeated. Even patched, it is a single point whose bypass is total.

**Authorization in Server Actions only.** Better, but a page's loader is not an
action, and every new query would have to remember.

## Consequences

- The guard runs on every call, including ones reached through a page that
  already checked. That duplication is the point.
- A non-member gets 404 rather than 403, so campaign existence is not
  discoverable by enumerating ids.
- The authorization test is a matrix of role × action × resource rather than a
  narrative.
- Wrapping the library costs one thin file and means a breaking upgrade touches
  one directory.
- A consequence found later: because guards live beside queries, the background
  worker would have pulled the whole authentication stack into its bundle. Three
  modules now separate guarded reads from plain persistence — see
  [ADR-0012](0012-bundled-worker-and-split-data-layer.md).
