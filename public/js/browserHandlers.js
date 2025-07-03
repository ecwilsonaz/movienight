// Browser-specific handlers
class BrowserHandlers {
    constructor(client) {
        this.client = client;
    }
    
    init() {
        this.setupErrorHandlers();
        this.setupReadyStateHandlers();
        this.setupBufferingHandlers();
        
        if (this.client.isSafari) {
            this.setupSafariSpecificHandlers();
        }
    }
    
    setupErrorHandlers() {
        this.client.video.addEventListener('error', (e) => {
            const error = this.client.video.error;
            console.log(`❌ Video error: ${error ? error.message : 'Unknown error'} (${this.client.browser})`);
            
            if (this.client.isIOSSafari && error) {
                console.log(`iOS Safari error code: ${error.code}`);
                
                if (error.code === 3) {
                    console.log('iOS Safari: Decode error - may need format fallback');
                } else if (error.code === 2) {
                    console.log('iOS Safari: Network error - checking connection');
                }
            }
        });
        
        this.client.video.addEventListener('abort', (e) => {
            console.log(`⏹️ Video loading aborted (${this.client.browser})`);
            
            if (this.client.isIOSSafari) {
                console.log('iOS Safari: Video loading was aborted - may need recovery');
            }
        });
        
        this.client.video.addEventListener('emptied', (e) => {
            console.log(`📰 Video emptied - media reset (${this.client.browser})`);
            
            if (this.client.isIOSSafari) {
                console.log('iOS Safari: Video media was reset - checking for recovery');
            }
        });
    }
    
    setupReadyStateHandlers() {
        let lastReadyState = this.client.video.readyState;
        
        this.client.video.addEventListener('readystatechange', (e) => {
            const readyStates = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];
            const oldState = readyStates[lastReadyState] || lastReadyState;
            const newState = readyStates[this.client.video.readyState] || this.client.video.readyState;
            
            console.log(`📹 Ready state: ${oldState} → ${newState} (${this.client.browser})`);
            lastReadyState = this.client.video.readyState;
            
            if (this.client.isIOSSafari) {
                if (this.client.video.readyState >= 3 && this.client.safariSpecific && this.client.safariSpecific.isBuffering) {
                    console.log('iOS Safari: Ready state indicates buffering should end');
                }
                
                if (this.client.video.readyState < 2 && !this.client.video.paused) {
                    console.log('iOS Safari: Low ready state during playback - potential issue');
                }
            }
        });
        
        this.client.video.addEventListener('canplaythrough', (e) => {
            console.log(`🎬 Can play through - sufficient buffer (${this.client.browser})`);
            
            if (this.client.isIOSSafari) {
                console.log('iOS Safari: Sufficient buffer for smooth playback');
                
                if (this.client.safariSpecific) {
                    this.client.safariSpecific.clearSuspensionState('canplaythrough');
                }
            }
        });
    }
    
    setupBufferingHandlers() {
        this.client.video.addEventListener('waiting', (e) => {
            console.log(`📡 Video buffering started (${this.client.browser})`);
            
            if (this.client.isIOSSafari) {
                this.client.status.textContent = (this.client.isAdmin ? 'ADMIN' : 'VIEWER') + ' 🔄';
            }
        });
        
        this.client.video.addEventListener('canplay', (e) => {
            console.log(`✅ Video buffering ended (${this.client.browser})`);
            
            if (this.client.isIOSSafari) {
                this.client.networkMonitor.updateConnectionIndicator();
                
                if (this.client.safariSpecific) {
                    this.client.safariSpecific.clearSuspensionState('canplay');
                }
            }
        });
        
        this.client.video.addEventListener('stalled', (e) => {
            console.log(`⚠️ Video stalled - network issues detected (${this.client.browser})`);
            
            if (this.client.isIOSSafari && !this.client.video.paused) {
                console.log('iOS Safari: Attempting to recover from stalled playback');
            }
        });
        
        this.client.video.addEventListener('progress', (e) => {
            if (this.client.isIOSSafari && this.client.video.buffered.length > 0) {
                const bufferedEnd = this.client.video.buffered.end(this.client.video.buffered.length - 1);
                const currentTime = this.client.video.currentTime;
                const bufferAhead = bufferedEnd - currentTime;
                
                if (bufferAhead < 5 && !this.client.video.paused) {
                    console.log(`iOS Safari low buffer: ${bufferAhead.toFixed(1)}s ahead`);
                }
            }
        });
    }
    
    setupSafariSpecificHandlers() {
        // Document visibility change (iOS Safari background tab handling)
        document.addEventListener('visibilitychange', () => {
            if (this.client.isIOSSafari) {
                if (document.hidden) {
                    console.log('iOS Safari: Tab went to background - video may be throttled');
                } else {
                    console.log('iOS Safari: Tab returned to foreground - checking video state');
                    
                    setTimeout(() => {
                        if (this.client.safariSpecific && this.client.safariSpecific.videoSuspended) {
                            console.log('iOS Safari: Forcing suspension clear on foreground return');
                            this.client.safariSpecific.clearSuspensionState('visibility-foreground');
                        }
                        
                        if (!this.client.video.paused && this.client.video.readyState < 3) {
                            console.log('iOS Safari: Video not ready after background return');
                        }
                    }, 100);
                }
            }
        });
    }
    
    showSafariPlayButton() {
        if (!document.getElementById('safari-play-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'safari-play-overlay';
            overlay.className = 'safari-play-overlay';
            
            const content = document.createElement('div');
            content.className = 'safari-play-content';
            
            const icon = document.createElement('div');
            icon.className = 'safari-play-icon';
            icon.textContent = '▶️';
            
            const text = document.createElement('div');
            text.className = 'safari-play-text';
            text.textContent = 'Tap to enable video playback';
            
            content.appendChild(icon);
            content.appendChild(text);
            overlay.appendChild(content);
            
            overlay.addEventListener('click', () => {
                this.client.video.play().then(() => {
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
}