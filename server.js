const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

// Store active room states in memory
const rooms = {}; 

io.on('connection', (socket) => {
  // 1. Create a new room
  socket.on('create-room', ({ username }) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[code] = { hostId: socket.id, users: [username] };
    
    socket.join(code);
    socket.roomCode = code;
    socket.isHost = true;

    socket.emit('room-created', { code });
  });

  // 2. Join existing room
  socket.on('join-room', ({ code, username }) => {
    const room = rooms[code];
    if (!room) {
      return socket.emit('error-msg', 'Room does not exist or has ended.');
    }

    socket.join(code);
    socket.roomCode = code;
    socket.isHost = false;
    room.users.push(username);

    io.to(code).emit('user-joined', { username, users: room.users });
  });

  // 3. Handle live messaging
  socket.on('send-message', ({ text, sender }) => {
    if (socket.roomCode) {
      io.to(socket.roomCode).emit('new-message', { text, sender });
    }
  });

  // 4. If Host leaves -> Destroy Room
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;

    if (socket.isHost) {
      // Notify everyone and close room
      io.to(code).emit('room-destroyed', 'The host has left. This chat session is closed.');
      io.in(code).socketsLeave(code);
      delete rooms[code]; // Delete room data from RAM
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
