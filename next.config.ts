import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

/**
 * Next.js configuration for self-hosted deployment.
 *
 * `standalone` output produces a minimal server bundle for the Docker runner
 * stage. Security headers are set here rather than in the reverse proxy so they
 * stay versioned with the application and survive a proxy reconfiguration.
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,

  // Self-hosted behind a reverse proxy: Server Action CSRF checks compare Origin
  // against this list, so it must name every public origin of the deployment.
  experimental: allowedOrigins.length > 0 ? { serverActions: { allowedOrigins } } : {},

  // No remote images and no user uploads in the MVP; skipping optimization drops
  // the sharp/libheif dependency chain entirely.
  images: { unoptimized: true },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // nginx buffers responses by default, which defeats streaming SSR.
        source: '/:path*',
        headers: [{ key: 'X-Accel-Buffering', value: 'no' }],
      },
    ]
  },
}

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts')

export default withNextIntl(nextConfig)
