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

    // Build Cloudinary URL - always use HTTPS
    // Use simplified Cloudinary text overlay format
    // Note: We don't need to escape text for SDK - it handles it automatically
    
    // Build transformation using Cloudinary SDK format
    const transformation: any = {
      overlay: {
        text: text, // Use unescaped text for SDK
        font_family: 'Arial',
        font_size: size,
        font_weight: style === 'bold' ? 'bold' : 'normal',
      },
      color: color,
    }
    
    // Set gravity (remove 'g_' prefix if present)
    const gravityValue = gravity.replace(/^g_/, '')
    transformation.gravity = gravityValue
    
    // Add Y offset based on position (Cloudinary uses positive for top, negative for bottom)
    if (position.includes('top')) {
      transformation.y = 20
    } else if (position.includes('bottom')) {
      transformation.y = -20
    }
    
    // Note: Background color for text overlay needs to be handled differently
    // Cloudinary doesn't support background directly in text overlay
    // If background is needed, we'd need a different approach
    
    const url = cloudinary.url(publicId, {
      resource_type: 'video',
      secure: true, // Force HTTPS to avoid mixed content issues
      transformation: [transformation],
    })
    
    // Add cache-busting timestamp to force browser refresh
    const timestamp = Date.now()
    const finalUrl = url.includes('?') 
      ? `${url}&_t=${timestamp}` 
      : `${url}?_t=${timestamp}`
    
    console.log(`☁️ Generated Cloudinary text overlay URL: ${finalUrl.substring(0, 100)}...`)
    
    return finalUrl
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
      'warm': { brightness: 10, saturation: 30, effect: 'colorize:20:yellow' },
      'cool': { brightness: 5, saturation: 25, effect: 'colorize:20:blue' },
      'vintage': { effect: 'sepia:50', saturation: -20 },
      'moody': { brightness: -20, contrast: 30, saturation: -10 },
      'cinematic': { brightness: 5, contrast: 10, saturation: -10 },
      'noir': { effect: 'grayscale' },
      'sepia': { effect: 'sepia:100' },
      'dreamy': { brightness: 5, saturation: -5, effect: 'blur:100' },
      'vibrant': { saturation: 40, brightness: 5 },
      'muted': { saturation: -30, brightness: -5 },
      'cyberpunk': { saturation: 50, brightness: 20, contrast: 20 },
      'neon': { saturation: 60, brightness: 10, contrast: 15 },
      'golden hour': { brightness: 15, saturation: 30, effect: 'colorize:30:gold' },
      'high contrast': { contrast: 50, brightness: 5 },
      'black & white': { effect: 'grayscale' },
      'monochrome': { effect: 'grayscale' },
      'natural tone': { brightness: 5, saturation: 10 },
      'studio tone': { brightness: 10, contrast: 15, saturation: 10 },
      'bright punch': { brightness: 15, saturation: 35, contrast: 20 },
    }

    const presetConfig = presets[preset?.toLowerCase()] || {}
    
    // Build single transformation object with all properties
    const transformation: any = {}
    
    if (presetConfig.brightness !== undefined) {
      transformation.brightness = presetConfig.brightness
    }
    if (presetConfig.contrast !== undefined) {
      transformation.contrast = presetConfig.contrast
    }
    if (presetConfig.saturation !== undefined) {
      transformation.saturation = presetConfig.saturation
    }
    if (presetConfig.effect) {
      transformation.effect = presetConfig.effect
    }
    
    // If no transformations, use a minimal effect to avoid empty transformation
    const transformations = Object.keys(transformation).length > 0 
      ? [transformation] 
      : []

    return cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true, // Force HTTPS to avoid mixed content issues
      transformation: transformations.length > 0 ? transformations : [],
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
      secure: true, // Force HTTPS to avoid mixed content issues
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
      secure: true, // Force HTTPS to avoid mixed content issues
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
      secure: true, // Force HTTPS to avoid mixed content issues
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




