# 🎬 Quick Subtitle Generation Test

## Step-by-Step Test

### 1. Check Prerequisites
- [ ] Video uploaded to dashboard
- [ ] Video has audio track
- [ ] Video is < 25MB
- [ ] `OPENAI_API_KEY` is set in environment variables
- [ ] `RENDER_API_URL` is set (if on Vercel)

### 2. Test Commands (Try these in VIA Chat)

**Command 1: Basic**
```
add subtitles
```

**Command 2: With style**
```
generate captions with Glow style
```

**Command 3: Custom**
```
add subtitles with yellow color at bottom
```

### 3. Check Console Logs

**Browser Console (F12):**
- Look for errors starting with `❌`
- Check network tab for `/api/via` request
- Check response status (should be 200)

**Server Logs (Vercel Dashboard → Functions → Logs):**
- Look for: `🎬 Starting caption generation with Whisper...`
- Look for: `✅ OpenAI API key is configured`
- Look for: `🎤 Transcribing audio with Whisper...`
- Look for: `✅ Captions generated successfully`

### 4. Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `OPENAI_API_KEY not set` | Missing API key | Add in Vercel env vars |
| `RENDER_API_URL not configured` | Missing Render API | Add in Vercel env vars |
| `Video is too large` | >25MB | Trim video first |
| `No transcription text` | No audio | Use video with audio |
| `Render API timeout` | Processing too long | Use shorter video |

---

## Quick Fix Commands

If subtitles aren't working, try:

1. **Check API key:**
   ```bash
   # In terminal (local)
   echo $OPENAI_API_KEY
   ```

2. **Test with simple command:**
   ```
   add subtitles
   ```

3. **Check video:**
   - Ensure video has audio
   - Video should be < 25MB
   - Format: MP4, MOV, AVI, WebM

---

## Expected Behavior

✅ **Success:**
- VIA responds: "Generating speech-to-text subtitles..."
- Processing takes 30-120 seconds
- Video updates with subtitles embedded
- Subtitles appear at bottom (default) or specified position

❌ **Failure:**
- Error message appears in chat
- Check error message for specific issue
- See SUBTITLE_TROUBLESHOOTING.md for solutions

