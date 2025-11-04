import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { saveProject, getProjects, updateProject } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, logoUrl, colors, fonts, watermark, preset } = await request.json()

    // Save brand kit to user's preferences
    const projectId = await saveProject({
      userId: session.user.email,
      projectData: {
        type: 'brandKit',
        brandKit: {
          name,
          logoUrl,
          colors: colors || [],
          fonts: fonts || {},
          watermark,
          preset,
          createdAt: new Date(),
        },
      },
      videoPublicId: '',
      chatHistory: [],
      brandKit: {
        name,
        logoUrl,
        colors,
        fonts,
        watermark,
        preset,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      brandKitId: projectId,
      message: `🎨 Brand kit "${name}" saved successfully!`,
    })
  } catch (error) {
    console.error('Brand kit save error:', error)
    return NextResponse.json(
      { error: 'Failed to save brand kit', details: error instanceof Error ? error.message : 'Unknown error' },
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

    // Get user's brand kits
    const projects = await getProjects(session.user.email)
    const brandKits = projects
      .filter(p => p.projectData?.type === 'brandKit' && !p.projectData?.brandKit?.deleted)
      .map(p => ({
        id: p.id,
        ...p.brandKit,
      }))

    return NextResponse.json({
      success: true,
      brandKits,
    })
  } catch (error) {
    console.error('Brand kit fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch brand kits', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const kitId = searchParams.get('id')

    if (!kitId) {
      return NextResponse.json(
        { error: 'Brand kit ID is required' },
        { status: 400 }
      )
    }

    // Verify kit belongs to user
    const projects = await getProjects(session.user.email)
    const kit = projects.find(p => p.id === kitId && p.projectData?.type === 'brandKit')

    if (!kit) {
      return NextResponse.json(
        { error: 'Brand kit not found' },
        { status: 404 }
      )
    }

    // Mark as deleted
    await updateProject(kitId, {
      projectData: {
        ...kit.projectData,
        brandKit: { ...kit.projectData.brandKit, deleted: true },
      },
      updatedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      message: 'Brand kit deleted successfully',
    })
  } catch (error) {
    console.error('Brand kit delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete brand kit', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

