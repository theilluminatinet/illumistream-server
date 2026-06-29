# Illumistream Server Deployment Guide

This guide explains how to deploy the Illumistream streaming server on your dedicated server with EasyPanel.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Illumistream App (React)                                 │  │
│  │  - Captures video/audio via getUserMedia                 │  │
│  │  - Records with MediaRecorder                            │  │
│  │  - Sends video chunks via WebSocket                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (video chunks)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Your EasyPanel Server                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Illumistream Server (Node.js + FFmpeg)                   │  │
│  │  - Receives WebSocket connections                         │  │
│  │  - Spawns FFmpeg for each stream destination             │  │
│  │  - Converts WebM → RTMP                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ RTMP streams
                              ▼
        ┌─────────────┬─────────────┬─────────────┐
        │   YouTube   │   Twitch    │    Kick     │
        │   Live      │   Live      │    Live     │
        └─────────────┴─────────────┴─────────────┘
```

## Prerequisites

- A server with EasyPanel installed
- Docker support (included with EasyPanel)
- A domain name (for HTTPS WebSocket connections)

## Deployment Steps

### Option 1: Deploy via EasyPanel UI (Recommended)

1. **Create a new App in EasyPanel**
   - Go to your EasyPanel dashboard
   - Click "Create Service" → "App"
   - Name it `illumistream-server`

2. **Configure the Source**
   - Source Type: Git
   - Repository: Upload this `server` folder to your Git repo
   - Or use "Dockerfile" source and paste the Dockerfile content

3. **Environment Variables**
   ```
   NODE_ENV=production
   PORT=3001
   ```

4. **Port Configuration**
   - Internal Port: 3001
   - Enable HTTPS (required for WebSocket from HTTPS frontend)

5. **Domain Setup**
   - Add a domain like `stream.yourdomain.com`
   - Enable SSL/TLS certificate (Let's Encrypt)

6. **Deploy**
   - Click Deploy and wait for the build to complete

### Option 2: Deploy via Docker Compose

1. **SSH into your server**

2. **Clone/copy the server folder**
   ```bash
   mkdir -p /opt/illumistream
   cd /opt/illumistream
   # Copy server files here
   ```

3. **Build and run**
   ```bash
   docker-compose up -d --build
   ```

4. **Set up reverse proxy (Nginx/Caddy)**
   
   For Caddy (easiest):
   ```
   stream.yourdomain.com {
       reverse_proxy localhost:3001
   }
   ```
   
   For Nginx:
   ```nginx
   server {
       listen 443 ssl http2;
       server_name stream.yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_read_timeout 86400;
       }
   }
   ```

### Option 3: EasyPanel Custom Dockerfile

In EasyPanel, create a new service with this configuration:

**Dockerfile:**
```dockerfile
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
```

## Configuration in Illumistream App

Once deployed, configure your streaming server in the app:

1. Open your Illumistream studio
2. Click the **TV icon** (Stream Settings)
3. Expand **"Streaming Server"**
4. Enter your server URL: `https://stream.yourdomain.com`
5. Add your streaming destinations (YouTube, Twitch, etc.)
6. Enter your stream keys
7. Click **"Go Live"**

## Testing

1. **Health Check**
   ```bash
   curl https://stream.yourdomain.com/health
   # Should return: {"status":"ok","activeStreams":0}
   ```

2. **WebSocket Test**
   - The app will automatically test the connection when you click "Go Live"

## Troubleshooting

### "Connection to streaming server failed"
- Check if the server is running: `docker logs illumistream-server`
- Verify SSL certificate is valid
- Ensure WebSocket upgrade is allowed in your reverse proxy

### "FFmpeg error" in server logs
- Check FFmpeg is installed: `docker exec illumistream-server ffmpeg -version`
- Verify stream key is correct
- Check RTMP server URL for the platform

### High latency
- The default configuration has ~2-5 second latency
- This is normal for RTMP streaming to platforms
- Lower latency requires different protocols (not RTMP)

### Stream stops unexpectedly
- Check server resources (CPU/memory)
- FFmpeg is CPU-intensive; ensure adequate server specs
- Recommended: 2+ CPU cores, 2GB+ RAM per concurrent stream

## Server Requirements

| Concurrent Streams | CPU Cores | RAM    |
|-------------------|-----------|--------|
| 1-2               | 2         | 2 GB   |
| 3-5               | 4         | 4 GB   |
| 5-10              | 8         | 8 GB   |

## Security Notes

1. **Stream Keys**: Stream keys are sent to your server. Ensure HTTPS is enabled.
2. **Authentication**: Consider adding authentication for production use.
3. **Rate Limiting**: Add rate limiting to prevent abuse.

## Advanced: Multi-destination Streaming

The server supports streaming to multiple platforms simultaneously. Each destination spawns a separate FFmpeg process.

Example with 3 destinations:
- YouTube Live
- Twitch
- Kick

All three will receive the same stream content.

## Support

For issues specific to:
- **EasyPanel**: Check EasyPanel documentation
- **FFmpeg**: Check FFmpeg logs in container
- **Stream keys**: Check respective platform's documentation
