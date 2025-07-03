const { browserPatterns } = require('../config/browserConfig');

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

function isSafari(browser) {
  return browser === 'safari' || browser === 'ios-safari';
}

function isIOSSafari(browser) {
  return browser === 'ios-safari';
}

function isMobile(userAgent) {
  const ua = userAgent.toLowerCase();
  return ua.includes('mobile') || ua.includes('iphone') || ua.includes('ipad') || ua.includes('android');
}

module.exports = {
  detectBrowser,
  isSafari,
  isIOSSafari,
  isMobile
};