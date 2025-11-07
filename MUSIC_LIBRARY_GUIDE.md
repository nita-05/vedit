# Music Library Integration Guide

## How to Get Music Files for Video Editing

### Option 1: User-Provided Music URLs (✅ Currently Implemented)

Users can provide their own music files via URL. The system will:
- Download the music file from the URL
- Mix it with the video's existing audio
- Control volume and time ranges

**Usage:**
```
"Add upbeat music from https://example.com/music.mp3 with volume 0.5"
```

### Option 2: Royalty-Free Music APIs

#### A. Freesound API (Recommended - Free)
- **Website:** https://freesound.org
- **API:** https://freesound.org/docs/api/
- **Features:** 
  - Free, royalty-free music
  - Search by genre, mood, tags
  - Direct download URLs
- **Setup:**
  1. Create account at freesound.org
  2. Get API key
  3. Search for music by preset name
  4. Download and use URL

#### B. Jamendo API
- **Website:** https://www.jamendo.com
- **Features:** Commercial royalty-free music
- **Note:** Requires API key and may have usage limits

#### C. YouTube Audio Library
- **Website:** https://www.youtube.com/audiolibrary
- **Features:** Free music for YouTube videos
- **Note:** Manual download required, no API

### Option 3: Music Library Service Integration

#### A. Epidemic Sound API
- **Website:** https://www.epidemicsound.com
- **Features:** Professional music library
- **Note:** Paid service, requires subscription

#### B. Artlist API
- **Website:** https://artlist.io
- **Features:** High-quality music library
- **Note:** Paid service, requires subscription

### Option 4: Build Your Own Music Library

1. **Curate royalty-free tracks:**
   - Download from Freesound, Jamendo, or other free sources
   - Upload to Cloudinary or your own storage
   - Create a mapping: `preset -> music URL`

2. **Implementation Example:**
```javascript
const musicLibrary = {
  'ambient': 'https://your-storage.com/music/ambient.mp3',
  'upbeat': 'https://your-storage.com/music/upbeat.mp3',
  'emotional': 'https://your-storage.com/music/emotional.mp3',
  // ... more presets
}
```

3. **Integration in API:**
   - When user selects a preset, look up the URL
   - Pass `musicUrl` parameter to Render API
   - System will automatically download and mix

### Current Implementation Status

✅ **Fully Working:**
- Music URL download and mixing
- Volume control
- Time range support
- FFmpeg amix filter integration

⚠️ **Needs Music Library:**
- Preset-to-URL mapping
- Music file storage
- API integration for music services

### Quick Start: Using Freesound API

1. **Get API Key:**
   - Sign up at freesound.org
   - Go to API section
   - Generate API key

2. **Search for Music:**
```javascript
const response = await fetch(
  `https://freesound.org/apiv2/search/text/?query=${preset}&token=${API_KEY}`
)
const data = await response.json()
const musicUrl = data.results[0].previews['preview-hq-mp3']
```

3. **Use in VIA Command:**
```
"Add ambient music" → System searches Freesound → Downloads → Mixes
```

### Recommended Approach

**For Production:**
1. Use Freesound API for free music (good quality, legal)
2. Store popular tracks in Cloudinary for faster access
3. Cache music URLs by preset name
4. Allow users to upload their own music

**Implementation Priority:**
1. ✅ Music URL mixing (DONE)
2. 🔄 Freesound API integration (NEXT)
3. 🔄 Music caching system
4. 🔄 User upload support

### Example: Adding Freesound Integration

```javascript
// In app/api/via/route.ts
async function getMusicUrlFromPreset(preset) {
  const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY
  if (!FREESOUND_API_KEY) {
    throw new Error('FREESOUND_API_KEY not configured')
  }
  
  // Map preset to search query
  const searchQueries = {
    'ambient': 'ambient background',
    'upbeat': 'upbeat happy',
    'emotional': 'emotional sad',
    // ... more mappings
  }
  
  const query = searchQueries[preset.toLowerCase()] || preset
  const response = await fetch(
    `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&filter=type:mp3&token=${FREESOUND_API_KEY}`
  )
  
  const data = await response.json()
  if (data.results && data.results.length > 0) {
    return data.results[0].previews['preview-hq-mp3']
  }
  
  return null
}
```

### Environment Variables Needed

```env
FREESOUND_API_KEY=your_api_key_here
# Or for other services:
EPIDEMIC_SOUND_API_KEY=your_key
ARTLIST_API_KEY=your_key
```

### Next Steps

1. **Get Freesound API Key** (free, recommended)
2. **Implement preset-to-URL mapping** in `app/api/via/route.ts`
3. **Add music caching** to avoid repeated downloads
4. **Test with real music files**

The music mixing infrastructure is **100% ready** - you just need to provide music URLs!

