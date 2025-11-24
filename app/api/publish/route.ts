import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateProject, getProjects } from '@/lib/db'
import { publishToPlatform, PublishingConfig } from '@/lib/publishing'

export async function POST(request: NextRequest) {
  let platform = 'platform' // Default for error handling
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    platform = body.platform || 'platform' // Extract platform for error handling
    const { videoUrl, title, description, videoPublicId, projectId, accessToken, refreshToken, visibility, tags } = body

    if (!body.platform || !videoUrl) {
      return NextResponse.json(
        { error: 'Platform and video URL are required' },
        { status: 400 }
      )
    }

    // Try to get stored tokens from user's projects/preferences
    const projects = await getProjects(session.user.email)
    const tokenProject = projects.find(p => p.projectData?.type === 'platformTokens')
    const storedTokens = tokenProject?.projectData?.tokens || {}
    
    // Debug logging for token lookup
    const platformKey = body.platform.toLowerCase()
    console.log('🔍 Token lookup:', {
      platform: platformKey,
      hasTokenProject: !!tokenProject,
      hasStoredTokens: Object.keys(storedTokens).length > 0,
      storedTokenKeys: Object.keys(storedTokens),
      hasAccessToken: !!storedTokens[platformKey]?.accessToken,
      tokenSource: accessToken ? 'request' : (storedTokens[platformKey]?.accessToken ? 'stored' : 'none'),
    })

    // Prepare publishing config
    const publishConfig: PublishingConfig = {
      platform: platformKey as any,
      accessToken: accessToken || storedTokens[platformKey]?.accessToken,
      refreshToken: refreshToken || storedTokens[platformKey]?.refreshToken,
      videoUrl,
      title: title || 'My Video',
      description: description || '',
      visibility: visibility || 'public',
      tags: tags || [],
    }

    // Check if access token is available
    if (!publishConfig.accessToken) {
      console.log('❌ No access token found for platform:', platformKey)
      return NextResponse.json({
        success: false,
        requiresAuth: true,
        message: `Please connect your ${body.platform} account first. Click "Connect Account" to authorize.`,
        oauthUrl: getOAuthUrl(platformKey),
      })
    }

    // Check if token is expired and refresh if needed (for YouTube)
    if (platformKey === 'youtube' && publishConfig.refreshToken) {
      const tokenData = storedTokens[platformKey]
      if (tokenData?.expiresAt) {
        const expiresAt = new Date(tokenData.expiresAt)
        const now = new Date()
        // Refresh if token expires in less than 5 minutes
        if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
          console.log('🔄 Refreshing expired YouTube token...')
          try {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID || '',
                client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                refresh_token: publishConfig.refreshToken,
                grant_type: 'refresh_token',
              }),
            })
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json()
              publishConfig.accessToken = refreshData.access_token
              
              // Update stored token
              if (tokenProject) {
                await updateProject(tokenProject.id || '', {
                  projectData: {
                    type: 'platformTokens',
                    tokens: {
                      ...storedTokens,
                      [platformKey]: {
                        ...tokenData,
                        accessToken: refreshData.access_token,
                        expiresAt: new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString(),
                      },
                    },
                  },
                  updatedAt: new Date(),
                })
                console.log('✅ Token refreshed and saved')
              }
            } else {
              console.warn('⚠️ Token refresh failed, using existing token')
            }
          } catch (refreshError) {
            console.error('❌ Token refresh error:', refreshError)
            // Continue with existing token - might still work
          }
        }
      }
    }

    // Attempt to publish using real APIs
    const publishResult = await publishToPlatform(publishConfig)

    if (!publishResult.success) {
      // If token expired, prompt for re-authentication
      if (publishResult.error?.includes('token') || publishResult.error?.includes('unauthorized')) {
        return NextResponse.json({
          success: false,
          requiresAuth: true,
          message: `Your ${body.platform} connection expired. Please reconnect your account.`,
          oauthUrl: getOAuthUrl(body.platform.toLowerCase()),
        })
      }

      return NextResponse.json({
        success: false,
        error: publishResult.error || 'Failed to publish',
      }, { status: 500 })
    }

    const publishedUrl = publishResult.publishedUrl || `${getPlatformBaseUrl(body.platform.toLowerCase())}/${Date.now()}`
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/share/${videoPublicId}`

    // Update project in database if projectId provided
    if (projectId) {
      await updateProject(projectId, {
        published: true,
        shareUrl,
      })
    }

    // Return V-Port response format
    return NextResponse.json({
      success: true,
      message: `🎉 Video published to ${body.platform} successfully!`,
      videoUrl,
      downloadUrl: videoUrl,
      shareUrl,
      published: true,
      platform: body.platform,
      publishedUrl,
      videoId: publishResult.videoId,
      publishedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Publish error:', error)
    return NextResponse.json(
      { 
        error: `Failed to publish to ${platform}`,
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Helper to get OAuth URLs for each platform
function getOAuthUrl(platform: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  switch (platform) {
    case 'youtube':
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback/youtube`)}&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code&access_type=offline`
    case 'tiktok':
      return `https://www.tiktok.com/auth/authorize?client_key=${process.env.TIKTOK_CLIENT_KEY}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback/tiktok`)}&scope=user.info.basic,video.upload&response_type=code`
    case 'instagram':
      return `https://api.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_CLIENT_ID}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback/instagram`)}&scope=user_profile,user_media&response_type=code`
    case 'linkedin':
      return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback/linkedin`)}&scope=r_liteprofile r_emailaddress w_member_social`
    case 'twitter':
      return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback/twitter`)}&scope=tweet.read tweet.write users.read offline.access&code_challenge=challenge&code_challenge_method=plain`
    default:
      return ''
  }
}

function getPlatformBaseUrl(platform: string): string {
  switch (platform) {
    case 'youtube':
      return 'https://www.youtube.com/watch'
    case 'tiktok':
      return 'https://www.tiktok.com/@user/video'
    case 'instagram':
      return 'https://www.instagram.com/p'
    case 'linkedin':
      return 'https://www.linkedin.com/feed/update'
    case 'twitter':
      return 'https://twitter.com/user/status'
    default:
      return ''
  }
}
