const { getGeolocation, cleanIPAddress } = require('../utils/geolocation');

function setupSocketHandlers(io, clientManager, sessionState, syncManager) {
  io.on('connection', async (socket) => {
    console.log(`🔌 Socket.IO connection: ${socket.id.substring(0, 8)}... transport: ${socket.conn.transport.name}`);
    
    // Log transport upgrades
    socket.conn.on('upgrade', () => {
      console.log(`⬆️  Transport upgraded to: ${socket.conn.transport.name}`);
    });
    
    const clientIP = socket.handshake.headers['x-forwarded-for'] || 
                     socket.handshake.headers['x-real-ip'] || 
                     socket.handshake.address || 
                     socket.conn.remoteAddress || 
                     '127.0.0.1';
    
    const cleanIP = cleanIPAddress(clientIP);
    const geo = await getGeolocation(cleanIP);
    
    // Store client info
    const clientInfo = {
      ip: cleanIP,
      isAdmin: false,
      geo: geo
    };
    
    clientManager.addClient(socket, clientInfo);
    
    console.log(`🟢 Client connected: ${socket.id.substring(0, 8)}... from ${geo.flag} ${geo.city}, ${geo.country}`);

    // Test: Register a simple event handler to verify events are working
    socket.on('test', (data) => {
      console.log(`🧪 Test event received from ${socket.id.substring(0, 8)}: ${data.message}`);
      socket.emit('testResponse', { message: 'Server received test event' });
    });

    socket.on('join', (data) => {
      try {
        console.log(`🔗 Join request: ${socket.id.substring(0, 8)}... requesting admin=${data?.isAdmin}`);
        
        if (data?.isAdmin) {
          // Check if admin slot is already taken by an active connection
          if (clientManager.hasAdmin()) {
            // Admin slot is taken - deny admin privileges
            const adminInfo = clientManager.getClient(clientManager.getAdmin().id);
            const clientInfo = clientManager.getClient(socket.id);
            
            socket.emit('adminDenied', { 
              reason: 'Admin already active',
              adminLocation: adminInfo ? `${adminInfo.geo.flag} ${adminInfo.geo.city}, ${adminInfo.geo.country}` : 'Unknown location'
            });
            
            // Update client info with browser/format for denied admin
            if (clientInfo) {
              clientManager.updateClientInfo(socket.id, {
                browser: data.browser || 'unknown',
                videoFormat: data.videoFormat || 'unknown'
              });
            }
            console.log(`❌ Admin denied: ${socket.id.substring(0, 8)}... (${clientInfo ? clientInfo.browser + '/' + clientInfo.videoFormat : 'unknown/unknown'}) from ${clientInfo ? clientInfo.geo.flag + ' ' + clientInfo.geo.city : 'Unknown'} - slot taken by ${clientManager.getAdmin().id.substring(0, 8)}...`);
            
            // Continue as regular viewer
            socket.isAdmin = false;
          } else {
            // No active admin - grant admin privileges
            clientManager.setAdmin(socket);
            socket.isAdmin = true;
            
            // Update client info
            clientManager.updateClientInfo(socket.id, {
              browser: data.browser || 'unknown',
              videoFormat: data.videoFormat || 'unknown'
            });
            
            const clientInfo = clientManager.getClient(socket.id);
            console.log(`👑 Admin granted to: ${socket.id.substring(0, 8)}... (${clientInfo.browser}/${clientInfo.videoFormat}) from ${clientInfo.geo.flag} ${clientInfo.geo.city}, ${clientInfo.geo.country}`);
            
            // Notify client they got admin
            socket.emit('adminGranted', { 
              message: 'You are now the admin' 
            });
          }
        } else {
          // Update client info for viewers
          clientManager.updateClientInfo(socket.id, {
            browser: data.browser || 'unknown',
            videoFormat: data.videoFormat || 'unknown'
          });
          
          // Late joiner sync: send current state to new viewers
          const currentState = sessionState.getCurrentState();
          if (clientManager.hasAdmin() && currentState.isPlaying) {
            const syncTime = sessionState.getCurrentTimeWithProgression();
            
            setTimeout(() => {
              socket.emit('syncState', {
                type: 'play',
                currentTime: syncTime,
                isPlaying: currentState.isPlaying
              });
              console.log('Late joiner sync:', socket.id, 'to time', syncTime);
            }, 1000);
          } else if (clientManager.hasAdmin() && !currentState.isPlaying) {
            setTimeout(() => {
              socket.emit('syncState', {
                type: 'pause',
                currentTime: currentState.currentTime,
                isPlaying: currentState.isPlaying
              });
              console.log('Late joiner sync (paused):', socket.id, 'to time', currentState.currentTime);
            }, 1000);
          }
        }
        
        // Log updated connection counts after role assignment
        const viewerCount = clientManager.getConnectedCount();
        const adminCount = clientManager.getAdminCount();
        console.log(`👥 Updated counts: ${viewerCount} total (${adminCount} admin${adminCount !== 1 ? 's' : ''}, ${viewerCount - adminCount} viewer${viewerCount - adminCount !== 1 ? 's' : ''})`);
        
        socket.emit('adminStatus', { hasAdmin: clientManager.hasAdmin() });
        socket.broadcast.emit('adminStatus', { hasAdmin: clientManager.hasAdmin() });
      } catch (error) {
        console.error(`❌ Error in join handler for ${socket.id.substring(0, 8)}:`, error);
      }
    });

    socket.on('control', (data) => {
      if (socket.isAdmin) {
        // Add command ID for tracking
        const commandId = syncManager.generateCommandId();
        data.commandId = commandId;
        
        // Update server state tracking
        sessionState.updateCurrentState({
          currentTime: data.currentTime,
          isPlaying: (data.type === 'play')
        });
        
        // Store command for tracking acknowledgments
        syncManager.addCommand(commandId, {
          type: data.type,
          currentTime: data.currentTime,
          isPlaying: data.isPlaying
        });
        
        socket.broadcast.emit('control', data);
        
        const clientInfo = clientManager.getClient(socket.id);
        const flag = clientInfo ? clientInfo.geo.flag : '👑';
        console.log(`🎬 Admin control: ${data.type} at ${data.currentTime.toFixed(1)}s ${flag} [${commandId}]`);
      }
    });

    socket.on('heartbeat', (data) => {
      if (socket.isAdmin) {
        // Update server state from heartbeat
        sessionState.updateCurrentState({
          currentTime: data.currentTime,
          isPlaying: true
        });
        
        socket.broadcast.emit('heartbeat', data);
      }
    });

    socket.on('ping', (data) => {
      // Immediately respond with pong for RTT measurement
      socket.emit('pong', data);
      
      // Update client network quality tracking
      clientManager.updateClientInfo(socket.id, {
        lastRTT: data.rtt || 100,
        networkQuality: calculateNetworkQuality(data.rtt || 100)
      });
    });

    socket.on('fullStateSync', (data) => {
      if (socket.isAdmin) {
        // Update server state from admin's full state
        sessionState.updateCurrentState({
          currentTime: data.currentTime,
          isPlaying: data.isPlaying
        });
        
        // Broadcast to all other clients
        socket.broadcast.emit('fullStateSync', data);
        console.log(`📡 Admin full state broadcast: ${data.isPlaying ? 'playing' : 'paused'} at ${data.currentTime.toFixed(1)}s`);
      }
    });

    // Handle viewer status updates
    socket.on('viewerStatus', (data) => {
      if (!socket.isAdmin) {
        // Store viewer state
        clientManager.updateViewerState(socket.id, data);
        
        // Simple sync check based on reported vs current state
        const currentState = sessionState.getCurrentState();
        const timeDiff = Math.abs(data.currentTime - currentState.currentTime);
        const playStateMismatch = data.isPlaying !== currentState.isPlaying;
        const tolerance = data.networkQuality === 'poor' ? 8.0 : 
                         data.networkQuality === 'fair' ? 5.0 : 3.0;
        
        // Only resync if significantly out of sync or play state mismatch
        if (timeDiff > tolerance || playStateMismatch) {
          const clientInfo = clientManager.getClient(socket.id);
          const flag = clientInfo ? clientInfo.geo.flag : '👥';
          console.log(`⚠️  Viewer out of sync: ${flag} diff=${timeDiff.toFixed(1)}s, play=${data.isPlaying}/${currentState.isPlaying}`);
          
          // Send targeted resync with current state
          socket.emit('control', {
            type: currentState.isPlaying ? 'play' : 'pause',
            currentTime: currentState.currentTime,
            isPlaying: currentState.isPlaying,
            commandId: Date.now() + '-resync-' + socket.id.substr(-4)
          });
        }
      }
    });

    // Handle sync acknowledgments
    socket.on('syncAck', (data) => {
      if (!socket.isAdmin && data.commandId) {
        const command = syncManager.addAcknowledgment(data.commandId, socket.id);
        if (command) {
          const clientInfo = clientManager.getClient(socket.id);
          const flag = clientInfo ? clientInfo.geo.flag : '👥';
          const status = data.success ? '✅' : '❌';
          console.log(`${status} Sync ack: ${flag} ${data.commandId.substr(-8)} success=${data.success} time=${data.currentTime.toFixed(1)}s`);
          
          if (!data.success) {
            // Retry failed sync
            setTimeout(() => {
              socket.emit('control', {
                type: command.type,
                currentTime: command.currentTime,
                isPlaying: command.isPlaying,
                commandId: data.commandId + '-retry'
              });
            }, 1000);
          }
        }
      }
    });

    socket.on('disconnect', () => {
      const clientInfo = clientManager.getClient(socket.id);
      const wasAdmin = socket === clientManager.getAdmin();
      
      if (clientInfo) {
        console.log(`🔴 Client disconnected: ${socket.id.substring(0, 8)}... from ${clientInfo.geo.flag} ${clientInfo.geo.city}, ${clientInfo.geo.country}`);
      } else {
        console.log(`🔴 Client disconnected: ${socket.id.substring(0, 8)}...`);
      }
      
      clientManager.removeClient(socket.id);
      
      if (wasAdmin) {
        clientManager.clearAdmin();
        io.emit('adminStatus', { hasAdmin: false });
        console.log('👑 Admin slot now available');
      }
      
      const viewerCount = clientManager.getConnectedCount();
      const adminCount = clientManager.getAdminCount();
      console.log(`👥 Total viewers: ${viewerCount} (${adminCount} admin${adminCount !== 1 ? 's' : ''}, ${viewerCount - adminCount} viewer${viewerCount - adminCount !== 1 ? 's' : ''})`);
    });
  });
}

function calculateNetworkQuality(rtt) {
  if (rtt < 50) {
    return 'excellent';
  } else if (rtt < 150) {
    return 'good';
  } else if (rtt < 300) {
    return 'fair';
  } else {
    return 'poor';
  }
}

module.exports = {
  setupSocketHandlers
};