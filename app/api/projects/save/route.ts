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

    const body = await request.json()
    const { projectData, videoPublicId, chatHistory, brandKit, videoUrl, downloadUrl, shareUrl } = body

    const projectId = await saveProject({
      userId: session.user.email,
      projectData: projectData || {},
      videoPublicId: videoPublicId || '',
      chatHistory: chatHistory || [],
      brandKit: brandKit || {},
      videoUrl: videoUrl || '',
      downloadUrl: downloadUrl || '',
      shareUrl: shareUrl || '',
      published: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return NextResponse.json({ 
      success: true,
      message: 'Project saved successfully',
      projectId,
      videoUrl,
      downloadUrl,
      shareUrl,
      published: false,
    })
  } catch (error) {
    console.error('Save error:', error)
    return NextResponse.json(
      { error: 'Failed to save project', details: error instanceof Error ? error.message : 'Unknown error' },
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

    const projects = await getProjects(session.user.email)

    return NextResponse.json({ 
      success: true,
      projects: projects.map(p => ({
        id: p.id,
        projectData: p.projectData,
        videoPublicId: p.videoPublicId,
        videoUrl: p.videoUrl,
        downloadUrl: p.downloadUrl,
        shareUrl: p.shareUrl,
        published: p.published,
        updatedAt: p.updatedAt,
      }))
    })
  } catch (error) {
    console.error('Fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
