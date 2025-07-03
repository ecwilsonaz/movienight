// Safari-specific handlers for iOS power management and buffering
class SafariSpecific {
    constructor(client) {
        this.client = client;
        
        // Buffer state monitoring
        this.isBuffering = false;
        this.bufferStartTime = null;
        this.lastBufferEndTime = null;
        this.BUFFER_GRACE_PERIOD = 2000;
        this.MIN_SAFE_BUFFER = 2.5;
        
        // Power management events
        this.videoSuspended = false;
        this.suspendedTimestamp = null;
        this.suspensionRecoveryTimer = null;
        
        // Debouncing for iOS Safari power management cycling
        this.suspendDebounceTimer = null;
        this.lastSuspendTime = 0;
        this.suspendEventCount = 0;
        this.SUSPEND_DEBOUNCE_WINDOW = 2000;
        this.MIN_SUSPEND_DURATION = 500;
        
        this.init();
    }
    
    init() {
        this.setupBufferMonitoring();
        this.setupPowerManagement();
        this.setupSuspensionDetection();
        this.setupRecoveryEvents();
    }
    
    setupBufferMonitoring() {
        this.client.video.addEventListener('waiting', (e) => {
            if (!this.isBuffering) {
                this.isBuffering = true;
                this.bufferStartTime = Date.now();
                console.log(`📡 Video buffering started (${this.client.browser})`);
                
                this.client.status.textContent = (this.client.isAdmin ? 'ADMIN' : 'VIEWER') + ' 🔄';
            }
        });
        
        this.client.video.addEventListener('canplay', (e) => {
            if (this.isBuffering) {
                const bufferDuration = Date.now() - this.bufferStartTime;
                this.isBuffering = false;
                this.lastBufferEndTime = Date.now();
                console.log('✅ Video buffering ended after ' + bufferDuration + 'ms (' + this.client.browser + ')');
                
                this.client.networkMonitor.updateConnectionIndicator();
            }
            
            this.clearSuspensionState('canplay');
        });
    }
    
    setupPowerManagement() {
        this.client.video.addEventListener('suspend', (e) => {
            const now = Date.now();
            console.log('🔋 Video suspended (' + this.client.browser + ')');
            
            console.log('iOS Safari: Power management suspension detected');
            this.suspendEventCount++;
            
            // Reset counter if enough time has passed
            if (now - this.lastSuspendTime > this.SUSPEND_DEBOUNCE_WINDOW) {
                this.suspendEventCount = 1;
            }
            this.lastSuspendTime = now;
            
            // Log if we're seeing rapid suspend events
            if (this.suspendEventCount > 1) {
                console.log('iOS Safari: Rapid suspend events (' + this.suspendEventCount + ' in ' + (now - (this.lastSuspendTime - this.SUSPEND_DEBOUNCE_WINDOW)) + 'ms)');
            }
            
            // Clear any existing debounce timer
            if (this.suspendDebounceTimer) {
                clearTimeout(this.suspendDebounceTimer);
            }
            
            // Only suspend if this seems like a sustained suspension
            if (this.suspendEventCount === 1) {
                this.suspendDebounceTimer = setTimeout(() => this.debouncedSuspend(), this.MIN_SUSPEND_DURATION);
            } else {
                console.log('iOS Safari: Debouncing rapid suspend events');
                this.suspendDebounceTimer = setTimeout(() => this.debouncedSuspend(), this.SUSPEND_DEBOUNCE_WINDOW);
            }
        });
    }
    
    setupSuspensionDetection() {
        // Monitor for stuck suspension state every 10 seconds
        setInterval(() => {
            if (this.videoSuspended && this.suspendedTimestamp) {
                const suspendedDuration = Date.now() - this.suspendedTimestamp;
                if (suspendedDuration > 10000) {
                    console.log(`iOS Safari: Suspension stuck for ${Math.round(suspendedDuration/1000)}s - force clearing`);
                    this.clearSuspensionState('stuck-detection');
                }
            }
        }, 10000);
        
        // Recovery trigger on any user interaction
        ['touchstart', 'touchend', 'click', 'tap'].forEach(eventType => {
            document.addEventListener(eventType, () => {
                if (this.videoSuspended) {
                    console.log(`iOS Safari: User interaction (${eventType}) - clearing suspension`);
                    this.clearSuspensionState('user-interaction');
                }
            }, { passive: true });
        });
    }
    
    setupRecoveryEvents() {
        this.client.video.addEventListener('loadeddata', (e) => {
            this.clearSuspensionState('loadeddata');
        });
        
        this.client.video.addEventListener('loadedmetadata', (e) => {
            this.clearSuspensionState('loadedmetadata');
        });
        
        this.client.video.addEventListener('playing', (e) => {
            this.clearSuspensionState('playing');
        });
        
        // Throttled timeupdate recovery to avoid spam
        let lastTimeUpdateRecovery = 0;
        this.client.video.addEventListener('timeupdate', (e) => {
            const now = Date.now();
            if (this.videoSuspended && now - lastTimeUpdateRecovery > 1000) {
                lastTimeUpdateRecovery = now;
                this.clearSuspensionState('timeupdate');
            }
        });
    }
    
    debouncedSuspend() {
        // Actually suspend operations after debounce period
        if (!this.videoSuspended) {
            this.videoSuspended = true;
            this.suspendedTimestamp = Date.now();
            console.log('iOS Safari: Video loading suspended (debounced), pausing sync operations');
            
            // Set recovery timeout - force resume after 5 seconds if no recovery event
            if (this.suspensionRecoveryTimer) {
                clearTimeout(this.suspensionRecoveryTimer);
            }
            
            this.suspensionRecoveryTimer = setTimeout(() => {
                if (this.videoSuspended) {
                    console.log('iOS Safari: Suspension timeout - force resuming sync operations after 5s');
                    this.clearSuspensionState('timeout');
                }
            }, 5000);
        }
    }
    
    clearSuspensionState(reason) {
        if (this.videoSuspended) {
            const suspendDuration = this.suspendedTimestamp ? Date.now() - this.suspendedTimestamp : 0;
            this.videoSuspended = false;
            this.suspendedTimestamp = null;
            if (this.suspensionRecoveryTimer) {
                clearTimeout(this.suspensionRecoveryTimer);
                this.suspensionRecoveryTimer = null;
            }
            console.log('iOS Safari: Video suspension cleared (' + reason + ') after ' + suspendDuration + 'ms');
        }
        
        // Also cancel any pending debounced suspension
        if (this.suspendDebounceTimer) {
            clearTimeout(this.suspendDebounceTimer);
            this.suspendDebounceTimer = null;
            console.log('iOS Safari: Cancelled pending suspension due to recovery');
        }
    }
    
    getBufferHealth() {
        if (this.client.video.buffered.length === 0) {
            return { healthy: true, bufferAhead: 0, reason: 'no-buffer-data' };
        }
        
        const currentTime = this.client.video.currentTime;
        const bufferedEnd = this.client.video.buffered.end(this.client.video.buffered.length - 1);
        const bufferAhead = bufferedEnd - currentTime;
        
        // Check if we're in grace period after buffering
        const inGracePeriod = this.lastBufferEndTime && (Date.now() - this.lastBufferEndTime < this.BUFFER_GRACE_PERIOD);
        
        const healthy = bufferAhead >= this.MIN_SAFE_BUFFER && !inGracePeriod && !this.isBuffering;
        
        return {
            healthy,
            bufferAhead,
            inGracePeriod,
            isBuffering: this.isBuffering,
            reason: !healthy ? (this.isBuffering ? 'actively-buffering' : 
                               inGracePeriod ? 'grace-period' : 'low-buffer') : 'healthy'
        };
    }
    
    shouldSyncWithBufferCheck(timeDiff) {
        const bufferHealth = this.getBufferHealth();
        
        if (!bufferHealth.healthy) {
            console.log('iOS Safari: Deferring heartbeat sync - buffer ' + bufferHealth.reason + ' (' + bufferHealth.bufferAhead.toFixed(1) + 's ahead, drift: ' + timeDiff.toFixed(1) + 's)');
            
            // Only defer if drift isn't extreme (>10s)
            if (timeDiff < 10) {
                return false;
            } else {
                console.log('iOS Safari: FORCED heartbeat sync - extreme drift overrides buffer health');
                return true;
            }
        } else {
            console.log('iOS Safari: Buffer healthy (' + bufferHealth.bufferAhead.toFixed(1) + 's ahead) - proceeding with heartbeat sync');
            return true;
        }
    }
}