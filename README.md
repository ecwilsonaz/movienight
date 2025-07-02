# Movie Night - Advanced Micro Watch Party

Ultra-reliable synchronized video viewing for up to 5 people with real-time monitoring and automatic sync correction.

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
   node server.js
   ```

4. **Share URLs:**
   - **Admin**: `https://yourserver.com/yourslug?admin`
   - **Viewers**: `https://yourserver.com/yourslug`

## 🎬 Features

### **Advanced Sync Technology**
- **Real-time sync monitoring**: Live viewer status reporting every 2 seconds
- **Automatic drift correction**: Detects and fixes sync issues within 5 seconds
- **Network quality adaptation**: Adjusts sync tolerance based on connection quality
- **Multi-layer reliability**: Real-time commands + periodic full state broadcasts
- **Staleness detection**: Clear visibility into connection health

### **Admin Controls**
- **First-come admin protection**: Only one admin at a time, prevents conflicts
- **Admin dashboard**: Press 'V' on server console for real-time viewer status
- **Automatic reconnection**: Admin role reclaiming when admin disconnects
- **Geographic tracking**: See viewer locations and connection quality

### **Viewer Experience**
- **Seamless sync**: Viewers automatically stay in sync with minimal interruption
- **Connection indicators**: Visual feedback on network quality and sync status
- **Buffering detection**: Smart handling of slow connections and loading states
- **Late joiner sync**: New viewers automatically sync to current playback position

## 🌐 Browser Compatibility

### **Recommended Setup (Universal Compatibility)**
- **Video format**: MP4/H.264 for all browsers (Chrome, Safari, Firefox, Edge)
- **Audio format**: AAC
- **Encoding**: H.264 High Profile, 2-5 Mbps bitrate

### **Current Setup (Chrome-Only)**
- **Video format**: WebM (Chrome/Edge only)
- **Limitation**: Safari and Firefox not supported

### **Browser Support by Format**
| Format | Chrome | Safari | Firefox | Edge |
|--------|--------|--------|---------|------|
| **MP4/H.264** | ✅ | ✅ | ✅ | ✅ |
| **WebM** | ✅ | ❌ | ✅ | ✅ |
| **MP4/HEVC** | ⚠️ | ✅ | ❌ | ⚠️ |

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
    location ~* \.(webm|mp4|avi|mov)$ {
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
node server.js

# For production, use process manager:
npm install -g pm2
pm2 start server.js --name movienight
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

### **Role Management**
- **First-come-first-served**: First person to access `?admin` URL becomes admin
- **Protection**: Only one admin at a time, others become viewers
- **Reconnection**: If admin disconnects, admin URL users can reclaim role
- **Notifications**: Clear feedback when admin access is granted/denied

### **Sync Controls**
- **Manual controls**: Play, pause, seek - all broadcast to viewers
- **Automatic monitoring**: Server detects out-of-sync viewers
- **Targeted resync**: Only resyncs viewers who need it
- **Reliability broadcasts**: Full state sync every 10 seconds as backup

## 🛠️ Troubleshooting

### **Video Not Loading**
1. **Check video format**: Use MP4/H.264 for universal compatibility
2. **Test direct access**: Visit `https://yourserver.com/video.mp4` directly
3. **Verify CORS headers**: Check nginx video serving configuration
4. **Check file permissions**: Ensure nginx can read the video file

### **Sync Issues**
1. **Check admin dashboard**: Press 'V' to see viewer sync status
2. **Network quality**: Poor connections get higher sync tolerance
3. **Browser compatibility**: Some browsers handle video events differently
4. **Connection stability**: Unstable connections may show frequent stale reports

### **WebSocket Connection Issues**
1. **Check nginx config**: Ensure WebSocket proxy configuration is correct
2. **Firewall settings**: Verify ports 80/443 are open
3. **SSL certificate**: Ensure valid certificate for WSS connections
4. **Browser console**: Check for connection errors

### **Admin Role Issues**
1. **Multiple admins**: Only one admin allowed, others become viewers
2. **Admin disconnection**: Use admin URL to reclaim role
3. **Clear browser cache**: Old sessions might interfere

## 📋 Requirements

- **Server**: Node.js 18+, nginx (for production)
- **Video**: MP4/H.264 recommended for universal browser support
- **Network**: HTTPS recommended, WebSocket support required
- **Browsers**: Chrome, Safari, Firefox, Edge (with MP4)

## 🔧 Development

### **Local Development**
```bash
# Start with local video file
node server.js
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

# Optimize for streaming
ffmpeg -i input.mkv -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart output.mp4
```

---

**For support or issues**: Check server console output and browser developer tools for detailed error information.