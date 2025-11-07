const express = require('express')
const cors = require('cors')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')
const { v2: cloudinary } = require('cloudinary')
const VideoProcessor = require('./videoProcessor')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
// CORS: Allow requests from Vercel deployment and localhost
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'https://vedit-theta.vercel.app',
  'http://localhost:3000',
  'https://*.vercel.app' // Allow all Vercel preview deployments
]
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true)
    
    // Check if origin matches allowed patterns
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*')
        return new RegExp(pattern).test(origin)
      }
      return origin === allowed
    })
    
    if (isAllowed) {
      callback(null, true)
    } else {
      console.log(`⚠️ CORS blocked origin: ${origin}`)
      callback(null, true) // Still allow for now, but log it
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Initialize FFmpeg path
function initializeFFmpeg() {
  console.log('🔍 Initializing FFmpeg...')
  console.log(`📁 Platform: ${process.platform}`)
  console.log(`📁 CWD: ${process.cwd()}`)
  
  let ffmpegPath = null
  
  // Try ffmpeg-static first
  try {
    const ffmpegStatic = require('ffmpeg-static')
    const staticPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic?.path || ffmpegStatic?.default)
    if (staticPath && fs.existsSync(staticPath)) {
      ffmpegPath = staticPath
      console.log(`✅ Found ffmpeg-static: ${ffmpegPath}`)
    }
  } catch (error) {
    console.log(`ℹ️ ffmpeg-static not found: ${error.message}`)
  }
  
  // Try @ffmpeg-installer/ffmpeg
  if (!ffmpegPath) {
    try {
      const installer = require('@ffmpeg-installer/ffmpeg')
      if (installer && installer.path && fs.existsSync(installer.path)) {
        ffmpegPath = installer.path
        console.log(`✅ Found @ffmpeg-installer: ${ffmpegPath}`)
      }
    } catch (error) {
      console.log(`ℹ️ @ffmpeg-installer not found: ${error.message}`)
    }
  }
  
  // Try system FFmpeg
  if (!ffmpegPath) {
    try {
      execSync('ffmpeg -version', { stdio: 'pipe', timeout: 2000 })
      ffmpegPath = 'ffmpeg' // Use system FFmpeg
      console.log(`✅ Found system FFmpeg`)
    } catch (error) {
      console.log(`ℹ️ System FFmpeg not found`)
    }
  }
  
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath)
    console.log(`✅ FFmpeg initialized: ${ffmpegPath}`)
    
    // Verify it works
    try {
      const version = execSync(`"${ffmpegPath}" -version`, { stdio: 'pipe', timeout: 3000, encoding: 'utf8' })
      console.log(`✅ FFmpeg version: ${version.split('\n')[0]}`)
    } catch (error) {
      console.error(`❌ FFmpeg verification failed: ${error.message}`)
    }
  } else {
    console.error(`❌ FFmpeg not found! Please install FFmpeg on Render.`)
  }
  
  return ffmpegPath
}

// Initialize on startup
const ffmpegPath = initializeFFmpeg()

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ffmpeg: ffmpegPath ? 'available' : 'not found',
    timestamp: new Date().toISOString()
  })
})

// Process video with FFmpeg
app.post('/process', async (req, res) => {
  try {
    if (!ffmpegPath) {
      return res.status(500).json({
        error: 'FFmpeg not available',
        message: 'FFmpeg binary not found on server'
      })
    }
    
    const { videoUrl, instruction, publicId, subtitleData } = req.body
    
    if (!videoUrl || !instruction) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'videoUrl and instruction are required'
      })
    }
    
    console.log(`🎬 Processing video: ${publicId || 'unknown'}`)
    console.log(`📋 Operation: ${instruction.operation}`)
    
    const tempDir = os.tmpdir()
    const timestamp = Date.now()
    const inputPath = path.join(tempDir, `input_${timestamp}.mp4`)
    const outputPath = path.join(tempDir, `output_${timestamp}.mp4`)
    let subtitlePath = null
    
    try {
      // Download video
      console.log(`📥 Downloading video from: ${videoUrl}`)
      const videoResponse = await fetch(videoUrl)
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`)
      }
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
      fs.writeFileSync(inputPath, videoBuffer)
      console.log(`✅ Downloaded video: ${inputPath} (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`)
      
      // Handle subtitle file if needed (for captions)
      // Note: For addCaptions, we might need to generate subtitles first
      // For now, if subtitleData is provided, use it; otherwise Render will handle generation
      if ((instruction.operation === 'addCaptions' || instruction.operation === 'customSubtitle') && subtitleData) {
        subtitlePath = path.join(tempDir, `subtitles_${timestamp}.ass`)
        fs.writeFileSync(subtitlePath, subtitleData, 'utf8')
        instruction.params.subtitlePath = subtitlePath
        console.log(`✅ Created subtitle file from provided data: ${subtitlePath}`)
      } else if (instruction.operation === 'addCaptions') {
        // TODO: Generate subtitles using Whisper API on Render
        // For now, this requires subtitle data to be generated on Vercel first
        console.log(`⚠️ Subtitle generation on Render not yet implemented - requires subtitleData`)
        throw new Error('Subtitle file required for addCaptions operation. Please generate subtitles first.')
      }
      
      // Process with FFmpeg
      const processedUrl = await processVideo(inputPath, outputPath, instruction, publicId)
      
      res.json({
        success: true,
        videoUrl: processedUrl,
        message: 'Video processed successfully',
        operation: instruction.operation
      })
    } catch (error) {
      console.error('❌ Processing error:', error)
      res.status(500).json({
        error: 'Processing failed',
        message: error.message,
        operation: instruction.operation,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        if (subtitlePath && fs.existsSync(subtitlePath)) fs.unlinkSync(subtitlePath)
        console.log('🧹 Cleanup complete')
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup warning:', cleanupError.message)
      }
    }
    
  } catch (error) {
    console.error('❌ Processing error:', error)
    res.status(500).json({
      error: 'Processing failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Process video function using VideoProcessor
async function processVideo(inputPath, outputPath, instruction, publicId) {
  const processor = new VideoProcessor(ffmpegPath)
  
  // Check if it's an image by file extension
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(inputPath)
  
  // Handle music mixing if musicUrl is provided
  let musicPath = null
  if (instruction.operation === 'addMusic' && instruction.params?._musicUrl) {
    try {
      const musicUrl = instruction.params._musicUrl
      console.log(`📥 Downloading music from: ${musicUrl}`)
      const musicResponse = await fetch(musicUrl)
      if (!musicResponse.ok) {
        throw new Error(`Failed to download music: ${musicResponse.statusText}`)
      }
      
      const musicBuffer = Buffer.from(await musicResponse.arrayBuffer())
      musicPath = path.join(os.tmpdir(), `music_${Date.now()}.mp3`)
      fs.writeFileSync(musicPath, musicBuffer)
      console.log(`✅ Downloaded music: ${musicPath} (${(musicBuffer.length / 1024 / 1024).toFixed(2)} MB)`)
      
      // Pass music path to processor
      instruction.params._musicPath = musicPath
    } catch (musicError) {
      console.error(`❌ Failed to download music: ${musicError.message}`)
      console.log(`⚠️ Continuing without music mixing, will enhance existing audio instead`)
      // Remove music URL so processor doesn't try to use it
      delete instruction.params._musicUrl
    }
  }
  
  try {
    // Process with VideoProcessor
    await processor.process(inputPath, outputPath, instruction, isImage)
  } finally {
    // Cleanup music file
    if (musicPath && fs.existsSync(musicPath)) {
      try {
        fs.unlinkSync(musicPath)
        console.log(`🧹 Cleaned up music file: ${musicPath}`)
      } catch (cleanupError) {
        console.warn(`⚠️ Failed to cleanup music file: ${cleanupError.message}`)
      }
    }
  }
  
  // Upload to Cloudinary
  const result = await cloudinary.uploader.upload(outputPath, {
    resource_type: isImage ? 'image' : 'video',
    folder: 'vedit/processed',
    public_id: publicId ? `${publicId}_processed` : undefined,
    overwrite: true,
  })
  
  console.log(`☁️ Uploaded to Cloudinary: ${result.secure_url}`)
  return result.secure_url
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Render API server running on port ${PORT}`)
  console.log(`📡 FFmpeg status: ${ffmpegPath ? '✅ Available' : '❌ Not found'}`)
})

