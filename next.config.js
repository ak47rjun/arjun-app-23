/**
 * Frame-embedding policy.
 *
 * The default is strict: `X-Frame-Options: SAMEORIGIN` with no `frame-ancestors`,
 * so no third-party site can embed ARJUN (clickjacking protection).
 *
 * Some legitimate deployments do need framing — a preview proxy, a docs site,
 * or a partner portal. Set FRAME_ANCESTORS to a space-separated list of
 * permitted ancestors (e.g. "https://app.example.com https://*.e2b.app"), or
 * "*" to allow any. When set, the strict X-Frame-Options header is dropped and
 * CSP frame-ancestors governs instead (frame-ancestors is what modern browsers
 * honour, and it is the only directive that can express multiple origins).
 */
const frameAncestors = (process.env.FRAME_ANCESTORS ?? '').trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Only sent when framing is NOT explicitly configured — see FRAME_ANCESTORS above.
          ...(frameAncestors ? [] : [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }]),
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://*.tradingview.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' ws: wss: https://*.tradingview.com https://*.livekit.cloud",
              "frame-src 'self' https://*.tradingview.com https://meet.google.com",
              "media-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              ...(frameAncestors ? [`frame-ancestors ${frameAncestors}`] : []),
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
