import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import OpenAI from 'openai'
import { v2 as cloudinary } from 'cloudinary'
import { VideoProcessor } from '@/lib/videoProcessor'
import { saveEditHistory } from '@/lib/db'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const videoProcessor = new VideoProcessor()

const TRAILER_SYSTEM_PROMPT = `You are VIA's AI Trailer Generator. Analyze video scenes and create a structured plan for a cinematic trailer.

Given video information, return JSON:
{
  "style": "Epic|Emotional|Fast-Cut",
  "duration": 15-30, // seconds
  "keyMoments": [{"start": 0, "end": 3, "description": "..."}, ...],
  "musicPreset": "Cinematic Epic|Emotional|Upbeat",
  "transitions": [{"type": "Fade|Zoom|...", "at": 5}, ...],
  "textOverlays": [{"text": "...", "time": 2, "duration": 3}, ...],
  "outroText": "Created with VEDIT"
}`

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { videoPublicId, style = 'Epic' } = await request.json()

    if (!videoPublicId) {
      return NextResponse.json(
        { error: 'Missing videoPublicId' },
        { status: 400 }
      )
    }

    // Get video metadata from Cloudinary
    const resource = await cloudinary.api.resource(videoPublicId, {
      resource_type: 'video',
    })

    // Analyze video with GPT-5
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: TRAILER_SYSTEM_PROMPT },
        { role: 'user', content: `Generate a ${style} style trailer for a video (duration: ${resource.duration}s, format: ${resource.format}). Create a cinematic 15-30 second trailer.` },
      ],
      response_format: { type: 'json_object' },
    })

    const trailerPlan = JSON.parse(completion.choices[0].message.content || '{}')

    // Process video with FFmpeg to create trailer
    const originalUrl = resource.secure_url
    const trailerInstructions = {
      operation: 'generateTrailer',
      params: {
        style: trailerPlan.style || style,
        duration: trailerPlan.duration || 20,
        keyMoments: trailerPlan.keyMoments || [],
        musicPreset: trailerPlan.musicPreset || 'Cinematic Epic',
        transitions: trailerPlan.transitions || [],
        textOverlays: trailerPlan.textOverlays || [],
        outroText: trailerPlan.outroText || 'Created with VEDIT',
      },
    }

    // Create trailer using video processor
    const trailerUrl = await videoProcessor.process(originalUrl, trailerInstructions)

    // Save to exports folder
    const exportUrl = await videoProcessor.exportVideo(trailerUrl, 'mp4', 'high')

    // Save edit history
    await saveEditHistory(session.user.email, videoPublicId, `Generated ${style} trailer`, {
      trailerPlan,
      trailerUrl: exportUrl,
      timestamp: new Date(),
    })

    return NextResponse.json({
      success: true,
      trailerUrl: exportUrl,
      shareUrl: exportUrl, // In production, generate a shorter share URL
      duration: trailerPlan.duration,
      style: trailerPlan.style,
      message: `🎬 Generated ${style} style trailer successfully!`,
    })
  } catch (error) {
    console.error('Trailer generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate trailer', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

