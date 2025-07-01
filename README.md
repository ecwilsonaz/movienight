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

```bash
# On Ubuntu 24.04 VPS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
git clone <your-repo>
cd movienight
npm install
cp session.example.json session.json
# Edit session.json with your video URL
node server.js
```

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