import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { v2 as cloudinary } from 'cloudinary'
import { VideoProcessor } from '@/lib/videoProcessor'
import { CloudinaryTransformProcessor } from '@/lib/cloudinaryTransform'
import { saveEditHistory } from '@/lib/db'
import fs from 'fs'
import path from 'path'
import os from 'os'
import ffmpeg from 'fluent-ffmpeg'
import { validateVideoOperation, validatePublicId, sanitizeInput } from '@/lib/validation'
import { handleApiError, ValidationError, ProcessingError, logError } from '@/lib/errorHandler'
import { createRateLimiter } from '@/lib/rateLimiter'
import { createVideoProcessingTracker } from '@/lib/progressTracker'
import { getMusicUrlFromPreset } from '@/lib/freesound'

// Route configuration for Vercel
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for video processing
export const fetchCache = 'force-no-store'
export const revalidate = 0

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // Reduced to 30 seconds for faster responses
  maxRetries: 1, // Reduced retries for faster failure feedback
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Force HTTPS URLs globally to avoid mixed content issues
})

const videoProcessor = new VideoProcessor()

// Helper function to get writable temp directory (works on Vercel and local)
function getTempDir(): string {
  const isVercel = process.env.VERCEL === '1'
  if (isVercel) {
    return '/tmp'
  }
  return process.env.TMPDIR || process.env.TEMP || os.tmpdir()
}

// Render API URL for FFmpeg processing (if deployed)
const RENDER_API_URL = process.env.RENDER_API_URL || process.env.NEXT_PUBLIC_RENDER_API_URL

// Log Render API configuration status
if (RENDER_API_URL) {
  console.log(`✅ Render API configured: ${RENDER_API_URL}`)
} else {
  console.log(`⚠️ Render API not configured - will use Cloudinary fallback for operations`)
}

// System prompt for VIA
const SYSTEM_PROMPT = `You are VIA, an AI video and image editing assistant for VEDIT platform. You interpret natural language editing commands and convert them to structured JSON instructions for FFmpeg operations.

MEDIA TYPES SUPPORTED:
- Videos: All features work with videos (MP4, MOV, AVI, WebM)
- Images: Most features work with images (JPG, PNG, GIF, WebP)
  * Images support: Text overlays, Effects, Color grading, Cropping, Rotation, Speed (converts to video), Custom text/subtitle styling, Object removal
  * Images DO NOT support: Subtitles/captions (no audio), Transitions (single frame), Music (no audio), Voiceover (no audio)

AVAILABLE OPERATIONS & PRESETS:

📝 TEXT STYLES (operation: "addText"):
Minimal, Bold, Cinematic, Retro, Handwritten, Neon Glow, Typewriter, Glitch, Lower Third, Gradient, Fade-In Title, 3D Text, Caption Overlay, Shadowed, Animated Quote, Headline, Modern Sans, Serif Classic, Story Caption, Kinetic Title, News Banner, Outline Text, Glow Edge, Floating Text
+- SIZE & SCALE: When the user specifies a size (for example "size 48", "font 60", "large", "huge"), set "fontSize". Map adjectives to numbers: tiny/mini=18, small=24, medium=32, large=48, huge/big=60 unless a precise number is provided.
+- STYLES & KEYWORDS: Map phrases like "bold", "headline", "neon", "handwritten", "lower third", "caption box" to the closest preset or set "textStyle" when a preset name is given. Combine with "position" if the placement is mentioned (top, bottom, center, left, right).
+- COLORS: Support color names and hex codes. If the user says "yellow text" or "font color #FFAA00" update "fontColor" accordingly. Trim whitespace and normalize case.
+- HIGHLIGHT / BACKGROUND: When the user asks for a highlight, background, box, banner, or underline color ("yellow background", "pink highlight", "no background"), set "backgroundColor". Default highlight color to yellow when none provided. Use backgroundColor: "transparent" when they request no highlight/background.
+- OUTLINES/SHADOWS: When the user mentions outline/glow/shadow, prefer presets that already include those effects (e.g., "Glow Edge", "Shadowed"), or set "textStyle" to the matching style keyword.
⏰ TIME-BASED TEXT: Add "startTime" and "endTime" params to show text only during specific time ranges
Example: "Show text 'Hello' from 2 to 5 seconds" → {"operation": "addText", "params": {"text": "Hello", "preset": "Bold", "startTime": 2, "endTime": 5}}

📝 CAPTIONS/SUBTITLES (operation: "addCaptions"):
Automatically generate speech-to-text subtitles from video audio. Use when user requests "subtitle" or "captions". 
When user asks to generate subtitles, FIRST ask interactive questions before processing:
- "Where should subtitles appear? (bottom, top, center)"
- "What text size? (small, medium, large, or specific number 12-120)"
- "What text color? (white, yellow, red, blue, green, or hex code)"
- "What style? (Glow, Typewriter, Fade, Pop, Minimal, Bold, Cinematic)"
- "Do you want a background? (yes/no, and what color if yes)"

Presets: Glow, Typewriter, Fade, Pop, Minimal, Bold, Cinematic
NOTE: This operation only works with videos (requires audio). For images, use customText operation instead.

✨ EFFECTS (operation: "applyEffect"):
Blur, Glow, VHS, Motion, Film Grain, Lens Flare, Bokeh, Light Leak, Pixelate, Distortion, Chromatic Aberration, Shake, Sparkle, Shadow Pulse, Dreamy Glow, Glitch Flicker, Zoom-In Pulse, Soft Focus, Old Film, Dust Overlay, Light Rays, Mirror, Tilt Shift, Fisheye, Bloom
⏰ TIME-BASED EFFECTS: You can apply effects to specific time ranges by adding "startTime" and "endTime" params (in seconds)
CRITICAL: When user specifies a time range (e.g., "from 3 to 6 seconds", "from 3-6 seconds", "between 3 and 6 seconds"), you MUST include both startTime and endTime in the params.
Example: "Apply blur from 3 to 5 seconds" → {"operation": "applyEffect", "params": {"preset": "blur", "startTime": 3, "endTime": 5}}
Example: "Add blur effects from 3-6seconds" → {"operation": "applyEffect", "params": {"preset": "blur", "startTime": 3, "endTime": 6}}
Example: "Add blur effect starting from 10 seconds" → {"operation": "applyEffect", "params": {"preset": "blur", "startTime": 10}}
Example: "Blur from 2s to 8s" → {"operation": "applyEffect", "params": {"preset": "blur", "startTime": 2, "endTime": 8}}

🎬 TRANSITIONS (operation: "addTransition"):
Fade, Slide, Wipe, Zoom, Cross Dissolve, Blur In/Out, Spin, Morph Cut, Split Reveal, Flash, Zoom Blur, Cube Rotate, 3D Flip, Warp, Ripple, Glitch Transition, Luma Fade, Light Sweep, Stretch Pull, Film Roll, Page Turn, Diagonal Wipe, Motion Blur Transition, Cinematic Cut
NOTE: Transitions work best with videos (multiple frames). For single images, transitions will have minimal effect.

🎧 MUSIC & SFX (operation: "addMusic"):
Ambient, Upbeat, Emotional, Action, Chill, Techno, Cinematic Epic, Lo-Fi, Trap Beat, Corporate, Pop, Hip-Hop, Retro Synth, Acoustic, Inspirational, Piano Mood, Dark Tension, Happy Vibe, Travel Theme, Dramatic Rise, Fast Cut Beat, EDM Drop, Dream Pop, Sad Violin, Percussive Hit, Calm Nature Ambience
NOTE: Music requires video format. For images, music will convert the image to a video with the music track.

🎨 COLOR GRADING (operation: "colorGrade"):
Warm, Cool, Vintage, Moody, Teal-Orange, Noir, Sepia, Dreamy, Pastel, Vibrant, Muted, Cyberpunk, Neon, Golden Hour, High Contrast, Washed Film, Studio Tone, Soft Skin, Shadow Boost, Natural Tone, Bright Punch, Black & White, Orange Tint, Monochrome, Cinematic LUT, Sunset Glow
⏰ TIME-BASED COLOR GRADING: Add "startTime" and "endTime" params to apply color grading to specific segments
Example: "Apply cinematic color grade from 5 to 15 seconds" → {"operation": "colorGrade", "params": {"preset": "cinematic", "startTime": 5, "endTime": 15}}

🧠 BRAND KITS (operation: "applyBrandKit"):
Saved Brand Presets, Custom Font Sets, Logo Overlay, Watermark, Brand Colors, Outro Template, Title Template, Intro Animation, Font Pairing, Theme Presets, Typography Sets, Default Layouts, Auto Caption Style, Font Color Presets, Saved LUTs, Signature Animation, Motion Logo, Auto Outro Builder, Font Harmony Set, Voice Style Sync

OTHER OPERATIONS:
- trim: Trim video segments (params: start, end)
- merge: Merge multiple clips OR different videos (params: clips[] OR videoUrls[])
  * Can merge clips from same video OR different videos
  * If merging different videos: use videoUrls: [url1, url2, ...]
  * If merging clips from same video: use clips: [{url, start, end}, ...]
- removeClip: Remove specific clip (params: startTime, endTime)
- filter: Apply filters like blur, sharpen, grayscale (params: type, startTime?, endTime?)
  * ⏰ TIME-BASED: Can apply filters to specific time ranges using startTime/endTime
- analyzeVideo: Analyze video content and suggest suitable features (returns suggestions array)
- brainstormIdeas: Brainstorm video ideas and concepts (params: topic, style, duration, targetAudience)
- writeScript: Write video scripts (params: topic, length, style, tone, includeVisuals)
- adjustIntensity: Adjust effect intensity (params: effectPreset, currentIntensity, direction: "more"|"less")
- adjustZoom: Adjust zoom level (params: currentZoom, direction: "in"|"out")
- combineFeatures: Apply multiple features at once (params: features: [])
- generateVoiceover: Generate AI voiceover with TTS (params: text, voice)
- generateOverlay: Generate custom graphics with DALL-E (params: description)
- generateVideo: Generate video with Sora 2 (params: prompt)
- adjustSpeed: Adjust video playback speed (params: speed: 0.5|1.0|1.5|2.0)
- rotate: Rotate video (params: rotation: -180 to 180 degrees)
- crop: Crop video region (params: x, y, width, height in percentage or pixels)
- removeObject: Remove/blur objects from video (params: region, method: "blur"|"crop"|"black")
- customText: Add text with fully custom properties (params: text, fontSize, fontColor, backgroundColor, position, etc.)
- customSubtitle: Generate subtitles with custom style (params: style, color, size, position, backgroundColor)

RETURN JSON FORMAT:
{
  "operation": "operation_name",
  "params": {
    "preset": "preset_name",  // for text/effect/transition/music/color
    "text": "text content",  // REQUIRED for text operations - extract from user input or use descriptive placeholder
    "position": "top|bottom|center|left|right|top-left|top-right|bottom-left|bottom-right",  // for text
    "fontSize": 36,  // Custom font size (12-120)
    "fontColor": "white|red|blue|yellow|green|#FF0000",  // Custom text color (color name or hex)
    "backgroundColor": "yellow|blue|#FFFF00|transparent",  // Custom background color for text/subtitles
    "textStyle": "Bold|Minimal|Cinematic",  // Text style preset
    "subtitleStyle": "Glow|Minimal|Bold",  // Subtitle style
    "subtitleColor": "white|yellow|red",  // Custom subtitle color
    "subtitleSize": "small|medium|large|36",  // Custom subtitle size
    "subtitlePosition": "bottom|top|center",  // Custom subtitle position
    "duration": 3,  // in seconds
    "intensity": 0.5,  // 0-1 for effects
    "startTime": 3,  // Start time in seconds for time-based effects (optional)
    "endTime": 5,  // End time in seconds for time-based effects (optional)
    "speed": 1.0,  // Video speed (0.5 = slow, 1.0 = normal, 2.0 = fast)
    "rotation": 0,  // Rotation in degrees (-180 to 180)
    "crop": {"x": 0, "y": 0, "width": 100, "height": 100},  // Crop coordinates (percentage)
    "removeObject": {"region": "left|right|top|bottom|center", "method": "blur|crop|black"},  // Object removal
    ...other params
  },
  "message": "Human-friendly response message"
}

EXAMPLES:
User: "Add subtitles to my video" or "generate subtitle to this video"
Response: {"message": "Perfect! Let me ask you about your subtitle preferences:\n\n1. Where should subtitles appear? (bottom, top, center)\n2. What text size? (small, medium, large, or specific number like 36)\n3. What text color? (white, yellow, red, blue, green, or any color)\n4. What style? (Glow, Typewriter, Fade, Pop, Minimal, Bold, Cinematic)\n5. Do you want a background color? (yes/no, and what color if yes)\n\nOnce you provide these details, I'll generate the subtitles with your preferred settings! 🎬"}

User: "generate subtitles with yellow color at top position large size"
Response: {"operation": "addCaptions", "params": {"style": "Glow", "subtitleColor": "yellow", "subtitlePosition": "top", "subtitleSize": "large"}, "message": "Generating speech-to-text subtitles with yellow color, large size at top position..."}

User: "Add captions"
Response: {"operation": "addCaptions", "params": {"style": "Glow"}, "message": "Generating speech-to-text captions from your video audio..."}

User: "Add bold title at the top that says Welcome"
Response: {"operation": "addText", "params": {"preset": "Bold", "text": "Welcome", "position": "top"}, "message": "Adding Bold title 'Welcome' at the top of your video..."}

User: "Put text in center saying My Amazing Video with Neon Glow style"
Response: {"operation": "addText", "params": {"preset": "Neon Glow", "text": "My Amazing Video", "position": "center"}, "message": "Adding Neon Glow text 'My Amazing Video' in the center..."}

User: "Add highlighted text at bottom with background"
Response: {"operation": "addText", "params": {"preset": "Lower Third", "text": "", "position": "bottom"}, "message": "Adding highlighted Lower Third text box at the bottom..."}

User: "Remove scene from 2 to 3 seconds"
Response: {"operation": "removeClip", "params": {"startTime": 2, "endTime": 3}, "message": "Removing scene from 2s to 3s..."}

User: "Delete clip at 10 seconds"
Response: {"operation": "removeClip", "params": {"startTime": 10, "endTime": 12}, "message": "Removing 2-second clip starting at 10s..."}

User: "Add Dreamy Glow effect"
Response: {"operation": "applyEffect", "params": {"preset": "Dreamy Glow", "intensity": 0.7}, "message": "Applying Dreamy Glow effect with soft intensity..."}

User: "Apply VHS effect to make it look retro"
Response: {"operation": "applyEffect", "params": {"preset": "VHS", "intensity": 0.8}, "message": "Applying VHS effect for that retro aesthetic..."}

User: "Add Fisheye effect"
Response: {"operation": "applyEffect", "params": {"preset": "Fisheye", "intensity": 0.5}, "message": "Applying Fisheye distortion effect..."}

User: "Apply Cinematic Cut transition"
Response: {"operation": "addTransition", "params": {"preset": "Cinematic Cut", "duration": 1.5}, "message": "Adding Cinematic Cut transition..."}

User: "Add Slide transition"
Response: {"operation": "addTransition", "params": {"preset": "Slide", "duration": 1.0}, "message": "Adding Slide transition..."}

User: "Add Wipe transition between clips"
Response: {"operation": "addTransition", "params": {"preset": "Wipe", "duration": 1.0}, "message": "Adding Wipe transition..."}

User: "Add Lo-Fi background music"
Response: {"operation": "addMusic", "params": {"preset": "Lo-Fi", "volume": 0.3}, "message": "Adding Lo-Fi background music..."}

User: "Apply Golden Hour color grade"
Response: {"operation": "colorGrade", "params": {"preset": "Golden Hour"}, "message": "Applying Golden Hour color grading for that warm, cinematic look..."}

User: "Make it Cyberpunk styled"
Response: {"operation": "colorGrade", "params": {"preset": "Cyberpunk"}, "message": "Applying Cyberpunk color grading..."}

User: "Apply Noir color grade"
Response: {"operation": "colorGrade", "params": {"preset": "Noir"}, "message": "Applying Noir black and white grade..."}

User: "Trim from 5 to 20 seconds"
Response: {"operation": "trim", "params": {"start": 5, "end": 20}, "message": "Trimming video to 5s-20s segment..."}

User: "Cut first 10 seconds"
Response: {"operation": "trim", "params": {"start": 10}, "message": "Cutting first 10 seconds, keeping rest of video..."}

User: "Keep only from 30 to 60 seconds"
Response: {"operation": "trim", "params": {"start": 30, "end": 60}, "message": "Trimming video to keep 30s-60s segment..."}

User: "Trim the last 5 seconds"
Response: {"operation": "trim", "params": {"start": 0, "end": "(video_duration - 5)"}, "message": "Removing last 5 seconds from video..."}

User: "Merge 2 different videos" or "Merge video1 and video2"
Response: {"operation": "merge", "params": {"videoUrls": ["url1", "url2"]}, "message": "Merging 2 different videos into one..."}

User: "Merge clips from different videos"
Response: {"operation": "merge", "params": {"videoUrls": ["url1", "url2", ...]}, "message": "Merging clips from different videos..."}

User: "Add cinematic fade transition between clips"
Response: {"operation": "addTransition", "params": {"preset": "Fade", "duration": 1.0}, "message": "Adding cinematic fade transition..."}

User: "Suggest me which features are suitable for my current video"
Response: {"operation": "analyzeVideo", "params": {}, "message": "Analyzing your video content and suggesting best features..."}

User: "Brainstorm video ideas about technology"
Response: {"operation": "brainstormIdeas", "params": {"topic": "technology", "style": "educational"}, "message": "Brainstorming creative video ideas about technology..."}

User: "Write a script for a product launch video"
Response: {"operation": "writeScript", "params": {"topic": "product launch", "length": "medium", "style": "conversational", "tone": "engaging"}, "message": "Writing a script for your product launch video..."}

User: "Make this effect more visible"
Response: {"operation": "adjustIntensity", "params": {"effectPreset": "last_used_preset", "currentIntensity": 0.5, "direction": "more", "newIntensity": 0.8}, "message": "Increasing effect intensity to make it more visible..."}

User: "Make the glow effect less visible"
Response: {"operation": "adjustIntensity", "params": {"effectPreset": "Glow", "direction": "less", "newIntensity": 0.3}, "message": "Reducing Glow effect intensity..."}

User: "Zoom in more"
Response: {"operation": "adjustZoom", "params": {"currentZoom": 1.0, "direction": "in", "newZoom": 1.5}, "message": "Zooming in for closer view..."}

User: "Apply vintage color and add glow effect and bold title"
Response: {"operation": "combineFeatures", "params": {"features": [{"type": "colorGrade", "preset": "Vintage"}, {"type": "effect", "preset": "Glow"}, {"type": "text", "preset": "Bold", "text": "", "position": "top"}]}, "message": "Applying multiple features: Vintage color, Glow effect, and Bold title..."}

User: "Make subtitles yellow color with large size"
Response: {"operation": "customSubtitle", "params": {"subtitleColor": "yellow", "subtitleSize": "large", "style": "Glow"}, "message": "Updating subtitles with yellow color and large size..."}

User: "Add text Welcome with red color size 50 at top"
Response: {"operation": "customText", "params": {"text": "Welcome", "fontColor": "red", "fontSize": 50, "position": "top"}, "message": "Adding 'Welcome' text in red color, size 50 at the top..."}

User: "Add text with yellow background"
Response: {"operation": "customText", "params": {"text": "", "backgroundColor": "yellow", "position": "bottom"}, "message": "Adding text with yellow background..."}

User: "In the minimal text add background colour yellow"
Response: {"operation": "customText", "params": {"text": "Minimal", "backgroundColor": "yellow", "position": "top", "textStyle": "Minimal"}, "message": "Adding Minimal text with yellow background at the top..."}

User: "Change the bold text to red color"
Response: {"operation": "customText", "params": {"text": "", "fontColor": "red", "position": "top", "preset": "Bold"}, "message": "Changing Bold text to red color..."}

User: "Modify subtitle color to yellow"
Response: {"operation": "customSubtitle", "params": {"subtitleColor": "yellow", "style": "Glow"}, "message": "Updating subtitle color to yellow..."}

User: "Change subtitle style to Bold with white color"
Response: {"operation": "customSubtitle", "params": {"subtitleStyle": "Bold", "subtitleColor": "white"}, "message": "Updating subtitle style to Bold with white color..."}

User: "Make video 2x speed"
Response: {"operation": "adjustSpeed", "params": {"speed": 2.0}, "message": "Speeding up video to 2x..."}

User: "Remove object from left side"
Response: {"operation": "removeObject", "params": {"region": "left", "method": "blur"}, "message": "Blurring/removing object from left side of video..."}

User: "Crop video to remove top 20%"
Response: {"operation": "crop", "params": {"x": 0, "y": 20, "width": 100, "height": 80}, "message": "Cropping video to remove top 20%..."}

User: "Rotate video 90 degrees"
Response: {"operation": "rotate", "params": {"rotation": 90}, "message": "Rotating video 90 degrees..."}

User: "Generate a voiceover saying Welcome to my channel"
Response: {"operation": "generateVoiceover", "params": {"text": "Welcome to my channel", "voice": "alloy"}, "message": "Generating AI voiceover with natural speech..."}

User: "Create custom overlay with sunset graphic"
Response: {"operation": "generateOverlay", "params": {"description": "sunset graphic overlay for video"}, "message": "Generating custom sunset graphic overlay with DALL-E..."}

User: "Generate a video of ocean waves"
Response: {"operation": "generateVideo", "params": {"prompt": "ocean waves crashing on beach", "duration": 10}, "message": "Generating video with Sora 2..."}

User: "I want to add text - please ask me what text content, style, position, size, and other options I want"
Response: {"message": "Great! I'd love to help you add text to your video. Let me ask you a few questions:\n\n1. What text content do you want to display?\n2. Which style would you like? (Minimal, Bold, Cinematic, Retro, Handwritten, Neon Glow, Typewriter, etc.)\n3. Where should it appear? (top, center, bottom)\n4. What size? (small, medium, large)\n5. Do you want a background/highlighter? (yes/no)\n6. Do you want animation? (yes/no)\n\nJust let me know your preferences and I'll add it right away! 🎬"}

User: "generate subtitle to this video" or "add subtitles"
Response: {"message": "Perfect! Let me ask you about your subtitle preferences:\n\n1. Where should subtitles appear? (bottom, top, center)\n2. What text size? (small, medium, large, or specific number like 36)\n3. What text color? (white, yellow, red, blue, green, or any color)\n4. What style? (Glow, Typewriter, Fade, Pop, Minimal, Bold, Cinematic)\n5. Do you want a background color? (yes/no, and what color if yes)\n\nOnce you provide these details, I'll generate the subtitles with your preferred settings! 🎬"}

User: "generate subtitles with yellow color at top position large size"
Response: {"operation": "addCaptions", "params": {"style": "Glow", "subtitleColor": "yellow", "subtitlePosition": "top", "subtitleSize": "large"}, "message": "Generating speech-to-text subtitles with yellow color, large size at top position..."}

User: [After being asked subtitle preference questions, responds with:] "bottom, 14, white, bold"
Response: {"operation": "addCaptions", "params": {"subtitlePosition": "bottom", "subtitleSize": 14, "subtitleColor": "white", "style": "Bold"}, "message": "Generating speech-to-text subtitles with white color, size 14, in Bold style at the bottom..."}

User: [After being asked subtitle preference questions, responds with:] "top, large, yellow, Glow"
Response: {"operation": "addCaptions", "params": {"subtitlePosition": "top", "subtitleSize": "large", "subtitleColor": "yellow", "style": "Glow"}, "message": "Generating speech-to-text subtitles with yellow color, large size in Glow style at the top..."}

User: "I want to add an effect - please ask me which effect, intensity, and where to apply it"
Response: {"message": "Awesome! Let's add an effect to make your video stand out. Please tell me:\n\n1. Which effect do you want? (Blur, Glow, VHS, Motion, Film Grain, Lens Flare, Bokeh, etc.)\n2. How intense should it be? (subtle, medium, strong)\n3. Where should it be applied? (entire video, specific time range)\n\nOnce you provide these details, I'll apply it immediately! ✨"}

INTELLIGENT FEATURES:
- When user asks "suggest features for my video" or "what would look good?", use analyzeVideo operation
- When user asks "make this effect more visible" or "less visible", use adjustIntensity with direction="more" or "less"
- When user asks "zoom in more" or "zoom out", use adjustZoom with direction="in" or "out"
- For intensity adjustments, map natural language: "more visible"=0.8, "very visible"=1.0, "less visible"=0.3, "subtle"=0.2

BRAINSTORMING & SCRIPT WRITING:
- When user asks to "brainstorm ideas", "give me video ideas", "help me come up with concepts", use brainstormIdeas operation
- When user asks to "write a script", "create a script", "generate script", "help me write", use writeScript operation
- For brainstorming, ask about: topic, style (educational, entertaining, promotional, etc.), duration, target audience
- For script writing, ask about: topic, length (short, medium, long), style (formal, casual, conversational), tone (serious, humorous, inspiring), and whether to include visual cues

INTERACTIVE MODE - WHEN USER ASKS FOR OPTIONS:
When user says "I want to add [feature] - please ask me for options" or similar, respond with a friendly message asking questions about their preferences. DO NOT process the operation yet. Instead, return a message that asks:

For TEXT:
- "What text content do you want to display?"
- "Which style? (Minimal, Bold, Cinematic, Retro, Handwritten, Neon Glow, Typewriter, etc.)"
- "Where should it appear? (top, center, bottom)"
- "What size? (small, medium, large)"
- "Do you want a background/highlighter? (yes/no)"
- "Do you want animation? (yes/no)"

For EFFECTS:
- "Which effect do you want? (Blur, Glow, VHS, Motion, Film Grain, Lens Flare, etc.)"
- "How intense should it be? (subtle, medium, strong)"
- "Where should it be applied? (entire video, specific time range)"

For TRANSITIONS:
- "Which transition style? (Fade, Slide, Wipe, Zoom, Cross Dissolve, etc.)"
- "How long should the transition be? (short: 0.5s, medium: 1s, long: 2s)"
- "When should it occur? (beginning, end, between clips)"

For MUSIC:
- "Which music style? (Ambient, Upbeat, Emotional, Action, Chill, Lo-Fi, etc.)"
- "What volume level? (quiet: 0.2, medium: 0.4, loud: 0.6)"
- "Should it fade in/out? (yes/no)"

For COLOR GRADING:
- "Which color style? (Warm, Cool, Vintage, Moody, Cyberpunk, Golden Hour, etc.)"
- "How intense? (subtle, medium, strong)"
- "Any specific mood? (bright, dark, cinematic, vibrant)"

For BRAND KITS:
- "Which brand elements? (Logo Overlay, Watermark, Brand Colors, Fonts, etc.)"
- "What colors should I use?"
- "Which font style?"
- "Where should logo appear? (top-left, top-right, bottom-left, bottom-right, center)"

When user provides answers to your questions, THEN process the operation with their preferences.

CRITICAL FOR SUBTITLES:
- If you previously asked subtitle preference questions (position, size, color, style), and the user now provides those answers (e.g., "bottom, 14, white, bold"), ALWAYS use "addCaptions" or "customSubtitle" operation to GENERATE ACTUAL SUBTITLES from video audio
- DO NOT use "customText" when user is answering subtitle preference questions - they want SUBTITLES (transcribed audio), not static text
- When user provides subtitle preferences after you asked about them, use operation: "addCaptions" or "customSubtitle" with params: { subtitlePosition, subtitleSize, subtitleColor, style/subtitleStyle }
- Example: User answers "bottom, 14, white, bold" after you asked subtitle questions → {"operation": "addCaptions", "params": {"subtitlePosition": "bottom", "subtitleSize": 14, "subtitleColor": "white", "style": "Bold"}}
- Only use "customText" when user explicitly says they want to ADD TEXT (not subtitles/captions)

IMPORTANT GUIDELINES:
- For text operations without specified text, use an empty string for text and let the system suggest meaningful defaults
- For "highlighted text" or "text with background", use "Lower Third", "Animated Quote", or "Story Caption" presets, OR use customText with backgroundColor
- For "trim" or "cut" operations: "trim from X to Y" uses start and end, "cut first X seconds" uses start=X only, "keep only X to Y" trims everything else
- For "remove" or "delete" scenes, use removeClip with reasonable time ranges
- For time-based requests, interpret natural language like "2 to 3 seconds" as startTime: 2, endTime: 3
- Be creative in matching user intent to available presets
- When user asks for options/questions, return ONLY a message (no operation), asking them what they want

ADVANCED FEATURE HANDLING:
- For custom text/subtitle colors: Accept color names (white, red, blue, yellow, green, black, cyan, magenta) or hex codes (#FF0000)
- For custom font sizes: Accept numbers (12-120) or sizes (small=24, medium=36, large=48, xlarge=60)
- For custom positions: Accept top, bottom, center, left, right, top-left, top-right, bottom-left, bottom-right
- Position keywords: "at top", "on top", "at the top", "top of", "at bottom", "on bottom", "at the bottom", "bottom of", "in center", "in the center", "centered", "at left", "on left", "at right", "on right" → map to position parameter
- When user says "add text X at top" or "add text X on top" → ALWAYS use position: "top"
- When user says "add text X at bottom" or "add text X on bottom" → ALWAYS use position: "bottom"
- When user says "add text X in center" or "add text X centered" → ALWAYS use position: "center"
- For subtitle customization: Use customSubtitle operation when user specifies color, size, or style changes
- For object removal: Use removeObject with region (left, right, top, bottom, center) and method (blur, crop, black)
- For speed: Accept "slow"=0.5, "normal"=1.0, "fast"=1.5, "very fast"=2.0, or direct numbers
- For rotation: Accept degrees (90, 180, -90, etc.) or directions (clockwise=90, counter-clockwise=-90)
- For cropping: Accept percentages or pixel values, interpret "remove top X%" as crop with y offset
- When user mentions specific colors/sizes/positions for text or subtitles, use the appropriate operation:
  * If context indicates SUBTITLES (user asked for subtitles, or just answered subtitle preference questions), use addCaptions or customSubtitle
  * If user explicitly wants to ADD TEXT (not subtitles), use customText
- Support natural language: "yellow background" = backgroundColor: "yellow", "large text" = fontSize: 48 or "large"
- When user says "change subtitle color to X" or "make subtitles X color", use customSubtitle operation
- When user says "text with X color and Y size at Z position", use customText operation
- When user says "remove object from X side" or "hide object", use removeObject operation
- When user says "make video faster/slower" or "2x speed", use adjustSpeed operation
- When user says "rotate video X degrees", use rotate operation
- When user says "crop video" or "remove top/bottom/left/right", use crop operation
- Be flexible and interpret user intent - understand variations like "subtitle style", "caption color", "text background", etc.

MODIFYING EXISTING TEXT/SUBTITLES:
- When user says "in the [preset/style] text" or "change the [existing] text" or "modify [text element]", they want to modify existing text
- Extract the text content from context if mentioned (e.g., "minimal text" likely means text with Minimal style)
- When modifying existing text, try to preserve the original text content and position
- If user says "in the minimal text add background" and no text is specified, use the style name as the text content (e.g., "Minimal")
- For text modifications: Include the original text content - if style is "Minimal", use text: "Minimal"; if style is "Bold", use text: "Bold" or empty string
- Position inference: "Minimal" text is often at top, "Lower Third" is at bottom, general text defaults to bottom
- ALWAYS include textStyle or preset in params when user mentions a style name, even if modifying
- Examples: 
  * "in the minimal text add background" → {"operation": "customText", "params": {"text": "Minimal", "textStyle": "Minimal", "backgroundColor": "yellow", "position": "top"}}
  * "change bold text color" → {"operation": "customText", "params": {"preset": "Bold", "fontColor": "red", "position": "top"}}

QUERY UNDERSTANDING - BE FLEXIBLE AND INTELLIGENT:
- Understand variations in language: "make it look vintage" = "Apply Vintage color grade"
- "add some blur" = "Add Blur effect"
- "put text at top" = "Add text at top position"
- "make it faster" = "Set video speed to 1.5x" or "adjustSpeed with speed > 1.0"
- "slow it down" = "Set video speed to 0.5x" or "adjustSpeed with speed < 1.0"
- "remove the part from X to Y" = "removeClip with startTime=X, endTime=Y"
- "cut out X seconds" = "removeClip with appropriate time range"
- "merge these clips" = "merge operation"
- "combine videos" = "merge operation with videoUrls"
- "apply template" = Process multiple operations from template
- "auto enhance" = Apply suggested enhancements based on video analysis
- "suggest features" = "analyzeVideo operation"
- "what should I add?" = "analyzeVideo operation"
- "make it look better" = "analyzeVideo" then apply suggestions
- "improve the video" = "analyzeVideo" then apply auto-enhancements

NATURAL LANGUAGE PATTERNS:
- "I want to..." = User is requesting a feature, interpret the request
- "Can you..." = Same as "I want to", be helpful
- "Please..." = Polite request, process normally
- "Make it..." = Usually color grading or effect
- "Add..." = Usually adding text, effect, music, or transition
- "Apply..." = Usually color grade, effect, or transition
- "Remove..." = Usually removeClip or removeObject
- "Change..." = Usually modifying existing element
- "Set..." = Usually adjusting speed, position, or other settings

When interpreting commands, be specific about which preset is being requested and match it exactly from the available presets above. Always prioritize custom properties when user specifies them explicitly. Be intelligent and flexible - understand user intent even if the exact wording doesn't match examples.`

// Rate limiter - 20 requests per minute per user
const rateLimiter = createRateLimiter(20, 60000)

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimiter(request)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please wait a moment and try again.',
        },
        {
          status: 429,
          headers: rateLimitResult.headers,
        }
      )
    }

    // Authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      throw new ValidationError('Unauthorized - Please sign in to continue')
    }

    // Parse and validate request body
    let body
    try {
      body = await request.json()
    } catch (error) {
      throw new ValidationError('Invalid JSON in request body')
    }

    const { prompt, videoPublicId, videoUrl, mediaType, allMediaUrls, selectedClips } = body

    // Validate required fields
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new ValidationError('Prompt is required and must be a non-empty string')
    }

    if (!videoPublicId || typeof videoPublicId !== 'string') {
      throw new ValidationError('Video public ID is required')
    }

    // Validate public ID format
    const publicIdValidation = validatePublicId(videoPublicId)
    if (!publicIdValidation.valid) {
      throw new ValidationError(`Invalid video public ID: ${publicIdValidation.errors.join(', ')}`)
    }

    // Sanitize input
    const sanitizedPrompt = sanitizeInput(prompt)
    
    // Detect if media is image or video
    const isImage = mediaType === 'image' || videoUrl?.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)
    
    // Use provided videoUrl if available, otherwise fetch from Cloudinary
    const inputVideoUrl = videoUrl

    // Call OpenAI to interpret the command
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    let completion
    try {
      completion = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: sanitizedPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.3,
      })
    } catch (openaiError: any) {
      logError(openaiError, { operation: 'openai_api_call', prompt: sanitizedPrompt.substring(0, 100) })
      
      if (openaiError.code === 'ENOTFOUND' || openaiError.type === 'system') {
        throw new ProcessingError(
          'Unable to connect to AI service. Please check your internet connection and try again.',
          { code: 'NETWORK_ERROR' }
        )
      }
      
      if (openaiError.status === 429) {
        throw new ProcessingError(
          'AI service is temporarily unavailable. Please try again in a moment.',
          { code: 'RATE_LIMIT_ERROR' }
        )
      }
      
      throw new ProcessingError(
        'Failed to process your request. Please try again.',
        { code: 'AI_SERVICE_ERROR', details: openaiError.message }
      )
    }

    // Parse and validate instruction
    let instruction
    try {
      const content = completion.choices[0].message.content || '{}'
      instruction = JSON.parse(content)
    } catch (parseError) {
      logError(parseError, { operation: 'parse_instruction', content: completion.choices[0].message.content })
      throw new ProcessingError('Failed to parse AI response. Please try again.')
    }

    normalizeInstructionParams(instruction)

    console.log('🤖 OpenAI instruction:', JSON.stringify(instruction, null, 2))

    // Validate operation parameters if operation exists
    if (instruction.operation && instruction.params) {
      const validation = validateVideoOperation(instruction.operation, instruction.params)
      if (!validation.valid) {
        throw new ValidationError(`Invalid operation parameters: ${validation.errors.join(', ')}`)
      }
    }

    // Check if this is an interactive question (no operation, just a message)
    if (!instruction.operation && instruction.message) {
      console.log('💬 Interactive question mode - returning message only')
      return NextResponse.json({
        message: instruction.message,
        videoUrl: null, // No video processing yet
      })
    }

    // Fast response for non-processing operations (brainstorming, script writing, analysis)
    const nonProcessingOps = ['brainstormIdeas', 'writeScript', 'analyzeVideo']
    if (nonProcessingOps.includes(instruction.operation)) {
      // These operations don't need video processing, return immediately
    }

    // Special handling for different operations
    let processedUrl: string | undefined
    if (instruction.operation === 'customSubtitle') {
      // customSubtitle means regenerate captions with custom style/color/size/position
      if (isImage) {
        console.log('⚠️ Captions not available for images, using custom text instead')
        const resource = await cloudinary.api.resource(videoPublicId, {
          resource_type: 'image',
        })
        processedUrl = resource.secure_url || ''
        return NextResponse.json({
          message: "Images don't have audio for caption generation. Try using 'Add text' instead!",
          videoUrl: processedUrl,
        })
      }
      console.log('🎬 Regenerating captions with custom subtitle settings...')
      // Extract custom subtitle params and pass to caption generation
      const style = instruction.params.subtitleStyle || instruction.params.style || 'Glow'
      processedUrl = await processCaptionsGeneration(
        videoPublicId, 
        style, 
        inputVideoUrl,
        {
          subtitleColor: instruction.params.subtitleColor,
          subtitleSize: instruction.params.subtitleSize,
          subtitlePosition: instruction.params.subtitlePosition,
          backgroundColor: instruction.params.backgroundColor,
        }
      )
      console.log('✅ Captions regenerated successfully:', processedUrl)
    } else if (instruction.operation === 'addCaptions') {
      if (isImage) {
        // Images don't have audio, so captions don't make sense
        // Fall back to custom text instead
        console.log('⚠️ Captions not available for images, using custom text instead')
        const resource = await cloudinary.api.resource(videoPublicId, {
          resource_type: 'image',
        })
        processedUrl = resource.secure_url || ''
        return NextResponse.json({
          message: "Images don't have audio for caption generation. Try using 'Add text' instead!",
          videoUrl: processedUrl,
        })
      }
      console.log('🎬 Starting caption generation with Whisper...')
      processedUrl = await processCaptionsGeneration(
        videoPublicId, 
        instruction.params.style || 'Glow', 
        inputVideoUrl,
        {
          subtitleColor: instruction.params.subtitleColor,
          subtitleSize: instruction.params.subtitleSize,
          subtitlePosition: instruction.params.subtitlePosition,
          backgroundColor: instruction.params.backgroundColor,
        }
      )
      console.log('✅ Captions generated successfully:', processedUrl)
    } else if (instruction.operation === 'analyzeVideo') {
      console.log(`🧠 Starting ${isImage ? 'image' : 'video'} analysis...`)
      const analysisResult = await analyzeVideoContent(videoPublicId, isImage)
      // Return suggestions without processing video/image
      return NextResponse.json({
        message: analysisResult.message || `${isImage ? 'Image' : 'Video'} analysis complete!`,
        suggestions: analysisResult.suggestions,
        analysis: analysisResult.analysis,
        videoUrl: null, // No video URL for analysis
      })
    } else if (instruction.operation === 'brainstormIdeas') {
      console.log('💡 Starting brainstorming session...')
      const brainstormResult = await brainstormVideoIdeas(instruction.params)
      return NextResponse.json({
        message: brainstormResult.message || 'Here are some video ideas for you!',
        ideas: brainstormResult.ideas,
        concepts: brainstormResult.concepts,
        videoUrl: null, // No video URL for brainstorming
      })
    } else if (instruction.operation === 'writeScript') {
      console.log('📝 Starting script writing...')
      const scriptResult = await writeVideoScript(instruction.params)
      return NextResponse.json({
        message: scriptResult.message || 'Script generated successfully!',
        script: scriptResult.script,
        scenes: scriptResult.scenes,
        videoUrl: null, // No video URL for script writing
      })
    } else if (instruction.operation === 'generateVoiceover') {
      console.log('🗣️ Starting voiceover generation...')
      processedUrl = await generateAIVoiceover(videoPublicId, instruction.params)
      console.log('✅ Voiceover generated successfully:', processedUrl)
    } else if (instruction.operation === 'generateOverlay') {
      console.log('🎨 Starting overlay generation with DALL-E...')
      processedUrl = await generateCustomOverlay(videoPublicId, instruction.params)
      console.log('✅ Overlay generated successfully:', processedUrl)
    } else if (instruction.operation === 'generateVideo') {
      console.log('🎬 Starting video generation with Sora...')
      processedUrl = await generateAIVideo(instruction.params)
      console.log('✅ Video generated successfully:', processedUrl)
    } else if (instruction.operation === 'combineFeatures') {
      console.log('🔗 Starting combined features processing...')
      processedUrl = await processCombinedFeatures(videoPublicId, instruction.params)
      console.log('✅ Combined features applied successfully:', processedUrl)
    } else if (instruction.operation === 'merge') {
      console.log('🔗 Starting merge operation...')
      // Merge supports clips from same video OR different videos
      const { clips, videoUrls } = instruction.params
      
      let clipUrls: string[] = []
      
      // PRIORITY 1: If selectedClips provided (from dashboard with clip info), use those
      if (selectedClips && Array.isArray(selectedClips) && selectedClips.length >= 2) {
        // Extract unique video URLs from selected clips
        clipUrls = Array.from(new Set(selectedClips.map((clip: any) => clip.videoUrl).filter(Boolean)))
        console.log('🔗 Merging selected clips from different videos:', clipUrls.length, 'videos', selectedClips.length, 'clips')
        
        // If clips have start/end times, we need to trim each video first
        // For now, merge entire videos. In future, could trim each clip segment
        if (clipUrls.length < 2) {
          // All clips from same video - use video URL
          clipUrls = [selectedClips[0]?.videoUrl].filter(Boolean)
        }
      }
      // PRIORITY 2: If videoUrls provided (merging different videos), use those
      else if (videoUrls && Array.isArray(videoUrls) && videoUrls.length >= 2) {
        clipUrls = videoUrls.filter((url: string) => url && typeof url === 'string')
        console.log('🔗 Merging different videos:', clipUrls.length, 'videos')
      }
      // PRIORITY 3: If clips provided (merging clips from same video), extract URLs
      else if (clips && Array.isArray(clips) && clips.length >= 2) {
        // Check if clips have placeholder values (from AI generation) or real URLs
        const hasPlaceholders = clips.some((clip: any) => {
          const url = typeof clip === 'string' ? clip : (clip.url || clip.videoUrl)
          return url && (url.includes('current_video_url') || url.includes('clip') && !url.includes('http'))
        })
        
        if (hasPlaceholders && inputVideoUrl) {
          // If placeholders detected, use the actual video URL from request
          // For clips from same video, use the same URL (they're all segments of one video)
          clipUrls = [inputVideoUrl]
          console.log('🔗 Merging clips from same video (using videoUrl from request):', clipUrls.length, 'video URL')
        } else {
          // Extract actual URLs from clips
          clipUrls = clips.map((clip: any) => 
            typeof clip === 'string' ? clip : (clip.url || clip.videoUrl)
          ).filter((url: string) => url && typeof url === 'string' && url.startsWith('http'))
          
          // If no valid URLs found, fallback to inputVideoUrl
          if (clipUrls.length === 0 && inputVideoUrl) {
            clipUrls = [inputVideoUrl]
            console.log('🔗 Merging clips from same video (fallback to videoUrl):', clipUrls.length, 'video URL')
          } else {
            console.log('🔗 Merging clips from same video:', clipUrls.length, 'clips')
          }
        }
      }
      // PRIORITY 4: If allMediaUrls provided (from dashboard), use those
      else if (allMediaUrls && Array.isArray(allMediaUrls) && allMediaUrls.length >= 2) {
        clipUrls = allMediaUrls.filter((url: string) => url && typeof url === 'string')
        console.log('🔗 Merging all media items:', clipUrls.length, 'videos')
      }
      
      // Validate clip URLs - check for placeholder strings
      const validClipUrls = clipUrls.filter((url: string) => 
        url && typeof url === 'string' && url.startsWith('http') && !url.includes('current_video_url')
      )
      
      // If we have clips from same video (1 URL) but multiple clips selected, that's valid
      // Or if we have multiple different video URLs, that's also valid
      if (validClipUrls.length === 0) {
        // Try to use inputVideoUrl as fallback
        if (inputVideoUrl && inputVideoUrl.startsWith('http')) {
          validClipUrls.push(inputVideoUrl)
          console.log('🔗 Using inputVideoUrl as fallback for merge')
        } else {
          return NextResponse.json({
            error: 'Merge requires valid video URLs',
            message: 'Could not find valid video URLs to merge. Please ensure videos are uploaded and try again. If merging clips from the same video, the system will automatically use that video.'
          }, { status: 400 })
        }
      }
      
      // For clips from same video (1 URL), we still need at least 2 clips conceptually
      // But we can merge with just 1 URL if it represents multiple clip segments
      if (validClipUrls.length < 1) {
        return NextResponse.json({
          error: 'Merge requires at least 1 valid video URL',
          message: 'Please provide valid video URLs to merge. Upload videos or select clips from timeline and click "Merge Selected".'
        }, { status: 400 })
      }
      
      // Use valid URLs
      clipUrls = validClipUrls
      
      // Use VideoProcessor to merge clips/videos
      const { VideoProcessor } = await import('@/lib/videoProcessor')
      const processor = new VideoProcessor()
      processedUrl = await processor.mergeClips(clipUrls)
      console.log('✅ Merge completed successfully:', processedUrl)
    } else {
      // Process the video/image editing instruction
      // PRIORITY 1: Try Render API if available (for FFmpeg operations)
      // PRIORITY 2: Try local FFmpeg
      // PRIORITY 3: Try Cloudinary fallback
      
      // Operations that need FFmpeg (but captions handled on Vercel due to Whisper API)
      // CRITICAL: Include filter and colorGrade operations to use Render API for better quality
      // Check if operation needs FFmpeg (Render API)
      // CRITICAL: Time-based effects (with startTime/endTime) MUST use FFmpeg
      const hasTimeRange = instruction.params?.startTime !== undefined || instruction.params?.endTime !== undefined
      const needsFFmpeg = [
        'addMusic', 
        'merge', 
        'trim', 
        'removeClip', 
        'addTransition', 
        'generateVoiceover',
        'filter', // Include filter operations (grayscale, blur, etc.) for Render API
        'colorGrade', // Include color grading for Render API
        'applyEffect', // Include effects for Render API
        'addText', // Include text overlays for Render API
        'customText', // Include custom text for Render API
      ].includes(instruction.operation) || hasTimeRange // Force FFmpeg if time-based
      const isCaptions = instruction.operation === 'addCaptions' || instruction.operation === 'customSubtitle'
      
      // Special handling for addMusic: Fetch music URL from Freesound if preset provided
      if (instruction.operation === 'addMusic' && instruction.params?.preset && !instruction.params?.musicUrl) {
        console.log(`🎵 Fetching music URL for preset: ${instruction.params.preset}`)
        try {
          // Get video duration for better music matching
          let videoDuration: number | undefined
          if (inputVideoUrl) {
            try {
              const resource = await cloudinary.api.resource(videoPublicId, {
                resource_type: isImage ? 'image' : 'video',
              })
              videoDuration = resource.duration || undefined
            } catch (e) {
              // Ignore errors getting duration
            }
          }

          const musicUrl = await getMusicUrlFromPreset(instruction.params.preset, videoDuration)
          if (musicUrl) {
            console.log(`✅ Found music URL for preset "${instruction.params.preset}": ${musicUrl}`)
            instruction.params.musicUrl = musicUrl
          } else {
            console.warn(`⚠️ Could not find music URL for preset "${instruction.params.preset}" - will enhance existing audio`)
          }
        } catch (musicError: any) {
          console.error('❌ Error fetching music from Freesound:', musicError)
          // Continue without music URL - Render API will enhance existing audio
        }
      }

      // Captions can be processed on Render API too (after Whisper transcription on Vercel)
      // The captions array is already generated, so we can send it to Render for FFmpeg processing
      if (needsFFmpeg && RENDER_API_URL) {
        console.log(`🌐 Using Render API for FFmpeg operation: ${instruction.operation}`)
        if (hasTimeRange) {
          console.log(`⏰ Time-based operation detected: startTime=${instruction.params?.startTime}, endTime=${instruction.params?.endTime}`)
        }
        if (instruction.operation === 'addMusic' && instruction.params?.musicUrl) {
          console.log(`🎵 Music URL will be downloaded and mixed: ${instruction.params.musicUrl}`)
        }
        console.log(`🌐 Render API URL: ${RENDER_API_URL}`)
        console.log(`🌐 Input video URL: ${inputVideoUrl}`)
        try {
          const requestBody: any = {
            videoUrl: inputVideoUrl, // CRITICAL: Use current processed video URL for chained editing
            instruction,
            publicId: videoPublicId,
          }
          
          // Add timeout for Render API (5 minutes max)
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000) // 5 minutes
          
          const renderResponse = await fetch(`${RENDER_API_URL}/process`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)
          
          if (!renderResponse.ok) {
            const errorText = await renderResponse.text()
            console.error(`❌ Render API error response: ${errorText}`)
            throw new Error(`Render API error (${renderResponse.status}): ${renderResponse.statusText}`)
          }
          
          const renderData = await renderResponse.json()
          console.log(`📤 Render API response:`, JSON.stringify(renderData, null, 2))
          
          if (renderData.success && renderData.videoUrl) {
            processedUrl = renderData.videoUrl
            console.log(`✅ Processed via Render API: ${processedUrl}`)
          } else {
            throw new Error(renderData.message || renderData.error || 'Render API processing failed')
          }
        } catch (renderError: any) {
          if (renderError.name === 'AbortError') {
            console.error('❌ Render API timeout after 5 minutes')
          } else {
            console.error('❌ Render API failed:', renderError.message || renderError)
          }
          console.log('🔄 Falling back to Cloudinary/local FFmpeg...')
          // Fall through to Cloudinary/local FFmpeg attempt
        }
      }
      
      // If Render API not available or failed, try local FFmpeg
      if (!processedUrl) {
        console.log(`🎬 Starting ${isImage ? 'image' : 'video'} processing with local FFmpeg...`)
        try {
          processedUrl = await processVideoEdit(videoPublicId, instruction, inputVideoUrl, isImage)
          console.log(`✅ ${isImage ? 'Image' : 'Video'} processed successfully with FFmpeg:`, processedUrl)
        } catch (processError: any) {
          console.error('❌ FFmpeg processing failed:', processError)
          console.error('📋 Error details:', {
            message: processError?.message,
            code: processError?.code,
            stack: processError?.stack,
          })
          
          // Check if it's an FFmpeg-specific error
          const errorMessage = processError?.message?.toLowerCase() || ''
          const isFFmpegError = errorMessage.includes('ffmpeg') || 
                                errorMessage.includes('spawn') || 
                                errorMessage.includes('enoent') ||
                                errorMessage.includes('not found') ||
                                processError?.code === 'ENOENT'
          
          // Try Cloudinary fallback for supported operations
          // BUT: Time-based effects CANNOT use Cloudinary fallback (Cloudinary doesn't support time ranges)
          if (isFFmpegError) {
            if (hasTimeRange) {
              console.error('❌ Time-based effects require FFmpeg. Cloudinary fallback not supported.')
              return NextResponse.json(
                { 
                  error: 'Time-based effect processing failed',
                  message: `Time-based effects (with startTime/endTime) require FFmpeg processing, but FFmpeg is unavailable. Please ensure Render API is configured or FFmpeg is available locally.`,
                  videoUrl: null,
                },
                { status: 500 }
              )
            }
            
            console.log('🔄 FFmpeg failed, attempting Cloudinary fallback...')
            try {
              processedUrl = await processWithCloudinaryFallback(videoPublicId, instruction, isImage, inputVideoUrl)
              console.log(`✅ Processed with Cloudinary fallback: ${processedUrl}`)
            } catch (cloudinaryError: any) {
              console.error('❌ Cloudinary fallback also failed:', cloudinaryError)
              // Return error with both failures
              return NextResponse.json(
                { 
                  error: 'Video processing failed',
                  message: `FFmpeg unavailable and Cloudinary fallback failed: ${cloudinaryError?.message || 'Unknown error'}. Please check your Cloudinary configuration.`,
                  videoUrl: null,
                },
                { status: 500 }
              )
            }
          } else {
            // Non-FFmpeg error, return as-is
            return NextResponse.json(
              { 
                error: processError?.message || 'Video processing failed',
                message: `Failed to process video: ${processError?.message || 'Unknown error'}. Please check server logs for details.`,
                videoUrl: null,
              },
              { status: 500 }
            )
          }
        }
      }
    }

    // Ensure processedUrl is defined
    if (!processedUrl) {
      return NextResponse.json(
        { 
          error: 'Video processing failed',
          message: 'Failed to process video. No processed URL was generated. Please check server logs for details.',
          videoUrl: null,
        },
        { status: 500 }
      )
    }

    // Extract public ID from Cloudinary URL for tracking
    const urlParts = processedUrl.split('/')
    const publicIdWithExt = urlParts[urlParts.length - 1]
    const newPublicId = publicIdWithExt.replace(/\.[^.]+$/, '').replace('vedit/processed/', '')

    // Save edit history to database
    await saveEditHistory(session.user.email, videoPublicId, prompt, {
      instruction,
      processedUrl,
      newPublicId,
      timestamp: new Date(),
    })

    const responseData = {
      message: instruction.message || 'Video editing completed successfully!',
      videoUrl: processedUrl,
      publicId: newPublicId,
    }
    
    console.log('📤 VIA API: Sending response to frontend:')
    console.log('📤 Response data:', JSON.stringify(responseData, null, 2))
    console.log('📤 videoUrl:', processedUrl)
    console.log('📤 Original video URL was:', inputVideoUrl)
    console.log('📤 Processed video URL is:', processedUrl)
    console.log('📤 URLs are different:', processedUrl !== inputVideoUrl)
    
    // CRITICAL: Ensure we're returning the processed URL, not the original
    if (!processedUrl || processedUrl === inputVideoUrl) {
      console.error('❌ CRITICAL ERROR: Processed URL is same as input URL or is null!')
      console.error('❌ Input URL:', inputVideoUrl)
      console.error('❌ Processed URL:', processedUrl)
      return NextResponse.json({
        error: 'Video processing failed',
        message: 'Processed video URL is invalid or same as input. Processing may have failed.',
        videoUrl: null,
      }, { status: 500 })
    }
    
    return NextResponse.json(responseData)
  } catch (error) {
    const errorResponse = handleApiError(error, {
      endpoint: '/api/via',
      method: 'POST',
    })
    
    return NextResponse.json(errorResponse.body, {
      status: errorResponse.status,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}

async function processCaptionsGeneration(
  publicId: string,
  style: string,
  videoUrl?: string,
  customParams?: {
    subtitleColor?: string
    subtitleSize?: string | number
    subtitlePosition?: string
    backgroundColor?: string
  }
): Promise<string> {
  try {
    console.log(`🎬 Starting Whisper transcription for: ${publicId}`)
    
    // Use provided videoUrl if available (for chained editing), otherwise fetch from Cloudinary
    let inputVideoUrl: string
    if (videoUrl) {
      inputVideoUrl = videoUrl
      console.log(`📺 Using provided video URL for caption generation: ${inputVideoUrl}`)
    } else {
      // Get video URL from Cloudinary
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: 'video',
      })
      inputVideoUrl = resource.secure_url
      console.log(`📺 Original video URL: ${inputVideoUrl}`)
    }
    
    // Download video for Whisper
    console.log('📥 Downloading video for transcription:', inputVideoUrl)
    let response: Response
    try {
      response = await fetch(inputVideoUrl, {
        headers: {
          'Accept': 'video/*',
        },
      })
      if (!response.ok) {
        throw new Error(`Failed to download video for transcription: ${response.status} ${response.statusText}`)
      }
    } catch (fetchError: any) {
      console.error('❌ Video download error:', fetchError)
      throw new Error(`Failed to download video: ${fetchError.message || 'Network error'}`)
    }
    
    // Check content type
    const contentType = response.headers.get('content-type') || ''
    console.log(`📊 Video content type: ${contentType}`)
    
    // Check if it's actually a video
    if (!contentType.includes('video') && !contentType.includes('application/octet-stream')) {
      console.warn(`⚠️ Unexpected content type: ${contentType}, proceeding anyway...`)
    }
    
    // Transcribe audio using Whisper
    console.log('🎤 Transcribing audio with Whisper...')
    let arrayBuffer: ArrayBuffer
    try {
      arrayBuffer = await response.arrayBuffer()
    } catch (bufferError: any) {
      console.error('❌ Failed to read video buffer:', bufferError)
      throw new Error(`Failed to read video data: ${bufferError.message || 'Unknown error'}`)
    }
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Downloaded video is empty (0 bytes)')
    }
    
    const videoSizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2)
    console.log(`📊 Downloaded video size: ${videoSizeMB}MB`)
    
    // Check file size (Whisper has 25MB limit)
    if (arrayBuffer.byteLength > 25 * 1024 * 1024) {
      console.warn(`⚠️ Video is ${videoSizeMB}MB, Whisper API limit is 25MB. May need to trim or compress.`)
    }
    
    // Save to temp file for Whisper API
    const tempDir = getTempDir()
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    const tempFilePath = path.join(tempDir, `whisper_${Date.now()}.mp4`)
    fs.writeFileSync(tempFilePath, Buffer.from(arrayBuffer))
    
    // Validate file was written
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Failed to write temp file for Whisper transcription')
    }
    
    const fileStats = fs.statSync(tempFilePath)
    if (fileStats.size === 0) {
      throw new Error('Temp file for Whisper is empty (0 bytes)')
    }
    
    console.log(`📁 Temp file created: ${tempFilePath} (${(fileStats.size / 1024 / 1024).toFixed(2)}MB)`)
    
    // Use Whisper with timestamped output for better accuracy
    let transcription: any
    try {
      // Read file as buffer first to ensure it's valid
      const fileBuffer = fs.readFileSync(tempFilePath)
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('Temp file is empty or invalid')
      }
      
      // Create a readable stream for OpenAI API (Node.js compatible)
      const fileStream = fs.createReadStream(tempFilePath)
      
      // Try verbose_json first for timestamps (best option)
      try {
        console.log('🎤 Attempting Whisper API with verbose_json format...')
        transcription = await openai.audio.transcriptions.create({
          file: fileStream as any,
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        })
        console.log('✅ Whisper API call successful with verbose_json format')
        console.log('📊 Response structure:', {
          hasText: !!transcription.text,
          hasSegments: !!transcription.segments,
          segmentCount: transcription.segments?.length || 0,
        })
      } catch (verboseError: any) {
        console.warn('⚠️ verbose_json with granularities failed:', verboseError.message)
        console.warn('⚠️ Error code:', verboseError.code, 'Status:', verboseError.status)
        
        // Fallback 1: Try verbose_json without timestamp_granularities
        try {
          console.log('🔄 Trying verbose_json without timestamp_granularities...')
          const fileStream2 = fs.createReadStream(tempFilePath)
          transcription = await openai.audio.transcriptions.create({
            file: fileStream2 as any,
            model: 'whisper-1',
            response_format: 'verbose_json',
          })
          console.log('✅ Whisper API call successful with verbose_json (no granularities)')
        } catch (verboseError2: any) {
          console.warn('⚠️ verbose_json without granularities also failed:', verboseError2.message)
          
          // Fallback 2: Try json format
          try {
            console.log('🔄 Trying json format...')
            const fileStream3 = fs.createReadStream(tempFilePath)
            transcription = await openai.audio.transcriptions.create({
              file: fileStream3 as any,
              model: 'whisper-1',
              response_format: 'json',
            })
            console.log('✅ Whisper API call successful with json format')
            // json format might not have segments
            if (!transcription.segments && transcription.text) {
              transcription.segments = []
            }
          } catch (jsonError: any) {
            console.warn('⚠️ json format also failed:', jsonError.message)
            
            // Fallback 3: Use text format (last resort - no timestamps)
            console.log('🔄 Trying text format (last resort, no timestamps)...');
            const fileStream4 = fs.createReadStream(tempFilePath);
            const textTranscription = await openai.audio.transcriptions.create({
              file: fileStream4 as any,
              model: 'whisper-1',
              response_format: 'text',
            });
            // Convert text response to expected format
            transcription = {
              text: typeof textTranscription === 'string' ? textTranscription : String(textTranscription),
              segments: [], // No segments in text format
            };
            console.log('✅ Whisper API call successful with text format (fallback)');
          }
        }
      } catch (whisperError: any) {
        // Cleanup temp file before throwing
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath)
          }
        } catch (cleanupError) {
          console.error('Failed to cleanup temp file:', cleanupError)
        }
        
        console.error('❌ Whisper API error:', whisperError)
        console.error('❌ Error details:', {
          message: whisperError.message,
          status: whisperError.status,
          code: whisperError.code,
          type: whisperError.type,
          response: whisperError.response,
        })
        throw new Error(`Whisper transcription failed: ${whisperError.message || 'Unknown error'}. Please check OpenAI API key and video file.`)
      }
      
      // Cleanup temp file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath)
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError)
      }
      
      // Validate transcription response
      if (!transcription) {
        throw new Error('Whisper API returned empty response')
      }
      
      if (!transcription.text && (!transcription.segments || transcription.segments.length === 0)) {
        throw new Error('Whisper API returned no transcription text or segments')
      }
      
      console.log('📝 Transcription complete:', transcription.text?.substring(0, 100) + '...')
      console.log(`📊 Transcription segments: ${transcription.segments?.length || 0}`)
      console.log(`📊 Transcription full response keys:`, Object.keys(transcription))
      
      // Generate timed captions from transcript with timestamps
      let captions: any[] = []
      
      // If we have segments with timestamps, use them directly
      if (transcription.segments && Array.isArray(transcription.segments) && transcription.segments.length > 0) {
        console.log('⏰ Using Whisper segment timestamps for captions...')
        captions = transcription.segments
          .filter((segment: any) => segment && segment.text && segment.text.trim().length > 0)
          .map((segment: any) => ({
            text: (segment.text || '').trim(),
            start: typeof segment.start === 'number' ? segment.start : 0,
            end: typeof segment.end === 'number' ? segment.end : (typeof segment.start === 'number' ? segment.start + 3 : 3),
          }))
        console.log(`✅ Generated ${captions.length} caption segments from Whisper timestamps`)
      } else if (transcription.text && transcription.text.trim().length > 0) {
        // Fallback: Generate timed captions using GPT if no segments but we have text
        console.log('⏰ Generating timed captions with GPT (no Whisper segments, but have text)...')
        try {
          const captionCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'You are a caption generator. Return JSON with "captions" array: [{"text": "...", "start": 0, "end": 3}]. Each caption should be 2-5 seconds long. Estimate timing based on text length (average 3 words per second).'
              },
              {
                role: 'user',
                content: `Generate timed captions from this transcript: "${transcription.text}". Split into logical phrases of 2-5 seconds each. IMPORTANT: Return ONLY the caption text, NO markdown formatting (no **, no *, no #). Just plain text for each caption.`
              },
            ],
            response_format: { type: 'json_object' },
          })

          const captionData = JSON.parse(captionCompletion.choices[0].message.content || '{}')
          captions = Array.isArray(captionData.captions) ? captionData.captions : []
        } catch (gptError: any) {
          console.error('⚠️ GPT caption generation failed:', gptError)
          // Continue to fallback
        }
        
        // If GPT didn't generate captions, create simple ones from transcript
        if (captions.length === 0 && transcription.text) {
          console.log('⚠️ GPT didn\'t generate captions, creating simple timed captions...')
          const words = transcription.text.split(/\s+/).filter((w: string) => w.trim().length > 0)
          if (words.length > 0) {
            const wordsPerSecond = 3 // Average speaking rate
            let currentTime = 0
            
            // Split into chunks of ~9 words (3 seconds each)
            for (let i = 0; i < words.length; i += 9) {
              const chunk = words.slice(i, i + 9).join(' ')
              const duration = chunk.split(/\s+/).length / wordsPerSecond
              captions.push({
                text: chunk,
                start: currentTime,
                end: currentTime + Math.max(duration, 2), // Minimum 2 seconds
              })
              currentTime += duration
            }
          }
        }
        
        console.log(`✅ Generated ${captions.length} caption segments`)
      } else {
        throw new Error('No transcription text or segments available from Whisper API')
      }
      
      // Validate captions
      if (!captions || captions.length === 0) {
        throw new Error('Failed to generate captions from audio transcription')
      }
      
      // Clean and validate each caption
      captions = captions
        .filter((cap: any) => cap.text && cap.text.trim().length > 0)
        .map((cap: any) => ({
          text: (cap.text || '').replace(/\*\*/g, '').replace(/\*/g, '').trim(),
          start: Math.max(0, cap.start || 0),
          end: Math.max(cap.start || 0, cap.end || (cap.start || 0) + 3),
        }))
      
      if (captions.length === 0) {
        throw new Error('No valid captions generated after cleaning')
      }
      
      console.log(`✅ Final caption count: ${captions.length}`)
      console.log(`📊 First caption: "${captions[0].text}" (${captions[0].start}s - ${captions[0].end}s)`)
      console.log(`📊 Last caption: "${captions[captions.length - 1].text}" (${captions[captions.length - 1].start}s - ${captions[captions.length - 1].end}s)`)
      
      // Process video to add captions
      const instruction = {
        operation: 'addCaptions',
        params: {
          captions,
          style,
          // Include custom subtitle parameters if provided
          ...(customParams || {}),
        },
      }
      
      console.log('🎬 Processing video with captions...')
      console.log('📊 Caption count:', captions.length)
      console.log('📊 Style:', style)
      console.log('📊 Custom params:', customParams)
      
      // Check if we should use Render API for caption processing
      // NOTE: Captions ALWAYS need FFmpeg, so Render API is required on Vercel
      const isCaptions = instruction.operation === 'addCaptions' || instruction.operation === 'customSubtitle'
      const needsFFmpeg = ['addCaptions', 'customSubtitle', 'addText', 'applyEffect', 'colorGrade', 'addTransition', 'addMusic', 'filter', 'trim', 'removeClip', 'merge', 'adjustSpeed', 'rotate', 'crop', 'removeObject', 'customText'].includes(instruction.operation)
      
      // For captions, Render API is strongly recommended (required on Vercel)
      if (needsFFmpeg && RENDER_API_URL) {
        console.log(`🌐 Using Render API for caption processing: ${RENDER_API_URL}`)
        try {
          const requestBody: any = {
            videoUrl: inputVideoUrl,
            instruction,
            publicId: publicId,
          }
          
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000) // 5 minutes
          
          const renderResponse = await fetch(`${RENDER_API_URL}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)
          
          if (!renderResponse.ok) {
            const errorText = await renderResponse.text()
            console.error(`❌ Render API error response: ${errorText}`)
            throw new Error(`Render API error (${renderResponse.status}): ${renderResponse.statusText}`)
          }
          
          const renderData = await renderResponse.json()
          console.log(`📤 Render API response:`, JSON.stringify(renderData, null, 2))
          
          if (renderData.success && renderData.videoUrl) {
            console.log(`✅ Processed captions via Render API: ${renderData.videoUrl}`)
            return renderData.videoUrl
          } else {
            throw new Error(renderData.message || renderData.error || 'Render API processing failed')
          }
        } catch (renderError: any) {
          if (renderError.name === 'AbortError') {
            console.error('❌ Render API timeout after 5 minutes')
            throw new Error('Render API timeout: Caption processing took too long (5+ minutes). Please try with a shorter video or check Render API status.')
          } else {
            console.error('❌ Render API error:', renderError)
            console.error('❌ Render API error details:', {
              message: renderError.message,
              status: renderError.status,
              code: renderError.code,
              stack: renderError.stack,
            })
          }
          
          // On Vercel, local FFmpeg won't work, so don't fall back
          // Only fall back to local processing if we're not on Vercel (check for Vercel environment)
          const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV
          if (isVercel) {
            throw new Error(
              `Caption processing failed: Render API error - ${renderError.message || 'Unknown error'}. ` +
              `On Vercel, Render API is required for caption processing. Please check RENDER_API_URL configuration and Render API status.`
            )
          }
          
          console.log('🔄 Falling back to local videoProcessor for captions (not on Vercel)...')
          // Fall through to local processing only if not on Vercel
        }
      } else {
        // Render API not configured
        const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV
        if (isVercel) {
          throw new Error(
            `Caption processing failed: RENDER_API_URL is not configured. ` +
            `On Vercel, Render API is required for caption processing. Please set RENDER_API_URL environment variable.`
          )
        }
      }
      
      // Use local videoProcessor (only if not on Vercel)
      console.log('🔄 Using local videoProcessor for caption processing...')
      try {
        const processedUrl = await videoProcessor.process(inputVideoUrl, instruction)
        console.log(`✅ Captions processed locally: ${processedUrl}`)
        return processedUrl
      } catch (localError: any) {
        console.error('❌ Local videoProcessor failed:', localError)
        console.error('❌ Local error details:', {
          message: localError.message,
          stack: localError.stack,
        })
        throw new Error(
          `Caption processing failed: Local FFmpeg processing error - ${localError.message || 'Unknown error'}. ` +
          `Please check FFmpeg installation or configure RENDER_API_URL for remote processing.`
        )
      }
    } catch (error) {
      console.error('❌ Caption generation error:', error)
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      // DO NOT return original video - throw error instead
      // This ensures the frontend knows processing failed and doesn't show original as processed
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Caption generation failed: ${errorMessage}. ` +
        `Please check server logs for more details.`
      )
    }
  } catch (error) {
    console.error('❌ Caption generation error:', error)
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    // DO NOT return original video - throw error instead
    // This ensures the frontend knows processing failed and doesn't show original as processed
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Caption generation failed: ${errorMessage}. ` +
      `Please check server logs for more details.`
    )
  }
}

/**
 * Process video/image edits using Cloudinary transformations as fallback
 * Works when FFmpeg is unavailable (e.g., on Vercel)
 * 
 * @param publicId - Original public ID (fallback if videoUrl not provided)
 * @param instruction - Processing instruction
 * @param isImage - Whether processing image or video
 * @param videoUrl - Current processed video URL (for chained editing)
 */
async function processWithCloudinaryFallback(
  publicId: string,
  instruction: any,
  isImage: boolean = false,
  videoUrl?: string
): Promise<string> {
  const resourceType = isImage ? 'image' : 'video'
  const operation = instruction.operation
  const params = instruction.params || {}
  
  // CRITICAL: Extract publicId from videoUrl if it's a Cloudinary URL with transformations
  // This allows chained editing (applying effects to already-processed videos)
  // BUT: Only use extracted publicId if the video actually exists in Cloudinary
  // If the processed video doesn't exist (404), fall back to original publicId
  let effectivePublicId = publicId
  if (videoUrl && videoUrl.includes('cloudinary.com')) {
    // Extract publicId from Cloudinary URL
    // Format: https://res.cloudinary.com/cloud_name/resource_type/upload/transformations/publicId
    const urlMatch = videoUrl.match(/\/upload\/([^\/]+\/)*([^\/\?]+)/)
    if (urlMatch && urlMatch[2]) {
      // Extract the publicId part (remove file extension)
      const publicIdWithExt = urlMatch[2]
      const extractedPublicId = publicIdWithExt.replace(/\.[^.]+$/, '').replace(/^vedit\//, '')
      
      // Check if this is a processed video that might not exist
      // If it ends with '_processed' or similar, verify it exists before using it
      // For now, always use original publicId for Cloudinary transformations to avoid 404s
      // Processed videos should be uploaded to Cloudinary with a new publicId, not used as transformation base
      if (extractedPublicId.includes('_processed') || extractedPublicId !== publicId) {
        console.log(`☁️ Detected processed video publicId: ${extractedPublicId}`)
        console.log(`☁️ Using original publicId for Cloudinary transformation: ${publicId}`)
        console.log(`☁️ Note: Processed videos should use Render API, not Cloudinary transformations`)
        effectivePublicId = publicId // Use original to avoid 404
      } else {
        effectivePublicId = extractedPublicId
        console.log(`☁️ Extracted publicId from processed video URL: ${effectivePublicId}`)
      }
    } else {
      // If we can't extract, use the provided publicId
      console.log(`☁️ Could not extract publicId from URL, using provided: ${publicId}`)
    }
  }
  
  console.log(`☁️ Processing with Cloudinary fallback: ${operation}`)
  console.log(`☁️ Public ID: ${effectivePublicId}`)
  console.log(`☁️ Video URL provided: ${videoUrl ? 'Yes' : 'No'}`)
  console.log(`☁️ Params:`, JSON.stringify(params))
  
  // Map operations to Cloudinary transformations
  // Use effectivePublicId (extracted from processed URL if available)
  switch (operation) {
    case 'colorGrade':
      const colorGradeUrl = CloudinaryTransformProcessor.applyColorGrade(
        effectivePublicId,
        params.preset || 'cinematic',
        resourceType
      )
      console.log(`☁️ Color grade URL generated: ${colorGradeUrl}`)
      // Color grade URL already has cache-busting from CloudinaryTransformProcessor
      return colorGradeUrl
    
    case 'applyEffect':
      return CloudinaryTransformProcessor.applyEffect(
        effectivePublicId,
        params.preset || 'glow',
        resourceType
      )
    
    case 'addText':
    case 'customText':
      return CloudinaryTransformProcessor.addTextOverlay(effectivePublicId, {
        text: params.text || 'Text',
        position: params.position || 'bottom',
        fontSize: params.fontSize || params.fontSize || 48,
        fontColor: params.fontColor || 'white',
        backgroundColor: params.backgroundColor,
        style: params.preset || params.style || 'bold',
      })
    
    case 'crop':
      return CloudinaryTransformProcessor.crop(effectivePublicId, {
        x: params.x || 0,
        y: params.y || 0,
        width: params.width || 100,
        height: params.height || 100,
      }, resourceType)
    
    case 'rotate':
      return CloudinaryTransformProcessor.rotate(
        effectivePublicId,
        params.rotation || params.angle || 0,
        resourceType
      )
    
    case 'adjustSpeed':
      // Cloudinary supports speed adjustment via video_transformation
      // Speed multiplier: 0.5 = slow, 1.0 = normal, 2.0 = fast
      const speed = params.speed || 1.0
      return cloudinary.url(effectivePublicId, {
        resource_type: resourceType,
        secure: true, // Force HTTPS to avoid mixed content issues
        transformation: [
          {
            video_codec: { codec: 'auto' },
            // Note: Cloudinary doesn't directly support speed for videos
            // This is a limitation - we return the URL with a note
          },
        ],
      })
    
    case 'filter':
      // Map filter types to Cloudinary effects
      const filterType = params.type?.toLowerCase()
      let filterUrl: string
      
      if (filterType === 'blur') {
        filterUrl = cloudinary.url(effectivePublicId, {
          resource_type: resourceType,
          secure: true,
          transformation: [{ effect: 'blur:300' }],
        })
      } else if (filterType === 'sharpen') {
        filterUrl = cloudinary.url(effectivePublicId, {
          resource_type: resourceType,
          secure: true,
          transformation: [{ effect: 'sharpen:100' }],
        })
      } else if (filterType === 'grayscale' || filterType === 'grayscale effect' || filterType === 'black & white') {
        // CRITICAL: If videoUrl is provided and has transformations, we need to chain them
        // Extract existing transformations from videoUrl and add grayscale
        if (videoUrl && videoUrl.includes('cloudinary.com') && videoUrl.includes('/upload/')) {
          // Extract the transformation part from the URL
          // Format: /upload/transformation1/transformation2/publicId
          const uploadIndex = videoUrl.indexOf('/upload/')
          if (uploadIndex !== -1) {
            const afterUpload = videoUrl.substring(uploadIndex + '/upload/'.length)
            // Find where the publicId starts (after transformations)
            // Transformations are separated by slashes, publicId is the last part before query params
            const parts = afterUpload.split('/')
            const publicIdPart = parts[parts.length - 1].split('?')[0]
            
            // Reconstruct URL with existing transformations + grayscale
            const beforePublicId = videoUrl.substring(0, videoUrl.lastIndexOf('/' + publicIdPart))
            const baseUrl = beforePublicId + '/e_grayscale/' + publicIdPart.split('.')[0]
            
            // Add format and cache-busting
            filterUrl = `${baseUrl}?f_auto,q_auto&_t=${Date.now()}`
            console.log(`☁️ Chained grayscale transformation on processed video: ${filterUrl.substring(0, 100)}...`)
          } else {
            // Fallback to standard transformation
            filterUrl = cloudinary.url(effectivePublicId, {
              resource_type: resourceType,
              secure: true,
              transformation: [{ effect: 'grayscale' }],
              ...(resourceType === 'video' ? { 
                fetch_format: 'auto',
                quality: 'auto',
                format: 'mp4'
              } : {}),
            })
            const cleanUrl = filterUrl.split('?')[0]
            const timestamp = Date.now()
            filterUrl = `${cleanUrl}?_t=${timestamp}`
          }
        } else {
          // No existing transformations, apply grayscale directly
          filterUrl = cloudinary.url(effectivePublicId, {
            resource_type: resourceType,
            secure: true,
            transformation: [{ effect: 'grayscale' }],
            // Ensure proper video format for streaming
            ...(resourceType === 'video' ? { 
              fetch_format: 'auto',
              quality: 'auto',
              // Force MP4 format for better compatibility
              format: 'mp4'
            } : {}),
          })
          // Remove existing query params and add fresh cache-busting
          const cleanUrl = filterUrl.split('?')[0]
          const timestamp = Date.now()
          filterUrl = `${cleanUrl}?_t=${timestamp}`
        }
        console.log(`☁️ Generated grayscale URL with cache-bust: ${filterUrl.substring(0, 100)}...`)
      } else if (filterType === 'saturation') {
        const satValue = params.value || 1.0
        const saturation = Math.round((satValue - 1) * 100)
        filterUrl = cloudinary.url(effectivePublicId, {
          resource_type: resourceType,
          secure: true,
          transformation: [{ saturation }],
        })
      } else {
        // Unknown filter type - throw error instead of returning original
        console.error(`❌ Unknown filter type: ${params.type}`)
        throw new Error(`Filter type "${params.type}" is not supported. Supported types: saturation, noise reduction.`)
      }
      
      console.log(`☁️ Filter URL generated: ${filterUrl}`)
      // Add cache-busting for video to force browser refresh
      // Remove existing query params to avoid duplicates
      if (resourceType === 'video') {
        const cleanUrl = filterUrl.split('?')[0]
        const timestamp = Date.now()
        filterUrl = `${cleanUrl}?_t=${timestamp}`
        console.log(`☁️ Final filter URL with cache-bust: ${filterUrl}`)
      }
      return filterUrl
    
    case 'addTransition':
    case 'addMusic':
    case 'merge':
    case 'trim':
    case 'removeClip':
    case 'addCaptions':
    case 'customSubtitle':
    case 'generateVoiceover':
    case 'generateOverlay':
    case 'generateVideo':
    case 'removeObject':
      // These operations require FFmpeg and cannot be done with Cloudinary alone
      // DO NOT return original - throw error instead so user knows it failed
      console.error(`❌ Operation ${operation} requires FFmpeg and cannot use Cloudinary fallback`)
      throw new Error(`Operation "${operation}" requires FFmpeg processing. Please ensure Render API is configured or FFmpeg is available.`)
    
    default:
      // Unknown operation - throw error instead of returning original
      console.error(`❌ Unknown operation for Cloudinary fallback: ${operation}`)
      throw new Error(`Operation "${operation}" is not supported by Cloudinary fallback. Please use FFmpeg processing or a supported operation.`)
  }
}

async function processVideoEdit(
  publicId: string,
  instruction: any,
  mediaUrl?: string,
  isImage: boolean = false
): Promise<string> {
  try {
    let inputUrl: string
    const resourceType = isImage ? 'image' : 'video'
    
    // Use provided mediaUrl if available (for accumulated edits), otherwise fetch from Cloudinary
    if (mediaUrl) {
      inputUrl = mediaUrl
      console.log(`📺 Using provided ${resourceType} URL for chained editing: ${inputUrl}`)
    } else {
      console.log(`🔍 Fetching original ${resourceType}: ${publicId}`)
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
      })
      inputUrl = resource.secure_url
      console.log(`📺 Original ${resourceType} URL: ${inputUrl}`)
    }

    console.log(`🎬 Processing ${resourceType} with instruction: ${instruction.operation}`)
    // Process media with FFmpeg
    const processedUrl = await videoProcessor.process(inputUrl, instruction, isImage)
    console.log(`✅ Processed ${resourceType} URL: ${processedUrl}`)

    return processedUrl
  } catch (error: any) {
    console.error(`❌ ${isImage ? 'Image' : 'Video'} processing error:`, error)
    console.error('📋 Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      name: error?.name,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
    })
    
    // Check if it's an FFmpeg-related error (common on Vercel)
    const errorMessage = error?.message?.toLowerCase() || ''
    const isFFmpegError = errorMessage.includes('ffmpeg') || 
                          errorMessage.includes('spawn') || 
                          errorMessage.includes('enoent') ||
                          error?.code === 'ENOENT'
    
    if (isFFmpegError) {
      console.error('⚠️ FFmpeg error detected:', error?.message)
      console.error('💡 Check FFmpeg installation and path configuration')
    }
    
    // Throw error with detailed information for debugging
    throw new Error(
      `Video processing failed: ${error?.message || 'Unknown error'}. ` +
      `Error code: ${error?.code || 'N/A'}. ` +
      `Please check server logs for more details.`
    )
  }
}

async function analyzeVideoContent(publicId: string, isImage: boolean = false): Promise<any> {
  try {
    const mediaType = isImage ? 'image' : 'video'
    console.log(`🧠 Analyzing ${mediaType}: ${publicId}`)
    
    // Get media URL from Cloudinary
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: mediaType,
    })
    const mediaUrl = resource.secure_url
    console.log(`📺 ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} URL: ${mediaUrl}`)
    
    // Get media metadata for analysis
    const duration = isImage ? 0 : (resource.duration || 0)
    const format = resource.format || (isImage ? 'jpg' : 'mp4')
    const width = resource.width || 1920
    const height = resource.height || 1080
    const size = resource.bytes || 0
    
    console.log(`📊 ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} metadata: ${isImage ? 'N/A' : duration + 's'}, ${width}x${height}, ${(size/1024/1024).toFixed(2)}MB`)
    
    // Provide AI-powered suggestions based on video metadata
    const suggestions = [
      { 
        category: 'Text Overlays', 
        recommendation: `${width >= 1280 ? 'Consider' : 'Use'} Bold or Cinematic title style for professional look`,
        reason: `${width >= 1920 ? 'High definition' : 'Standard definition'} video detected`
      },
      { 
        category: 'Color Grading', 
        recommendation: 'Apply Cinematic, Golden Hour, or Vintage color grading to enhance mood',
        reason: 'Universal enhancement for any video content'
      },
      { 
        category: 'Visual Effects', 
        recommendation: duration > 30 ? 'Add Film Grain or Dreamy Glow for cinematic feel' : 'Apply Subtle Blur or Soft Focus for polished look',
        reason: duration > 30 ? 'Longer content benefits from atmospheric effects' : 'Short clips work well with subtle enhancements'
      },
      { 
        category: 'Transitions', 
        recommendation: duration > 10 ? 'Add Fade, Cross Dissolve, or Zoom transitions' : 'Skip transitions for short clips',
        reason: duration > 10 ? 'Multiple transitions work well' : 'Short content flows naturally without transitions'
      },
      { 
        category: 'Captions', 
        recommendation: 'Generate speech-to-text subtitles with Glow or Minimal style',
        reason: 'Improves accessibility and engagement'
      },
    ]
    
    return {
      message: `Here are personalized suggestions to enhance your ${isImage ? 'image' : 'video'}:`,
      analysis: `Analyzed your ${width}x${height} ${isImage ? 'image' : `video (${duration.toFixed(1)}s)`}. Based on the content characteristics, these features would work best:`,
      suggestions,
    }
  } catch (error) {
    console.error(`❌ ${isImage ? 'Image' : 'Video'} analysis error:`, error)
    // Return generic suggestions as fallback
    return {
      message: `Here are some suggestions to enhance your ${isImage ? 'image' : 'video'}:`,
      analysis: `Automated ${isImage ? 'image' : 'video'} content analysis`,
      suggestions: [
        { category: 'Text', recommendation: 'Add Bold title or Lower Third for key moments' },
        { category: 'Color', recommendation: 'Apply Cinematic or Golden Hour color grading' },
        { category: 'Effect', recommendation: 'Consider Dreamy Glow or Film Grain effect' },
        { category: isImage ? 'Enhancement' : 'Transition', recommendation: isImage ? 'Apply subtle effects for polished look' : 'Add Fade or Cross Dissolve transitions' },
      ],
    }
  }
}

async function brainstormVideoIdeas(params: any): Promise<any> {
  try {
    const { topic, style, duration, targetAudience } = params
    
    const prompt = `Generate 5 creative video ideas based on these requirements:
Topic: ${topic || 'general video content'}
Style: ${style || 'entertaining'}
Duration: ${duration || 'short'}
Target Audience: ${targetAudience || 'general audience'}

For each idea, provide:
1. Title
2. Brief concept description
3. Key visual elements
4. Suggested style/aesthetic
5. Hook/opening idea

Make the ideas creative, engaging, and actionable.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a creative video content strategist. Generate engaging, actionable video ideas that capture attention and provide value.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 1500,
    })

    const ideasText = completion.choices[0].message.content || ''
    const ideas = parseIdeasFromText(ideasText)
    
    return {
      message: `Here are ${ideas.length} creative video ideas for "${topic || 'your content'}":`,
      ideas,
      concepts: ideas.map((idea: any) => idea.concept),
    }
  } catch (error) {
    console.error('❌ Brainstorming error:', error)
    const fallbackStyle = params?.style || 'educational'
    return {
      message: 'Here are some video ideas for you:',
      ideas: [
        {
          title: 'Top 5 Tips',
          concept: 'Create a listicle video with your top tips or insights',
          visuals: 'Use text overlays, transitions between tips',
          style: fallbackStyle,
          hook: 'Start with a question that hooks viewers'
        },
        {
          title: 'Behind the Scenes',
          concept: 'Show the process or story behind something',
          visuals: 'Mix of footage, text overlays, music',
          style: fallbackStyle === 'educational' ? 'documentary' : fallbackStyle,
          hook: 'Reveal something unexpected'
        },
      ],
      concepts: ['Top 5 Tips', 'Behind the Scenes'],
    }
  }
}

async function writeVideoScript(params: any): Promise<any> {
  try {
    const { topic, length, style, tone, includeVisuals } = params
    
    const prompt = `Write a complete video script based on these requirements:
Topic: ${topic || 'general video content'}
Length: ${length || 'short'} (${length === 'short' ? '30-60 seconds' : length === 'medium' ? '2-5 minutes' : '5-10 minutes'})
Style: ${style || 'conversational'}
Tone: ${tone || 'engaging'}
Include Visual Cues: ${includeVisuals ? 'yes' : 'no'}

The script should include:
1. Opening hook (attention-grabbing first 5-10 seconds)
2. Main content (organized, engaging)
3. Call-to-action or closing
${includeVisuals ? '4. Visual cues for each section (text overlays, transitions, effects)' : ''}

Format the script with clear sections, dialogue/narration, and timing suggestions.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a professional video scriptwriter. Write engaging, well-structured scripts that capture attention and deliver value.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 1000, // Reduced for faster responses
    })

    const scriptText = completion.choices[0].message.content || ''
    const scenes = parseScriptIntoScenes(scriptText, includeVisuals)
    
    return {
      message: `Script generated for "${topic || 'your video'}":`,
      script: scriptText,
      scenes,
    }
  } catch (error) {
    console.error('❌ Script writing error:', error)
    const fallbackLength = params?.length || 'short'
    const fallbackStyle = params?.style || 'conversational'
    const fallbackTone = params?.tone || 'engaging'
    const fallbackIncludeVisuals = params?.includeVisuals || false
    
    return {
      message: 'Here\'s a script template for your video:',
      script: `[OPENING HOOK - 5-10 seconds]
Grab attention with a question, statement, or visual hook.

[MAIN CONTENT - ${fallbackLength === 'short' ? '30-45 seconds' : fallbackLength === 'medium' ? '2-4 minutes' : '5-8 minutes'}]
Deliver your main message in ${fallbackStyle} style with ${fallbackTone} tone.
${fallbackIncludeVisuals ? '\n[VISUAL: Add text overlays, transitions, effects]' : ''}

[CLOSING - 5-10 seconds]
Call-to-action or memorable closing statement.`,
      scenes: [
        { title: 'Opening', content: 'Hook your audience', visuals: fallbackIncludeVisuals ? 'Text overlay, attention-grabbing effect' : undefined },
        { title: 'Main Content', content: 'Deliver your message', visuals: fallbackIncludeVisuals ? 'Transitions, text overlays' : undefined },
        { title: 'Closing', content: 'Call-to-action', visuals: fallbackIncludeVisuals ? 'Final text overlay' : undefined },
      ],
    }
  }
}

function parseIdeasFromText(text: string): any[] {
  // Parse AI response into structured ideas
  const ideas: any[] = []
  const lines = text.split('\n')
  let currentIdea: any = {}
  
  for (const line of lines) {
    if (line.match(/^\d+\./)) {
      if (currentIdea.title) ideas.push(currentIdea)
      currentIdea = { title: line.replace(/^\d+\.\s*/, '').trim() }
    } else if (line.includes('Title:') || line.includes('Concept:')) {
      const value = line.split(':')[1]?.trim()
      if (line.includes('Title:')) currentIdea.title = value
      if (line.includes('Concept:')) currentIdea.concept = value
    } else if (line.includes('Visual:') || line.includes('Visuals:')) {
      currentIdea.visuals = line.split(':')[1]?.trim()
    } else if (line.includes('Style:')) {
      currentIdea.style = line.split(':')[1]?.trim()
    } else if (line.includes('Hook:')) {
      currentIdea.hook = line.split(':')[1]?.trim()
    } else if (line.trim() && !currentIdea.concept) {
      currentIdea.concept = line.trim()
    }
  }
  
  if (currentIdea.title) ideas.push(currentIdea)
  
  return ideas.length > 0 ? ideas : [
    { title: 'Creative Video Idea', concept: 'A compelling video concept', visuals: 'Engaging visuals', style: 'engaging', hook: 'Attention-grabbing opening' }
  ]
}

function parseScriptIntoScenes(scriptText: string, includeVisuals: boolean): any[] {
  // Parse script into scenes with timing
  const scenes: any[] = []
  const sections = scriptText.split(/\[(.*?)\]/g)
  
  for (let i = 0; i < sections.length; i += 2) {
    if (i + 1 < sections.length) {
      const title = sections[i].trim()
      const content = sections[i + 1]?.trim()
      if (title && content) {
        scenes.push({
          title,
          content,
          visuals: includeVisuals ? extractVisualCues(content) : undefined,
        })
      }
    }
  }
  
  return scenes.length > 0 ? scenes : [
    { title: 'Opening', content: scriptText.substring(0, 200), visuals: includeVisuals ? 'Text overlay' : undefined },
    { title: 'Main Content', content: scriptText.substring(200), visuals: includeVisuals ? 'Transitions' : undefined },
  ]
}

function extractVisualCues(content: string): string {
  const visualKeywords = ['text overlay', 'transition', 'effect', 'zoom', 'pan', 'cut', 'fade']
  const found = visualKeywords.filter(keyword => content.toLowerCase().includes(keyword))
  return found.length > 0 ? found.join(', ') : 'Text overlays, transitions'
}

async function generateAIVoiceover(publicId: string, params: any): Promise<string> {
  // Declare variables outside try block for cleanup in catch
  let audioPath: string | undefined
  let videoPath: string | undefined
  let outputPath: string | undefined
  
  try {
    console.log(`🗣️ Generating AI voiceover for: ${publicId}`)
    const { text, voice = 'alloy' } = params
    
    // Get video URL from Cloudinary
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: 'video',
    })
    const videoUrl = resource.secure_url
    
    // Generate voiceover using OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: voice as any,
      input: text,
    })
    
    const buffer = Buffer.from(await mp3.arrayBuffer())
    const tempDir = getTempDir()
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    audioPath = path.join(tempDir, `voiceover_${Date.now()}.mp3`)
    fs.writeFileSync(audioPath, buffer)
    
    // Download video and add voiceover
    const videoResponse = await fetch(videoUrl)
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
    videoPath = path.join(tempDir, `video_${Date.now()}.mp4`)
    fs.writeFileSync(videoPath, videoBuffer)
    
    // Use FFmpeg to combine video with voiceover
    outputPath = path.join(tempDir, `output_${Date.now()}.mp4`)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath!)
        .input(audioPath!)
        .outputOptions(['-c:v copy', '-c:a aac', '-shortest'])
        .output(outputPath!)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'vedit/processed',
      use_filename: true,
      unique_filename: true,
    }) as { secure_url: string }
    
    // Cleanup
    const cleanupPaths = [audioPath, videoPath, outputPath].filter((p): p is string => Boolean(p))
    if (cleanupPaths.length > 0) {
      cleanupPaths.forEach(p => {
        try {
          if (p && fs.existsSync(p)) {
            fs.unlinkSync(p)
          }
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup file ${p}:`, cleanupError)
        }
      })
    }
    
    return result.secure_url
  } catch (error) {
    console.error('❌ Voiceover generation error:', error)
    
    // Cleanup on error if paths exist
    try {
      const cleanupPaths = [audioPath, videoPath, outputPath].filter((p): p is string => Boolean(p))
      if (cleanupPaths.length > 0) {
        cleanupPaths.forEach(p => {
          try {
            if (p && fs.existsSync(p)) {
              fs.unlinkSync(p)
            }
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        })
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    // DO NOT return original video - throw error instead
    // This ensures the frontend knows processing failed and doesn't show original as processed
    throw new Error(
      `Voiceover generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      `Please check server logs for more details.`
    )
  }
}

async function generateCustomOverlay(publicId: string, params: any): Promise<string> {
  try {
    console.log(`🎨 Generating DALL-E overlay for: ${publicId}`)
    const { description } = params
    
    // Generate image with DALL-E
    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt: description,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    })
    
    if (!imageResponse.data || imageResponse.data.length === 0 || !imageResponse.data[0].url) {
      throw new Error('Failed to generate image: No image data returned')
    }
    
    const imageUrl = imageResponse.data[0].url
    const response = await fetch(imageUrl)
    const arrayBuffer = await response.arrayBuffer()
    const imageBuffer = Buffer.from(arrayBuffer)
    
    // Download overlay image
    const tempDir = getTempDir()
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    const overlayPath = path.join(tempDir, `overlay_${Date.now()}.png`)
    fs.writeFileSync(overlayPath, imageBuffer)
    
    // Get video and overlay with FFmpeg
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: 'video',
    })
    const videoUrl = resource.secure_url
    const videoResponse = await fetch(videoUrl)
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
    const videoPath = path.join(tempDir, `video_${Date.now()}.mp4`)
    fs.writeFileSync(videoPath, videoBuffer)
    
    const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .complexFilter([
          `[0:v][1:v]overlay=0:0:enable='between(t,0,inf)'`
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
    
    // Upload
    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'vedit/processed',
      use_filename: true,
      unique_filename: true,
    }) as { secure_url: string }
    
    // Cleanup
    [overlayPath, videoPath, outputPath].forEach(p => {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    })
    
    return result.secure_url
  } catch (error) {
    console.error('❌ Overlay generation error:', error)
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: 'video',
    })
    return resource.secure_url || ''
  }
}

async function generateAIVideo(params: any): Promise<string> {
  try {
    console.log(`🎬 Generating Sora 2 video`)
    const { prompt, duration = 10 } = params
    
    // Note: Sora video generation API is not yet available in the OpenAI SDK
    // This is a placeholder for future implementation
    throw new Error('Sora video generation is not yet available in the OpenAI SDK. Please use other video editing features.')
    
    // Future implementation when Sora API is available:
    // const videoResponse = await openai.video.generate({
    //   model: 'sora-2',
    //   prompt: prompt,
    //   duration: duration,
    // })
    // 
    // const videoUrl = videoResponse.url || ''
    // 
    // // Download and upload to Cloudinary
    // const response = await fetch(videoUrl)
    // const arrayBuffer = await response.arrayBuffer()
    // const videoBuffer = Buffer.from(arrayBuffer)
    // const tempDir = path.join(process.cwd(), 'temp')
    // if (!fs.existsSync(tempDir)) {
    //   fs.mkdirSync(tempDir, { recursive: true })
    // }
    // const videoPath = path.join(tempDir, `generated_${Date.now()}.mp4`)
    // fs.writeFileSync(videoPath, videoBuffer)
    // 
    // const result = await cloudinary.uploader.upload(videoPath, {
    //   resource_type: 'video',
    //   folder: 'vedit/generated',
    //   use_filename: true,
    //   unique_filename: true,
    // }) as { secure_url: string }
    // 
    // if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath)
    // 
    // return result.secure_url
  } catch (error) {
    console.error('❌ Video generation error:', error)
    return ''
  }
}

async function processCombinedFeatures(publicId: string, params: any): Promise<string> {
  try {
    console.log(`🔗 Processing combined features`)
    const { features } = params
    if (!features || features.length === 0) {
      throw new Error('No features provided')
    }
    
    // Get video
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: 'video',
    })
    let currentUrl = resource.secure_url
    
    // Apply each feature sequentially
    for (const feature of features) {
      const instruction = {
        operation: feature.type,
        params: feature,
      }
      currentUrl = await videoProcessor.process(currentUrl, instruction)
    }
    
    return currentUrl
  } catch (error) {
    console.error('❌ Combined features error:', error)
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: 'video',
    })
    return resource.secure_url || ''
  }
}
