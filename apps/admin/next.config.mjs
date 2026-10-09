/** @type {import('next').NextConfig} */
const nextConfig = {
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
