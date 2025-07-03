// Main client application
class MovieNightClient {
    constructor(config) {
        this.socket = io();
        this.video = document.getElementById('video');
        this.status = document.getElementById('status');
        
        // Configuration from server
        this.originallyAdmin = config.isAdmin;
        this.adminError = config.adminError;
        this.browser = config.browser;
        this.optimalFormat = config.optimalFormat;
        this.isAdmin = config.isAdmin;
        this.startTime = config.startTime;
        
        // State variables
        this.lastHeartbeat = Date.now();
        this.syncInProgress = false;
        this.pendingSync = null;
        this.videoReady = false;
        this.syncFailureCount = 0;
        this.emergencyBypassActive = false;
        
        // Browser detection
        this.isSafari = this.browser === 'safari' || this.browser === 'ios-safari';
        this.isIOSSafari = this.browser === 'ios-safari';
        
        // Initialize components
        this.networkMonitor = new NetworkMonitor(this);
        this.videoSync = new VideoSync(this);
        this.browserHandlers = new BrowserHandlers(this);
        if (this.isIOSSafari) {
            this.safariSpecific = new SafariSpecific(this);
        }
        
        this.init();
    }
    
    init() {
        console.log(`Browser: ${this.browser}, optimal format: ${this.optimalFormat}`);
        
        // Setup video event listeners
        this.setupVideoEvents();
        
        // Setup socket event listeners
        this.setupSocketEvents();
        
        // Initialize network monitoring
        this.networkMonitor.init();
        
        // Initialize browser-specific handlers
        this.browserHandlers.init();
        
        // Initialize iOS warning if applicable
        if (this.isIOSSafari) {
            this.initIOSWarning();
        }
        
        if (!this.isAdmin) {
            this.setupViewerControls();
        } else {
            this.setupAdminControls();
        }
    }
    
    initIOSWarning() {
        const warningElement = document.getElementById('iosSyncWarning');
        if (!warningElement) return;
        
        // Check if user has already dismissed this warning in this session
        const warningDismissed = sessionStorage.getItem('iosSyncWarningDismissed');
        
        if (!warningDismissed) {
            // Show warning after a brief delay to let page settle
            setTimeout(() => {
                warningElement.classList.add('show');
            }, 1000);
            
            // Auto-hide after 15 seconds if not manually dismissed
            setTimeout(() => {
                if (warningElement.classList.contains('show')) {
                    this.dismissIOSWarning();
                }
            }, 16000); // 1s delay + 15s display
        }
    }
    
    dismissIOSWarning() {
        const warningElement = document.getElementById('iosSyncWarning');
        if (warningElement) {
            warningElement.classList.remove('show');
            
            // Store dismissal state for this session
            sessionStorage.setItem('iosSyncWarningDismissed', 'true');
            
            // Remove element after animation completes
            setTimeout(() => {
                if (warningElement.parentNode) {
                    warningElement.remove();
                }
            }, 400); // Match CSS transition duration
        }
    }
    
    setupVideoEvents() {
        // Video ready detection
        this.video.addEventListener('loadeddata', () => {
            this.videoReady = true;
            console.log(`Video ready for sync (format: ${this.optimalFormat})`);
            
            if (this.isSafari && !this.isAdmin) {
                this.video.muted = true;
                this.video.currentTime = this.startTime || 0;
            }
            
            if (this.pendingSync) {
                console.log('Applying pending sync...');
                this.videoSync.applySync(this.pendingSync);
                this.pendingSync = null;
            }
        });
        
        // Check if video is already ready
        if (this.video.readyState >= 2) {
            this.videoReady = true;
        }
        
        // Safari autoplay handling
        if (this.isSafari) {
            this.video.addEventListener('canplaythrough', () => {
                if (!this.isAdmin) {
                    this.video.muted = true;
                }
            });
        }
    }
    
    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to server, transport:', this.socket.io.engine.transport.name);
            console.log('Socket ID:', this.socket.id);
            
            if (this.adminError) {
                this.handleAdminError();
                return;
            }
            
            this.socket.io.engine.on('upgrade', () => {
                console.log('Transport upgraded to:', this.socket.io.engine.transport.name);
            });
            
            this.networkMonitor.start();
            this.networkMonitor.updateConnectionIndicator();
            
            console.log('🧪 Testing socket communication...');
            this.socket.emit('test', { message: 'Hello from client' });
            
            setTimeout(() => {
                console.log('Client sending join request with isAdmin:', this.isAdmin);
                this.socket.emit('join', { 
                    isAdmin: this.isAdmin, 
                    startTime: this.startTime, 
                    browser: this.browser, 
                    videoFormat: this.optimalFormat 
                });
                
                setTimeout(() => {
                    console.log('Current admin status after 2s:', this.isAdmin);
                    console.log('Status element text:', this.status.textContent);
                }, 2000);
            }, 500);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.networkMonitor.stop();
        });
        
        this.socket.on('control', (data) => {
            if (!this.isAdmin && !this.syncInProgress) {
                if (this.videoSync.isDuplicateAdminCommand && this.videoSync.isDuplicateAdminCommand(data)) {
                    console.log('iOS Safari: Ignoring duplicate admin command: ' + data.type + ' at ' + data.currentTime.toFixed(3) + 's');
                    return;
                }
                
                console.log('Received admin control:', data.type);
                this.videoSync.applySync(data);
                
                if (!this.isAdmin) {
                    setTimeout(() => {
                        const timeDiff = Math.abs(this.video.currentTime - data.currentTime);
                        const settings = this.videoSync.getAdaptiveSettings();
                        const success = timeDiff <= settings.tolerance;
                        this.sendSyncAck(data.commandId, success, this.video.currentTime);
                    }, 500);
                }
            }
        });
        
        // Additional socket event handlers...
        this.setupAdditionalSocketEvents();
    }
    
    setupAdditionalSocketEvents() {
        this.socket.on('heartbeat', (data) => {
            if (!this.isAdmin && !this.syncInProgress) {
                const settings = this.videoSync.getAdaptiveSettings();
                const timeDiff = Math.abs(this.video.currentTime - data.currentTime);
                
                if (timeDiff > settings.tolerance && !this.video.paused) {
                    if (this.isIOSSafari && this.safariSpecific) {
                        if (!this.safariSpecific.shouldSyncWithBufferCheck(timeDiff)) {
                            return;
                        }
                    }
                    
                    console.log('Heartbeat sync needed, drift: ' + timeDiff.toFixed(1) + 's (tolerance: ' + settings.tolerance + 's)');
                    this.videoSync.applySync({ type: 'seek', currentTime: data.currentTime, isPlaying: true });
                }
            }
            this.lastHeartbeat = Date.now();
        });
        
        this.socket.on('syncState', (data) => {
            if (!this.isAdmin && !this.syncInProgress) {
                console.log('Late joiner sync received:', data.type, 'at', data.currentTime);
                this.videoSync.applySync(data);
            }
        });
        
        this.socket.on('fullStateSync', (data) => {
            if (!this.isAdmin && !this.syncInProgress) {
                const settings = this.videoSync.getAdaptiveSettings();
                const timeDiff = Math.abs(this.video.currentTime - data.currentTime);
                const playStateMismatch = this.video.paused !== !data.isPlaying;
                
                if (timeDiff > (settings.tolerance * 2) || playStateMismatch) {
                    console.log(`Full state resync needed: time diff ${timeDiff.toFixed(1)}s, play mismatch: ${playStateMismatch}`);
                    this.videoSync.applySync({
                        type: data.isPlaying ? 'play' : 'pause',
                        currentTime: data.currentTime,
                        isPlaying: data.isPlaying
                    });
                }
            }
        });
        
        this.socket.on('adminDenied', (data) => {
            console.log('❌ Admin access denied:', data.reason);
            this.status.textContent = 'VIEWER - Admin Active';
            
            const notice = document.querySelector('.viewer-notice');
            if (notice) {
                notice.textContent = `Admin active from ${data.adminLocation}`;
                notice.style.color = '#ff6b6b';
            }
            
            this.isAdmin = false;
        });
        
        this.socket.on('adminGranted', (data) => {
            console.log('✅ Admin access granted:', data.message);
            this.isAdmin = true;
            this.status.textContent = 'ADMIN';
            
            const notice = document.querySelector('.viewer-notice');
            if (notice) {
                notice.textContent = 'You are now the admin';
                notice.style.color = '#4ecdc4';
            }
        });
        
        this.socket.on('adminStatus', (data) => {
            if (!this.isAdmin) {
                this.status.textContent = data.hasAdmin ? 'VIEWER' : 'VIEWER - No Admin';
                
                if (!data.hasAdmin && this.originallyAdmin) {
                    console.log('Admin disconnected, attempting to claim admin role...');
                    this.socket.emit('join', { 
                        isAdmin: true, 
                        startTime: this.startTime, 
                        browser: this.browser, 
                        videoFormat: this.optimalFormat 
                    });
                }
            } else {
                this.status.textContent = 'ADMIN';
            }
        });
        
        this.socket.on('pong', (data) => {
            const rtt = Date.now() - data.timestamp;
            this.networkMonitor.updateNetworkQuality(rtt);
        });
        
        this.socket.on('testResponse', (data) => {
            console.log('🧪 Test response received:', data.message);
        });
    }
    
    setupViewerControls() {
        let lastValidTime = 0;
        let wasPlaying = false;
        
        // Click notification
        let lastClickNotification = 0;
        this.video.addEventListener('click', (e) => {
            const now = Date.now();
            if (now - lastClickNotification >= 2000) {
                const notification = document.getElementById('clickNotification');
                if (notification) {
                    notification.classList.add('show');
                    setTimeout(() => {
                        notification.classList.remove('show');
                    }, 2000);
                    lastClickNotification = now;
                }
            }
        });
        
        // Prevent viewer interactions
        ['play', 'pause'].forEach(eventType => {
            this.video.addEventListener(eventType, (e) => {
                if (!this.syncInProgress) {
                    console.log(`Viewer attempted to ${eventType} - blocked`);
                    setTimeout(() => {
                        if (wasPlaying) {
                            this.video.play();
                        } else {
                            this.video.pause();
                        }
                        this.video.currentTime = lastValidTime;
                    }, 1);
                }
            });
        });
        
        // Seek blocking with emergency bypass
        this.setupSeekBlocking(lastValidTime);
        
        // Track legitimate state changes
        this.video.addEventListener('timeupdate', (e) => {
            if (this.syncInProgress) {
                lastValidTime = this.video.currentTime;
                wasPlaying = !this.video.paused;
            }
        });
        
        // Disable context menu and keyboard shortcuts
        this.video.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        this.video.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                return; // Allow volume control
            }
            e.preventDefault();
        });
        
        // Start viewer status reporting
        this.startViewerStatusReporting();
    }
    
    setupSeekBlocking(lastValidTime) {
        let seekBlockTimer = null;
        let lastSeekBlock = 0;
        const SEEK_BLOCK_COOLDOWN = 100;
        
        let seekBlockEvents = [];
        const SEEK_BLOCK_FREQUENCY_WINDOW = 5000;
        const SEEK_BLOCK_FREQUENCY_LIMIT = 10;
        let frequencyBypassActive = false;
        
        this.video.addEventListener('seeking', (e) => {
            if (!this.syncInProgress && !this.emergencyBypassActive && !frequencyBypassActive) {
                const now = Date.now();
                
                // Check for extreme drift
                if (lastValidTime && this.video.currentTime) {
                    const currentDrift = Math.abs(this.video.currentTime - lastValidTime);
                    if (currentDrift > 300) {
                        console.log('🚨 EXTREME DRIFT DETECTED (' + currentDrift.toFixed(1) + 's) - allowing seek to fix sync');
                        return;
                    }
                }
                
                // Throttle seek blocking
                if (now - lastSeekBlock < SEEK_BLOCK_COOLDOWN) {
                    return;
                }
                
                // Frequency-based emergency bypass monitoring
                seekBlockEvents.push(now);
                seekBlockEvents = seekBlockEvents.filter(timestamp => now - timestamp < SEEK_BLOCK_FREQUENCY_WINDOW);
                
                if (seekBlockEvents.length >= SEEK_BLOCK_FREQUENCY_LIMIT) {
                    console.log('🚨 FREQUENCY EMERGENCY BYPASS: Too many seek blocks - disabling seek blocking');
                    frequencyBypassActive = true;
                    
                    setTimeout(() => {
                        frequencyBypassActive = false;
                        seekBlockEvents = [];
                        console.log('✅ Frequency emergency bypass ended - seek blocking re-enabled');
                    }, 10000);
                    
                    return;
                }
                
                if (seekBlockTimer) {
                    clearTimeout(seekBlockTimer);
                }
                
                lastSeekBlock = now;
                
                if (this.isIOSSafari && Math.random() > 0.001) {
                    // Reduce logging for iOS Safari
                } else {
                    console.log('Viewer attempted to seek - blocked');
                }
                
                seekBlockTimer = setTimeout(() => {
                    this.video.currentTime = lastValidTime;
                    seekBlockTimer = null;
                }, 10);
            }
        });
    }
    
    setupAdminControls() {
        if (this.isSafari) {
            this.video.addEventListener('loadedmetadata', () => {
                console.log('Safari admin: Video loaded, ready for manual control');
            });
        }
        
        this.video.addEventListener('play', () => {
            this.socket.emit('control', { type: 'play', currentTime: this.video.currentTime });
        });
        
        this.video.addEventListener('pause', () => {
            this.socket.emit('control', { type: 'pause', currentTime: this.video.currentTime });
        });
        
        this.video.addEventListener('seeked', () => {
            this.socket.emit('control', { type: 'seek', currentTime: this.video.currentTime });
        });
        
        // Regular heartbeat
        setInterval(() => {
            if (!this.video.paused) {
                this.socket.emit('heartbeat', { currentTime: this.video.currentTime });
            }
        }, 3000);
        
        // Enhanced admin broadcasts
        setInterval(() => {
            this.socket.emit('fullStateSync', { 
                currentTime: this.video.currentTime,
                isPlaying: !this.video.paused,
                timestamp: Date.now()
            });
        }, 10000);
    }
    
    startViewerStatusReporting() {
        if (!this.isAdmin) {
            setInterval(() => {
                if (this.videoReady) {
                    this.socket.emit('viewerStatus', {
                        currentTime: this.video.currentTime,
                        isPlaying: !this.video.paused,
                        buffering: this.video.readyState < 3,
                        networkQuality: this.networkMonitor.networkQuality,
                        timestamp: Date.now()
                    });
                }
            }, 2000);
        }
    }
    
    sendSyncAck(commandId, success, actualTime) {
        this.socket.emit('syncAck', {
            commandId: commandId,
            success: success,
            currentTime: actualTime || this.video.currentTime,
            timestamp: Date.now()
        });
    }
    
    handleAdminError() {
        if (this.adminError === 'password_required') {
            this.status.textContent = 'VIEWER - Password Required';
            console.log('❌ Admin access denied: Password required for admin access');
        } else if (this.adminError === 'incorrect_password') {
            this.status.textContent = 'VIEWER - Wrong Password';
            console.log('❌ Admin access denied: Incorrect admin password');
        }
        
        const notice = document.querySelector('.viewer-notice');
        if (notice) {
            notice.textContent = this.adminError === 'password_required' ? 
                'Admin password required: ?admin&pw=password' : 
                'Incorrect admin password provided';
            notice.style.color = '#ff6b6b';
        }
        
        this.isAdmin = false;
    }
}