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
      // Copy FFmpeg binary to the output
      config.externals = config.externals || []
      // Don't externalize @ffmpeg-installer/ffmpeg - include it in the bundle
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
