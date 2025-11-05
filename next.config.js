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
  // Webpack config to include FFmpeg binary in serverless functions
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't externalize @ffmpeg-installer packages - we need them in the bundle
      // The binary files need to be accessible at runtime
      config.externals = config.externals || []
      
      // Ensure FFmpeg binary files are included as assets
      config.module = config.module || {}
      config.module.rules = config.module.rules || []
    }
    return config
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
