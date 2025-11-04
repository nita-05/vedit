# 🎬 VEDIT - AI Video Editing Platform

A cinematic AI-powered video editing platform for creators, startups, and brands.

## ✅ Setup Complete

All technical issues have been resolved:
- ✅ MongoDB Atlas connected
- ✅ Video editing working
- ✅ FFmpeg configured
- ✅ All features operational

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables in `.env.local`:**
   ```env
   MONGODB_URI=your_mongodb_uri
   OPENAI_API_KEY=your_openai_key
   OPENAI_MODEL=model_name
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_secret
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000)**

## ✨ Features

- 🎨 **VIA AI Chat** - Edit videos with natural language
- 🎞️ **Color Grading** - 26 cinematic presets
- ✨ **Visual Effects** - 25 creative effects
- 🎬 **Transitions** - 24 smooth transitions
- 🎵 **Music & SFX** - 25 audio tracks
- 📝 **Text Overlays** - 25 styles
- 💾 **Auto-Backup** - Every 5 minutes
- ☁️ **Cloud Storage** - Cloudinary integration
- 🗄️ **Database** - MongoDB Atlas

## 📝 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## 🛠️ Tech Stack

- **Framework:** Next.js 14
- **Language:** TypeScript
- **Database:** MongoDB Atlas + Mongoose
- **Storage:** Cloudinary
- **AI:** OpenAI GPT-4
- **Video:** FFmpeg + fluent-ffmpeg
- **Auth:** NextAuth.js
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion

## 📊 Current Status

All critical features are working:
- ✅ Authentication
- ✅ Video upload/processing
- ✅ AI editing
- ✅ Database storage
- ✅ Export/download
- ✅ Timeline view

## 🔧 Troubleshooting

**FFmpeg not found?**
- FFmpeg auto-detects common Windows paths
- Check console for "✅ FFmpeg found at: ..." message
- See `FFMPEG_SETUP_GUIDE.md` for complete installation guide

**Video not updating after edits?**
- Check console logs for processing steps
- Verify FFmpeg is detected
- Ensure Cloudinary credentials are correct

**Caption generation errors?**
- Fixed permanently using `complexFilter()` instead of `videoFilters()`
- No installation changes needed - code issue resolved

**Database connection issues?**
- Verify MongoDB URI in `.env.local`
- Check Network Access in MongoDB Atlas (whitelist IPs)
- Ensure database user exists and has correct permissions

## 📚 Additional Guides

See other markdown files for:
- `FFMPEG_SETUP_GUIDE.md` - **Complete FFmpeg installation & troubleshooting guide**
- `FEATURE_CLICK_GUIDE.md` - How to use features
- `FEATURE_TO_CHAT_GUIDE.md` - Chat commands
- `FIXED_OPENAI_TEMPERATURE_ERROR.md` - OpenAI fixes

## 🎉 Ready to Use!

Your VEDIT app is fully configured and ready to edit videos!

Upload a video and try commands like:
- "Apply vintage look"
- "Add warm color grade"
- "Apply dreamy glow"
- "Add fade transition"

Happy editing! 🎬✨

