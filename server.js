const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let sessionConfig = {};
let adminSocket = null;
let connectedClients = new Set();

function loadSessionConfig() {
  try {
    const configData = fs.readFileSync('./session.json', 'utf8');
    sessionConfig = JSON.parse(configData);
    console.log(`Loaded session: ${sessionConfig.slug}`);
  } catch (error) {
    console.error('Error loading session.json:', error.message);
    console.log('Please ensure session.json exists and is valid JSON');
    process.exit(1);
  }
}

loadSessionConfig();

app.use(express.static('public'));

app.get(`/${sessionConfig.slug}`, (req, res) => {
  const isAdmin = req.query.admin !== undefined;
  
  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Movie Night</title>
    <style>
        body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        video { max-width: 100%; max-height: 100vh; }
        .status { position: fixed; top: 10px; right: 10px; color: white; font-family: monospace; background: rgba(0,0,0,0.7); padding: 5px; }
    </style>
</head>
<body>
    <video id="video" controls autoplay muted crossorigin="anonymous">
        <source src="${sessionConfig.videoUrl}" type="video/webm">
    </video>
    <div id="status" class="status">${isAdmin ? 'ADMIN' : 'VIEWER'}</div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const video = document.getElementById('video');
        const status = document.getElementById('status');
        const isAdmin = ${isAdmin};
        let lastHeartbeat = Date.now();
        let syncInProgress = false;

        socket.emit('join', { isAdmin, startTime: ${sessionConfig.startTime} });

        if (isAdmin) {
            video.addEventListener('play', () => {
                socket.emit('control', { type: 'play', currentTime: video.currentTime });
            });
            
            video.addEventListener('pause', () => {
                socket.emit('control', { type: 'pause', currentTime: video.currentTime });
            });
            
            video.addEventListener('seeked', () => {
                socket.emit('control', { type: 'seek', currentTime: video.currentTime });
            });

            setInterval(() => {
                if (!video.paused) {
                    socket.emit('heartbeat', { currentTime: video.currentTime });
                }
            }, 3000);
        }

        socket.on('control', (data) => {
            if (!isAdmin && !syncInProgress) {
                syncInProgress = true;
                
                if (data.type === 'play') {
                    video.currentTime = data.currentTime;
                    video.play();
                } else if (data.type === 'pause') {
                    video.currentTime = data.currentTime;
                    video.pause();
                } else if (data.type === 'seek') {
                    video.currentTime = data.currentTime;
                }
                
                setTimeout(() => { syncInProgress = false; }, 100);
            }
        });

        socket.on('heartbeat', (data) => {
            if (!isAdmin && !syncInProgress) {
                const timeDiff = Math.abs(video.currentTime - data.currentTime);
                if (timeDiff > 0.5 && !video.paused) {
                    syncInProgress = true;
                    video.currentTime = data.currentTime;
                    setTimeout(() => { syncInProgress = false; }, 100);
                }
            }
            lastHeartbeat = Date.now();
        });

        socket.on('adminStatus', (data) => {
            status.textContent = isAdmin ? 'ADMIN' : (data.hasAdmin ? 'VIEWER' : 'NO ADMIN');
        });

        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
    </script>
</body>
</html>`;
  
  res.send(html);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  connectedClients.add(socket);

  socket.on('join', (data) => {
    if (data.isAdmin) {
      if (adminSocket) {
        adminSocket.isAdmin = false;
      }
      adminSocket = socket;
      socket.isAdmin = true;
      console.log('Admin connected:', socket.id);
    }
    
    socket.emit('adminStatus', { hasAdmin: !!adminSocket });
    socket.broadcast.emit('adminStatus', { hasAdmin: !!adminSocket });
  });

  socket.on('control', (data) => {
    if (socket.isAdmin) {
      socket.broadcast.emit('control', data);
      console.log('Admin control:', data.type, 'at', data.currentTime);
    }
  });

  socket.on('heartbeat', (data) => {
    if (socket.isAdmin) {
      socket.broadcast.emit('heartbeat', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    connectedClients.delete(socket);
    
    if (socket === adminSocket) {
      adminSocket = null;
      io.emit('adminStatus', { hasAdmin: false });
      console.log('Admin disconnected');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Session URL: http://localhost:${PORT}/${sessionConfig.slug}`);
  console.log(`Admin URL: http://localhost:${PORT}/${sessionConfig.slug}?admin`);
});