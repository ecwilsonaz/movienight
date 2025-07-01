# Movie Night - Micro Watch Party

Ultra-minimal synchronized video viewing for up to 5 people.

## Quick Setup

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
   - Admin: `https://yourserver.com/yoursslug?admin`
   - Viewers: `https://yourserver.com/yourslug`

## VPS Deployment

### 1. Initial Setup
```bash
# Connect to your VPS
ssh root@YOUR_VPS_IP

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install nginx for video serving
apt update
apt install -y nginx

# Clone repository
git clone https://github.com/ecwilsonaz/movienight.git
cd movienight
npm install
```

### 2. Configure Video Serving
```bash
# Copy your video file to nginx web directory
cp your-video.webm /var/www/html/

# Configure nginx for CORS (required for cross-origin video access)
nano /etc/nginx/sites-available/default
```

Add CORS headers to the nginx configuration:
```nginx
location / {
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Range' always;
    add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range' always;
    
    try_files $uri $uri/ =404;
}
```

```bash
# Test and reload nginx
nginx -t
systemctl reload nginx
systemctl enable nginx
```

### 3. Configure Session
```bash
cp session.example.json session.json
nano session.json
```

Set your configuration:
```json
{
  "videoUrl": "http://YOUR_VPS_IP/your-video.webm",
  "slug": "your-custom-slug",
  "startTime": 0
}
```

### 4. Start Application
```bash
# Open firewall if needed
ufw allow 3000
ufw allow 80

# Start movienight server
node server.js
```

### 5. Access URLs
- **Admin**: `http://YOUR_VPS_IP:3000/your-custom-slug?admin`
- **Viewers**: `http://YOUR_VPS_IP:3000/your-custom-slug`

### Important Notes
- Video must be `.webm` format for Chrome compatibility
- Use Chrome 124+ desktop browsers only (Safari won't work with WebM)
- CORS headers are required when video and app are on different ports
- Test video loads directly at `http://YOUR_VPS_IP/your-video.webm` first

## Requirements

- Node.js 18+
- Video must be publicly accessible `.webm` with CORS headers
- HTTPS recommended for production
- Chrome 124+ desktop browsers only

## Features

- ≤0.5s sync accuracy
- Admin controls (play/pause/seek) broadcast to all viewers
- Automatic drift correction every 3 seconds
- Admin reconnection support
- No database required