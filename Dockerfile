# syntax=docker/dockerfile:1

# =============================================================================
# Build image for both the web service and the background worker.
#
# The two services differ only in entrypoint, so they share one image: a single
# build path and no possibility of version drift between them.
# =============================================================================

# --- deps: dependency layer, cached on the lockfile alone --------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: compile the Next application and the worker bundle -------------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Server-side env vars are read at runtime, but NEXT_PUBLIC_* values are inlined
# here, so any build-time public value must be passed as a build arg.
RUN npm run build
# The worker and the migrator are bundled to single files. They cannot run from
# source in the runtime image: `output: standalone` ships a traced subset of
# node_modules, so neither tsx nor the application's own sources are there.
RUN npm run build:worker

# --- runner: minimal runtime -------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=UTC
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache tini \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# `output: standalone` excludes static assets and the public directory; they
# have to be copied explicitly or every asset 404s at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# The worker and the migrator, each a single file plain node can run. Their few
# external dependencies — mysql2, pino, nodemailer — resolve from the standalone
# node_modules copied above, which carries them because the web tier uses them too.
COPY --from=builder --chown=nextjs:nodejs /app/dist-worker ./dist-worker

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini forwards SIGTERM so in-flight requests drain instead of being severed.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
