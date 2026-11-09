/** @type {import('next').NextConfig} */
const adminOrigins = [
  'https://app.luminix.beauty',
  'https://admin-xi-snowy.vercel.app',
  ...(process.env.NEXT_PUBLIC_ADMIN_URL ? [new URL(process.env.NEXT_PUBLIC_ADMIN_URL).origin] : []),
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : []),
]

const nextConfig = {
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
