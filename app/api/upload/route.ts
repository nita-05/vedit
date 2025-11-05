import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // 60 seconds (capped at 10s on free tier, full 60s on Pro plan)

// Initialize Cloudinary configuration
function initializeCloudinary() {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Missing Cloudinary environment variables')
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    })

    return true
  } catch (error) {
    console.error('Failed to initialize Cloudinary:', error)
    return false
  }
}

export async function POST(request: NextRequest) {
  // Top-level error handler to catch any initialization errors
  // IMPORTANT: Vercel serverless functions have platform-level body size limits:
  // - Hobby plan: ~4.5MB
  // - Pro plan: ~50MB
  // - Enterprise: Custom limits
  // If files exceed these limits, Vercel may return HTML error pages before our code runs.
  // The client-side code now handles HTML error responses gracefully.
  try {
    const startTime = Date.now()
    const environment = process.env.VERCEL ? 'production (Vercel)' : 'development'
    console.log(`📤 Upload request received at ${new Date().toISOString()} (${environment})`)
    
    // Check request body size early (before parsing)
    const contentLength = request.headers.get('content-length')
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024)
      const sizeInBytes = parseInt(contentLength)
      console.log(`📦 Request size: ${sizeInMB.toFixed(2)}MB (${sizeInBytes} bytes)`)
      
      // Warn about Vercel limits
      if (process.env.VERCEL && sizeInBytes > 4.5 * 1024 * 1024) {
        console.warn(`⚠️  WARNING: File size (${sizeInMB.toFixed(2)}MB) may exceed Vercel's platform limit (~4.5MB for Hobby plan). Upload may fail.`)
      }
      
      if (sizeInBytes > 500 * 1024 * 1024) {
        console.error('❌ File size exceeds 500MB limit')
        return NextResponse.json(
          { error: `File size (${sizeInMB.toFixed(2)}MB) exceeds the 500MB limit` },
          { 
            status: 413,
            headers: {
              'Content-Type': 'application/json',
            }
          }
        )
      }
    } else {
      console.warn('⚠️  Content-Length header not provided. Cannot pre-validate file size.')
    }
    
    // Initialize and validate Cloudinary configuration
    if (!initializeCloudinary()) {
      console.error('❌ Cloudinary configuration missing')
      return NextResponse.json(
        { error: 'Cloudinary configuration is missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.' },
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (error: any) {
      console.error('❌ Failed to parse form data:', error)
      // Check if error is due to body size limit
      const errorMessage = error?.message || String(error)
      if (errorMessage.includes('body') || errorMessage.includes('size') || errorMessage.includes('413') || errorMessage.includes('PayloadTooLargeError')) {
        return NextResponse.json(
          { error: 'File size exceeds the maximum allowed size. Please upload a file smaller than 500MB. For larger files, consider compressing the video first.' },
          { 
            status: 413,
            headers: {
              'Content-Type': 'application/json',
            }
          }
        )
      }
      return NextResponse.json(
        { error: `Failed to parse form data: ${errorMessage}. Please ensure the request is properly formatted and the file size is within limits.` },
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
    }

    const file = formData.get('file') as File
    const uploadPreset = formData.get('upload_preset') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
    }
    
    console.log(`📦 File received: ${file.name}, ${(file.size / (1024 * 1024)).toFixed(2)}MB, type: ${file.type}`)

    // Validate file size (500MB = 500 * 1024 * 1024 bytes)
    const maxSize = 500 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the 500MB limit` },
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
    }

    // Validate file type
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    
    if (!isVideo && !isImage) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Please upload a video or image file.` },
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
    }

    const resourceType = isVideo ? 'video' : 'image'

    // Convert File to buffer
    let bytes: ArrayBuffer
    let buffer: Buffer
    try {
      bytes = await file.arrayBuffer()
      buffer = Buffer.from(bytes)
    } catch (error: any) {
      console.error('❌ Failed to read file:', error)
      return NextResponse.json(
        { error: 'Failed to read file data. The file may be corrupted or inaccessible.' },
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
    }

    // Upload to Cloudinary
    const uploadOptions: any = {
      resource_type: resourceType,
      folder: 'vedit',
      // For videos, keep original format to avoid transcoding delay
      // Cloudinary will stream original video immediately
    }

    // Add upload preset if provided (for unsigned uploads)
    if (uploadPreset) {
      uploadOptions.upload_preset = uploadPreset
    }

    let uploadResult: any
    try {
      uploadResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Upload timeout: The upload took too long to complete. Please try a smaller file or check your connection.'))
        }, 55000) // 55 seconds timeout (slightly less than 60s maxDuration)

        cloudinary.uploader
          .upload_stream(
            uploadOptions,
            (error, result) => {
              clearTimeout(timeout)
              if (error) {
                console.error('❌ Cloudinary upload error:', error)
                reject(error)
              } else {
                resolve(result)
              }
            }
          )
          .end(buffer)
      })
    } catch (uploadError: any) {
      console.error('❌ Cloudinary upload failed:', uploadError)
      
      // Provide more specific error messages for Cloudinary errors
      let errorMessage = 'Failed to upload file to Cloudinary'
      if (uploadError?.message) {
        errorMessage = uploadError.message
      } else if (uploadError?.error?.message) {
        errorMessage = uploadError.error.message
      } else if (typeof uploadError === 'string') {
        errorMessage = uploadError
      }

      return NextResponse.json(
        { error: errorMessage },
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
    }

    const result = uploadResult as any
    
    const uploadDuration = Date.now() - startTime
    console.log(`✅ Cloudinary upload complete in ${(uploadDuration / 1000).toFixed(2)}s`)

    if (!result || !result.secure_url || !result.public_id) {
      console.error('❌ Invalid Cloudinary response:', result)
      return NextResponse.json(
        { error: 'Upload completed but received invalid response from Cloudinary' },
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
    }

    console.log(`📺 Upload result:`, { url: result.secure_url, publicId: result.public_id })
    return NextResponse.json(
      {
        url: result.secure_url,
        publicId: result.public_id,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        }
      }
    )
  } catch (error: any) {
    console.error('❌ Unexpected upload error:', error)
    
    // Provide more specific error messages
    let errorMessage = 'Failed to upload file'
    if (error?.message) {
      errorMessage = error.message
    } else if (error?.error?.message) {
      errorMessage = error.error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    }

    // Always return JSON, never HTML
    // This ensures Next.js doesn't return its default HTML error page
    return NextResponse.json(
      { error: errorMessage },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    )
  }
}
