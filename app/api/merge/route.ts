import { NextRequest, NextResponse } from 'next/server'
import { VideoProcessor } from '@/lib/videoProcessor'

export async function POST(req: NextRequest) {
  try {
    const { clipUrls } = await req.json()

    if (!clipUrls || !Array.isArray(clipUrls) || clipUrls.length < 2) {
      return NextResponse.json(
        { success: false, error: 'At least 2 clip URLs are required' },
        { status: 400 }
      )
    }

    console.log(`🔗 API: Merging ${clipUrls.length} clips...`)

    const processor = new VideoProcessor()
    const mergedUrl = await processor.mergeClips(clipUrls)

    console.log(`✅ API: Merge completed, URL: ${mergedUrl}`)

    return NextResponse.json({
      success: true,
      mergedUrl,
      message: `Successfully merged ${clipUrls.length} clips`
    })
  } catch (error: any) {
    console.error('❌ API: Merge error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to merge clips' },
      { status: 500 }
    )
  }
}

