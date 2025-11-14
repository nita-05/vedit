# 🎬 VEDIT Dashboard Testing Guide

## Quick Testing Checklist (5 minutes)

### ✅ VIA Chat (AI Assistant)
- [ ] Open dashboard → VIA chat panel appears
- [ ] Type a message → Click send → AI responds
- [ ] Click feature buttons (Text, Effects, Color, Transitions, Music) → Feature-specific suggestions appear
- [ ] Use voice input (🎤 button) → Speak → Transcription appears
- [ ] Click "Clear chat" → Chat history clears

### ✅ V-Editor (Video Editing)
- [ ] Upload a video → Video appears in preview
- [ ] Timeline shows clips → Drag clips on timeline
- [ ] Click "Trim" → Set start/end → Video trims
- [ ] Select multiple clips → Click "Merge" → Clips merge
- [ ] Click "Export" → Video exports (may take time)

### ✅ V-Port (Publishing)
- [ ] Click "V-Port" button → Modal opens
- [ ] Select platform (YouTube, Instagram, etc.)
- [ ] Enter title/description
- [ ] Click "Publish Now" → Success message appears
- [ ] Enable "Schedule" → Select date/time → Schedule post

### ✅ VIA Profiles (Voice Generation)
- [ ] Click "VIA Profiles" → Modal opens
- [ ] Enter text in "Generate Voice Over" section
- [ ] Select voice (alloy, echo, nova, etc.)
- [ ] Select model (tts-1 or tts-1-hd)
- [ ] Adjust speed (0.25-4.0)
- [ ] Click "Generate Voice" → Audio generates
- [ ] Click "Play" → Audio plays
- [ ] Click "Download" → Audio downloads

---

## Detailed Testing Guide

### 1. VIA Chat (AI Assistant) 🗣️

#### Test 1.1: Basic Chat
**Steps:**
1. Navigate to `/dashboard`
2. Look for VIA chat panel on the right side
3. Type: "Hello, can you help me edit my video?"
4. Click "Send" button or press Enter
5. Wait for AI response (should appear within 5 seconds)

**Expected Result:**
- ✅ Message appears in chat
- ✅ AI responds with helpful message
- ✅ Response has typing animation (3 dots bouncing)
- ✅ Response time < 5 seconds

#### Test 1.2: Feature-Specific Buttons
**Steps:**
1. Click "Text" button in ActionNavbar (top of dashboard)
2. Check the input field in VIA chat
3. Click "Send"
4. Repeat for: Effects, Color, Transitions, Music

**Expected Result:**
- ✅ Input field auto-fills with feature-specific prompt
- ✅ AI responds with suggestions for THAT feature only
- ✅ Response is contextual (e.g., "Text" button → text overlay suggestions)

#### Test 1.3: Voice Input
**Steps:**
1. Click 🎤 microphone button in VIA chat
2. Allow microphone permission if prompted
3. Speak: "Add text overlay to my video"
4. Wait for transcription
5. Click "Send"

**Expected Result:**
- ✅ Microphone activates (visual indicator)
- ✅ Speech transcribed to text
- ✅ Text appears in input field
- ✅ AI processes voice command

#### Test 1.4: Clear Chat
**Steps:**
1. Have 3-4 messages in chat
2. Click "Clear chat" button
3. Confirm chat is empty

**Expected Result:**
- ✅ All messages disappear
- ✅ Chat history resets
- ✅ Can start new conversation

---

### 2. V-Editor (Video Editor) 🎬

#### Test 2.1: Upload Video
**Steps:**
1. Click "Upload Video" button
2. Select a video file (MP4, MOV, etc.)
3. Wait for upload

**Expected Result:**
- ✅ Video appears in preview player
- ✅ Timeline shows clip(s)
- ✅ Video name appears
- ✅ Duration displays correctly

#### Test 2.2: Timeline Interactions
**Steps:**
1. View timeline with clips
2. Hover over a clip
3. Click and drag a clip
4. Release to drop

**Expected Result:**
- ✅ Clip shows hover effect (scale up)
- ✅ Clip drags smoothly
- ✅ Clip drops at new position
- ✅ Visual feedback during drag

#### Test 2.3: Trim Video
**Steps:**
1. Select a clip on timeline
2. Click "Trim" button
3. Set start time (e.g., 5 seconds)
4. Set end time (e.g., 30 seconds)
5. Click "Apply Trim"

**Expected Result:**
- ✅ Trim controls appear
- ✅ Video preview updates
- ✅ Timeline clip updates
- ✅ Trimmed video plays correctly

#### Test 2.4: Merge Clips
**Steps:**
1. Upload 2 videos (or split one video)
2. Select both clips (Ctrl+Click or drag selection)
3. Click "Merge" button
4. Wait for processing

**Expected Result:**
- ✅ Both clips selected (highlighted)
- ✅ Merge button appears/enabled
- ✅ Processing indicator shows
- ✅ Merged clip appears on timeline

#### Test 2.5: Export Video
**Steps:**
1. Have edited video ready
2. Click "Export" button
3. Wait for export (may take 1-5 minutes)

**Expected Result:**
- ✅ Export starts (progress indicator)
- ✅ Export completes
- ✅ Download link appears
- ✅ Video file downloads

---

### 3. V-Port (Publishing) 📤

#### Test 3.1: Publish Now
**Steps:**
1. Click "V-Port" button (top right)
2. Select platform: "YouTube"
3. Enter title: "My Test Video"
4. Enter description: "This is a test"
5. Click "Publish Now"

**Expected Result:**
- ✅ Modal opens
- ✅ Platform dropdown works
- ✅ Form fields accept input
- ✅ Success message appears
- ✅ (Note: Actual publishing requires API keys)

#### Test 3.2: Schedule Post
**Steps:**
1. Open V-Port modal
2. Toggle "Schedule" switch ON
3. Select date (tomorrow)
4. Select time (e.g., 2:00 PM)
5. Click "Schedule"

**Expected Result:**
- ✅ Date picker appears
- ✅ Time picker appears
- ✅ Schedule button enabled
- ✅ Scheduled post appears in table
- ✅ Status shows "⏰ Scheduled"

#### Test 3.3: View Scheduled Posts
**Steps:**
1. Schedule 2-3 posts
2. Scroll to "Scheduled Posts" table
3. View all scheduled posts

**Expected Result:**
- ✅ Table shows all scheduled posts
- ✅ Platform icons display
- ✅ Date/time formatted correctly
- ✅ Status indicators show correctly

---

### 4. VIA Profiles (Voice Generation) 🎤

#### Test 4.1: Generate Voice
**Steps:**
1. Click "VIA Profiles" button
2. Scroll to "Generate Voice Over" section
3. Enter text: "Hello, this is a test voiceover"
4. Select voice: "Nova" (female voice)
5. Select model: "tts-1-hd"
6. Set speed: 1.0
7. Click "Generate Voice"

**Expected Result:**
- ✅ Character counter shows (e.g., "35 / 4096")
- ✅ Loading spinner appears
- ✅ Generation completes (5-15 seconds)
- ✅ Audio URL received
- ✅ Play button appears

#### Test 4.2: Play Generated Audio
**Steps:**
1. After generating voice (Test 4.1)
2. Click "▶️ Play" button
3. Listen to audio

**Expected Result:**
- ✅ Audio plays immediately
- ✅ Play button changes to pause (if implemented)
- ✅ Audio quality is good
- ✅ Voice matches selection (Nova = female)

#### Test 4.3: Download Audio
**Steps:**
1. After generating voice
2. Click "⬇️ Download" button
3. Check Downloads folder

**Expected Result:**
- ✅ Download starts
- ✅ File saves as MP3
- ✅ Filename includes timestamp
- ✅ File plays in media player

#### Test 4.4: Character Limit Validation
**Steps:**
1. Enter text > 4096 characters (paste long text)
2. Watch character counter
3. Try to generate

**Expected Result:**
- ✅ Counter turns red when > 4096
- ✅ Warning message appears
- ✅ Generate button disabled
- ✅ Error message: "Text exceeds maximum length"

#### Test 4.5: Different Voices
**Steps:**
1. Generate voice with "Alloy" (neutral)
2. Generate same text with "Onyx" (male, deep)
3. Generate same text with "Shimmer" (female, soft)
4. Compare audio

**Expected Result:**
- ✅ Each voice sounds different
- ✅ Voice characteristics match description
- ✅ All voices generate successfully

#### Test 4.6: Speed Control
**Steps:**
1. Generate voice at speed 0.5x (slow)
2. Generate same text at speed 2.0x (fast)
3. Compare playback

**Expected Result:**
- ✅ 0.5x plays slower
- ✅ 2.0x plays faster
- ✅ Audio quality maintained

---

## Common Issues & Solutions

### Issue: VIA Chat not responding
**Solution:**
- Check browser console for errors
- Verify `OPENAI_API_KEY` is set in environment
- Check network tab for API calls

### Issue: Video upload fails
**Solution:**
- Check file size (max 500MB)
- Verify file format (MP4, MOV supported)
- Check Cloudinary credentials

### Issue: Voice generation fails
**Solution:**
- Check `OPENAI_API_KEY` is valid
- Verify text is < 4096 characters
- Check browser console for errors
- Try different voice/model

### Issue: Timeline not showing clips
**Solution:**
- Refresh page
- Check video upload completed
- Verify video has valid duration

---

## Demo Video Script (2-3 minutes)

### Scene 1: Introduction (10s)
"Welcome to VEDIT, the AI-powered video editing platform. Let me show you the key features."

### Scene 2: VIA Chat (30s)
"First, VIA our AI assistant. I can ask it to analyze my video or get suggestions. Watch as I click the Text button - it automatically suggests text overlay options. I can also use voice commands."

### Scene 3: V-Editor (40s)
"Next, the V-Editor. I'll upload a video and trim it. See how the timeline shows clips with thumbnails? I can drag, split, and merge clips easily."

### Scene 4: V-Port (20s)
"V-Port lets me publish to multiple platforms. I can schedule posts for later or publish immediately."

### Scene 5: VIA Profiles (30s)
"Finally, VIA Profiles for voice generation. I'll generate a voiceover using OpenAI TTS. Watch the character counter and quality options. The audio generates in seconds and I can download it."

### Scene 6: Closing (10s)
"That's VEDIT - AI-powered video editing made simple. Try it at vedit-theta.vercel.app"

---

## Testing Checklist Summary

**Must Test:**
- ✅ VIA Chat responds
- ✅ Feature buttons work
- ✅ Voice input works
- ✅ Video upload works
- ✅ Timeline interactions
- ✅ Voice generation works
- ✅ Audio playback/download

**Nice to Test:**
- ✅ Trim video
- ✅ Merge clips
- ✅ Schedule posts
- ✅ Different voices
- ✅ Speed control

---

## Quick Reference

**Keyboard Shortcuts:**
- `Shift + Click` timeline = Split clip
- `Ctrl/Cmd + Click` = Multi-select clips
- `Delete` key = Delete selected clip
- `Shift + S` = Split selected clip at midpoint

**API Endpoints:**
- `/api/viaChat` - General chat
- `/api/via` - Video editing commands
- `/api/tts` - Voice generation
- `/api/publish` - Publishing (requires keys)

**Environment Variables Needed:**
- `OPENAI_API_KEY` - For VIA chat and TTS
- `CLOUDINARY_*` - For video/audio storage
- Platform API keys - For publishing (optional)

---

**Last Updated:** $(date)
**Version:** 1.0.0

