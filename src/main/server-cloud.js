// Multiplayer Server for Colonization - Cloud Production Version
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
    socket.on('create-room', ({ roomName, playerName, maxPlayers }) => {
        const roomCode = generateRoomCode();
        const room = {
            code: roomCode,
            name: roomName || 'Кімната',
            host: socket.id,
            maxPlayers: maxPlayers || 4,
            players: [{
                id: socket.id,
                name: playerName || 'Гравець',
                isHost: true
            }],
            gameState: null,
            createdAt: Date.now()
        };
        
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
    socket.on('join-room', ({ roomCode, playerName }) => {
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('join-error', { message: 'Кімната не знайдена' });
            return;
        }
        
        if (room.players.length >= room.maxPlayers) {
            socket.emit('join-error', { message: 'Кімната заповнена' });
            return;
        }
        
        room.players.push({
            id: socket.id,
            name: playerName || 'Гравець',
            isHost: false
        });
        
        socket.join(roomCode);
        
        // Notify all players in room about new player (including full player list with socket IDs)
        io.to(roomCode).emit('player-joined', {
            player: { id: socket.id, name: playerName || 'Гравець' },
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

    // Rejoin room after page navigation (when game starts)
    // The room still exists because we DON'T delete it on disconnect during game
    socket.on('rejoin-room', ({ roomCode, isHost }) => {
        const room = rooms.get(roomCode);
        
        if (!room) {
            // Room was somehow deleted (unlikely now), reject
            console.log(`Player ${socket.id} tried to rejoin non-existent room ${roomCode}`);
            return;
        }
        
        if (isHost) {
            room.host = socket.id;
        }
        
        // Check if this player already exists (from a previous reconnect)
        let existingPlayer = room.players.find(p => p.id === socket.id);
        if (!existingPlayer) {
            // Player not in room, add them
            room.players.push({
                id: socket.id,
                name: 'Гравець',
                isHost: isHost
            });
        } else {
            // Update the existing player entry
            existingPlayer.isHost = isHost;
        }
        
        socket.join(roomCode);
        console.log(`Player ${socket.id} rejoined room ${roomCode} (host: ${isHost})`);
        
        // Send the stored game state (map + buildings) to the rejoining player
        if (room.gameState) {
            socket.emit('game-started', { mapSeed: room.gameState });
        }
        
        // Also send current buildings if any (stored separately in room)
        if (room.buildings) {
            socket.emit('sync-buildings', { buildings: room.buildings });
        }
    });

    // Sync buildings (road, settlement, city) to all players in the room
    socket.on('sync-build', ({ roomCode, type, data }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        // Store the building in room state
        if (!room.buildings) {
            room.buildings = { roads: [], settlements: [], cities: [] };
        }
        
        if (type === 'road') {
            if (!room.buildings.roads.includes(data.edgeKey)) {
                room.buildings.roads.push(data.edgeKey);
            }
        } else if (type === 'settlement') {
            if (!room.buildings.settlements.some(s => s === data.vertexKey)) {
                room.buildings.settlements.push(data.vertexKey);
            }
        } else if (type === 'city') {
            // Remove from settlements and add to cities
            room.buildings.settlements = room.buildings.settlements.filter(s => s !== data.vertexKey);
            if (!room.buildings.cities.includes(data.vertexKey)) {
                room.buildings.cities.push(data.vertexKey);
            }
        }
        
        // Broadcast to ALL OTHER players in the room (not the sender)
        socket.to(roomCode).emit('game-action', { 
            action: 'build', 
            data: { type, ...data } 
        });
    });

    // Game actions (generic forwarding)
    socket.on('game-action', ({ roomCode, action, data }) => {
        socket.to(roomCode).emit('game-action', { action, data });
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        // IMPORTANT: We do NOT delete rooms on disconnect anymore!
        // The room stays alive so players can rejoin after page navigation.
        // Just remove the player from the room's player list.
        rooms.forEach((room, code) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                
                // Notify remaining players that this player left (temporarily)
                io.to(code).emit('player-left', {
                    playerId: socket.id,
                    players: room.players
                });
            }
        });
        
        // Update room list
        io.emit('rooms-list', getRoomsList());
    });

    // Leave room explicitly (player clicks "Вийти" button - also delete room if host)
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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Cloud multiplayer server running on port ${PORT}`);
});

module.exports = { io, rooms, getRoomsList };