# 🚀 VEDIT Production Deployment Checklist

## Pre-Deployment Checklist

### 1. Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

#### Required
- [ ] `MONGODB_URI` - MongoDB Atlas connection string
- [ ] `NEXTAUTH_SECRET` - Random secret (generate with `openssl rand -base64 32`)
- [ ] `NEXTAUTH_URL` - Production URL (e.g., `https://your-app.vercel.app`)
- [ ] `CLOUDINARY_CLOUD_NAME` - Your Cloudinary cloud name
- [ ] `CLOUDINARY_API_KEY` - Cloudinary API key
- [ ] `CLOUDINARY_API_SECRET` - Cloudinary API secret
- [ ] `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` - Same as above (for client-side)
- [ ] `OPENAI_API_KEY` - OpenAI API key

#### Optional
- [ ] `OPENAI_MODEL` - Model to use (default: `gpt-4o`)
- [ ] `GOOGLE_CLIENT_ID` - For Google OAuth
- [ ] `GOOGLE_CLIENT_SECRET` - For Google OAuth

### 2. MongoDB Atlas Configuration

- [ ] Database created
- [ ] User with read/write permissions created
- [ ] IP Whitelist configured:
  - Add `0.0.0.0/0` for Vercel (or specific Vercel IPs)
  - Or use MongoDB Atlas Network Access with VPC peering
- [ ] Connection string tested

### 3. Cloudinary Configuration

- [ ] Account created
- [ ] Upload preset configured (if needed)
- [ ] API keys obtained
- [ ] Upload folder structure: `vedit/` and `vedit/processed/`
- [ ] Test upload successful

### 4. OpenAI Configuration

- [ ] API key created
- [ ] Billing enabled (if needed)
- [ ] Rate limits checked
- [ ] Test API call successful

### 5. Google OAuth (Optional)

- [ ] Google Cloud Console project created
- [ ] OAuth 2.0 credentials created
- [ ] Authorized redirect URIs added:
  - `https://your-app.vercel.app/api/auth/callback/google`
- [ ] Client ID and Secret obtained

## Deployment Steps

### Step 1: Build Locally

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Check for build errors
npm run lint
```

### Step 2: Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Production ready"
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Configure project settings

3. **Add Environment Variables**
   - Add all required env vars from checklist above
   - Set for Production, Preview, and Development

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Check deployment logs for errors

### Step 3: Post-Deployment Verification

#### Test Core Features
- [ ] Sign in with Google OAuth
- [ ] Upload a video
- [ ] Apply color grade
- [ ] Apply effect (test time-based)
- [ ] Generate captions
- [ ] Use Auto-Enhance
- [ ] Apply template
- [ ] Export video

#### Test Error Handling
- [ ] Invalid video format
- [ ] Large file upload (>500MB)
- [ ] Network error simulation
- [ ] Rate limiting (make 20+ requests quickly)

#### Test Performance
- [ ] Page load time < 3 seconds
- [ ] Video processing completes
- [ ] No memory leaks
- [ ] API response times acceptable

### Step 4: Monitoring Setup

#### Recommended Tools
- [ ] **Vercel Analytics** - Enable in Vercel dashboard
- [ ] **Sentry** (optional) - Error tracking
- [ ] **LogRocket** (optional) - Session replay
- [ ] **Uptime monitoring** - UptimeRobot or similar

#### Logs to Monitor
- API error rates
- Video processing failures
- OpenAI API errors
- Cloudinary upload failures
- MongoDB connection issues

### Step 5: Security Hardening

- [ ] **HTTPS Only** - Vercel handles this automatically
- [ ] **CORS** - Configured in Next.js config
- [ ] **Rate Limiting** - Implemented in API routes
- [ ] **Input Validation** - Added to all endpoints
- [ ] **Authentication** - Required for all API routes
- [ ] **API Keys** - Never exposed to client
- [ ] **Error Messages** - Don't expose sensitive info

### Step 6: Performance Optimization

- [ ] **Image Optimization** - Next.js Image component used
- [ ] **Code Splitting** - Automatic with Next.js
- [ ] **CDN** - Cloudinary for video assets
- [ ] **Caching** - Configured for static assets
- [ ] **Bundle Size** - Check and optimize if needed

## Production Configuration

### Vercel Settings

1. **Function Settings**
   - Max Duration: 300 seconds (5 minutes)
   - Memory: 3008 MB (for video processing)
   - Node.js Version: 18.x or 20.x

2. **Build Settings**
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

3. **Environment Variables**
   - Set for Production, Preview, Development
   - Use different values for each if needed

### MongoDB Atlas Settings

1. **Cluster Configuration**
   - M0 (Free) tier is fine for testing
   - M10+ recommended for production

2. **Backup**
   - Enable automated backups
   - Set retention policy

3. **Monitoring**
   - Enable Atlas monitoring
   - Set up alerts for:
     - High CPU usage
     - Connection pool exhaustion
     - Slow queries

## Troubleshooting Common Issues

### Issue: FFmpeg not found on Vercel
**Solution**: Ensure `ffmpeg-static` is in dependencies and check `/tmp` directory permissions

### Issue: Video processing timeout
**Solution**: Increase `maxDuration` in API route config, or use Cloudinary transformations for preview

### Issue: MongoDB connection failed
**Solution**: Check IP whitelist, verify connection string, ensure network access is enabled

### Issue: Cloudinary upload fails
**Solution**: Verify API keys, check upload limits, verify folder permissions

### Issue: OpenAI API errors
**Solution**: Check API key, verify billing, check rate limits

## Post-Launch Tasks

- [ ] Monitor error logs daily for first week
- [ ] Collect user feedback
- [ ] Monitor performance metrics
- [ ] Set up alerts for critical errors
- [ ] Plan for scaling if needed
- [ ] Document any issues found

## Rollback Plan

If deployment fails:

1. **Vercel Rollback**
   - Go to Deployments
   - Click "..." on previous working deployment
   - Select "Promote to Production"

2. **Environment Variables**
   - Check if any new env vars broke things
   - Revert to previous values

3. **Database**
   - MongoDB Atlas has point-in-time recovery
   - Restore if data corruption occurred

## Support

For issues:
1. Check Vercel deployment logs
2. Check MongoDB Atlas logs
3. Check Cloudinary dashboard
4. Review error tracking (Sentry, etc.)

---

**Good luck with your deployment! 🚀**

