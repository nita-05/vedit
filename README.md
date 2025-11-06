# 🎬 VEDIT - The AI Video Editing Platform

<div align="center">

![VEDIT Logo](https://img.shields.io/badge/VEDIT-AI%20Video%20Editing-9b5de5?style=for-the-badge&logo=video&logoColor=white)

**AI-powered video editing for creators, startups, and brands. Edit, manage, and publish your videos in seconds.**

[Features](#-features) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started) • [Demo](#-demo) • [Documentation](#-documentation)

</div>

---

## ✨ Features

### 🤖 AI-Powered Editing (VIA Assistant)
- **Natural Language Commands**: "Add cinematic color grade" or "Apply blur effect from 3 to 5 seconds"
- **Intelligent Analysis**: AI analyzes your video and suggests optimal enhancements
- **Time-Based Effects**: Apply effects to specific time ranges (e.g., blur from 3-5 seconds)
- **Voice Input**: Speak your editing commands naturally

### 🎨 Real-Time Preview
- **Instant Previews**: See changes before final processing using Cloudinary transformations
- **Before/After Comparison**: Side-by-side preview of original vs. edited video
- **No Processing Wait**: Preview effects instantly without FFmpeg processing

### 📚 Effect Templates
- **10+ Professional Templates**: One-click cinematic, vlog, product, social media looks
- **Categories**: Cinematic, Vlog, Product, Social, Corporate, Creative
- **Customizable**: Apply templates and further customize as needed

### 🤖 Smart Auto-Enhance
- **Intelligent Analysis**: Analyzes video metadata (resolution, bitrate, duration)
- **Smart Suggestions**: Recommends only what's actually needed:
  - Noise reduction (for low-quality videos)
  - Saturation adjustments (for compressed videos)
  - Color grading (appropriate for video quality)
  - Transitions (for long videos)
  - Text overlays (for short/long videos)
  - Music & effects (when appropriate)

### 🎬 Core Editing Features
- **Text Overlays**: 24+ text styles (Bold, Cinematic, Neon Glow, etc.)
- **Color Grading**: 25+ presets (Warm, Cool, Vintage, Cinematic, Cyberpunk, etc.)
- **Visual Effects**: 25+ effects (Blur, Glow, VHS, Film Grain, Bokeh, etc.)
- **Transitions**: 23+ transitions (Fade, Slide, Zoom, Cross Dissolve, etc.)
- **Music & SFX**: 25+ music presets (Ambient, Upbeat, Cinematic Epic, etc.)
- **Subtitles/Captions**: Auto-generate speech-to-text subtitles with custom styling
- **Video Operations**: Trim, merge, crop, rotate, speed adjustment, object removal

### 📊 Multi-Track Timeline
- **Drag & Drop**: Organize clips between tracks
- **Multi-Select**: Shift/Ctrl + Click for multiple clips
- **Split & Merge**: Split clips at any point, merge clips from different videos
- **Visual Timeline**: See all clips and their durations

### ☁️ Cloud Integration
- **Cloudinary**: Secure video storage and transformation
- **MongoDB Atlas**: Project backups and edit history
- **NextAuth**: Secure authentication (Google OAuth)

### 🚀 V-Port (Publishing)
- **Social Media Publishing**: Direct publishing to YouTube, TikTok, Instagram, etc.
- **Export Options**: High-quality video export in multiple formats
- **Share Links**: Generate shareable links for your videos

### 🎨 Brand Kits
- **Custom Brand Presets**: Save your brand colors, fonts, logos
- **Auto-Apply**: Apply brand kits to videos automatically
- **Consistent Branding**: Maintain brand consistency across all videos

### 🎙️ Voice Profiles
- **VIA Voice Profiles**: Custom voice styles for voiceovers
- **AI Voice Generation**: Generate voiceovers with different voice profiles

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Smooth animations
- **React Player** - Video playback

### Backend
- **Next.js API Routes** - Serverless API endpoints
- **FFmpeg** - Video processing engine
- **Cloudinary** - Video storage and transformations
- **MongoDB Atlas** - Database for projects and backups
- **NextAuth.js** - Authentication

### AI & Processing
- **OpenAI GPT-4** - Natural language processing for VIA Assistant
- **FFmpeg-static** - Video encoding/decoding
- **fluent-ffmpeg** - FFmpeg wrapper for Node.js

### Deployment
- **Vercel** - Serverless hosting
- **Cloudinary** - CDN and video processing
- **MongoDB Atlas** - Cloud database

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- MongoDB Atlas account (free tier works)
- Cloudinary account (free tier works)
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/vedit.git
   cd vedit
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file:
   ```env
   # Database
   MONGODB_URI=your_mongodb_atlas_connection_string

   # Authentication
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_nextauth_secret

   # Cloudinary
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name

   # OpenAI
   OPENAI_API_KEY=your_openai_api_key

   # OAuth (Google)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## 📸 Screenshots

### Dashboard
- Clean, modern interface with dark theme
- Three-panel layout: Media Upload, Video Player, VIA Chat
- Multi-track timeline for video editing

### VIA Chat Interface
- Natural language commands
- Real-time AI responses
- Voice input support

### Feature Templates
- One-click professional looks
- Category-based organization
- Preview before applying

---

## 🎯 Use Cases

### Content Creators
- Quick video edits for social media
- Apply professional templates instantly
- Auto-generate captions for accessibility

### Startups & Brands
- Maintain brand consistency with Brand Kits
- Batch video processing
- Social media publishing

### Video Editors
- Time-saving AI-powered editing
- Professional color grading
- Advanced effects and transitions

---

## 🔧 Key Features Explained

### VIA Assistant
VIA (Video Intelligence Assistant) understands natural language and converts commands to video editing operations. Examples:
- "Add cinematic color grade"
- "Apply blur effect from 3 to 5 seconds"
- "Generate subtitles with yellow color at top position"
- "Merge selected clips from different videos"

### Smart Auto-Enhance
Analyzes video characteristics and suggests only what's needed:
- **Low bitrate videos** → Noise reduction + Saturation boost
- **Short videos** → Text overlay + Vibrant color grade
- **Long videos** → Transitions + Music + Cinematic color grade
- **High-resolution videos** → Creative effects + Professional color grading

### Time-Based Effects
Apply effects to specific time ranges:
```javascript
// Example: Blur from 3-5 seconds
"Apply blur effect from 3 to 5 seconds"

// Example: Color grade from 5 seconds onwards
"Apply cinematic color grade starting from 5 seconds"
```

---

## 📚 API Documentation

### Main Endpoints

#### `/api/via` (POST)
VIA Assistant endpoint for natural language video editing commands.

**Request:**
```json
{
  "prompt": "Add cinematic color grade",
  "videoPublicId": "vedit/video123",
  "videoUrl": "https://...",
  "mediaType": "video"
}
```

**Response:**
```json
{
  "message": "Applied cinematic color grade...",
  "videoUrl": "https://...",
  "publicId": "vedit/processed/..."
}
```

#### `/api/preview` (POST)
Generate instant previews using Cloudinary transformations.

#### `/api/templates` (GET/POST)
Fetch and apply effect templates.

#### `/api/auto-enhance` (POST)
AI-powered video analysis and enhancement suggestions.

---

## 🚀 Deployment

### Vercel Deployment

1. **Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Deploy to Vercel**
   - Connect your GitHub repository
   - Add environment variables
   - Deploy!

3. **Configure MongoDB Atlas**
   - Whitelist Vercel IPs (or use 0.0.0.0/0 for development)
   - Ensure connection string is correct

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **FFmpeg** - Video processing
- **Cloudinary** - Video storage and CDN
- **OpenAI** - AI capabilities
- **Next.js** - Framework
- **Vercel** - Hosting platform

---

## 📧 Contact

For questions, suggestions, or support:
- **GitHub Issues**: [Open an issue](https://github.com/yourusername/vedit/issues)
- **Email**: your-email@example.com

---

<div align="center">

**Built with ❤️ using Next.js, FFmpeg, and OpenAI**

⭐ Star this repo if you find it helpful!

</div>
