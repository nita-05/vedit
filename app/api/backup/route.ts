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

    const { projectData, videoPublicId, chatHistory, brandKit } = await request.json()

    // Auto-save project (called every 5 minutes)
    const projectId = await saveProject({
      userId: session.user.email,
      projectData: projectData || {},
      videoPublicId: videoPublicId || '',
      chatHistory: chatHistory || [],
      brandKit: brandKit || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      projectId,
      message: 'Project auto-saved',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Auto-backup error:', error)
    return NextResponse.json(
      { error: 'Failed to backup project', details: error instanceof Error ? error.message : 'Unknown error' },
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

    // Get latest backup (last session)
    const projects = await getProjects(session.user.email)
    const latestProject = projects.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0]

    return NextResponse.json({
      success: true,
      lastBackup: latestProject || null,
      message: latestProject ? 'Last session recovered' : 'No previous session found',
    })
  } catch (error) {
    console.error('Backup recovery error:', error)
    return NextResponse.json(
      { error: 'Failed to recover backup', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

