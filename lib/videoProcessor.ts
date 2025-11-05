import ffmpeg from 'fluent-ffmpeg'
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { promisify } from 'util'

const writeFile = promisify(fs.writeFile)
const unlink = promisify(fs.unlink)
const mkdir = promisify(fs.mkdir)

// Configure FFmpeg path if needed
// Auto-detect FFmpeg on Windows
if (process.platform === 'win32') {
  const possiblePaths = [
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',      // Chocolatey (recommended)
    'C:\\ffmpeg\\bin\\ffmpeg.exe',                       // Manual Gyan.dev installation
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',        // Program Files installation
    'C:\\tools\\ffmpeg\\bin\\ffmpeg.exe',                // Alternative manual install
  ]
  
  for (const ffmpegPath of possiblePaths) {
    if (fs.existsSync(ffmpegPath)) {
      ffmpeg.setFfmpegPath(ffmpegPath)
      console.log(`✅ FFmpeg found at: ${ffmpegPath}`)
      break
    }
  }
  
  // If no path found, FFmpeg will use system PATH
  // Verify with: where ffmpeg
}

interface VideoInstruction {
  operation: string
  params: any
}

export class VideoProcessor {
  private tempDir: string

  constructor() {
    // Use system temp directory - works on both Windows and Unix (Vercel/Linux)
    // On Vercel, os.tmpdir() returns '/tmp'
    // On Windows, it returns 'C:\Users\...\AppData\Local\Temp'
    const systemTempDir = os.tmpdir()
    this.tempDir = path.join(systemTempDir, 'vedit-temp')
    
    console.log(`📁 Using temp directory: ${this.tempDir}`)
    console.log(`📁 System temp: ${systemTempDir}`)
    console.log(`📁 Platform: ${process.platform}`)
    
    // Ensure temp directory exists
    this.ensureTempDir()
  }

  private ensureTempDir() {
    try {
      // Normalize path to handle Windows vs Unix differences
      const normalizedTempDir = path.resolve(this.tempDir)
      this.tempDir = normalizedTempDir
      
      if (!fs.existsSync(this.tempDir)) {
        // Use recursive: true to create parent directories if needed
        fs.mkdirSync(this.tempDir, { recursive: true })
        console.log(`✅ Created temp directory: ${this.tempDir}`)
      } else {
        console.log(`✅ Temp directory already exists: ${this.tempDir}`)
      }
      
      // Verify we can write to the directory
      const testFile = path.join(this.tempDir, `.write_test_${Date.now()}`)
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
      })
      
      // On Vercel, try /tmp directly if system temp fails
      if (process.env.VERCEL || process.platform !== 'win32') {
        console.log(`🔄 Trying /tmp directory as fallback...`)
        try {
          this.tempDir = '/tmp/vedit-temp'
          if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true })
          }
          console.log(`✅ Using fallback temp directory: ${this.tempDir}`)
        } catch (fallbackError) {
          console.error(`❌ Fallback temp directory also failed: ${fallbackError}`)
          throw new Error(`Cannot create temp directory. Original error: ${error?.message || error}`)
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
    
    // Ensure temp directory exists before processing
    this.ensureTempDir()
    
    const inputPath = await this.downloadVideo(mediaUrl)
    console.log(`📥 Downloaded ${isImage ? 'image' : 'video'} to: ${inputPath}`)
    
    // Determine output format - keep images as images, videos as videos
    const outputExt = isImage ? (inputPath.match(/\.(\w+)$/)?.[1] || 'png') : 'mp4'
    const outputPath = path.join(this.tempDir, `output_${Date.now()}.${outputExt}`)
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
      console.log(`📁 Created output directory: ${outputDir}`)
    }

    try {
      await this.applyEdit(inputPath, outputPath, instruction, isImage)
      // Use Windows path format for file system operations
      const normalizedOutputPath = path.resolve(outputPath)
      const normalizedOutputPathWindows = normalizedOutputPath.replace(/\//g, '\\')
      
      console.log(`✅ ${isImage ? 'Image' : 'Video'} editing completed: ${normalizedOutputPathWindows}`)
      
      // Verify output file exists before upload (use Windows path format)
      if (!fs.existsSync(normalizedOutputPathWindows)) {
        throw new Error(`Output file not found after processing: ${normalizedOutputPathWindows}`)
      }
      console.log(`✅ Verified output file exists: ${normalizedOutputPathWindows}`)
      
      const processedUrl = await this.uploadVideo(normalizedOutputPathWindows, 'vedit/processed', isImage)
      console.log(`☁️ Uploaded to Cloudinary: ${processedUrl}`)
      
      return processedUrl
    } catch (error) {
      console.error(`❌ ${isImage ? 'Image' : 'Video'} processing error:`, error)
      throw error
    } finally {
      // Cleanup temp files (use normalized paths)
      this.cleanup(path.resolve(inputPath))
      this.cleanup(path.resolve(outputPath))
    }
  }

  private async downloadVideo(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to download media')

    const buffer = Buffer.from(await response.arrayBuffer())
    // Detect file extension from URL or use default
    const extMatch = url.match(/\.(\w+)(\?|$)/)
    const ext = extMatch ? extMatch[1] : 'mp4'
    // Use absolute normalized path
    const inputPath = path.resolve(path.join(this.tempDir, `input_${Date.now()}.${ext}`))
    
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
      // Use absolute path and normalize it for Windows compatibility
      const outputDir = path.resolve(path.dirname(outputPath))
      const normalizedOutputPath = path.resolve(outputPath)
      
      console.log(`🔍 Verifying output directory: ${outputDir}`)
      console.log(`🔍 Normalized output path: ${normalizedOutputPath}`)
      
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
        const testFile = path.join(outputDir, '.write_test')
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
      const normalizedInputPath = path.resolve(inputPath)
      console.log(`📹 Normalized input path: ${normalizedInputPath}`)
      console.log(`📹 Normalized output path: ${normalizedOutputPath}`)
      
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

        case 'colorGrade':
          const { preset } = instruction.params
          console.log(`🎨 Applying color grade: ${preset || instruction.params.style}`)
          command = this.applyColorGrade(command, preset || instruction.params.style)
          break

        case 'applyEffect':
          console.log(`✨ Applying effect: ${instruction.params.preset}`)
          command = this.applyEffect(command, instruction.params)
          break

        case 'addText':
          console.log(`📝 Adding text: ${instruction.params.text}`)
          command = this.addTextOverlay(command, instruction.params)
          break

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

        case 'removeClip':
          const { startTime, endTime } = instruction.params
          console.log(`🗑️ Removing clip: ${startTime}s to ${endTime}s`)
          command = this.removeClipSegment(command, startTime, endTime)
          break

        case 'filter':
          const { type } = instruction.params
          console.log(`🔍 Applying filter: ${type}`)
          command = this.applyFilter(command, type)
          break

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
      // Ensure output file path is valid and directory exists
      const finalOutputPath = path.resolve(normalizedOutputPath).replace(/\\/g, '/')
      const finalOutputDir = path.dirname(finalOutputPath).replace(/\\/g, '/')
      
      // Double-check directory exists right before FFmpeg runs
      const finalOutputDirWindows = finalOutputDir.replace(/\//g, '\\')
      if (!fs.existsSync(finalOutputDirWindows)) {
        fs.mkdirSync(finalOutputDirWindows, { recursive: true })
        console.log(`📁 Re-created output directory: ${finalOutputDirWindows}`)
      }
      
      // Remove output file if it exists (FFmpeg might have issues with existing files)
      const finalOutputPathWindows = finalOutputPath.replace(/\//g, '\\')
      if (fs.existsSync(finalOutputPathWindows)) {
        try {
          fs.unlinkSync(finalOutputPathWindows)
          console.log(`🗑️ Removed existing output file: ${finalOutputPathWindows}`)
        } catch (unlinkError) {
          console.warn(`⚠️ Could not remove existing output file: ${unlinkError}`)
        }
      }
      
      // Ensure output directory is writable
      try {
        const testFile = path.join(finalOutputDirWindows, `.write_test_${Date.now()}`)
        fs.writeFileSync(testFile, 'test')
        fs.unlinkSync(testFile)
        console.log(`✅ Output directory is writable: ${finalOutputDirWindows}`)
      } catch (writeError) {
        console.error(`❌ Output directory is not writable: ${writeError}`)
        reject(new Error(`Cannot write to output directory: ${finalOutputDirWindows}`))
        return
      }
      
      // Use forward slashes for FFmpeg output path (Windows FFmpeg accepts both)
      // This ensures consistency with subtitle filter paths
      command
        .output(finalOutputPath)
        .on('start', (commandLine) => {
          console.log('🚀 FFmpeg command:', commandLine)
          console.log(`📁 Output file path (FFmpeg): ${finalOutputPath}`)
          console.log(`📁 Output file path (Windows): ${finalOutputPathWindows}`)
          console.log(`📁 Output directory exists: ${fs.existsSync(finalOutputDirWindows)}`)
          console.log(`📁 Output file exists before FFmpeg: ${fs.existsSync(finalOutputPathWindows)}`)
        })
        .on('progress', (progress) => {
          if (!isImage) {
            console.log(`⏳ Processing: ${Math.round(progress.percent || 0)}% done`)
          }
        })
        .on('end', () => {
          console.log(`✅ FFmpeg processing completed (${isImage ? 'image' : 'video'})`)
          resolve()
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg error:', err.message)
          reject(err)
        })
        .run()
    })
  }

  private applyColorGrade(
    command: ffmpeg.FfmpegCommand,
    preset: string
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
    return filter ? command.videoFilters(filter) : command
  }

  private applyEffect(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { preset, intensity = 0.5 } = params
    const presetName = preset?.toLowerCase()
    
    switch (presetName) {
      case 'blur':
        return command.videoFilters(`boxblur=${2 + intensity * 4}:1`)
      case 'glow':
        return command.videoFilters('curves=preset=strong_contrast')
      case 'vhs':
        return command.videoFilters('noise=alls=20:allf=t+u')
      case 'motion':
        return command.videoFilters('hue=h=45')
      case 'film grain':
        return command.videoFilters('noise=alls=10:allf=t')
      case 'lens flare':
        return command.videoFilters('eq=brightness=0.1:contrast=1.2')
      case 'bokeh':
        return command.videoFilters('boxblur=10:5')
      case 'light leak':
        return command.videoFilters('eq=brightness=0.15:saturation=1.2')
      case 'pixelate':
        return command.videoFilters(`scale=iw/10:ih/10,scale=iw*10:ih*10:flags=neighbor`)
      case 'distortion':
        return command.videoFilters('lenscorrection=k1=0.2')
      case 'chromatic aberration':
        return command.videoFilters('rgbashift=rh=2:gh=-2:bh=4')
      case 'shake':
        return command.videoFilters('crop=iw-20:ih-20:random(1)*40:random(1)*40')
      case 'sparkle':
        return command.videoFilters('eq=brightness=0.1:contrast=1.3')
      case 'shadow pulse':
        return command.videoFilters('vignette=PI/6')
      case 'dreamy glow':
        return command.videoFilters('boxblur=4:2,eq=brightness=0.1:saturation=1.2')
      case 'glitch flicker':
        return command.videoFilters('hue=s=300')
      case 'zoom-in pulse':
        return command.videoFilters('zoompan=z=1.1:d=125')
      case 'soft focus':
        return command.videoFilters('boxblur=3:1')
      case 'old film':
        return command.videoFilters('noise=alls=15:allf=t+u,hue=s=0.8')
      case 'dust overlay':
        return command.videoFilters('noise=alls=5:allf=t+u')
      case 'light rays':
        return command.videoFilters('eq=brightness=0.05:contrast=1.4')
      case 'mirror':
        command.complexFilter('[0:v]crop=iw/2:ih:0:0[v1];[v1][v1]hstack[v]')
        command.outputOptions('-map', '[v]')
        return command
      case 'tilt shift':
        return command.videoFilters('vignette=PI/4')
      case 'fisheye':
        return command.videoFilters('lenscorrection=k1=0.5')
      case 'bloom':
        return command.videoFilters('boxblur=8:3,eq=brightness=0.1')
      default:
        console.warn(`⚠️ Unknown effect preset: ${preset}, applying default`)
        return command
    }
  }

  private addTextOverlay(
    command: ffmpeg.FfmpegCommand,
    params: any
  ): ffmpeg.FfmpegCommand {
    const { text, preset, position = 'bottom', fontSize, fontColor, backgroundColor } = params
    
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
    
    const drawtextFilter = `drawtext=${filterParts.join(':')}`
    
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
    type: string
  ): ffmpeg.FfmpegCommand {
    switch (type) {
      case 'blur':
        return command.videoFilters('boxblur=2:1')
      case 'sharpen':
        return command.videoFilters('unsharp=5:5:1.0:5:5:0.0')
      case 'grayscale':
        return command.videoFilters('hue=s=0')
      default:
        return command
    }
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
    
    // Save ASS file to temp directory (use this.tempDir for consistency)
    const subtitleFilePath = path.join(this.tempDir, `subtitles_${Date.now()}.ass`)
    fs.writeFileSync(subtitleFilePath, assContent, 'utf-8')
    console.log(`📝 Generated ASS file: ${subtitleFilePath}`)

    // Verify subtitle file exists
    if (!fs.existsSync(subtitleFilePath)) {
      throw new Error(`Subtitle file not found: ${subtitleFilePath}`)
    }
    
    // Use absolute path for subtitle file (required on Windows)
    // FFmpeg subtitles filter needs absolute path with proper escaping
    const absolutePath = path.resolve(subtitleFilePath)
    
    // For Windows, FFmpeg accepts paths with forward slashes or escaped backslashes
    // Best approach: convert to forward slashes and escape special characters
    const normalizedPath = absolutePath.replace(/\\/g, '/')
    
    // Escape colons (Windows drive letters) and single quotes for FFmpeg filter
    // FFmpeg filter syntax: subtitles='path' or subtitles="path"
    const escapedPath = normalizedPath.replace(/'/g, "\\'")
    
    // Use absolute path with single quotes (FFmpeg standard)
    const subtitleFilter = `subtitles='${escapedPath}'`
    
    console.log(`🎬 Using subtitles filter: ${subtitleFilter}`)
    console.log(`📁 ASS file absolute path: ${absolutePath}`)
    console.log(`📁 Normalized path (forward slashes): ${normalizedPath}`)
    
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
      console.log(`☁️ Starting Cloudinary upload: ${filePath}`)
      console.log(`☁️ Target folder: ${folder}`)
      console.log(`☁️ Resource type: ${isImage ? 'image' : 'video'}`)
      
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
        const ext = filePath.match(/\.(\w+)$/)?.[1] || 'png'
        uploadOptions.format = ext
      }
      
      cloudinary.uploader.upload(
        filePath,
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
    const outputPath = path.join(this.tempDir, `export_${Date.now()}.${format}`)

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

      // Create concat file for FFmpeg
      const concatFilePath = path.join(this.tempDir, `concat_${Date.now()}.txt`)
      const concatLines = inputPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
      await writeFile(concatFilePath, concatLines)
      console.log(`📝 Created concat file: ${concatFilePath}`)

      // Output path for merged video
      const outputPath = path.join(this.tempDir, `merged_${Date.now()}.mp4`)
      const normalizedOutputPath = path.resolve(outputPath)
      
      // Ensure output directory exists
      const outputDir = path.dirname(normalizedOutputPath)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

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
