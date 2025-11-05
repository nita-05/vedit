/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['res.cloudinary.com', 'lh3.googleusercontent.com'],
  },
  // Increase body size limit for file uploads (500MB = 524288000 bytes)
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  async headers() {
    return [
      {
        source: '/videos/:path*',
        headers: [
          {
            key: 'Accept-Ranges',
            value: 'bytes',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
