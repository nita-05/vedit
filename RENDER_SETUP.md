# Render API Setup for VEDIT

## Overview

This project uses a **hybrid architecture**:
- **Vercel**: Frontend + lightweight APIs
- **Render**: FFmpeg processing (heavy operations)

## Why Separate Services?

✅ **Vercel**: Fast frontend, edge functions, but limited FFmpeg support  
✅ **Render**: Full FFmpeg support, long-running processes, Docker support  
✅ **Best of Both**: Fast UI on Vercel, reliable processing on Render

## Quick Setup (5 minutes)

### Step 1: Deploy to Render

1. Push code to GitHub (if not already)
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **"New" → "Web Service"**
4. Connect your GitHub repository
5. Configure:
   - **Name**: `vedit-render-api`
   - **Root Directory**: `render-api`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node` (version 18+)
6. Add environment variables:
   ```
   PORT=3001
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ALLOWED_ORIGINS=https://vedit-theta.vercel.app
   ```
7. Click **"Create Web Service"**
8. Wait for deployment (~3-5 minutes)

### Step 2: Get Render URL

After deployment, Render provides a URL like:
```
https://vedit-render-api.onrender.com
```

**Copy this URL** - you'll need it next.

### Step 3: Configure Vercel

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add new variable:
   - **Key**: `RENDER_API_URL`
   - **Value**: `https://vedit-render-api.onrender.com` (your Render URL)
3. **Redeploy** your Vercel project

### Step 4: Test

1. Upload a video in your app
2. Try an FFmpeg operation (e.g., "Add captions")
3. Check Vercel logs for: `🌐 Using Render API`

## How It Works

```
User Action
    ↓
Vercel API (/api/via)
    ↓
[Needs FFmpeg?]
    ↓ Yes → Render API (/process)
    ↓ No  → Cloudinary Transform
    ↓
FFmpeg Processing (Render)
    ↓
Upload to Cloudinary
    ↓
Return URL to Vercel
    ↓
Return to User
```

## Operations Handled

### Render API (FFmpeg Required)
- ✅ Caption generation
- ✅ Video merging
- ✅ Trimming
- ✅ Music addition
- ✅ Transitions
- ✅ Voice generation

### Vercel (Lightweight)
- ✅ Color grading (simple)
- ✅ Effects (simple)
- ✅ Text overlays (simple)
- ✅ Filters (simple)

## Monitoring

### Check Render Health
```bash
curl https://your-render-service.onrender.com/health
```

Should return:
```json
{
  "status": "ok",
  "ffmpeg": "available",
  "timestamp": "..."
}
```

### Check Logs
- **Render**: Dashboard → Service → Logs
- **Vercel**: Dashboard → Project → Logs

## Troubleshooting

### Render API Not Working?

1. **Check if service is running:**
   - Render Dashboard → Is service active?
   - Free tier sleeps after 15min - first request may take 30s

2. **Check environment variables:**
   - All Cloudinary credentials set?
   - `ALLOWED_ORIGINS` includes your Vercel domain?

3. **Check logs:**
   - Render logs for FFmpeg initialization
   - Vercel logs for API call errors

### FFmpeg Not Found?

- Render free tier includes FFmpeg via npm packages
- Check Render logs for "✅ FFmpeg initialized"
- If missing, Render will try to install system FFmpeg

### CORS Errors?

Update `ALLOWED_ORIGINS` in Render:
```
ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
```

Then redeploy Render service.

## Cost

### Render Free Tier
- ✅ 750 hours/month free
- ✅ Sleeps after 15min inactivity
- ⚠️ First request after sleep takes ~30s

### Render Paid ($7/month)
- ✅ Always-on (no sleep)
- ✅ Faster responses
- ✅ Better for production

**Recommendation**: Start free, upgrade if needed.

## File Structure

```
vedit/
├── render-api/          # Render service (separate deployment)
│   ├── server.js        # Express API server
│   ├── videoProcessor.js # FFmpeg processing logic
│   ├── package.json
│   └── README.md
├── app/api/via/route.ts # Vercel API (calls Render)
└── ...
```

## Next Steps

1. ✅ Deploy Render API
2. ✅ Add `RENDER_API_URL` to Vercel
3. ✅ Test FFmpeg operations
4. ✅ Monitor logs
5. ✅ Upgrade Render tier if needed (optional)

## Support

- **Render Docs**: https://render.com/docs
- **Detailed Guide**: See `render-api/DEPLOYMENT.md`


