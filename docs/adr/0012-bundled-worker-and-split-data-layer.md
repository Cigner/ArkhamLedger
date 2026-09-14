# ADR-0012: The worker is bundled, and its data layer is split from the guarded one

**Status:** Accepted · 2026-09-14

## Context

The worker was configured to run from source through `tsx` inside the production
image. It could never have started: `output: standalone` ships a traced subset
of `node_modules`, so `tsx` was a dangling symlink and the application's own
`src/lib` and `src/modules` were not copied at all. The container would have
died on its first import.

Bundling exposed a second problem. The worker calls `transitionSession`, which
lived in a module that also exports `getSessionDetail`, which calls a guard,
which imports Better Auth and `next/headers`. Bundling the worker therefore
pulled in the entire authentication stack and Next itself: 3.6 MB, with
module-level side effects, in a process that has nobody to authenticate.

## Decision

- Bundle `src/worker/index.ts` and `src/db/migrate.ts` with esbuild into single
  files that plain `node` runs. `mysql2`, `pino` and `nodemailer` stay external
  because they resolve their own files at run time; `serverExternalPackages` in
  `next.config.ts` puts them in the standalone output where the bundle finds
  them.
- Split three modules so the functions the worker calls carry no guards:
  `sessions/data/session-store.ts`, `scheduling/data/runs.ts` and
  `notifications/data/notifications.ts` are plain persistence;
  `sessions/data/sessions.ts`, `scheduling/data/view.ts` and
  `notifications/data/inbox.ts` authorize.

## Alternatives

**Ship `tsx` and the full `node_modules` in the runtime image.** Larger image, a
compiler in production, and no reason beyond avoiding a build step.

**Leave the auth stack in the worker bundle.** It would work today. It also
means any future top-level side effect in that stack — a version check, a
warning, a connection — runs in the worker.

**Compile with `tsc` to a directory.** Path aliases would need resolving at run
time, which is another dependency doing what a bundler already does.

## Consequences

- The worker bundle is 1.2 MB and contains no Better Auth and no Next.
- A production container can actually run the worker. That was never true before.
- The split makes an existing principle explicit: a function that authorizes and
  a function that persists are different things, and only one of them belongs in
  a process with no session.
- One more build step, wired into the image and into
  [deployment](../operations/deployment.md).
