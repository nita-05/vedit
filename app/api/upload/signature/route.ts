import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Initialize Cloudinary
function initializeCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    return false
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  })

  return true
}

export async function POST(request: NextRequest) {
  try {
    if (!initializeCloudinary()) {
      return NextResponse.json(
        { error: 'Cloudinary configuration missing' },
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const body = await request.json()
    const { timestamp, folder = 'vedit', resourceType = 'auto' } = body

    const uploadTimestamp = timestamp || Math.round(new Date().getTime() / 1000)
    
    // Generate signature for client-side upload
    // Must include all parameters that will be sent to Cloudinary
    const paramsToSign: Record<string, any> = {
      timestamp: uploadTimestamp,
    }
    
    if (folder) {
      paramsToSign.folder = folder
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET!
    )

    return NextResponse.json({
      signature,
      timestamp: uploadTimestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder: folder,
    })
  } catch (error: any) {
    console.error('❌ Error generating upload signature:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate upload signature' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

