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
RUN npx tsx --version >/dev/null 2>&1 || true

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

# Migrations and the worker run from source through tsx.
COPY --from=builder --chown=nextjs:nodejs /app/src/db ./src/db
COPY --from=builder --chown=nextjs:nodejs /app/src/worker ./src/worker
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/tsx ./node_modules/.bin/tsx

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini forwards SIGTERM so in-flight requests drain instead of being severed.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
