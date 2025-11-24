import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { v2 as cloudinary } from 'cloudinary'
import OpenAI from 'openai'

// Render API URL for FFmpeg processing (if deployed)
const RENDER_API_URL = process.env.RENDER_API_URL || process.env.NEXT_PUBLIC_RENDER_API_URL

// Configure Cloudinary - use server-side env vars (without NEXT_PUBLIC_)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Helper function to generate quick suggestions based on metadata only
function generateQuickSuggestions(metadata: {
  duration: number
  width: number
  height: number
  sizeMB: number
  bitrateEstimate: number
  isLowResolution: boolean
  isHighResolution: boolean
  isShortVideo: boolean
  isLongVideo: boolean
  isVeryLongVideo: boolean
  isLowBitrate: boolean
  isHighBitrate: boolean
  format: string
}) {
  const suggestions: any = {
    reasoning: 'Smart instant suggestions based on video characteristics for automatic enhancement.',
    colorGrade: 'cinematic', // Default professional look
  }

  // Smart color grade selection based on video characteristics
  if (metadata.isHighResolution && metadata.isHighBitrate) {
    // High quality videos - can use vibrant or cinematic
    suggestions.colorGrade = metadata.isShortVideo ? 'vibrant' : 'cinematic'
  } else if (metadata.isLowResolution || metadata.isLowBitrate) {
    // Lower quality - use natural tone to avoid artifacts
    suggestions.colorGrade = 'natural tone'
  } else if (metadata.isLongVideo || metadata.isVeryLongVideo) {
    // Longer videos - cinematic works well
    suggestions.colorGrade = 'cinematic'
  } else {
    // Medium quality - balanced approach
    suggestions.colorGrade = 'cinematic'
  }

  // Noise reduction for low quality videos
  if (metadata.isLowBitrate || metadata.isLowResolution) {
    suggestions.noiseReduction = {
      needed: true,
      intensity: metadata.isLowBitrate ? 'medium' : 'light',
    }
  }

  // Saturation adjustment
  if (metadata.isLowBitrate) {
    suggestions.saturation = {
      needed: true,
      adjustment: 'increase',
      amount: 0.15, // Slight increase for compressed videos
    }
  }

  // Effects (minimal, only if needed)
  if (metadata.isLowResolution) {
    suggestions.effects = ['soft focus'] // Soft focus can help hide quality issues
  }

  // Music for longer videos
  if (metadata.duration > 10 && metadata.duration > 0) {
    if (metadata.isShortVideo) {
      suggestions.music = 'Upbeat'
    } else if (metadata.isLongVideo) {
      suggestions.music = 'Cinematic Epic'
    } else {
      suggestions.music = 'Ambient'
    }
  }

  // Transitions for longer videos
  if (metadata.duration > 30 && metadata.duration > 0) {
    suggestions.transitions = ['Fade']
  }

  // Text overlay: DO NOT automatically add - only add if AI analysis determines it's needed
  // Quick mode doesn't have AI content analysis, so skip text overlay
  // Text overlay should only be suggested by deep AI analysis based on actual video content

  return suggestions
}

// Helper function to build operations from suggestions
function buildOperationsFromSuggestions(suggestions: any, duration: number): Array<{ operation: string; params: any }> {
  const operations: Array<{ operation: string; params: any }> = []

  // 1. Color grading (always suggested)
  if (suggestions.colorGrade) {
    operations.push({
      operation: 'colorGrade',
      params: { preset: suggestions.colorGrade },
    })
  }

  // 2. Noise reduction
  if (suggestions.noiseReduction && suggestions.noiseReduction.needed) {
    const intensity = suggestions.noiseReduction.intensity || 'medium'
    const strength = intensity === 'strong' ? 30 : intensity === 'medium' ? 20 : 10
    operations.push({
      operation: 'filter',
      params: {
        type: 'noise reduction',
        value: strength,
      },
    })
  }

  // 3. Saturation adjustment
  if (suggestions.saturation && suggestions.saturation.needed) {
    const adjustment = suggestions.saturation.adjustment || 'increase'
    const amount = suggestions.saturation.amount || 0.2
    const saturationValue = adjustment === 'increase' 
      ? 1 + amount
      : adjustment === 'decrease' 
      ? 1 - amount
      : 1.0
    operations.push({
      operation: 'filter',
      params: {
        type: 'saturation',
        value: saturationValue,
      },
    })
  }

  // 4. Effects
  if (suggestions.effects && Array.isArray(suggestions.effects)) {
    suggestions.effects.slice(0, 2).forEach((effect: string) => {
      if (effect.toLowerCase().includes('noise')) return
      operations.push({
        operation: 'applyEffect',
        params: { preset: effect, intensity: 0.5 },
      })
    })
  }

  // 5. Music
  if (suggestions.music && duration > 10 && duration > 0) {
    operations.push({
      operation: 'addMusic',
      params: { preset: suggestions.music },
    })
  }

  // 6. Transitions
  if (suggestions.transitions && Array.isArray(suggestions.transitions) && suggestions.transitions.length > 0 && duration > 30 && duration > 0) {
    operations.push({
      operation: 'addTransition',
      params: { preset: suggestions.transitions[0] },
    })
  }

  // 7. Text overlay - ONLY if explicitly needed and has meaningful content
  // Quick mode doesn't have AI content analysis, so skip text overlay
  // Text overlay should only be added by deep AI analysis
  if (suggestions.text && suggestions.text.needed === true && duration > 0) {
    const textContent = suggestions.text.suggestion || suggestions.text.text || ''
    // Only add if there's meaningful, non-generic text content
    if (textContent && textContent.trim().length > 0 && textContent.toLowerCase() !== 'welcome') {
      operations.push({
        operation: 'addText',
        params: {
          text: textContent,
          preset: suggestions.text.style || 'Bold',
          position: suggestions.text.position || 'center',
        },
      })
    }
  }

  // 8. Speed adjustment
  if (suggestions.speed && suggestions.speed !== 1.0 && duration > 0) {
    operations.push({
      operation: 'adjustSpeed',
      params: { speed: suggestions.speed },
    })
  }

  return operations
}

// Helper function to extract frames using Render API
async function extractFramesWithRender(videoUrl: string, frameTimes: number[]): Promise<string[]> {
  if (!RENDER_API_URL) {
    throw new Error('RENDER_API_URL not configured - cannot extract frames')
  }
  
  console.log(`🌐 Using Render API to extract ${frameTimes.length} frames...`)
  
  try {
    const renderResponse = await fetch(`${RENDER_API_URL}/extract-frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl,
        frameTimes, // Array of timestamps in seconds
      }),
      signal: AbortSignal.timeout(60000), // 60 second timeout
    })
    
    if (!renderResponse.ok) {
      const errorText = await renderResponse.text()
      throw new Error(`Render API error (${renderResponse.status}): ${errorText}`)
    }
    
    const renderData = await renderResponse.json()
    
    if (renderData.success && renderData.frames && Array.isArray(renderData.frames)) {
      console.log(`✅ Extracted ${renderData.frames.length} frames via Render API`)
      return renderData.frames // Array of base64 image strings
    } else {
      throw new Error(renderData.message || renderData.error || 'Frame extraction failed')
    }
  } catch (renderError: any) {
    console.error('❌ Render API frame extraction failed:', renderError)
    throw new Error(`Frame extraction failed: ${renderError.message || 'Unknown error'}`)
  }
}

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
    const { videoPublicId, autoApply = true, videoDuration, mode = 'quick' } = body // Default autoApply to true for production

    if (!videoPublicId) {
      return NextResponse.json({ error: 'Video public ID is required' }, { status: 400 })
    }

    console.log(`🤖 Auto-enhancing video: ${videoPublicId} (mode: ${mode})`)

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

    const mediaUrl = resource.secure_url
    let duration = videoDuration || resource.duration || 0 // Use client-side duration first (most reliable)
    const width = resource.width || 1920
    const height = resource.height || 1080
    const size = resource.bytes || 0
    const format = resource.format || 'mp4'

    // Log which source we're using for duration
    if (videoDuration && videoDuration > 0) {
      duration = videoDuration
      console.log(`✅ Using client-side detected duration: ${duration}s`)
    } else if (resource.duration && resource.duration > 0) {
      duration = resource.duration
      console.log(`✅ Using Cloudinary API duration: ${duration}s`)
    }

    // If duration is still 0, try server-side detection fallback
    if (!duration || duration === 0) {
      try {
        // Try to get duration from video_info if available
        if (resource.video && resource.video.duration) {
          duration = resource.video.duration
          console.log(`✅ Got duration from video_info: ${duration}s`)
        } else if (resource.context && resource.context.custom && resource.context.custom.duration) {
          duration = parseFloat(resource.context.custom.duration)
          console.log(`✅ Got duration from context: ${duration}s`)
        } else {

          // Note: FFprobe fallback removed - using client-side duration or Cloudinary API duration only
          // If duration is still 0, we'll use the client-side duration passed from frontend
          console.warn('⚠️ Duration not found in Cloudinary metadata - using client-side duration if provided')
        }
      } catch (durationError) {
        console.warn('⚠️ Could not detect video duration:', durationError)
        // Keep duration as 0 if detection fails
      }
    }

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

    // QUICK MODE: Instant suggestions based on metadata only (no frame extraction/AI analysis)
    if (mode === 'quick') {
      console.log('⚡ Quick mode: Generating instant suggestions based on metadata...')
      
      // Generate instant suggestions based on metadata
      const quickSuggestions = generateQuickSuggestions({
        duration,
        width,
        height,
        sizeMB,
        bitrateEstimate: parseFloat(bitrateEstimate),
        isLowResolution,
        isHighResolution,
        isShortVideo,
        isLongVideo,
        isVeryLongVideo,
        isLowBitrate,
        isHighBitrate,
        format,
      })

      const quickOperations = buildOperationsFromSuggestions(quickSuggestions, duration)
      
      // Ensure we always have at least one operation (color grade is always included)
      if (quickOperations.length === 0) {
        // Fallback: at minimum, apply a color grade
        quickOperations.push({
          operation: 'colorGrade',
          params: { preset: 'cinematic' },
        })
        quickSuggestions.colorGrade = 'cinematic'
      }
      
      return NextResponse.json({
        success: true,
        suggestions: quickSuggestions,
        operations: quickOperations,
        autoApply,
        videoMetadata: {
          duration,
          resolution: `${width}x${height}`,
          format,
          sizeMB: sizeMB.toFixed(2),
        },
        message: autoApply
          ? `✨ Auto-enhanced your video with ${quickOperations.length} enhancement${quickOperations.length !== 1 ? 's' : ''}`
          : `✨ Suggested ${quickOperations.length} enhancement${quickOperations.length !== 1 ? 's' : ''} based on video metadata.`,
        mode: 'quick',
      })
    }

    // DEEP MODE: Full AI analysis with frame extraction and Vision API
    // REAL AI CONTENT ANALYSIS: Extract frames and analyze actual video content
    let videoContentAnalysis = ''
    let contentAnalysisSuccess = false
    
    try {
      console.log('🎬 Starting REAL video content analysis (extracting frames)...')
      
      // Calculate frame times (start, middle, end)
      const frameTimes = duration > 0 
        ? [Math.max(0, duration * 0.1), Math.max(0, duration * 0.5), Math.max(0, duration * 0.9)]
        : [0.5, 1, 1.5] // Fallback times if duration unknown
      
      console.log(`📸 Extracting frames at: ${frameTimes.join(', ')}s`)
      
      // Extract frames using Render API when available, with robust Cloudinary fallback
      let frameBase64Images: string[] = []
      
      const extractFramesViaCloudinary = async () => {
        console.log('☁️ Using Cloudinary for frame extraction...')
        return Promise.all(
          frameTimes.map(async (time, index) => {
            try {
              // Use Cloudinary's video frame extraction (snapshot at specific time)
              const frameUrl = cloudinary.url(videoPublicId, {
                resource_type: 'video',
                format: 'jpg',
                transformation: [
                  { start_offset: Math.round(time) }, // Round to nearest second
                  { width: 640, height: 360, crop: 'scale', quality: 'auto' }
                ]
              })
              
              // Download the frame
              const frameResponse = await fetch(frameUrl)
              if (!frameResponse.ok) {
                throw new Error(`Failed to fetch frame: ${frameResponse.status}`)
              }
              
              const arrayBuffer = await frameResponse.arrayBuffer()
              const base64 = Buffer.from(arrayBuffer).toString('base64')
              console.log(`✅ Frame ${index + 1} extracted via Cloudinary`)
              return base64
            } catch (error) {
              console.error(`❌ Failed to extract frame ${index + 1} via Cloudinary:`, error)
              throw error
            }
          })
        )
      }
      
      if (RENDER_API_URL) {
        console.log('🌐 Using Render API for frame extraction (strict mode - no fallback)...')
        // In strict mode, if Render API is configured it MUST work.
        // Any Render error will bubble up and cause auto-enhance to fail,
        // so you know you need to fix the Render service instead of silently falling back.
        frameBase64Images = await extractFramesWithRender(mediaUrl, frameTimes)
      } else {
        console.log('☁️ Using Cloudinary for frame extraction (Render API not configured)...')
        frameBase64Images = await extractFramesViaCloudinary()
      }
      
      if (frameBase64Images.length === 0) {
        throw new Error('No frames extracted - cannot perform content analysis')
      }
      
      console.log(`✅ Successfully extracted ${frameBase64Images.length} frames for analysis`)
        
      // Analyze frames with OpenAI Vision API
      console.log(`📸 Analyzing ${frameBase64Images.length} video frames with OpenAI Vision API...`)
      const frameImages = frameBase64Images.map(base64Image => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`
        }
      }))
      
      // Build content array with proper types for Vision API
      const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
        {
          type: 'text',
          text: `Analyze these ${frameBase64Images.length} frames extracted from a video (start, middle, end). You MUST analyze the ACTUAL visual content you see in these frames.

CRITICAL: Be VERY SPECIFIC about what you actually see:
1. Visual content: What's actually in the video? (people, objects, scenes, activities, environment)
2. Color palette: What colors do you actually see? (bright, dark, muted, vibrant, warm, cool, specific colors, color cast issues)
3. Lighting: What lighting conditions? (bright, dim, natural, artificial, high contrast, low contrast, overexposed, underexposed)
4. Mood/atmosphere: What feeling does the video give? (professional, casual, dramatic, fun, serious, romantic, energetic)
5. Quality issues: What problems do you see? (noise, grain, blur, compression artifacts, overexposure, underexposure, color issues, low resolution, pixelation, soft focus)
6. Motion issues: Is the video shaky or unstable? (camera shake, jittery movement, needs stabilization)
7. Composition issues: Are there unwanted objects? (distracting elements, people in background, objects that should be removed, watermarks, logos)
8. Framing issues: Does the video need cropping? (black bars, letterboxing, off-center subject, needs reframing, wrong aspect ratio)
9. Brightness/darkness: Is the video too bright or too dark? (overexposed, underexposed, needs brightness adjustment)
10. Contrast: Does the video need contrast adjustment? (flat/low contrast, too high contrast, needs contrast boost)
11. Sharpness: Is the video blurry or soft? (out of focus, motion blur, needs sharpening)
12. Color accuracy: Are colors accurate? (color cast, wrong white balance, tinted colors, needs color correction)
13. Text overlay needs: Does this video ACTUALLY need text overlays? (Only if it's clearly an intro/title sequence, tutorial that needs titles, or content that would benefit from text. If the video is complete content without text, say "no text needed")
14. Text overlay details (if text is needed): What text content would work? What size (small/medium/large)? What position (top/center/bottom)? What color would contrast best with the video background? Does it need highlight/background for visibility? What background color? Where should background be positioned?
15. Specific enhancements: What would ACTUALLY improve THIS specific video based on what you see?

IMPORTANT: Base your analysis ONLY on what you see in these frames. Be detailed and specific. This will determine unique enhancements for THIS video. For text overlays, be conservative - only suggest if the video clearly needs it.`
        },
        ...frameImages
      ]
      
      console.log('🤖 Calling OpenAI Vision API (GPT-4o) for content analysis...')
      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a professional video editor analyzing video frames. You MUST analyze the ACTUAL visual content you see. Be specific, detailed, and accurate. Base your analysis ONLY on what is visible in the frames provided.'
          },
          {
            role: 'user',
            content: contentParts
          }
        ],
        max_tokens: 600,
        temperature: 0.3 // Lower temperature for more accurate analysis
      })
      
      videoContentAnalysis = visionResponse.choices[0]?.message?.content || ''
      
      if (!videoContentAnalysis || videoContentAnalysis.length < 50) {
        throw new Error('Vision API returned empty or insufficient analysis')
      }
      
      contentAnalysisSuccess = true
      console.log('✅ REAL video content analysis completed!')
      console.log('📊 Analysis preview:', videoContentAnalysis.substring(0, 300) + '...')
      
    } catch (contentAnalysisError: any) {
      console.error('❌ REAL video content analysis FAILED:', contentAnalysisError?.message || contentAnalysisError)
      console.error('❌ Stack:', contentAnalysisError?.stack)
      
      // For production: If deep mode fails, fall back to quick mode for reliability
      // This ensures the feature always works, even if AI services are unavailable
      console.warn('⚠️ Deep analysis failed, falling back to quick mode for reliability...')
      
      // Generate quick suggestions as fallback
      const quickSuggestions = generateQuickSuggestions({
        duration,
        width,
        height,
        sizeMB,
        bitrateEstimate: parseFloat(bitrateEstimate),
        isLowResolution,
        isHighResolution,
        isShortVideo,
        isLongVideo,
        isVeryLongVideo,
        isLowBitrate,
        isHighBitrate,
        format,
      })
      
      const quickOperations = buildOperationsFromSuggestions(quickSuggestions, duration)
      
      // Ensure we always have at least one operation
      if (quickOperations.length === 0) {
        quickOperations.push({
          operation: 'colorGrade',
          params: { preset: 'cinematic' },
        })
      }
      
      return NextResponse.json({
        success: true,
        suggestions: quickSuggestions,
        operations: quickOperations,
        autoApply,
        videoMetadata: {
          duration,
          resolution: `${width}x${height}`,
          format,
          sizeMB: sizeMB.toFixed(2),
        },
        message: autoApply
          ? `✨ Auto-enhanced your video with ${quickOperations.length} enhancement${quickOperations.length !== 1 ? 's' : ''} (using quick mode)`
          : `✨ Suggested ${quickOperations.length} enhancement${quickOperations.length !== 1 ? 's' : ''} based on video metadata (deep analysis unavailable).`,
        mode: 'quick', // Return as quick mode since deep failed
        warning: 'Deep AI analysis unavailable, using metadata-based suggestions',
      })
    }
    
    // CRITICAL: Ensure we have content analysis before proceeding
    if (!contentAnalysisSuccess || !videoContentAnalysis) {
      throw new Error('Video content analysis is required but was not completed successfully')
    }

    // Use AI to analyze video content and suggest ONLY what's actually needed
    const analysisPrompt = `You are a professional video editor analyzing this video. You have BOTH metadata AND actual video content analysis from OpenAI Vision API.

🎬 ACTUAL VIDEO CONTENT ANALYSIS (from Vision API - THIS IS THE MOST IMPORTANT):
${videoContentAnalysis}

🚨 CRITICAL: The content analysis above describes what's ACTUALLY in THIS SPECIFIC VIDEO. You MUST base ALL your suggestions on this analysis.

⚠️ DO NOT IGNORE THE CONTENT ANALYSIS - IT IS THE PRIMARY SOURCE OF TRUTH

🚨 TEXT OVERLAY RULE: Only suggest text overlay if the content analysis EXPLICITLY mentions that the video needs text, titles, intro, or would benefit from text. If the content analysis doesn't mention text needs, set "needed": false. DO NOT add text just because the video is short - only if the content actually needs it.

RULES FOR DIFFERENT VIDEOS:
1. If Video A has "bright sunny outdoor scene" → suggest "vibrant" or "golden hour" color grade
2. If Video B has "dark moody indoor scene" → suggest "moody" or "cinematic" color grade  
3. If Video C has "professional business meeting" → suggest "studio tone" or "natural tone" color grade
4. If Video D has "fun casual party" → suggest "vibrant" or "bright punch" color grade
5. Each video MUST get UNIQUE suggestions based on its ACTUAL content

CRITICAL RULES:
1. You MUST use the content analysis above to make suggestions - it describes what's ACTUALLY in the video
2. DO NOT give generic suggestions - be SPECIFIC to this video's actual content
3. Different videos with different content MUST get DIFFERENT suggestions
4. If the content analysis says "bright colors" → suggest different enhancements than if it says "dark moody"
5. If the content analysis says "professional/business" → suggest different enhancements than if it says "casual/fun"
6. Base EVERY suggestion on what the Vision API actually saw in the video frames
7. If you see "people talking" → different suggestions than "landscape/nature"
8. If you see "indoor/office" → different suggestions than "outdoor/sunny"
9. READ the content analysis carefully and match suggestions to what it describes

VIDEO METADATA (EXACT VALUES):
- Duration: ${duration} seconds ${duration === 0 ? '(⚠️ Duration not detected - analyze based on other factors)' : duration < 5 ? '(VERY SHORT)' : duration < 15 ? '(SHORT)' : duration < 60 ? '(MEDIUM)' : duration < 300 ? '(LONG)' : '(VERY LONG)'}
- Resolution: ${width}x${height} ${isLowResolution ? '(LOW RESOLUTION - may need noise reduction)' : isHighResolution ? '(HIGH RESOLUTION - good quality)' : '(MEDIUM RESOLUTION)'}
- Format: ${format}
- File Size: ${sizeMB}MB
- Estimated Bitrate: ${bitrateEstimate} Mbps ${isLowBitrate ? '(LOW BITRATE - likely compression artifacts/noise)' : isHighBitrate ? '(HIGH BITRATE - good quality)' : '(MEDIUM BITRATE)'}
- Video Length Category: ${isShortVideo ? 'SHORT (< 10s)' : isLongVideo ? 'LONG (> 60s)' : isVeryLongVideo ? 'VERY LONG (> 5min)' : 'MEDIUM (10-60s)'}

CRITICAL: Use the EXACT duration value (${duration}s). If duration is 0, you MUST still analyze based on resolution, bitrate, and file size - but DO NOT suggest text overlays or transitions that require knowing video length.

YOUR TASK: Analyze BOTH the content analysis AND metadata to suggest ONLY what THIS SPECIFIC VIDEO needs. Different videos should get DIFFERENT suggestions based on their actual content.

1. NOISE REDUCTION: Suggest if:
   - Content analysis mentions noise, grain, or compression artifacts
   - Low bitrate (< 2 Mbps) AND content analysis confirms quality issues
   - Low resolution (< 1280x720) AND visible quality problems
   - DO NOT suggest if content analysis shows clean, high-quality footage

2. SATURATION ADJUSTMENT: Suggest if:
   - Content analysis mentions "dull", "washed out", "muted colors" → increase saturation
   - Content analysis mentions "oversaturated", "too vibrant" → decrease saturation
   - Content analysis mentions "natural colors" → may need slight increase for pop
   - DO NOT suggest if content analysis shows well-balanced colors

3. COLOR GRADING: Choose based on ACTUAL video content and mood:
   - If content is "professional/business" → "studio tone" or "natural tone"
   - If content is "dramatic/serious" → "moody" or "cinematic"
   - If content is "fun/casual" → "vibrant" or "bright punch"
   - If content is "retro/vintage" → "vintage" or "warm"
   - If content is "dark/low light" → "moody" or "high contrast"
   - If content is "bright/sunny" → "vibrant" or "golden hour"
   - Match the color grade to the ACTUAL mood and content, not just metadata

4. TRANSITIONS: Suggest ONLY if:
   - Video is long (> 30 seconds) AND duration is known (> 0) - likely has multiple scenes
   - Suggest "Fade" or "Cross Dissolve" for smooth transitions
   - DO NOT suggest if duration is 0 or unknown

5. TEXT OVERLAY: Suggest ONLY if content analysis indicates it's ACTUALLY needed:
   - Content analysis mentions "intro", "title", "opening", "needs text", "title card", "intro sequence"
   - Content analysis shows the video is clearly an intro/title sequence that would benefit from text
   - Content analysis indicates tutorial/educational content that might need titles
   - DO NOT suggest text overlay just because video is short - only if content analysis shows it's needed
   - DO NOT suggest if content analysis shows the video is complete without text
   - DO NOT suggest if duration is 0 or unknown
   - CRITICAL: If content analysis doesn't mention anything about needing text/titles/intro, set "needed": false
   - If text is needed, analyze video content to suggest PERFECT configuration:
     * Text content: Based on what the video is about (e.g., "Welcome to [topic]", "Tutorial: [subject]", "Introduction to [topic]")
     * Style: Choose from Bold, Cinematic, Minimal, Retro, Handwritten, Neon Glow, etc. - match video mood
     * Size: "small" (32px), "medium" (48px), "large" (64px) - choose based on video resolution and importance
     * Position: "top" (for titles), "center" (for emphasis), "bottom" (for lower thirds), or specific corners
     * Color: Choose color that contrasts PERFECTLY with video background:
       - Dark video background → white, yellow, cyan
       - Light video background → black, dark blue, dark red
       - Match video theme colors if appropriate
     * Highlight/Background: "true" if text needs to stand out (busy background), "false" if video background is clean
     * Background color: If highlight is true, choose contrasting color:
       - Yellow for dark videos
       - Black/white for light videos
       - Match video theme if appropriate
     * Background position: Usually same as text position

6. EFFECTS: Suggest ONLY if content analysis indicates:
   - "romantic/soft" content → "dreamy glow"
   - "cinematic/dramatic" content → "film grain"
   - "low quality/blurry" content → "soft focus"
   - "retro/vintage" content → "film grain" or "old film"
   - DO NOT suggest effects if content analysis shows high-quality, professional footage
   - Max 1-2 subtle effects, only if they match the content mood

7. MUSIC: Suggest ONLY if:
   - Video is > 10 seconds AND duration is known (> 0)
   - Video likely lacks audio or needs atmosphere
   - Match mood to video length and type
   - DO NOT suggest if duration is 0 or unknown

8. SPEED ADJUSTMENT: Suggest ONLY if:
   - Video is very short (< 5 seconds) AND duration is known (> 0) - might need slow motion
   - Video is very long (> 5 minutes) AND duration is known (> 0) - might need speed up
   - DO NOT suggest if duration is 0 or unknown

9. BRIGHTNESS/DARKNESS ADJUSTMENT: Suggest if content analysis mentions:
   - "too bright", "overexposed", "washed out" → decrease brightness (make darker)
   - "too dark", "underexposed", "hard to see" → increase brightness (make lighter)
   - "needs more contrast" → adjust brightness and contrast
   - DO NOT suggest if lighting is well-balanced

10. CROP: Suggest if content analysis mentions:
    - "black bars", "letterboxing", "pillarboxing" → crop to remove bars
    - "off-center subject", "needs reframing" → crop to center subject
    - "unwanted edges", "needs tighter framing" → crop to improve composition
    - DO NOT suggest if framing is good

11. OBJECT REMOVAL: Suggest if content analysis mentions:
    - "distracting objects", "unwanted elements", "people in background", "objects that should be removed"
    - Specify region: "left", "right", "top", "bottom", "center"
    - Method: "blur" (for background objects), "crop" (to hide), "black" (to black out)
    - DO NOT suggest if no unwanted objects detected

12. HD UPSCALING: Suggest if:
    - Resolution is low (< 1280x720) AND content analysis confirms quality issues
    - Content analysis mentions "low resolution", "pixelated", "needs upscaling"
    - DO NOT suggest if resolution is already high (>= 1920x1080)

13. SHARPENING: Suggest if content analysis mentions:
    - "blurry", "out of focus", "soft", "motion blur", "needs sharpening"
    - Video appears unsharp or lacks detail
    - DO NOT suggest if video is already sharp and clear

14. CONTRAST ADJUSTMENT: Suggest if content analysis mentions:
    - "flat", "low contrast", "washed out", "needs more contrast" → increase contrast
    - "too high contrast", "harsh", "over-contrasted" → decrease contrast
    - DO NOT suggest if contrast is well-balanced

15. STABILIZATION: Suggest if content analysis mentions:
    - "shaky", "jittery", "camera shake", "unstable", "needs stabilization"
    - Video has noticeable camera movement or shake
    - DO NOT suggest if video is already stable

16. WHITE BALANCE/COLOR CORRECTION: Suggest if content analysis mentions:
    - "color cast", "wrong white balance", "tinted", "color temperature off", "warm/cool cast"
    - Colors appear inaccurate or have a color cast
    - DO NOT suggest if colors are accurate

17. ASPECT RATIO CORRECTION: Suggest if content analysis mentions:
    - "wrong aspect ratio", "stretched", "squashed", "distorted", "needs aspect ratio fix"
    - Video appears distorted or has incorrect proportions
    - DO NOT suggest if aspect ratio is correct

18. WATERMARK/LOGO REMOVAL: Suggest if content analysis mentions:
    - "watermark", "logo", "branding overlay", "unwanted logo", "needs watermark removal"
    - Unwanted watermarks or logos visible in video
    - DO NOT suggest if no watermarks detected

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
  "brightness": {
    "needed": true/false,
    "adjustment": "increase|decrease", // "increase" = make lighter, "decrease" = make darker
    "amount": 0.1-0.3 // adjustment amount
  },
  "crop": {
    "needed": true/false,
    "x": 0-100, // crop x position (percentage)
    "y": 0-100, // crop y position (percentage)
    "width": 50-100, // crop width (percentage)
    "height": 50-100 // crop height (percentage)
  },
  "removeObject": {
    "needed": true/false,
    "region": "left|right|top|bottom|center", // if needed
    "method": "blur|crop|black" // if needed
  },
  "hdUpscale": {
    "needed": true/false,
    "targetResolution": "1280x720|1920x1080" // if needed
  },
  "sharpen": {
    "needed": true/false,
    "intensity": "light|medium|strong" // if needed
  },
  "contrast": {
    "needed": true/false,
    "adjustment": "increase|decrease", // if needed
    "amount": 0.1-0.3 // adjustment amount
  },
  "stabilization": {
    "needed": true/false
  },
  "whiteBalance": {
    "needed": true/false,
    "adjustment": "warm|cool|neutral" // if needed
  },
  "aspectRatio": {
    "needed": true/false,
    "targetRatio": "16:9|9:16|4:3|1:1" // if needed
  },
  "watermarkRemoval": {
    "needed": true/false,
    "region": "top|bottom|center|corner" // if needed
  },
  "effects": ["effect1"] (optional, max 1-2, only if needed),
  "transitions": ["transition1"] (optional, only if video is long or has multiple scenes),
  "music": "preset_name" (optional, only if video > 10 seconds),
  "text": {
    "needed": true/false, // ONLY true if content analysis indicates text is actually needed
    "suggestion": "text content" (if needed - base on content analysis, not generic "Welcome"),
    "style": "preset_name" (if needed - Bold, Cinematic, Minimal, etc.),
    "position": "top|bottom|center|top-left|top-right|bottom-left|bottom-right" (if needed),
    "size": "small|medium|large|36|48|60" (if needed - specific number or size name),
    "color": "white|black|yellow|red|blue|#FFFFFF" (if needed - color name or hex),
    "highlight": true/false, // If text needs background/highlight for visibility
    "backgroundColor": "yellow|white|black|transparent|#FFFF00" (if highlight is true),
    "backgroundPosition": "top|bottom|center" (if highlight is true - usually same as text position)
  },
  "speed": 1.0 (optional, only if clearly needed),
  "reasoning": "MUST reference the Vision API content analysis. Explain: 'Based on the Vision API analysis which showed [specific content from analysis], I suggest [enhancement] because [reason].' Be VERY specific about what the Vision API saw and how that led to each suggestion. Different videos MUST have different reasoning."
}

AVAILABLE PRESETS:
- Color grades: warm, cool, vintage, moody, cinematic, vibrant, muted, natural tone, studio tone, bright punch, high contrast
- Effects: soft focus, dreamy glow, film grain, blur, glow (max 1-2)
- Music: Ambient, Upbeat, Emotional, Chill, Cinematic Epic, Lo-Fi, Corporate, Inspirational
- Transitions: Fade, Cross Dissolve, Slide, Zoom
- Text styles: Bold, Cinematic, Minimal, Retro, Handwritten, Neon Glow, Typewriter, Glitch, Lower Third, Gradient, Fade-In Title, 3D Text, Caption Overlay, Shadowed, Animated Quote, Headline, Modern Sans, Serif Classic, Story Caption, Kinetic Title, News Banner, Outline Text, Glow Edge, Floating Text
- Text colors: white, black, yellow, red, blue, green, cyan, magenta, or hex codes (#FFFFFF)
- Background colors: yellow, white, black, blue, red, green, transparent, or hex codes (#FFFF00)

IMPORTANT RULES:
- Suggest noise reduction if bitrate < 2 Mbps OR resolution < 1280x720
- Suggest saturation increase if video seems compressed/dull (low bitrate or small file size for duration)
- Always suggest ONE color grade (choose based on video quality and length IF duration is known)
- Suggest transitions only if video is > 30 seconds AND duration is known (> 0)
- Suggest text only if video is < 15 seconds OR > 2 minutes AND duration is known (> 0)
- Suggest music only if video is > 10 seconds AND duration is known (> 0)
- If duration is 0 or unknown, focus on: color grade, noise reduction (if needed), saturation (if needed) - skip time-based features
- Keep it minimal - only suggest what's ACTUALLY needed based on REAL metadata`

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
    // OPTIMAL ORDER: Structural changes first, then color/quality, then enhancements
    const operations: Array<{ operation: string; params: any }> = []

    // PHASE 1: Structural operations (affect video structure - do these first)
    // 1. Stabilization (if needed - affects entire video, should be first)
    if (suggestions.stabilization && suggestions.stabilization.needed) {
      operations.push({
        operation: 'filter',
        params: {
          type: 'stabilization',
        },
      })
    }

    // 2. Crop (if needed - do before color grading for efficiency)
    if (suggestions.crop && suggestions.crop.needed) {
      operations.push({
        operation: 'crop',
        params: {
          x: suggestions.crop.x || 0,
          y: suggestions.crop.y || 0,
          width: suggestions.crop.width || 100,
          height: suggestions.crop.height || 100,
        },
      })
    }

    // 3. Object removal (if needed - do before color grading)
    if (suggestions.removeObject && suggestions.removeObject.needed) {
      operations.push({
        operation: 'removeObject',
        params: {
          region: suggestions.removeObject.region || 'center',
          method: suggestions.removeObject.method || 'blur',
        },
      })
    }

    // 4. Watermark removal (if needed - similar to object removal)
    if (suggestions.watermarkRemoval && suggestions.watermarkRemoval.needed) {
      operations.push({
        operation: 'removeObject',
        params: {
          region: suggestions.watermarkRemoval.region || 'top',
          method: 'blur', // Blur is best for watermarks
        },
      })
    }

    // PHASE 2: Quality improvements (before color grading)
    // 5. Noise reduction (if needed - do before color grading)
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

    // PHASE 3: Color and visual adjustments
    // 6. Color grading (always suggested - core enhancement)
    if (suggestions.colorGrade) {
      operations.push({
        operation: 'colorGrade',
        params: { preset: suggestions.colorGrade },
      })
    }

    // 7. White balance correction (if needed - after color grading)
    if (suggestions.whiteBalance && suggestions.whiteBalance.needed) {
      const adjustment = suggestions.whiteBalance.adjustment || 'neutral'
      const colorGradePreset = adjustment === 'warm' ? 'warm' : adjustment === 'cool' ? 'cool' : 'natural tone'
      // Note: White balance is handled via color grade adjustment
    }

    // 8. Brightness adjustment (if needed)
    if (suggestions.brightness && suggestions.brightness.needed) {
      const adjustment = suggestions.brightness.adjustment || 'increase'
      const amount = suggestions.brightness.amount || 0.2
      
      // Brightness filter: value > 1.0 = lighter, value < 1.0 = darker
      const brightnessValue = adjustment === 'increase' 
        ? 1 + amount  // e.g., 1.2 = 20% brighter (lighter)
        : 1 - amount  // e.g., 0.8 = 20% darker
      
      operations.push({
        operation: 'filter',
        params: {
          type: 'brightness',
          value: brightnessValue,
        },
      })
    }

    // 9. Contrast adjustment (if needed)
    if (suggestions.contrast && suggestions.contrast.needed) {
      const adjustment = suggestions.contrast.adjustment || 'increase'
      const amount = suggestions.contrast.amount || 0.2
      
      const contrastValue = adjustment === 'increase' 
        ? 1 + amount  // e.g., 1.2 = 20% more contrast
        : 1 - amount  // e.g., 0.8 = 20% less contrast
      
      operations.push({
        operation: 'filter',
        params: {
          type: 'contrast',
          value: contrastValue,
        },
      })
    }

    // 10. Saturation adjustment (if needed)
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

    // PHASE 4: Sharpening and final quality touches
    // 11. Sharpening (if needed - final quality touch)
    if (suggestions.sharpen && suggestions.sharpen.needed) {
      const intensity = suggestions.sharpen.intensity || 'medium'
      const strength = intensity === 'strong' ? 1.5 : intensity === 'medium' ? 1.2 : 1.1
      operations.push({
        operation: 'filter',
        params: {
          type: 'sharpen',
          value: strength,
        },
      })
    }

    // 12. HD Upscaling (if needed - after all quality improvements)
    if (suggestions.hdUpscale && suggestions.hdUpscale.needed) {
      // HD upscaling would require special processing
      // For now, note it in suggestions
    }

    // PHASE 5: Creative enhancements
    // 13. Effects (1-2 max, only if needed)
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

    // PHASE 6: Text overlays
    // 14. Text overlay (only if AI analysis explicitly indicates it's needed)
    // CRITICAL: Only add text if AI determined it's actually needed based on content analysis
    if (suggestions.text && suggestions.text.needed === true && duration > 0) {
      // Only proceed if AI explicitly said text is needed
      const textContent = suggestions.text.suggestion || suggestions.text.text || ''
      // If no specific text suggested, don't add generic text - skip it
      if (textContent && textContent.trim().length > 0 && textContent.toLowerCase() !== 'welcome') {
        // Build comprehensive text params based on AI analysis
        const textParams: any = {
          text: textContent,
          preset: suggestions.text.style || 'Bold',
          position: suggestions.text.position || 'center',
        }
        
        // Add size if specified
        if (suggestions.text.size) {
          // Convert size name to number if needed
          if (typeof suggestions.text.size === 'string') {
            const sizeMap: { [key: string]: number } = {
              'small': 32,
              'medium': 48,
              'large': 64,
            }
            textParams.fontSize = sizeMap[suggestions.text.size.toLowerCase()] || parseInt(suggestions.text.size) || 48
          } else {
            textParams.fontSize = suggestions.text.size
          }
        }
        
        // Add color if specified
        if (suggestions.text.color) {
          textParams.fontColor = suggestions.text.color
        }
        
        // Add background/highlight if needed
        if (suggestions.text.highlight === true && suggestions.text.backgroundColor) {
          textParams.backgroundColor = suggestions.text.backgroundColor
          // Use customText for full control over background
          operations.push({
            operation: 'customText',
            params: {
              ...textParams,
              textStyle: suggestions.text.style || 'Bold',
            },
          })
        } else {
          // Use standard addText if no background needed
          operations.push({
            operation: 'addText',
            params: textParams,
          })
        }
      }
    }


    // PHASE 7: Audio and timing
    // 16. Music (if video is long enough AND duration is known)
    if (suggestions.music && duration > 10 && duration > 0) {
      operations.push({
        operation: 'addMusic',
        params: { preset: suggestions.music },
      })
    }

    // 17. Transitions (only if video is long or has multiple scenes AND duration is known)
    if (suggestions.transitions && Array.isArray(suggestions.transitions) && suggestions.transitions.length > 0 && duration > 30 && duration > 0) {
      operations.push({
        operation: 'addTransition',
        params: { preset: suggestions.transitions[0] },
      })
    }

    // 18. Speed adjustment (only if clearly needed AND duration is known)
    if (suggestions.speed && suggestions.speed !== 1.0 && duration > 0) {
      operations.push({
        operation: 'adjustSpeed',
        params: { speed: suggestions.speed },
      })
    }

    // 19. Aspect ratio correction (if needed - would require crop/resize)
    if (suggestions.aspectRatio && suggestions.aspectRatio.needed) {
      // Aspect ratio correction would require crop/resize operations
      // For now, note it in suggestions
      // Future: implement aspect ratio correction
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
    if (suggestions.music && duration > 10 && duration > 0) suggestionsSummary.music = suggestions.music
    if (suggestions.transitions?.length && duration > 30 && duration > 0) suggestionsSummary.transitions = suggestions.transitions
    // Only include text if AI explicitly determined it's needed AND has meaningful content
    if (suggestions.text?.needed === true && duration > 0) {
      const textContent = suggestions.text.suggestion || suggestions.text.text || ''
      if (textContent && textContent.trim().length > 0 && textContent.toLowerCase() !== 'welcome') {
        suggestionsSummary.text = {
          needed: true,
          suggestion: textContent,
          style: suggestions.text.style || 'Bold',
          position: suggestions.text.position || 'center',
          size: suggestions.text.size,
          color: suggestions.text.color,
          highlight: suggestions.text.highlight,
          backgroundColor: suggestions.text.backgroundColor,
          backgroundPosition: suggestions.text.backgroundPosition,
        }
      }
    }
    if (suggestions.speed && suggestions.speed !== 1.0 && duration > 0) suggestionsSummary.speed = suggestions.speed
    if (suggestions.brightness && suggestions.brightness.needed) suggestionsSummary.brightness = suggestions.brightness
    if (suggestions.crop && suggestions.crop.needed) suggestionsSummary.crop = suggestions.crop
    if (suggestions.removeObject && suggestions.removeObject.needed) suggestionsSummary.removeObject = suggestions.removeObject
    if (suggestions.hdUpscale && suggestions.hdUpscale.needed) suggestionsSummary.hdUpscale = suggestions.hdUpscale
    if (suggestions.sharpen && suggestions.sharpen.needed) suggestionsSummary.sharpen = suggestions.sharpen
    if (suggestions.contrast && suggestions.contrast.needed) suggestionsSummary.contrast = suggestions.contrast
    if (suggestions.stabilization && suggestions.stabilization.needed) suggestionsSummary.stabilization = suggestions.stabilization
    if (suggestions.whiteBalance && suggestions.whiteBalance.needed) suggestionsSummary.whiteBalance = suggestions.whiteBalance
    if (suggestions.aspectRatio && suggestions.aspectRatio.needed) suggestionsSummary.aspectRatio = suggestions.aspectRatio
    if (suggestions.watermarkRemoval && suggestions.watermarkRemoval.needed) suggestionsSummary.watermarkRemoval = suggestions.watermarkRemoval

    // Ensure we always have at least one operation (color grade is always included)
    if (operations.length === 0) {
      // Fallback: at minimum, apply a color grade
      operations.push({
        operation: 'colorGrade',
        params: { preset: suggestions.colorGrade || 'cinematic' },
      })
      suggestionsSummary.colorGrade = suggestions.colorGrade || 'cinematic'
    }

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
        ? `✨ Auto-enhanced your video with ${operations.length} enhancement${operations.length !== 1 ? 's' : ''}`
        : `✨ Suggested ${operations.length} enhancement${operations.length !== 1 ? 's' : ''} based on your video analysis. Review and apply?`,
      mode: 'deep',
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

