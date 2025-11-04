import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const publicId = searchParams.get('publicId')

    if (!publicId) {
      return NextResponse.json({ error: 'Missing publicId' }, { status: 400 })
    }

    // In production, fetch actual timeline data from database or Cloudinary metadata
    // For now, return sample data
    const clips = [
      {
        id: '1',
        start: 0,
        end: 10,
        name: 'Clip 1',
      },
      {
        id: '2',
        start: 10,
        end: 20,
        name: 'Clip 2',
      },
    ]

    return NextResponse.json({ clips })
  } catch (error) {
    console.error('Timeline API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch timeline' },
      { status: 500 }
    )
  }
}
