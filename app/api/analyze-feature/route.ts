import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { v2 as cloudinary } from 'cloudinary'
import OpenAI from 'openai'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Render API URL for frame extraction
const RENDER_API_URL = process.env.RENDER_API_URL || process.env.NEXT_PUBLIC_RENDER_API_URL

/**
 * AI Feature Analysis API
 * Analyzes video and suggests the best feature option (Effect, Music, Color, etc.)
 */
export async function POST(request: NextRequest) {
  let featureType: string | undefined
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { videoPublicId, featureType: ft, videoDuration } = body // featureType: 'effect' | 'music' | 'color' | 'text'
    featureType = ft

    if (!videoPublicId) {
      return NextResponse.json({ error: 'Video public ID is required' }, { status: 400 })
    }

    if (!featureType) {
      return NextResponse.json({ error: 'Feature type is required' }, { status: 400 })
    }

    console.log(`🤖 AI analyzing ${featureType} for video: ${videoPublicId}`)

    // Get video metadata from Cloudinary
    const resource = await cloudinary.api.resource(videoPublicId, {
      resource_type: 'video',
    })

    const mediaUrl = resource.secure_url
    let duration = videoDuration || resource.duration || 0
    const width = resource.width || 1920
    const height = resource.height || 1080
    const format = resource.format || 'mp4'

    // Extract frames for AI analysis (quick mode - just 1 frame from middle)
    let videoContentAnalysis = ''
    
    try {
      if (duration > 0 && RENDER_API_URL) {
        const frameTime = Math.max(0, duration * 0.5) // Middle frame
        
        console.log(`📸 Extracting frame at ${frameTime}s for ${featureType} analysis...`)
        
        const renderResponse = await fetch(`${RENDER_API_URL}/extract-frames`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: mediaUrl,
            frameTimes: [frameTime],
          }),
          signal: AbortSignal.timeout(30000),
        })
        
        if (renderResponse.ok) {
          const renderData = await renderResponse.json()
          if (renderData.success && renderData.frames && renderData.frames.length > 0) {
            const frameBase64 = renderData.frames[0]
            
            // Analyze frame with OpenAI Vision API
            const visionResponse = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                {
                  role: 'system',
                  content: 'You are a professional video editor analyzing video frames to suggest the best editing features.',
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Analyze this video frame and describe what you see: visual content, colors, mood, atmosphere, and what type of ${featureType} would work best.`,
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:image/jpeg;base64,${frameBase64}`,
                      },
                    },
                  ],
                },
              ],
              max_tokens: 300,
              temperature: 0.3,
            })
            
            videoContentAnalysis = visionResponse.choices[0]?.message?.content || ''
            console.log(`✅ Vision API analysis: ${videoContentAnalysis.substring(0, 100)}...`)
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Frame extraction failed, using metadata-only analysis:', error)
    }

    // Build feature-specific prompt
    let analysisPrompt = ''
    let availableOptions: string[] = []
    
    switch (featureType?.toLowerCase()) {
      case 'effect':
        availableOptions = ['Blur', 'Glow', 'VHS', 'Motion', 'Film Grain', 'Lens Flare', 'Bokeh', 'Light Leak', 'Pixelate', 'Distortion', 'Chromatic Aberration', 'Shake', 'Sparkle', 'Shadow Pulse', 'Dreamy Glow', 'Glitch Flicker', 'Zoom-In Pulse', 'Soft Focus', 'Old Film', 'Dust Overlay', 'Light Rays', 'Mirror', 'Tilt Shift', 'Fisheye', 'Bloom']
        analysisPrompt = `You are a professional video editor. Analyze this video and suggest the BEST effect from the available options.

VIDEO CONTENT ANALYSIS:
${videoContentAnalysis || 'No frame analysis available - using metadata only'}

VIDEO METADATA:
- Duration: ${duration}s
- Resolution: ${width}x${height}
- Format: ${format}

AVAILABLE EFFECTS: ${availableOptions.join(', ')}

Based on the video content and metadata, suggest ONE effect that would enhance this video the most. Consider:
- Visual content (what's in the video)
- Mood/atmosphere (dramatic, fun, professional, etc.)
- Color palette
- Video quality

Return JSON:
{
  "suggestion": "effect_name",
  "intensity": 0.5-0.8,
  "reasoning": "Why this effect works best for this video"
}`
        break
        
      case 'music':
        availableOptions = ['Ambient', 'Upbeat', 'Emotional', 'Action', 'Chill', 'Techno', 'Cinematic Epic', 'Lo-Fi', 'Trap Beat', 'Corporate', 'Pop', 'Hip-Hop', 'Retro Synth', 'Acoustic', 'Inspirational', 'Piano Mood', 'Dark Tension', 'Happy Vibe', 'Travel Theme', 'Dramatic Rise', 'Fast Cut Beat', 'EDM Drop', 'Dream Pop', 'Sad Violin', 'Percussive Hit', 'Calm Nature Ambience']
        analysisPrompt = `You are a professional video editor. Analyze this video and suggest the BEST music from the available options.

VIDEO CONTENT ANALYSIS:
${videoContentAnalysis || 'No frame analysis available - using metadata only'}

VIDEO METADATA:
- Duration: ${duration}s
- Resolution: ${width}x${height}
- Format: ${format}

AVAILABLE MUSIC: ${availableOptions.join(', ')}

Based on the video content and metadata, suggest ONE music track that would enhance this video the most. Consider:
- Visual content (what's in the video)
- Mood/atmosphere (dramatic, fun, professional, energetic, calm, etc.)
- Video length (short videos need different music than long ones)
- Purpose (tutorial, vlog, cinematic, corporate, etc.)

Return JSON:
{
  "suggestion": "music_name",
  "volume": 0.3-0.5,
  "reasoning": "Why this music works best for this video"
}`
        break
        
      case 'color':
        availableOptions = ['Warm', 'Cool', 'Vintage', 'Moody', 'Teal-Orange', 'Noir', 'Sepia', 'Dreamy', 'Pastel', 'Vibrant', 'Muted', 'Cyberpunk', 'Neon', 'Golden Hour', 'High Contrast', 'Washed Film', 'Studio Tone', 'Soft Skin', 'Shadow Boost', 'Natural Tone', 'Bright Punch', 'Black & White', 'Orange Tint', 'Monochrome', 'Cinematic LUT', 'Sunset Glow']
        analysisPrompt = `You are a professional video editor. Analyze this video and suggest the BEST color grade from the available options.

VIDEO CONTENT ANALYSIS:
${videoContentAnalysis || 'No frame analysis available - using metadata only'}

VIDEO METADATA:
- Duration: ${duration}s
- Resolution: ${width}x${height}
- Format: ${format}

AVAILABLE COLOR GRADES: ${availableOptions.join(', ')}

Based on the video content and metadata, suggest ONE color grade that would enhance this video the most. Consider:
- Visual content (what's in the video)
- Current color palette (bright, dark, muted, vibrant, etc.)
- Mood/atmosphere (dramatic, fun, professional, cinematic, etc.)
- Lighting conditions

Return JSON:
{
  "suggestion": "color_grade_name",
  "reasoning": "Why this color grade works best for this video"
}`
        break
        
      case 'text':
        // Text already has its own API, but we can enhance it here
        analysisPrompt = `You are a professional video editor. Analyze this video and suggest the BEST text style and content.

VIDEO CONTENT ANALYSIS:
${videoContentAnalysis || 'No frame analysis available - using metadata only'}

VIDEO METADATA:
- Duration: ${duration}s
- Resolution: ${width}x${height}
- Format: ${format}

Based on the video content, suggest:
- Text style (Bold, Minimal, Cinematic, Retro, etc.)
- Position (top, center, bottom)
- Whether text overlay is needed

Return JSON:
{
  "suggestion": "text_style",
  "position": "top|center|bottom",
  "needed": true/false,
  "reasoning": "Why this text style works best"
}`
        break
        
      default:
        return NextResponse.json({ error: `Unknown feature type: ${featureType || 'undefined'}` }, { status: 400 })
    }

    // Get AI suggestion
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional video editor. Analyze videos and suggest optimal features. Return only valid JSON.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const suggestion = JSON.parse(completion.choices[0]?.message?.content || '{}')

    return NextResponse.json({
      success: true,
      suggestion,
      featureType,
    })
  } catch (error: any) {
    console.error(`❌ Feature analysis error (${featureType}):`, error)
    return NextResponse.json(
      {
        error: 'Feature analysis failed',
        message: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

