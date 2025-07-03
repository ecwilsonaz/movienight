// Video synchronization logic
class VideoSync {
    constructor(client) {
        this.client = client;
        
        // iOS Safari admin command deduplication
        this.recentAdminCommands = [];
        this.ADMIN_COMMAND_DEDUP_WINDOW = 5000; // 5 seconds
    }
    
    getAdaptiveSettings() {
        // Base settings for desktop browsers
        let settings;
        switch (this.client.networkMonitor.networkQuality) {
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
        if (this.client.isIOSSafari) {
            settings = {
                tolerance: Math.max(settings.tolerance * 4, 3.5),    // Much higher tolerance
                maxRetries: Math.max(settings.maxRetries - 1, 1),    // Fewer retries
                heartbeatInterval: settings.heartbeatInterval + 1500, // Less frequent status reports
                syncDelay: settings.syncDelay + 800                  // Longer delays
            };
            
            // Buffer-aware tolerance scaling
            if (this.client.safariSpecific) {
                const bufferHealth = this.client.safariSpecific.getBufferHealth();
                if (!bufferHealth.healthy && bufferHealth.bufferAhead < 2.5) {
                    const bufferMultiplier = Math.max(1.5, (2.5 - bufferHealth.bufferAhead) / 2);
                    settings.tolerance = settings.tolerance * bufferMultiplier;
                    console.log('iOS Safari: Buffer-aware tolerance scaling (x' + bufferMultiplier.toFixed(1) + ') - tolerance now ' + settings.tolerance.toFixed(1) + 's');
                }
            }
            
            console.log('iOS Safari: Using relaxed sync settings (tolerance: ' + settings.tolerance.toFixed(1) + 's, maxRetries: ' + settings.maxRetries + ')');
        }

        return settings;
    }
    
    isDuplicateAdminCommand(data) {
        if (!this.client.isIOSSafari) return false; // Only apply to iOS Safari
        
        const now = Date.now();
        const commandKey = data.type + '-' + data.currentTime.toFixed(3);
        
        // Clean old commands
        this.recentAdminCommands = this.recentAdminCommands.filter(cmd => now - cmd.timestamp < this.ADMIN_COMMAND_DEDUP_WINDOW);
        
        // Check for duplicate
        const isDuplicate = this.recentAdminCommands.some(cmd => cmd.key === commandKey);
        
        if (!isDuplicate) {
            // Store new command
            this.recentAdminCommands.push({
                key: commandKey,
                timestamp: now,
                type: data.type,
                currentTime: data.currentTime
            });
        }
        
        return isDuplicate;
    }
    
    applySync(data, customSettings = null) {
        if (!this.client.videoReady) {
            console.log('Video not ready, storing sync for later');
            this.client.pendingSync = data;
            return;
        }
        
        // iOS Safari buffer awareness - delay sync based on buffer health
        if (this.client.isIOSSafari && this.client.safariSpecific) {
            const bufferHealth = this.client.safariSpecific.getBufferHealth();
            if (!bufferHealth.healthy) {
                console.log('iOS Safari: Delaying sync - buffer ' + bufferHealth.reason + ' (' + bufferHealth.bufferAhead.toFixed(1) + 's ahead)');
                setTimeout(() => this.applySync(data, customSettings), 500);
                return;
            }
        }
        
        // iOS Safari power management check
        if (this.client.isIOSSafari && this.client.safariSpecific) {
            if (this.client.safariSpecific.videoSuspended) {
                const currentTime = this.client.video.currentTime || 0;
                const timeDiff = Math.abs(data.currentTime - currentTime);
                
                if (timeDiff > 15) {
                    console.log(`iOS Safari: EMERGENCY SYNC - forcing through suspension (drift: ${timeDiff.toFixed(1)}s)`);
                    this.client.safariSpecific.clearSuspensionState('emergency-override');
                } else {
                    console.log('iOS Safari: Delaying sync - video suspended by power management');
                    setTimeout(() => this.applySync(data, customSettings), 1000);
                    return;
                }
            }
        }
        
        // iOS Safari ready state check
        if (this.client.isIOSSafari && this.client.video.readyState < 2) {
            console.log(`iOS Safari: Delaying sync - low ready state (${this.client.video.readyState})`);
            setTimeout(() => this.applySync(data, customSettings), 300);
            return;
        }

        let settings = customSettings || this.getAdaptiveSettings();
        let attempts = 0;
        
        // Special handling for iOS Safari unpause
        const isUnpauseTransition = this.client.video.paused && (data.type === 'play' || data.isPlaying);
        if (this.client.isIOSSafari && isUnpauseTransition) {
            settings = {
                ...settings,
                maxRetries: 1,
                tolerance: Math.max(settings.tolerance, 4.0)
            };
            console.log('iOS Safari unpause: using reduced retry settings');
            
            // Additional buffer check for unpause
            if (this.client.video.buffered.length > 0) {
                const bufferedEnd = this.client.video.buffered.end(this.client.video.buffered.length - 1);
                const bufferAhead = bufferedEnd - data.currentTime;
                if (bufferAhead < 2) {
                    console.log(`iOS Safari unpause: Low buffer (${bufferAhead.toFixed(1)}s) - increasing tolerance`);
                    settings.tolerance = Math.max(settings.tolerance, 2.0);
                }
            }
        }
        
        const trySync = () => {
            attempts++;
            this.client.syncInProgress = true;
            
            console.log('Sync attempt ' + attempts + '/' + settings.maxRetries + ': ' + data.type + ' at ' + data.currentTime + 's (' + this.client.networkMonitor.networkQuality + ')');
            
            const applyVideoChanges = () => {
                const isUnpauseTransition = this.client.video.paused && (data.type === 'play' || data.isPlaying);
                
                if (this.client.isIOSSafari && isUnpauseTransition) {
                    // iOS Safari: separate seek and play for smooth unpause
                    console.log('iOS Safari unpause: separating seek and play operations');
                    
                    const targetTime = data.currentTime;
                    const prepTime = Math.max(targetTime - 0.1, 0);
                    this.client.video.currentTime = prepTime;
                    
                    let delay = this.calculateIOSDelay(data);
                    
                    setTimeout(() => {
                        this.client.syncInProgress = false;
                    }, delay);
                    
                    this.logLargeSeek(data, delay);
                    
                    setTimeout(() => {
                        this.client.video.currentTime = targetTime;
                        
                        const playPromise = this.client.video.play();
                        if (playPromise !== undefined) {
                            playPromise.catch(e => {
                                if (e.name === 'NotAllowedError') {
                                    console.log('iOS Safari unpause requires user interaction for autoplay');
                                    this.client.browserHandlers.showSafariPlayButton();
                                } else {
                                    console.log('iOS Safari unpause play failed:', e);
                                }
                            });
                        }
                    }, 120);
                } else {
                    // Standard sync logic
                    this.client.video.currentTime = data.currentTime;
                    
                    if (data.type === 'play' || data.isPlaying) {
                        const playPromise = this.client.video.play();
                        if (playPromise !== undefined) {
                            playPromise.catch(e => {
                                if (this.client.isSafari && e.name === 'NotAllowedError') {
                                    console.log('Safari requires user interaction for autoplay');
                                    this.client.browserHandlers.showSafariPlayButton();
                                } else {
                                    console.log('Play failed:', e);
                                }
                            });
                        }
                    } else if (data.type === 'pause' || data.isPlaying === false) {
                        this.client.video.pause();
                    }
                }
                
                let delay = this.calculateSyncDelay(data);
                
                setTimeout(() => {
                    this.client.syncInProgress = false;
                }, delay);
                
                this.logLargeSeek(data, delay);
            };

            // iOS Safari needs longer delays for video pipeline processing
            if (this.client.isIOSSafari) {
                setTimeout(applyVideoChanges, 75);
            } else {
                applyVideoChanges();
            }
            
            // Check if sync was successful after a brief delay
            const checkDelay = this.client.isIOSSafari ? 250 : 200;
            setTimeout(() => {
                const timeDiff = Math.abs(this.client.video.currentTime - data.currentTime);
                
                if (timeDiff > settings.tolerance && attempts < settings.maxRetries) {
                    console.log('Sync failed (diff: ' + timeDiff.toFixed(1) + 's > ' + settings.tolerance + 's), retrying...');
                    this.client.syncFailureCount++;
                    trySync();
                } else {
                    if (timeDiff <= settings.tolerance) {
                        console.log('Sync successful (diff: ' + timeDiff.toFixed(1) + 's)');
                        this.client.syncFailureCount = 0;
                    } else {
                        console.log('Sync gave up after ' + attempts + ' attempts (final diff: ' + timeDiff.toFixed(1) + 's)');
                        this.client.syncFailureCount++;
                        
                        // Emergency bypass
                        if (this.client.syncFailureCount >= 3 && !this.client.emergencyBypassActive) {
                            console.log('🚨 EMERGENCY BYPASS: Disabling seek blocking due to repeated sync failures');
                            this.client.emergencyBypassActive = true;
                            setTimeout(() => {
                                this.client.emergencyBypassActive = false;
                                this.client.syncFailureCount = 0;
                                console.log('✅ Emergency bypass ended - seek blocking re-enabled');
                            }, 10000);
                        }
                    }
                }
            }, checkDelay);
        };
        
        trySync();
    }
    
    calculateIOSDelay(data) {
        if (data.type === 'play' || data.type === 'pause') {
            return 300;
        } else if (data.type === 'seek') {
            const currentTime = this.client.video.currentTime || 0;
            const timeDiff = Math.abs(data.currentTime - currentTime);
            if (timeDiff > 600) {
                return 2000;
            } else if (timeDiff > 300) {
                return 1500;
            } else if (timeDiff > 60) {
                return 800;
            } else {
                return 300;
            }
        } else {
            return 300;
        }
    }
    
    calculateSyncDelay(data) {
        if (data.type === 'play' || data.type === 'pause') {
            return 200;
        } else if (data.type === 'seek') {
            const currentTime = this.client.video.currentTime || 0;
            const timeDiff = Math.abs(data.currentTime - currentTime);
            if (timeDiff > 600) {
                return 1500;
            } else if (timeDiff > 300) {
                return 1000;
            } else if (timeDiff > 60) {
                return 500;
            } else {
                return 200;
            }
        } else {
            return 200;
        }
    }
    
    logLargeSeek(data, delay) {
        if (data.type === 'seek') {
            const currentTime = this.client.video.currentTime || 0;
            const timeDiff = Math.abs(data.currentTime - currentTime);
            if (timeDiff > 300) {
                const prefix = this.client.isIOSSafari ? '🔍 iOS SAFARI LARGE SEEK' : '🔍 LARGE SEEK';
                console.log(`${prefix}: ${currentTime.toFixed(1)}s → ${data.currentTime.toFixed(1)}s (jump: ${timeDiff.toFixed(1)}s, delay: ${delay}ms)`);
            }
        }
    }
}