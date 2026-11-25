/** @type {import('next').NextConfig} */
const adminOrigins = [
  'https://app.luminix.beauty',
  'https://admin-xi-snowy.vercel.app',
  ...(process.env.NEXT_PUBLIC_ADMIN_URL ? [new URL(process.env.NEXT_PUBLIC_ADMIN_URL).origin] : []),
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : []),
]

const nextConfig = {
  // Shared TypeScript sources (packages/contracts) are compiled by each app.
  transpilePackages: ['@luminix/contracts'],
  // Dev only: 127.0.0.1 opens the site with its own storage, signed out, beside a localhost session.
  allowedDevOrigins: ['127.0.0.1'],
  // Google/Apple sign-in served from our own domain (see lib/client-app/firebase.ts, authDomain).
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://luminix-316aa.firebaseapp.com/__/auth/:path*',
      },
      {
        source: '/__/firebase/:path*',
        destination: 'https://luminix-316aa.firebaseapp.com/__/firebase/:path*',
      },
    ]
  },
  async headers() {
    return [
      {
        // The editor preview may only be framed by the admin.
        source: '/c/previa',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors 'self' ${[...new Set(adminOrigins)].join(' ')}`,
          },
        ],
      },
    ]
  },
}

export default nextConfig
