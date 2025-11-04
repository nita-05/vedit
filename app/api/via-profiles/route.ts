import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveProject, getProjects, updateProject } from '@/lib/db'
import { AVAILABLE_VOICES } from '@/lib/voices'

// POST: Create or update a VIA profile
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, voice, speed, pitch, volume, isDefault, profileId, isCloned, voiceSampleUrl, voiceCloneId } = await request.json()

    if (!name || !voice) {
      return NextResponse.json(
        { error: 'Name and voice are required' },
        { status: 400 }
      )
    }

    // Validate voice (skip validation if it's a cloned voice)
    if (!isCloned && !AVAILABLE_VOICES.find(v => v.id === voice)) {
      return NextResponse.json(
        { error: 'Invalid voice selection' },
        { status: 400 }
      )
    }

    const profileData = {
      name,
      voice,
      speed: speed || 1.0,
      pitch: pitch || 1.0,
      volume: volume || 0.8,
      isDefault: isDefault || false,
      isCloned: isCloned || false,
      voiceSampleUrl: voiceSampleUrl || null,
      voiceCloneId: voiceCloneId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // If updating existing profile
    if (profileId) {
      await updateProject(profileId, {
        projectData: {
          type: 'viaProfile',
          profile: profileData,
        },
        updatedAt: new Date(),
      })

      return NextResponse.json({
        success: true,
        profileId,
        profile: profileData,
        message: `🎙️ Profile "${name}" updated successfully!`,
      })
    }

    // Create new profile
    const projectId = await saveProject({
      userId: session.user.email,
      projectData: {
        type: 'viaProfile',
        profile: profileData,
      },
      videoPublicId: '',
      chatHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // If this is set as default, unset other defaults
    if (isDefault) {
      const allProfiles = await getProjects(session.user.email)
      const otherProfiles = allProfiles.filter(
        p => p.projectData?.type === 'viaProfile' && p.id !== projectId
      )
      for (const profile of otherProfiles) {
        if (profile.projectData?.profile?.isDefault) {
          await updateProject(profile.id!, {
            projectData: {
              ...profile.projectData,
              profile: { ...profile.projectData.profile, isDefault: false },
            },
            updatedAt: new Date(),
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      profileId: projectId,
      profile: profileData,
      message: `🎙️ Profile "${name}" created successfully!`,
    })
  } catch (error) {
    console.error('VIA Profile save error:', error)
    return NextResponse.json(
      { error: 'Failed to save profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET: Get all VIA profiles for user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projects = await getProjects(session.user.email)
    const profiles = projects
      .filter(p => 
        p.projectData?.type === 'viaProfile' && 
        !p.projectData?.profile?.deleted
      )
      .map(p => ({
        id: p.id,
        ...p.projectData?.profile,
      }))
      .sort((a, b) => {
        // Sort default first, then by name
        if (a.isDefault && !b.isDefault) return -1
        if (!a.isDefault && b.isDefault) return 1
        return (a.name || '').localeCompare(b.name || '')
      })

    return NextResponse.json({
      success: true,
      profiles,
      availableVoices: AVAILABLE_VOICES,
    })
  } catch (error) {
    console.error('VIA Profile fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profiles', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE: Delete a VIA profile
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const profileId = searchParams.get('id')

    if (!profileId) {
      return NextResponse.json(
        { error: 'Profile ID is required' },
        { status: 400 }
      )
    }

    // Verify profile belongs to user
    const projects = await getProjects(session.user.email)
    const profile = projects.find(p => p.id === profileId && p.projectData?.type === 'viaProfile')

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Delete from database (in real implementation, you'd have a deleteProject function)
    // For now, we'll mark it as deleted
    await updateProject(profileId, {
      projectData: {
        ...profile.projectData,
        deleted: true,
      },
      updatedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      message: 'Profile deleted successfully',
    })
  } catch (error) {
    console.error('VIA Profile delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

