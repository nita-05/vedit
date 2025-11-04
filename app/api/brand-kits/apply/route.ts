import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getProjects } from '@/lib/db'
import { VideoProcessor } from '@/lib/videoProcessor'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const videoProcessor = new VideoProcessor()

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { brandKitId, videoPublicId, videoUrl } = await request.json()

    if (!brandKitId || !videoPublicId) {
      return NextResponse.json(
        { error: 'Brand kit ID and video public ID are required' },
        { status: 400 }
      )
    }

    // Get brand kit
    const projects = await getProjects(session.user.email)
    const brandKit = projects.find(p => p.id === brandKitId && p.projectData?.type === 'brandKit')

    if (!brandKit) {
      return NextResponse.json(
        { error: 'Brand kit not found' },
        { status: 404 }
      )
    }

    const kit = brandKit.brandKit || brandKit.projectData?.brandKit

    // Use provided videoUrl or fetch from Cloudinary
    let inputVideoUrl = videoUrl
    if (!inputVideoUrl) {
      const resource = await cloudinary.api.resource(videoPublicId, {
        resource_type: 'video',
      })
      inputVideoUrl = resource.secure_url
    }

    // Build instruction to apply brand kit
    const instruction = {
      operation: 'applyBrandKit',
      params: {
        logoUrl: kit.logoUrl,
        colors: kit.colors || [],
        fonts: kit.fonts || {},
        watermark: kit.watermark,
        preset: kit.preset || 'Default',
      },
    }

    // Process video with brand kit
    const processedUrl = await videoProcessor.process(inputVideoUrl, instruction)

    return NextResponse.json({
      success: true,
      videoUrl: processedUrl,
      message: `🎨 Brand kit "${kit.name}" applied successfully!`,
    })
  } catch (error) {
    console.error('Brand kit apply error:', error)
    return NextResponse.json(
      { error: 'Failed to apply brand kit', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

