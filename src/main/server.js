// Multiplayer Server for Colonization
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files for browser testing
app.use(express.static(path.join(__dirname, '..', 'ui')));

// Store active rooms
const rooms = new Map();

// Generate random room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create room
    socket.on('create-room', ({ roomName, playerName, maxPlayers, color }) => {
        const roomCode = generateRoomCode();
        const defaultColors = ['red', 'blue', 'yellow', 'green'];
        const usedColors = new Set();
        
        const room = {
            code: roomCode,
            name: roomName || 'Кімната',
            host: socket.id,
            maxPlayers: maxPlayers || 4,
            players: [{
                id: socket.id,
                name: playerName || 'Гравець',
                isHost: true,
                color: color || defaultColors[0]
            }],
            gameState: null,
            createdAt: Date.now()
        };
        
        if (room.players[0].color) {
            usedColors.add(room.players[0].color);
        }
        
        rooms.set(roomCode, room);
        socket.join(roomCode);
        
        socket.emit('room-created', {
            roomCode,
            roomName: room.name,
            maxPlayers: room.maxPlayers,
            players: room.players
        });
        
        // Notify all clients about room list update
        io.emit('rooms-list', getRoomsList());
    });

    // Join room
    socket.on('join-room', ({ roomCode, playerName, color }) => {
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('join-error', { message: 'Кімната не знайдена' });
            return;
        }
        
        if (room.players.length >= room.maxPlayers) {
            socket.emit('join-error', { message: 'Кімната заповнена' });
            return;
        }
        
        const defaultColors = ['red', 'blue', 'yellow', 'green'];
        const usedColors = new Set(room.players.map(p => p.color).filter(c => c));
        
        let assignedColor = color;
        if (!assignedColor || usedColors.has(assignedColor)) {
            // Assign first available default color
            assignedColor = defaultColors.find(c => !usedColors.has(c)) || defaultColors[room.players.length];
        }
        
        room.players.push({
            id: socket.id,
            name: playerName || 'Гравець',
            isHost: false,
            color: assignedColor
        });
        
        socket.join(roomCode);
        
        // Notify all players in room about new player (including full player list with socket IDs)
        io.to(roomCode).emit('player-joined', {
            player: { id: socket.id, name: playerName || 'Гравець', color: assignedColor },
            players: room.players
        });
        
        socket.emit('room-joined', {
            roomCode,
            roomName: room.name,
            players: room.players
        });
        
        // Update room list
        io.emit('rooms-list', getRoomsList());
    });

    // Get rooms list
    socket.on('get-rooms', () => {
        socket.emit('rooms-list', getRoomsList());
    });

    // Store map state (host sends map to server)
    socket.on('store-map', ({ roomCode, mapData }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            room.gameState = mapData;
        }
    });

    // Start game
    socket.on('start-game', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            // Send map seed for synchronization
            const mapSeed = room.gameState || {
                center: {q:0,r:0,s:0},
                ring1: [],
                ring2: [],
                ring3: [],
                resources: {},
                numbers: {}
            };
            io.to(roomCode).emit('game-started', { mapSeed });
        }
    });

    // Change player color
    socket.on('change-color', ({ roomCode, playerId, color }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === playerId);
        if (!player) return;

        // Check if the requested color is already taken by another player
        const usedColors = new Set(room.players.filter(p => p.id !== playerId).map(p => p.color).filter(c => c));
        if (usedColors.has(color)) {
            // Color is taken, notify the requester
            socket.emit('color-change-failed', { playerId, color, message: 'Цей колір вже зайнятий' });
            return;
        }

        // Update the player's color
        player.color = color;

        // Broadcast the updated player list to all players in the room
        io.to(roomCode).emit('color-changed', {
            playerId,
            color,
            players: room.players
        });
    });

    // Game actions
    socket.on('game-action', ({ roomCode, action, data }) => {
        socket.to(roomCode).emit('game-action', { action, data });
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);


        
        // Remove player from rooms
        rooms.forEach((room, code) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const wasHost = room.host === socket.id;
                room.players.splice(playerIndex, 1);
                
                // If host left, delete room and notify all players
                if (wasHost) {
                    io.to(code).emit('room-closed', {
                        message: 'Хозяїн вийшов з кімнати'
                    });
                    rooms.delete(code);
                } else {
                    io.to(code).emit('player-left', {
                        playerId: socket.id,
                        players: room.players
                    });
                    
                    // If room is empty, delete it
                    if (room.players.length === 0) {
                        rooms.delete(code);
                    }
                }
            }
        });
        
        // Update room list
        io.emit('rooms-list', getRoomsList());
    });

    // Leave room explicitly
    socket.on('leave-room', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const wasHost = room.host === socket.id;
                room.players.splice(playerIndex, 1);
                
                // If host left, delete room and notify all players
                if (wasHost) {
                    io.to(roomCode).emit('room-closed', {
                        message: 'Хозяїн вийшов з кімнати'
                    });
                    rooms.delete(roomCode);
                } else {
                    io.to(roomCode).emit('player-left', {
                        playerId: socket.id,
                        players: room.players
                    });
                    
                    // If room is empty, delete it
                    if (room.players.length === 0) {
                        rooms.delete(roomCode);
                    }
                }
                
                // Update room list
                io.emit('rooms-list', getRoomsList());
            }
        }
    });
});

// Get simplified rooms list for clients
function getRoomsList() {
    return Array.from(rooms.values()).map(room => ({
        code: room.code,
        name: room.name,
        players: room.players.length,
        maxPlayers: room.maxPlayers
    }));
}

// Start server (only if not in Electron context)
const PORT = process.env.PORT || 3000;
let serverStarted = false;
let publicIp = null;

// Get public IP address
async function getPublicIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        publicIp = data.ip;
        console.log(`Public IP: ${publicIp}`);
        return publicIp;
    } catch (error) {
        console.error('Failed to get public IP:', error);
        return null;
    }
}

// Get local IP address
function getLocalIp() {
    const interfaces = require('os').networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function startServer() {
    if (serverStarted) return;
    serverStarted = true;
    server.listen(PORT, '0.0.0.0', () => {
        const localIp = getLocalIp();
        console.log(`Multiplayer server running on port ${PORT}`);
        console.log(`Local URL: http://${localIp}:${PORT}`);
        console.log(`Localhost URL: http://localhost:${PORT}`);
        getPublicIp().then(ip => {
            if (ip) {
                console.log(`Public URL: http://${ip}:${PORT}`);
            }
        });
    });
}

// Auto-start if run directly (not imported)
if (require.main === module) {
    startServer();
}

module.exports = { io, rooms, startServer, getPublicIp, getLocalIp };
