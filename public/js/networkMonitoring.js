// Network quality monitoring and adaptation
class NetworkMonitor {
    constructor(client) {
        this.client = client;
        this.networkQuality = 'good';
        this.currentRTT = 100;
        this.rttHistory = [];
        this.pingInterval = null;
        
        // Network quality hysteresis to prevent rapid changes
        this.networkQualityChangeCount = 0;
        this.networkQualityPending = null;
    }
    
    init() {
        // Network quality measurement will start when socket connects
    }
    
    start() {
        this.measureNetworkQuality(); // Initial measurement
        this.pingInterval = setInterval(() => this.measureNetworkQuality(), 5000);
    }
    
    stop() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    measureNetworkQuality() {
        const pingStart = Date.now();
        this.client.socket.emit('ping', { timestamp: pingStart });
    }
    
    updateNetworkQuality(rtt) {
        this.currentRTT = rtt;
        this.rttHistory.push(rtt);
        
        // Keep only last 10 measurements
        if (this.rttHistory.length > 10) {
            this.rttHistory.shift();
        }
        
        // Calculate average RTT
        const avgRTT = this.rttHistory.reduce((a, b) => a + b, 0) / this.rttHistory.length;
        
        // Classify connection quality with hysteresis to prevent rapid changes
        const oldQuality = this.networkQuality;
        let newQuality;
        
        // iOS Safari gets more generous thresholds due to mobile network characteristics
        if (this.client.isIOSSafari) {
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
        if (newQuality !== this.networkQuality) {
            if (!this.networkQualityChangeCount) {
                this.networkQualityChangeCount = 1;
                this.networkQualityPending = newQuality;
            } else if (this.networkQualityPending === newQuality) {
                this.networkQualityChangeCount++;
                if (this.networkQualityChangeCount >= 2) {
                    this.networkQuality = newQuality;
                    this.networkQualityChangeCount = 0;
                    this.networkQualityPending = null;
                }
            } else {
                // Different change detected, reset counter
                this.networkQualityChangeCount = 1;
                this.networkQualityPending = newQuality;
            }
        } else {
            // Same quality, reset change tracking
            this.networkQualityChangeCount = 0;
            this.networkQualityPending = null;
        }
        
        // Update UI if quality changed
        if (oldQuality !== this.networkQuality) {
            this.updateConnectionIndicator();
            console.log(`Network quality: ${this.networkQuality} (RTT: ${avgRTT.toFixed(0)}ms)`);
        }
    }
    
    updateConnectionIndicator() {
        const qualityEmojis = {
            'excellent': '🟢',
            'good': '🟡', 
            'fair': '🟠',
            'poor': '🔴'
        };
        
        const indicator = qualityEmojis[this.networkQuality] || '⚪';
        this.client.status.textContent = (this.client.isAdmin ? 'ADMIN' : 'VIEWER') + ' ' + indicator;
    }
}