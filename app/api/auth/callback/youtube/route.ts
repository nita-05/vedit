import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveProject, getProjects, updateProject } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.redirect(new URL('/?error=unauthorized', request.url))
    }

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL('/dashboard?error=youtube_auth_failed', request.url))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/dashboard?error=no_code', request.url))
    }

    // Exchange authorization code for access token and refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/callback/youtube`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('YouTube token exchange error:', errorData)
      return NextResponse.redirect(new URL('/dashboard?error=token_exchange_failed', request.url))
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // Store tokens in user's projects
    const projects = await getProjects(session.user.email)
    const tokenProject = projects.find((p: any) => p.projectData?.type === 'platformTokens')

    const tokens = {
      youtube: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + (expires_in * 1000)).toISOString(),
        platform: 'youtube',
      },
    }

    if (tokenProject) {
      // Update existing token project
      await updateProject(tokenProject.id || '', {
        projectData: {
          type: 'platformTokens',
          tokens: {
            ...(tokenProject.projectData?.tokens || {}),
            ...tokens,
          },
        },
        updatedAt: new Date(),
      })
    } else {
      // Create new token project
      await saveProject({
        userId: session.user.email,
        projectData: {
          type: 'platformTokens',
          tokens,
        },
        videoPublicId: '',
        chatHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // Redirect back to dashboard with success
    return NextResponse.redirect(new URL('/dashboard?youtube_connected=true', request.url))
  } catch (error) {
    console.error('YouTube callback error:', error)
    return NextResponse.redirect(new URL('/dashboard?error=youtube_callback_error', request.url))
  }
}

