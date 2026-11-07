
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 1e6,
    pingTimeout: 20000,
    pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Swypyy Messenger'
    });
});

// Active rooms are stored in memory.
// They disappear when the room closes or the server restarts.
const rooms = new Map();

const MAX_USERNAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_ROOM_USERS = 30;
const MAX_ROOM_MESSAGES = 100;

function cleanUsername(value) {
    if (typeof value !== 'string') return null;

    const username = value
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!username || username.length > MAX_USERNAME_LENGTH) {
        return null;
    }

    return username;
}

function cleanMessage(value) {
    if (typeof value !== 'string') return null;

    const message = value
        .replace(/\u0000/g, '')
        .trim();

    if (!message || message.length > MAX_MESSAGE_LENGTH) {
        return null;
    }

    return message;
}

function generateRoomCode() {
    return crypto.randomBytes(4)
        .toString('hex')
        .slice(0, 6)
        .toUpperCase();
}

function getRoomUsers(room) {
    return Array.from(room.users.entries()).map(([id, user]) => ({
        id,
        name: user.name,
        isHost: id === room.hostId
    }));
}

function sendError(socket, message, callback) {
    socket.emit('error-msg', message);

    if (typeof callback === 'function') {
        callback({
            ok: false,
            error: message
        });
    }
}

async function destroyRoom(code, reason) {
    const room = rooms.get(code);

    if (!room) return;

    io.to(code).emit('room-destroyed', reason);

    // Clear room information from connected members.
    const clients = await io.in(code).fetchSockets();

    for (const client of clients) {
        client.data.roomCode = null;
        client.data.isHost = false;
    }

    await io.in(code).socketsLeave(code);

    rooms.delete(code);
}

async function leaveRoom(socket) {
    const code = socket.data.roomCode;

    if (!code) return;

    const room = rooms.get(code);

    socket.data.roomCode = null;
    socket.data.isHost = false;

    if (!room) return;

    // The host leaving ends the entire temporary room.
    if (room.hostId === socket.id) {
        await destroyRoom(
            code,
            'The host has left. This chat session has ended.'
        );

        return;
    }

    const user = room.users.get(socket.id);

    if (!user) return;

    room.users.delete(socket.id);

    socket.leave(code);

    io.to(code).emit('user-left', {
        username: user.name,
        users: getRoomUsers(room)
    });
}

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    socket.data.roomCode = null;
    socket.data.isHost = false;
    socket.data.messageTimes = [];

    // CREATE ROOM
    socket.on('create-room', ({ username } = {}) => {
        if (socket.data.roomCode) {
            return sendError(
                socket,
                'Leave your current room before creating another one.'
            );
        }

        const name = cleanUsername(username);

        if (!name) {
            return sendError(
                socket,
                `Enter a name between 1 and ${MAX_USERNAME_LENGTH} characters.`
            );
        }

        let code;
        let attempts = 0;

        do {
            code = generateRoomCode();
            attempts++;
        } while (rooms.has(code) && attempts < 10);

        if (rooms.has(code)) {
            return sendError(
                socket,
                'Could not create a room. Please try again.'
            );
        }

        const room = {
            hostId: socket.id,
            users: new Map(),
            messages: [],
            createdAt: Date.now()
        };

        room.users.set(socket.id, {
            name
        });

        rooms.set(code, room);

        socket.join(code);
        socket.data.roomCode = code;
        socket.data.isHost = true;

        socket.emit('room-created', {
            code,
            users: getRoomUsers(room),
            messages: []
        });

        console.log(`Room created: ${code}`);
    });

    // JOIN ROOM
    socket.on('join-room', ({ code, username } = {}) => {
        if (socket.data.roomCode) {
            return sendError(
                socket,
                'Leave your current room before joining another one.'
            );
        }

        const name = cleanUsername(username);

        if (!name) {
            return sendError(
                socket,
                `Enter a name between 1 and ${MAX_USERNAME_LENGTH} characters.`
            );
        }

        const roomCode = typeof code === 'string'
            ? code.trim().toUpperCase()
            : '';

        if (!/^[A-F0-9]{6}$/.test(roomCode)) {
            return sendError(
                socket,
                'Enter a valid six-character room code.'
            );
        }

        const room = rooms.get(roomCode);

        if (!room) {
            return sendError(
                socket,
                'Room does not exist or has already ended.'
            );
        }

        if (room.users.size >= MAX_ROOM_USERS) {
            return sendError(
                socket,
                'This room has reached its maximum capacity.'
            );
        }

        room.users.set(socket.id, {
            name
        });

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.isHost = false;

        // Confirm the join before the client opens the chat.
        socket.emit('room-joined', {
            code: roomCode,
            users: getRoomUsers(room),
            messages: room.messages
        });

        socket.to(roomCode).emit('user-joined', {
            username: name,
            users: getRoomUsers(room)
        });

        console.log(`${name} joined room ${roomCode}`);
    });

    // SEND MESSAGE
    socket.on('send-message', ({ text } = {}, callback) => {
        const code = socket.data.roomCode;
        const room = rooms.get(code);

        if (!room || !room.users.has(socket.id)) {
            return sendError(
                socket,
                'You are no longer in this room.',
                callback
            );
        }

        const messageText = cleanMessage(text);

        if (!messageText) {
            return sendError(
                socket,
                'Messages must contain 1 to 1000 characters.',
                callback
            );
        }

        // Basic per-socket rate limit.
        const now = Date.now();

        socket.data.messageTimes = socket.data.messageTimes
            .filter(time => now - time < 5000);

        if (socket.data.messageTimes.length >= 8) {
            return sendError(
                socket,
                'You are sending messages too quickly. Please slow down.',
                callback
            );
        }

        socket.data.messageTimes.push(now);

        const user = room.users.get(socket.id);

        const message = {
            id: crypto.randomUUID(),
            text: messageText,
            sender: user.name,
            senderId: socket.id,
            createdAt: now
        };

        room.messages.push(message);

        // Keep only the latest messages in memory.
        if (room.messages.length > MAX_ROOM_MESSAGES) {
            room.messages.shift();
        }

        // Broadcast to everyone except the sender.
        socket.to(code).emit('new-message', message);

        if (typeof callback === 'function') {
            callback({
                ok: true,
                message
            });
        }
    });

    // TYPING INDICATOR
    socket.on('typing', ({ isTyping } = {}) => {
        const code = socket.data.roomCode;
        const room = rooms.get(code);

        if (!room || !room.users.has(socket.id)) return;

        const user = room.users.get(socket.id);

        socket.to(code).emit('typing-update', {
            userId: socket.id,
            username: user.name,
            isTyping: Boolean(isTyping)
        });
    });

    // LEAVE ROOM
    socket.on('leave-room', async () => {
        await leaveRoom(socket);

        socket.emit('room-left');
    });

    // DISCONNECT
    socket.on('disconnect', async () => {
        await leaveRoom(socket);

        console.log('Disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Swypyy Messenger running on port ${PORT}`);
});
