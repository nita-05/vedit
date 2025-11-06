// Script to ensure FFmpeg binary is accessible for Vercel builds
const fs = require('fs')
const path = require('path')

console.log('🔍 Checking FFmpeg binary availability...')

try {
  const ffmpegStatic = require('ffmpeg-static')
  const binaryPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic?.path || ffmpegStatic?.default)
  
  if (binaryPath && fs.existsSync(binaryPath)) {
    const stats = fs.statSync(binaryPath)
    console.log(`✅ FFmpeg binary found: ${binaryPath}`)
    console.log(`📦 Binary size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
    console.log(`📁 File exists and is accessible`)
    
    // On Vercel, ensure binary path is logged for debugging
    if (process.env.VERCEL) {
      console.log(`🌐 Vercel environment detected - binary will be copied to /tmp at runtime`)
    }
  } else {
    console.warn(`⚠️ FFmpeg binary path returned but file doesn't exist: ${binaryPath}`)
    
    // Try to find it in node_modules
    try {
      const modulePath = require.resolve('ffmpeg-static')
      const moduleDir = path.dirname(modulePath)
      console.log(`📦 Module resolved at: ${moduleDir}`)
      
      const possiblePaths = [
        path.join(moduleDir, 'ffmpeg'),
        path.join(moduleDir, 'vendor', 'ffmpeg'),
        path.join(moduleDir, 'bin', 'ffmpeg'),
      ]
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          console.log(`✅ Found binary at: ${possiblePath}`)
          break
        }
      }
    } catch (err) {
      console.error(`❌ Could not resolve ffmpeg-static module: ${err.message}`)
    }
  }
} catch (error) {
  console.error(`❌ Error checking FFmpeg: ${error.message}`)
  process.exit(1)
}

