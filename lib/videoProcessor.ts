import ffmpeg from 'fluent-ffmpeg'
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { promisify } from 'util'
import { execSync } from 'child_process'

// Function to get FFmpeg installer path (lazy load to avoid module load issues)
function getFFmpegInstallerPath(): string | null {
  console.log('🔍 Starting FFmpeg binary search...')
  console.log(`📁 process.cwd(): ${process.cwd()}`)
  console.log(`📁 Platform: ${process.platform}`)
  console.log(`📁 VERCEL env: ${process.env.VERCEL}`)
  
  // PRIORITY 1: Try ffmpeg-static (best for Vercel/serverless environments)
  try {
    const ffmpegStatic = require('ffmpeg-static')
    console.log(`📦 ffmpeg-static package loaded:`, {
      hasPath: !!ffmpegStatic,
      path: ffmpegStatic,
      type: typeof ffmpegStatic,
    })
    if (ffmpegStatic) {
      // ffmpeg-static returns the path directly as a string
      const staticPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.path
      if (staticPath) {
        // Check if path exists - in Next.js dev, it might point to .next folder which doesn't exist yet
        // In production/Vercel, it should point to the actual binary
        if (fs.existsSync(staticPath)) {
          console.log(`✅ FFmpeg static path (absolute, verified): ${staticPath}`)
          return staticPath
        } else {
          // In development, the path might be in .next which is created during build
          // Try to find it in node_modules directly
          try {
            const staticModuleDir = path.dirname(require.resolve('ffmpeg-static'))
            const possiblePaths = [
              path.join(staticModuleDir, 'ffmpeg.exe'),
              path.join(staticModuleDir, 'ffmpeg'),
              path.join(staticModuleDir, 'vendor', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
            ]
            for (const possiblePath of possiblePaths) {
              if (fs.existsSync(possiblePath)) {
                console.log(`✅ FFmpeg static found in module: ${possiblePath}`)
                return possiblePath
              }
            }
          } catch {
            // Continue to other methods
          }
          console.log(`⚠️ ffmpeg-static path doesn't exist: ${staticPath}`)
        }
      }
    }
  } catch (error: any) {
    console.log(`ℹ️ ffmpeg-static package require failed: ${error?.message || 'unknown error'}`)
  }
  
  // PRIORITY 2: Try to require the main FFmpeg installer package
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
    console.log(`📦 FFmpeg installer module loaded:`, {
      hasPath: !!ffmpegInstaller?.path,
      path: ffmpegInstaller?.path,
      keys: ffmpegInstaller ? Object.keys(ffmpegInstaller) : [],
    })
    if (ffmpegInstaller && ffmpegInstaller.path) {
      const installerPath = ffmpegInstaller.path
      if (fs.existsSync(installerPath)) {
        console.log(`✅ FFmpeg installer path from require (absolute): ${installerPath}`)
        return installerPath
      } else {
        // Try relative to the module
        try {
          const moduleDir = path.dirname(require.resolve('@ffmpeg-installer/ffmpeg'))
          const relativePath = path.resolve(moduleDir, installerPath)
          if (fs.existsSync(relativePath)) {
            console.log(`✅ FFmpeg installer path (relative): ${relativePath}`)
            return relativePath
          }
        } catch {
          // Continue to search
        }
      }
    }
  } catch (error: any) {
    console.log(`ℹ️ FFmpeg installer require failed: ${error?.message || 'unknown error'}`)
  }
  
  // PRIORITY 3: Use require.resolve to find module directories, then search for binary
  const possibleBasePaths: string[] = []
  
  try {
    // Try to resolve ffmpeg-static
    const staticResolved = require.resolve('ffmpeg-static')
    const staticDir = path.dirname(staticResolved)
    possibleBasePaths.unshift(staticDir) // Highest priority
    console.log(`📦 Resolved ffmpeg-static at: ${staticResolved}, dir: ${staticDir}`)
  } catch (error: any) {
    console.log(`ℹ️ Could not resolve ffmpeg-static: ${error?.message}`)
  }
  
  try {
    // Try to resolve the main package
    const resolvedPath = require.resolve('@ffmpeg-installer/ffmpeg')
    const dirPath = path.dirname(resolvedPath)
    possibleBasePaths.push(dirPath)
    console.log(`📦 Resolved main package at: ${resolvedPath}, dir: ${dirPath}`)
  } catch (error: any) {
    console.log(`ℹ️ Could not resolve main package: ${error?.message}`)
  }
  
  // Add common paths for Vercel/serverless
  const cwd = process.cwd()
  possibleBasePaths.push(
    cwd,
    '/var/task',
    '/var/task/node_modules',
    path.join(cwd, 'node_modules'),
    path.resolve(cwd, '..', 'node_modules'),
  )
  
  console.log(`ℹ️ Searching node_modules directly in resolved paths...`)
  
  // First, check resolved module directories directly
  for (const basePath of possibleBasePaths) {
    console.log(`🔍 Checking resolved path: ${basePath}`)
    try {
      if (!fs.existsSync(basePath)) {
        continue
      }
      
      // Check if this is already a module directory (from require.resolve)
      // Try common binary locations in module directory
      const directPaths = [
        path.join(basePath, 'ffmpeg'),
        path.join(basePath, 'vendor', 'ffmpeg'),
        path.join(basePath, 'bin', 'ffmpeg'),
      ]
      
      for (const binaryPath of directPaths) {
        if (fs.existsSync(binaryPath)) {
          console.log(`  ✅ Found binary at: ${binaryPath}`)
          try {
            execSync(`"${binaryPath}" -version`, { stdio: 'pipe', timeout: 2000 })
            console.log(`✅ Verified FFmpeg binary at: ${binaryPath}`)
            return binaryPath
          } catch {
            // Continue
          }
        }
      }
      
      // Try to find @ffmpeg-installer directory
      const nodeModulesPaths = [
        path.join(basePath, 'node_modules', '@ffmpeg-installer'),
        path.join(basePath, '@ffmpeg-installer'),
        path.resolve(basePath, '..', 'node_modules', '@ffmpeg-installer'),
        path.resolve(basePath, '../..', 'node_modules', '@ffmpeg-installer'),
      ]
      
      for (const nmPath of nodeModulesPaths) {
        if (!fs.existsSync(nmPath)) continue
        
        console.log(`  📂 Found @ffmpeg-installer at: ${nmPath}`)
        
        // List directory contents for debugging
        try {
          const dirContents = fs.readdirSync(nmPath)
          console.log(`  📋 Directory contents: ${dirContents.join(', ')}`)
        } catch {
          // Continue
        }
        
        // Also check if there's a separate package directory
        const parentDir = path.dirname(nmPath)
        
        // Try multiple possible locations for the FFmpeg binary
        const possiblePaths = [
          // ffmpeg-static paths (highest priority)
          path.join(nmPath, 'ffmpeg-static', 'ffmpeg'),
          path.join(parentDir, 'ffmpeg-static', 'ffmpeg'),
          // @ffmpeg-installer paths
          path.join(nmPath, 'linux-x64', 'ffmpeg'),
          path.join(nmPath, 'ffmpeg-linux-x64', 'ffmpeg'),
          path.join(nmPath, 'ffmpeg', 'ffmpeg'),
          path.join(nmPath, 'ffmpeg', 'linux-x64', 'ffmpeg'),
          path.join(nmPath, 'ffmpeg', 'vendor', 'ffmpeg'),
          path.join(parentDir, 'ffmpeg-linux-x64', 'ffmpeg'),
          path.join(parentDir, 'ffmpeg-linux-x64', 'vendor', 'ffmpeg'),
        ]
        
        for (const binaryPath of possiblePaths) {
          console.log(`  🔎 Checking: ${binaryPath}`)
          if (fs.existsSync(binaryPath)) {
            console.log(`  ✅ Found binary at: ${binaryPath}`)
            try {
              execSync(`"${binaryPath}" -version`, { stdio: 'pipe', timeout: 2000 })
              console.log(`✅ Verified FFmpeg binary at: ${binaryPath}`)
              return binaryPath
            } catch (verifyError: any) {
              console.log(`  ⚠️ Binary exists but verification failed: ${verifyError?.message}`)
              // Continue to next path
            }
          }
        }
      }
    } catch (error: any) {
      console.log(`  ❌ Error searching path ${basePath}: ${error?.message}`)
    }
  }
  
  console.error('❌ FFmpeg binary not found in any expected location')
  console.error('❌ Searched base paths:', possibleBasePaths)
  console.error('❌ Platform:', process.platform)
  console.error('❌ Vercel env:', process.env.VERCEL)
  console.error('❌ CWD:', process.cwd())
  return null
}

const writeFile = promisify(fs.writeFile)
const unlink = promisify(fs.unlink)
const mkdir = promisify(fs.mkdir)

// Helper function to detect Vercel/Linux (same as in class)
function isVercelOrLinuxEnv(): boolean {
  const isVercel = process.env.VERCEL === '1' || 
                   process.env.VERCEL_ENV !== undefined ||
                   process.env.VERCEL_URL !== undefined ||
                   process.env.NEXT_PUBLIC_VERCEL !== undefined
  const isLinux = process.platform !== 'win32' && process.platform !== 'darwin'
  return isVercel || isLinux
}

// Configure FFmpeg path - works on Windows, Linux (Vercel), and macOS
let ffmpegPathSet = false

// On Vercel/Linux, try to find and copy FFmpeg to /tmp early
if (process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined) {
  try {
    console.log('🔍 Early FFmpeg initialization for Vercel...')
    const installerPath = getFFmpegInstallerPath()
    console.log(`📦 Installer path found: ${installerPath || 'null'}`)
    if (installerPath && fs.existsSync(installerPath)) {
      const tmpFFmpegPath = '/tmp/ffmpeg'
      try {
        // Copy to /tmp if not already there or if source is newer
        let needsCopy = true
        if (fs.existsSync(tmpFFmpegPath)) {
          try {
            const tmpStats = fs.statSync(tmpFFmpegPath)
            const srcStats = fs.statSync(installerPath)
            // Copy if source is newer or sizes don't match
            if (tmpStats.size === srcStats.size && tmpStats.mtime >= srcStats.mtime) {
              needsCopy = false
            }
          } catch {
            // If we can't compare, copy anyway
          }
        }
        
        if (needsCopy) {
          console.log(`📋 Early copy: Copying FFmpeg from ${installerPath} to ${tmpFFmpegPath}...`)
          const binaryData = fs.readFileSync(installerPath)
          fs.writeFileSync(tmpFFmpegPath, binaryData)
          execSync(`chmod +x "${tmpFFmpegPath}"`, { stdio: 'ignore' })
          console.log(`✅ Early copy: FFmpeg copied to ${tmpFFmpegPath}`)
        } else {
          console.log(`ℹ️ FFmpeg already exists in /tmp, skipping copy`)
        }
        
        // Verify it works
        execSync(`${tmpFFmpegPath} -version`, { stdio: 'pipe', timeout: 3000 })
        ffmpeg.setFfmpegPath(tmpFFmpegPath)
        ffmpegPathSet = true
        console.log(`✅ Early init: Using FFmpeg from /tmp: ${tmpFFmpegPath}`)
      } catch (error: any) {
        console.log(`ℹ️ Early copy/verification failed, will retry at runtime: ${error?.message}`)
        // Try using the installer path directly as fallback
        try {
          execSync(`chmod +x "${installerPath}"`, { stdio: 'ignore' })
          execSync(`${installerPath} -version`, { stdio: 'pipe', timeout: 3000 })
          ffmpeg.setFfmpegPath(installerPath)
          ffmpegPathSet = true
          console.log(`✅ Early init: Using FFmpeg directly from installer: ${installerPath}`)
        } catch (directError: any) {
          console.log(`ℹ️ Direct path also failed: ${directError?.message}`)
        }
      }
    } else {
      console.log(`⚠️ Installer path not found or doesn't exist, will retry at runtime`)
    }
  } catch (error: any) {
    console.log(`ℹ️ Early FFmpeg initialization failed: ${error?.message}`)
    console.log(`ℹ️ Error stack: ${error?.stack}`)
  }
}

// Try to get FFmpeg installer path (lazy load)
// Note: This may fail on Vercel due to platform package resolution, that's OK
if (!ffmpegPathSet) {
  const ffmpegInstallerPath = getFFmpegInstallerPath()
  if (ffmpegInstallerPath) {
    try {
      ffmpeg.setFfmpegPath(ffmpegInstallerPath)
      ffmpegPathSet = true
      console.log(`✅ Using FFmpeg from @ffmpeg-installer: ${ffmpegInstallerPath}`)
    } catch (setPathError) {
      console.warn('⚠️ Failed to set FFmpeg installer path, will use system FFmpeg')
    }
  }
}

// If installer didn't work, try system FFmpeg
if (!ffmpegPathSet && process.platform === 'win32') {
  // Windows paths
  const possiblePaths = [
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\tools\\ffmpeg\\bin\\ffmpeg.exe',
  ]
  
  for (const ffmpegPath of possiblePaths) {
    if (fs.existsSync(ffmpegPath)) {
      ffmpeg.setFfmpegPath(ffmpegPath)
      console.log(`✅ FFmpeg found at: ${ffmpegPath}`)
      ffmpegPathSet = true
      break
    }
  }
} else {
  // Linux (Vercel) and macOS paths - check more aggressively on Vercel
  const possiblePaths = [
    '/usr/bin/ffmpeg',           // Standard Linux path
    '/usr/local/bin/ffmpeg',     // Common install path
    '/opt/ffmpeg/bin/ffmpeg',    // Alternative install
    '/bin/ffmpeg',                // System bin
  ]
  
  // On Vercel/Linux, try to find FFmpeg in common paths first
  for (const ffmpegPath of possiblePaths) {
    try {
      if (fs.existsSync(ffmpegPath)) {
        ffmpeg.setFfmpegPath(ffmpegPath)
        console.log(`✅ FFmpeg found at: ${ffmpegPath}`)
        ffmpegPathSet = true
        break
      }
    } catch (error) {
      // Continue checking other paths
    }
  }
  
  // If not found in paths, try checking if it's in PATH
  if (!ffmpegPathSet) {
    try {
      execSync('ffmpeg -version', { stdio: 'pipe', timeout: 2000, encoding: 'utf8' })
      console.log(`✅ FFmpeg found in system PATH`)
      // Don't set path explicitly - let fluent-ffmpeg use PATH
      ffmpegPathSet = true
    } catch (error) {
      // FFmpeg not in PATH either
      if (isVercelOrLinuxEnv()) {
        // On Vercel, assume FFmpeg is available and will be found at runtime
        console.log('ℹ️ FFmpeg path not found at module load, but assuming available on Vercel')
        ffmpegPathSet = true // Mark as "set" so we proceed
      }
    }
  }
}

if (!ffmpegPathSet) {
  console.log('ℹ️ FFmpeg path not explicitly set - will use system PATH or default')
}

interface VideoInstruction {
  operation: string
  params: any
}

// Helper function to reliably detect Vercel/Linux environment
function isVercelOrLinux(): boolean {
  // Check multiple indicators
  const isVercel = process.env.VERCEL === '1' || 
                   process.env.VERCEL_ENV !== undefined ||
                   process.env.VERCEL_URL !== undefined ||
                   process.env.NEXT_PUBLIC_VERCEL !== undefined
  
  const isLinux = process.platform !== 'win32' && process.platform !== 'darwin'
  
  // On Vercel, always use Linux paths
  // On any Linux system (not macOS), use Linux paths
  return isVercel || isLinux
}

export class VideoProcessor {
  private tempDir: string

  constructor() {
    // Use helper function to reliably detect environment
    if (isVercelOrLinux()) {
      // Vercel/Linux: ALWAYS use /tmp/vedit-temp directly (no path manipulation)
      this.tempDir = '/tmp/vedit-temp'
      console.log(`📁 Vercel/Linux detected - using explicit path: ${this.tempDir}`)
      console.log(`📁 Detection details: VERCEL=${process.env.VERCEL}, platform=${process.platform}`)
    } else {
      // Windows/macOS: Use system temp directory
      const systemTempDir = os.tmpdir()
      this.tempDir = path.join(systemTempDir, 'vedit-temp')
      console.log(`📁 Windows/macOS detected - using system temp: ${this.tempDir}`)
    }
    
    console.log(`📁 Platform: ${process.platform}`)
    console.log(`📁 VERCEL env vars: VERCEL=${process.env.VERCEL}, VERCEL_ENV=${process.env.VERCEL_ENV}`)
    console.log(`📁 Final temp directory: ${this.tempDir}`)
    console.log(`📁 Temp dir check - starts with /tmp: ${this.tempDir.startsWith('/tmp')}`)
    console.log(`📁 Temp dir check - contains backslashes: ${this.tempDir.includes('\\')}`)
    
    // Ensure temp directory exists
    this.ensureTempDir()
  }

  private ensureTempDir() {
    try {
      // Use helper function to reliably detect environment
      if (isVercelOrLinux()) {
        // Force to exact Unix path - no manipulation
        this.tempDir = '/tmp/vedit-temp'
      } else {
        // On Windows, normalize the path
        this.tempDir = path.resolve(this.tempDir)
      }
      
      console.log(`📁 Attempting to create/verify temp directory: ${this.tempDir}`)
      console.log(`📁 Path type check - starts with /tmp: ${this.tempDir.startsWith('/tmp')}`)
      console.log(`📁 Path contains backslashes: ${this.tempDir.includes('\\')}`)
      
      if (!fs.existsSync(this.tempDir)) {
        // Use recursive: true to create parent directories if needed
        console.log(`📁 Creating directory: ${this.tempDir}`)
        fs.mkdirSync(this.tempDir, { recursive: true })
        console.log(`✅ Created temp directory: ${this.tempDir}`)
      } else {
        console.log(`✅ Temp directory already exists: ${this.tempDir}`)
      }
      
      // Verify we can write to the directory
      const testFile = isVercelOrLinux()
        ? `${this.tempDir}/.write_test_${Date.now()}`
        : path.join(this.tempDir, `.write_test_${Date.now()}`)
      try {
        fs.writeFileSync(testFile, 'test')
        fs.unlinkSync(testFile)
        console.log(`✅ Temp directory is writable: ${this.tempDir}`)
      } catch (writeError) {
        console.error(`⚠️ Temp directory write test failed: ${writeError}`)
        // Don't throw - might still work for some operations
      }
    } catch (error: any) {
      console.error(`❌ Failed to create temp directory: ${error}`)
      console.error(`❌ Error details:`, {
        message: error?.message,
        code: error?.code,
        path: error?.path,
        syscall: error?.syscall,
        attemptedPath: this.tempDir,
      })
      
      // On Vercel/Linux, try /tmp directly as fallback
      if (isVercelOrLinux()) {
        console.log(`🔄 Trying /tmp/vedit-temp directory as fallback...`)
        try {
          this.tempDir = '/tmp/vedit-temp'
          if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true })
          }
          console.log(`✅ Using fallback temp directory: ${this.tempDir}`)
          
          // Verify fallback works
          const testFile = `${this.tempDir}/.write_test_${Date.now()}`
          fs.writeFileSync(testFile, 'test')
          fs.unlinkSync(testFile)
          console.log(`✅ Fallback temp directory is writable`)
        } catch (fallbackError: any) {
          console.error(`❌ Fallback temp directory also failed: ${fallbackError}`)
          console.error(`❌ Fallback error details:`, {
            message: fallbackError?.message,
            code: fallbackError?.code,
            path: fallbackError?.path,
          })
          throw new Error(`Cannot create temp directory. Original: ${error?.message || error}. Fallback: ${fallbackError?.message || fallbackError}`)
        }
      } else {
        throw error
      }
    }
  }

  async process(
    mediaUrl: string,
    instruction: VideoInstruction,
    isImage: boolean = false
  ): Promise<string> {
    console.log(`🎬 Starting ${isImage ? 'image' : 'video'} processing...`)
    console.log('📋 Instruction:', JSON.stringify(instruction, null, 2))
    
    // Ensure FFmpeg path is set BEFORE any checks or processing
    this.ensureFFmpegPath()
    
    // Log current FFmpeg configuration
    try {
      const ffmpegModule = ffmpeg as any
      const currentPath = ffmpegModule.ffmpegPath
      console.log(`📹 Current FFmpeg path setting: ${currentPath || 'not set (using PATH)'}`)
    } catch {
      console.log('📹 Could not check FFmpeg path setting')
    }
    
    // Check if FFmpeg is available before processing
    // On Vercel, be lenient - the check will always resolve, errors will show during actual FFmpeg use
    try {
      await this.checkFFmpegAvailability()
      console.log('✅ FFmpeg check completed, proceeding with video processing')
    } catch (ffmpegError: any) {
      // Only reject on Windows/macOS if FFmpeg is definitely not available
      // On Vercel, the check always resolves, so this shouldn't happen
      if (isVercelOrLinux()) {
        console.warn('⚠️ FFmpeg check had issues on Vercel, but continuing...')
        // Try one more time to set FFmpeg path
        this.ensureFFmpegPath()
      } else {
        console.error('❌ FFmpeg not available:', ffmpegError)
        throw new Error(`FFmpeg is not available: ${ffmpegError?.message || 'FFmpeg check failed'}`)
      }
    }
    
    // Ensure temp directory exists before processing
    this.ensureTempDir()
    
    const inputPath = await this.downloadVideo(mediaUrl)
    console.log(`📥 Downloaded ${isImage ? 'image' : 'video'} to: ${inputPath}`)
    
    // Determine output format - keep images as images, videos as videos
    const outputExt = isImage ? (inputPath.match(/\.(\w+)$/)?.[1] || 'png') : 'mp4'
    
    // On Vercel/Linux, construct path manually with forward slashes (avoid path.join)
    const outputPath = isVercelOrLinux()
      ? `${this.tempDir}/output_${Date.now()}.${outputExt}`
      : path.join(this.tempDir, `output_${Date.now()}.${outputExt}`)
    
    console.log(`📁 Output path: ${outputPath}`)
    console.log(`📁 Output path check - contains backslashes: ${outputPath.includes('\\')}`)
    
    // Ensure output directory exists - use tempDir directly on Vercel
    const outputDir = isVercelOrLinux()
      ? this.tempDir
      : path.dirname(outputPath)
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
      console.log(`📁 Created output directory: ${outputDir}`)
    }

    try {
      await this.applyEdit(inputPath, outputPath, instruction, isImage)
      // On Vercel/Linux, don't use path.resolve (it converts to Windows paths)
      const normalizedOutputPath = isVercelOrLinux()
        ? outputPath
        : path.resolve(outputPath)
      
      console.log(`✅ ${isImage ? 'Image' : 'Video'} editing completed: ${normalizedOutputPath}`)
      
      // Verify output file exists before upload
      if (!fs.existsSync(normalizedOutputPath)) {
        throw new Error(`Output file not found after processing: ${normalizedOutputPath}`)
      }
      
      // Check file size to ensure it's not empty
      const stats = fs.statSync(normalizedOutputPath)
      if (stats.size === 0) {
        throw new Error(`Output file is empty (0 bytes): ${normalizedOutputPath}`)
      }
      
      console.log(`✅ Verified output file exists (${(stats.size / 1024 / 1024).toFixed(2)}MB): ${normalizedOutputPath}`)
      
      const processedUrl = await this.uploadVideo(normalizedOutputPath, 'vedit/processed', isImage)
      console.log(`☁️ Uploaded to Cloudinary: ${processedUrl}`)
      
      return processedUrl
    } catch (error: any) {
      console.error(`❌ ${isImage ? 'Image' : 'Video'} processing error:`, error)
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
      })
      throw error
    } finally {
      // Cleanup temp files (use normalized paths)
      this.cleanup(path.resolve(inputPath))
      this.cleanup(path.resolve(outputPath))
    }
  }

  private ensureFFmpegPath(): void {
    // Check if FFmpeg path is already set and working
    try {
      const ffmpegModule = ffmpeg as any
      const currentPath = ffmpegModule.ffmpegPath
      if (currentPath) {
        // Try to verify the current path still works
        try {
          execSync(`${currentPath} -version`, { stdio: 'pipe', timeout: 2000 })
          console.log(`✅ FFmpeg path already set and verified: ${currentPath}`)
          return
        } catch {
          // Path is set but not working, continue to find new path
          console.log(`⚠️ FFmpeg path set but not working, searching for new path...`)
        }
      }
    } catch {
      // Continue to find FFmpeg path
    }

    // On Vercel/Linux, FFmpeg is NOT available system-wide
    // We need to use the bundled binary from @ffmpeg-installer/ffmpeg
    if (isVercelOrLinux()) {
      // Try multiple approaches to find and set FFmpeg path
      const installerPath = getFFmpegInstallerPath()
      
      if (installerPath && fs.existsSync(installerPath)) {
        // Approach 1: Try to use the binary directly (without copying)
        try {
          // Make sure it's executable first
          try {
            execSync(`chmod +x "${installerPath}"`, { stdio: 'ignore' })
          } catch {
            // Ignore chmod errors - might already be executable
          }
          
          // Verify it works
          execSync(`${installerPath} -version`, { stdio: 'pipe', timeout: 3000 })
          ffmpeg.setFfmpegPath(installerPath)
          console.log(`✅ Using FFmpeg directly from node_modules: ${installerPath}`)
          return
        } catch (error: any) {
          console.log(`ℹ️ Direct path failed, trying /tmp copy: ${error?.message}`)
          
          // Approach 2: Copy to /tmp to ensure it's accessible
          const tmpFFmpegPath = '/tmp/ffmpeg'
          try {
            // Copy binary to /tmp if not already there or if it's stale
            let needsCopy = true
            if (fs.existsSync(tmpFFmpegPath)) {
              // Check if it's the same file
              try {
                const tmpStats = fs.statSync(tmpFFmpegPath)
                const srcStats = fs.statSync(installerPath)
                if (tmpStats.size === srcStats.size && tmpStats.mtime >= srcStats.mtime) {
                  needsCopy = false
                }
              } catch {
                // If we can't compare, copy anyway
              }
            }
            
            if (needsCopy) {
              const binaryData = fs.readFileSync(installerPath)
              fs.writeFileSync(tmpFFmpegPath, binaryData)
              // Make executable
              execSync(`chmod +x "${tmpFFmpegPath}"`, { stdio: 'ignore' })
              console.log(`✅ Copied FFmpeg binary to ${tmpFFmpegPath}`)
            }
            
            // Verify it works
            execSync(`${tmpFFmpegPath} -version`, { stdio: 'pipe', timeout: 3000 })
            ffmpeg.setFfmpegPath(tmpFFmpegPath)
            console.log(`✅ Using FFmpeg from /tmp: ${tmpFFmpegPath}`)
            return
          } catch (tmpError: any) {
            console.error(`❌ Failed to use FFmpeg from /tmp: ${tmpError?.message}`)
            // Continue to try other approaches
          }
        }
      }
      
      // Approach 3: Try to find FFmpeg in common Vercel serverless paths and copy to /tmp
      const possibleBasePaths = [
        process.cwd(),
        '/var/task',
        '/var/task/.next/server',
        '/var/task/node_modules',
        '/opt',
      ]
      
      for (const basePath of possibleBasePaths) {
        const possiblePaths = [
          // ffmpeg-static paths (highest priority)
          path.join(basePath, 'node_modules', 'ffmpeg-static', 'ffmpeg'),
          path.join(basePath, 'node_modules', 'ffmpeg-static'),
          // @ffmpeg-installer paths
          path.join(basePath, 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg'),
          path.join(basePath, 'node_modules', '@ffmpeg-installer', 'ffmpeg', 'ffmpeg'),
          path.join(basePath, '@ffmpeg-installer', 'linux-x64', 'ffmpeg'),
          path.join(basePath, '@ffmpeg-installer', 'ffmpeg', 'ffmpeg'),
        ]
        
        for (const checkPath of possiblePaths) {
          try {
            if (fs.existsSync(checkPath)) {
              console.log(`✅ Found FFmpeg binary at: ${checkPath}`)
              
              // Always copy to /tmp on Vercel since filesystem is read-only
              const tmpFFmpegPath = '/tmp/ffmpeg'
              try {
                const binaryData = fs.readFileSync(checkPath)
                fs.writeFileSync(tmpFFmpegPath, binaryData)
                execSync(`chmod +x "${tmpFFmpegPath}"`, { stdio: 'ignore' })
                execSync(`${tmpFFmpegPath} -version`, { stdio: 'pipe', timeout: 3000 })
                ffmpeg.setFfmpegPath(tmpFFmpegPath)
                console.log(`✅ Copied and using FFmpeg from /tmp: ${tmpFFmpegPath}`)
                return
              } catch (copyError: any) {
                console.log(`⚠️ Failed to copy to /tmp, trying direct path: ${copyError?.message}`)
                // Try direct path as fallback
                try {
                  execSync(`chmod +x "${checkPath}"`, { stdio: 'ignore' })
                  execSync(`${checkPath} -version`, { stdio: 'pipe', timeout: 3000 })
                  ffmpeg.setFfmpegPath(checkPath)
                  console.log(`✅ Using FFmpeg directly from: ${checkPath}`)
                  return
                } catch {
                  // Continue to next path
                }
              }
            }
          } catch {
            // Continue to next path
          }
        }
      }
      
      // Approach 4: Try system paths (unlikely to work on Vercel, but worth trying)
      const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/bin/ffmpeg']
      for (const checkPath of systemPaths) {
        try {
          if (fs.existsSync(checkPath)) {
            execSync(`${checkPath} -version`, { stdio: 'pipe', timeout: 2000 })
            ffmpeg.setFfmpegPath(checkPath)
            console.log(`✅ FFmpeg found at system path: ${checkPath}`)
            return
          }
        } catch {
          // Continue
        }
      }
      
      // If we get here, we couldn't find FFmpeg
      // Try one more comprehensive search using getFFmpegInstallerPath
      console.log('🔄 Performing comprehensive FFmpeg search as final attempt...')
      const finalPath = getFFmpegInstallerPath()
      if (finalPath && fs.existsSync(finalPath)) {
        try {
          // Make executable
          try {
            execSync(`chmod +x "${finalPath}"`, { stdio: 'ignore' })
          } catch {
            // Ignore chmod errors
          }
          
          // Verify it works
          execSync(`${finalPath} -version`, { stdio: 'pipe', timeout: 3000 })
          ffmpeg.setFfmpegPath(finalPath)
          console.log(`✅ FFmpeg found via comprehensive search: ${finalPath}`)
          return
        } catch (error: any) {
          console.error(`❌ Final path found but not executable: ${finalPath}`, error?.message)
        }
      }
      
      // If still not found, log detailed info but don't throw
      // Let the verification step in applyEdit handle the error
      console.warn('⚠️ Could not find FFmpeg binary after all attempts')
      console.warn('⚠️ Current working directory:', process.cwd())
      console.warn('⚠️ Will try system PATH, but this is likely to fail on Vercel')
    } else {
      // On Windows/macOS, try installer first
      const installerPath = getFFmpegInstallerPath()
      if (installerPath && fs.existsSync(installerPath)) {
        ffmpeg.setFfmpegPath(installerPath)
        console.log(`✅ Using FFmpeg from installer: ${installerPath}`)
        return
      }
    }
  }

  private async checkFFmpegAvailability(): Promise<void> {
    return new Promise((resolve, reject) => {
      // On Vercel/Linux, be more lenient - assume FFmpeg is available and let it fail during actual use if not
      if (isVercelOrLinux()) {
        console.log('ℹ️ Vercel/Linux detected - using lenient FFmpeg check')
        // Try a quick check, but don't fail if it doesn't work
        try {
          // Quick version check
          try {
            const versionOutput = execSync('ffmpeg -version', { 
              stdio: 'pipe', 
              timeout: 2000,
              encoding: 'utf8'
            })
            if (versionOutput && versionOutput.includes('ffmpeg version')) {
              const versionMatch = versionOutput.match(/ffmpeg version (\S+)/)
              console.log(`✅ FFmpeg is available (verified)${versionMatch ? ` - version ${versionMatch[1]}` : ''}`)
              resolve()
              return
            }
          } catch (versionError) {
            console.log('ℹ️ FFmpeg version check failed, but continuing (will try during actual use)')
          }
          
          // Try to find FFmpeg in common paths
          const commonPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/bin/ffmpeg']
          for (const checkPath of commonPaths) {
            if (fs.existsSync(checkPath)) {
              ffmpeg.setFfmpegPath(checkPath)
              console.log(`✅ FFmpeg found at: ${checkPath}`)
              resolve()
              return
            }
          }
          
          // On Vercel, assume FFmpeg is available in PATH even if check fails
          console.log('ℹ️ FFmpeg check inconclusive on Vercel - proceeding (will fail during actual use if not available)')
          resolve()
          return
        } catch (error: any) {
          // On Vercel, be lenient - just log and continue
          console.warn('⚠️ FFmpeg check error on Vercel, but continuing:', error?.message)
          resolve()
          return
        }
      }
      
      // On Windows/macOS, do a more thorough check
      try {
        // Method 1: Try to get FFmpeg version directly (fastest check)
        try {
          const versionOutput = execSync('ffmpeg -version', { 
            stdio: 'pipe', 
            timeout: 3000,
            encoding: 'utf8'
          })
          if (versionOutput && versionOutput.includes('ffmpeg version')) {
            console.log('✅ FFmpeg is available (verified via version check)')
            const versionMatch = versionOutput.match(/ffmpeg version (\S+)/)
            if (versionMatch) {
              console.log(`✅ FFmpeg version: ${versionMatch[1]}`)
            }
            resolve()
            return
          }
        } catch (versionError: any) {
          console.log('ℹ️ FFmpeg version check failed, trying encoder check...')
        }
        
        // Method 2: Try to get available encoders via fluent-ffmpeg
        ffmpeg.getAvailableEncoders((err, encoders) => {
          if (err) {
            console.error('❌ FFmpeg availability check failed:', err.message)
            
            // Method 3: Try common paths
            const commonPaths = process.platform === 'win32' 
              ? ['C:\\ffmpeg\\bin\\ffmpeg.exe', 'ffmpeg.exe']
              : ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/bin/ffmpeg', 'ffmpeg']
            
            let foundPath = false
            for (const checkPath of commonPaths) {
              try {
                if (checkPath.includes('/') || checkPath.includes('\\')) {
                  if (fs.existsSync(checkPath)) {
                    ffmpeg.setFfmpegPath(checkPath)
                    console.log(`✅ FFmpeg found at: ${checkPath}`)
                    foundPath = true
                    resolve()
                    return
                  }
                } else {
                  // Try to execute it
                  try {
                    execSync(`${checkPath} -version`, { stdio: 'pipe', timeout: 2000 })
                    console.log(`✅ FFmpeg found in PATH: ${checkPath}`)
                    foundPath = true
                    resolve()
                    return
                  } catch {
                    // Continue
                  }
                }
              } catch {
                // Continue checking
              }
            }
            
            if (!foundPath) {
              reject(new Error(`FFmpeg not found. Tried: ${commonPaths.join(', ')}. Original error: ${err.message}`))
            }
          } else {
            console.log('✅ FFmpeg is available (verified via encoder check)')
            if (encoders && Object.keys(encoders).length > 0) {
              console.log(`✅ FFmpeg has ${Object.keys(encoders).length} encoders available`)
            }
            resolve()
          }
        })
      } catch (error: any) {
        console.error('❌ FFmpeg check error:', error?.message)
        reject(new Error(`FFmpeg availability check failed: ${error?.message || 'Unknown error'}`))
      }
    })
  }

  private async downloadVideo(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to download media')

    const buffer = Buffer.from(await response.arrayBuffer())
    // Detect file extension from URL or use default
    const extMatch = url.match(/\.(\w+)(\?|$)/)
    const ext = extMatch ? extMatch[1] : 'mp4'
    
    // On Vercel/Linux, construct path manually with forward slashes (avoid path.resolve/path.join)
    const inputPath = isVercelOrLinux()
      ? `${this.tempDir}/input_${Date.now()}.${ext}`
      : path.resolve(path.join(this.tempDir, `input_${Date.now()}.${ext}`))
    
    console.log(`📁 Input path: ${inputPath}`)
    console.log(`📁 Input path check - contains backslashes: ${inputPath.includes('\\')}`)
    
    // Ensure directory exists before writing
    this.ensureTempDir()
    
    await writeFile(inputPath, buffer)
    console.log(`✅ Downloaded media to: ${inputPath}`)
    return inputPath
  }

  private async applyEdit(
    inputPath: string,
    outputPath: string,
    instruction: VideoInstruction,
    isImage: boolean = false
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔧 Applying edit: ${instruction.operation} to ${isImage ? 'image' : 'video'}`)
      
      // CRITICAL: Ensure output directory exists RIGHT BEFORE FFmpeg runs
      // On Vercel/Linux, use tempDir directly; on Windows, use path.dirname
      let outputDir: string
      let normalizedOutputPath: string
      
      if (isVercelOrLinux()) {
        // On Vercel/Linux, outputPath is already in correct format, extract dir manually
        const lastSlash = outputPath.lastIndexOf('/')
        outputDir = lastSlash > 0 ? outputPath.substring(0, lastSlash) : this.tempDir
        normalizedOutputPath = outputPath
      } else {
        // On Windows, use path.resolve
        outputDir = path.resolve(path.dirname(outputPath))
        normalizedOutputPath = path.resolve(outputPath)
      }
      
      console.log(`🔍 Verifying output directory: ${outputDir}`)
      console.log(`🔍 Normalized output path: ${normalizedOutputPath}`)
      console.log(`🔍 Path check - contains backslashes: ${outputDir.includes('\\')}`)
      
      // Force create directory with recursive option
      try {
        if (!fs.existsSync(outputDir)) {
          console.log(`📁 Directory doesn't exist, creating: ${outputDir}`)
          fs.mkdirSync(outputDir, { recursive: true })
        }
        
        // Verify directory was created
        if (!fs.existsSync(outputDir)) {
          throw new Error(`Directory creation failed: ${outputDir}`)
        }
        
        // Check if we can write to the directory (test write permissions)
        const testFile = isVercelOrLinux()
          ? `${outputDir}/.write_test`
          : path.join(outputDir, '.write_test')
        try {
          fs.writeFileSync(testFile, 'test')
          fs.unlinkSync(testFile)
          console.log(`✅ Directory write test successful: ${outputDir}`)
        } catch (writeTestError) {
          console.error(`⚠️ Directory write test failed: ${writeTestError}`)
          throw new Error(`Cannot write to directory ${outputDir}: ${writeTestError}`)
        }
        
        console.log(`✅ Output directory verified and ready: ${outputDir}`)
      } catch (dirError: any) {
        console.error(`❌ Failed to prepare output directory: ${dirError.message}`)
        console.error(`❌ Error stack: ${dirError.stack}`)
        reject(new Error(`Cannot create/access output directory: ${outputDir}. Error: ${dirError.message}`))
        return
      }
      
      // Use normalized absolute path for input and output
      // On Windows, use forward slashes for FFmpeg (it accepts both)
      // On Vercel/Linux, paths are already correct
      let normalizedInputPath: string
      if (isVercelOrLinux()) {
        normalizedInputPath = inputPath
      } else {
        // On Windows, convert to forward slashes for FFmpeg
        normalizedInputPath = path.resolve(inputPath).replace(/\\/g, '/')
      }
      console.log(`📹 Normalized input path: ${normalizedInputPath}`)
      console.log(`📹 Normalized output path: ${normalizedOutputPath}`)
      
      // Ensure FFmpeg path is set before creating command (especially important on Vercel)
      this.ensureFFmpegPath()
      
      // Verify FFmpeg is actually available before proceeding
      let ffmpegVerified = false
      let ffmpegPath: string | null = null
      
      try {
        const ffmpegModule = ffmpeg as any
        ffmpegPath = ffmpegModule.ffmpegPath
        
        if (ffmpegPath) {
          // Try to run FFmpeg with the set path
          try {
            execSync(`${ffmpegPath} -version`, { stdio: 'pipe', timeout: 3000 })
            console.log(`✅ FFmpeg verified at path: ${ffmpegPath}`)
            ffmpegVerified = true
          } catch (pathError: any) {
            console.log(`⚠️ FFmpeg path verification failed, trying alternative paths...`)
            // Path is set but not working, try to find it again
            this.ensureFFmpegPath()
            // Check again after retry
            const retryModule = ffmpeg as any
            const retryPath = retryModule.ffmpegPath
            if (retryPath && retryPath !== ffmpegPath) {
              try {
                execSync(`${retryPath} -version`, { stdio: 'pipe', timeout: 3000 })
                console.log(`✅ FFmpeg verified at retry path: ${retryPath}`)
                ffmpegVerified = true
                ffmpegPath = retryPath
              } catch {
                // Still failed
              }
            }
          }
        }
        
        // If path verification failed or no path set, try system PATH
        if (!ffmpegVerified) {
          try {
            execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 })
            console.log(`✅ FFmpeg verified in system PATH`)
            ffmpegVerified = true
          } catch (pathError: any) {
            // PATH check also failed
            console.log(`⚠️ FFmpeg not found in system PATH either`)
          }
        }
      } catch (verifyError: any) {
        console.error('❌ FFmpeg verification error:', {
          message: verifyError?.message,
          code: verifyError?.code,
        })
      }
      
      // If still not verified, try one more time with a comprehensive search
      if (!ffmpegVerified) {
        console.log('🔄 Performing final FFmpeg search...')
        this.ensureFFmpegPath()
        const ffmpegModule = ffmpeg as any
        const finalPath = ffmpegModule.ffmpegPath
        
        if (finalPath) {
          try {
            execSync(`${finalPath} -version`, { stdio: 'pipe', timeout: 3000 })
            console.log(`✅ FFmpeg found and verified: ${finalPath}`)
            ffmpegVerified = true
            ffmpegPath = finalPath
          } catch {
            // Final attempt failed
          }
        }
        
        // Last resort: try PATH one more time
        if (!ffmpegVerified) {
          try {
            execSync('ffmpeg -version', { stdio: 'pipe', timeout: 3000 })
            console.log(`✅ FFmpeg found in PATH on final attempt`)
            ffmpegVerified = true
          } catch {
            // All attempts failed
          }
        }
      }
      
      if (!ffmpegVerified) {
        const ffmpegModule = ffmpeg as any
        const currentPath = ffmpegModule.ffmpegPath || 'not set'
        console.error('❌ FFmpeg verification failed after all attempts')
        console.error('❌ Current FFmpeg path setting:', currentPath)
        console.error('❌ Searched in: node_modules, /tmp, system paths, and PATH')
        console.error('❌ Platform:', process.platform)
        console.error('❌ Vercel env:', process.env.VERCEL)
        console.error('❌ CWD:', process.cwd())
        
        // Try one last time to get installer path and log it
        const lastAttemptPath = getFFmpegInstallerPath()
        console.error('❌ Last attempt installer path:', lastAttemptPath || 'null')
        
        // Provide helpful error message with more context
        const searchedPaths = [
          currentPath !== 'not set' ? currentPath : null,
          lastAttemptPath,
          '/tmp/ffmpeg',
          '/usr/bin/ffmpeg',
          '/usr/local/bin/ffmpeg',
        ].filter(Boolean).join(', ') || 'not set'
        
        const errorMessage = isVercelOrLinux()
          ? `FFmpeg not found. The ffmpeg-static binary is not accessible on Vercel. Paths searched: ${searchedPaths}. Please check server logs for more details.`
          : `FFmpeg is not available. Please ensure FFmpeg is installed. Paths searched: ${searchedPaths}`
        
        reject(new Error(errorMessage))
        return
      }
      
      let command = ffmpeg(normalizedInputPath)
      
      // For images, treat as single-frame video with loop
      if (isImage) {
        command = command.inputOptions(['-loop', '1', '-t', '1']) // 1 second duration
      }

      switch (instruction.operation) {
        case 'trim':
          const { start = 0, end } = instruction.params
          console.log(`✂️ Trimming from ${start}s to ${end || 'end'}`)
          if (end) {
            const duration = end - start
            command
              .seekInput(start)
              .duration(duration)
          } else {
            command.seekInput(start)
          }
          break

        case 'colorGrade': {
          const { preset, startTime, endTime } = instruction.params
          console.log(`🎨 Applying color grade: ${preset || instruction.params.style}${startTime !== undefined ? ` from ${startTime}s to ${endTime !== undefined ? endTime + 's' : 'end'}` : ''}`)
          command = this.applyColorGrade(command, preset || instruction.params.style, { startTime, endTime })
          break
        }

        case 'applyEffect': {
          const { preset: effectPreset, startTime: effectStartTime, endTime: effectEndTime } = instruction.params
          console.log(`✨ Applying effect: ${effectPreset}${effectStartTime !== undefined ? ` from ${effectStartTime}s to ${effectEndTime !== undefined ? effectEndTime + 's' : 'end'}` : ''}`)
          command = this.applyEffect(command, instruction.params)
          break
        }

        case 'addText': {
          const { text: textContent, startTime: textStartTime, endTime: textEndTime } = instruction.params
          console.log(`📝 Adding text: ${textContent}${textStartTime !== undefined ? ` from ${textStartTime}s to ${textEndTime !== undefined ? textEndTime + 's' : 'end'}` : ''}`)
          command = this.addTextOverlay(command, instruction.params)
          break
        }

        case 'addTransition':
          console.log(`🎬 Adding transition: ${instruction.params.preset || instruction.params.type}`)
          command = this.applyTransition(command, instruction.params)
          break

        case 'addMusic':
          console.log(`🎵 Adding music: ${instruction.params.preset}`)
          // Music is typically handled separately, but can add audio filter here
          command = this.addMusicTrack(command, instruction.params)
          break

        case 'applyBrandKit':
          console.log(`🏷️ Applying brand kit: ${JSON.stringify(instruction.params)}`)
          command = this.applyBrandKit(command, instruction.params)
          break

        case 'merge':
          console.log(`🔗 Merging clips: ${JSON.stringify(instruction.params.clips)}`)
          // Merge requires special handling with multiple inputs
          // This will be handled in a separate merge method
          break

        case 'removeClip': {
          const { startTime, endTime } = instruction.params
          console.log(`🗑️ Removing clip: ${startTime}s to ${endTime}s`)
          command = this.removeClipSegment(command, startTime, endTime)
          break
        }

        case 'filter': {
          const { type: filterType, startTime: filterStartTime, endTime: filterEndTime } = instruction.params
          console.log(`🔍 Applying filter: ${filterType}${filterStartTime !== undefined ? ` from ${filterStartTime}s to ${filterEndTime !== undefined ? filterEndTime + 's' : 'end'}` : ''}`)
          command = this.applyFilter(command, filterType, { startTime: filterStartTime, endTime: filterEndTime })
          break
        }

        case 'generateTrailer':
          console.log(`🎞️ Generating trailer`)
          command = this.generateTrailer(command, instruction.params)
          break

        case 'addCaptions':
          console.log(`📄 Adding captions`)
          command = this.addCaptions(command, instruction.params)
          break

        case 'adjustIntensity':
          console.log(`🎚️ Adjusting effect intensity`)
          command = this.adjustEffectIntensity(command, instruction.params)
          break

        case 'adjustZoom':
          console.log(`🔍 Adjusting zoom`)
          command = this.adjustZoom(command, instruction.params)
          break

        case 'customText':
          console.log(`📝 Adding custom text with custom properties`)
          command = this.addCustomText(command, instruction.params)
          break

        case 'customSubtitle':
          // This operation is handled at API level and converted to addCaptions
          // Should not reach here, but if it does, treat as addCaptions with custom params
          console.log(`📄 customSubtitle converted to addCaptions at API level`)
          // Fall through to addCaptions case
          instruction.operation = 'addCaptions'
          // No break, fall through

        case 'adjustSpeed':
          console.log(`⚡ Adjusting video speed`)
          command = this.adjustSpeed(command, instruction.params)
          break

        case 'rotate':
          console.log(`🔄 Rotating video`)
          command = this.rotateVideo(command, instruction.params)
          break

        case 'crop':
          console.log(`✂️ Cropping video`)
          command = this.cropVideo(command, instruction.params)
          break

        case 'removeObject':
          console.log(`🗑️ Removing object from video`)
          command = this.removeObject(command, instruction.params)
          break

        default:
          console.warn(`⚠️ Unknown operation: ${instruction.operation}, copying video as-is`)
          console.warn(`⚠️ Available operations: trim, colorGrade, applyEffect, addText, addTransition, addMusic, applyBrandKit, removeClip, filter, generateTrailer, addCaptions, adjustIntensity, adjustZoom, customText, customSubtitle, adjustSpeed, rotate, crop, removeObject`)
          console.warn(`⚠️ Received instruction:`, JSON.stringify(instruction, null, 2))
          break
      }

      // Set output options based on media type
      if (isImage) {
        // For images, output as image format
        const ext = outputPath.match(/\.(\w+)$/)?.[1] || 'png'
        if (ext === 'jpg' || ext === 'jpeg') {
          command.outputOptions(['-q:v', '2']) // High quality JPEG
        } else {
          command.outputOptions(['-frames:v', '1']) // Single frame for PNG/GIF
        }
      } else {
        // For videos, use standard video encoding
        command.outputOptions(['-c:v libx264', '-preset medium', '-crf 23'])
      }
      
      // Use normalized absolute path for output
      // On Windows, use backslashes for file system but forward slashes for FFmpeg (FFmpeg accepts both)
      let finalOutputPath: string
      let finalOutputPathForFFmpeg: string  // Path for FFmpeg command (forward slashes)
      let finalOutputDir: string
      
      if (isVercelOrLinux()) {
        // On Vercel/Linux, paths are already correct
        finalOutputPath = normalizedOutputPath
        finalOutputPathForFFmpeg = normalizedOutputPath
        const lastSlash = normalizedOutputPath.lastIndexOf('/')
        finalOutputDir = lastSlash > 0 ? normalizedOutputPath.substring(0, lastSlash) : this.tempDir
      } else {
        // On Windows: use backslashes for file system operations
        finalOutputPath = path.resolve(normalizedOutputPath)
        // For FFmpeg on Windows, use backslashes (native format)
        // Forward slashes were causing "Invalid argument" errors
        // fluent-ffmpeg should handle backslashes correctly
        finalOutputPathForFFmpeg = finalOutputPath // Use native Windows path with backslashes
        finalOutputDir = path.dirname(finalOutputPath)
      }
      
      console.log(`📁 Final output path (FS): ${finalOutputPath}`)
      console.log(`📁 Final output path (FFmpeg): ${finalOutputPathForFFmpeg}`)
      console.log(`📁 Final output dir: ${finalOutputDir}`)
      
      // Double-check directory exists right before FFmpeg runs
      const finalOutputDirForFS = finalOutputDir
      
      console.log(`📁 Creating directory check - path: ${finalOutputDirForFS}`)
      console.log(`📁 Creating directory check - contains backslashes: ${finalOutputDirForFS.includes('\\')}`)
      
      if (!fs.existsSync(finalOutputDirForFS)) {
        console.log(`📁 Creating directory: ${finalOutputDirForFS}`)
        try {
          fs.mkdirSync(finalOutputDirForFS, { recursive: true })
          console.log(`✅ Created output directory: ${finalOutputDirForFS}`)
        } catch (mkdirErr: any) {
          console.error(`❌ mkdirSync failed in applyEdit:`, {
            message: mkdirErr?.message,
            code: mkdirErr?.code,
            path: mkdirErr?.path || finalOutputDirForFS,
            syscall: mkdirErr?.syscall,
          })
          throw mkdirErr
        }
      } else {
        console.log(`✅ Output directory already exists: ${finalOutputDirForFS}`)
      }
      
      // Remove output file if it exists (FFmpeg might have issues with existing files)
      if (fs.existsSync(finalOutputPath)) {
        try {
          fs.unlinkSync(finalOutputPath)
          console.log(`🗑️ Removed existing output file: ${finalOutputPath}`)
        } catch (unlinkError) {
          console.warn(`⚠️ Could not remove existing output file: ${unlinkError}`)
        }
      }
      
      // Ensure output directory is writable
      try {
        const testFile = isVercelOrLinux()
          ? `${finalOutputDirForFS}/.write_test_${Date.now()}`
          : path.join(finalOutputDirForFS, `.write_test_${Date.now()}`)
        fs.writeFileSync(testFile, 'test')
        fs.unlinkSync(testFile)
        console.log(`✅ Output directory is writable: ${finalOutputDirForFS}`)
      } catch (writeError) {
        console.error(`❌ Output directory is not writable: ${writeError}`)
        reject(new Error(`Cannot write to output directory: ${finalOutputDirForFS}`))
        return
      }
      
      // Use the determined output path for FFmpeg
      command
        .output(finalOutputPathForFFmpeg)
        .on('start', (commandLine) => {
          console.log('🚀 FFmpeg command:', commandLine)
          console.log(`📁 Output file path (FFmpeg): ${finalOutputPathForFFmpeg}`)
          console.log(`📁 Output file path (FileSystem): ${finalOutputPath}`)
          console.log(`📁 Output directory exists: ${fs.existsSync(finalOutputDirForFS)}`)
          console.log(`📁 Output file exists before FFmpeg: ${fs.existsSync(finalOutputPath)}`)
        })
        .on('progress', (progress) => {
          if (!isImage) {
            console.log(`⏳ Processing: ${Math.round(progress.percent || 0)}% done`)
          }
        })
        .on('end', () => {
          console.log(`✅ FFmpeg processing completed (${isImage ? 'image' : 'video'})`)
          // Verify output file exists using file system path (backslashes on Windows)
          if (!fs.existsSync(finalOutputPath)) {
            console.error(`❌ Output file not found at: ${finalOutputPath}`)
            reject(new Error(`Output file not found after FFmpeg processing: ${finalOutputPath}`))
            return
          }
          const stats = fs.statSync(finalOutputPath)
          if (stats.size === 0) {
            console.error(`❌ Output file is empty (0 bytes): ${finalOutputPath}`)
            reject(new Error(`Output file is empty after FFmpeg processing: ${finalOutputPath}`))
            return
          }
          console.log(`✅ Output file verified (${(stats.size / 1024 / 1024).toFixed(2)}MB): ${finalOutputPath}`)
          resolve()
        })
        .on('error', (err: any) => {
          console.error('❌ FFmpeg error:', err.message)
          console.error('❌ FFmpeg error details:', {
            message: err.message,
            code: err.code,
            signal: err.signal,
            killed: err.killed,
            spawnargs: err.spawnargs,
          })
          
          // Check if it's a "Cannot find ffmpeg" error
          if (err.message && (err.message.includes('Cannot find ffmpeg') || err.message.includes('ffmpeg not found') || err.message.includes('spawn ffmpeg'))) {
            console.error('❌ FFmpeg not found by fluent-ffmpeg')
            console.error('❌ Attempted to find FFmpeg in:')
            console.error('   - Common paths: /usr/bin/ffmpeg, /usr/local/bin/ffmpeg, /bin/ffmpeg')
            console.error('   - System PATH')
            
            // Try one more time to find and set FFmpeg path
            this.ensureFFmpegPath()
            
            // Log current FFmpeg path setting
            try {
              const ffmpegModule = ffmpeg as any
              console.error('❌ Current FFmpeg path setting:', ffmpegModule.ffmpegPath || 'not set (using PATH)')
            } catch {
              console.error('❌ Could not check FFmpeg path setting')
            }
            
            reject(new Error(`FFmpeg not found. Please ensure FFmpeg is installed on the server. Error: ${err.message}`))
          } else {
            reject(err)
          }
        })
        .run()
    })
  }

  /**
   * Helper function to apply time-based filtering
   * If startTime and endTime are provided, wraps the filter with enable expression
   */
  private applyTimeBasedFilter(
    command: ffmpeg.FfmpegCommand,
    filter: string,
    startTime?: number,
    endTime?: number
  ): ffmpeg.FfmpegCommand {
    if (startTime !== undefined && endTime !== undefined && endTime > startTime) {
      // Apply filter only between startTime and endTime
      const enabledFilter = `${filter}:enable='between(t,${startTime},${endTime})'`
      console.log(`⏰ Applying time-based filter: ${startTime}s to ${endTime}s`)
      return command.videoFilters(enabledFilter)
    } else if (startTime !== undefined) {
      // Apply filter from startTime onwards
      const enabledFilter = `${filter}:enable='gte(t,${startTime})'`
      console.log(`⏰ Applying time-based filter: from ${startTime}s onwards`)
      return command.videoFilters(enabledFilter)
    }
    // No time range, apply to entire video
    return command.videoFilters(filter)
  }

  private applyColorGrade(
    command: ffmpeg.FfmpegCommand,
    preset: string,
    params?: { startTime?: number; endTime?: number }
  ): ffmpeg.FfmpegCommand {
    const presets: { [key: string]: string } = {
      'warm': 'eq=gamma=1.1:saturation=1.1:brightness=0.05',
      'cool': 'eq=gamma=0.95:saturation=0.9:brightness=-0.05',
      'vintage': 'eq=contrast=1.2:saturation=0.8:brightness=0.1',
      'moody': 'eq=contrast=1.3:saturation=0.7:brightness=-0.1',
      'cinematic': 'eq=contrast=1.1:brightness=0.05:saturation=0.9',
      'teal-orange': 'eq=gamma=1.1:saturation=1.3',
      'noir': 'eq=contrast=1.5:saturation=0:brightness=-0.2',
      'sepia': 'eq=saturation=0.5,curves=preset=vintage',
      'dreamy': 'eq=gamma=1.05:brightness=0.05:saturation=0.95',
      'pastel': 'eq=saturation=0.6:brightness=0.1',
      'vibrant': 'eq=contrast=1.2:saturation=1.4:brightness=0.05',
      'muted': 'eq=contrast=1.1:saturation=0.7:brightness=-0.05',
      'cyberpunk': 'eq=contrast=1.4:saturation=1.5:brightness=0.2',
      'neon': 'eq=contrast=1.3:saturation=1.6:brightness=0.1',
      'golden hour': 'eq=gamma=1.15:saturation=1.2:brightness=0.1',
      'high contrast': 'eq=contrast=1.5:brightness=0.05:saturation=1.2',
      'washed film': 'eq=contrast=0.9:saturation=0.6:brightness=0.15',
      'studio tone': 'eq=contrast=1.2:brightness=0:saturation=1.0',
      'soft skin': 'eq=gamma=1.05:brightness=0.1:saturation=0.9',
      'shadow boost': 'eq=gamma=1.1:brightness=-0.1:contrast=1.2',
      'natural tone': 'eq=contrast=1.05:brightness=0:saturation=1.0',
      'bright punch': 'eq=contrast=1.3:brightness=0.1:saturation=1.3',
      'black & white': 'eq=saturation=0',
      'orange tint': 'eq=gamma=1.1:saturation=1.2',
      'monochrome': 'eq=saturation=0',
      'cinematic lut': 'eq=contrast=1.1:brightness=0.05:saturation=0.95',
      'sunset glow': 'eq=gamma=1.2:saturation=1.4:brightness=0.15',
    }

    const filter = presets[preset?.toLowerCase() || '']
    if (!filter) return command
    
    // Apply time-based filtering if startTime/endTime provided
    const startTime = params?.startTime
    const endTime = params?.endTime
    return this.applyTimeBasedFilter(command, filter, startTime, endTime)
  }

  private applyEffect(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { preset, intensity = 0.5, startTime, endTime } = params
    const presetName = preset?.toLowerCase()
    
    switch (presetName) {
      case 'blur':
        return this.applyTimeBasedFilter(command, `boxblur=${2 + intensity * 4}:1`, startTime, endTime)
      case 'glow':
        return this.applyTimeBasedFilter(command, 'curves=preset=strong_contrast', startTime, endTime)
      case 'vhs':
        return this.applyTimeBasedFilter(command, 'noise=alls=20:allf=t+u', startTime, endTime)
      case 'motion':
        return this.applyTimeBasedFilter(command, 'hue=h=45', startTime, endTime)
      case 'film grain':
        return this.applyTimeBasedFilter(command, 'noise=alls=10:allf=t', startTime, endTime)
      case 'lens flare':
        return this.applyTimeBasedFilter(command, 'eq=brightness=0.1:contrast=1.2', startTime, endTime)
      case 'bokeh':
        return this.applyTimeBasedFilter(command, 'boxblur=10:5', startTime, endTime)
      case 'light leak':
        return this.applyTimeBasedFilter(command, 'eq=brightness=0.15:saturation=1.2', startTime, endTime)
      case 'pixelate':
        return this.applyTimeBasedFilter(command, `scale=iw/10:ih/10,scale=iw*10:ih*10:flags=neighbor`, startTime, endTime)
      case 'distortion':
        return this.applyTimeBasedFilter(command, 'lenscorrection=k1=0.2', startTime, endTime)
      case 'chromatic aberration':
        return this.applyTimeBasedFilter(command, 'rgbashift=rh=2:gh=-2:bh=4', startTime, endTime)
      case 'shake':
        return this.applyTimeBasedFilter(command, 'crop=iw-20:ih-20:random(1)*40:random(1)*40', startTime, endTime)
      case 'sparkle':
        return this.applyTimeBasedFilter(command, 'eq=brightness=0.1:contrast=1.3', startTime, endTime)
      case 'shadow pulse':
        return this.applyTimeBasedFilter(command, 'vignette=PI/6', startTime, endTime)
      case 'dreamy glow':
        return this.applyTimeBasedFilter(command, 'boxblur=4:2,eq=brightness=0.1:saturation=1.2', startTime, endTime)
      case 'glitch flicker':
        return this.applyTimeBasedFilter(command, 'hue=s=300', startTime, endTime)
      case 'zoom-in pulse':
        return this.applyTimeBasedFilter(command, 'zoompan=z=1.1:d=125', startTime, endTime)
      case 'soft focus':
        return this.applyTimeBasedFilter(command, 'boxblur=3:1', startTime, endTime)
      case 'old film':
        return this.applyTimeBasedFilter(command, 'noise=alls=15:allf=t+u,hue=s=0.8', startTime, endTime)
      case 'dust overlay':
        return this.applyTimeBasedFilter(command, 'noise=alls=5:allf=t+u', startTime, endTime)
      case 'light rays':
        return this.applyTimeBasedFilter(command, 'eq=brightness=0.05:contrast=1.4', startTime, endTime)
      case 'mirror':
        // Mirror uses complexFilter, time-based filtering not easily supported
        command.complexFilter('[0:v]crop=iw/2:ih:0:0[v1];[v1][v1]hstack[v]')
        command.outputOptions('-map', '[v]')
        return command
      case 'tilt shift':
        return this.applyTimeBasedFilter(command, 'vignette=PI/4', startTime, endTime)
      case 'fisheye':
        return this.applyTimeBasedFilter(command, 'lenscorrection=k1=0.5', startTime, endTime)
      case 'bloom':
        return this.applyTimeBasedFilter(command, 'boxblur=8:3,eq=brightness=0.1', startTime, endTime)
      default:
        console.warn(`⚠️ Unknown effect preset: ${preset}, applying default`)
        return command
    }
  }

  private addTextOverlay(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { text, preset, position = 'bottom', fontSize, fontColor, backgroundColor, startTime, endTime } = params
    
    // If custom properties are provided, use them instead of preset
    if (fontSize || fontColor || backgroundColor) {
      return this.addCustomText(command, params)
    }
    
    // Get font path based on OS
    const fontPath = this.getFontPath()
    
    // Get position coordinates
    const positions: { [key: string]: string } = {
      'top': '(w-text_w)/2:50',
      'bottom': '(w-text_w)/2:(h-text_h-50)',
      'center': '(w-text_w)/2:(h-text_h)/2',
      'left': '50:(h-text_h)/2',
      'right': 'w-text_w-50:(h-text_h)/2',
      'top-left': '50:50',
      'top-right': 'w-text_w-50:50',
      'bottom-left': '50:(h-text_h-50)',
      'bottom-right': 'w-text_w-50:(h-text_h-50)',
    }
    const pos = positions[position] || positions['bottom']
    
    // Get preset-specific styling
    const styleConfig = this.getTextStyle(preset || 'subtitle', text || '')
    
    // Build drawtext filter parts
    const filterParts: string[] = []
    
    if (fontPath) {
      // Properly escape font path for Windows: replace backslashes with forward slashes
      // and escape the colon after the drive letter
      const escapedFontPath = fontPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\\\:')
      filterParts.push(`fontfile=${escapedFontPath}`)
    }
    
    // Escape text properly for FFmpeg filter (only special characters in text content)
    // Note: We don't escape colons in text as they would break the filter syntax
    const escapedText = styleConfig.text.replace(/['\\]/g, '\\$&').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/,/g, '\\,')
    filterParts.push(`text=${escapedText}`)
    filterParts.push(`fontcolor=${styleConfig.fontColor}`)
    filterParts.push(`fontsize=${styleConfig.fontSize}`)
    filterParts.push(`x=${pos.split(':')[0]}`)
    filterParts.push(`y=${pos.split(':')[1]}`)
    filterParts.push(`borderw=${styleConfig.borderWidth}`)
    filterParts.push(`bordercolor=${styleConfig.borderColor}`)
    
    // Add preset-specific effects
    if (styleConfig.shadow) {
      filterParts.push(`shadowcolor=${styleConfig.shadow.color}`)
      filterParts.push(`shadowx=${styleConfig.shadow.x}`)
      filterParts.push(`shadowy=${styleConfig.shadow.y}`)
    }
    
    if (styleConfig.box) {
      filterParts.push(`box=1`)
      filterParts.push(`boxcolor=${styleConfig.box.color}`)
      filterParts.push(`boxborderw=${styleConfig.box.borderWidth}`)
    }
    
    let drawtextFilter = `drawtext=${filterParts.join(':')}`
    
    // Apply time-based filtering if startTime/endTime provided
    if (startTime !== undefined && endTime !== undefined && endTime > startTime) {
      drawtextFilter = `${drawtextFilter}:enable='between(t,${startTime},${endTime})'`
      console.log(`⏰ Text will appear from ${startTime}s to ${endTime}s`)
    } else if (startTime !== undefined) {
      drawtextFilter = `${drawtextFilter}:enable='gte(t,${startTime})'`
      console.log(`⏰ Text will appear from ${startTime}s onwards`)
    }
    
    console.log(`📝 Applying text style "${preset}" with config:`, styleConfig)
    console.log(`📝 Drawtext filter: ${drawtextFilter}`)
    
    return command.videoFilters(drawtextFilter)
  }
  
  private getFontPath(): string {
    // Auto-detect system fonts based on platform
    if (process.platform === 'win32') {
      const windowsFonts = [
        'C:\\Windows\\Fonts\\arial.ttf',
        'C:\\Windows\\Fonts\\Arial.ttf',
        'C:\\Windows\\Fonts\\calibri.ttf',
        'C:\\Windows\\Fonts\\Calibri.ttf',
      ]
      for (const fontPath of windowsFonts) {
        if (fs.existsSync(fontPath)) {
          return fontPath
        }
      }
    } else if (process.platform === 'darwin') {
      // macOS fonts
      const macFonts = [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Arial.ttf',
      ]
      for (const fontPath of macFonts) {
        if (fs.existsSync(fontPath)) {
          return fontPath
        }
      }
    } else {
      // Linux fonts
      const linuxFonts = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/truetype/ttf-dejavu/DejaVuSans-Bold.ttf',
      ]
      for (const fontPath of linuxFonts) {
        if (fs.existsSync(fontPath)) {
          return fontPath
        }
      }
    }
    return '' // FFmpeg will use default font
  }
  
  private getTextStyle(preset: string, text: string): any {
    const presetName = preset.toLowerCase()
    const displayText = text || this.getDefaultTextForPreset(preset)
    
    const baseConfig = {
      text: displayText,
      fontSize: 48,
      fontColor: 'white',
      borderWidth: 2,
      borderColor: 'black',
      shadow: null as any,
      box: null as any,
    }
    
    switch (presetName) {
      case 'subtitle':
      case 'caption overlay':
        return {
          ...baseConfig,
          fontSize: 36,
          borderWidth: 3,
          shadow: { color: 'black@0.8', x: 2, y: 2 }
        }
      
      case 'minimal':
        return {
          ...baseConfig,
          fontSize: 40,
          fontColor: 'white@0.9',
          borderWidth: 0
        }
      
      case 'bold':
        return {
          ...baseConfig,
          fontSize: 56,
          borderWidth: 3,
          shadow: { color: 'black@0.9', x: 3, y: 3 }
        }
      
      case 'cinematic':
        return {
          ...baseConfig,
          fontSize: 52,
          fontColor: 'yellow',
          borderWidth: 2,
          shadow: { color: 'black@1.0', x: 0, y: 4 }
        }
      
      case 'retro':
        return {
          ...baseConfig,
          fontSize: 44,
          fontColor: 'cyan',
          borderWidth: 2,
          shadow: { color: 'black@0.9', x: 2, y: 2 }
        }
      
      case 'handwritten':
        return {
          ...baseConfig,
          fontSize: 42,
          fontColor: 'black',
          borderWidth: 0,
          shadow: { color: 'white@0.5', x: 1, y: 1 }
        }
      
      case 'neon glow':
        return {
          ...baseConfig,
          fontSize: 54,
          fontColor: 'cyan',
          borderWidth: 4,
          borderColor: 'cyan',
          shadow: { color: 'cyan@0.8', x: 0, y: 0 }
        }
      
      case 'typewriter':
        return {
          ...baseConfig,
          fontSize: 38,
          fontColor: 'lime',
          borderWidth: 2,
          box: { color: 'black@0.7', borderWidth: 5 }
        }
      
      case 'glitch':
        return {
          ...baseConfig,
          fontSize: 50,
          fontColor: 'magenta',
          borderWidth: 3,
          borderColor: 'yellow',
          shadow: { color: 'cyan@0.7', x: -2, y: -2 }
        }
      
      case 'lower third':
        return {
          ...baseConfig,
          fontSize: 42,
          borderWidth: 3,
          box: { color: 'black@0.8', borderWidth: 8 }
        }
      
      case 'gradient':
        return {
          ...baseConfig,
          fontSize: 48,
          borderWidth: 2,
          shadow: { color: 'black@0.9', x: 2, y: 2 }
        }
      
      case 'fade-in title':
        return {
          ...baseConfig,
          fontSize: 58,
          borderWidth: 2,
          shadow: { color: 'black@1.0', x: 0, y: 4 }
        }
      
      case '3d text':
        return {
          ...baseConfig,
          fontSize: 54,
          borderWidth: 5,
          borderColor: 'black',
          shadow: { color: 'black@0.5', x: -3, y: -3 }
        }
      
      case 'shadowed':
        return {
          ...baseConfig,
          fontSize: 48,
          borderWidth: 0,
          shadow: { color: 'black@0.8', x: 5, y: 5 }
        }
      
      case 'animated quote':
        return {
          ...baseConfig,
          fontSize: 40,
          fontColor: 'white',
          borderWidth: 2,
          box: { color: 'white@0.2', borderWidth: 3 }
        }
      
      case 'headline':
        return {
          ...baseConfig,
          fontSize: 60,
          borderWidth: 0,
          shadow: { color: 'black@1.0', x: 0, y: 6 }
        }
      
      case 'modern sans':
        return {
          ...baseConfig,
          fontSize: 46,
          borderWidth: 0
        }
      
      case 'serif classic':
        return {
          ...baseConfig,
          fontSize: 44,
          fontColor: 'wheat',
          borderWidth: 1,
          shadow: { color: 'black@0.6', x: 2, y: 2 }
        }
      
      case 'story caption':
        return {
          ...baseConfig,
          fontSize: 32,
          fontColor: 'white',
          borderWidth: 0,
          box: { color: 'black@0.5', borderWidth: 10 }
        }
      
      case 'kinetic title':
        return {
          ...baseConfig,
          fontSize: 56,
          borderWidth: 3,
          shadow: { color: 'black@0.9', x: 0, y: 3 }
        }
      
      case 'news banner':
        return {
          ...baseConfig,
          fontSize: 44,
          fontColor: 'yellow',
          borderWidth: 2,
          box: { color: 'red@0.9', borderWidth: 5 }
        }
      
      case 'outline text':
        return {
          ...baseConfig,
          fontSize: 52,
          borderWidth: 5,
          borderColor: 'white'
        }
      
      case 'glow edge':
        return {
          ...baseConfig,
          fontSize: 50,
          fontColor: 'white',
          borderWidth: 6,
          borderColor: 'white',
          shadow: { color: 'white@0.3', x: 0, y: 0 }
        }
      
      case 'floating text':
        return {
          ...baseConfig,
          fontSize: 40,
          borderWidth: 0,
          shadow: { color: 'black@0.6', x: 2, y: 2 }
        }
      
      default:
        return baseConfig
    }
  }
  
  private getDefaultTextForPreset(preset: string): string {
    const presetName = preset.toLowerCase()
    const defaults: { [key: string]: string } = {
      'subtitle': 'Your Subtitle',
      'caption overlay': 'Caption',
      'minimal': 'Minimal',
      'bold': 'BOLD',
      'cinematic': 'CINEMATIC',
      'retro': 'RETRO',
      'handwritten': 'Handwritten',
      'neon glow': 'NEON',
      'typewriter': 'Typewriter',
      'glitch': 'GLITCH',
      'lower third': 'Lower Third',
      'gradient': 'Gradient',
      'fade-in title': 'Title',
      '3d text': '3D TEXT',
      'shadowed': 'Shadowed',
      'animated quote': 'Quote',
      'headline': 'HEADLINE',
      'modern sans': 'Modern',
      'serif classic': 'Classic',
      'story caption': 'Story',
      'kinetic title': 'KINETIC',
      'news banner': 'NEWS',
      'outline text': 'OUTLINE',
      'glow edge': 'GLOW',
      'floating text': 'Floating',
    }
    return defaults[presetName] || 'Text'
  }

  private addMusicTrack(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    // Music would be added as an additional input
    // This is placeholder - would need audio file URL
    const { volume = 0.3 } = params
    return command.audioFilters(`volume=${volume}`)
  }

  private applyBrandKit(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { logoUrl, watermark, colors, fonts } = params
    
    // Apply logo overlay if provided
    if (logoUrl) {
      command.complexFilter([
        `[0:v][1:v]overlay=W-w-20:20[out]`
      ])
      command.input(logoUrl)
    }
    
    // Apply watermark if provided
    if (watermark) {
      command.complexFilter([
        logoUrl 
          ? `[out][2:v]overlay=W-w-20:H-h-20:format=auto[final]`
          : `[0:v][1:v]overlay=W-w-20:H-h-20:format=auto[final]`
      ])
      if (!logoUrl) command.input(watermark)
    }
    
    // Apply color grading if brand colors specified
    if (colors && colors.length > 0) {
      // Use first brand color as a tint
      const primaryColor = colors[0]
      // Convert hex to RGB for color grading
      const rgb = this.hexToRgb(primaryColor)
      if (rgb) {
        command.videoFilters(`colorbalance=rs=${rgb.r/255}:gs=${rgb.g/255}:bs=${rgb.b/255}`)
      }
    }
    
    return command
  }
  
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  private removeClipSegment(
    command: ffmpeg.FfmpegCommand,
    startTime: number,
    endTime: number
  ): ffmpeg.FfmpegCommand {
    // This would require complex filtering or multiple input handling
    // Simplified version
    return command
  }

  private applyFilter(
    command: ffmpeg.FfmpegCommand,
    type: string,
    params?: { startTime?: number; endTime?: number; value?: number }
  ): ffmpeg.FfmpegCommand {
    const { startTime, endTime, value } = params || {}
    let filter: string
    
    switch (type.toLowerCase()) {
      case 'blur':
        filter = 'boxblur=2:1'
        break
      case 'sharpen':
        filter = 'unsharp=5:5:1.0:5:5:0.0'
        break
      case 'grayscale':
        filter = 'hue=s=0'
        break
      case 'saturation':
        // value is multiplier: 1.0 = normal, >1.0 = increase, <1.0 = decrease
        const satValue = value !== undefined ? value : 1.0
        filter = `eq=saturation=${satValue}`
        break
      case 'noise':
      case 'noise reduction':
        // value is noise strength (0-100), default to 20
        const noiseStrength = value !== undefined ? Math.max(0, Math.min(100, value)) : 20
        filter = `noise=alls=${noiseStrength}:allf=t+u`
        break
      default:
        return command
    }
    
    return this.applyTimeBasedFilter(command, filter, startTime, endTime)
  }

  private applyTransition(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { type = 'fade', duration = 1, preset } = params
    const transitionType = preset || type
    const dur = Math.max(0.5, duration)
    
    switch (transitionType?.toLowerCase()) {
      case 'fade':
        return command.videoFilters(`fade=t=in:st=0:d=${dur}`)
      case 'slide':
        return command.videoFilters(`crop=iw*(t/${dur}):ih:0:0`)
      case 'wipe':
        return command.videoFilters(`crop=iw:ih*(t/${dur}):0:0`)
      case 'zoom':
        return command.videoFilters(`zoompan=z='if(lte(zoom,1.0),1.5,max(1.001,zoom-0.0015))':d=125`)
      case 'cross dissolve':
        return command.videoFilters(`fade=t=in:st=0:d=${dur},fade=t=out:st=${dur}:d=${dur}`)
      case 'blur in/out':
        return command.videoFilters(`boxblur=8:3,fade=t=in:st=0:d=${dur}`)
      case 'spin':
        return command.videoFilters(`rotate=PI*t/${dur}`)
      case 'morph cut':
        return command.videoFilters(`fade=t=in:st=0:d=${dur * 0.5}`)
      case 'split reveal':
        return command.videoFilters(`crop=iw/2:ih:(iw*t/${dur}):0`)
      case 'flash':
        return command.videoFilters(`eq=brightness=1.5*sin(PI*t/${dur})`)
      case 'zoom blur':
        return command.videoFilters(`boxblur=4:1,zoompan=z=1.1:d=125`)
      case 'cube rotate':
        return command.videoFilters(`rotate=PI*0.5*t/${dur}`)
      case '3d flip':
        return command.videoFilters(`perspective=`)
      case 'warp':
        return command.videoFilters(`lenscorrection=k1=-0.1*t/${dur}`)
      case 'ripple':
        return command.videoFilters(`waveform=`)
      case 'glitch transition':
        return command.videoFilters(`hue=s=300,fade=t=in:st=0:d=${dur}`)
      case 'luma fade':
        return command.videoFilters(`fade=t=in:st=0:d=${dur}:alpha=1`)
      case 'light sweep':
        return command.videoFilters(`eq=brightness=0.3:t=${dur}`)
      case 'stretch pull':
        return command.videoFilters(`scale=iw*(1+0.5*t/${dur}):ih`)
      case 'film roll':
        return command.videoFilters(`vignette=PI*2*t/${dur}`)
      case 'page turn':
        return command.videoFilters(`rotate=PI*0.5:ow=iw:oh=ih`)
      case 'diagonal wipe':
        return command.videoFilters(`crop=iw:ih*sin(PI*t/${dur}):0:0`)
      case 'motion blur transition':
        return command.videoFilters(`boxblur=10:5,fade=t=in:st=0:d=${dur}`)
      case 'cinematic cut':
        return command.videoFilters(`fade=t=in:st=0:d=${dur * 0.3}`)
      default:
        console.warn(`⚠️ Unknown transition preset: ${preset}, applying fade`)
        return command.videoFilters(`fade=t=in:st=0:d=${dur}`)
    }
  }

  private generateTrailer(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { duration = 20, keyMoments = [] } = params
    
    // For trailer, we'd typically trim to specific moments
    // This is simplified - full implementation would handle multiple clips
    if (duration && keyMoments.length > 0) {
      // Use first key moment as starting point
      const start = keyMoments[0]?.start || 0
      command.seekInput(start).duration(duration)
    }
    
    // Apply cinematic effects
    command.videoFilters('eq=contrast=1.2:saturation=1.1')
    
    return command
  }

  private addCaptions(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { captions = [], style = 'Glow' } = params
    
    if (!captions || captions.length === 0) {
      console.warn('⚠️ No captions provided, skipping caption generation')
      return command
    }

    console.log('📄 Adding captions using SRT subtitle file')

    // Get custom subtitle properties
    const subtitleColor = params.subtitleColor || params.color || 'white'
    const subtitleSize = params.subtitleSize || params.size || 36
    const subtitlePosition = params.subtitlePosition || params.position || 'bottom'
    const backgroundColor = params.backgroundColor || params.bgColor

    // Generate ASS file (Advanced SubStation Alpha) with embedded styling
    // ASS format supports styling natively, avoiding force_style issues
    const assContent = this.generateASS(captions, {
      color: subtitleColor,
      size: subtitleSize,
      position: subtitlePosition,
      style: style,
      backgroundColor: backgroundColor,
    })
    
    // Ensure temp directory exists
    this.ensureTempDir()
    
    // Save ASS file to temp directory - use forward slashes on Vercel/Linux
    const subtitleFilePath = isVercelOrLinux()
      ? `${this.tempDir}/subtitles_${Date.now()}.ass`
      : path.join(this.tempDir, `subtitles_${Date.now()}.ass`)
    fs.writeFileSync(subtitleFilePath, assContent, 'utf-8')
    console.log(`📝 Generated ASS file: ${subtitleFilePath}`)

    // Verify subtitle file exists
    if (!fs.existsSync(subtitleFilePath)) {
      throw new Error(`Subtitle file not found: ${subtitleFilePath}`)
    }
    
    // Use absolute path for subtitle file (required on Windows)
    // FFmpeg subtitles filter needs absolute path with proper escaping
    const absolutePath = path.resolve(subtitleFilePath)
    
    // FFmpeg on Windows works best with forward slashes in filter paths
    // Even on Windows, use forward slashes for consistency with input path
    const normalizedPath = absolutePath.replace(/\\/g, '/')
    // Escape single quotes in the path for the filter
    const escapedPath = normalizedPath.replace(/'/g, "\\'")
    
    // Use absolute path with single quotes (FFmpeg standard)
    const subtitleFilter = `subtitles='${escapedPath}'`
    
    console.log(`🎬 Using subtitles filter: ${subtitleFilter}`)
    console.log(`📁 ASS file absolute path: ${absolutePath}`)
    console.log(`📁 Normalized path (forward slashes): ${normalizedPath}`)
    console.log(`📁 Escaped path for filter: ${escapedPath}`)
    
    // Apply subtitle filter
    command.videoFilters(subtitleFilter)

    return command
  }

  private generateSRT(captions: any[]): string {
    let srtContent = ''
    
    captions.forEach((cap, index) => {
      const startTime = cap.start || 0
      const endTime = cap.end || startTime + 3
      const text = (cap.text || '')
        .replace(/\*\*/g, '') // Remove markdown
        .replace(/\*/g, '')
        .trim()
      
      // Convert seconds to SRT time format (HH:MM:SS,mmm)
      const startTimeStr = this.secondsToSRTTime(startTime)
      const endTimeStr = this.secondsToSRTTime(endTime)
      
      srtContent += `${index + 1}\n`
      srtContent += `${startTimeStr} --> ${endTimeStr}\n`
      srtContent += `${text}\n\n`
    })
    
    return srtContent
  }

  private generateASS(
    captions: any[],
    styleOptions: {
      color?: string
      size?: string | number
      position?: string
      style?: string
      backgroundColor?: string
    }
  ): string {
    const { color = 'white', size = 36, position = 'bottom', style = 'Glow', backgroundColor } = styleOptions
    
    // ASS file header with styling
    let assContent = '[Script Info]\n'
    assContent += 'Title: Generated Subtitles\n'
    assContent += 'ScriptType: v4.00+\n\n'
    
    assContent += '[V4+ Styles]\n'
    assContent += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
    
    // Build style definition
    const fontSize = this.parseFontSize(size)
    const colorHex = this.colorToASSFormat(color)
    const bgColorHex = backgroundColor ? this.colorToASSFormat(backgroundColor) : '&H80000000&'
    
    // Alignment: 2=bottom center, 8=top center, 5=center
    let alignment = '2'
    if (position.toLowerCase() === 'top') {
      alignment = '8'
    } else if (position.toLowerCase() === 'center') {
      alignment = '5'
    }
    
    const bold = style?.toLowerCase() === 'bold' ? '1' : '0'
    const outline = style?.toLowerCase() === 'glow' ? '4' : style?.toLowerCase() === 'bold' ? '2' : '1'
    const shadow = style?.toLowerCase() === 'glow' ? '2' : '0'
    
    // Style definition
    assContent += `Style: Default,Arial,${fontSize},${colorHex},${colorHex},${bgColorHex},${bgColorHex},${bold},0,0,0,100,100,0,0,${backgroundColor ? '3' : '1'},${outline},${shadow},${alignment},10,10,30,1\n\n`
    
    assContent += '[Events]\n'
    assContent += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    
    // Add dialogue events (subtitles)
    captions.forEach((cap) => {
      const startTime = cap.start || 0
      const endTime = cap.end || startTime + 3
      const text = (cap.text || '')
        .replace(/\*\*/g, '') // Remove markdown
        .replace(/\*/g, '')
        .trim()
      
      // Escape commas and special characters for ASS format
      const escapedText = text.replace(/,/g, '\\,').replace(/\n/g, '\\N')
      
      // Convert seconds to ASS time format (H:MM:SS.cc)
      const startTimeStr = this.secondsToASSTime(startTime)
      const endTimeStr = this.secondsToASSTime(endTime)
      
      assContent += `Dialogue: 0,${startTimeStr},${endTimeStr},Default,,0,0,0,,${escapedText}\n`
    })
    
    return assContent
  }

  private secondsToASSTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const centis = Math.floor((seconds % 1) * 100)
    
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  }

  private secondsToSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const millis = Math.floor((seconds % 1) * 1000)
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`
  }

  private colorToASSFormat(color: string): string {
    // Convert color name/hex to ASS format: &HBBGGRR& (BGR in hex)
    // Note: & characters will be escaped in the filter string
    const colorMap: { [key: string]: string } = {
      'white': '&H00FFFFFF&',
      'black': '&H00000000&',
      'red': '&H000000FF&',
      'blue': '&H00FF0000&',
      'green': '&H0000FF00&',
      'yellow': '&H0000FFFF&',
      'cyan': '&H00FFFF00&',
      'magenta': '&H00FF00FF&',
    }
    
    if (colorMap[color.toLowerCase()]) {
      return colorMap[color.toLowerCase()]
    }
    
    // Handle hex colors (#RRGGBB)
    if (color.startsWith('#')) {
      const hex = color.substring(1)
      if (hex.length === 6) {
        // Convert RRGGBB to BGR for ASS
        const r = hex.substring(0, 2)
        const g = hex.substring(2, 4)
        const b = hex.substring(4, 6)
        return `&H00${b}${g}${r}&`
      }
    }
    
    // Default to white
    return '&H00FFFFFF&'
  }

  async uploadVideo(filePath: string, folder = 'vedit/processed', isImage: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
      // Normalize file path for cross-platform compatibility
      const normalizedPath = path.resolve(filePath)
      
      console.log(`☁️ Starting Cloudinary upload: ${normalizedPath}`)
      console.log(`☁️ Target folder: ${folder}`)
      console.log(`☁️ Resource type: ${isImage ? 'image' : 'video'}`)
      
      // Verify file exists before upload
      if (!fs.existsSync(normalizedPath)) {
        reject(new Error(`File not found for upload: ${normalizedPath}`))
        return
      }
      
      const stats = fs.statSync(normalizedPath)
      if (stats.size === 0) {
        reject(new Error(`File is empty (0 bytes): ${normalizedPath}`))
        return
      }
      
      console.log(`☁️ File size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`)
      
      const resourceType = isImage ? 'image' : 'video'
      const uploadOptions: any = {
        resource_type: resourceType,
        folder,
      }
      
      if (!isImage) {
        uploadOptions.format = 'mp4'
        uploadOptions.eager = [{ format: 'mp4', quality: 'auto' }]
      } else {
        // For images, preserve original format or convert to PNG
        const ext = normalizedPath.match(/\.(\w+)$/)?.[1] || 'png'
        uploadOptions.format = ext
      }
      
      cloudinary.uploader.upload(
        normalizedPath,
        uploadOptions,
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error)
            reject(error)
          } else {
            console.log('☁️ Cloudinary upload success:', result!.secure_url)
            resolve(result!.secure_url)
          }
        }
      )
    })
  }

  async exportVideo(
    videoUrl: string,
    format = 'mp4',
    quality = 'high'
  ): Promise<string> {
    const inputPath = await this.downloadVideo(videoUrl)
    const outputPath = isVercelOrLinux()
      ? `${this.tempDir}/export_${Date.now()}.${format}`
      : path.join(this.tempDir, `export_${Date.now()}.${format}`)

    try {
      const crf = quality === 'high' ? 18 : quality === 'medium' ? 23 : 28

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            `-c:v libx264`,
            `-preset slow`,
            `-crf ${crf}`,
            '-c:a aac',
            '-b:a 192k',
            '-movflags +faststart', // For web streaming
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      const exportedUrl = await this.uploadVideo(outputPath, 'vedit/exports')
      return exportedUrl
    } finally {
      this.cleanup(inputPath)
      this.cleanup(outputPath)
    }
  }

  private cleanup(filePath: string) {
    if (fs.existsSync(filePath)) {
      unlink(filePath).catch(console.error)
    }
  }

  private adjustEffectIntensity(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { effectPreset, newIntensity, direction } = params
    const intensity = newIntensity || (direction === 'more' ? 0.8 : direction === 'less' ? 0.3 : 0.5)
    
    console.log(`🎚️ Adjusting ${effectPreset || 'effect'} intensity to ${intensity}`)
    
    // Re-apply the effect with new intensity
    return this.applyEffect(command, { preset: effectPreset, intensity })
  }

  private adjustZoom(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { newZoom, direction } = params
    const zoom = newZoom || (direction === 'in' ? 1.5 : direction === 'out' ? 0.8 : 1.0)
    
    console.log(`🔍 Adjusting zoom to ${zoom}x`)
    
    // Apply zoom using crop and scale
    const cropWidth = `iw/${zoom}`
    const cropHeight = `ih/${zoom}`
    const cropX = `(iw-${cropWidth})/2`
    const cropY = `(ih-${cropHeight})/2`
    
    return command.videoFilters(`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},scale=iw:ih`)
  }

  private addCustomText(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const {
      text = '',
      fontSize,
      fontColor,
      backgroundColor,
      position = 'bottom',
      textStyle,
      preset,
      subtitleColor,
      subtitleSize,
      subtitlePosition,
      isSubtitle = false
    } = params

    const fontPath = this.getFontPath()
    
    // Determine actual values - use subtitle params if provided, otherwise text params
    const finalFontSize = this.parseFontSize(isSubtitle ? subtitleSize : fontSize)
    const finalFontColor = (isSubtitle ? subtitleColor : fontColor) || 'white'
    const finalPosition = (isSubtitle ? subtitlePosition : position) || 'bottom'
    
    // Determine text content - if empty, use preset/style name or default
    let finalText = text
    if (!finalText || finalText.trim() === '') {
      // If modifying existing text by style name, use the style name
      if (textStyle) {
        finalText = textStyle
      } else if (preset) {
        finalText = preset
      } else {
        finalText = 'Text'
      }
    }
    
    // Get position coordinates
    const positions: { [key: string]: string } = {
      'top': '(w-text_w)/2:50',
      'bottom': '(w-text_w)/2:(h-text_h-50)',
      'center': '(w-text_w)/2:(h-text_h)/2',
      'left': '50:(h-text_h)/2',
      'right': 'w-text_w-50:(h-text_h)/2',
      'top-left': '50:50',
      'top-right': 'w-text_w-50:50',
      'bottom-left': '50:(h-text_h-50)',
      'bottom-right': 'w-text_w-50:(h-text_h-50)',
    }
    const pos = positions[finalPosition] || positions['bottom']
    
    const filterParts: string[] = []
    
    if (fontPath) {
      const escapedFontPath = fontPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\\\:')
      filterParts.push(`fontfile=${escapedFontPath}`)
    }
    
    // Escape text
    const escapedText = finalText.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/=/g, '\\=').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/,/g, '\\,')
    filterParts.push(`text='${escapedText}'`)
    filterParts.push(`fontcolor=${this.parseColor(finalFontColor)}`)
    filterParts.push(`fontsize=${finalFontSize}`)
    filterParts.push(`x=${pos.split(':')[0]}`)
    filterParts.push(`y=${pos.split(':')[1]}`)
    
    // Add background if specified
    if (backgroundColor && backgroundColor !== 'transparent') {
      filterParts.push(`box=1`)
      filterParts.push(`boxcolor=${this.parseColor(backgroundColor)}@0.8`)
      filterParts.push(`boxborderw=10`)
    } else {
      // Add shadow for visibility
      filterParts.push(`shadowcolor=black@0.8`)
      filterParts.push(`shadowx=2`)
      filterParts.push(`shadowy=2`)
    }
    
    const drawtextFilter = `drawtext=${filterParts.join(':')}`
    console.log(`📝 Custom text filter: ${drawtextFilter}`)
    
    return command.videoFilters(drawtextFilter)
  }

  private parseFontSize(size: any): number {
    if (!size) return 36
    if (typeof size === 'number') return Math.max(12, Math.min(120, size))
    if (typeof size === 'string') {
      const sizeMap: { [key: string]: number } = {
        'small': 24,
        'medium': 36,
        'large': 48,
        'xlarge': 60,
      }
      return sizeMap[size.toLowerCase()] || parseInt(size) || 36
    }
    return 36
  }

  private parseColor(color: string): string {
    // Return color as-is if it's already valid, or convert common colors
    const colorMap: { [key: string]: string } = {
      'white': 'white',
      'red': 'red',
      'blue': 'blue',
      'yellow': 'yellow',
      'green': 'green',
      'black': 'black',
      'cyan': 'cyan',
      'magenta': 'magenta',
      'orange': 'orange',
      'pink': 'pink',
      'purple': 'purple',
    }
    // If it's a hex code or already valid, return as-is
    if (color.startsWith('#') || color.includes('@')) return color
    return colorMap[color.toLowerCase()] || color || 'white'
  }

  private adjustSpeed(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { speed = 1.0 } = params
    console.log(`⚡ Setting video speed to ${speed}x`)
    
    // Adjust video and audio speed
    command
      .videoFilters(`setpts=PTS/${speed}`)
      .audioFilters(`atempo=${speed}`)
    
    return command
  }

  private rotateVideo(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { rotation = 0 } = params
    const radians = (rotation * Math.PI) / 180
    console.log(`🔄 Rotating video ${rotation} degrees`)
    
    // Use transpose for common rotations, or rotate filter for custom angles
    if (rotation === 90 || rotation === -270) {
      return command.videoFilters('transpose=1')
    } else if (rotation === -90 || rotation === 270) {
      return command.videoFilters('transpose=2')
    } else if (rotation === 180 || rotation === -180) {
      return command.videoFilters('transpose=1,transpose=1')
    } else {
      // Custom rotation
      return command.videoFilters(`rotate=${radians}:fillcolor=black@0`)
    }
  }

  private cropVideo(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { x = 0, y = 0, width = 100, height = 100 } = params
    console.log(`✂️ Cropping video: x=${x}%, y=${y}%, width=${width}%, height=${height}%`)
    
    // Convert percentages to pixel values
    const cropX = typeof x === 'number' && x <= 1 ? `iw*${x}` : `iw*${x/100}`
    const cropY = typeof y === 'number' && y <= 1 ? `ih*${y}` : `ih*${y/100}`
    const cropW = typeof width === 'number' && width <= 1 ? `iw*${width}` : `iw*${width/100}`
    const cropH = typeof height === 'number' && height <= 1 ? `ih*${height}` : `ih*${height/100}`
    
    return command.videoFilters(`crop=${cropW}:${cropH}:${cropX}:${cropY}`)
  }

  private removeObject(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { region = 'center', method = 'blur' } = params
    console.log(`🗑️ Removing object from ${region} using ${method} method`)
    
    // Get video dimensions (approximate)
    // This is a simplified implementation - full object removal would require ML
    switch (method) {
      case 'blur':
        // Blur the specified region using complex filter with crop, blur, and overlay
        const regionCoords = this.getRegionCoordinates(region)
        const overlayCoords = this.getOverlayCoordinates(region)
        // Use complex filter: crop region -> blur -> overlay back
        command.complexFilter([
          // Crop the region to blur
          `[0:v]crop=${regionCoords}[region]`,
          // Blur the region
          `[region]boxblur=20:1[blurred]`,
          // Overlay blurred region back onto original at correct position
          `[0:v][blurred]overlay=${overlayCoords}[out]`
        ])
        command.outputOptions('-map', '[out]')
        return command
      case 'crop':
        // Crop to hide the region
        const cropRegion = this.getCropCoordinates(region)
        return command.videoFilters(`crop=${cropRegion}`)
      case 'black':
        // Black out the region using drawbox
        const blackCoords = this.getDrawboxCoordinates(region)
        return command.videoFilters(`drawbox=${blackCoords}:color=black@1.0:t=fill`)
      default:
        // Default to blur entire video
        return command.videoFilters('boxblur=10:1')
    }
  }

  private getRegionCoordinates(region: string): string {
    // Crop coordinates for the region (w:h:x:y format)
    const regions: { [key: string]: string } = {
      'left': 'iw/3:ih:0:0',
      'right': 'iw/3:ih:iw*2/3:0',
      'top': 'iw:ih/3:0:0',
      'bottom': 'iw:ih/3:0:ih*2/3',
      'center': 'iw/2:ih/2:iw/4:ih/4',
    }
    return regions[region] || regions['center']
  }

  private getOverlayCoordinates(region: string): string {
    // Overlay coordinates (x:y format)
    const overlays: { [key: string]: string } = {
      'left': '0:0',
      'right': 'iw*2/3:0',
      'top': '0:0',
      'bottom': '0:ih*2/3',
      'center': 'iw/4:ih/4',
    }
    return overlays[region] || overlays['center']
  }

  private getDrawboxCoordinates(region: string): string {
    // Drawbox coordinates (x:y:w:h format)
    const boxes: { [key: string]: string } = {
      'left': '0:0:iw/3:ih',
      'right': 'iw*2/3:0:iw/3:ih',
      'top': '0:0:iw:ih/3',
      'bottom': '0:ih*2/3:iw:ih/3',
      'center': 'iw/4:ih/4:iw/2:ih/2',
    }
    return boxes[region] || boxes['center']
  }

  private getCropCoordinates(region: string): string {
    // Crop coordinates to remove region
    const crops: { [key: string]: string } = {
      'left': 'iw*2/3:ih:iw/3:0',
      'right': 'iw*2/3:ih:0:0',
      'top': 'iw:ih*2/3:0:ih/3',
      'bottom': 'iw:ih*2/3:0:0',
      'center': 'iw*3/4:ih*3/4:iw/8:ih/8',
    }
    return crops[region] || crops['center']
  }

  /**
   * Merge multiple video clips into a single video
   * @param clipUrls Array of video URLs to merge
   * @returns URL of the merged video
   */
  async mergeClips(clipUrls: string[]): Promise<string> {
    console.log(`🔗 Starting merge of ${clipUrls.length} clips...`)
    
    if (clipUrls.length < 2) {
      throw new Error('At least 2 clips are required for merging')
    }

    this.ensureTempDir()

    try {
      // Download all clips
      const inputPaths: string[] = []
      for (let i = 0; i < clipUrls.length; i++) {
        const inputPath = await this.downloadVideo(clipUrls[i])
        inputPaths.push(inputPath)
        console.log(`✅ Downloaded clip ${i + 1}/${clipUrls.length}: ${inputPath}`)
      }

      // Create concat file for FFmpeg - use forward slashes on Vercel/Linux
      const concatFilePath = isVercelOrLinux()
        ? `${this.tempDir}/concat_${Date.now()}.txt`
        : path.join(this.tempDir, `concat_${Date.now()}.txt`)
      const concatLines = inputPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
      await writeFile(concatFilePath, concatLines)
      console.log(`📝 Created concat file: ${concatFilePath}`)

      // Output path for merged video - use forward slashes on Vercel/Linux
      const outputPath = isVercelOrLinux()
        ? `${this.tempDir}/merged_${Date.now()}.mp4`
        : path.join(this.tempDir, `merged_${Date.now()}.mp4`)
      const normalizedOutputPath = isVercelOrLinux()
        ? outputPath
        : path.resolve(outputPath)
      
      // Ensure output directory exists - use tempDir directly on Vercel
      const outputDir = isVercelOrLinux()
        ? this.tempDir
        : path.dirname(normalizedOutputPath)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // Ensure FFmpeg path is set before merging
      this.ensureFFmpegPath()
      
      // Merge clips using FFmpeg concat demuxer
      return new Promise((resolve, reject) => {
        ffmpeg()
          .input(concatFilePath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions([
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'medium',
            '-crf', '23',
            '-movflags', '+faststart'
          ])
          .output(normalizedOutputPath)
          .on('start', (commandLine: string) => {
            console.log(`🎬 FFmpeg merge command: ${commandLine}`)
          })
          .on('progress', (progress: any) => {
            if (progress.percent) {
              console.log(`⏳ Merge progress: ${Math.round(progress.percent)}%`)
            }
          })
          .on('end', async () => {
            console.log(`✅ Merge completed: ${normalizedOutputPath}`)
            
            // Verify output exists
            if (!fs.existsSync(normalizedOutputPath)) {
              reject(new Error('Merged video file not found'))
              return
            }

            try {
              // Upload merged video
              const mergedUrl = await this.uploadVideo(normalizedOutputPath, 'vedit/merged', false)
              console.log(`☁️ Merged video uploaded: ${mergedUrl}`)
              
              // Cleanup
              inputPaths.forEach(p => this.cleanup(path.resolve(p)))
              this.cleanup(concatFilePath)
              this.cleanup(normalizedOutputPath)
              
              resolve(mergedUrl)
            } catch (uploadError) {
              console.error('❌ Upload error:', uploadError)
              reject(uploadError)
            }
          })
          .on('error', (err: Error) => {
            console.error('❌ FFmpeg merge error:', err)
            reject(err)
          })
          .run()
      })
    } catch (error) {
      console.error('❌ Merge error:', error)
      throw error
    }
  }
}
