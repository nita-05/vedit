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
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      // Ensure ffmpeg-static is not externalized - we need it in the bundle
      // Vercel serverless functions need the binary accessible
      const originalExternals = config.externals
      
      // Create a function to handle externals
      config.externals = [
        // Keep original externals but filter out ffmpeg-static
        ...(Array.isArray(originalExternals) 
          ? originalExternals.filter((ext) => {
              if (typeof ext === 'string') {
                return !ext.includes('ffmpeg-static') && !ext.includes('@ffmpeg-installer')
              }
              return true
            })
          : []
        ),
        // Explicitly internalize ffmpeg packages
        ({ request }, callback) => {
          if (request && (
            request.includes('ffmpeg-static') || 
            request.includes('@ffmpeg-installer')
          )) {
            // Don't externalize - include in bundle
            return callback()
          }
          // For other packages, use default externalization
          if (typeof originalExternals === 'function') {
            return originalExternals({ request }, callback)
          }
          callback()
        },
      ]
      
      // Ensure binary files are treated as assets (not externalized)
      config.module = config.module || {}
      config.module.rules = config.module.rules || []
      
      // Add rule to handle binary files - copy them as assets
      config.plugins = config.plugins || []
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
