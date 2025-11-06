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
      // Don't externalize ffmpeg-static - we need the binary in the bundle
      config.externals = config.externals || []
      
      // Ensure binary files are included (not externalized)
      config.externals = config.externals.filter((external: any) => {
        if (typeof external === 'function') {
          // Can't filter functions easily, but they should handle it
          return true
        }
        // Don't externalize ffmpeg-static
        return !external.includes('ffmpeg-static')
      })
      
      // Add alias to help resolve ffmpeg-static
      config.resolve = config.resolve || {}
      config.resolve.alias = config.resolve.alias || {}
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
