const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let sessionConfig = {};
let adminSocket = null;
let connectedClients = new Map(); // Changed to Map to store client info
let currentState = {
  isPlaying: false,
  currentTime: 0,
  lastUpdate: Date.now()
};

// Country code to flag emoji mapping
const flagEmojis = {
  'US': '🇺🇸', 'CA': '🇨🇦', 'GB': '🇬🇧', 'FR': '🇫🇷', 'DE': '🇩🇪', 'IT': '🇮🇹', 'ES': '🇪🇸',
  'AU': '🇦🇺', 'JP': '🇯🇵', 'CN': '🇨🇳', 'IN': '🇮🇳', 'BR': '🇧🇷', 'MX': '🇲🇽', 'RU': '🇷🇺',
  'KR': '🇰🇷', 'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮', 'CH': '🇨🇭',
  'AT': '🇦🇹', 'BE': '🇧🇪', 'IE': '🇮🇪', 'PT': '🇵🇹', 'GR': '🇬🇷', 'PL': '🇵🇱', 'CZ': '🇨🇿',
  'HU': '🇭🇺', 'RO': '🇷🇴', 'BG': '🇧🇬', 'HR': '🇭🇷', 'SI': '🇸🇮', 'SK': '🇸🇰', 'LT': '🇱🇹',
  'LV': '🇱🇻', 'EE': '🇪🇪', 'TR': '🇹🇷', 'IL': '🇮🇱', 'SA': '🇸🇦', 'AE': '🇦🇪', 'EG': '🇪🇬',
  'ZA': '🇿🇦', 'NG': '🇳🇬', 'KE': '🇰🇪', 'MA': '🇲🇦', 'TN': '🇹🇳', 'AR': '🇦🇷', 'CL': '🇨🇱',
  'CO': '🇨🇴', 'PE': '🇵🇪', 'VE': '🇻🇪', 'UY': '🇺🇾', 'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '🇵🇾',
  'TH': '🇹🇭', 'VN': '🇻🇳', 'MY': '🇲🇾', 'SG': '🇸🇬', 'ID': '🇮🇩', 'PH': '🇵🇭', 'TW': '🇹🇼',
  'HK': '🇭🇰', 'NZ': '🇳🇿', 'PK': '🇵🇰', 'BD': '🇧🇩', 'LK': '🇱🇰', 'MM': '🇲🇲', 'KH': '🇰🇭',
  'LA': '🇱🇦', 'NP': '🇳🇵', 'BT': '🇧🇹', 'MN': '🇲🇳', 'KZ': '🇰🇿', 'UZ': '🇺🇿', 'KG': '🇰🇬',
  'TJ': '🇹🇯', 'TM': '🇹🇲', 'AF': '🇦🇫', 'IQ': '🇮🇶', 'IR': '🇮🇷', 'SY': '🇸🇾', 'LB': '🇱🇧',
  'JO': '🇯🇴', 'PS': '🇵🇸', 'KW': '🇰🇼', 'QA': '🇶🇦', 'BH': '🇧🇭', 'OM': '🇴🇲', 'YE': '🇾🇪'
};

async function getGeolocation(ip) {
  return new Promise((resolve) => {
    // Clean IPv6-mapped IPv4 addresses (::ffff:1.2.3.4 -> 1.2.3.4)
    let cleanIP = ip;
    if (ip.startsWith('::ffff:')) {
      cleanIP = ip.substring(7);
    }
    
    // Skip geolocation for localhost/private IPs
    if (cleanIP === '127.0.0.1' || cleanIP === '::1' || cleanIP.startsWith('192.168.') || cleanIP.startsWith('10.') || cleanIP.startsWith('172.')) {
      resolve({ country: 'Local', city: 'Localhost', countryCode: 'LOCAL', flag: '🏠' });
      return;
    }

    const options = {
      hostname: 'ipapi.co',
      port: 443,
      path: `/${cleanIP}/json/`,
      method: 'GET',
      headers: {
        'User-Agent': 'MovieNight/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const geoData = JSON.parse(data);
          resolve({
            country: geoData.country_name || 'Unknown',
            city: geoData.city || 'Unknown', 
            countryCode: geoData.country_code || 'XX',
            flag: flagEmojis[geoData.country_code] || '🌍'
          });
        } catch (e) {
          resolve({ country: 'Unknown', city: 'Unknown', countryCode: 'XX', flag: '🌍' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ country: 'Unknown', city: 'Unknown', countryCode: 'XX', flag: '🌍' });
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ country: 'Unknown', city: 'Unknown', countryCode: 'XX', flag: '🌍' });
    });

    req.end();
  });
}

function loadSessionConfig() {
  try {
    const configData = fs.readFileSync('./session.json', 'utf8');
    sessionConfig = JSON.parse(configData);
    console.log(`Loaded session: ${sessionConfig.slug}`);
  } catch (error) {
    console.error('Error loading session.json:', error.message);
    console.log('Please ensure session.json exists and is valid JSON');
    process.exit(1);
  }
}

function showCurrentViewers() {
  console.log('\n📊 Current Viewers:');
  if (connectedClients.size === 0) {
    console.log('   No viewers connected');
    return;
  }
  
  const clients = Array.from(connectedClients.values());
  clients.forEach((client, index) => {
    const duration = Math.floor((Date.now() - client.connectedAt.getTime()) / 1000);
    const role = client.isAdmin ? '👑 ADMIN' : '👥 VIEWER';
    console.log(`   ${index + 1}. ${role} ${client.geo.flag} ${client.geo.city}, ${client.geo.country} (${duration}s)`);
  });
  console.log('');
}

loadSessionConfig();

app.use(express.static('public'));

app.get(`/${sessionConfig.slug}`, (req, res) => {
  const isAdmin = req.query.admin !== undefined;
  
  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Movie Night</title>
    <style>
        body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        video { max-width: 100%; max-height: 100vh; }
        ${!isAdmin ? 'video::-webkit-media-controls-play-button, video::-webkit-media-controls-start-playback-button { display: none !important; }' : ''}
        ${!isAdmin ? 'video::-webkit-media-controls-timeline { pointer-events: none !important; }' : ''}
        .status { position: fixed; top: 10px; right: 10px; color: white; font-family: monospace; background: rgba(0,0,0,0.7); padding: 5px; }
        ${!isAdmin ? '.viewer-notice { position: fixed; bottom: 10px; left: 10px; color: #888; font-family: monospace; font-size: 12px; }' : ''}
    </style>
</head>
<body>
    <video id="video" controls autoplay muted crossorigin="anonymous">
        <source src="${sessionConfig.videoUrl}" type="video/webm">
    </video>
    <div id="status" class="status">${isAdmin ? 'ADMIN' : 'VIEWER'}</div>
    ${!isAdmin ? '<div class="viewer-notice">Playback controlled by admin</div>' : ''}
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const video = document.getElementById('video');
        const status = document.getElementById('status');
        const originallyAdmin = ${isAdmin}; // Store original admin intent
        let isAdmin = ${isAdmin};
        let lastHeartbeat = Date.now();
        let syncInProgress = false;
        let pendingSync = null;
        let videoReady = false;

        // Video ready detection
        video.addEventListener('loadeddata', () => {
            videoReady = true;
            console.log('Video ready for sync');
            
            // Apply pending sync if we have one
            if (pendingSync) {
                console.log('Applying pending sync...');
                applySync(pendingSync);
                pendingSync = null;
            }
        });

        // Check if video is already ready (in case event fired before listener)
        if (video.readyState >= 2) {
            videoReady = true;
        }

        // Smart sync function with retry mechanism
        function applySync(data, maxRetries = 3) {
            if (!videoReady) {
                console.log('Video not ready, storing sync for later');
                pendingSync = data;
                return;
            }

            let attempts = 0;
            
            const trySync = () => {
                attempts++;
                syncInProgress = true;
                
                console.log(\`Sync attempt \${attempts}: \${data.type} at \${data.currentTime}s\`);
                
                // Apply the sync
                video.currentTime = data.currentTime;
                if (data.type === 'play' || data.isPlaying) {
                    video.play().catch(e => console.log('Play failed:', e));
                } else if (data.type === 'pause' || data.isPlaying === false) {
                    video.pause();
                }
                
                // Check if sync was successful after a brief delay
                setTimeout(() => {
                    const timeDiff = Math.abs(video.currentTime - data.currentTime);
                    
                    if (timeDiff > 1.0 && attempts < maxRetries) {
                        console.log(\`Sync failed (diff: \${timeDiff.toFixed(1)}s), retrying...\`);
                        trySync();
                    } else {
                        syncInProgress = false;
                        if (timeDiff <= 1.0) {
                            console.log(\`Sync successful (diff: \${timeDiff.toFixed(1)}s)\`);
                        } else {
                            console.log(\`Sync gave up after \${attempts} attempts\`);
                        }
                        
                        // Update tracking variables for viewers
                        if (!isAdmin) {
                            lastValidTime = video.currentTime;
                            wasPlaying = !video.paused;
                        }
                    }
                }, 200);
            };
            
            trySync();
        }

        socket.emit('join', { isAdmin, startTime: ${sessionConfig.startTime} });

        // Prevent viewer interactions while preserving volume controls
        if (!isAdmin) {
            let lastValidTime = 0;
            let wasPlaying = false;
            
            video.addEventListener('play', (e) => {
                if (!syncInProgress) {
                    console.log('Viewer attempted to play - blocked');
                    setTimeout(() => {
                        if (wasPlaying) {
                            video.play();
                        } else {
                            video.pause();
                        }
                        video.currentTime = lastValidTime;
                    }, 1);
                }
            });
            
            video.addEventListener('pause', (e) => {
                if (!syncInProgress) {
                    console.log('Viewer attempted to pause - blocked');
                    setTimeout(() => {
                        if (wasPlaying) {
                            video.play();
                        } else {
                            video.pause();
                        }
                        video.currentTime = lastValidTime;
                    }, 1);
                }
            });
            
            video.addEventListener('seeking', (e) => {
                if (!syncInProgress) {
                    console.log('Viewer attempted to seek - blocked');
                    setTimeout(() => {
                        video.currentTime = lastValidTime;
                    }, 1);
                }
            });
            
            video.addEventListener('seeked', (e) => {
                if (!syncInProgress) {
                    video.currentTime = lastValidTime;
                }
            });
            
            // Track legitimate state changes
            video.addEventListener('timeupdate', (e) => {
                if (syncInProgress) {
                    lastValidTime = video.currentTime;
                    wasPlaying = !video.paused;
                }
            });
            
            // Disable context menu to prevent right-click controls
            video.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });
            
            // Disable most keyboard shortcuts but allow volume keys
            video.addEventListener('keydown', (e) => {
                // Allow arrow up/down for volume
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    return; // Allow volume control
                }
                // Block everything else (space, arrow left/right, etc.)
                e.preventDefault();
            });
        }

        if (isAdmin) {
            video.addEventListener('play', () => {
                socket.emit('control', { type: 'play', currentTime: video.currentTime });
            });
            
            video.addEventListener('pause', () => {
                socket.emit('control', { type: 'pause', currentTime: video.currentTime });
            });
            
            video.addEventListener('seeked', () => {
                socket.emit('control', { type: 'seek', currentTime: video.currentTime });
            });

            setInterval(() => {
                if (!video.paused) {
                    socket.emit('heartbeat', { currentTime: video.currentTime });
                }
            }, 3000);
        }

        socket.on('control', (data) => {
            if (!isAdmin && !syncInProgress) {
                console.log('Received admin control:', data.type);
                applySync(data);
            }
        });

        socket.on('heartbeat', (data) => {
            if (!isAdmin && !syncInProgress) {
                const timeDiff = Math.abs(video.currentTime - data.currentTime);
                if (timeDiff > 0.5 && !video.paused) {
                    console.log('Heartbeat sync needed, drift:', timeDiff.toFixed(1) + 's');
                    applySync({ type: 'seek', currentTime: data.currentTime, isPlaying: true });
                }
            }
            lastHeartbeat = Date.now();
        });

        socket.on('syncState', (data) => {
            if (!isAdmin && !syncInProgress) {
                console.log('Late joiner sync received:', data.type, 'at', data.currentTime);
                applySync(data);
            }
        });

        socket.on('adminDenied', (data) => {
            console.log('Admin access denied:', data.reason);
            status.textContent = 'VIEWER - Admin Active';
            
            // Show notification to user
            const notice = document.querySelector('.viewer-notice');
            if (notice) {
                notice.textContent = \`Admin active from \${data.adminLocation}\`;
                notice.style.color = '#ff6b6b';
            }
            
            // Override the isAdmin flag since server denied admin access
            isAdmin = false;
        });

        socket.on('adminGranted', (data) => {
            console.log('Admin access granted:', data.message);
            isAdmin = true;
            status.textContent = 'ADMIN';
            
            // Update notice
            const notice = document.querySelector('.viewer-notice');
            if (notice) {
                notice.textContent = 'You are now the admin';
                notice.style.color = '#4ecdc4';
            }
        });

        socket.on('adminStatus', (data) => {
            if (!isAdmin) {
                status.textContent = data.hasAdmin ? 'VIEWER' : 'VIEWER - No Admin';
                
                // If admin disconnected and this was an admin URL, try to become admin
                if (!data.hasAdmin && originallyAdmin) {
                    console.log('Admin disconnected, attempting to claim admin role...');
                    socket.emit('join', { isAdmin: true, startTime: ${sessionConfig.startTime} });
                }
            } else {
                status.textContent = 'ADMIN';
            }
        });

        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
    </script>
</body>
</html>`;
  
  res.send(html);
});

io.on('connection', async (socket) => {
  const clientIP = socket.handshake.headers['x-forwarded-for'] || 
                   socket.handshake.headers['x-real-ip'] || 
                   socket.handshake.address || 
                   socket.conn.remoteAddress || 
                   '127.0.0.1';
  
  // Clean up IP (take first if multiple)
  const cleanIP = clientIP.split(',')[0].trim();
  
  // Get geolocation
  const geo = await getGeolocation(cleanIP);
  
  // Store client info
  const clientInfo = {
    id: socket.id,
    ip: cleanIP,
    isAdmin: false,
    geo: geo,
    connectedAt: new Date()
  };
  
  connectedClients.set(socket.id, clientInfo);
  
  const viewerCount = connectedClients.size;
  const adminCount = Array.from(connectedClients.values()).filter(c => c.isAdmin).length;
  
  console.log(`🟢 Client connected: ${socket.id.substring(0, 8)}... from ${geo.flag} ${geo.city}, ${geo.country}`);
  console.log(`👥 Total viewers: ${viewerCount} (${adminCount} admin${adminCount !== 1 ? 's' : ''}, ${viewerCount - adminCount} viewer${viewerCount - adminCount !== 1 ? 's' : ''})`);

  socket.on('join', (data) => {
    if (data.isAdmin) {
      // Check if admin slot is already taken by an active connection
      if (adminSocket && adminSocket.connected) {
        // Admin slot is taken - deny admin privileges
        const adminInfo = connectedClients.get(adminSocket.id);
        const clientInfo = connectedClients.get(socket.id);
        
        socket.emit('adminDenied', { 
          reason: 'Admin already active',
          adminLocation: adminInfo ? `${adminInfo.geo.flag} ${adminInfo.geo.city}, ${adminInfo.geo.country}` : 'Unknown location'
        });
        
        console.log(`❌ Admin denied: ${socket.id.substring(0, 8)}... from ${clientInfo ? clientInfo.geo.flag + ' ' + clientInfo.geo.city : 'Unknown'} - slot taken by ${adminSocket.id.substring(0, 8)}...`);
        
        // Continue as regular viewer (don't set isAdmin)
        socket.isAdmin = false;
      } else {
        // No active admin - grant admin privileges
        adminSocket = socket;
        socket.isAdmin = true;
        
        // Update client info
        const clientInfo = connectedClients.get(socket.id);
        if (clientInfo) {
          clientInfo.isAdmin = true;
          console.log(`👑 Admin granted to: ${socket.id.substring(0, 8)}... from ${clientInfo.geo.flag} ${clientInfo.geo.city}, ${clientInfo.geo.country}`);
        }
        
        // Notify client they got admin
        socket.emit('adminGranted', { 
          message: 'You are now the admin' 
        });
      }
    } else {
      // Late joiner sync: send current state to new viewers
      if (adminSocket && currentState.isPlaying) {
        // Calculate current time based on when state was last updated
        const timeSinceUpdate = (Date.now() - currentState.lastUpdate) / 1000;
        const syncTime = currentState.currentTime + timeSinceUpdate;
        
        setTimeout(() => {
          socket.emit('syncState', {
            type: 'play',
            currentTime: syncTime,
            isPlaying: currentState.isPlaying
          });
          console.log('Late joiner sync:', socket.id, 'to time', syncTime);
        }, 1000); // Increased delay for video loading
      } else if (adminSocket && !currentState.isPlaying) {
        setTimeout(() => {
          socket.emit('syncState', {
            type: 'pause',
            currentTime: currentState.currentTime,
            isPlaying: currentState.isPlaying
          });
          console.log('Late joiner sync (paused):', socket.id, 'to time', currentState.currentTime);
        }, 1000);
      }
    }
    
    socket.emit('adminStatus', { hasAdmin: !!adminSocket });
    socket.broadcast.emit('adminStatus', { hasAdmin: !!adminSocket });
  });

  socket.on('control', (data) => {
    if (socket.isAdmin) {
      // Update server state tracking
      currentState.currentTime = data.currentTime;
      currentState.isPlaying = (data.type === 'play');
      currentState.lastUpdate = Date.now();
      
      socket.broadcast.emit('control', data);
      
      const clientInfo = connectedClients.get(socket.id);
      const flag = clientInfo ? clientInfo.geo.flag : '👑';
      console.log(`🎬 Admin control: ${data.type} at ${data.currentTime.toFixed(1)}s ${flag}`);
    }
  });

  socket.on('heartbeat', (data) => {
    if (socket.isAdmin) {
      // Update server state from heartbeat
      currentState.currentTime = data.currentTime;
      currentState.isPlaying = true; // heartbeat only sent when playing
      currentState.lastUpdate = Date.now();
      
      socket.broadcast.emit('heartbeat', data);
    }
  });

  socket.on('disconnect', () => {
    const clientInfo = connectedClients.get(socket.id);
    const wasAdmin = socket === adminSocket;
    
    if (clientInfo) {
      console.log(`🔴 Client disconnected: ${socket.id.substring(0, 8)}... from ${clientInfo.geo.flag} ${clientInfo.geo.city}, ${clientInfo.geo.country}`);
      connectedClients.delete(socket.id);
    } else {
      console.log(`🔴 Client disconnected: ${socket.id.substring(0, 8)}...`);
    }
    
    if (wasAdmin) {
      adminSocket = null;
      io.emit('adminStatus', { hasAdmin: false });
      console.log('👑 Admin slot now available');
    }
    
    const viewerCount = connectedClients.size;
    const adminCount = Array.from(connectedClients.values()).filter(c => c.isAdmin).length;
    console.log(`👥 Total viewers: ${viewerCount} (${adminCount} admin${adminCount !== 1 ? 's' : ''}, ${viewerCount - adminCount} viewer${viewerCount - adminCount !== 1 ? 's' : ''})`);
  });
});

// Add keyboard commands for server management
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (key) => {
  if (key === '\u0003') { // Ctrl+C
    console.log('\n👋 Shutting down server...');
    process.exit();
  } else if (key === 'v' || key === 'V') {
    showCurrentViewers();
  } else if (key === 'h' || key === 'H') {
    console.log('\n⌨️  Keyboard Commands:');
    console.log('   V - Show current viewers');
    console.log('   H - Show this help');
    console.log('   Ctrl+C - Quit server\n');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎬 MovieNight Server Started`);
  console.log(`📡 Running on port ${PORT}`);
  console.log(`🔗 Session URL: http://localhost:${PORT}/${sessionConfig.slug}`);
  console.log(`👑 Admin URL: http://localhost:${PORT}/${sessionConfig.slug}?admin`);
  console.log(`⌨️  Press 'V' to view connected users, 'H' for help`);
  console.log('─'.repeat(60));
});