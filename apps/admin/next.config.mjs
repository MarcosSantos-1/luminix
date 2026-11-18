/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shared TypeScript sources (packages/contracts) are compiled by each app.
  transpilePackages: ['@luminix/contracts'],
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/clinics', destination: '/c', permanent: false },
      { source: '/clinics/:path*', destination: '/c/:path*', permanent: false },
    ]
  },
}

export default nextConfig
