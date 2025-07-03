const fs = require('fs');

class SessionState {
  constructor() {
    this.config = {};
    this.currentState = {
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    };
  }

  loadSessionConfig() {
    try {
      const configData = fs.readFileSync('./session.json', 'utf8');
      this.config = JSON.parse(configData);
      
      // Validate configuration
      if (this.config.videoFormats) {
        const formats = Object.keys(this.config.videoFormats);
        console.log(`Loaded session: ${this.config.slug} with formats: ${formats.join(', ')}`);
      } else if (this.config.videoUrl) {
        console.log(`Loaded session: ${this.config.slug} with single video: ${this.config.videoUrl}`);
      } else {
        throw new Error('No video configuration found (need videoFormats or videoUrl)');
      }
    } catch (error) {
      console.error('Error loading session.json:', error.message);
      console.log('Please ensure session.json exists and is valid JSON');
      console.log('Required format: {"videoFormats": {"mp4": "url"}, "slug": "name", "startTime": 0}');
      process.exit(1);
    }
  }

  getConfig() {
    return this.config;
  }

  updateCurrentState(newState) {
    Object.assign(this.currentState, newState);
    this.currentState.lastUpdate = Date.now();
  }

  getCurrentState() {
    return { ...this.currentState };
  }

  getCurrentTimeWithProgression() {
    if (!this.currentState.isPlaying) {
      return this.currentState.currentTime;
    }
    
    const timeSinceUpdate = (Date.now() - this.currentState.lastUpdate) / 1000;
    return this.currentState.currentTime + timeSinceUpdate;
  }
}

module.exports = SessionState;