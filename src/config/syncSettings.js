// Sync timing configurations based on network quality
const syncSettings = {
  excellent: { 
    tolerance: 0.3, 
    maxRetries: 1, 
    heartbeatInterval: 3000,
    syncDelay: 800 
  },
  good: { 
    tolerance: 0.5, 
    maxRetries: 2, 
    heartbeatInterval: 3000,
    syncDelay: 1000 
  },
  fair: { 
    tolerance: 1.0, 
    maxRetries: 3, 
    heartbeatInterval: 2000,
    syncDelay: 1500 
  },
  poor: { 
    tolerance: 2.0, 
    maxRetries: 5, 
    heartbeatInterval: 1000,
    syncDelay: 2000 
  },
  default: { 
    tolerance: 0.5, 
    maxRetries: 3, 
    heartbeatInterval: 3000,
    syncDelay: 1000 
  }
};

// iOS Safari specific multipliers
const iosSafariMultipliers = {
  tolerance: 4,     // Much higher tolerance for iOS natural timing variations
  retries: -1,      // Fewer retries to reduce choppiness (min 1)
  heartbeat: 1500,  // Less frequent status reports
  delay: 800        // Longer delays for iOS video pipeline
};

// Buffer health settings for iOS Safari
const bufferSettings = {
  minSafeBuffer: 2.5,           // Minimum buffer ahead for safe syncing
  bufferGracePeriod: 2000,      // Grace period after buffering ends (ms)
  maxSuspensionDuration: 5000,  // Max time to stay suspended (ms)
  suspensionDebounceWindow: 2000, // Debounce window for rapid suspend events
  minSuspensionDuration: 500    // Ignore suspensions shorter than this
};

// Emergency bypass settings
const emergencySettings = {
  maxSyncFailures: 3,           // Max sync failures before bypass
  bypassDuration: 10000,        // How long to stay in bypass mode (ms)
  extremeDriftThreshold: 300,   // Threshold for extreme drift (5 minutes)
  seekBlockCooldown: 100,       // Cooldown between seek blocks (ms)
  frequencyWindow: 5000,        // Window for frequency-based bypass (ms)
  frequencyLimit: 10            // Max events per frequency window
};

module.exports = {
  syncSettings,
  iosSafariMultipliers,
  bufferSettings,
  emergencySettings
};