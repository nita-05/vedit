import { v2 as cloudinary } from 'cloudinary'

// Cloudinary transformation-based video editing (no FFmpeg required)
// This works on Vercel/serverless environments

interface TextOverlayOptions {
  text: string
  position?: string
  fontSize?: number | string
  fontColor?: string
  backgroundColor?: string
  style?: string
}

export class CloudinaryTransformProcessor {
  /**
   * Add text overlay using Cloudinary transformations
   */
  static addTextOverlay(
    publicId: string,
    options: TextOverlayOptions
  ): string {
    const {
      text,
      position = 'bottom',
      fontSize = 48,
      fontColor = 'white',
      backgroundColor,
      style = 'bold'
    } = options

    // Escape text for URL
    const escapedText = encodeURIComponent(text)

    // Get position coordinates
    const positions: { [key: string]: string } = {
      'top': 'g_north',
      'bottom': 'g_south',
      'center': 'g_center',
      'left': 'g_west',
      'right': 'g_east',
      'top-left': 'g_north_west',
      'top-right': 'g_north_east',
      'bottom-left': 'g_south_west',
      'bottom-right': 'g_south_east',
    }
    const gravity = positions[position] || positions['bottom']

    // Parse font size
    let size = 48
    if (typeof fontSize === 'number') {
      size = Math.max(12, Math.min(200, fontSize))
    } else if (typeof fontSize === 'string') {
      const sizeMap: { [key: string]: number } = {
        'small': 24,
        'medium': 36,
        'large': 48,
        'xlarge': 60,
      }
      size = sizeMap[fontSize.toLowerCase()] || parseInt(fontSize) || 48
    }

    // Parse color
    const color = this.parseColor(fontColor)

    // Build transformation string
    let transformations: string[] = []

    // Add text overlay
    transformations.push(`l_text:${size}_${style}:${escapedText}`)
    transformations.push(`co_${color}`)
    transformations.push(gravity)

    // Add background if specified
    if (backgroundColor && backgroundColor !== 'transparent') {
      const bgColor = this.parseColor(backgroundColor)
      transformations.push(`bo_3px_solid_${bgColor}`)
    }

    // Build Cloudinary URL
    const transformString = transformations.join(',')
    const url = cloudinary.url(publicId, {
      resource_type: 'video',
      transformation: [
        {
          overlay: {
            text: text,
            font_family: 'Arial',
            font_size: size,
            font_weight: style === 'bold' ? 'bold' : 'normal',
            text_align: 'center',
          },
          color: color,
          gravity: gravity,
          y: position.includes('top') ? 20 : position.includes('bottom') ? -20 : 0,
        },
        ...(backgroundColor && backgroundColor !== 'transparent' ? [{
          overlay: {
            text: text,
            font_family: 'Arial',
            font_size: size,
            font_weight: style === 'bold' ? 'bold' : 'normal',
            text_align: 'center',
          },
          background: backgroundColor,
          gravity: gravity,
          y: position.includes('top') ? 20 : position.includes('bottom') ? -20 : 0,
        }] : [])
      ],
    })

    return url
  }

  /**
   * Apply color grading using Cloudinary transformations
   */
  static applyColorGrade(
    publicId: string,
    preset: string,
    resourceType: 'video' | 'image' = 'video'
  ): string {
    const presets: { [key: string]: any } = {
      'warm': { effect: 'art:zorro', overlay: 'colorize:40:yellow' },
      'cool': { effect: 'art:zorro', overlay: 'colorize:40:blue' },
      'vintage': { effect: 'art:zorro', colorize: 'sepia:50' },
      'moody': { effect: 'art:zorro', brightness: -20, contrast: 30 },
      'cinematic': { effect: 'art:zorro', brightness: 5, contrast: 10, saturation: -10 },
      'noir': { effect: 'art:zorro', colorize: 'grayscale' },
      'sepia': { effect: 'art:zorro', colorize: 'sepia:100' },
      'dreamy': { effect: 'art:zorro', brightness: 5, saturation: -5 },
      'vibrant': { effect: 'art:zorro', saturation: 40 },
      'muted': { effect: 'art:zorro', saturation: -30 },
      'cyberpunk': { effect: 'art:zorro', saturation: 50, brightness: 20 },
      'neon': { effect: 'art:zorro', saturation: 60, brightness: 10 },
      'golden hour': { effect: 'art:zorro', overlay: 'colorize:30:gold' },
      'high contrast': { effect: 'art:zorro', contrast: 50 },
      'black & white': { effect: 'art:zorro', colorize: 'grayscale' },
      'monochrome': { effect: 'art:zorro', colorize: 'grayscale' },
    }

    const presetConfig = presets[preset?.toLowerCase()] || {}
    const transformations: any[] = []

    if (presetConfig.effect) {
      transformations.push({ effect: presetConfig.effect })
    }
    if (presetConfig.brightness) {
      transformations.push({ brightness: presetConfig.brightness })
    }
    if (presetConfig.contrast) {
      transformations.push({ contrast: presetConfig.contrast })
    }
    if (presetConfig.saturation) {
      transformations.push({ saturation: presetConfig.saturation })
    }
    if (presetConfig.colorize) {
      transformations.push({ effect: presetConfig.colorize })
    }
    if (presetConfig.overlay) {
      transformations.push({ overlay: presetConfig.overlay })
    }

    return cloudinary.url(publicId, {
      resource_type: resourceType,
      transformation: transformations.length > 0 ? transformations : [{ effect: 'art:zorro' }],
    })
  }

  /**
   * Apply visual effects using Cloudinary transformations
   */
  static applyEffect(
    publicId: string,
    preset: string,
    resourceType: 'video' | 'image' = 'video'
  ): string {
    const presets: { [key: string]: any } = {
      'blur': { effect: 'blur:300' },
      'glow': { effect: 'art:zorro', brightness: 10, contrast: 20 },
      'vhs': { effect: 'art:zorro', noise: 20 },
      'film grain': { effect: 'art:zorro', noise: 10 },
      'bokeh': { effect: 'blur:500' },
      'pixelate': { effect: 'pixelate:20' },
      'sharpen': { effect: 'sharpen:100' },
      'soft focus': { effect: 'blur:200' },
      'old film': { effect: 'art:zorro', noise: 15, colorize: 'sepia:30' },
    }

    const presetConfig = presets[preset?.toLowerCase()] || {}
    const transformations: any[] = []

    if (presetConfig.effect) {
      transformations.push({ effect: presetConfig.effect })
    }
    if (presetConfig.brightness) {
      transformations.push({ brightness: presetConfig.brightness })
    }
    if (presetConfig.contrast) {
      transformations.push({ contrast: presetConfig.contrast })
    }
    if (presetConfig.noise) {
      transformations.push({ effect: `noise:${presetConfig.noise}` })
    }
    if (presetConfig.colorize) {
      transformations.push({ effect: presetConfig.colorize })
    }

    return cloudinary.url(publicId, {
      resource_type: resourceType,
      transformation: transformations.length > 0 ? transformations : [],
    })
  }

  /**
   * Crop video/image using Cloudinary
   */
  static crop(
    publicId: string,
    params: { x: number; y: number; width: number; height: number },
    resourceType: 'video' | 'image' = 'video'
  ): string {
    const { x, y, width, height } = params
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      transformation: [
        {
          width: width,
          height: height,
          x: x,
          y: y,
          crop: 'crop',
        },
      ],
    })
  }

  /**
   * Rotate video/image using Cloudinary
   */
  static rotate(
    publicId: string,
    angle: number,
    resourceType: 'video' | 'image' = 'video'
  ): string {
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      transformation: [
        {
          angle: angle,
        },
      ],
    })
  }

  private static parseColor(color: string): string {
    const colorMap: { [key: string]: string } = {
      'white': 'white',
      'black': 'black',
      'red': 'red',
      'blue': 'blue',
      'yellow': 'yellow',
      'green': 'green',
      'cyan': 'cyan',
      'magenta': 'magenta',
    }
    return colorMap[color.toLowerCase()] || color || 'white'
  }
}




