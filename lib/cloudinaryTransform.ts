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

