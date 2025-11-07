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
    const { text, x, y, fontSize, color, startTime, endTime } = params
    
    // Escape special characters for drawtext
    const escapedText = text.replace(/:/g, '\\:').replace(/'/g, "\\'")
    
    let drawtextFilter = `drawtext=text='${escapedText}':fontsize=${fontSize || 24}:fontcolor=${color || 'white'}:x=${x || '(w-text_w)/2'}:y=${y || '(h-text_h)/2'}`
    
    if (startTime !== undefined || endTime !== undefined) {
      drawtextFilter = this.applyTimeBasedFilter(drawtextFilter, startTime, endTime)
    }
    
    return command.videoFilters(drawtextFilter)
  }

  /**
   * Add captions/subtitles
   */
  addCaptions(command, params) {
    const { subtitlePath, color, size, position, backgroundColor, style } = params
    
    if (!subtitlePath || !fs.existsSync(subtitlePath)) {
      throw new Error('Subtitle file not found')
    }
    
    // Map color to ASS format
    const colorMap = {
      'white': '&Hffffff',
      'yellow': '&H00ffff',
      'red': '&H0000ff',
      'blue': '&Hff0000',
      'green': '&H00ff00',
      'black': '&H000000',
    }
    
    // Map position to ASS alignment
    const positionMap = {
      'top': 8,
      'bottom': 2,
      'center': 5,
      'top-left': 7,
      'top-right': 9,
      'bottom-left': 1,
      'bottom-right': 3,
    }
    
    const assColor = colorMap[color?.toLowerCase()] || color || '&Hffffff'
    const assSize = size || (typeof size === 'string' ? 
      (size.toLowerCase() === 'small' ? 18 : size.toLowerCase() === 'large' ? 36 : 24) : 24)
    const assPosition = positionMap[position?.toLowerCase()] || 2
    const assBgColor = backgroundColor ? (colorMap[backgroundColor.toLowerCase()] || backgroundColor) : '&H80000000'
    
    // Use ASS format for better styling
    const subtitlePathNormalized = subtitlePath.replace(/\\/g, '/').replace(/'/g, "\\'")
    const filter = `subtitles='${subtitlePathNormalized}':force_style='FontName=Arial,FontSize=${assSize},PrimaryColour=${assColor},BackColour=${assBgColor},Alignment=${assPosition},Bold=${style?.toLowerCase() === 'bold' ? 1 : 0}'`
    
    return command.videoFilters(filter)
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

