import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { v2 as cloudinary } from 'cloudinary'
import { CloudinaryTransformProcessor } from '@/lib/cloudinaryTransform'

// Configure Cloudinary - use server-side env vars (without NEXT_PUBLIC_)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Preview API - Generate instant preview using Cloudinary transformations
 * This provides real-time preview without FFmpeg processing
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { publicId, operation, params, resourceType = 'video' } = body

    if (!publicId) {
      return NextResponse.json({ error: 'Public ID is required' }, { status: 400 })
    }

    console.log(`👁️ Preview request: ${operation} on ${publicId}`)

    // Generate preview URL based on operation
    let previewUrl: string

    switch (operation) {
      case 'addText':
        previewUrl = CloudinaryTransformProcessor.addTextOverlay(publicId, {
          text: params.text || 'Preview Text',
          position: params.position || 'bottom',
          fontSize: params.fontSize || 36,
          fontColor: params.fontColor || 'white',
          backgroundColor: params.backgroundColor,
          style: params.preset || 'bold',
        })
        break

      case 'colorGrade':
        // Use Cloudinary color adjustments
        previewUrl = CloudinaryTransformProcessor.applyColorGrade(publicId, params.preset || params.style, resourceType)
        break

      case 'applyEffect':
        // Use Cloudinary effects
        previewUrl = CloudinaryTransformProcessor.applyEffect(publicId, params.preset, resourceType)
        break

      case 'crop':
        previewUrl = CloudinaryTransformProcessor.crop(publicId, params, resourceType)
        break

      case 'rotate':
        previewUrl = CloudinaryTransformProcessor.rotate(publicId, params.rotation || 0, resourceType)
        break

      default:
        // For operations not supported by Cloudinary, return original
        const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType })
        previewUrl = resource.secure_url
    }

    return NextResponse.json({
      success: true,
      previewUrl,
      operation,
      message: 'Preview generated successfully',
    })
  } catch (error: any) {
    console.error('❌ Preview error:', error)
    return NextResponse.json(
      {
        error: 'Preview generation failed',
        message: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

