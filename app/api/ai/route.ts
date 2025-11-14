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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // If OpenAI key is not available, return a simulated response
    if (!process.env.OPENAI_API_KEY) {
      // Simulate AI responses based on common commands
      const lowerMessage = message.toLowerCase()
      let reply = ''

      if (lowerMessage.includes('trim') || lowerMessage.includes('cut')) {
        reply = "Sure! Trimming your clip to the specified time range..."
      } else if (lowerMessage.includes('merge') || lowerMessage.includes('combine')) {
        reply = "Got it! Merging your clips together..."
      } else if (lowerMessage.includes('color') || lowerMessage.includes('grading')) {
        reply = "Applying color grading to enhance your video..."
      } else if (lowerMessage.includes('text') || lowerMessage.includes('caption')) {
        reply = "Adding text overlay to your video..."
      } else if (lowerMessage.includes('effect') || lowerMessage.includes('filter')) {
        reply = "Applying the requested effect to your video..."
      } else if (lowerMessage.includes('music') || lowerMessage.includes('audio')) {
        reply = "Adding background music to your video..."
      } else if (lowerMessage.includes('export') || lowerMessage.includes('download')) {
        reply = "Preparing your video for export..."
      } else {
        reply = "I understand! Processing your request. In demo mode, some features may be limited. For full functionality, please ensure your OpenAI API key is configured."
      }

      return NextResponse.json({
        success: true,
        reply,
        demo: true,
      })
    }

    // Use OpenAI for real AI responses
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are VIA, a helpful AI assistant for VEDIT video editing platform. Provide concise, friendly responses about video editing. If asked about video operations, acknowledge the request and explain what will happen.',
          },
          {
            role: 'user',
            content: message,
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      })

      const reply = completion.choices[0]?.message?.content || 'I received your message. How can I help you with video editing?'

      return NextResponse.json({
        success: true,
        reply,
        demo: false,
      })
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError)
      
      // Fallback to simulated response
      return NextResponse.json({
        success: true,
        reply: "I understand your request! Processing your video editing command. Note: Some features may be limited in demo mode.",
        demo: true,
        error: openaiError.message,
      })
    }
  } catch (error) {
    console.error('AI route error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process AI request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

