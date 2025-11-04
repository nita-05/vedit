import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import OpenAI from 'openai'
import { v2 as cloudinary } from 'cloudinary'
import { VideoProcessor } from '@/lib/videoProcessor'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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

    const { videoPublicId, transcript, style = 'Glow' } = await request.json()

    if (!videoPublicId) {
      return NextResponse.json(
        { error: 'Missing videoPublicId' },
        { status: 400 }
      )
    }

    // Use Whisper API to transcribe if transcript not provided
    let finalTranscript = transcript
    if (!finalTranscript) {
      const resource = await cloudinary.api.resource(videoPublicId, {
        resource_type: 'video',
      })
      const videoUrl = resource.secure_url
      
      // Transcribe audio using Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: await fetch(videoUrl).then(r => r.blob()) as any,
        model: 'whisper-1',
      })
      finalTranscript = transcription.text
    }

    // Generate timed captions from transcript
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Generate timed captions in JSON format: [{"text": "...", "start": 0, "end": 3, "style": "Glow|Typewriter|Fade|Pop"}]'
        },
        {
          role: 'user',
          content: `Generate captions from this transcript with timing: "${finalTranscript}". Split into logical phrases of 2-5 seconds each. Style: ${style}.`
        },
      ],
      response_format: { type: 'json_object' },
    })

    const captionData = JSON.parse(completion.choices[0].message.content || '{}')
    const captions = Array.isArray(captionData.captions) ? captionData.captions : []

    // Process video to add captions
    const resource = await cloudinary.api.resource(videoPublicId, {
      resource_type: 'video',
    })

    const instruction = {
      operation: 'addCaptions',
      params: {
        captions,
        style,
      },
    }

    const processedUrl = await videoProcessor.process(resource.secure_url, instruction)

    return NextResponse.json({
      success: true,
      videoUrl: processedUrl,
      captions,
      transcript: finalTranscript,
      message: `💬 Generated captions with ${style} style!`,
    })
  } catch (error) {
    console.error('Caption generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate captions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

