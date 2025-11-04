import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// System prompt for voice command interpretation
const VOICE_SYSTEM_PROMPT = `You are VIA, an AI video editing assistant. You receive voice transcriptions and convert them to clear, actionable video editing commands. 

Analyze the voice input and return a JSON object with:
{
  "command": "clear natural language command",
  "confidence": 0.0-1.0,
  "suggestions": ["alternative interpretation 1", "alternative interpretation 2"]
}

Examples:
- Voice: "Make the background blur softer"
  Response: {"command": "Make the background blur softer", "confidence": 0.95, "suggestions": []}

- Voice: "Add upbeat music"
  Response: {"command": "Add upbeat background music", "confidence": 0.9, "suggestions": ["Add upbeat music track"]}

- Voice: "Trim the intro to 5 seconds"
  Response: {"command": "Trim the first 5 seconds of the video", "confidence": 0.95, "suggestions": []}

If the command is unclear, suggest alternatives.`

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { transcript } = await request.json()

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid transcript' },
        { status: 400 }
      )
    }

    // Use Whisper API for better transcription if needed, or interpret the transcript
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: VOICE_SYSTEM_PROMPT },
        { role: 'user', content: `Voice transcript: "${transcript}"` },
      ],
      response_format: { type: 'json_object' },
    })

    const interpretation = JSON.parse(completion.choices[0].message.content || '{}')

    return NextResponse.json({
      success: true,
      command: interpretation.command || transcript,
      confidence: interpretation.confidence || 0.8,
      suggestions: interpretation.suggestions || [],
      originalTranscript: transcript,
    })
  } catch (error) {
    console.error('Voice command API error:', error)
    return NextResponse.json(
      { error: 'Failed to process voice command', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

