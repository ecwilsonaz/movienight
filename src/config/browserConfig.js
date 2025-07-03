// Browser format priority configurations
const formatPriority = {
  'ios-safari': ['hevc', 'mp4', 'webm'], // iOS Safari: HEVC excellent on modern iOS
  safari: ['hevc', 'mp4', 'webm'],       // Desktop Safari: HEVC preferred
  chrome: ['webm', 'mp4', 'hevc'],       // Chrome prefers WebM
  firefox: ['webm', 'mp4'],              // Firefox doesn't support HEVC
  edge: ['mp4', 'webm', 'hevc'],         // Edge prefers H.264
  unknown: ['mp4', 'webm']               // Default to universal H.264
};

// MIME type mappings for video formats
const mimeTypes = {
  hevc: 'video/mp4; codecs="hvc1"',
  mp4: 'video/mp4',
  webm: 'video/webm'
};

// Browser detection patterns
const browserPatterns = {
  safari: {
    includes: ['safari'],
    excludes: ['chrome'],
    mobile: ['mobile', 'iphone', 'ipad']
  },
  firefox: {
    includes: ['firefox'],
    excludes: []
  },
  edge: {
    includes: ['edge'],
    excludes: []
  },
  chrome: {
    includes: ['chrome'],
    excludes: []
  }
};

module.exports = {
  formatPriority,
  mimeTypes,
  browserPatterns
};