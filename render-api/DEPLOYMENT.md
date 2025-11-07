# Render API Deployment Guide

## Quick Start

### 1. Prerequisites

- GitHub account (repository must be connected)
- Render account (free tier works)
- Cloudinary credentials (same as Vercel)

### 2. Deploy to Render

#### Option A: Using Render Dashboard (Recommended)

1. **Go to [Render Dashboard](https://dashboard.render.com)**
2. **Click "New" → "Web Service"**
3. **Connect your GitHub repository**
   - Select your repository
   - Choose the branch (usually `main`)
4. **Configure Service:**
   - **Name**: `vedit-render-api`
   - **Root Directory**: `render-api`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
   - **Node Version**: `18` or `20`
5. **Add Environment Variables:**
   ```
   PORT=3001
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ALLOWED_ORIGINS=https://vedit-theta.vercel.app,https://your-domain.vercel.app
   NODE_ENV=production
   ```
6. **Click "Create Web Service"**
7. **Wait for deployment** (takes 3-5 minutes)

#### Option B: Using render.yaml (Infrastructure as Code)

1. Push your code to GitHub
2. In Render Dashboard → "New" → "Blueprint"
3. Connect repository
4. Render will automatically detect `render.yaml`
5. Review and deploy

### 3. Get Your Render API URL

After deployment, Render will provide a URL like:
```
https://vedit-render-api.onrender.com
```

**Copy this URL** - you'll need it for Vercel configuration.

### 4. Update Vercel Environment Variables

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add:
   ```
   RENDER_API_URL=https://vedit-render-api.onrender.com
   ```
   (Or use `NEXT_PUBLIC_RENDER_API_URL` if you need it client-side)

3. **Redeploy Vercel** for changes to take effect

### 5. Test the Integration

1. **Test Render API Health:**
   ```bash
   curl https://vedit-render-api.onrender.com/health
   ```
   Should return:
   ```json
   {
     "status": "ok",
     "ffmpeg": "available",
     "timestamp": "..."
   }
   ```

2. **Test from Vercel:**
   - Upload a video
   - Try an FFmpeg operation (e.g., "Add captions", "Trim video")
   - Check Vercel logs for "🌐 Using Render API"

## Architecture

```
User Request → Vercel (Frontend + API)
                    ↓
              [FFmpeg needed?]
                    ↓ Yes
              Render API (/process)
                    ↓
              FFmpeg Processing
                    ↓
              Cloudinary Upload
                    ↓
              Return URL to Vercel
                    ↓
              Return to User
```

## FFmpeg Operations Handled by Render

- ✅ `addCaptions` - Generate subtitles
- ✅ `customSubtitle` - Custom subtitle styling
- ✅ `addMusic` - Add music tracks
- ✅ `merge` - Merge multiple clips
- ✅ `trim` - Trim video
- ✅ `removeClip` - Remove segments
- ✅ `addTransition` - Add transitions
- ✅ `generateVoiceover` - Voice generation

## Simple Operations (Still on Vercel)

- Color grading (simple)
- Effects (simple)
- Text overlays (simple)
- Filters (simple)

These can use Cloudinary fallback if needed.

## Monitoring

### Render Logs
- Render Dashboard → Your Service → **Logs**
- Check for FFmpeg initialization messages
- Look for processing success/failure

### Vercel Logs
- Vercel Dashboard → Your Project → **Logs**
- Look for "🌐 Using Render API" messages
- Check for Render API errors

## Troubleshooting

### Issue: Render API not responding

1. **Check Render service status:**
   - Render Dashboard → Is service running?
   - Check if it's sleeping (free tier sleeps after 15min inactivity)

2. **Check environment variables:**
   - Verify all Cloudinary credentials are set
   - Check `ALLOWED_ORIGINS` includes your Vercel domain

3. **Check logs:**
   - Render logs for FFmpeg initialization
   - Vercel logs for API call errors

### Issue: FFmpeg not found on Render

1. **Check Render logs** for FFmpeg initialization
2. **Verify packages installed:**
   - `ffmpeg-static` should be in `package.json`
   - Build logs should show package installation

3. **If still failing:**
   - Render supports system FFmpeg installation
   - Contact Render support for system package installation

### Issue: CORS errors

1. **Update `ALLOWED_ORIGINS`** in Render environment variables
2. **Include all your Vercel domains:**
   ```
   ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
   ```
3. **Redeploy Render service**

### Issue: Slow processing

1. **Render free tier limitations:**
   - Services sleep after 15min inactivity
   - First request after sleep takes ~30s to wake up
   - Consider upgrading to paid tier for always-on

2. **Optimize video size:**
   - Use smaller videos for testing
   - Consider video compression before processing

## Cost Considerations

### Render Free Tier
- ✅ 750 hours/month
- ✅ Sleeps after 15min inactivity
- ✅ Perfect for development/testing

### Render Paid Tier ($7/month)
- ✅ Always-on (no sleep)
- ✅ Faster cold starts
- ✅ Better for production

### Recommendation
- Start with free tier
- Upgrade if you need always-on performance
- Monitor usage in Render Dashboard

## Security

1. **API Key Protection (Optional):**
   - Add `API_KEY` environment variable to Render
   - Update Vercel to send `Authorization` header
   - Validate in Render API middleware

2. **CORS Configuration:**
   - Only allow your Vercel domains
   - Don't use `*` in production

3. **Environment Variables:**
   - Never commit `.env` files
   - Use Render/Vercel environment variable management

## Next Steps

1. ✅ Deploy Render API
2. ✅ Configure Vercel environment variables
3. ✅ Test FFmpeg operations
4. ✅ Monitor logs for issues
5. ✅ Consider upgrading Render tier if needed

## Support

- **Render Docs**: https://render.com/docs
- **Render Support**: support@render.com
- **Check logs**: Always check Render and Vercel logs first


