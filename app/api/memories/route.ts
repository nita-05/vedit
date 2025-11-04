import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveProject, getProjects } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { style, voice, colorPreferences, musicPreferences, transitionPreferences } = await request.json()

    // Save user preferences (V-Memories)
    const projectId = await saveProject({
      userId: session.user.email,
      projectData: {
        type: 'vMemories',
        preferences: {
          style: style || {},
          voice: voice || {},
          colorPreferences: colorPreferences || [],
          musicPreferences: musicPreferences || [],
          transitionPreferences: transitionPreferences || [],
          updatedAt: new Date(),
        },
      },
      videoPublicId: '',
      chatHistory: [],
      brandKit: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      memoryId: projectId,
      message: `🧠 Preferences saved to V-Memories!`,
    })
  } catch (error) {
    console.error('V-Memories save error:', error)
    return NextResponse.json(
      { error: 'Failed to save preferences', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's V-Memories
    const projects = await getProjects(session.user.email)
    const memories = projects
      .filter(p => p.projectData?.type === 'vMemories')
      .map(p => p.projectData?.preferences)
      .filter(Boolean)
    
    // Get latest preferences
    const latestMemories = memories[memories.length - 1] || {}

    return NextResponse.json({
      success: true,
      memories: latestMemories,
    })
  } catch (error) {
    console.error('V-Memories fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch preferences', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

