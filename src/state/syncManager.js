class SyncManager {
  constructor() {
    this.syncCommands = new Map();
  }

  addCommand(commandId, commandData) {
    this.syncCommands.set(commandId, {
      ...commandData,
      timestamp: Date.now(),
      acks: new Set()
    });
  }

  addAcknowledgment(commandId, socketId) {
    const command = this.syncCommands.get(commandId);
    if (command) {
      command.acks.add(socketId);
      return command;
    }
    return null;
  }

  getCommand(commandId) {
    return this.syncCommands.get(commandId);
  }

  removeCommand(commandId) {
    this.syncCommands.delete(commandId);
  }

  generateCommandId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  cleanupOldCommands(maxAge = 30000) { // 30 seconds
    const now = Date.now();
    for (const [commandId, command] of this.syncCommands.entries()) {
      if (now - command.timestamp > maxAge) {
        this.syncCommands.delete(commandId);
      }
    }
  }
}

module.exports = SyncManager;