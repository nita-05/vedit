# VEDIT Render API Service

This is a separate API service deployed on Render that handles all FFmpeg video processing operations.

## Why Separate Service?

- **Vercel**: Fast frontend, lightweight APIs, but limited FFmpeg support
- **Render**: Supports FFmpeg binaries, long-running processes, Docker support
- **Best of Both**: Fast UI on Vercel, heavy processing on Render

## Setup

### 1. Install Dependencies

```bash
cd render-api
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ALLOWED_ORIGINS` (your Vercel domain)

### 3. Test Locally

```bash
npm run dev
```

Server will run on `http://localhost:3001`

### 4. Deploy to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `vedit-render-api`
   - **Root Directory**: `render-api`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node`
   - **Node Version**: `18` or higher
5. Add environment variables from `.env`
6. Deploy!

## API Endpoints

### Health Check
```
GET /health
```

### Process Video
```
POST /process
Content-Type: application/json

{
  "videoUrl": "https://...",
  "instruction": {
    "operation": "colorGrade",
    "params": {
      "preset": "cinematic"
    }
  },
  "publicId": "vedit/video_id"
}
```

## Integration with Vercel

Your Vercel API automatically calls this service when FFmpeg is needed:

1. **Vercel detects** if operation requires FFmpeg
2. **Calls Render API** if `RENDER_API_URL` is set
3. **Falls back** to local FFmpeg if Render unavailable
4. **Falls back** to Cloudinary if both fail

### Environment Variables Required

**On Vercel:**
```env
RENDER_API_URL=https://your-render-service.onrender.com
```

**On Render:**
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed setup instructions.

## Notes

- FFmpeg will be automatically installed via npm packages
- Render supports long-running processes (unlike Vercel)
- All video processing happens on Render, results uploaded to Cloudinary
- Vercel handles UI and lightweight operations

