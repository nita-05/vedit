import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { v2 as cloudinary } from 'cloudinary'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { videoPublicId, sceneId, brandText } = await request.json()

    if (!videoPublicId) {
      return NextResponse.json(
        { error: 'Missing videoPublicId' },
        { status: 400 }
      )
    }

    // Get video metadata
    const resource = await cloudinary.api.resource(videoPublicId, {
      resource_type: 'video',
    })

    const duration = resource.duration || 60

    // Generate 3 thumbnail variants
    const timestamps = sceneId
      ? [duration * 0.25, duration * 0.5, duration * 0.75] // Specific scene
      : [duration * 0.2, duration * 0.5, duration * 0.8] // General best frames

    const thumbnails = await Promise.all(
      timestamps.map(async (timestamp, index) => {
        let thumbnailUrl = cloudinary.url(videoPublicId, {
          resource_type: 'video',
          format: 'jpg',
          transformation: [
            { width: 1280, height: 720, crop: 'fill', gravity: 'auto' },
            { quality: 'auto', fetch_format: 'auto' },
            { effect: 'enhance' },
            { overlay: brandText ? {
              text: brandText,
              font_family: 'Arial',
              font_size: 60,
              font_weight: 'bold',
              color: 'white',
            } : undefined },
            { start_offset: timestamp },
          ],
        })

        return {
          id: `thumb_${index}`,
          url: thumbnailUrl,
          timestamp,
          variant: index + 1,
        }
      })
    )

    return NextResponse.json({
      success: true,
      thumbnails,
      message: `🖼️ Generated ${thumbnails.length} thumbnail variants!`,
    })
  } catch (error) {
    console.error('Thumbnail generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate thumbnails', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

