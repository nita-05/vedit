import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

// OpenAI TTS available voices
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const
type OpenAIVoice = typeof OPENAI_VOICES[number]

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      )
    }

    const { text, voice = 'alloy', model = 'tts-1', speed = 1.0 } = await request.json()

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    // OpenAI TTS has a maximum text length limit (4096 characters for most models)
    const MAX_TEXT_LENGTH = 4096
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { 
          error: `Text is too long. Maximum ${MAX_TEXT_LENGTH} characters allowed. Your text has ${text.length} characters.`,
          textLength: text.length,
          maxLength: MAX_TEXT_LENGTH
        },
        { status: 400 }
      )
    }

    // Validate voice
    if (!OPENAI_VOICES.includes(voice as OpenAIVoice)) {
      return NextResponse.json(
        { error: `Invalid voice. Must be one of: ${OPENAI_VOICES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate speed (OpenAI TTS supports 0.25 to 4.0)
    const validSpeed = Math.max(0.25, Math.min(4.0, speed))

    // Validate model
    const validModel = model === 'tts-1' || model === 'tts-1-hd' ? model : 'tts-1'

    console.log(`🎤 Generating TTS: voice=${voice}, model=${validModel}, speed=${validSpeed}, text_length=${text.length}`)

    // Generate speech using OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: validModel,
      voice: voice as OpenAIVoice,
      input: text,
      speed: validSpeed,
    })

    // Convert response to buffer
    const buffer = Buffer.from(await mp3.arrayBuffer())

    // Upload to Cloudinary for persistent storage and CDN delivery
    let audioUrl: string
    try {
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video', // Cloudinary treats audio as video
            folder: 'vedit/tts-audio',
            public_id: `tts_${Date.now()}_${session.user.email?.replace('@', '_') || 'user'}`,
            format: 'mp3',
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result)
          }
        )
        uploadStream.end(buffer)
      }) as any

      audioUrl = uploadResult.secure_url
    } catch (cloudinaryError: any) {
      console.error('⚠️ Cloudinary upload failed, using base64 fallback:', cloudinaryError)
      // Fallback: Return base64 encoded audio if Cloudinary fails
      const base64Audio = buffer.toString('base64')
      const dataUrl = `data:audio/mpeg;base64,${base64Audio}`
      
      return NextResponse.json({
        success: true,
        audioUrl: dataUrl,
        voice,
        model: validModel,
        speed: validSpeed,
        textLength: text.length,
        message: 'Voice generated successfully! (Using fallback storage)',
        warning: 'Audio stored temporarily. Please download to save permanently.',
      })
    }

    console.log(`✅ TTS generated successfully: ${audioUrl}`)

    return NextResponse.json({
      success: true,
      audioUrl,
      voice,
      model: validModel,
      speed: validSpeed,
      textLength: text.length,
      message: 'Voice generated successfully using OpenAI TTS!',
    })
  } catch (error: any) {
    console.error('❌ TTS generation error:', error)
    
    // Handle OpenAI API errors
    if (error?.status === 401) {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key. Please check your configuration.' },
        { status: 401 }
      )
    }
    
    if (error?.status === 429) {
      return NextResponse.json(
        { error: 'OpenAI API rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to generate voice', 
        details: error?.message || 'Unknown error',
        hint: 'Please check OpenAI API key and try again.'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to list available voices
export async function GET() {
  return NextResponse.json({
    success: true,
    voices: OPENAI_VOICES.map(voice => ({
      id: voice,
      name: voice.charAt(0).toUpperCase() + voice.slice(1),
      description: `OpenAI ${voice} voice`,
    })),
    models: ['tts-1', 'tts-1-hd'],
    speedRange: { min: 0.25, max: 4.0, default: 1.0 },
  })
}

