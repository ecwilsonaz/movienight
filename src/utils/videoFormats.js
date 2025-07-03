const { formatPriority, mimeTypes } = require('../config/browserConfig');

function getOptimalVideoFormat(browser, videoFormats) {
  const priorities = formatPriority[browser] || formatPriority.unknown;
  
  for (const format of priorities) {
    if (videoFormats[format]) {
      return {
        url: videoFormats[format],
        format: format,
        mimeType: mimeTypes[format] || 'video/mp4'
      };
    }
  }
  
  // Fallback to first available format
  const firstFormat = Object.keys(videoFormats)[0];
  return {
    url: videoFormats[firstFormat],
    format: firstFormat,
    mimeType: mimeTypes[firstFormat] || 'video/mp4'
  };
}

function normalizeVideoConfig(sessionConfig) {
  // Support both old videoUrl format and new videoFormats
  let videoFormats = sessionConfig.videoFormats;
  if (!videoFormats && sessionConfig.videoUrl) {
    // Backward compatibility: convert old format
    const ext = sessionConfig.videoUrl.split('.').pop();
    videoFormats = { [ext]: sessionConfig.videoUrl };
  }
  return videoFormats;
}

function generateVideoSources(browser, videoFormats) {
  const priorities = formatPriority[browser] || formatPriority.unknown;
  const sources = [];
  
  // Add sources in priority order
  for (const format of priorities) {
    if (videoFormats[format]) {
      const mimeType = mimeTypes[format] || 'video/mp4';
      sources.push(`<source src="${videoFormats[format]}" type="${mimeType}">`);
    }
  }
  
  return sources.join('\n        ');
}

module.exports = {
  getOptimalVideoFormat,
  normalizeVideoConfig,
  generateVideoSources
};