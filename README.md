# Movie Night - Self-Hosted Watch Party

Synchronized video viewing for 20+ people with real-time monitoring and automatic sync correction. Entirely vibe-coded with Claude Code.

## 🚀 Quick Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure session:**
   ```bash
   cp session.example.json session.json
   ```
   Edit `session.json` with your video URL and custom slug.

3. **Start server:**
   ```bash
   npm start
   ```

4. **Share URLs:**
   - **Admin**: `https://yourserver.com/yourslug?admin`
   - **Viewers**: `https://yourserver.com/yourslug`

## 🎬 Features

- **Real-time sync**: 2-second monitoring with automatic drift correction
- **Admin protection**: First-come admin access, one admin at a time
- **Network adaptation**: Adjusts sync tolerance based on connection quality
- **Live dashboard**: Press 'V' for real-time viewer status and geographic tracking
- **Universal compatibility**: Works across all major browsers and devices
- **Late joiner support**: New viewers automatically sync to current position

## 🌐 Universal Browser Compatibility

> **Recommendation**: Use **desktop browsers** for the best experience. iOS Safari is supported but may experience brief sync adjustments during admin controls.

### **Multi-Format Support (All Browsers)**
The system now automatically detects browser capabilities and serves the optimal video format:

- **Safari**: HEVC → MP4/H.264 → WebM (with autoplay handling)
- **Chrome**: WebM → MP4/H.264 → HEVC
- **Firefox**: MP4/H.264 → WebM
- **Edge**: WebM → MP4/H.264 → HEVC

### **Format Setup Options**

#### **Option 1: Multi-Format (Recommended)**
Configure multiple formats for optimal compatibility:
```json
{
  "videoFormats": {
    "mp4": "https://yourserver.com/video.mp4",
    "webm": "https://yourserver.com/video.webm",
    "hevc": "https://yourserver.com/video-hevc.mp4"
  },
  "slug": "your-slug",
  "startTime": 0
}
```

#### **Option 2: Single Format (Universal)**
Use MP4/H.264 for all browsers:
```json
{
  "videoUrl": "https://yourserver.com/video.mp4",
  "slug": "your-slug", 
  "startTime": 0
}
```

### **Browser Support Matrix**
| Format | Chrome | Safari | Firefox | Edge | Notes |
|--------|--------|--------|---------|------|-------|
| **MP4/H.264** | ✅ | ✅ | ✅ | ✅ | Universal support |
| **WebM** | ✅ | ❌ | ✅ | ✅ | Best compression |
| **MP4/HEVC** | ⚠️ | ✅ | ❌ | ⚠️ | Safari native, others limited |

### **Safari Optimizations**
- Autoplay handling and mobile `playsinline` support
- HEVC format preference for best quality
- iOS-specific sync notifications and guidance

#### **iOS Safari Sync Behavior**
iOS Safari users experience brief sync adjustments during admin controls:
- **Expected behavior**: 5-10 seconds of choppiness when admin pauses/restarts
- **Auto-stabilization**: Settles automatically
- **Manual start required**: Users must tap play and unmute due to autoplay restrictions
- **Best experience**: Use desktop browser for smoother playback

> **Note**: iOS users see a notification with instructions and expectations on page load.

## 🚀 Production Deployment

### 1. VPS Initial Setup
```bash
# Connect to your VPS
ssh root@YOUR_VPS_IP

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install nginx for video serving and SSL
apt update
apt install -y nginx certbot python3-certbot-nginx

# Clone repository
git clone https://github.com/ecwilsonaz/movienight.git
cd movienight
npm install
```

### 2. SSL Domain Setup
```bash
# Configure nginx for your domain
nano /etc/nginx/sites-available/movienight.yourdomain.com
```

**Complete nginx configuration with SSL and WebSocket support:**
```nginx
# WebSocket upgrade mapping
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name movienight.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name movienight.yourdomain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/movienight.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/movienight.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    # Proxy to movienight app with WebSocket support
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket specific settings
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Serve video files directly (for better performance)
    location ~* \.(webm|mp4|avi|mov|mkv)$ {
        root /var/www/html;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Range' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range' always;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable site and get SSL certificate
ln -s /etc/nginx/sites-available/movienight.yourdomain.com /etc/nginx/sites-enabled/
certbot --nginx -d movienight.yourdomain.com
nginx -t && systemctl reload nginx
```

### 3. Video Setup
```bash
# Copy your video file to nginx web directory
cp your-video.mp4 /var/www/html/

# Verify video is accessible
curl -I https://movienight.yourdomain.com/your-video.mp4
```

### 4. Configure Session
```bash
cp session.example.json session.json
nano session.json
```

**Multi-format configuration (recommended):**
```json
{
  "videoFormats": {
    "mp4": "https://movienight.yourdomain.com/your-video.mp4",
    "webm": "https://movienight.yourdomain.com/your-video.webm",
    "hevc": "https://movienight.yourdomain.com/your-video-hevc.mp4"
  },
  "slug": "your-custom-slug",
  "startTime": 0
}
```

**Single format configuration:**
```json
{
  "videoUrl": "https://movienight.yourdomain.com/your-video.mp4",
  "slug": "your-custom-slug",
  "startTime": 0
}
```

### 5. Start Application
```bash
# Open firewall
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable

# Start server (consider using PM2 for production)
npm start

# For production, use process manager:
npm install -g pm2
pm2 start "npm start" --name movienight
pm2 startup
pm2 save
```

## 🎮 Admin Dashboard

**Server Console Commands:**
- **Press 'V'**: View current viewers with real-time sync status
- **Press 'H'**: Show help menu
- **Ctrl+C**: Quit server

**Viewer Status Indicators:**
- **✅**: In sync (fresh report, <2.5s old)
- **❌(X.Xs)**: Out of sync (shows time difference)
- **🔄**: Buffering or loading
- **⏰ Stale (Xs ago)**: No recent report (2.5-6s old)
- **❓ No data (Xs ago)**: Very stale or connection issue (6s+)
- **❓ Never reported**: Viewer hasn't sent any status

**Network Quality Indicators:**
- **🟢**: Excellent connection (<50ms RTT)
- **🟡**: Good connection (<150ms RTT)
- **🟠**: Fair connection (<300ms RTT)
- **🔴**: Poor connection (>300ms RTT)

## 🔧 Admin Features

- **Role Management**: First-come admin access, single admin protection, automatic role reclaiming
- **Sync Controls**: Manual play/pause/seek broadcast, automatic drift detection, targeted resyncing
- **Monitoring**: Real-time viewer status, network quality indicators, geographic tracking

## 🛠️ Troubleshooting

- **Video Not Loading**: Check video format compatibility, test direct URLs, verify CORS/permissions
- **Sync Issues**: Use admin dashboard ('V' key), check network quality, review browser console
- **WebSocket Issues**: Verify nginx config, firewall (ports 80/443), SSL certificate
- **Admin Problems**: Only one admin allowed, use admin URL to reclaim, clear browser cache

## 📋 Requirements

- **Server**: Node.js 18+, nginx (for production)
- **Video**: Multi-format support (MP4/H.264, WebM, HEVC) or single MP4/H.264
- **Network**: HTTPS recommended, WebSocket support required
- **Browsers**: Universal support - Chrome, Safari, Firefox, Edge

## 🔧 Development

### **Local Development**
```bash
# Start server
npm start
# Access: http://localhost:3000/yourslug?admin
```

### **Environment Variables**
```bash
export PORT=3000  # Server port (default: 3000)
```

### **Video Format Conversion**
```bash
# Convert to MP4/H.264 for universal compatibility
ffmpeg -i input.mkv -c:v libx264 -c:a aac -movflags +faststart output.mp4

# Create WebM for Chrome optimization
ffmpeg -i input.mkv -c:v libvpx-vp9 -c:a libopus -b:v 2M -b:a 128k output.webm

# Create HEVC for Safari (macOS/iOS)
ffmpeg -i input.mkv -c:v libx265 -c:a aac -preset medium -crf 28 -movflags +faststart output-hevc.mp4

# Batch convert all formats
ffmpeg -i input.mkv -c:v libx264 -c:a aac -movflags +faststart video.mp4 \
       -c:v libvpx-vp9 -c:a libopus -b:v 2M -b:a 128k video.webm \
       -c:v libx265 -c:a aac -preset medium -crf 28 -movflags +faststart video-hevc.mp4
```

---

**For support or issues**: Check server console output and browser developer tools for detailed error information.