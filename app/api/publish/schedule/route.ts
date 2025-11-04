import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveProject, getProjects } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { platform, videoUrl, videoPublicId, scheduledAt } = await req.json()

    if (!platform || !videoUrl || !scheduledAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduledAt)
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      )
    }

    // Save scheduled post to database
    const scheduledPost = {
      id: `schedule_${Date.now()}`,
      platform,
      videoUrl,
      videoPublicId,
      scheduledAt: scheduledDate.toISOString(),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    }

    // Save to user's projects
    await saveProject(session.user.email, {
      type: 'scheduled_post',
      scheduledPost,
    })

    // In production, you would set up a cron job or queue system (e.g., Bull, Agenda.js)
    // to check for scheduled posts and publish them at the right time
    // For now, we just save the scheduled post

    return NextResponse.json({
      success: true,
      scheduledPost,
      message: `Post scheduled for ${platform} at ${scheduledDate.toLocaleString()}`,
    })
  } catch (error: any) {
    console.error('Schedule error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to schedule post' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch scheduled posts from user's projects
    const projects = await getProjects(session.user.email)
    const scheduledPosts = projects
      .filter((p: any) => p.type === 'scheduled_post')
      .map((p: any) => p.scheduledPost)
      .sort((a: any, b: any) => 
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )

    return NextResponse.json({
      success: true,
      scheduledPosts,
    })
  } catch (error: any) {
    console.error('Fetch scheduled posts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch scheduled posts' },
      { status: 500 }
    )
  }
}

