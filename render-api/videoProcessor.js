const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')

const EFFECT_INTENSITY_KEYWORDS = {
  subtle: 0.3,
  light: 0.3,
  soft: 0.35,
  gentle: 0.35,
  medium: 0.6,
  moderate: 0.6,
  default: 0.6,
  normal: 0.6,
  strong: 0.85,
  intense: 0.9,
  heavy: 0.9,
  high: 0.85,
  extreme: 0.95,
}

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

    if (!enableExpr) {
      return filter
    }

    // Apply enable option to each filter segment (comma-separated)
    const enableOption = enableExpr.startsWith(':') ? enableExpr : `:${enableExpr}`
    return filter
      .split(',')
      .map(segment => {
        const trimmed = segment.trim()
        if (!trimmed || trimmed.includes('enable=')) {
          return trimmed
        }
        return `${trimmed}${enableOption}`
      })
      .join(',')
  }

  normalizeDrawtextColor(color, alpha = 1) {
    if (!color) {
      return null
    }

    const colorMap = {
      white: 'white',
      black: 'black',
      yellow: 'yellow',
      red: 'red',
      blue: 'blue',
      green: 'green',
      orange: 'orange',
      purple: 'purple',
      pink: 'pink',
      cyan: 'cyan',
      magenta: 'magenta',
      gray: 'gray',
      grey: 'gray',
    }

    let base = color.toString().trim()
    const mapped = colorMap[base.toLowerCase()]
    if (mapped) {
      base = mapped
    } else if (base.startsWith('#') && base.length === 7) {
      base = `0x${base.slice(1)}`
    } else if (/^0x/i.test(base)) {
      base = base.replace(/^0x/i, '0x')
    }

    const a = Math.max(0, Math.min(alpha ?? 1, 1))
    return a < 1 ? `${base}@${a.toFixed(2)}` : base
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
        filter = 'curves=preset=vintage,eq=saturation=0.7'
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
    let rawIntensity = params.intensity ?? params.strength ?? params.amount
    let numericIntensity = typeof rawIntensity === 'number' && Number.isFinite(rawIntensity)
      ? rawIntensity
      : parseFloat(rawIntensity)

    if (!Number.isFinite(numericIntensity)) {
      const key = typeof rawIntensity === 'string' ? rawIntensity.toLowerCase().trim() : ''
      if (EFFECT_INTENSITY_KEYWORDS[key] !== undefined) {
        numericIntensity = EFFECT_INTENSITY_KEYWORDS[key]
      }
    }

    if (!Number.isFinite(numericIntensity)) {
      numericIntensity = 0.5
    }

    const intensityMultiplier = Math.max(0.1, Math.min(1.0, numericIntensity))
    let filter = ''
    
    switch (preset?.toLowerCase()) {
      case 'glow':
      case 'dreamy glow':
        filter = `curves=preset=strong_contrast,eq=gamma=${1.0 + intensityMultiplier * 0.3}`
        break
      case 'blur':
        const blurAmount = Math.round(2 + intensityMultiplier * 8)
        filter = `boxblur=${blurAmount}:${blurAmount}`
        break
      case 'sharpen':
        const sharpenAmount = 3 + intensityMultiplier * 5
        filter = `unsharp=${sharpenAmount}:${sharpenAmount}:1.0:5:5:0.0`
        break
      case 'vignette':
        filter = `vignette=PI/${4 - intensityMultiplier * 2}`
        break
      case 'vhs':
      case 'vhs effect':
        // VHS effect: noise, scanlines, color shift
        filter = `noise=alls=${intensityMultiplier * 20}:allf=t+u,curves=preset=strong_contrast,eq=saturation=0.8`
        break
      case 'motion':
      case 'motion blur':
        const motionAmount = Math.round(5 + intensityMultiplier * 15)
        filter = `minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1`
        break
      case 'film grain':
      case 'grain':
        filter = `noise=alls=${intensityMultiplier * 15}:allf=t+u`
        break
      case 'lens flare':
        filter = `curves=preset=strong_contrast,eq=gamma=${1.0 + intensityMultiplier * 0.2},eq=saturation=${1.0 + intensityMultiplier * 0.3}`
        break
      case 'bokeh':
        filter = `boxblur=${Math.round(10 + intensityMultiplier * 20)}:${Math.round(10 + intensityMultiplier * 20)}:luma_radius=${Math.round(5 + intensityMultiplier * 10)}`
        break
      case 'light leak':
        filter = `curves=preset=strong_contrast,eq=gamma=${1.0 + intensityMultiplier * 0.4},eq=saturation=${1.0 + intensityMultiplier * 0.2}`
        break
      case 'pixelate':
        const pixelSize = Math.round(10 - intensityMultiplier * 8)
        filter = `scale=iw/${pixelSize}:ih/${pixelSize},scale=iw*${pixelSize}:ih*${pixelSize}:flags=neighbor`
        break
      case 'distortion':
        filter = `lenscorrection=k1=${-0.1 * intensityMultiplier}:k2=${-0.05 * intensityMultiplier}`
        break
      case 'chromatic aberration':
        filter = `split[original][copy];[copy]scale=iw*1.01:ih*1.01[scaled];[original][scaled]blend=all_mode=addition:all_opacity=${intensityMultiplier * 0.3}`
        break
      case 'shake':
        // Shake effect using random displacement
        filter = `crop=iw-${Math.round(10 * intensityMultiplier)}:ih-${Math.round(10 * intensityMultiplier)}:random(1)*${Math.round(20 * intensityMultiplier)}:random(1)*${Math.round(20 * intensityMultiplier)}`
        break
      case 'sparkle':
        filter = `curves=preset=strong_contrast,eq=gamma=${1.0 + intensityMultiplier * 0.3},eq=saturation=${1.0 + intensityMultiplier * 0.4}`
        break
      case 'shadow pulse':
        filter = `curves=preset=strong_contrast,eq=gamma=${1.0 - intensityMultiplier * 0.2}`
        break
      case 'glitch flicker':
        filter = `noise=alls=${intensityMultiplier * 10}:allf=t+u,curves=preset=strong_contrast`
        break
      case 'zoom-in pulse':
        filter = `zoompan=z='if(lte(zoom,1.0),1.5,max(1.001,zoom-0.0015))':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=iw*1.5:ih*1.5`
        break
      case 'soft focus':
        filter = `boxblur=${Math.round(3 + intensityMultiplier * 5)}:${Math.round(3 + intensityMultiplier * 5)}`
        break
      case 'old film':
      case 'oldfilm':
        filter = `noise=alls=${intensityMultiplier * 25}:allf=t+u,curves=preset=vintage,eq=saturation=${0.5 + intensityMultiplier * 0.3}`
        break
      case 'dust overlay':
        filter = `noise=alls=${intensityMultiplier * 15}:allf=t+u,curves=preset=vintage`
        break
      case 'light rays':
        filter = `curves=preset=strong_contrast,eq=gamma=${1.0 + intensityMultiplier * 0.3},eq=saturation=${1.0 + intensityMultiplier * 0.2}`
        break
      case 'mirror':
        filter = `split[original][copy];[copy]hflip[flipped];[original][flipped]blend=all_mode=addition:all_opacity=${0.3 + intensityMultiplier * 0.4}`
        break
      case 'tilt shift':
        filter = `boxblur=${Math.round(5 + intensityMultiplier * 10)}:${Math.round(5 + intensityMultiplier * 10)}:luma_radius=${Math.round(3 + intensityMultiplier * 7)}`
        break
      case 'fisheye':
        filter = `lenscorrection=k1=${-0.3 * intensityMultiplier}:k2=${-0.15 * intensityMultiplier}`
        break
      case 'bloom':
        filter = `boxblur=${Math.round(8 + intensityMultiplier * 12)}:${Math.round(8 + intensityMultiplier * 12)},curves=preset=strong_contrast,eq=gamma=${1.0 + intensityMultiplier * 0.2}`
        break
      default:
        // Default fallback for unknown effects
        filter = 'curves=preset=medium_contrast'
    }
    
    // Apply time-based filter wrapper if time range specified
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
    const { text = '', x, y, fontSize, color, startTime, endTime, position, style } = params

    let backgroundColor = params.backgroundColor || params.bgColor || (params.highlight ? (typeof params.highlight === 'string' ? params.highlight : 'yellow') : null)
    const highlightOpacityRaw = params.backgroundOpacity ?? params.highlightOpacity
    let highlightOpacity = typeof highlightOpacityRaw === 'number' && Number.isFinite(highlightOpacityRaw)
      ? highlightOpacityRaw
      : parseFloat(highlightOpacityRaw)
    if (!Number.isFinite(highlightOpacity)) {
      highlightOpacity = 0.65
    }
    highlightOpacity = Math.max(0, Math.min(highlightOpacity, 1))

    const boxBorderWidthRaw = params.boxBorderWidth ?? params.boxBorder
    let boxBorderWidth = parseFloat(boxBorderWidthRaw)
    if (!Number.isFinite(boxBorderWidth)) {
      boxBorderWidth = 20
    }
    boxBorderWidth = Math.max(0, boxBorderWidth)

    // Parse position parameter if x/y not explicitly provided
    let xPos = x
    let yPos = y

    if (!xPos || !yPos) {
      const pos = (position || '').toLowerCase()

      if (!xPos) {
        if (pos.includes('left')) {
          xPos = '10'
        } else if (pos.includes('right')) {
          xPos = '(w-text_w-10)'
        } else {
          xPos = '(w-text_w)/2'
        }
      }

      if (!yPos) {
        if (pos === 'top' || pos.includes('top')) {
          yPos = '10'
        } else if (pos === 'bottom' || pos.includes('bottom')) {
          yPos = '(h-text_h-10)'
        } else if (pos === 'center' || pos === 'centre') {
          yPos = '(h-text_h)/2'
        } else {
          yPos = '(h-text_h)/2'
        }
      }
    }

    const styleConfig = this.getTextStyleConfig(style)

    let styledText = text
    if (styleConfig.transform === 'uppercase') {
      styledText = styledText.toUpperCase()
    }

    // Escape special characters for drawtext
    const escapedText = styledText.replace(/:/g, '\\:').replace(/'/g, "\\'")

    const resolvedFontSize = this.parseFontSize(fontSize || params.size || styleConfig.defaultFontSize || 36)
    const baseFontColor = styleConfig.fontColor || color || 'white'
    const resolvedFontColor = this.normalizeDrawtextColor(baseFontColor) || 'white'

    const options = []
    options.push(`text='${escapedText}'`)
    options.push(`fontsize=${resolvedFontSize}`)
    options.push(`fontcolor=${resolvedFontColor}`)
    options.push(`x=${xPos}`)
    options.push(`y=${yPos}`)

    const fontPath = this.resolveFontPath(styleConfig.fontCandidates)
    if (fontPath) {
      const normalizedFontPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:')
      options.push(`fontfile='${normalizedFontPath}'`)
    }

    const borderWidth = styleConfig.borderWidth ?? params.borderWidth ?? params.outlineWidth ?? 0
    if (borderWidth > 0) {
      const borderColor = this.normalizeDrawtextColor(styleConfig.borderColor || params.borderColor || '#000000')
      options.push(`borderw=${borderWidth}`)
      if (borderColor) {
        options.push(`bordercolor=${borderColor}`)
      }
    }

    const shadowColor = this.normalizeDrawtextColor(styleConfig.shadowColor || params.shadowColor)
    if (shadowColor) {
      options.push(`shadowcolor=${shadowColor}`)
      options.push(`shadowx=${styleConfig.shadowX ?? params.shadowX ?? 2}`)
      options.push(`shadowy=${styleConfig.shadowY ?? params.shadowY ?? 2}`)
    }

    let boxRequired = false
    let boxColorValue = null
    let finalBoxBorderWidth = styleConfig.boxBorderWidth ?? boxBorderWidth
    if (!Number.isFinite(finalBoxBorderWidth)) {
      finalBoxBorderWidth = boxBorderWidth
    }
    finalBoxBorderWidth = Math.max(0, finalBoxBorderWidth)

    if (backgroundColor && typeof backgroundColor === 'string') {
      const lower = backgroundColor.toLowerCase().trim()
      if (!['none', 'transparent', 'clear', 'no'].includes(lower)) {
        boxColorValue = this.normalizeDrawtextColor(backgroundColor, highlightOpacity)
        boxRequired = Boolean(boxColorValue)
      }
    } else if (params.highlight === true) {
      boxColorValue = this.normalizeDrawtextColor(styleConfig.highlightColor || 'yellow', highlightOpacity)
      boxRequired = Boolean(boxColorValue)
    } else if (styleConfig.backgroundColor) {
      boxColorValue = this.normalizeDrawtextColor(styleConfig.backgroundColor, styleConfig.backgroundOpacity ?? highlightOpacity)
      finalBoxBorderWidth = styleConfig.boxBorderWidth ?? finalBoxBorderWidth
      boxRequired = Boolean(boxColorValue)
    }

    if (params.box === true && params.boxColor) {
      const mapped = this.normalizeDrawtextColor(params.boxColor, highlightOpacity)
      if (mapped) {
        boxColorValue = mapped
        boxRequired = true
      }
    }

    if (boxRequired && boxColorValue) {
      options.push('box=1')
      options.push(`boxcolor=${boxColorValue}`)
      options.push(`boxborderw=${finalBoxBorderWidth}`)
    }

    if (styleConfig.extraOptions && Array.isArray(styleConfig.extraOptions)) {
      styleConfig.extraOptions.forEach((opt) => {
        if (opt && typeof opt === 'string') {
          options.push(opt)
        }
      })
    }

    let drawtextFilter = `drawtext=${options.join(':')}`

    if (startTime !== undefined || endTime !== undefined) {
      drawtextFilter = this.applyTimeBasedFilter(drawtextFilter, startTime, endTime)
    }

    console.log(`📝 Text overlay: "${text}" at position ${position || 'default'} (x=${xPos}, y=${yPos}) using style ${style || 'default'}`)

    return command.videoFilters(drawtextFilter)
  }

  resolveFontPath(preferredFonts = []) {
    const candidates = [
      ...(Array.isArray(preferredFonts) ? preferredFonts : []),
      process.env.FONT_PATH,
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf'
    ].filter(Boolean)

    for (const candidate of candidates) {
      try {
        if (candidate && fs.existsSync(candidate)) {
          return candidate
        }
      } catch (err) {
        // Ignore access errors and continue checking other candidates
      }
    }
    console.warn('⚠️ No custom font file found for drawtext. Falling back to FFmpeg default fonts.')
    return null
  }

  getTextStyleConfig(style) {
    const lower = (style || '').toLowerCase().trim()
    const baseConfig = {
      fontColor: null,
      borderColor: null,
      borderWidth: 0,
      shadowColor: null,
      shadowX: 2,
      shadowY: 2,
      fontCandidates: [],
      backgroundColor: null,
      backgroundOpacity: 0.6,
      highlightColor: 'yellow',
      boxBorderWidth: 20,
      transform: null,
      extraOptions: [],
      defaultFontSize: null
    }

    switch (lower) {
      case 'bold':
        return {
          ...baseConfig,
          borderWidth: 4,
          borderColor: '#000000',
          shadowColor: '#000000',
          shadowX: 2,
          shadowY: 2,
          fontCandidates: ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
        }
      case 'cinematic':
        return {
          ...baseConfig,
          fontColor: '#ffd700',
          borderWidth: 2,
          borderColor: '#000000',
          shadowColor: '#000000',
          shadowX: 0,
          shadowY: 4,
          fontCandidates: ['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf']
        }
      case 'retro':
        return {
          ...baseConfig,
          fontColor: '#ff8c00',
          borderWidth: 2,
          borderColor: '#2b2b52',
          shadowColor: '#2b2b52',
          shadowX: 3,
          shadowY: 3
        }
      case 'handwritten':
        return {
          ...baseConfig,
          fontColor: '#ff69b4',
          shadowColor: '#000000',
          shadowX: 1,
          shadowY: 1,
          fontCandidates: [
            '/usr/share/fonts/truetype/google-droid/DroidSerif-Italic.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
          ]
        }
      case 'neon glow':
        return {
          ...baseConfig,
          fontColor: '#39ff14',
          borderWidth: 3,
          borderColor: '#00bfff',
          shadowColor: '#39ff14',
          shadowX: 0,
          shadowY: 0,
          backgroundColor: '#000000',
          backgroundOpacity: 0.25
        }
      case 'typewriter':
        return {
          ...baseConfig,
          fontColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#000000',
          shadowColor: '#000000',
          shadowX: 0,
          shadowY: 0,
          fontCandidates: ['/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf']
        }
      case 'lower third':
        return {
          ...baseConfig,
          fontColor: '#ffffff',
          borderWidth: 0,
          backgroundColor: '#000000',
          backgroundOpacity: 0.55,
          boxBorderWidth: 30
        }
      case 'minimal':
        return {
          ...baseConfig,
          fontColor: '#ffffff',
          shadowColor: '#000000',
          shadowX: 0,
          shadowY: 3
        }
      case 'subtitle':
        return {
          ...baseConfig,
          fontColor: '#ffffff',
          borderWidth: 2,
          borderColor: '#000000',
          shadowColor: '#000000',
          shadowX: 0,
          shadowY: 3
        }
      default:
        return baseConfig
    }
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
      
      // Handle music mixing BEFORE other operations (if music path is provided)
      let hasMusicMixing = false
      if (instruction.operation === 'addMusic' && instruction.params?._musicPath) {
        const musicPath = instruction.params._musicPath
        const musicVolume = instruction.params._musicVolume || 0.3
        const musicStartTime = instruction.params._musicStartTime
        const musicEndTime = instruction.params._musicEndTime
        
        console.log(`🎵 Adding music file as second input: ${musicPath}`)
        
        // Add music as second input
        command = command.input(musicPath)
        
        // Use complex filter to mix audio tracks
        // [0:a] = original video audio (input 0, audio stream)
        // [1:a] = music audio (input 1, audio stream)
        // amix = mix both audio tracks
        let amixFilter = ''
        
        // If time range specified, trim music to that range
        if (musicStartTime !== undefined && musicEndTime !== undefined && musicEndTime > musicStartTime) {
          // Trim music to time range, then mix
          amixFilter = `[1:a]atrim=${musicStartTime}:${musicEndTime},asetpts=PTS-STARTPTS,volume=${musicVolume}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[outa]`
        } else {
          // Mix full music track with video audio
          amixFilter = `[1:a]volume=${musicVolume}[musicvol];[0:a][musicvol]amix=inputs=2:duration=first:dropout_transition=2[outa]`
        }
        
        // Apply complex filter and map outputs
        command = command
          .complexFilter(amixFilter)
          .outputOptions(['-map', '0:v', '-map', '[outa]'])
        
        hasMusicMixing = true
        console.log(`✅ Music mixing filter applied: ${amixFilter}`)
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
        
        case 'addTransition': {
          const { preset = 'fade', duration = 1.0, startTime, endTime } = instruction.params || {}
          const safePreset = (preset || 'fade').toLowerCase()
          const safeDuration = Math.max(0.1, Math.min(duration || 1.0, 10.0)) // Clamp between 0.1s and 10s
          
          console.log(`🎬 Adding transition: ${safePreset} (duration: ${safeDuration}s)`)
          
          // Apply transition effect based on preset
          let transitionFilter = ''
          switch (safePreset) {
            case 'fade':
            case 'fade in':
            case 'fade out':
            case 'fade in/out':
              // Fade in/out effect
              if (startTime !== undefined && endTime !== undefined && endTime > startTime) {
                const fadeDuration = Math.min(safeDuration, (endTime - startTime) / 2)
                transitionFilter = `fade=t=in:st=${startTime}:d=${fadeDuration},fade=t=out:st=${endTime - fadeDuration}:d=${fadeDuration}`
              } else {
                transitionFilter = `fade=t=in:st=0:d=${safeDuration},fade=t=out:st=*:d=${safeDuration}`
              }
              break
            case 'cross dissolve':
            case 'dissolve':
            case 'crossfade':
              // Cross dissolve (blend)
              transitionFilter = `fade=t=in:st=0:d=${safeDuration}`
              break
            case 'blur in':
            case 'blur out':
            case 'blur in/out':
              // Blur transition
              if (startTime !== undefined && endTime !== undefined && endTime > startTime) {
                transitionFilter = `boxblur=enable='between(t,${startTime},${startTime + safeDuration})':luma_radius=10:chroma_radius=10`
              } else {
                transitionFilter = `boxblur=enable='between(t,0,${safeDuration})':luma_radius=10:chroma_radius=10`
              }
              break
            case 'zoom':
            case 'zoom in':
            case 'zoom out':
              // Zoom transition
              const zoomFactor = safePreset.includes('out') ? 0.8 : 1.2
              if (startTime !== undefined && endTime !== undefined && endTime > startTime) {
                const zoomDuration = Math.min(safeDuration, (endTime - startTime))
                transitionFilter = `scale=iw*${zoomFactor}:ih*${zoomFactor}:enable='between(t,${startTime},${startTime + zoomDuration})'`
              } else {
                transitionFilter = `scale=iw*${zoomFactor}:ih*${zoomFactor}:enable='between(t,0,${safeDuration})'`
              }
              break
            case 'slide':
            case 'slide in':
            case 'slide out':
              // Slide transition (horizontal movement)
              transitionFilter = `crop=iw:ih:iw*${safeDuration}:0`
              break
            case 'wipe':
              // Wipe transition
              transitionFilter = `crop=iw:ih:iw*${safeDuration}:0`
              break
            case 'spin':
            case 'rotate':
              // Spin/rotate transition
              transitionFilter = `rotate=PI*2*t/${safeDuration}:c=black@0`
              break
            default:
              // Default to fade for unknown presets
              console.log(`⚠️ Unknown transition preset "${preset}", using default fade`)
              transitionFilter = `fade=t=in:st=0:d=${safeDuration},fade=t=out:st=*:d=${safeDuration}`
          }
          
          if (transitionFilter) {
            command = command.videoFilters(transitionFilter)
            console.log(`✅ Applied transition filter: ${transitionFilter.substring(0, 100)}...`)
          }
          break
        }
        
        case 'addMusic': {
          const { preset, volume = 0.3, startTime, endTime, loop = false, musicUrl } = instruction.params || {}
          const safeVolume = Math.max(0, Math.min(volume || 0.3, 1.0)) // Clamp between 0 and 1
          
          console.log(`🎵 Adding music: ${preset || 'default'} (volume: ${safeVolume})`)
          
          // If musicUrl is provided, store it for download and mixing
          // The actual mixing happens in the process() method using complex filters
          if (musicUrl && typeof musicUrl === 'string' && musicUrl.startsWith('http')) {
            console.log(`📥 Music URL provided: ${musicUrl}`)
            // Store music parameters for processing
            instruction.params._musicUrl = musicUrl
            instruction.params._musicVolume = safeVolume
            instruction.params._musicStartTime = startTime
            instruction.params._musicEndTime = endTime
            instruction.params._musicLoop = loop
            console.log(`✅ Music URL stored - will be downloaded and mixed during processing`)
            // Don't apply any filters here - mixing will be done in process() method
          } else {
            // No music URL provided - enhance existing audio as fallback
            // This simulates music addition by enhancing the existing track
            let audioFilter = `volume=${safeVolume}`
            
            // If there's a time range, apply it
            if (startTime !== undefined && endTime !== undefined && endTime > startTime) {
              audioFilter = `volume=${safeVolume}:enable='between(t,${startTime},${endTime})'`
            }
            
            command = command.audioFilters(audioFilter)
            console.log(`✅ Applied audio enhancement filter: ${audioFilter}`)
            console.log(`ℹ️ Note: To add actual background music, provide a musicUrl parameter.`)
            console.log(`ℹ️ You can use royalty-free music from: Freesound, Jamendo, or upload your own music.`)
          }
          break
        }
        
        default:
          console.warn(`⚠️ Unknown operation: ${instruction.operation}`)
          // Pass through without modification
      }
      
      // Set output path (music mixing already configured output options above)
      command = command.output(outputPath)
      
      command
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

