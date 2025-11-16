import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'OpenAI API key not configured',
          message: 'Please set OPENAI_API_KEY in your environment variables.',
        },
        { status: 500 }
      )
    }

    const body = await request.json()
    const {
      videoName,
      description,
      tone = 'engaging',
      maxLength = 60,
    }: {
      videoName?: string
      description?: string
      tone?: string
      maxLength?: number
    } = body || {}

    const safeVideoName = (videoName || '').toString().trim() || 'your video'

    const prompt = `
You are a world-class copywriter generating short, catchy text for video overlays and titles.

CONTEXT:
- Video file name or rough title: "${safeVideoName}"
- Optional description/context: "${(description || '').toString().trim()}"
- Desired tone: ${tone}
- Max length per suggestion: ${maxLength} characters.

TASK:
- Generate 3 different short, punchy text options that would look great as on-video text or title.
- They should be specific to this video (based on the name/description) and feel natural for creators.
- Avoid generic phrases like "Your Title Here" or "Welcome".
- No quotes in the text itself.

Return ONLY valid JSON in this exact format:
{
  "suggestions": [
    "First option here",
    "Second option here",
    "Third option here"
  ]
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You generate short, high-conversion titles and overlay text for videos. Respond ONLY with JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 200,
    })

    const raw = completion.choices[0]?.message?.content || '{}'

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = {}
    }

    const suggestions: string[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s) => typeof s === 'string' && s.trim().length > 0)
      : []

    if (!suggestions.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'No suggestions generated',
          message: 'OpenAI did not return any valid text suggestions.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      suggestions,
    })
  } catch (error: any) {
    console.error('❌ generate-text error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Text generation failed',
        message: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}


