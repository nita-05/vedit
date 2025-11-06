# Testing Render API Health

## Quick Health Check

### Method 1: Browser
Open in your browser:
```
https://vedit-render-api.onrender.com/health
```

You should see:
```json
{
  "status": "ok",
  "ffmpeg": "available",
  "timestamp": "2025-11-06T09:11:29.126Z"
}
```

### Method 2: Command Line (curl)

**Windows (PowerShell/CMD):**
```bash
curl https://vedit-render-api.onrender.com/health
```

**Mac/Linux:**
```bash
curl https://vedit-render-api.onrender.com/health
```

**With pretty JSON:**
```bash
curl https://vedit-render-api.onrender.com/health | python -m json.tool
```

### Method 3: Postman / Insomnia

1. Create new GET request
2. URL: `https://vedit-render-api.onrender.com/health`
3. Send request
4. Should return JSON with status

### Method 4: JavaScript/Node.js

```javascript
fetch('https://vedit-render-api.onrender.com/health')
  .then(res => res.json())
  .then(data => console.log(data))
```

### Method 5: Browser Console

Open browser console (F12) and run:
```javascript
fetch('https://vedit-render-api.onrender.com/health')
  .then(res => res.json())
  .then(data => console.log('Health:', data))
```

## Expected Response

✅ **Healthy:**
```json
{
  "status": "ok",
  "ffmpeg": "available",
  "timestamp": "2025-11-06T09:11:29.126Z"
}
```

❌ **FFmpeg Not Available:**
```json
{
  "status": "ok",
  "ffmpeg": "not found",
  "timestamp": "2025-11-06T09:11:29.126Z"
}
```

## Troubleshooting

### Service Sleeping (Free Tier)
If service is sleeping, first request takes ~30 seconds:
- Wait for response
- Or upgrade to paid tier for always-on

### CORS Error
If testing from browser, CORS might block:
- Use curl/Postman instead
- Or check `ALLOWED_ORIGINS` in Render env vars

### Connection Refused
- Check if service is running in Render dashboard
- Check service logs for errors
- Verify URL is correct

