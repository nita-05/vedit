import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 1,
})

// Smart system prompt for VIA Chat - focused on video editing assistance
const VIA_CHAT_SYSTEM_PROMPT = `You are VIA, an intelligent AI assistant for VEDIT - an AI-powered video editing platform. Your role is to help users edit videos through natural conversation.

CAPABILITIES:
- Understand video editing commands in natural language
- Provide contextual suggestions based on user's video content
- Guide users through editing workflows
- Answer questions about video editing features
- Suggest creative editing ideas

FEATURES AVAILABLE:
- Text overlays and captions
- Visual effects (blur, glow, VHS, film grain, etc.)
- Color grading (cinematic, vintage, moody, etc.)
- Transitions (fade, slide, wipe, etc.)
- Background music
- Trimming, merging, splitting videos
- Voiceovers and audio

COMMUNICATION STYLE:
- Be concise but helpful
- Use emojis sparingly for clarity (🎬 ✨ 🎨 🎵)
- Ask clarifying questions when needed
- Provide actionable suggestions
- Be enthusiastic about video editing

When users mention editing features, acknowledge their request and explain what will happen. If they need more information, ask smart follow-up questions.`

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { message, context } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // If OpenAI key is not available, return a smart simulated response
    if (!process.env.OPENAI_API_KEY) {
      const lowerMessage = message.toLowerCase()
      let reply = ''

      if (lowerMessage.includes('trim') || lowerMessage.includes('cut')) {
        reply = "🎬 I'll help you trim your video! What time range would you like to keep? For example, 'from 10 seconds to 30 seconds'."
      } else if (lowerMessage.includes('merge') || lowerMessage.includes('combine')) {
        reply = "✨ Great! I can merge your clips together. Which clips would you like to combine? You can select multiple clips from your timeline."
      } else if (lowerMessage.includes('color') || lowerMessage.includes('grading')) {
        reply = "🎨 Color grading can transform your video's mood! What style are you looking for? Options include: Cinematic, Vintage, Moody, Cyberpunk, or Golden Hour."
      } else if (lowerMessage.includes('text') || lowerMessage.includes('caption')) {
        reply = "📝 I can add text overlays or captions! What text would you like to display? Also, where should it appear (top, center, bottom) and what style (Bold, Minimal, Cinematic)?"
      } else if (lowerMessage.includes('effect') || lowerMessage.includes('filter')) {
        reply = "✨ Let's add some visual flair! Which effect interests you? Popular options: Blur, Glow, VHS, Film Grain, or Dreamy Glow."
      } else if (lowerMessage.includes('music') || lowerMessage.includes('audio')) {
        reply = "🎵 Background music can enhance your video! What mood are you going for? I can suggest: Upbeat, Cinematic, Chill, or Emotional tracks."
      } else if (lowerMessage.includes('transition')) {
        reply = "🎬 Smooth transitions make videos professional! Which style do you prefer? Options: Fade, Slide, Wipe, or Cinematic Cut."
      } else {
        reply = "I understand! I'm here to help with your video editing needs. You can ask me to add effects, text, music, color grading, or help with trimming and merging. What would you like to do?"
      }

      return NextResponse.json({
        success: true,
        reply,
        demo: true,
      })
    }

    // Use OpenAI for intelligent responses
    try {
      // Build context-aware messages
      const messages: any[] = [
        {
          role: 'system',
          content: VIA_CHAT_SYSTEM_PROMPT,
        },
      ]

      // Add context if provided (e.g., current video info)
      if (context) {
        messages.push({
          role: 'system',
          content: `Context: ${JSON.stringify(context)}`,
        })
      }

      // Add user message
      messages.push({
        role: 'user',
        content: message,
      })

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 300,
        temperature: 0.7,
        stream: false,
      })

      const reply = completion.choices[0]?.message?.content || 'I received your message. How can I help you with video editing?'

      return NextResponse.json({
        success: true,
        reply,
        demo: false,
      })
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError)
      
      // Fallback to smart simulated response
      return NextResponse.json({
        success: true,
        reply: "I understand your request! I'm here to help with video editing. In demo mode, some features may be limited. For full functionality, please ensure your OpenAI API key is configured.",
        demo: true,
        error: openaiError.message,
      })
    }
  } catch (error) {
    console.error('VIA Chat route error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

