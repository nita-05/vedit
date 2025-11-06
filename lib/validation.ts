/**
 * Input Validation Utilities
 * Validates user inputs and API parameters
 */

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate video editing operation parameters
 */
export function validateVideoOperation(operation: string, params: any): ValidationResult {
  const errors: string[] = []

  switch (operation) {
    case 'addText':
      if (!params.text || params.text.trim().length === 0) {
        errors.push('Text content is required for addText operation')
      }
      if (params.fontSize && (params.fontSize < 12 || params.fontSize > 120)) {
        errors.push('Font size must be between 12 and 120')
      }
      break

    case 'addCaptions':
      // Captions don't need text (auto-generated)
      break

    case 'trim':
      if (params.start !== undefined && params.start < 0) {
        errors.push('Start time cannot be negative')
      }
      if (params.end !== undefined && params.end <= (params.start || 0)) {
        errors.push('End time must be greater than start time')
      }
      break

    case 'adjustSpeed':
      if (![0.5, 1.0, 1.5, 2.0].includes(params.speed)) {
        errors.push('Speed must be 0.5, 1.0, 1.5, or 2.0')
      }
      break

    case 'rotate':
      if (params.rotation < -180 || params.rotation > 180) {
        errors.push('Rotation must be between -180 and 180 degrees')
      }
      break

    case 'crop':
      if (!params.x || !params.y || !params.width || !params.height) {
        errors.push('Crop requires x, y, width, and height parameters')
      }
      if (params.width <= 0 || params.height <= 0) {
        errors.push('Crop width and height must be positive')
      }
      break

    case 'applyEffect':
    case 'colorGrade':
      if (params.startTime !== undefined && params.startTime < 0) {
        errors.push('Start time cannot be negative')
      }
      if (params.endTime !== undefined && params.endTime <= (params.startTime || 0)) {
        errors.push('End time must be greater than start time')
      }
      if (params.intensity !== undefined && (params.intensity < 0 || params.intensity > 1)) {
        errors.push('Intensity must be between 0 and 1')
      }
      break
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate video public ID
 */
export function validatePublicId(publicId: string): ValidationResult {
  const errors: string[] = []

  if (!publicId || publicId.trim().length === 0) {
    errors.push('Public ID is required')
  }

  if (publicId.length > 200) {
    errors.push('Public ID is too long')
  }

  // Check for invalid characters
  if (!/^[a-zA-Z0-9_\/\-\.]+$/.test(publicId)) {
    errors.push('Public ID contains invalid characters')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate file upload
 */
export function validateFileUpload(file: File): ValidationResult {
  const errors: string[] = []

  const maxSize = 500 * 1024 * 1024 // 500MB
  const allowedVideoTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm']
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  if (!file) {
    errors.push('File is required')
    return { valid: false, errors }
  }

  if (file.size > maxSize) {
    errors.push(`File size must be less than ${maxSize / 1024 / 1024}MB`)
  }

  const isVideo = allowedVideoTypes.includes(file.type)
  const isImage = allowedImageTypes.includes(file.type)

  if (!isVideo && !isImage) {
    errors.push(`File type ${file.type} is not supported. Allowed: MP4, MOV, AVI, WebM, JPG, PNG, GIF, WebP`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''
  
  // Remove potentially dangerous characters
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .substring(0, 1000) // Limit length
}

/**
 * Validate environment variables
 */
export function validateEnvVars(): ValidationResult {
  const errors: string[] = []
  const required = [
    'MONGODB_URI',
    'NEXTAUTH_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'OPENAI_API_KEY',
  ]

  required.forEach((key) => {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}
