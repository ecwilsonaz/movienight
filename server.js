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
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

let sessionConfig = {};
let adminSocket = null;
let connectedClients = new Map(); // Changed to Map to store client info
let currentState = {
  isPlaying: false,
  currentTime: 0,
  lastUpdate: Date.now()
};
let syncCommands = new Map(); // Track pending sync commands
let viewerStates = new Map(); // Track viewer playback states

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
    
    // Validate configuration
    if (sessionConfig.videoFormats) {
      const formats = Object.keys(sessionConfig.videoFormats);
      console.log(`Loaded session: ${sessionConfig.slug} with formats: ${formats.join(', ')}`);
    } else if (sessionConfig.videoUrl) {
      console.log(`Loaded session: ${sessionConfig.slug} with single video: ${sessionConfig.videoUrl}`);
    } else {
      throw new Error('No video configuration found (need videoFormats or videoUrl)');
    }
  } catch (error) {
    console.error('Error loading session.json:', error.message);
    console.log('Please ensure session.json exists and is valid JSON');
    console.log('Required format: {"videoFormats": {"mp4": "url"}, "slug": "name", "startTime": 0}');
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
    
    // Network quality indicator
    const networkEmojis = {
      'excellent': '🟢',
      'good': '🟡', 
      'fair': '🟠',
      'poor': '🔴'
    };
    const networkIndicator = networkEmojis[client.networkQuality] || '⚪';
    const rttText = client.lastRTT ? `${client.lastRTT}ms` : 'measuring...';
    
    // Sync status for viewers (staleness-aware)
    let syncStatus = '';
    if (!client.isAdmin) {
      const viewerState = viewerStates.get(client.id);
      if (viewerState) {
        const reportAge = (Date.now() - viewerState.lastUpdate) / 1000;
        
        if (reportAge > 6) {
          // Very stale data
          syncStatus = ` ❓ No data (${Math.floor(reportAge)}s ago)`;
        } else if (reportAge > 2.5) {
          // Stale data (don't show sync status for old reports)
          syncStatus = ` ⏰ Stale (${Math.floor(reportAge)}s ago)`;
        } else {
          // Fresh data - show actual sync status
          if (viewerState.buffering) {
            syncStatus = ' 🔄';
          } else {
            // Simple check: same play state and account for server state progression
            const playSync = viewerState.isPlaying === currentState.isPlaying;
            
            // Account for time progression since last server state update
            let expectedServerTime = currentState.currentTime;
            if (currentState.isPlaying) {
              const timeSinceServerUpdate = (Date.now() - currentState.lastUpdate) / 1000;
              expectedServerTime = currentState.currentTime + timeSinceServerUpdate;
            }
            
            const timeDiff = Math.abs(viewerState.currentTime - expectedServerTime);
            const tolerance = viewerState.networkQuality === 'poor' ? 10.0 : 
                             viewerState.networkQuality === 'fair' ? 8.0 : 5.0;
            
            if (timeDiff <= tolerance && playSync) {
              syncStatus = ' ✅';
            } else {
              syncStatus = ` ❌(${timeDiff.toFixed(1)}s)`;
            }
          }
        }
      } else {
        syncStatus = ' ❓ Never reported';
      }
    }
    
    const browserInfo = client.browser && client.videoFormat ? ` [${client.browser}/${client.videoFormat}]` : '';
    console.log(`   ${index + 1}. ${role} ${networkIndicator} ${client.geo.flag} ${client.geo.city}, ${client.geo.country}${browserInfo} (${duration}s, ${rttText})${syncStatus}`);
  });
  
  // Summary with staleness awareness
  const viewers = clients.filter(c => !c.isAdmin);
  let freshInSync = 0;
  let staleReports = 0;
  let veryStale = 0;
  let neverReported = 0;
  
  viewers.forEach(c => {
    const state = viewerStates.get(c.id);
    if (!state) {
      neverReported++;
      return;
    }
    
    const reportAge = (Date.now() - state.lastUpdate) / 1000;
    
    if (reportAge > 6) {
      veryStale++;
    } else if (reportAge > 2.5) {
      staleReports++;
    } else {
      // Fresh data - check sync status
      const playSync = state.isPlaying === currentState.isPlaying;
      
      // Account for time progression since last server state update
      let expectedServerTime = currentState.currentTime;
      if (currentState.isPlaying) {
        const timeSinceServerUpdate = (Date.now() - currentState.lastUpdate) / 1000;
        expectedServerTime = currentState.currentTime + timeSinceServerUpdate;
      }
      
      const timeDiff = Math.abs(state.currentTime - expectedServerTime);
      const tolerance = state.networkQuality === 'poor' ? 10.0 : 
                       state.networkQuality === 'fair' ? 8.0 : 5.0;
      
      if (timeDiff <= tolerance && playSync && !state.buffering) {
        freshInSync++;
      }
    }
  });
  
  if (viewers.length > 0) {
    let summary = `\n   Sync Status: ${freshInSync}/${viewers.length} confirmed in sync`;
    if (staleReports > 0) summary += `, ${staleReports} stale`;
    if (veryStale > 0) summary += `, ${veryStale} no recent data`;
    if (neverReported > 0) summary += `, ${neverReported} never reported`;
    console.log(summary);
  }
  console.log('');
}

loadSessionConfig();

app.use(express.static('public'));

// Browser detection function
function detectBrowser(userAgent) {
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('safari') && !ua.includes('chrome')) {
    // Detect iOS Safari vs desktop Safari
    if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('ipad')) {
      return 'ios-safari';
    }
    return 'safari';
  } else if (ua.includes('firefox')) {
    return 'firefox';
  } else if (ua.includes('edge')) {
    return 'edge';
  } else if (ua.includes('chrome')) {
    return 'chrome';
  }
  return 'unknown';
}

// Get optimal video format for browser
function getOptimalVideoFormat(browser, videoFormats) {
  // Format priority by browser
  const formatPriority = {
    'ios-safari': ['hevc', 'mp4', 'webm'], // iOS Safari: HEVC excellent on modern iOS
    safari: ['hevc', 'mp4', 'webm'],       // Desktop Safari: HEVC preferred
    chrome: ['webm', 'mp4', 'hevc'],       // Chrome prefers WebM
    firefox: ['webm', 'mp4'],              // Firefox doesn't support HEVC
    edge: ['mp4', 'webm', 'hevc'],         // Edge prefers H.264
    unknown: ['mp4', 'webm']               // Default to universal H.264
  };
  
  const priorities = formatPriority[browser] || formatPriority.unknown;
  
  for (const format of priorities) {
    if (videoFormats[format]) {
      return {
        url: videoFormats[format],
        format: format,
        mimeType: format === 'hevc' ? 'video/mp4; codecs="hvc1"' :
                  format === 'mp4' ? 'video/mp4' : 'video/webm'
      };
    }
  }
  
  // Fallback to first available format
  const firstFormat = Object.keys(videoFormats)[0];
  return {
    url: videoFormats[firstFormat],
    format: firstFormat,
    mimeType: firstFormat === 'webm' ? 'video/webm' : 'video/mp4'
  };
}

app.get(`/${sessionConfig.slug}`, (req, res) => {
  const isAdmin = req.query.admin !== undefined;
  const userAgent = req.headers['user-agent'] || '';
  const browser = detectBrowser(userAgent);
  
  // Support both old videoUrl format and new videoFormats
  let videoFormats = sessionConfig.videoFormats;
  if (!videoFormats && sessionConfig.videoUrl) {
    // Backward compatibility: convert old format
    const ext = sessionConfig.videoUrl.split('.').pop();
    videoFormats = { [ext]: sessionConfig.videoUrl };
  }
  
  const optimalVideo = getOptimalVideoFormat(browser, videoFormats);
  
  console.log(`🎥 ${browser} client requested ${sessionConfig.slug}, serving ${optimalVideo.format} format`);
  console.log(`📱 User-Agent: ${userAgent}`);
  console.log(`🎬 Available formats: ${Object.keys(videoFormats).join(', ')}`);
  
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
    <video id="video" controls ${browser === 'safari' || browser === 'ios-safari' ? 'playsinline' : ''} muted crossorigin="anonymous" preload="auto">
        ${(() => {
          // Generate sources in browser priority order
          const formatPriority = {
            'ios-safari': ['hevc', 'mp4', 'webm'],
            safari: ['hevc', 'mp4', 'webm'],
            chrome: ['webm', 'mp4', 'hevc'],
            firefox: ['mp4', 'webm'],
            edge: ['webm', 'mp4', 'hevc'],
            unknown: ['mp4', 'webm']
          };
          
          const priorities = formatPriority[browser] || formatPriority.unknown;
          const sources = [];
          
          // Add sources in priority order
          for (const format of priorities) {
            if (videoFormats[format]) {
              const mimeType = format === 'hevc' ? 'video/mp4; codecs="hvc1"' :
                              format === 'mp4' ? 'video/mp4' : 'video/webm';
              sources.push(`<source src="${videoFormats[format]}" type="${mimeType}">`);
            }
          }
          
          return sources.join('\n        ');
        })()}
        <p>Your browser doesn't support any of the available video formats.</p>
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
        
        // Browser detection
        const browser = '${browser}';
        const isSafari = browser === 'safari' || browser === 'ios-safari';
        const isIOSSafari = browser === 'ios-safari';
        const optimalFormat = '${optimalVideo.format}';
        
        console.log(\`Browser: \${browser}, optimal format: \${optimalFormat}\`);
        
        // Network quality adaptation
        let networkQuality = 'good'; // excellent, good, fair, poor
        let currentRTT = 100; // milliseconds
        let rttHistory = [];
        let pingInterval = null;
        
        // Network quality hysteresis to prevent rapid changes
        let networkQualityChangeCount = 0;
        let networkQualityPending = null;

        // Network quality measurement and adaptation
        function measureNetworkQuality() {
            const pingStart = Date.now();
            socket.emit('ping', { timestamp: pingStart });
        }

        function updateNetworkQuality(rtt) {
            currentRTT = rtt;
            rttHistory.push(rtt);
            
            // Keep only last 10 measurements
            if (rttHistory.length > 10) {
                rttHistory.shift();
            }
            
            // Calculate average RTT
            const avgRTT = rttHistory.reduce((a, b) => a + b, 0) / rttHistory.length;
            
            // Classify connection quality with hysteresis to prevent rapid changes
            const oldQuality = networkQuality;
            let newQuality;
            
            // iOS Safari gets more generous thresholds due to mobile network characteristics
            if (isIOSSafari) {
                if (avgRTT < 80) {
                    newQuality = 'excellent';
                } else if (avgRTT < 200) {
                    newQuality = 'good';
                } else if (avgRTT < 400) {
                    newQuality = 'fair';
                } else {
                    newQuality = 'poor';
                }
            } else {
                // Desktop thresholds
                if (avgRTT < 50) {
                    newQuality = 'excellent';
                } else if (avgRTT < 150) {
                    newQuality = 'good';
                } else if (avgRTT < 300) {
                    newQuality = 'fair';
                } else {
                    newQuality = 'poor';
                }
            }
            
            // Apply hysteresis: require sustained change for 2 measurements
            if (newQuality !== networkQuality) {
                if (!networkQualityChangeCount) {
                    networkQualityChangeCount = 1;
                    networkQualityPending = newQuality;
                } else if (networkQualityPending === newQuality) {
                    networkQualityChangeCount++;
                    if (networkQualityChangeCount >= 2) {
                        networkQuality = newQuality;
                        networkQualityChangeCount = 0;
                        networkQualityPending = null;
                    }
                } else {
                    // Different change detected, reset counter
                    networkQualityChangeCount = 1;
                    networkQualityPending = newQuality;
                }
            } else {
                // Same quality, reset change tracking
                networkQualityChangeCount = 0;
                networkQualityPending = null;
            }
            
            // Update UI if quality changed
            if (oldQuality !== networkQuality) {
                updateConnectionIndicator();
                console.log(\`Network quality: \${networkQuality} (RTT: \${avgRTT.toFixed(0)}ms)\`);
            }
        }

        function getAdaptiveSettings() {
            // Base settings for desktop browsers
            let settings;
            switch (networkQuality) {
                case 'excellent':
                    settings = { 
                        tolerance: 0.3, 
                        maxRetries: 1, 
                        heartbeatInterval: 3000,
                        syncDelay: 800 
                    };
                    break;
                case 'good':
                    settings = { 
                        tolerance: 0.5, 
                        maxRetries: 2, 
                        heartbeatInterval: 3000,
                        syncDelay: 1000 
                    };
                    break;
                case 'fair':
                    settings = { 
                        tolerance: 1.0, 
                        maxRetries: 3, 
                        heartbeatInterval: 2000,
                        syncDelay: 1500 
                    };
                    break;
                case 'poor':
                    settings = { 
                        tolerance: 2.0, 
                        maxRetries: 5, 
                        heartbeatInterval: 1000,
                        syncDelay: 2000 
                    };
                    break;
                default:
                    settings = { 
                        tolerance: 0.5, 
                        maxRetries: 3, 
                        heartbeatInterval: 3000,
                        syncDelay: 1000 
                    };
            }

            // iOS Safari adjustments: much higher tolerance for natural timing variations
            if (isIOSSafari) {
                settings = {
                    tolerance: Math.max(settings.tolerance * 4, 3.5),    // Much higher tolerance for iOS natural timing variations
                    maxRetries: Math.max(settings.maxRetries - 1, 1),    // Fewer retries to reduce choppiness
                    heartbeatInterval: settings.heartbeatInterval + 1500, // Less frequent status reports
                    syncDelay: settings.syncDelay + 800                  // Longer delays for iOS video pipeline
                };
                
                // Buffer-aware tolerance scaling: increase tolerance when buffer is low
                const bufferHealth = getBufferHealth();
                if (!bufferHealth.healthy && bufferHealth.bufferAhead < MIN_SAFE_BUFFER) {
                    const bufferMultiplier = Math.max(1.5, (MIN_SAFE_BUFFER - bufferHealth.bufferAhead) / 2);
                    settings.tolerance = settings.tolerance * bufferMultiplier;
                    console.log('iOS Safari: Buffer-aware tolerance scaling (x' + bufferMultiplier.toFixed(1) + ') - tolerance now ' + settings.tolerance.toFixed(1) + 's');
                }
                
                console.log('iOS Safari: Using relaxed sync settings (tolerance: ' + settings.tolerance.toFixed(1) + 's, maxRetries: ' + settings.maxRetries + ')');
            }

            return settings;
        }

        function updateConnectionIndicator() {
            const qualityEmojis = {
                'excellent': '🟢',
                'good': '🟡', 
                'fair': '🟠',
                'poor': '🔴'
            };
            
            const indicator = qualityEmojis[networkQuality] || '⚪';
            status.textContent = (isAdmin ? 'ADMIN' : 'VIEWER') + ' ' + indicator;
        }

        // Safari-specific autoplay handling
        if (isSafari) {
            // Safari requires user interaction for autoplay, even when muted
            video.addEventListener('canplaythrough', () => {
                if (!isAdmin) {
                    // For Safari viewers, we'll handle autoplay more carefully
                    video.muted = true;
                }
            });
        }

        // Video ready detection with Safari-specific handling
        video.addEventListener('loadeddata', () => {
            videoReady = true;
            console.log(\`Video ready for sync (format: \${optimalFormat})\`);
            
            // Safari-specific initialization
            if (isSafari && !isAdmin) {
                // Ensure Safari viewers start muted and ready
                video.muted = true;
                video.currentTime = ${sessionConfig.startTime || 0};
            }
            
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

        // Smart sync function with adaptive retry mechanism
        function applySync(data, customSettings = null) {
            if (!videoReady) {
                console.log('Video not ready, storing sync for later');
                pendingSync = data;
                return;
            }
            
            // iOS Safari buffer awareness - delay sync based on buffer health
            if (isIOSSafari) {
                const bufferHealth = getBufferHealth();
                if (!bufferHealth.healthy) {
                    console.log('iOS Safari: Delaying sync - buffer ' + bufferHealth.reason + ' (' + bufferHealth.bufferAhead.toFixed(1) + 's ahead)');
                    setTimeout(() => applySync(data, customSettings), 500);
                    return;
                }
            }
            
            // iOS Safari power management - delay sync if suspended (with emergency override)
            if (isIOSSafari && typeof videoSuspended !== 'undefined' && videoSuspended) {
                // Emergency override: if drift is extreme (>15s), force sync anyway
                const currentTime = video.currentTime || 0;
                const timeDiff = Math.abs(data.currentTime - currentTime);
                
                if (timeDiff > 15) {
                    console.log(\`iOS Safari: EMERGENCY SYNC - forcing through suspension (drift: \${timeDiff.toFixed(1)}s)\`);
                    clearSuspensionState('emergency-override');
                    // Continue with sync below
                } else {
                    console.log('iOS Safari: Delaying sync - video suspended by power management');
                    setTimeout(() => applySync(data, customSettings), 1000);
                    return;
                }
            }
            
            // iOS Safari ready state check - ensure video is ready for operations
            if (isIOSSafari && video.readyState < 2) {
                console.log(\`iOS Safari: Delaying sync - low ready state (\${video.readyState})\`);
                setTimeout(() => applySync(data, customSettings), 300);
                return;
            }

            let settings = customSettings || getAdaptiveSettings();
            let attempts = 0;
            
            // Special handling for iOS Safari unpause: reduce retries to minimize choppiness
            const isUnpauseTransition = video.paused && (data.type === 'play' || data.isPlaying);
            if (isIOSSafari && isUnpauseTransition) {
                settings = {
                    ...settings,
                    maxRetries: 1,  // Only one retry for unpause to prevent stuttering
                    tolerance: Math.max(settings.tolerance, 4.0)  // Higher tolerance for unpause timing variations
                };
                console.log('iOS Safari unpause: using reduced retry settings');
                
                // Additional buffer check for unpause
                if (video.buffered.length > 0) {
                    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                    const bufferAhead = bufferedEnd - data.currentTime;
                    if (bufferAhead < 2) {
                        console.log(\`iOS Safari unpause: Low buffer (\${bufferAhead.toFixed(1)}s) - increasing tolerance\`);
                        settings.tolerance = Math.max(settings.tolerance, 2.0);
                    }
                }
            }
            
            const trySync = () => {
                attempts++;
                syncInProgress = true;
                
                console.log(\`Sync attempt \${attempts}/\${settings.maxRetries}: \${data.type} at \${data.currentTime}s (\${networkQuality})\`);
                
                // Apply the sync with iOS Safari-specific handling
                const applyVideoChanges = () => {
                    // Detect if this is an unpause transition (was paused, now playing)
                    const isUnpauseTransition = video.paused && (data.type === 'play' || data.isPlaying);
                    
                    if (isIOSSafari && isUnpauseTransition) {
                        // iOS Safari: separate seek and play for smooth unpause
                        console.log('iOS Safari unpause: separating seek and play operations');
                        
                        // Step 1: Pre-position slightly behind target to allow smooth transition
                        const targetTime = data.currentTime;
                        const prepTime = Math.max(targetTime - 0.1, 0); // 100ms earlier, but not negative
                        video.currentTime = prepTime;
                        
                        // Clear syncInProgress immediately for iOS Safari to prevent seek blocking
                        syncInProgress = false;
                        
                        // Step 2: Wait for seek to settle, then fine-tune position and play
                        setTimeout(() => {
                            // Fine-tune to exact position after pre-positioning
                            video.currentTime = targetTime;
                            
                            // Step 3: Start playback
                            const playPromise = video.play();
                            if (playPromise !== undefined) {
                                playPromise.catch(e => {
                                    if (e.name === 'NotAllowedError') {
                                        console.log('iOS Safari unpause requires user interaction for autoplay');
                                        showSafariPlayButton();
                                    } else {
                                        console.log('iOS Safari unpause play failed:', e);
                                    }
                                });
                            }
                        }, 120); // Allow seek to settle before playing
                    } else {
                        // Standard sync logic for other browsers or non-unpause operations
                        video.currentTime = data.currentTime;
                        
                        if (data.type === 'play' || data.isPlaying) {
                            // Safari may need user interaction for first play
                            const playPromise = video.play();
                            if (playPromise !== undefined) {
                                playPromise.catch(e => {
                                    if (isSafari && e.name === 'NotAllowedError') {
                                        console.log('Safari requires user interaction for autoplay');
                                        // Show a play button overlay for Safari users
                                        showSafariPlayButton();
                                    } else {
                                        console.log('Play failed:', e);
                                    }
                                });
                            }
                        } else if (data.type === 'pause' || data.isPlaying === false) {
                            video.pause();
                        }
                    }
                    
                    // Clear syncInProgress immediately after video operations to prevent seek blocking
                    syncInProgress = false;
                };

                // iOS Safari needs longer delays for video pipeline processing
                if (isIOSSafari) {
                    // Reduced delay - modern iOS handles video operations faster
                    setTimeout(applyVideoChanges, 75);
                } else {
                    applyVideoChanges();
                }
                
                // Check if sync was successful after a brief delay (optimized for iOS)
                const checkDelay = isIOSSafari ? 250 : 200;
                setTimeout(() => {
                    const timeDiff = Math.abs(video.currentTime - data.currentTime);
                    
                    if (timeDiff > settings.tolerance && attempts < settings.maxRetries) {
                        console.log('Sync failed (diff: ' + timeDiff.toFixed(1) + 's > ' + settings.tolerance + 's), retrying...');
                        trySync();
                    } else {
                        if (timeDiff <= settings.tolerance) {
                            console.log('Sync successful (diff: ' + timeDiff.toFixed(1) + 's)');
                        } else {
                            console.log('Sync gave up after ' + attempts + ' attempts (final diff: ' + timeDiff.toFixed(1) + 's)');
                        }
                        
                        // Update tracking variables for viewers
                        if (!isAdmin) {
                            lastValidTime = video.currentTime;
                            wasPlaying = !video.paused;
                        }
                    }
                }, checkDelay);
            };
            
            trySync();
        }

        // Safari play button helper
        function showSafariPlayButton() {
            if (!document.getElementById('safari-play-overlay')) {
                const overlay = document.createElement('div');
                overlay.id = 'safari-play-overlay';
                overlay.style.cssText = \`
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                    color: white;
                    font-family: sans-serif;
                    cursor: pointer;
                \`;
                overlay.innerHTML = '<div style="text-align: center;"><div style="font-size: 48px;">▶️</div><div>Tap to enable video playback</div></div>';
                
                overlay.addEventListener('click', () => {
                    video.play().then(() => {
                        overlay.remove();
                    }).catch(e => console.log('Manual play failed:', e));
                });
                
                document.body.appendChild(overlay);
                
                // Auto-remove after 10 seconds
                setTimeout(() => {
                    if (overlay.parentNode) overlay.remove();
                }, 10000);
            }
        }

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
            
            // Throttled seek blocking to prevent iOS Safari feedback loop
            let seekBlockTimer = null;
            let lastSeekBlock = 0;
            const SEEK_BLOCK_COOLDOWN = 100; // Max once per 100ms
            
            video.addEventListener('seeking', (e) => {
                if (!syncInProgress) {
                    const now = Date.now();
                    
                    // Throttle seek blocking to prevent feedback loop
                    if (now - lastSeekBlock < SEEK_BLOCK_COOLDOWN) {
                        return; // Skip this event to break the loop
                    }
                    
                    // Clear any pending seek block
                    if (seekBlockTimer) {
                        clearTimeout(seekBlockTimer);
                    }
                    
                    lastSeekBlock = now;
                    
                    // iOS Safari-specific handling
                    if (isIOSSafari) {
                        // Reduce logging for iOS Safari to improve performance
                        if (Math.random() < 0.001) { // Log only 0.1% of events
                            console.log('iOS Safari seek blocked (throttled)');
                        }
                    } else {
                        console.log('Viewer attempted to seek - blocked');
                    }
                    
                    seekBlockTimer = setTimeout(() => {
                        video.currentTime = lastValidTime;
                        seekBlockTimer = null;
                    }, 10); // Slightly longer delay to let iOS Safari settle
                }
            });
            
            // Seeked event handling (fires once vs seeking's continuous firing)
            let seekedBlockTimer = null;
            
            video.addEventListener('seeked', (e) => {
                if (!syncInProgress) {
                    // Clear any pending seeked block to prevent accumulation
                    if (seekedBlockTimer) {
                        clearTimeout(seekedBlockTimer);
                    }
                    
                    // iOS Safari: Use seeked event as backup to seeking
                    seekedBlockTimer = setTimeout(() => {
                        video.currentTime = lastValidTime;
                        seekedBlockTimer = null;
                    }, 5); // Short delay for iOS Safari
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

        // Buffer state monitoring (iOS Safari specific issues)
        let isBuffering = false;
        let bufferStartTime = null;
        let lastBufferEndTime = null;
        const BUFFER_GRACE_PERIOD = 2000; // 2 seconds after buffering ends
        const MIN_SAFE_BUFFER = 2.5; // Minimum buffer ahead for safe syncing
        
        // Buffer health assessment for iOS Safari
        function getBufferHealth() {
            if (!isIOSSafari || video.buffered.length === 0) {
                return { healthy: true, bufferAhead: 0, reason: 'no-buffer-data' };
            }
            
            const currentTime = video.currentTime;
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            const bufferAhead = bufferedEnd - currentTime;
            
            // Check if we're in grace period after buffering
            const inGracePeriod = lastBufferEndTime && (Date.now() - lastBufferEndTime < BUFFER_GRACE_PERIOD);
            
            const healthy = bufferAhead >= MIN_SAFE_BUFFER && !inGracePeriod && !isBuffering;
            
            return {
                healthy,
                bufferAhead,
                inGracePeriod,
                isBuffering,
                reason: !healthy ? (isBuffering ? 'actively-buffering' : 
                                   inGracePeriod ? 'grace-period' : 'low-buffer') : 'healthy'
            };
        }
        
        video.addEventListener('waiting', (e) => {
            if (!isBuffering) {
                isBuffering = true;
                bufferStartTime = Date.now();
                console.log(\`📡 Video buffering started (\${browser})\`);
                
                // Update status to show buffering
                if (isIOSSafari) {
                    status.textContent = (isAdmin ? 'ADMIN' : 'VIEWER') + ' 🔄';
                }
            }
        });
        
        video.addEventListener('canplay', (e) => {
            if (isBuffering) {
                const bufferDuration = Date.now() - bufferStartTime;
                isBuffering = false;
                lastBufferEndTime = Date.now(); // Track when buffering ended for grace period
                console.log('✅ Video buffering ended after ' + bufferDuration + 'ms (' + browser + ')');
                
                // Restore normal status indicator
                if (isIOSSafari) {
                    updateConnectionIndicator();
                }
            }
            
            // Resume sync operations after suspension
            if (isIOSSafari && typeof clearSuspensionState !== 'undefined') {
                clearSuspensionState('canplay');
            }
        });
        
        video.addEventListener('stalled', (e) => {
            console.log(\`⚠️ Video stalled - network issues detected (\${browser})\`);
            
            // iOS Safari may need special handling for stalled playback
            if (isIOSSafari && !video.paused) {
                console.log('iOS Safari: Attempting to recover from stalled playback');
                // Don't auto-retry immediately - let iOS handle it
            }
        });
        
        // Power management events (iOS Safari background/foreground handling)
        let videoSuspended = false;
        let suspendedTimestamp = null;
        let suspensionRecoveryTimer = null;
        
        // Debouncing for iOS Safari power management cycling
        let suspendDebounceTimer = null;
        let lastSuspendTime = 0;
        let suspendEventCount = 0;
        const SUSPEND_DEBOUNCE_WINDOW = 2000; // 2 second window
        const MIN_SUSPEND_DURATION = 500; // Ignore suspensions shorter than 500ms
        
        function clearSuspensionState(reason) {
            if (videoSuspended) {
                const suspendDuration = suspendedTimestamp ? Date.now() - suspendedTimestamp : 0;
                videoSuspended = false;
                suspendedTimestamp = null;
                if (suspensionRecoveryTimer) {
                    clearTimeout(suspensionRecoveryTimer);
                    suspensionRecoveryTimer = null;
                }
                console.log('iOS Safari: Video suspension cleared (' + reason + ') after ' + suspendDuration + 'ms');
            }
            
            // Also cancel any pending debounced suspension
            if (suspendDebounceTimer) {
                clearTimeout(suspendDebounceTimer);
                suspendDebounceTimer = null;
                console.log('iOS Safari: Cancelled pending suspension due to recovery');
            }
        }
        
        function debouncedSuspend() {
            if (!isIOSSafari) return;
            
            // Actually suspend operations after debounce period
            if (!videoSuspended) {
                videoSuspended = true;
                suspendedTimestamp = Date.now();
                console.log('iOS Safari: Video loading suspended (debounced), pausing sync operations');
                
                // Set recovery timeout - force resume after 5 seconds if no recovery event
                if (suspensionRecoveryTimer) {
                    clearTimeout(suspensionRecoveryTimer);
                }
                
                suspensionRecoveryTimer = setTimeout(() => {
                    if (videoSuspended) {
                        console.log('iOS Safari: Suspension timeout - force resuming sync operations after 5s');
                        clearSuspensionState('timeout');
                    }
                }, 5000);
            }
        }
        
        video.addEventListener('suspend', (e) => {
            const now = Date.now();
            console.log('🔋 Video suspended (' + browser + ')');
            
            if (isIOSSafari) {
                console.log('iOS Safari: Power management suspension detected');
                // Track suspend event frequency for debugging
                suspendEventCount++;
                
                // Reset counter if enough time has passed
                if (now - lastSuspendTime > SUSPEND_DEBOUNCE_WINDOW) {
                    suspendEventCount = 1;
                }
                lastSuspendTime = now;
                
                // Log if we're seeing rapid suspend events
                if (suspendEventCount > 1) {
                    console.log('iOS Safari: Rapid suspend events (' + suspendEventCount + ' in ' + (now - (lastSuspendTime - SUSPEND_DEBOUNCE_WINDOW)) + 'ms)');
                }
                
                // Clear any existing debounce timer
                if (suspendDebounceTimer) {
                    clearTimeout(suspendDebounceTimer);
                }
                
                // Only suspend if this seems like a sustained suspension
                // For rapid cycling, wait to see if it settles
                if (suspendEventCount === 1) {
                    // First suspend event - start immediately but be ready to cancel
                    suspendDebounceTimer = setTimeout(debouncedSuspend, MIN_SUSPEND_DURATION);
                } else {
                    // Multiple rapid events - use longer debounce
                    console.log('iOS Safari: Debouncing rapid suspend events');
                    suspendDebounceTimer = setTimeout(debouncedSuspend, SUSPEND_DEBOUNCE_WINDOW);
                }
            } else {
                // Non-iOS Safari - original immediate behavior
                videoSuspended = true;
                suspendedTimestamp = now;
                console.log('Video loading suspended, pausing sync operations');
            }
        });
        
        
        video.addEventListener('progress', (e) => {
            // Monitor loading progress - iOS Safari may have different patterns
            if (isIOSSafari && video.buffered.length > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const currentTime = video.currentTime;
                const bufferAhead = bufferedEnd - currentTime;
                
                // Log when buffer gets low on iOS Safari
                if (bufferAhead < 5 && !video.paused) {
                    console.log(\`iOS Safari low buffer: \${bufferAhead.toFixed(1)}s ahead\`);
                }
            }
        });
        
        // Document visibility change (iOS Safari background tab handling)
        document.addEventListener('visibilitychange', () => {
            if (isIOSSafari) {
                if (document.hidden) {
                    console.log('iOS Safari: Tab went to background - video may be throttled');
                } else {
                    console.log('iOS Safari: Tab returned to foreground - checking video state');
                    
                    // Force clear suspension state when returning from background
                    setTimeout(() => {
                        if (videoSuspended) {
                            console.log('iOS Safari: Forcing suspension clear on foreground return');
                            clearSuspensionState('visibility-foreground');
                        }
                        
                        // Check if video state is still valid after returning from background
                        if (!video.paused && video.readyState < 3) {
                            console.log('iOS Safari: Video not ready after background return');
                        }
                    }, 100);
                }
            }
        });
        
        // Additional iOS Safari suspension detection and recovery
        if (isIOSSafari) {
            // Monitor for stuck suspension state every 10 seconds
            setInterval(() => {
                if (videoSuspended && suspendedTimestamp) {
                    const suspendedDuration = Date.now() - suspendedTimestamp;
                    if (suspendedDuration > 10000) { // Suspended for more than 10 seconds
                        console.log(\`iOS Safari: Suspension stuck for \${Math.round(suspendedDuration/1000)}s - force clearing\`);
                        clearSuspensionState('stuck-detection');
                    }
                }
            }, 10000);
            
            // Recovery trigger on any user interaction
            ['touchstart', 'touchend', 'click', 'tap'].forEach(eventType => {
                document.addEventListener(eventType, () => {
                    if (videoSuspended) {
                        console.log(\`iOS Safari: User interaction (\${eventType}) - clearing suspension\`);
                        clearSuspensionState('user-interaction');
                    }
                }, { passive: true });
            });
        }
        
        // Ready state monitoring (video pipeline readiness)
        let lastReadyState = video.readyState;
        
        video.addEventListener('readystatechange', (e) => {
            const readyStates = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];
            const oldState = readyStates[lastReadyState] || lastReadyState;
            const newState = readyStates[video.readyState] || video.readyState;
            
            console.log(\`📹 Ready state: \${oldState} → \${newState} (\${browser})\`);
            lastReadyState = video.readyState;
            
            // iOS Safari specific ready state handling
            if (isIOSSafari) {
                if (video.readyState >= 3 && isBuffering) {
                    console.log('iOS Safari: Ready state indicates buffering should end');
                }
                
                if (video.readyState < 2 && !video.paused) {
                    console.log('iOS Safari: Low ready state during playback - potential issue');
                }
            }
        });
        
        video.addEventListener('canplaythrough', (e) => {
            console.log(\`🎬 Can play through - sufficient buffer (\${browser})\`);
            
            if (isIOSSafari) {
                // iOS Safari should now have enough buffer for smooth playback
                console.log('iOS Safari: Sufficient buffer for smooth playback');
                
                // Additional recovery point for suspended state
                if (typeof clearSuspensionState !== 'undefined') {
                    clearSuspensionState('canplaythrough');
                }
            }
        });
        
        // Additional iOS Safari recovery events
        if (isIOSSafari) {
            video.addEventListener('loadeddata', (e) => {
                clearSuspensionState('loadeddata');
            });
            
            video.addEventListener('loadedmetadata', (e) => {
                clearSuspensionState('loadedmetadata');
            });
            
            video.addEventListener('playing', (e) => {
                clearSuspensionState('playing');
            });
            
            // Throttled timeupdate recovery to avoid spam
            let lastTimeUpdateRecovery = 0;
            video.addEventListener('timeupdate', (e) => {
                // If we're getting timeupdate events, video is definitely not suspended
                const now = Date.now();
                if (videoSuspended && now - lastTimeUpdateRecovery > 1000) {
                    lastTimeUpdateRecovery = now;
                    clearSuspensionState('timeupdate');
                }
            });
        }
        
        // Error recovery and edge case handling
        video.addEventListener('error', (e) => {
            const error = video.error;
            console.log(\`❌ Video error: \${error ? error.message : 'Unknown error'} (\${browser})\`);
            
            if (isIOSSafari && error) {
                console.log(\`iOS Safari error code: \${error.code}\`);
                
                // Common iOS Safari error recovery
                if (error.code === 3) { // MEDIA_ERR_DECODE
                    console.log('iOS Safari: Decode error - may need format fallback');
                } else if (error.code === 2) { // MEDIA_ERR_NETWORK
                    console.log('iOS Safari: Network error - checking connection');
                }
            }
        });
        
        video.addEventListener('abort', (e) => {
            console.log(\`⏹️ Video loading aborted (\${browser})\`);
            
            if (isIOSSafari) {
                console.log('iOS Safari: Video loading was aborted - may need recovery');
            }
        });
        
        video.addEventListener('emptied', (e) => {
            console.log(\`📰 Video emptied - media reset (\${browser})\`);
            
            if (isIOSSafari) {
                console.log('iOS Safari: Video media was reset - checking for recovery');
                // Reset buffer tracking
                isBuffering = false;
                bufferStartTime = null;
            }
        });

        if (isAdmin) {
            // Safari admin may need initial user interaction
            if (isSafari) {
                video.addEventListener('loadedmetadata', () => {
                    // Safari admin starts paused, requiring manual play
                    console.log('Safari admin: Video loaded, ready for manual control');
                });
            }
            
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

            // Enhanced admin broadcasts - send full state every 10 seconds
            setInterval(() => {
                socket.emit('fullStateSync', { 
                    currentTime: video.currentTime,
                    isPlaying: !video.paused,
                    timestamp: Date.now()
                });
            }, 10000);
        }

        // Viewer status reporting
        if (!isAdmin) {
            // Send status updates every 2 seconds
            setInterval(() => {
                if (videoReady) {
                    socket.emit('viewerStatus', {
                        currentTime: video.currentTime,
                        isPlaying: !video.paused,
                        buffering: video.readyState < 3,
                        networkQuality: networkQuality,
                        timestamp: Date.now()
                    });
                }
            }, 2000);
            
            // Send sync acknowledgments
            function sendSyncAck(commandId, success, actualTime) {
                socket.emit('syncAck', {
                    commandId: commandId,
                    success: success,
                    currentTime: actualTime || video.currentTime,
                    timestamp: Date.now()
                });
            }
        }

        // iOS Safari admin command deduplication
        let recentAdminCommands = [];
        const ADMIN_COMMAND_DEDUP_WINDOW = 5000; // 5 seconds
        
        function isDuplicateAdminCommand(data) {
            if (!isIOSSafari) return false; // Only apply to iOS Safari
            
            const now = Date.now();
            const commandKey = data.type + '-' + data.currentTime.toFixed(3);
            
            // Clean old commands
            recentAdminCommands = recentAdminCommands.filter(cmd => now - cmd.timestamp < ADMIN_COMMAND_DEDUP_WINDOW);
            
            // Check for duplicate
            const isDuplicate = recentAdminCommands.some(cmd => cmd.key === commandKey);
            
            if (!isDuplicate) {
                // Store new command
                recentAdminCommands.push({
                    key: commandKey,
                    timestamp: now,
                    type: data.type,
                    currentTime: data.currentTime
                });
            }
            
            return isDuplicate;
        }
        
        socket.on('control', (data) => {
            if (!isAdmin && !syncInProgress) {
                // Check for iOS Safari duplicate commands
                if (isDuplicateAdminCommand(data)) {
                    console.log('iOS Safari: Ignoring duplicate admin command: ' + data.type + ' at ' + data.currentTime.toFixed(3) + 's');
                    return; // Skip duplicate command
                }
                
                console.log('Received admin control:', data.type);
                applySync(data);
                
                // Send acknowledgment after sync attempt
                if (!isAdmin) {
                    setTimeout(() => {
                        const timeDiff = Math.abs(video.currentTime - data.currentTime);
                        const settings = getAdaptiveSettings();
                        const success = timeDiff <= settings.tolerance;
                        sendSyncAck(data.commandId, success, video.currentTime);
                    }, 500);
                }
            }
        });

        socket.on('heartbeat', (data) => {
            if (!isAdmin && !syncInProgress) {
                const settings = getAdaptiveSettings();
                const timeDiff = Math.abs(video.currentTime - data.currentTime);
                
                if (timeDiff > settings.tolerance && !video.paused) {
                    // Check buffer health for iOS Safari before syncing
                    if (isIOSSafari) {
                        const bufferHealth = getBufferHealth();
                        
                        if (!bufferHealth.healthy) {
                            console.log('iOS Safari: Deferring heartbeat sync - buffer ' + bufferHealth.reason + ' (' + bufferHealth.bufferAhead.toFixed(1) + 's ahead, drift: ' + timeDiff.toFixed(1) + 's)');
                            
                            // Only defer if drift isn't extreme (>10s)
                            if (timeDiff < 10) {
                                return; // Skip this heartbeat sync
                            } else {
                                console.log('iOS Safari: FORCED heartbeat sync - extreme drift overrides buffer health');
                            }
                        } else {
                            console.log('iOS Safari: Buffer healthy (' + bufferHealth.bufferAhead.toFixed(1) + 's ahead) - proceeding with heartbeat sync');
                        }
                    }
                    
                    console.log('Heartbeat sync needed, drift: ' + timeDiff.toFixed(1) + 's (tolerance: ' + settings.tolerance + 's)');
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

        socket.on('fullStateSync', (data) => {
            if (!isAdmin && !syncInProgress) {
                const settings = getAdaptiveSettings();
                const timeDiff = Math.abs(video.currentTime - data.currentTime);
                const playStateMismatch = video.paused !== !data.isPlaying;
                
                // Force resync if significantly out of sync or play state mismatch
                if (timeDiff > (settings.tolerance * 2) || playStateMismatch) {
                    console.log(\`Full state resync needed: time diff \${timeDiff.toFixed(1)}s, play mismatch: \${playStateMismatch}\`);
                    applySync({
                        type: data.isPlaying ? 'play' : 'pause',
                        currentTime: data.currentTime,
                        isPlaying: data.isPlaying
                    });
                }
            }
        });

        socket.on('adminDenied', (data) => {
            console.log('❌ Admin access denied:', data.reason);
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
            console.log('✅ Admin access granted:', data.message);
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
                    socket.emit('join', { isAdmin: true, startTime: ${sessionConfig.startTime}, browser, videoFormat: optimalFormat });
                }
            } else {
                status.textContent = 'ADMIN';
            }
        });

        socket.on('pong', (data) => {
            const rtt = Date.now() - data.timestamp;
            updateNetworkQuality(rtt);
        });

        socket.on('testResponse', (data) => {
            console.log('🧪 Test response received:', data.message);
        });

        socket.on('connect', () => {
            console.log('✅ Connected to server, transport:', socket.io.engine.transport.name);
            console.log('Socket ID:', socket.id);
            
            // Log transport changes
            socket.io.engine.on('upgrade', () => {
                console.log('Transport upgraded to:', socket.io.engine.transport.name);
            });
            
            // Start network quality measurement
            measureNetworkQuality(); // Initial measurement
            pingInterval = setInterval(measureNetworkQuality, 5000); // Every 5 seconds
            
            // Update connection indicator
            updateConnectionIndicator();
            
            // Test socket communication first
            console.log('🧪 Testing socket communication...');
            socket.emit('test', { message: 'Hello from client' });
            
            // Send join request after a brief delay to ensure server handlers are ready
            setTimeout(() => {
                console.log('Client sending join request with isAdmin:', isAdmin);
                socket.emit('join', { isAdmin, startTime: ${sessionConfig.startTime}, browser, videoFormat: optimalFormat });
                
                // Debug: Check if we get any admin-related response within 2 seconds
                setTimeout(() => {
                    console.log('Current admin status after 2s:', isAdmin);
                    console.log('Status element text:', status.textContent);
                }, 2000);
            }, 500); // Increased delay for potential polling transport
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            
            // Stop network quality measurement
            if (pingInterval) {
                clearInterval(pingInterval);
                pingInterval = null;
            }
        });
    </script>
</body>
</html>`;
  
  res.send(html);
});

io.on('connection', async (socket) => {
  console.log(`🔌 Socket.IO connection: ${socket.id.substring(0, 8)}... transport: ${socket.conn.transport.name}`);
  
  // Log transport upgrades
  socket.conn.on('upgrade', () => {
    console.log(`⬆️  Transport upgraded to: ${socket.conn.transport.name}`);
  });
  
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
    connectedAt: new Date(),
    networkQuality: 'good', // Track client network quality
    lastRTT: 100,
    browser: 'unknown', // Will be updated when client joins
    videoFormat: 'unknown' // Will be updated when client joins
  };
  
  connectedClients.set(socket.id, clientInfo);
  
  console.log(`🟢 Client connected: ${socket.id.substring(0, 8)}... from ${geo.flag} ${geo.city}, ${geo.country}`);

  // Test: Register a simple event handler to verify events are working
  socket.on('test', (data) => {
    console.log(`🧪 Test event received from ${socket.id.substring(0, 8)}: ${data.message}`);
    socket.emit('testResponse', { message: 'Server received test event' });
  });

  socket.on('join', (data) => {
    try {
      console.log(`🔗 Join request: ${socket.id.substring(0, 8)}... requesting admin=${data?.isAdmin}`);
      
      if (data?.isAdmin) {
      // Check if admin slot is already taken by an active connection
      if (adminSocket && adminSocket.connected) {
        // Admin slot is taken - deny admin privileges
        const adminInfo = connectedClients.get(adminSocket.id);
        const clientInfo = connectedClients.get(socket.id);
        
        socket.emit('adminDenied', { 
          reason: 'Admin already active',
          adminLocation: adminInfo ? `${adminInfo.geo.flag} ${adminInfo.geo.city}, ${adminInfo.geo.country}` : 'Unknown location'
        });
        
        // Update client info with browser/format for denied admin
        if (clientInfo) {
          clientInfo.browser = data.browser || 'unknown';
          clientInfo.videoFormat = data.videoFormat || 'unknown';
        }
        console.log(`❌ Admin denied: ${socket.id.substring(0, 8)}... (${clientInfo ? clientInfo.browser + '/' + clientInfo.videoFormat : 'unknown/unknown'}) from ${clientInfo ? clientInfo.geo.flag + ' ' + clientInfo.geo.city : 'Unknown'} - slot taken by ${adminSocket.id.substring(0, 8)}...`);
        
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
          clientInfo.browser = data.browser || 'unknown';
          clientInfo.videoFormat = data.videoFormat || 'unknown';
          console.log(`👑 Admin granted to: ${socket.id.substring(0, 8)}... (${clientInfo.browser}/${clientInfo.videoFormat}) from ${clientInfo.geo.flag} ${clientInfo.geo.city}, ${clientInfo.geo.country}`);
        }
        
        // Notify client they got admin
        socket.emit('adminGranted', { 
          message: 'You are now the admin' 
        });
      }
    } else {
      // Update client info for viewers
      const clientInfo = connectedClients.get(socket.id);
      if (clientInfo) {
        clientInfo.browser = data.browser || 'unknown';
        clientInfo.videoFormat = data.videoFormat || 'unknown';
      }
      
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
    
    // Log updated connection counts after role assignment
    const viewerCount = connectedClients.size;
    const adminCount = Array.from(connectedClients.values()).filter(c => c.isAdmin).length;
    console.log(`👥 Updated counts: ${viewerCount} total (${adminCount} admin${adminCount !== 1 ? 's' : ''}, ${viewerCount - adminCount} viewer${viewerCount - adminCount !== 1 ? 's' : ''})`);
    
    socket.emit('adminStatus', { hasAdmin: !!adminSocket });
    socket.broadcast.emit('adminStatus', { hasAdmin: !!adminSocket });
    } catch (error) {
      console.error(`❌ Error in join handler for ${socket.id.substring(0, 8)}:`, error);
    }
  });

  socket.on('control', (data) => {
    if (socket.isAdmin) {
      // Add command ID for tracking
      const commandId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      data.commandId = commandId;
      
      // Update server state tracking
      currentState.currentTime = data.currentTime;
      currentState.isPlaying = (data.type === 'play');
      currentState.lastUpdate = Date.now();
      
      // Store command for tracking acknowledgments
      syncCommands.set(commandId, {
        type: data.type,
        currentTime: data.currentTime,
        isPlaying: data.isPlaying,
        timestamp: Date.now(),
        acks: new Set()
      });
      
      socket.broadcast.emit('control', data);
      
      const clientInfo = connectedClients.get(socket.id);
      const flag = clientInfo ? clientInfo.geo.flag : '👑';
      console.log(`🎬 Admin control: ${data.type} at ${data.currentTime.toFixed(1)}s ${flag} [${commandId}]`);
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

  socket.on('ping', (data) => {
    // Immediately respond with pong for RTT measurement
    socket.emit('pong', data);
    
    // Update client network quality tracking (for future server-side adaptation)
    const clientInfo = connectedClients.get(socket.id);
    if (clientInfo && data.rtt !== undefined) {
      clientInfo.lastRTT = data.rtt;
      
      if (data.rtt < 50) {
        clientInfo.networkQuality = 'excellent';
      } else if (data.rtt < 150) {
        clientInfo.networkQuality = 'good';
      } else if (data.rtt < 300) {
        clientInfo.networkQuality = 'fair';
      } else {
        clientInfo.networkQuality = 'poor';
      }
    }
  });

  socket.on('fullStateSync', (data) => {
    if (socket.isAdmin) {
      // Update server state from admin's full state
      currentState.currentTime = data.currentTime;
      currentState.isPlaying = data.isPlaying;
      currentState.lastUpdate = Date.now();
      
      // Broadcast to all other clients
      socket.broadcast.emit('fullStateSync', data);
      console.log(`📡 Admin full state broadcast: ${data.isPlaying ? 'playing' : 'paused'} at ${data.currentTime.toFixed(1)}s`);
    }
  });

  // Handle viewer status updates
  socket.on('viewerStatus', (data) => {
    if (!socket.isAdmin) {
      // Store viewer state
      viewerStates.set(socket.id, {
        currentTime: data.currentTime,
        isPlaying: data.isPlaying,
        buffering: data.buffering,
        networkQuality: data.networkQuality,
        timestamp: data.timestamp,
        lastUpdate: Date.now()
      });
      
      // Simple sync check based on reported vs current state (no predictions)
      const timeDiff = Math.abs(data.currentTime - currentState.currentTime);
      const playStateMismatch = data.isPlaying !== currentState.isPlaying;
      const tolerance = data.networkQuality === 'poor' ? 8.0 : 
                       data.networkQuality === 'fair' ? 5.0 : 3.0;
      
      // Only resync if significantly out of sync or play state mismatch
      if (timeDiff > tolerance || playStateMismatch) {
        const clientInfo = connectedClients.get(socket.id);
        const flag = clientInfo ? clientInfo.geo.flag : '👥';
        console.log(`⚠️  Viewer out of sync: ${flag} diff=${timeDiff.toFixed(1)}s, play=${data.isPlaying}/${currentState.isPlaying}`);
        
        // Send targeted resync with current state
        socket.emit('control', {
          type: currentState.isPlaying ? 'play' : 'pause',
          currentTime: currentState.currentTime,
          isPlaying: currentState.isPlaying,
          commandId: Date.now() + '-resync-' + socket.id.substr(-4)
        });
      }
    }
  });

  // Handle sync acknowledgments
  socket.on('syncAck', (data) => {
    if (!socket.isAdmin && data.commandId) {
      const command = syncCommands.get(data.commandId);
      if (command) {
        command.acks.add(socket.id);
        
        const clientInfo = connectedClients.get(socket.id);
        const flag = clientInfo ? clientInfo.geo.flag : '👥';
        const status = data.success ? '✅' : '❌';
        console.log(`${status} Sync ack: ${flag} ${data.commandId.substr(-8)} success=${data.success} time=${data.currentTime.toFixed(1)}s`);
        
        if (!data.success) {
          // Retry failed sync
          setTimeout(() => {
            socket.emit('control', {
              type: command.type,
              currentTime: command.currentTime,
              isPlaying: command.isPlaying,
              commandId: data.commandId + '-retry'
            });
          }, 1000);
        }
      }
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
    
    // Clean up viewer state
    viewerStates.delete(socket.id);
    
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