const { networkQualityEmojis } = require('../config/constants');

class ClientManager {
  constructor() {
    this.connectedClients = new Map();
    this.adminSocket = null;
    this.viewerStates = new Map();
  }

  addClient(socket, clientInfo) {
    this.connectedClients.set(socket.id, {
      id: socket.id,
      ...clientInfo,
      connectedAt: new Date(),
      networkQuality: 'good',
      lastRTT: 100,
      browser: 'unknown',
      videoFormat: 'unknown'
    });
  }

  removeClient(socketId) {
    this.connectedClients.delete(socketId);
    this.viewerStates.delete(socketId);
  }

  updateClientInfo(socketId, updates) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      Object.assign(client, updates);
    }
  }

  setAdmin(socket) {
    this.adminSocket = socket;
    const client = this.connectedClients.get(socket.id);
    if (client) {
      client.isAdmin = true;
    }
  }

  clearAdmin() {
    this.adminSocket = null;
  }

  hasAdmin() {
    return this.adminSocket && this.adminSocket.connected;
  }

  getAdmin() {
    return this.adminSocket;
  }

  getClient(socketId) {
    return this.connectedClients.get(socketId);
  }

  getAllClients() {
    return Array.from(this.connectedClients.values());
  }

  getConnectedCount() {
    return this.connectedClients.size;
  }

  getAdminCount() {
    return Array.from(this.connectedClients.values()).filter(c => c.isAdmin).length;
  }

  getViewerCount() {
    return this.getConnectedCount() - this.getAdminCount();
  }

  updateViewerState(socketId, state) {
    this.viewerStates.set(socketId, {
      ...state,
      lastUpdate: Date.now()
    });
  }

  getViewerState(socketId) {
    return this.viewerStates.get(socketId);
  }

  showCurrentViewers(currentState) {
    console.log('\n📊 Current Viewers:');
    if (this.connectedClients.size === 0) {
      console.log('   No viewers connected');
      return;
    }
    
    const clients = Array.from(this.connectedClients.values());
    clients.forEach((client, index) => {
      const duration = Math.floor((Date.now() - client.connectedAt.getTime()) / 1000);
      const role = client.isAdmin ? '👑 ADMIN' : '👥 VIEWER';
      
      const networkIndicator = networkQualityEmojis[client.networkQuality] || '⚪';
      const rttText = client.lastRTT ? `${client.lastRTT}ms` : 'measuring...';
      
      // Sync status for viewers (staleness-aware)
      let syncStatus = '';
      if (!client.isAdmin) {
        const viewerState = this.viewerStates.get(client.id);
        if (viewerState) {
          const reportAge = (Date.now() - viewerState.lastUpdate) / 1000;
          
          if (reportAge > 6) {
            syncStatus = ` ❓ No data (${Math.floor(reportAge)}s ago)`;
          } else if (reportAge > 2.5) {
            syncStatus = ` ⏰ Stale (${Math.floor(reportAge)}s ago)`;
          } else {
            if (viewerState.buffering) {
              syncStatus = ' 🔄';
            } else {
              const playSync = viewerState.isPlaying === currentState.isPlaying;
              
              let expectedServerTime = currentState.currentTime;
              if (currentState.isPlaying) {
                const timeSinceServerUpdate = (Date.now() - currentState.lastUpdate) / 1000;
                expectedServerTime = currentState.currentTime + timeSinceServerUpdate;
              }
              
              const timeDiff = Math.abs(viewerState.currentTime - expectedServerTime);
              const tolerance = viewerState.networkQuality === 'poor' ? 10.0 : 
                               viewerState.networkQuality === 'fair' ? 8.0 : 5.0;
              
              if (timeDiff <= tolerance && playSync) {
                syncStatus = ' ✅';
              } else {
                syncStatus = ` ❌(${timeDiff.toFixed(1)}s)`;
              }
            }
          }
        } else {
          syncStatus = ' ❓ Never reported';
        }
      }
      
      const browserInfo = client.browser && client.videoFormat ? ` [${client.browser}/${client.videoFormat}]` : '';
      console.log(`   ${index + 1}. ${role} ${networkIndicator} ${client.geo.flag} ${client.geo.city}, ${client.geo.country}${browserInfo} (${duration}s, ${rttText})${syncStatus}`);
    });
    
    // Summary with staleness awareness
    const viewers = clients.filter(c => !c.isAdmin);
    let freshInSync = 0;
    let staleReports = 0;
    let veryStale = 0;
    let neverReported = 0;
    
    viewers.forEach(c => {
      const state = this.viewerStates.get(c.id);
      if (!state) {
        neverReported++;
        return;
      }
      
      const reportAge = (Date.now() - state.lastUpdate) / 1000;
      
      if (reportAge > 6) {
        veryStale++;
      } else if (reportAge > 2.5) {
        staleReports++;
      } else {
        const playSync = state.isPlaying === currentState.isPlaying;
        
        let expectedServerTime = currentState.currentTime;
        if (currentState.isPlaying) {
          const timeSinceServerUpdate = (Date.now() - currentState.lastUpdate) / 1000;
          expectedServerTime = currentState.currentTime + timeSinceServerUpdate;
        }
        
        const timeDiff = Math.abs(state.currentTime - expectedServerTime);
        const tolerance = state.networkQuality === 'poor' ? 10.0 : 
                         state.networkQuality === 'fair' ? 8.0 : 5.0;
        
        if (timeDiff <= tolerance && playSync && !state.buffering) {
          freshInSync++;
        }
      }
    });
    
    if (viewers.length > 0) {
      let summary = `\n   Sync Status: ${freshInSync}/${viewers.length} confirmed in sync`;
      if (staleReports > 0) summary += `, ${staleReports} stale`;
      if (veryStale > 0) summary += `, ${veryStale} no recent data`;
      if (neverReported > 0) summary += `, ${neverReported} never reported`;
      console.log(summary);
    }
    console.log('');
  }
}

module.exports = ClientManager;