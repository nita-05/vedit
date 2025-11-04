import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { getProjects } from '@/lib/db'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = await request.json()

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId' },
        { status: 400 }
      )
    }

    // Get project data
    const projects = await getProjects(session.user.email)
    const project = projects.find(p => p.id === projectId)

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Generate smart summary using GPT
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Generate a comprehensive JSON summary of a video editing project including: edits made, style used, duration, key features, and export status.'
        },
        {
          role: 'user',
          content: `Generate a smart summary for this project: ${JSON.stringify({
            chatHistory: project.chatHistory,
            brandKit: project.brandKit,
            videoUrl: project.videoUrl,
            published: project.published,
          })}`
        },
      ],
      response_format: { type: 'json_object' },
    })

    const summary = JSON.parse(completion.choices[0].message.content || '{}')

    return NextResponse.json({
      success: true,
      summary: {
        ...summary,
        projectId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    })
  } catch (error) {
    console.error('Project summary error:', error)
    return NextResponse.json(
      { error: 'Failed to generate summary', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

