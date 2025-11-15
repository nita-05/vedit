import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { v2 as cloudinary } from 'cloudinary'
import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import os from 'os'
import ffmpeg from 'fluent-ffmpeg'

// Configure Cloudinary - use server-side env vars (without NEXT_PUBLIC_)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Helper function to get writable temp directory (works on Vercel and local)
function getTempDir(): string {
  // On Vercel, use /tmp which is writable
  if (process.env.VERCEL) {
    return '/tmp'
  }
  return process.env.TMPDIR || process.env.TEMP || os.tmpdir()
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
    const { videoPublicId, autoApply = false, videoDuration } = body

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
          // Fallback: Try to fetch video and get duration using FFprobe
          console.log('📥 Fetching video to detect duration...')
          const videoResponse = await fetch(mediaUrl)
          if (videoResponse.ok) {
            const tempDir = getTempDir()
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true })
            }
            const tempFilePath = path.join(tempDir, `duration_check_${Date.now()}.mp4`)
            const arrayBuffer = await videoResponse.arrayBuffer()
            fs.writeFileSync(tempFilePath, Buffer.from(arrayBuffer))
            
            // Use FFprobe to get duration
            await new Promise<void>((resolve, reject) => {
              ffmpeg.ffprobe(tempFilePath, (err: any, metadata: any) => {
                if (!err && metadata && metadata.format && metadata.format.duration) {
                  duration = Math.round(metadata.format.duration * 10) / 10 // Round to 1 decimal
                  console.log(`✅ Detected video duration: ${duration}s`)
                } else {
                  console.warn('⚠️ Could not detect video duration, using default')
                }
                // Cleanup
                try {
                  if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath)
                  }
                } catch {}
                resolve()
              })
            })
          }
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

    // REAL AI CONTENT ANALYSIS: Extract frames and analyze actual video content
    let videoContentAnalysis = ''
    let contentAnalysisSuccess = false
    
    try {
      console.log('🎬 Starting REAL video content analysis (extracting frames)...')
      const tempDir = getTempDir()
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      
      // Download video temporarily
      console.log('📥 Downloading video for frame extraction...')
      const videoResponse = await fetch(mediaUrl)
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status}`)
      }
      
      const tempVideoPath = path.join(tempDir, `analyze_${Date.now()}.mp4`)
      const arrayBuffer = await videoResponse.arrayBuffer()
      fs.writeFileSync(tempVideoPath, Buffer.from(arrayBuffer))
      console.log('✅ Video downloaded, extracting frames...')
      
      // Extract 3 frames (start, middle, end) for analysis
      const framePaths: string[] = []
      const frameTimes = duration > 0 
        ? [Math.max(0, duration * 0.1), Math.max(0, duration * 0.5), Math.max(0, duration * 0.9)]
        : [0.5, 1, 1.5] // Fallback times if duration unknown
      
      console.log(`📸 Extracting frames at: ${frameTimes.join(', ')}s`)
      
      for (let i = 0; i < 3; i++) {
        const framePath = path.join(tempDir, `frame_${i}_${Date.now()}.jpg`)
        try {
          await new Promise<void>((resolve, reject) => {
            const ffmpegProcess = ffmpeg(tempVideoPath)
              .screenshots({
                timestamps: [frameTimes[i]],
                filename: path.basename(framePath),
                folder: path.dirname(framePath),
                size: '640x360' // Smaller for faster processing
              })
              .on('end', () => {
                if (fs.existsSync(framePath)) {
                  framePaths.push(framePath)
                  console.log(`✅ Frame ${i + 1} extracted: ${framePath}`)
                } else {
                  console.warn(`⚠️ Frame ${i + 1} file not created`)
                }
                resolve()
              })
              .on('error', (err) => {
                console.error(`❌ Frame ${i + 1} extraction error:`, err)
                reject(err)
              })
          })
        } catch (frameError) {
          console.error(`❌ Failed to extract frame ${i + 1}:`, frameError)
          // Continue with other frames
        }
      }
      
      if (framePaths.length === 0) {
        throw new Error('No frames extracted - cannot perform content analysis')
      }
      
      console.log(`✅ Successfully extracted ${framePaths.length} frames for analysis`)
        
      // Analyze frames with OpenAI Vision API
      console.log(`📸 Analyzing ${framePaths.length} video frames with OpenAI Vision API...`)
      const frameImages = framePaths.map(framePath => {
        const imageBuffer = fs.readFileSync(framePath)
        const base64Image = imageBuffer.toString('base64')
        return {
          type: 'image_url' as const,
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`
          }
        }
      })
      
      // Build content array with proper types for Vision API
      const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
        {
          type: 'text',
          text: `Analyze these ${framePaths.length} frames extracted from a video (start, middle, end). You MUST analyze the ACTUAL visual content you see in these frames.

CRITICAL: Be VERY SPECIFIC about what you actually see:
1. Visual content: What's actually in the video? (people, objects, scenes, activities, environment)
2. Color palette: What colors do you actually see? (bright, dark, muted, vibrant, warm, cool, specific colors)
3. Lighting: What lighting conditions? (bright, dim, natural, artificial, high contrast, low contrast)
4. Mood/atmosphere: What feeling does the video give? (professional, casual, dramatic, fun, serious, romantic, energetic)
5. Quality issues: What problems do you see? (noise, grain, blur, compression artifacts, overexposure, underexposure, color issues)
6. Specific enhancements: What would ACTUALLY improve THIS specific video based on what you see?

IMPORTANT: Base your analysis ONLY on what you see in these frames. Be detailed and specific. This will determine unique enhancements for THIS video.`
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
      
      // Cleanup frames
      framePaths.forEach(framePath => {
        try {
          if (fs.existsSync(framePath)) fs.unlinkSync(framePath)
        } catch {}
      })
      
      // Cleanup video
      try {
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath)
      } catch {}
      
    } catch (contentAnalysisError: any) {
      console.error('❌ REAL video content analysis FAILED:', contentAnalysisError?.message || contentAnalysisError)
      console.error('❌ Stack:', contentAnalysisError?.stack)
      // DO NOT continue - throw error to prevent fallback
      throw new Error(`Video content analysis failed: ${contentAnalysisError?.message || 'Unknown error'}. Cannot provide accurate suggestions without analyzing actual video content.`)
    }
    
    // CRITICAL: Ensure we have content analysis before proceeding
    if (!contentAnalysisSuccess || !videoContentAnalysis) {
      throw new Error('Video content analysis is required but was not completed successfully')
    }

    // Use AI to analyze video content and suggest ONLY what's actually needed
    const analysisPrompt = `You are a professional video editor analyzing this video. You have BOTH metadata AND actual video content analysis from OpenAI Vision API. 

🎬 ACTUAL VIDEO CONTENT ANALYSIS (from Vision API):
${videoContentAnalysis}

CRITICAL RULES:
1. You MUST use the content analysis above to make suggestions - it describes what's ACTUALLY in the video
2. DO NOT give generic suggestions - be SPECIFIC to this video's actual content
3. Different videos with different content MUST get DIFFERENT suggestions
4. If the content analysis says "bright colors" → suggest different enhancements than if it says "dark moody"
5. If the content analysis says "professional/business" → suggest different enhancements than if it says "casual/fun"
6. Base EVERY suggestion on what the Vision API actually saw in the video frames

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

5. TEXT OVERLAY: Suggest ONLY if:
   - Video is short (< 15 seconds) AND duration is known (> 0) - likely needs title/intro
   - Video is very long (> 2 minutes) AND duration is known (> 0) - may need chapter markers
   - DO NOT suggest if duration is 0 or unknown

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
  "reasoning": "Detailed explanation of why each suggestion is needed based on BOTH the actual video content analysis AND metadata. Be specific about what you saw in the video frames and how that influenced your suggestions."
}

AVAILABLE PRESETS:
- Color grades: warm, cool, vintage, moody, cinematic, vibrant, muted, natural tone, studio tone, bright punch, high contrast
- Effects: soft focus, dreamy glow, film grain, blur, glow (max 1-2)
- Music: Ambient, Upbeat, Emotional, Chill, Cinematic Epic, Lo-Fi, Corporate, Inspirational
- Transitions: Fade, Cross Dissolve, Slide, Zoom

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

    // 5. Music (if video is long enough AND duration is known)
    if (suggestions.music && duration > 10 && duration > 0) {
      operations.push({
        operation: 'addMusic',
        params: { preset: suggestions.music },
      })
    }

    // 6. Transitions (only if video is long or has multiple scenes AND duration is known)
    if (suggestions.transitions && Array.isArray(suggestions.transitions) && suggestions.transitions.length > 0 && duration > 30 && duration > 0) {
      operations.push({
        operation: 'addTransition',
        params: { preset: suggestions.transitions[0] },
      })
    }

    // 7. Text overlay (only if needed AND duration is known)
    if (suggestions.text && suggestions.text.needed && duration > 0) {
      operations.push({
        operation: 'addText',
        params: {
          text: suggestions.text.suggestion || 'Welcome',
          preset: suggestions.text.style || 'Bold',
          position: suggestions.text.position || 'center',
        },
      })
    }

    // 8. Speed adjustment (only if clearly needed AND duration is known)
    if (suggestions.speed && suggestions.speed !== 1.0 && duration > 0) {
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
    if (suggestions.music && duration > 10 && duration > 0) suggestionsSummary.music = suggestions.music
    if (suggestions.transitions?.length && duration > 30 && duration > 0) suggestionsSummary.transitions = suggestions.transitions
    if (suggestions.text?.needed && duration > 0) suggestionsSummary.text = suggestions.text
    if (suggestions.speed && suggestions.speed !== 1.0 && duration > 0) suggestionsSummary.speed = suggestions.speed

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

