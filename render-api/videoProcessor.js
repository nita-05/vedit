const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')

/**
 * Video Processor for Render API
 * Handles all FFmpeg operations
 */
class VideoProcessor {
  constructor(ffmpegPath) {
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath)
    }
  }

  /**
   * Apply time-based filter wrapper
   */
  applyTimeBasedFilter(filter, startTime, endTime) {
    if (startTime === undefined && endTime === undefined) {
      return filter
    }
    
    let enableExpr = ''
    if (startTime !== undefined && endTime !== undefined) {
      enableExpr = `enable='between(t,${startTime},${endTime})'`
    } else if (startTime !== undefined) {
      enableExpr = `enable='gte(t,${startTime})'`
    }
    
    return `${filter},${enableExpr}`
  }

  /**
   * Apply color grade
   */
  applyColorGrade(command, preset, options = {}) {
    const { startTime, endTime } = options
    let filter = ''
    
    switch (preset?.toLowerCase()) {
      case 'cinematic':
      case 'cinema':
        filter = 'curves=preset=strong_contrast:master=0.5/0.5'
        break
      case 'vintage':
      case 'retro':
        filter = 'curves=preset=vintage:eq=saturation=0.7'
        break
      case 'black & white':
      case 'grayscale':
      case 'b&w':
        filter = 'hue=s=0'
        break
      case 'warm':
        filter = 'eq=saturation=1.2:gamma_b=0.9'
        break
      case 'cool':
        filter = 'eq=saturation=1.1:gamma_r=0.9'
        break
      case 'dramatic':
        filter = 'curves=preset=strong_contrast'
        break
      default:
        filter = 'curves=preset=medium_contrast'
    }
    
    if (startTime !== undefined || endTime !== undefined) {
      filter = this.applyTimeBasedFilter(filter, startTime, endTime)
    }
    
    return command.videoFilters(filter)
  }

  /**
   * Apply visual effects
   */
  applyEffect(command, params) {
    const { preset, startTime, endTime } = params
    let filter = ''
    
    switch (preset?.toLowerCase()) {
      case 'glow':
        filter = 'curves=preset=strong_contrast:eq=gamma=1.2'
        break
      case 'blur':
        filter = 'boxblur=2:1'
        break
      case 'sharpen':
        filter = 'unsharp=5:5:1.0:5:5:0.0'
        break
      case 'vignette':
        filter = 'vignette=PI/4'
        break
      default:
        filter = 'curves=preset=medium_contrast'
    }
    
    if (startTime !== undefined || endTime !== undefined) {
      filter = this.applyTimeBasedFilter(filter, startTime, endTime)
    }
    
    return command.videoFilters(filter)
  }

  /**
   * Apply filters
   */
  applyFilter(command, type, options = {}) {
    const { startTime, endTime } = options
    let filter = ''
    
    switch (type?.toLowerCase()) {
      case 'grayscale':
      case 'grayscale effect':
      case 'black & white':
      case 'black and white':
      case 'b&w':
        filter = 'hue=s=0'
        break
      case 'blur':
        filter = 'boxblur=2:1'
        break
      case 'sharpen':
        filter = 'unsharp=5:5:1.0:5:5:0.0'
        break
      case 'saturation':
        const level = options.level || 1.0
        filter = `eq=saturation=${level}`
        break
      case 'noise reduction':
        filter = 'hqdn3d=4:3:6:4.5'
        break
      default:
        return command
    }
    
    if (startTime !== undefined || endTime !== undefined) {
      filter = this.applyTimeBasedFilter(filter, startTime, endTime)
    }
    
    return command.videoFilters(filter)
  }

  /**
   * Add text overlay
   */
  addTextOverlay(command, params) {
    const { text, x, y, fontSize, color, startTime, endTime, position } = params
    
    // Escape special characters for drawtext
    const escapedText = text.replace(/:/g, '\\:').replace(/'/g, "\\'")
    
    // Parse position parameter if x/y not explicitly provided
    let xPos = x
    let yPos = y
    
    if (!xPos || !yPos) {
      const pos = (position || '').toLowerCase()
      
      // Horizontal positioning
      if (!xPos) {
        if (pos.includes('left')) {
          xPos = '10' // Left margin
        } else if (pos.includes('right')) {
          xPos = '(w-text_w-10)' // Right margin
        } else {
          xPos = '(w-text_w)/2' // Center (default)
        }
      }
      
      // Vertical positioning
      if (!yPos) {
        if (pos === 'top' || pos.includes('top')) {
          yPos = '10' // Top margin
        } else if (pos === 'bottom' || pos.includes('bottom')) {
          yPos = '(h-text_h-10)' // Bottom margin
        } else if (pos === 'center' || pos === 'centre') {
          yPos = '(h-text_h)/2' // Center
        } else {
          yPos = '(h-text_h)/2' // Default to center
        }
      }
    }
    
    let drawtextFilter = `drawtext=text='${escapedText}':fontsize=${fontSize || 24}:fontcolor=${color || 'white'}:x=${xPos}:y=${yPos}`
    
    if (startTime !== undefined || endTime !== undefined) {
      drawtextFilter = this.applyTimeBasedFilter(drawtextFilter, startTime, endTime)
    }
    
    console.log(`📝 Text overlay: "${text}" at position ${position || 'default'} (x=${xPos}, y=${yPos})`)
    
    return command.videoFilters(drawtextFilter)
  }

  /**
   * Add captions/subtitles
   */
  addCaptions(command, params) {
    const { captions = [], style = 'Glow' } = params
    
    if (!captions || captions.length === 0) {
      console.warn('⚠️ No captions provided, skipping caption generation')
      return command
    }

    console.log('📄 Adding captions using ASS subtitle file')

    // Get custom subtitle properties
    const subtitleColor = params.subtitleColor || params.color || 'white'
    const subtitleSize = params.subtitleSize || params.size || 36
    const subtitlePosition = params.subtitlePosition || params.position || 'bottom'
    const backgroundColor = params.backgroundColor || params.bgColor

    // Generate ASS file (Advanced SubStation Alpha) with embedded styling
    const assContent = this.generateASS(captions, {
      color: subtitleColor,
      size: subtitleSize,
      position: subtitlePosition,
      style: style,
      backgroundColor: backgroundColor,
    })
    
    // Save ASS file to temp directory
    // Use /tmp on Render/Linux, or system temp on Windows
    const tempDir = process.env.TEMP_DIR || process.env.TMPDIR || (process.platform === 'win32' ? require('os').tmpdir() : '/tmp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    const subtitleFilePath = path.join(tempDir, `subtitles_${Date.now()}.ass`)
    fs.writeFileSync(subtitleFilePath, assContent, 'utf-8')
    console.log(`📝 Generated ASS file: ${subtitleFilePath}`)

    // Verify subtitle file exists
    if (!fs.existsSync(subtitleFilePath)) {
      throw new Error(`Subtitle file not found: ${subtitleFilePath}`)
    }
    
    // Use absolute path for subtitle file (required for FFmpeg)
    const absolutePath = path.resolve(subtitleFilePath)
    
    // FFmpeg works best with forward slashes in filter paths
    const normalizedPath = absolutePath.replace(/\\/g, '/')
    // Escape single quotes in the path for the filter
    const escapedPath = normalizedPath.replace(/'/g, "\\'")
    
    // Use absolute path with single quotes (FFmpeg standard)
    const subtitleFilter = `subtitles='${escapedPath}'`
    
    console.log(`🎬 Using subtitles filter: ${subtitleFilter}`)
    console.log(`📁 ASS file absolute path: ${absolutePath}`)
    
    // Apply subtitle filter
    return command.videoFilters(subtitleFilter)
  }

  generateASS(captions, styleOptions) {
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

  secondsToASSTime(seconds) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const centis = Math.floor((seconds % 1) * 100)
    
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  }

  parseFontSize(size) {
    if (typeof size === 'number') {
      return size
    }
    if (typeof size === 'string') {
      const lower = size.toLowerCase()
      if (lower === 'small') return 18
      if (lower === 'medium') return 24
      if (lower === 'large') return 36
      if (lower === 'xlarge') return 48
      // Try to parse as number
      const parsed = parseInt(size, 10)
      if (!isNaN(parsed)) return parsed
    }
    return 36 // Default
  }

  colorToASSFormat(color) {
    // Convert color name/hex to ASS format: &HBBGGRR& (BGR in hex)
    const colorMap = {
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

  /**
   * Process video with instruction
   */
  async process(inputPath, outputPath, instruction, isImage = false) {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
      
      // For images, treat as single-frame video
      if (isImage) {
        command = command.inputOptions(['-loop', '1', '-t', '1'])
      }
      
      // Apply operation
      switch (instruction.operation) {
        case 'trim': {
          const { start = 0, end } = instruction.params
          if (end) {
            const duration = end - start
            command.seekInput(start).duration(duration)
          } else {
            command.seekInput(start)
          }
          break
        }
        
        case 'removeClip': {
          const { startTime, endTime } = instruction.params
          console.log(`🗑️ Removing clip: ${startTime}s to ${endTime}s`)
          
          // Validate times
          if (startTime < 0 || endTime <= startTime) {
            console.warn(`⚠️ Invalid time range: startTime (${startTime}) >= endTime (${endTime}), skipping removal`)
            break
          }
          
          // Use complex filter to remove segment:
          // 1. Trim first part: 0 to startTime
          // 2. Trim second part: endTime to end
          // 3. Concat both parts
          let filterComplex
          
          if (startTime === 0) {
            // Removing from start: only keep part after endTime
            filterComplex = `[0:v]trim=${endTime},setpts=PTS-STARTPTS[outv];[0:a]atrim=${endTime},asetpts=PTS-STARTPTS[outa]`
          } else {
            // Removing middle segment: keep part before startTime and part after endTime
            filterComplex = [
              // First segment: 0 to startTime
              `[0:v]trim=0:${startTime},setpts=PTS-STARTPTS[v1];[0:a]atrim=0:${startTime},asetpts=PTS-STARTPTS[a1]`,
              // Second segment: endTime to end
              `[0:v]trim=${endTime},setpts=PTS-STARTPTS[v2];[0:a]atrim=${endTime},asetpts=PTS-STARTPTS[a2]`,
              // Concatenate both segments
              `[v1][a1][v2][a2]concat=n=2:v=1:a=1[outv][outa]`
            ].join('; ')
          }
          
          command
            .complexFilter(filterComplex)
            .outputOptions([
              '-map', '[outv]',
              '-map', '[outa]'
            ])
          
          console.log(`✂️ Removing segment from ${startTime}s to ${endTime}s using filter_complex`)
          break
        }
        
        case 'colorGrade': {
          const { preset, startTime, endTime } = instruction.params
          command = this.applyColorGrade(command, preset, { startTime, endTime })
          break
        }
        
        case 'applyEffect': {
          command = this.applyEffect(command, instruction.params)
          break
        }
        
        case 'addText':
        case 'customText': {
          command = this.addTextOverlay(command, instruction.params)
          break
        }
        
        case 'filter': {
          const { type, startTime, endTime } = instruction.params
          command = this.applyFilter(command, type, { startTime, endTime, ...instruction.params })
          break
        }
        
        case 'addCaptions': {
          command = this.addCaptions(command, instruction.params)
          break
        }
        
        case 'adjustIntensity': {
          const { intensity, direction } = instruction.params
          let gammaValue = intensity || 1.0
          if (direction === 'more') gammaValue = 1.2
          if (direction === 'less') gammaValue = 0.8
          command = command.videoFilters(`eq=gamma=${gammaValue}`)
          break
        }
        
        case 'adjustZoom': {
          const { zoom, direction } = instruction.params
          let zoomValue = zoom || 1.0
          if (direction === 'in') zoomValue = 1.2
          if (direction === 'out') zoomValue = 0.8
          command = command.videoFilters(`scale=iw*${zoomValue}:ih*${zoomValue}`)
          break
        }
        
        case 'adjustSpeed': {
          const { speed } = instruction.params
          // Setpts and atempo for speed adjustment
          command = command.videoFilters(`setpts=${1/speed}*PTS`)
            .audioFilters(`atempo=${speed}`)
          break
        }
        
        case 'rotate': {
          const { degrees } = instruction.params
          let transpose = '0'
          switch (degrees) {
            case 90:
            case '90':
              transpose = '1'
              break
            case 180:
            case '180':
              transpose = '2'
              break
            case -90:
            case '-90':
            case 270:
            case '270':
              transpose = '3'
              break
          }
          command = command.videoFilters(`transpose=${transpose}`)
          break
        }
        
        case 'crop': {
          const { x, y, width, height } = instruction.params
          // Crop filter: crop=width:height:x:y
          command = command.videoFilters(`crop=${width}:${height}:${x}:${y}`)
          break
        }
        
        default:
          console.warn(`⚠️ Unknown operation: ${instruction.operation}`)
          // Pass through without modification
      }
      
      command
        .output(outputPath)
        .on('start', (cmdline) => {
          console.log('📹 FFmpeg command:', cmdline)
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⏳ Processing: ${Math.round(progress.percent)}%`)
          }
        })
        .on('end', () => {
          console.log('✅ FFmpeg processing complete')
          resolve()
        })
        .on('error', (error) => {
          console.error('❌ FFmpeg error:', error.message)
          reject(error)
        })
        .run()
    })
  }
}

module.exports = VideoProcessor

