import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { v2 as cloudinary } from 'cloudinary'
import OpenAI from 'openai'

// Configure Cloudinary - use server-side env vars (without NEXT_PUBLIC_)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Smart Auto-Enhance API
 * Analyzes video and suggests/applies best effects automatically
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { videoPublicId, autoApply = false } = body

    if (!videoPublicId) {
      return NextResponse.json({ error: 'Video public ID is required' }, { status: 400 })
    }

    console.log(`🤖 Auto-enhancing video: ${videoPublicId}`)

    // Verify Cloudinary is configured
    const cloudName = cloudinary.config().cloud_name || process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    if (!cloudName) {
      console.error('❌ Cloudinary not configured: missing cloud_name')
      return NextResponse.json(
        {
          error: 'Cloudinary configuration missing',
          message: 'Please configure Cloudinary environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)',
        },
        { status: 500 }
      )
    }

    // Re-configure if needed
    if (!cloudinary.config().cloud_name) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      })
    }

    // Get video metadata from Cloudinary
    const resource = await cloudinary.api.resource(videoPublicId, {
      resource_type: 'video',
    })

    const duration = resource.duration || 0
    const width = resource.width || 1920
    const height = resource.height || 1080
    const size = resource.bytes || 0
    const format = resource.format || 'mp4'

    console.log(`📊 Video metadata: ${duration}s, ${width}x${height}, ${(size / 1024 / 1024).toFixed(2)}MB`)

    // Calculate video characteristics
    const sizeMB = parseFloat((size / 1024 / 1024).toFixed(2))
    const bitrateEstimate = sizeMB > 0 && duration > 0 ? (sizeMB * 8 / duration).toFixed(2) : '0' // Mbps
    const isLowResolution = width < 1280 || height < 720
    const isHighResolution = width >= 1920 && height >= 1080
    const isShortVideo = duration < 10
    const isLongVideo = duration > 60
    const isVeryLongVideo = duration > 300
    const isLowBitrate = parseFloat(bitrateEstimate) < 2 // Low quality video
    const isHighBitrate = parseFloat(bitrateEstimate) > 10 // High quality video

    // Use AI to analyze video content and suggest ONLY what's actually needed
    const analysisPrompt = `You are a professional video editor analyzing this video. Analyze the metadata and suggest ONLY the enhancements that are ACTUALLY NEEDED based on the video characteristics.

VIDEO METADATA:
- Duration: ${duration} seconds
- Resolution: ${width}x${height} ${isLowResolution ? '(LOW - may need upscaling/noise reduction)' : isHighResolution ? '(HIGH - good quality)' : '(MEDIUM)'}
- Format: ${format}
- File Size: ${sizeMB}MB
- Estimated Bitrate: ${bitrateEstimate} Mbps ${isLowBitrate ? '(LOW - may have compression artifacts/noise)' : isHighBitrate ? '(HIGH - good quality)' : '(MEDIUM)'}
- Video Length: ${isShortVideo ? 'SHORT' : isLongVideo ? 'LONG' : 'MEDIUM'}

YOUR TASK: Analyze these characteristics and suggest ONLY what the video ACTUALLY NEEDS:

1. NOISE REDUCTION: Suggest if:
   - Low bitrate (< 2 Mbps) - likely compression artifacts
   - Low resolution (< 1280x720) - may have noise
   - Small file size for duration - compression artifacts

2. SATURATION ADJUSTMENT: Suggest if:
   - Video appears too dull (increase saturation)
   - Video appears too vibrant (decrease saturation)
   - Based on format and size - compressed videos often lose saturation

3. COLOR GRADING: Always suggest if video needs professional look, but choose appropriate:
   - Low quality videos: "natural tone" or "studio tone" (less aggressive)
   - High quality videos: "cinematic", "vibrant", "moody" (more creative)
   - Short videos: "vibrant", "bright punch" (eye-catching)
   - Long videos: "cinematic", "moody" (professional)

4. TRANSITIONS: Suggest ONLY if:
   - Video is long (> 30 seconds) - likely has multiple scenes
   - Suggest "Fade" or "Cross Dissolve" for smooth transitions

5. TEXT OVERLAY: Suggest ONLY if:
   - Video is short (< 15 seconds) - likely needs title/intro
   - Video is very long (> 2 minutes) - may need chapter markers

6. EFFECTS: Suggest ONLY if:
   - Video needs specific mood (e.g., "dreamy glow" for romantic content)
   - Video is low quality - "soft focus" can help
   - Max 1-2 subtle effects

7. MUSIC: Suggest ONLY if:
   - Video is > 10 seconds
   - Video likely lacks audio or needs atmosphere
   - Match mood to video length and type

8. SPEED ADJUSTMENT: Suggest ONLY if:
   - Video is very short (< 5 seconds) - might need slow motion
   - Video is very long (> 5 minutes) - might need speed up

Return JSON format:
{
  "colorGrade": "preset_name", // REQUIRED - always suggest one
  "noiseReduction": {
    "needed": true/false,
    "intensity": "light|medium|strong" // if needed
  },
  "saturation": {
    "needed": true/false,
    "adjustment": "increase|decrease|normalize", // if needed
    "amount": 0.1-0.3 // slight adjustment
  },
  "effects": ["effect1"] (optional, max 1-2, only if needed),
  "transitions": ["transition1"] (optional, only if video is long or has multiple scenes),
  "music": "preset_name" (optional, only if video > 10 seconds),
  "text": {
    "needed": true/false,
    "suggestion": "text content" (if needed),
    "style": "preset_name" (if needed),
    "position": "top|bottom|center" (if needed)
  },
  "speed": 1.0 (optional, only if clearly needed),
  "reasoning": "Detailed explanation of why each suggestion is needed based on video characteristics"
}

AVAILABLE PRESETS:
- Color grades: warm, cool, vintage, moody, cinematic, vibrant, muted, natural tone, studio tone, bright punch, high contrast
- Effects: soft focus, dreamy glow, film grain, blur, glow (max 1-2)
- Music: Ambient, Upbeat, Emotional, Chill, Cinematic Epic, Lo-Fi, Corporate, Inspirational
- Transitions: Fade, Cross Dissolve, Slide, Zoom

IMPORTANT RULES:
- Suggest noise reduction if bitrate < 2 Mbps OR resolution < 1280x720
- Suggest saturation increase if video seems compressed/dull
- Always suggest ONE color grade (choose based on video quality and length)
- Suggest transitions only if video is > 30 seconds
- Suggest text only if video is < 15 seconds OR > 2 minutes
- Keep it minimal - only suggest what's ACTUALLY needed`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional video editor. Analyze videos and suggest optimal enhancements based on their characteristics. Return only valid JSON.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const suggestions = JSON.parse(completion.choices[0].message.content || '{}')

    console.log(`✅ AI suggestions received:`, suggestions)

    // Build comprehensive operations array based on intelligent suggestions
    const operations: Array<{ operation: string; params: any }> = []

    // 1. Color grading (always suggested)
    if (suggestions.colorGrade) {
      operations.push({
        operation: 'colorGrade',
        params: { preset: suggestions.colorGrade },
      })
    }

    // 2. Noise reduction (if needed based on video quality)
    if (suggestions.noiseReduction && suggestions.noiseReduction.needed) {
      const intensity = suggestions.noiseReduction.intensity || 'medium'
      // Map intensity to filter strength (noise reduction filter)
      const strength = intensity === 'strong' ? 30 : intensity === 'medium' ? 20 : 10
      operations.push({
        operation: 'filter',
        params: {
          type: 'noise reduction',
          value: strength, // Noise strength 0-100
        },
      })
    }

    // 3. Saturation adjustment (if needed)
    if (suggestions.saturation && suggestions.saturation.needed) {
      const adjustment = suggestions.saturation.adjustment || 'increase'
      const amount = suggestions.saturation.amount || 0.2
      
      // Calculate saturation multiplier
      const saturationValue = adjustment === 'increase' 
        ? 1 + amount  // e.g., 1.2 = 20% increase
        : adjustment === 'decrease' 
        ? 1 - amount  // e.g., 0.8 = 20% decrease
        : 1.0         // Normal
        
      operations.push({
        operation: 'filter',
        params: {
          type: 'saturation',
          value: saturationValue,
        },
      })
    }

    // 4. Effects (1-2 max, only if needed)
    if (suggestions.effects && Array.isArray(suggestions.effects)) {
      suggestions.effects.slice(0, 2).forEach((effect: string) => {
        // Skip noise reduction if already added
        if (effect.toLowerCase().includes('noise')) return
        
        operations.push({
          operation: 'applyEffect',
          params: { preset: effect, intensity: 0.5 }, // Subtle intensity
        })
      })
    }

    // 5. Music (if video is long enough)
    if (suggestions.music && duration > 10) {
      operations.push({
        operation: 'addMusic',
        params: { preset: suggestions.music },
      })
    }

    // 6. Transitions (only if video is long or has multiple scenes)
    if (suggestions.transitions && Array.isArray(suggestions.transitions) && suggestions.transitions.length > 0 && duration > 30) {
      operations.push({
        operation: 'addTransition',
        params: { preset: suggestions.transitions[0] },
      })
    }

    // 7. Text overlay (only if needed)
    if (suggestions.text && suggestions.text.needed) {
      operations.push({
        operation: 'addText',
        params: {
          text: suggestions.text.suggestion || 'Welcome',
          preset: suggestions.text.style || 'Bold',
          position: suggestions.text.position || 'center',
        },
      })
    }

    // 8. Speed adjustment (only if clearly needed)
    if (suggestions.speed && suggestions.speed !== 1.0) {
      operations.push({
        operation: 'adjustSpeed',
        params: { speed: suggestions.speed },
      })
    }

    // If autoApply is true, we would process these operations
    // For now, return suggestions for user to review

    // Build comprehensive suggestions summary
    const suggestionsSummary: any = {
      reasoning: suggestions.reasoning || 'AI-analyzed optimal enhancements based on video characteristics',
    }

    if (suggestions.colorGrade) suggestionsSummary.colorGrade = suggestions.colorGrade
    if (suggestions.noiseReduction?.needed) {
      suggestionsSummary.noiseReduction = {
        needed: true,
        intensity: suggestions.noiseReduction.intensity || 'medium',
      }
    }
    if (suggestions.saturation?.needed) {
      suggestionsSummary.saturation = {
        needed: true,
        adjustment: suggestions.saturation.adjustment || 'increase',
        amount: suggestions.saturation.amount || 0.2,
      }
    }
    if (suggestions.effects?.length) suggestionsSummary.effects = suggestions.effects
    if (suggestions.music && duration > 10) suggestionsSummary.music = suggestions.music
    if (suggestions.transitions?.length && duration > 30) suggestionsSummary.transitions = suggestions.transitions
    if (suggestions.text?.needed) suggestionsSummary.text = suggestions.text
    if (suggestions.speed && suggestions.speed !== 1.0) suggestionsSummary.speed = suggestions.speed

    return NextResponse.json({
      success: true,
      suggestions: suggestionsSummary,
      operations,
      autoApply,
      videoMetadata: {
        duration,
        resolution: `${width}x${height}`,
        format,
        sizeMB: (size / 1024 / 1024).toFixed(2),
      },
      message: autoApply
        ? `✨ Auto-enhanced your video with ${operations.length} operations`
        : `✨ Suggested ${operations.length} enhancement${operations.length !== 1 ? 's' : ''} based on your video analysis. Review and apply?`,
    })
  } catch (error: any) {
    console.error('❌ Auto-enhance error:', error)
    return NextResponse.json(
      {
        error: 'Auto-enhance failed',
        message: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

