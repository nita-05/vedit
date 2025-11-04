import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import OpenAI from 'openai'
import { v2 as cloudinary } from 'cloudinary'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const MUSIC_RECOMMENDER_PROMPT = `You are VIA's Emotion-based Music Recommender. Analyze video transcript and visual tone to recommend music.

Available music presets:
Ambient, Upbeat, Emotional, Action, Lo-Fi, Trap Beat, Cinematic Epic, Acoustic, Piano Mood, Dark Tension, Happy Vibe, Travel Theme, Dramatic Rise, Fast Cut Beat, EDM Drop, Dream Pop, Sad Violin, Percussive Hit, Calm Nature Ambience, Techno, Corporate, Pop, Hip-Hop, Retro Synth, Inspirational

Return JSON:
{
  "emotion": "happy|sad|energetic|calm|dramatic|inspiring|...",
  "recommendedPresets": [
    {"preset": "...", "match": 0.9, "reason": "..."},
    ...
  ],
  "bestMatch": "preset name",
  "volume": 0.3-0.5
}`

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { videoPublicId, transcript } = await request.json()

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

    // Analyze emotion from transcript and visual tone
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: MUSIC_RECOMMENDER_PROMPT },
        { role: 'user', content: `Analyze this video content and recommend music:
Video duration: ${resource.duration}s
Transcript: ${transcript || 'No transcript available'}
Visual tone: Analyze based on video metadata and recommend music that matches the emotional tone.` },
      ],
      response_format: { type: 'json_object' },
    })

    const recommendation = JSON.parse(completion.choices[0].message.content || '{}')

    return NextResponse.json({
      success: true,
      emotion: recommendation.emotion || 'neutral',
      recommendedPresets: recommendation.recommendedPresets || [
        { preset: 'Cinematic Epic', match: 0.8, reason: 'General cinematic feel' }
      ],
      bestMatch: recommendation.bestMatch || 'Cinematic Epic',
      volume: recommendation.volume || 0.3,
      message: `🎧 Recommended ${recommendation.bestMatch || 'music'} for ${recommendation.emotion || 'this'} tone`,
    })
  } catch (error) {
    console.error('Music recommendation error:', error)
    return NextResponse.json(
      { error: 'Failed to recommend music', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

