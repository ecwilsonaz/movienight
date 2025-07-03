const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import our modular components
const SessionState = require('./state/sessionState');
const ClientManager = require('./state/clientManager');
const SyncManager = require('./state/syncManager');
const { setupSocketHandlers } = require('./socket/socketHandlers');
const { setupRoutes } = require('./routes/sessionRoutes');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Initialize state managers
const sessionState = new SessionState();
const clientManager = new ClientManager();
const syncManager = new SyncManager();

// Load session configuration
sessionState.loadSessionConfig();

// Configure Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../templates'));
app.use(express.static(path.join(__dirname, '../public')));

// Setup routes
setupRoutes(app, sessionState);

// Setup socket handlers
setupSocketHandlers(io, clientManager, sessionState, syncManager);

// Add keyboard commands for server management
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (key) => {
    if (key === '\u0003') { // Ctrl+C
      console.log('\n👋 Shutting down server...');
      process.exit();
    } else if (key === 'v' || key === 'V') {
      clientManager.showCurrentViewers(sessionState.getCurrentState());
    } else if (key === 'h' || key === 'H') {
      console.log('\n⌨️  Keyboard Commands:');
      console.log('   V - Show current viewers');
      console.log('   H - Show this help');
      console.log('   Ctrl+C - Quit server\n');
    }
  });
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const config = sessionState.getConfig();
  console.log(`🎬 MovieNight Server Started`);
  console.log(`📡 Running on port ${PORT}`);
  console.log(`🔗 Session URL: http://localhost:${PORT}/${config.slug}`);
  console.log(`👑 Admin URL: http://localhost:${PORT}/${config.slug}?admin`);
  console.log(`⌨️  Press 'V' to view connected users, 'H' for help`);
  console.log('─'.repeat(60));
});

// Cleanup old sync commands periodically
setInterval(() => {
  syncManager.cleanupOldCommands();
}, 30000); // Every 30 seconds