# Running Illumistream Server Directly (No Docker)

## Prerequisites

### 1. Install Node.js 20+

```bash
# Using NodeSource (recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v20.x.x
npm --version
```

### 2. Install FFmpeg

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg

# Verify installation
ffmpeg -version
```

### 3. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

---

## Quick Start

### 1. Copy server files to your server

```bash
# Create directory
mkdir -p /opt/illumistream
cd /opt/illumistream

# Copy these files:
# - index.js
# - package.json
# - package-lock.json
```

### 2. Install dependencies

```bash
cd /opt/illumistream
npm ci --omit=dev
```

### 3. Test the server

```bash
node index.js
# Should output: 🚀 Illumistream Server running on port 3001
```

### 4. Run with PM2 (Production)

```bash
# Start the server
pm2 start index.js --name illumistream-server

# Save PM2 config (auto-restart on reboot)
pm2 save
pm2 startup

# View logs
pm2 logs illumistream-server

# Monitor
pm2 monit
```

---

## Setting Up HTTPS (Required for Production)

The frontend runs on HTTPS, so WebSocket connections require WSS (secure WebSocket).

### Option A: Caddy (Easiest - Auto HTTPS)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Create `/etc/caddy/Caddyfile`:

```
stream.yourdomain.com {
    reverse_proxy localhost:3001
}
```

```bash
# Reload Caddy
sudo systemctl reload caddy
```

Caddy automatically provisions Let's Encrypt SSL certificates!

### Option B: Nginx + Certbot

```bash
# Install Nginx and Certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/illumistream`:

```nginx
server {
    listen 80;
    server_name stream.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/illumistream /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d stream.yourdomain.com
```

---

## Firewall Setup

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Don't expose 3001 directly (use reverse proxy)
# sudo ufw deny 3001
```

---

## Environment Variables (Optional)

Create `/opt/illumistream/.env`:

```bash
PORT=3001
NODE_ENV=production
```

Update PM2 to use it:

```bash
pm2 delete illumistream-server
pm2 start index.js --name illumistream-server --env production
pm2 save
```

---

## Monitoring & Logs

```bash
# View live logs
pm2 logs illumistream-server

# View last 100 lines
pm2 logs illumistream-server --lines 100

# Monitor CPU/Memory
pm2 monit

# Check status
pm2 status
```

---

## Updating the Server

```bash
cd /opt/illumistream

# Pull new files (or copy manually)
# git pull

# Reinstall dependencies if package.json changed
npm ci --omit=dev

# Restart
pm2 restart illumistream-server
```

---

## Troubleshooting

### "Connection refused" from frontend
- Check server is running: `pm2 status`
- Check firewall: `sudo ufw status`
- Verify reverse proxy is configured

### "WebSocket connection failed"
- Ensure HTTPS is set up (WSS requires SSL)
- Check Nginx/Caddy WebSocket headers are configured
- Test health endpoint: `curl https://stream.yourdomain.com/health`

### "FFmpeg not found"
```bash
which ffmpeg  # Should return /usr/bin/ffmpeg
ffmpeg -version
```

### High CPU usage
- FFmpeg is CPU-intensive
- Each stream destination uses ~1 CPU core
- Consider upgrading server or limiting concurrent streams

### Check what's using port 3001
```bash
sudo lsof -i :3001
sudo netstat -tlnp | grep 3001
```
