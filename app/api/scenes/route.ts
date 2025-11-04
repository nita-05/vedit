import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

    const { videoPublicId } = await request.json()

    if (!videoPublicId) {
      return NextResponse.json(
        { error: 'Missing videoPublicId' },
        { status: 400 }
      )
    }

    // Get video from Cloudinary
    const resource = await cloudinary.api.resource(videoPublicId, {
      resource_type: 'video',
    })

    // Generate scene thumbnails at regular intervals
    const duration = resource.duration || 60
    const sceneCount = Math.max(3, Math.floor(duration / 10))
    const intervals: number[] = []

    for (let i = 0; i < sceneCount; i++) {
      const time = (duration / sceneCount) * i
      intervals.push(time)
    }

    // Generate thumbnails using Cloudinary
    const scenes = await Promise.all(
      intervals.map(async (time, index) => {
        const thumbnailUrl = cloudinary.url(videoPublicId, {
          resource_type: 'video',
          format: 'jpg',
          transformation: [
            { width: 640, height: 360, crop: 'fill' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
          start_offset: time,
        })

        return {
          id: `scene_${index}`,
          timestamp: time,
          thumbnailUrl,
          startTime: time,
          endTime: intervals[index + 1] || duration,
          duration: (intervals[index + 1] || duration) - time,
        }
      })
    )

    return NextResponse.json({
      success: true,
      scenes,
      totalScenes: scenes.length,
      videoDuration: duration,
    })
  } catch (error) {
    console.error('Scene detection error:', error)
    return NextResponse.json(
      { error: 'Failed to detect scenes', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

