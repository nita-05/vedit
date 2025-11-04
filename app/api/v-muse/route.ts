import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const V_MUSE_PROMPT = `You are V-MUSE, VEDIT's creative inspiration engine. You suggest creative cut ideas, intro concepts, and editing inspiration based on video content.

Given video information, suggest:
{
  "suggestions": [
    {
      "type": "intro|cut|transition|effect",
      "idea": "Creative description",
      "style": "...",
      "command": "VIA command to execute"
    },
    ...
  ],
  "topSuggestion": {...}
}`

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { videoPublicId, context } = await request.json()

    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: V_MUSE_PROMPT },
        { role: 'user', content: `Generate creative editing suggestions for: ${context || 'a video project'}. Suggest intro ideas, creative cuts, transitions, and effects that would make this video more cinematic and engaging.` },
      ],
      response_format: { type: 'json_object' },
    })

    const suggestions = JSON.parse(completion.choices[0].message.content || '{}')

    return NextResponse.json({
      success: true,
      suggestions: suggestions.suggestions || [],
      topSuggestion: suggestions.topSuggestion || null,
      message: `✨ Generated creative inspiration ideas!`,
    })
  } catch (error) {
    console.error('V-Muse error:', error)
    return NextResponse.json(
      { error: 'Failed to generate suggestions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

