const express = require('express');
const { detectBrowser } = require('../utils/browserDetection');
const { getOptimalVideoFormat, normalizeVideoConfig, generateVideoSources } = require('../utils/videoFormats');

function setupRoutes(app, sessionState) {
  const sessionConfig = sessionState.getConfig();
  
  app.get(`/${sessionConfig.slug}`, (req, res) => {
    const requestingAdmin = req.query.admin !== undefined;
    const providedPassword = req.query.pw;
    const userAgent = req.headers['user-agent'] || '';
    const browser = detectBrowser(userAgent);
    
    // Validate admin access with optional password
    let isAdmin = false;
    let adminError = null;
    
    if (requestingAdmin) {
      if (sessionConfig.adminPassword) {
        // Password is configured - require it
        if (providedPassword === sessionConfig.adminPassword) {
          isAdmin = true;
        } else {
          adminError = providedPassword ? 'incorrect_password' : 'password_required';
        }
      } else {
        // No password configured - grant admin access
        isAdmin = true;
      }
    }
    
    // Support both old videoUrl format and new videoFormats
    const videoFormats = normalizeVideoConfig(sessionConfig);
    const optimalVideo = getOptimalVideoFormat(browser, videoFormats);
    
    console.log(`🎥 ${browser} client requested ${sessionConfig.slug}, serving ${optimalVideo.format} format`);
    console.log(`📱 User-Agent: ${userAgent}`);
    console.log(`🎬 Available formats: ${Object.keys(videoFormats).join(', ')}`);
    
    // Render the template with data
    res.render('index', {
      isAdmin,
      adminError,
      browser,
      optimalVideo,
      videoFormats,
      sessionConfig,
      userAgent,
      generateVideoSources: generateVideoSources(browser, videoFormats)
    });
  });
}

module.exports = {
  setupRoutes
};