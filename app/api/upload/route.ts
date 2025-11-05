import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Configure Cloudinary (moved inside to avoid initialization errors)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    console.log(`📤 Upload request received`)
    // Validate Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Missing Cloudinary environment variables')
      return NextResponse.json(
        { error: 'Cloudinary configuration is missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const uploadPreset = formData.get('upload_preset') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    console.log(`📦 File received: ${file.name}, ${(file.size / (1024 * 1024)).toFixed(2)}MB, type: ${file.type}`)

    // Validate file size (500MB = 500 * 1024 * 1024 bytes)
    const maxSize = 500 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the 500MB limit` },
        { status: 400 }
      )
    }

    // Validate file type
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    
    if (!isVideo && !isImage) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Please upload a video or image file.` },
        { status: 400 }
      )
    }

    const resourceType = isVideo ? 'video' : 'image'

    // Convert File to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

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

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error)
              reject(error)
            } else {
              resolve(result)
            }
          }
        )
        .end(buffer)
    })

    const result = uploadResult as any
    
    const uploadDuration = Date.now() - startTime
    console.log(`✅ Cloudinary upload complete in ${(uploadDuration / 1000).toFixed(2)}s`)

    if (!result || !result.secure_url || !result.public_id) {
      return NextResponse.json(
        { error: 'Upload completed but received invalid response from Cloudinary' },
        { status: 500 }
      )
    }

    console.log(`📺 Upload result:`, { url: result.secure_url, publicId: result.public_id })
    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    
    // Provide more specific error messages
    let errorMessage = 'Failed to upload file'
    if (error?.message) {
      errorMessage = error.message
    } else if (error?.error?.message) {
      errorMessage = error.error.message
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
