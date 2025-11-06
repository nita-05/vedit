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
      // Ensure ffmpeg-static is not externalized - we need it in the bundle
      // Next.js by default externalizes node_modules, but we need ffmpeg-static
      const originalExternals = config.externals
      config.externals = [
        // Keep original externals but filter out ffmpeg-static
        ...(Array.isArray(originalExternals) 
          ? originalExternals.filter((ext) => {
              if (typeof ext === 'string') {
                return !ext.includes('ffmpeg-static')
              }
              return true
            })
          : originalExternals || []
        ),
        // Explicitly internalize ffmpeg-static
        ({ request }, callback) => {
          if (request && request.includes('ffmpeg-static')) {
            // Don't externalize - bundle it
            return callback()
          }
          // For other packages, use default externalization
          if (typeof originalExternals === 'function') {
            return originalExternals({ request }, callback)
          }
          callback()
        },
      ]
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
