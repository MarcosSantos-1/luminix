/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shared TypeScript sources (packages/contracts) are compiled by each app.
  transpilePackages: ['@luminix/contracts'],
  images: {
    unoptimized: true,
  },
  // Google/Apple sign-in served from our own domain (see lib/firebase.ts, authDomain).
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
  async redirects() {
    return [
      { source: '/clinics', destination: '/c', permanent: false },
      { source: '/clinics/:path*', destination: '/c/:path*', permanent: false },
    ]
  },
}

export default nextConfig
