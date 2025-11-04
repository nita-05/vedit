import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { v2 as cloudinary } from 'cloudinary'
import { VideoProcessor } from '@/lib/videoProcessor'

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

    const body = await request.json()
    const { videoUrl, videoPublicId, format = 'mp4', quality = 'high' } = body

    // Use provided videoUrl (edited video) or fetch from Cloudinary using publicId (original)
    let finalVideoUrl = videoUrl

    if (!finalVideoUrl && videoPublicId) {
      // Fallback: Get video URL from Cloudinary if videoUrl not provided
      console.log('📥 Export: Using publicId to fetch video from Cloudinary:', videoPublicId)
      const resource = await cloudinary.api.resource(videoPublicId, {
        resource_type: 'video',
      })
      finalVideoUrl = resource.secure_url
    }

    if (!finalVideoUrl) {
      return NextResponse.json(
        { error: 'Video URL or publicId is required' },
        { status: 400 }
      )
    }

    console.log('📤 Export: Using video URL:', finalVideoUrl)

    // Export video using FFmpeg server-side (use the edited video URL)
    const exportedUrl = await videoProcessor.exportVideo(finalVideoUrl, format, quality)

    // Generate share URL (use publicId if available, otherwise generate from URL)
    const shareId = videoPublicId || finalVideoUrl.split('/').pop()?.split('.')[0] || 'exported'
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/share/${shareId}`

    return NextResponse.json({
      success: true,
      message: 'Video exported successfully',
      videoUrl: exportedUrl,
      downloadUrl: exportedUrl,
      shareUrl,
      format,
      quality,
      published: false,
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to export video',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
