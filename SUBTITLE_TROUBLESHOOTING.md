# 🎬 Subtitle Generation Troubleshooting Guide

## How Subtitle Generation Works

1. **User requests subtitles** → "add subtitles", "generate captions", etc.
2. **VIA processes command** → Uses `addCaptions` operation
3. **Video downloaded** → From Cloudinary to temp file
4. **Whisper API transcription** → OpenAI Whisper-1 model transcribes audio
5. **Caption generation** → Creates timed captions with timestamps
6. **Video processing** → FFmpeg adds captions to video (via Render API or local)
7. **Result** → Video with embedded subtitles

---

## Common Issues & Solutions

### ❌ Issue 1: "OPENAI_API_KEY not set"
**Error Message:** `OPENAI_API_KEY environment variable is not set`

**Solution:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `OPENAI_API_KEY` with your OpenAI API key
3. Redeploy the application

**Test:**
```bash
# Check if API key is set (locally)
echo $OPENAI_API_KEY
```

---

### ❌ Issue 2: "RENDER_API_URL not configured" (Vercel)
**Error Message:** `RENDER_API_URL is not configured. On Vercel, Render API is required`

**Solution:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `RENDER_API_URL` with your Render API URL (e.g., `https://vedit-render-api.onrender.com`)
3. Redeploy the application

**Note:** On Vercel, Render API is REQUIRED for subtitle processing (FFmpeg operations)

---

### ❌ Issue 3: "Video is too large" (>25MB)
**Error Message:** `Video is X MB, Whisper API limit is 25MB`

**Solution:**
- Trim the video first: "trim video to first 30 seconds"
- Or compress the video before uploading
- Whisper API has a 25MB file size limit

---

### ❌ Issue 4: "Video has no audio"
**Error Message:** `No transcription text or segments available`

**Solution:**
- Ensure your video has audio track
- Check video format supports audio (MP4, MOV, etc.)
- Try a different video with audio

---

### ❌ Issue 5: "Render API timeout"
**Error Message:** `Render API timeout: Caption processing took too long`

**Solution:**
- Try with a shorter video
- Check Render API status
- Ensure Render API is running and accessible

---

### ❌ Issue 6: "Failed to download video"
**Error Message:** `Failed to download video for transcription`

**Solution:**
- Check Cloudinary configuration
- Verify video URL is accessible
- Check network connectivity

---

## Testing Subtitle Generation

### Test Command 1: Basic Subtitles
```
"add subtitles to my video"
```
**Expected:** Subtitles with default style (Glow, bottom, white, medium size)

### Test Command 2: Custom Subtitles
```
"generate subtitles with yellow color at top position large size"
```
**Expected:** Subtitles with yellow color, top position, large size

### Test Command 3: Subtitle Style
```
"add captions with Bold style"
```
**Expected:** Subtitles with Bold style preset

---

## Diagnostic Checklist

Before reporting an issue, check:

- [ ] Video has audio track
- [ ] Video is < 25MB (for Whisper API)
- [ ] `OPENAI_API_KEY` is set in environment variables
- [ ] `RENDER_API_URL` is set (if on Vercel)
- [ ] Video is uploaded successfully
- [ ] Network connection is stable
- [ ] Check browser console for errors
- [ ] Check server logs for detailed error messages

---

## How to Test Locally

1. **Set environment variables:**
   ```bash
   export OPENAI_API_KEY="your-key-here"
   export RENDER_API_URL="your-render-api-url"  # Optional for local
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```

3. **Upload a video** with audio

4. **Try commands:**
   - "add subtitles"
   - "generate captions"
   - "add subtitles with yellow color"

5. **Check console logs** for:
   - `🎬 Starting caption generation with Whisper...`
   - `🎤 Transcribing audio with Whisper...`
   - `✅ Captions generated successfully`

---

## Expected Console Logs (Success)

```
🎬 Starting caption generation with Whisper...
📺 Using provided video URL for caption generation: https://...
📥 Downloading video for transcription: https://...
📊 Video content type: video/mp4
📊 Downloaded video size: 5.23MB
📁 Temp file created: /tmp/whisper_1234567890.mp4 (5.23MB)
✅ OpenAI API key is configured (length: 51 chars)
🎤 Attempting Whisper API with verbose_json format...
✅ Whisper API call successful with verbose_json format
📝 Transcription complete: Hello, this is a test video...
📊 Transcription segments: 15
✅ Generated 15 caption segments from Whisper timestamps
🎬 Processing video with captions...
🌐 Using Render API for caption processing: https://...
✅ Processed captions via Render API: https://...
```

---

## Error Log Patterns

### Missing API Key:
```
❌ Whisper API error: OPENAI_API_KEY environment variable is not set
```

### Render API Not Configured:
```
❌ Caption processing failed: RENDER_API_URL is not configured
```

### Video Too Large:
```
⚠️ Video is 30.5MB, Whisper API limit is 25MB. May need to trim or compress.
```

### No Audio:
```
❌ Whisper API returned no transcription text or segments
```

---

## Quick Fixes

### Fix 1: Check Environment Variables
```bash
# In Vercel Dashboard:
OPENAI_API_KEY = sk-...
RENDER_API_URL = https://vedit-render-api.onrender.com
```

### Fix 2: Test with Short Video
- Upload a video < 10 seconds
- Ensure it has clear audio
- Try: "add subtitles"

### Fix 3: Check Video Format
- Supported: MP4, MOV, AVI, WebM (with audio)
- Not supported: Images, videos without audio

---

## Still Not Working?

1. **Check server logs** in Vercel Dashboard → Functions → Logs
2. **Check browser console** for frontend errors
3. **Test API directly:**
   ```bash
   curl -X POST http://localhost:3000/api/via \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "add subtitles",
       "videoPublicId": "your-video-id"
     }'
   ```
4. **Verify Whisper API works:**
   - Check OpenAI dashboard for API usage
   - Ensure API key has credits/quota

---

## Contact Support

If subtitle generation still doesn't work after checking all above:
1. Share the exact error message
2. Share video details (duration, size, format)
3. Share console logs (both browser and server)
4. Share environment variable status (without revealing actual keys)

