/**
 * Freesound API Integration
 * Handles searching and downloading music from Freesound
 */

const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY
const FREESOUND_CLIENT_ID = process.env.FREESOUND_CLIENT_ID
const FREESOUND_BASE_URL = 'https://freesound.org/apiv2'

interface FreesoundSound {
  id: number
  name: string
  tags: string[]
  description: string
  duration: number
  previews: {
    'preview-hq-mp3'?: string
    'preview-hq-ogg'?: string
    'preview-lq-mp3'?: string
    'preview-lq-ogg'?: string
  }
  download?: string
  license: string
}

interface FreesoundSearchResponse {
  count: number
  next?: string
  previous?: string
  results: FreesoundSound[]
}

/**
 * Map music preset names to Freesound search queries
 */
const PRESET_TO_QUERY: Record<string, string[]> = {
  'ambient': ['ambient', 'background', 'atmospheric'],
  'upbeat': ['upbeat', 'happy', 'energetic', 'positive'],
  'emotional': ['emotional', 'sad', 'melancholic', 'touching'],
  'action': ['action', 'intense', 'dramatic', 'epic'],
  'chill': ['chill', 'relaxing', 'calm', 'peaceful'],
  'techno': ['techno', 'electronic', 'dance', 'beat'],
  'cinematic epic': ['cinematic', 'epic', 'orchestral', 'dramatic'],
  'lo-fi': ['lofi', 'lo-fi', 'chillhop', 'relaxing'],
  'trap beat': ['trap', 'hip-hop', 'beat', 'urban'],
  'corporate': ['corporate', 'professional', 'business', 'neutral'],
  'pop': ['pop', 'catchy', 'upbeat', 'mainstream'],
  'hip-hop': ['hip-hop', 'rap', 'urban', 'beat'],
  'retro synth': ['retro', 'synth', '80s', 'vintage'],
  'acoustic': ['acoustic', 'guitar', 'folk', 'organic'],
  'inspirational': ['inspirational', 'uplifting', 'motivational', 'positive'],
  'piano mood': ['piano', 'emotional', 'soft', 'melodic'],
  'dark tension': ['dark', 'tension', 'suspense', 'dramatic'],
  'happy vibe': ['happy', 'joyful', 'cheerful', 'positive'],
  'travel theme': ['travel', 'adventure', 'journey', 'exploration'],
  'dramatic rise': ['dramatic', 'building', 'crescendo', 'epic'],
  'fast cut beat': ['fast', 'energetic', 'beat', 'intense'],
  'edm drop': ['edm', 'electronic', 'drop', 'intense'],
  'dream pop': ['dream', 'pop', 'ethereal', 'soft'],
  'sad violin': ['violin', 'sad', 'emotional', 'melancholic'],
  'percussive hit': ['percussion', 'drums', 'rhythm', 'beat'],
  'calm nature ambience': ['nature', 'ambient', 'calm', 'peaceful'],
}

/**
 * Search Freesound for music matching a preset
 */
export async function searchFreesoundMusic(
  preset: string,
  options: {
    duration?: number // Target duration in seconds
    limit?: number // Number of results to return
  } = {}
): Promise<FreesoundSound | null> {
  if (!FREESOUND_API_KEY) {
    console.warn('⚠️ FREESOUND_API_KEY not configured')
    return null
  }

  try {
    // Get search queries for this preset
    const queries = PRESET_TO_QUERY[preset.toLowerCase()] || [preset.toLowerCase()]
    const searchQuery = queries.join(' OR ')

    // Build search URL
    // Freesound API v2 uses token authentication in query string OR Authorization header
    const searchParams = new URLSearchParams({
      query: searchQuery,
      fields: 'id,name,tags,description,duration,previews,license,download',
      filter: 'duration:[2 TO 300]', // 2 seconds to 5 minutes
      sort: 'rating_desc', // Sort by rating (best quality first)
      page_size: options.limit?.toString() || '5',
    })

    // If target duration specified, try to match it
    if (options.duration) {
      const minDuration = Math.max(2, options.duration - 10)
      const maxDuration = options.duration + 30
      searchParams.set('filter', `duration:[${minDuration} TO ${maxDuration}]`)
    }

    // Freesound API v2 authentication: Add token to query string
    searchParams.append('token', FREESOUND_API_KEY)
    const finalSearchUrl = `${FREESOUND_BASE_URL}/search/text/?${searchParams.toString()}`
    console.log(`🔍 Searching Freesound: ${searchQuery}`)
    
    const response = await fetch(finalSearchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Freesound API error (${response.status}):`, errorText)
      return null
    }

    const data: FreesoundSearchResponse = await response.json()

    if (!data.results || data.results.length === 0) {
      console.warn(`⚠️ No Freesound results for preset: ${preset}`)
      return null
    }

    // Find best match (prefer HQ MP3 preview)
    const bestMatch = data.results.find(
      (sound) => sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-hq-ogg']
    ) || data.results[0]

    console.log(`✅ Found Freesound track: ${bestMatch.name} (ID: ${bestMatch.id})`)
    return bestMatch
  } catch (error) {
    console.error('❌ Freesound search error:', error)
    return null
  }
}

/**
 * Get download URL for a Freesound sound
 * Note: Full downloads require OAuth2, but preview URLs work with API key
 */
export async function getFreesoundMusicUrl(
  preset: string,
  options: {
    duration?: number
    preferDownload?: boolean // Try to get full download (requires OAuth2)
  } = {}
): Promise<string | null> {
  const sound = await searchFreesoundMusic(preset, { duration: options.duration })

  if (!sound) {
    return null
  }

  // Try to get download URL (requires OAuth2 for full downloads)
  if (options.preferDownload && sound.download) {
    // For full downloads, we'd need OAuth2 token
    // For now, use preview URL
    console.log('⚠️ Full download requires OAuth2, using preview URL')
  }

  // Use HQ MP3 preview (works with API key)
  const previewUrl = sound.previews?.['preview-hq-mp3'] || 
                    sound.previews?.['preview-hq-ogg'] ||
                    sound.previews?.['preview-lq-mp3'] ||
                    sound.previews?.['preview-lq-ogg']

  if (previewUrl) {
    console.log(`✅ Using Freesound preview URL: ${previewUrl}`)
    return previewUrl
  }

  console.warn('⚠️ No preview URL available for sound')
  return null
}

/**
 * Get music URL from preset name (main entry point)
 */
export async function getMusicUrlFromPreset(
  preset: string,
  videoDuration?: number
): Promise<string | null> {
  if (!FREESOUND_API_KEY) {
    console.warn('⚠️ FREESOUND_API_KEY not configured - music feature unavailable')
    return null
  }

  return getFreesoundMusicUrl(preset, {
    duration: videoDuration,
    preferDownload: false, // Use preview URLs (no OAuth2 needed)
  })
}

