// Multiplayer Server for Colonization - Unified Version
// Supports both local and cloud deployment
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

// Serve static files for browser testing (local mode only)
const isCloud = process.env.CLOUD === 'true';
if (!isCloud) {
    app.use(express.static(path.join(__dirname, '..', 'ui')));
}

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

// ===== HELPER FUNCTIONS FOR SERVER-SIDE VALIDATION =====
// Check if edge (road) belongs to player
function isMyServerRoad(edgeKey, playerId, room) {
    const bld = room.buildings.get(edgeKey);
    return bld && bld.playerId === playerId;
}

// Check if vertex (settlement/city) belongs to player
function isMyServerVertex(vertexKey, playerId, room) {
    const bld = room.buildings.get(vertexKey);
    return bld && bld.playerId === playerId;
}

// Check if edge is connected to player's existing network (own settlements or roads)
function isEdgeConnectedServer(edgeKey, playerId, room) {
    if (!room.topology) return true;
    const edgeMap = new Map(room.topology.edges);
    const edge = edgeMap.get(edgeKey);
    if (!edge) return false;
    
    const va = edge.va;
    const vb = edge.vb;

    // ========== ДОДАЙТЕ ЦЕЙ БЛОК ==========
    // Знаходимо ключі вершин за їх координатами
    const vertexMap = new Map(room.topology.vertices);
    // Знаходимо ключі вершин за їх координатами з допуском 0.001
    let vkA = null, vkB = null;
    for (const [vk, vData] of vertexMap) {
        if (Math.abs(vData.pos.x - va.x) < 0.001 && Math.abs(vData.pos.y - va.y) < 0.001) vkA = vk;
        if (Math.abs(vData.pos.x - vb.x) < 0.001 && Math.abs(vData.pos.y - vb.y) < 0.001) vkB = vk;
    }
    // ======================================

    if (vkA && isMyServerVertex(vkA, playerId, room)) return true;
    if (vkB && isMyServerVertex(vkB, playerId, room)) return true;
    
    for (const [ek2, bld] of room.buildings) {
        if (bld.type !== 'road' || bld.playerId !== playerId) continue;
        const edge2 = edgeMap.get(ek2);
        if (!edge2) continue;
        
        // Use rounding to avoid floating point precision issues
        const round3 = (n) => Math.round(n * 1000);
        if ((round3(edge2.va.x) === round3(va.x) && round3(edge2.va.y) === round3(va.y)) ||
            (round3(edge2.va.x) === round3(vb.x) && round3(edge2.va.y) === round3(vb.y)) ||
            (round3(edge2.vb.x) === round3(va.x) && round3(edge2.vb.y) === round3(va.y)) ||
            (round3(edge2.vb.x) === round3(vb.x) && round3(edge2.vb.y) === round3(vb.y))) {
            return true;
        }
    }
    return false;
}

// Check if settlement can be placed (not within 2 edges of OTHER players' buildings)
function canPlaceSettlementServer(vertexKey, playerId, room) {
    if (!room.topology) return true;
    const vertexMap = new Map(room.topology.vertices);
    const vData = vertexMap.get(vertexKey);
    if (!vData) return false;

    const neighborKeys = [];
    const edgeMap = new Map(room.topology.edges);
    for (const [ek, edge] of edgeMap) {
        // ===== ДОДАЙТЕ ЦІ ДВА РЯДКИ =====
        if (!edge.va || !edge.vb) continue; // Пропускаємо ребро, якщо немає координат
        // ==================================

        // Use rounding to avoid floating point precision issues
        const round3 = (n) => Math.round(n * 1000);
        if ((round3(edge.va.x) === round3(vData.pos.x) && round3(edge.va.y) === round3(vData.pos.y)) ||
            (round3(edge.vb.x) === round3(vData.pos.x) && round3(edge.vb.y) === round3(vData.pos.y))) {
            const target = (round3(edge.va.x) === round3(vData.pos.x) && round3(edge.va.y) === round3(vData.pos.y)) ? edge.vb : edge.va;
            for (const [vk2, v2] of vertexMap) {
                if (round3(v2.pos.x) === round3(target.x) && round3(v2.pos.y) === round3(target.y)) neighborKeys.push(vk2);
            }
        }
    }

    for (const [vk2, bld] of room.buildings) {
        if (bld.type === 'settlement' || bld.type === 'city') {
            if (vk2 === vertexKey) return false;
            if (neighborKeys.includes(vk2)) return false;
        }
    }
    return true;
}
// ===== END HELPER FUNCTIONS =====

// Helper: get buildings array for sending to clients
function getBuildingsArray(room) {
    return Array.from(room.buildings.entries()).map(([key, val]) => ({key, ...val}));
}

// Helper: sync buildings to all players in room
function syncBuildingsToRoom(roomCode, room) {
    const buildingsData = getBuildingsArray(room);
    io.to(roomCode).emit('sync-buildings', { buildings: buildingsData });
    return buildingsData;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create room
    socket.on('create-room', ({ roomName, playerName, maxPlayers, color }) => {
        // Check if room name already exists
        const existingRoom = Array.from(rooms.values()).find(room => 
            room.name.toLowerCase() === (roomName || 'Кімната').toLowerCase()
        );
        
        if (existingRoom) {
            socket.emit('create-room-error', { 
                message: 'Кімната з такою назвою вже існує!' 
            });
            return;
        }
        
        const roomCode = generateRoomCode();
        const defaultColors = ['red', 'blue', 'yellow', 'green'];
        
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
            createdAt: Date.now(),
            status: 'waiting', // 'waiting' or 'in-game'
            gamePhase: null, // 'dice-roll', 'initial-build', 'regular-turn'
            diceRolls: new Map(), // playerId -> total
            initialBuildOrder: [], // sorted array of {playerId, total}
            currentInitialBuildIndex: 0,
            initialBuildRoundComplete: false,
            turnOrder: [], // order of players for regular turns (same as dice roll order)
            currentTurnIndex: 0,
            turnState: {
                diceRolled: false, // has current player rolled?
                actionsLocked: true // locked until dice rolled
            },
            buildings: new Map(), // edgeKey/vertexKey -> {playerId, color, type}
            topology: null, // Cloud version topology support
            // ===== NEW: Robber and Dev Card state =====
            robber: { hexKey: null, placedBy: null }, // {hexKey: 'q,r,s', placedBy: playerId}
            devCardHands: new Map(), // playerId -> array of dev cards
            knightCards: new Map() // playerId -> count of active knights
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
    socket.on('join-room', ({ roomCode, playerName, color }) => {
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('join-error', { message: 'Кімната не знайдена' });
            return;
        }
        
        // Don't allow joining in-game rooms
        if (room.status === 'in-game') {
            socket.emit('join-error', { message: 'Гра вже розпочата! Не можна приєднатися.' });
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

    // Rejoin room after page navigation
    socket.on('rejoin-room', ({ roomCode, isHost, oldPlayerId }) => {
        console.log('[server] rejoin-room', { roomCode, isHost, oldPlayerId, socketId: socket.id });
        const room = rooms.get(roomCode);
        if (!room) return;

        // Preserve the same player record on reconnect
        if (oldPlayerId) {
            const oldPlayerIndex = room.players.findIndex(p => p.id === oldPlayerId);
            if (oldPlayerIndex !== -1) {
                room.players[oldPlayerIndex].id = socket.id;
                room.players[oldPlayerIndex].disconnected = false;
            }

            if (room.turnOrder) {
                room.turnOrder = room.turnOrder.map(pid => pid === oldPlayerId ? socket.id : pid);
            }

            if (room.initialBuildOrder) {
                room.initialBuildOrder = room.initialBuildOrder.map(item => {
                    if (item.playerId === oldPlayerId) {
                        return { ...item, playerId: socket.id };
                    }
                    return item;
                });
            }

            if (room.diceRolls && room.diceRolls.has(oldPlayerId)) {
                const roll = room.diceRolls.get(oldPlayerId);
                room.diceRolls.delete(oldPlayerId);
                room.diceRolls.set(socket.id, roll);
            }

            if (room.initialBuildProgress && room.initialBuildProgress.has(oldPlayerId)) {
                const progress = room.initialBuildProgress.get(oldPlayerId);
                room.initialBuildProgress.delete(oldPlayerId);
                room.initialBuildProgress.set(socket.id, progress);
            }

            if (room.buildings) {
                for (const [key, building] of room.buildings.entries()) {
                    if (building.playerId === oldPlayerId) {
                        room.buildings.set(key, { ...building, playerId: socket.id });
                    }
                }
            }
        }

        if (isHost) room.host = socket.id;

        // Check if player already exists in the room (by socket.id or oldPlayerId)
        let existingPlayer = room.players.find(p => p.id === socket.id);
        
        // Also check if oldPlayerId still exists (in case it wasn't updated above)
        if (!existingPlayer && oldPlayerId && oldPlayerId !== socket.id) {
            const oldPlayerIndex = room.players.findIndex(p => p.id === oldPlayerId);
            if (oldPlayerIndex !== -1) {
                // Update the old player's ID to the new socket ID
                room.players[oldPlayerIndex].id = socket.id;
                room.players[oldPlayerIndex].disconnected = false;
                existingPlayer = room.players[oldPlayerIndex];
                console.log('[server] rejoin-room: found player by oldPlayerId on second attempt', { oldPlayerId, newSocketId: socket.id });
            }
        }
        
        if (!existingPlayer) {
            console.log('[server] rejoin-room: player not found, pushing new player', { roomCode, socketId: socket.id, oldPlayerId });
            room.players.push({
                id: socket.id,
                name: 'Гравець',
                isHost: isHost,
                color: 'red'
            });
        } else {
            console.log('[server] rejoin-room: player found, no duplicate created', { roomCode, socketId: socket.id });
        }

        socket.join(roomCode);

        // Always send map and buildings
        if (room.gameState) socket.emit('game-started', { mapSeed: room.gameState });
        if (room.buildings) {
            socket.emit('sync-buildings', { buildings: getBuildingsArray(room) });
        }

        // Send game state based on current phase
        if (room.gamePhase === 'dice-roll') {
            const diceRolls = Array.from(room.diceRolls.entries()).map(([playerId, total]) => ({ playerId, total }));
            const playersList = room.players.map(p => ({ id: p.id, name: p.name }));
            // Emit start-dice-phase (primary event)
            socket.emit('start-dice-phase', {
                players: playersList,
                diceRolls
            });
            // Also emit game-state-sync as a fallback (in case start-dice-phase was missed)
            socket.emit('game-state-sync', {
                gamePhase: room.gamePhase,
                players: playersList,
                diceRolls: diceRolls
            });
        } else if (room.gamePhase === 'initial-build') {
            const currentPlayerId = room.initialBuildOrder[room.currentInitialBuildIndex]?.playerId;
            
            // Send state sync
            socket.emit('game-state-sync', {
                gamePhase: room.gamePhase,
                currentPlayerId: currentPlayerId,
                initialBuildOrder: room.initialBuildOrder,
                currentIndex: room.currentInitialBuildIndex,
                buildings: getBuildingsArray(room)
            });

            // Explicitly send turn events
            if (currentPlayerId === socket.id) {
                socket.emit('initial-build-your-turn', {
                    playerId: socket.id,
                    order: room.initialBuildOrder
                });
            } else if (currentPlayerId) {
                const yourPosition = room.initialBuildOrder.findIndex(p => p.playerId === socket.id);
                socket.emit('initial-build-waiting', {
                    currentPlayerId: currentPlayerId,
                    yourPosition: yourPosition,
                    order: room.initialBuildOrder
                });
            }
        } else if (room.gamePhase === 'regular-turn') {
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            socket.emit('game-state-sync', {
                gamePhase: room.gamePhase,
                currentTurnPlayerId: currentPlayerId,
                turnOrder: room.turnOrder,
                buildings: getBuildingsArray(room)
            });
            if (currentPlayerId === socket.id) {
                socket.emit('your-turn', {
                    playerId: currentPlayerId,
                    mustRollDice: !room.turnState.diceRolled
                });
            } else {
                socket.emit('waiting-for-turn', {
                    currentPlayerId: currentPlayerId,
                    yourPosition: room.turnOrder.indexOf(socket.id)
                });
            }
        }
    });

    // Client can explicitly request current game state (fallback if events were missed)
    socket.on('request-game-state', ({ roomCode, oldPlayerId }) => {
        console.log('[server] request-game-state', { roomCode, socketId: socket.id, oldPlayerId });
        const room = rooms.get(roomCode);
        if (!room) return;

        // Ensure this socket is in the room or can be mapped from the old player ID
        let player = room.players.find(p => p.id === socket.id);
        if (!player && oldPlayerId) {
            const oldPlayerIndex = room.players.findIndex(p => p.id === oldPlayerId);
            if (oldPlayerIndex !== -1) {
                room.players[oldPlayerIndex].id = socket.id;
                player = room.players[oldPlayerIndex];
                console.log('[server] request-game-state: mapped old player ID to new socket ID', { oldPlayerId, newSocketId: socket.id });

                if (room.turnOrder) {
                    room.turnOrder = room.turnOrder.map(pid => pid === oldPlayerId ? socket.id : pid);
                }
                if (room.initialBuildOrder) {
                    room.initialBuildOrder = room.initialBuildOrder.map(item => item.playerId === oldPlayerId ? { ...item, playerId: socket.id } : item);
                }
                if (room.diceRolls && room.diceRolls.has(oldPlayerId)) {
                    const roll = room.diceRolls.get(oldPlayerId);
                    room.diceRolls.delete(oldPlayerId);
                    room.diceRolls.set(socket.id, roll);
                }
                if (room.initialBuildProgress && room.initialBuildProgress.has(oldPlayerId)) {
                    const progress = room.initialBuildProgress.get(oldPlayerId);
                    room.initialBuildProgress.delete(oldPlayerId);
                    room.initialBuildProgress.set(socket.id, progress);
                }
                if (room.buildings) {
                    for (const [key, building] of room.buildings.entries()) {
                        if (building.playerId === oldPlayerId) {
                            room.buildings.set(key, { ...building, playerId: socket.id });
                        }
                    }
                }
                socket.join(roomCode);
            }
        }
        if (!player) {
            console.warn('[server] request-game-state: player not found in room', { roomCode, socketId: socket.id, oldPlayerId });
            return;
        }

        // Send map and buildings always
        if (room.gameState) socket.emit('game-started', { mapSeed: room.gameState });
        if (room.buildings) {
            socket.emit('sync-buildings', { buildings: getBuildingsArray(room) });
        }
        
        // Send dev card hands for all players
        const devCardHandsData = {};
        for (const [playerId, hand] of room.devCardHands) {
            devCardHandsData[playerId] = hand;
        }
        socket.emit('sync-dev-cards', { devCardHands: devCardHandsData });

        if (room.gamePhase === 'dice-roll') {
            const diceRolls = Array.from(room.diceRolls.entries()).map(([playerId, total]) => ({ playerId, total }));
            const playersList = room.players.map(p => ({ id: p.id, name: p.name }));
            // Emit start-dice-phase (primary event)
            socket.emit('start-dice-phase', {
                players: playersList,
                diceRolls
            });
            // Also emit game-state-sync as a fallback (in case start-dice-phase was missed)
            socket.emit('game-state-sync', {
                gamePhase: room.gamePhase,
                players: playersList,
                diceRolls: diceRolls
            });
        } else if (room.gamePhase === 'initial-build') {
            const currentPlayerId = room.initialBuildOrder[room.currentInitialBuildIndex]?.playerId;
            socket.emit('game-state-sync', {
                gamePhase: room.gamePhase,
                currentPlayerId: currentPlayerId,
                initialBuildOrder: room.initialBuildOrder,
                currentIndex: room.currentInitialBuildIndex,
                buildings: getBuildingsArray(room)
            });

            if (currentPlayerId === socket.id) {
                socket.emit('initial-build-your-turn', {
                    playerId: socket.id,
                    order: room.initialBuildOrder
                });
            } else if (currentPlayerId) {
                const yourPosition = room.initialBuildOrder.findIndex(p => p.playerId === socket.id);
                socket.emit('initial-build-waiting', {
                    currentPlayerId: currentPlayerId,
                    yourPosition: yourPosition,
                    order: room.initialBuildOrder
                });
            }
        } else if (room.gamePhase === 'regular-turn') {
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            socket.emit('game-state-sync', {
                gamePhase: room.gamePhase,
                currentTurnPlayerId: currentPlayerId,
                turnOrder: room.turnOrder,
                buildings: getBuildingsArray(room)
            });
            if (currentPlayerId === socket.id) {
                socket.emit('your-turn', {
                    playerId: currentPlayerId,
                    mustRollDice: !room.turnState.diceRolled
                });
            } else {
                socket.emit('waiting-for-turn', {
                    currentPlayerId: currentPlayerId,
                    yourPosition: room.turnOrder.indexOf(socket.id)
                });
            }
        }
    });

    // Change player color
    socket.on('change-color', ({ roomCode, playerId, color }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === playerId);
        if (!player) return;

        const usedColors = new Set(room.players.filter(p => p.id !== playerId).map(p => p.color).filter(c => c));
        if (usedColors.has(color)) {
            socket.emit('color-change-failed', { playerId, color, message: 'Цей колір вже зайнятий' });
            return;
        }

        player.color = color;

        io.to(roomCode).emit('color-changed', {
            playerId,
            color,
            players: room.players
        });
    });

    // Get rooms list
    socket.on('get-rooms', () => {
        socket.emit('rooms-list', getRoomsList());
    });

    // Store map state
    socket.on('store-map', ({ roomCode, mapData }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            room.gameState = mapData;
        }
    });

    // Store topology (cloud version feature)
    socket.on('store-topology', ({ roomCode, topology }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            // Convert arrays back to Maps for server-side validation
            room.topology = {
                edges: new Map(topology.edges || []),
                vertices: new Map(topology.vertices || [])
            };
        }
    });

    // Start game
    socket.on('start-game', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            // Mark room as in-game
            room.status = 'in-game';
            
            // Initialize game phase
            room.gamePhase = 'dice-roll';
            room.diceRolls = new Map();
            room.initialBuildOrder = [];
            room.currentInitialBuildIndex = 0;
            room.initialBuildRoundComplete = false;
            room.buildings = new Map();
            
            // Initialize robber and dev card state
            room.robber = { hexKey: null, placedBy: null };
            room.devCardHands = new Map();
            room.knightCards = new Map();
            
            // Initialize dev card hands for all players
            for (const p of room.players) {
                room.devCardHands.set(p.id, []);
                room.knightCards.set(p.id, 0);
            }
            
            // Send map seed for synchronization
            const mapSeed = room.gameState || {
                center: {q:0,r:0,s:0},
                ring1: [],
                ring2: [],
                ring3: [],
                resources: {},
                numbers: {}
            };
            
            // Notify all players to start dice phase
            io.to(roomCode).emit('game-started', { mapSeed });
            io.to(roomCode).emit('start-dice-phase', { 
                players: room.players.map(p => ({ id: p.id, name: p.name }))
            });
            
            // Update room list for all clients
            io.emit('rooms-list', getRoomsList());
        }
    });

    // Handle dice roll during initial phase (2 dice, sum 2-12)
    socket.on('dice-roll', ({ roomCode, playerId, die1, die2 }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'dice-roll') return;
        
        // Validate dice values (1-6 each)
        if (die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6) return;
        
        const total = die1 + die2;
        
        // Store the dice roll
        room.diceRolls.set(playerId, total);
        
        // Broadcast to all players
        io.to(roomCode).emit('player-dice-rolled', { 
            playerId, 
            total,
            die1,
            die2,
            rollsCount: room.diceRolls.size,
            totalPlayers: room.players.length
        });
        
        // Check if all players have rolled
        if (room.diceRolls.size === room.players.length) {
            // Calculate build order (highest to lowest)
            const rolls = Array.from(room.diceRolls.entries()).map(([playerId, total]) => ({
                playerId,
                total
            }));
            rolls.sort((a, b) => b.total - a.total);
            
            // In case of tie, re-roll is needed
            const totals = rolls.map(r => r.total);
            const uniqueTotals = new Set(totals);
            if (uniqueTotals.size < rolls.length) {
                const tiedPlayers = [];
                for (let i = 0; i < rolls.length; i++) {
                    for (let j = i + 1; j < rolls.length; j++) {
                        if (rolls[i].total === rolls[j].total) {
                            if (!tiedPlayers.includes(rolls[i].playerId)) tiedPlayers.push(rolls[i].playerId);
                            if (!tiedPlayers.includes(rolls[j].playerId)) tiedPlayers.push(rolls[j].playerId);
                        }
                    }
                }
                
                // Clear only tied players' rolls
                for (const pid of tiedPlayers) {
                    room.diceRolls.delete(pid);
                }
                
                io.to(roomCode).emit('dice-tie', {
                    players: tiedPlayers,
                    message: 'Нічия! Перекиньте кубики'
                });
                return;
            }
            
            room.initialBuildOrder = rolls;
            room.turnOrder = rolls.map(r => r.playerId); // Same order for regular turns
            room.gamePhase = 'initial-build';
            room.currentInitialBuildIndex = 0;
            room.initialBuildRoundComplete = false;
            
            // Track each player's built items during initial phase
            room.initialBuildProgress = new Map(); // playerId -> {settlements: number, roads: number}
            for (const p of room.players) {
                room.initialBuildProgress.set(p.id, { settlements: 0, roads: 0 });
            }
            
            // Notify the first player to build
            const firstPlayerId = rolls[0].playerId;
            io.to(roomCode).emit('initial-build-start', {
                order: rolls,
                currentPlayerId: firstPlayerId,
                round: 0
            });
            
            // Tell the first player it's their turn
            io.to(firstPlayerId).emit('initial-build-your-turn', {
                playerId: firstPlayerId,
                order: rolls
            });
            
            // Tell others they're waiting
            for (let i = 1; i < rolls.length; i++) {
                const pid = rolls[i].playerId;
                io.to(pid).emit('initial-build-waiting', {
                    currentPlayerId: firstPlayerId,
                    yourPosition: i,
                    order: rolls
                });
            }
        }
    });
    
    // Handle initial build - player ends their turn (1 settlement + 2 roads per player, one by one)
    socket.on('initial-build-end-turn', ({ roomCode, playerId }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'initial-build') return;
        
        // Verify it's this player's turn
        const currentPlayerId = room.initialBuildOrder[room.currentInitialBuildIndex].playerId;
        if (currentPlayerId !== playerId) {
            socket.emit('action-error', { message: 'Зараз не ваш хід!' });
            return;
        }
        
        // Use SERVER-SIDE progress instead of trusting client data
        const progress = room.initialBuildProgress.get(playerId) || { settlements: 0, roads: 0 };
        
        // Validate that the player has built the required items (using server data)
        if (progress.settlements < 1 || progress.roads < 2) {
            socket.emit('action-error', { message: 'Ви повинні побудувати 1 село та 2 дороги!' });
            return;
        }
        
        // Move to next player
        room.currentInitialBuildIndex++;
        
        // Check if all players have built
        if (room.currentInitialBuildIndex >= room.initialBuildOrder.length) {
            // All players finished! Start regular turns
            room.gamePhase = 'regular-turn';
            room.currentTurnIndex = 0;
            
            // Reset turn state
            room.turnState = {
                diceRolled: false,
                actionsLocked: true
            };
            
            // Sync buildings to ALL players before starting regular game
            syncBuildingsToRoom(roomCode, room);
            
            // Notify all players that regular gameplay starts
            const firstPlayerId = room.turnOrder[0];
            io.to(roomCode).emit('regular-game-start', {
                turnOrder: room.turnOrder,
                firstPlayerId: firstPlayerId
            });
            
            // Notify the first player it's their turn
            io.to(firstPlayerId).emit('your-turn', {
                playerId: firstPlayerId,
                mustRollDice: true
            });
            
            // Notify others they're waiting
            for (let i = 1; i < room.turnOrder.length; i++) {
                const pid = room.turnOrder[i];
                io.to(pid).emit('waiting-for-turn', {
                    currentPlayerId: firstPlayerId,
                    yourPosition: i
                });
            }
        } else {
            // Notify next player to build
            const nextPlayerId = room.initialBuildOrder[room.currentInitialBuildIndex].playerId;
            
            // Send all current buildings so all players can see them
            const buildingsData = getBuildingsArray(room);
            
            // Tell next player it's their turn (with buildings data)
            io.to(nextPlayerId).emit('initial-build-your-turn', {
                playerId: nextPlayerId,
                order: room.initialBuildOrder,
                buildings: buildingsData
            });
            
            // Update build phase overlay for remaining players
            io.to(roomCode).emit('initial-build-next-player', {
                currentPlayerId: nextPlayerId,
                currentIndex: room.currentInitialBuildIndex,
                order: room.initialBuildOrder,
                buildings: buildingsData
            });
            
            // Tell the ended player they're done (with buildings for sync)
            io.to(playerId).emit('initial-build-your-done', {
                nextPlayerId: nextPlayerId,
                buildings: buildingsData
            });
            
            // Broadcast buildings to ALL players so everyone sees them visually
            syncBuildingsToRoom(roomCode, room);
            
            // Tell all waiting players about update
            for (let i = room.currentInitialBuildIndex + 1; i < room.initialBuildOrder.length; i++) {
                const pid = room.initialBuildOrder[i].playerId;
                io.to(pid).emit('initial-build-waiting', {
                    currentPlayerId: nextPlayerId,
                    yourPosition: i - room.currentInitialBuildIndex,
                    order: room.initialBuildOrder
                });
            }
        }
    });

    // Handle regular dice roll (2 dice, during regular turn)
    socket.on('regular-dice-roll', ({ roomCode, playerId, die1, die2 }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'regular-turn') return;
        
        // Verify it's this player's turn
        const currentPlayerId = room.turnOrder[room.currentTurnIndex];
        if (currentPlayerId !== playerId) {
            socket.emit('action-error', { message: 'Зараз не ваш хід!' });
            return;
        }
        
        // Check if already rolled
        if (room.turnState.diceRolled) {
            socket.emit('action-error', { message: 'Ви вже кинули кубик!' });
            return;
        }
        
        // Validate dice values
        if (die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6) return;
        
        const total = die1 + die2;
        
        // Mark that dice has been rolled
        room.turnState.diceRolled = true;
        room.turnState.actionsLocked = false;
        
        // Broadcast dice result to ALL players (for resource collection)
        io.to(roomCode).emit('regular-dice-rolled', {
            playerId,
            total,
            die1,
            die2,
            canActNow: true // only the roller can act
        });
        
        // Send resource collection data to all players
        io.to(roomCode).emit('collect-resources', {
            diceTotal: total
        });
        
        // Sync buildings after dice roll (in case robber moved, etc.)
        syncBuildingsToRoom(roomCode, room);
    });

    // Handle end turn
    socket.on('end-turn', ({ roomCode, playerId }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'regular-turn') return;
        
        // Verify it's this player's turn
        const currentPlayerId = room.turnOrder[room.currentTurnIndex];
        if (currentPlayerId !== playerId) {
            socket.emit('action-error', { message: 'Зараз не ваш хід!' });
            return;
        }
        
        // Reset turn state
        room.turnState = {
            diceRolled: false,
            actionsLocked: true
        };
        
        // Move to next player
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
        
        // Sync buildings to ALL players before notifying next turn
        syncBuildingsToRoom(roomCode, room);
        
        // Notify the player who ended their turn
        io.to(playerId).emit('turn-ended', {
            nextPlayerId: room.turnOrder[room.currentTurnIndex]
        });
        
        // Notify the next player it's their turn
        const nextPlayerId = room.turnOrder[room.currentTurnIndex];
        io.to(nextPlayerId).emit('your-turn', {
            playerId: nextPlayerId,
            mustRollDice: true
        });
        
        // Notify others who is playing now
        for (let i = 0; i < room.turnOrder.length; i++) {
            const pid = room.turnOrder[i];
            if (pid !== nextPlayerId && pid !== playerId) {
                io.to(pid).emit('waiting-for-turn', {
                    currentPlayerId: nextPlayerId,
                    yourPosition: i
                });
            }
        }
        
        // Broadcast game-state-sync to ALL players in the room as a fallback
        // This ensures that even if your-turn event is lost (e.g., sent to old socket ID),
        // the next player will still receive the game state and know it's their turn
        io.to(roomCode).emit('game-state-sync', {
            gamePhase: room.gamePhase,
            currentTurnPlayerId: nextPlayerId,
            turnOrder: room.turnOrder,
            buildings: getBuildingsArray(room)
        });
    });

    // Sync a building action to all players (with validation)
    socket.on('sync-build', ({ roomCode, type, data }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        
        const key = data.edgeKey || data.vertexKey;
        if (!key) return;
        
        // VALIDATION: Check if building spot is already taken
        if (room.buildings.has(key)) {
            socket.emit('action-error', { message: 'Це місце вже зайняте!' });
            return;
        }
        
        // SERVER-SIDE VALIDATION: Check topology rules
        if (room.topology) {
            if (type === 'road') {
                // Don't build if not connected to player's network
                if (!isEdgeConnectedServer(key, socket.id, room)) {
                    socket.emit('action-error', { message: 'Дорога не з\'єднана з вашою мережею!' });
                    return;
                }
            } else if (type === 'settlement') {
                // Don't build if too close to other settlements
                try {
                    if (!canPlaceSettlementServer(key, socket.id, room)) {
                        socket.emit('action-error', { message: 'Не можна будувати поселення тут (відстань або чужі дороги)!' });
                        return;
                    }
                } catch (e) {
                    console.error('Помилка у canPlaceSettlementServer:', e);
                    socket.emit('action-error', { message: 'Помилка перевірки поселення!' });
                    return;
                }
            } else if (type === 'city') {
                // City can only be built on own settlement
                const existing = room.buildings.get(key);
                if (!existing || existing.playerId !== socket.id || existing.type !== 'settlement') {
                    socket.emit('action-error', { message: 'Не можна покращити це місто!' });
                    return;
                }
            }
        }
        
        // VALIDATION: During initial build, check limits
        if (room.gamePhase === 'initial-build') {
            const progress = room.initialBuildProgress.get(socket.id) || { settlements: 0, roads: 0 };
            if (type === 'settlement' && progress.settlements >= 1) {
                socket.emit('action-error', { message: 'Ви вже побудували 1 поселення під час початкового будівництва!' });
                return;
            }
            if (type === 'road' && progress.roads >= 2) {
                socket.emit('action-error', { message: 'Ви вже побудували 2 дороги під час початкового будівництва!' });
                return;
            }
        }
        
        // VALIDATION: During initial build, only current builder can place
        if (room.gamePhase === 'initial-build') {
            const currentBuilderId = room.initialBuildOrder[room.currentInitialBuildIndex].playerId;
            if (currentBuilderId !== socket.id) {
                socket.emit('action-error', { message: 'Зараз не ваш хід!' });
                return;
            }
        }
        // VALIDATION: During regular turn phase, check if it's this player's turn
        if (room.gamePhase === 'regular-turn') {
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentPlayerId !== socket.id) {
                socket.emit('action-error', { message: 'Зараз не ваш хід!' });
                return;
            }
        }
        
        // Check if dice has been rolled (only during regular turn, not initial-build)
        if (room.gamePhase === 'regular-turn' && room.turnState && room.turnState.actionsLocked) {
            socket.emit('action-error', { message: 'Спочатку киньте кубики!' });
            return;
        }
        
        // Store building with player info for validation
        room.buildings.set(key, {
            playerId: socket.id,
            color: data.color || player.color,
            type: type,
            edgeKey: data.edgeKey,
            vertexKey: data.vertexKey
        });

        // Update initial build progress
        if (room.gamePhase === 'initial-build') {
            const progress = room.initialBuildProgress.get(socket.id) || { settlements: 0, roads: 0 };
            if (type === 'settlement') progress.settlements++;
            if (type === 'road') progress.roads++;
            room.initialBuildProgress.set(socket.id, progress);
        }
        
        // Broadcast to all players in room (including sender for confirmation)
        io.to(roomCode).emit('building-synced', {
            type,
            data: {
                ...data,
                playerId: socket.id,
                color: data.color || player.color
            },
            buildings: getBuildingsArray(room)
        });
        
        // Also sync buildings to ALL players so everyone sees the update
        syncBuildingsToRoom(roomCode, room);
    });

    // Handle game actions
    // Додайте/оновіть обробник дій у server-unified.js:
    socket.on('game-action', (data) => {
        const { roomCode, action, payload } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        if (action === 'end-turn') {
            // Перехід ходу до наступного гравця
            const playerIds = Object.keys(room.players);
            const currentIndex = playerIds.indexOf(room.gameState.currentPlayerId);
            const nextIndex = (currentIndex + 1) % playerIds.length;
            
            room.gameState.currentPlayerId = playerIds[nextIndex];

            // Повідомляємо ВСІМ гравцям про зміну ходу
            io.to(roomCode).emit('game-state-update', {
                type: 'turn-changed',
                currentPlayerId: room.gameState.currentPlayerId,
                gameState: room.gameState
            });
        } 
        else if (action === 'build') {
            // Зберігаємо побудований об'єкт
            if (payload.type === 'road') {
                room.gameState.roads.push(payload.data);
            } else if (payload.type === 'settlement' || payload.type === 'city') {
                room.gameState.buildings.push(payload.data);
            }

            // Розсилаємо ВСІМ гравцям оновлений стан будівництва
            io.to(roomCode).emit('game-state-update', {
                type: 'build-sync',
                buildData: payload,
                gameState: room.gameState
            });
        }
        else if (action === 'place-robber') {
            // Update robber position on server
            room.gameState.robber = {
                hexKey: payload.hexKey,
                placedBy: socket.id
            };
            
            // Broadcast to all players
            io.to(roomCode).emit('game-state-update', {
                type: 'robber-placed',
                robber: room.gameState.robber,
                gameState: room.gameState
            });
        }
        else if (action === 'activate-knight') {
            // Track knight usage on server - use devCardHands
            const playerHand = room.devCardHands.get(socket.id) || [];
            const knightCard = playerHand.find(c => c.type === 'knight' && !c.used);
            
            if (knightCard) {
                knightCard.used = true;
                
                // Update knight count for largest army tracking
                if (!room.knightCards.has(socket.id)) {
                    room.knightCards.set(socket.id, 0);
                }
                room.knightCards.set(socket.id, room.knightCards.get(socket.id) + 1);
                
                // Broadcast to all players
                io.to(roomCode).emit('game-state-update', {
                    type: 'knight-activated',
                    playerId: socket.id,
                    gameState: room.gameState
                });
            }
        }
        else if (action === 'monopoly') {
            // Broadcast monopoly action to all players
            io.to(roomCode).emit('game-state-update', {
                type: 'monopoly-action',
                targetPlayerId: payload.targetPlayerId,
                resource: payload.resource,
                playerId: socket.id
            });
        }
        else if (action === 'steal-resource') {
            // Handle robber stealing a random resource
            const fromPlayerId = payload.fromPlayerId;
            const toPlayerId = payload.toPlayerId;
            
            // Initialize player resources if needed
            if (!room.playerResources) {
                room.playerResources = new Map();
            }
            if (!room.playerResources.has(fromPlayerId)) {
                room.playerResources.set(fromPlayerId, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
            }
            if (!room.playerResources.has(toPlayerId)) {
                room.playerResources.set(toPlayerId, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
            }
            
            // Get target player's resources
            const fromResources = room.playerResources.get(fromPlayerId);
            const toResources = room.playerResources.get(toPlayerId);
            
            // Count total resources of the target player
            const totalResources = fromResources.wood + fromResources.brick + fromResources.geese + 
                                  fromResources.water + fromResources.stone;
            
            // Only steal if target has 7 or more resources
            let stolenResource = null;
            if (totalResources >= 7) {
                // Find resources that the target player has
                const availableResources = [];
                if (fromResources.wood > 0) availableResources.push('wood');
                if (fromResources.brick > 0) availableResources.push('brick');
                if (fromResources.geese > 0) availableResources.push('geese');
                if (fromResources.water > 0) availableResources.push('water');
                if (fromResources.stone > 0) availableResources.push('stone');
                
                // If target has resources, steal one randomly
                if (availableResources.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableResources.length);
                    stolenResource = availableResources[randomIndex];
                    
                    // Transfer resource
                    fromResources[stolenResource]--;
                    toResources[stolenResource]++;
                }
            }
            
            // Broadcast to all players that a resource was stolen
            io.to(roomCode).emit('game-state-update', {
                type: 'resource-stolen',
                fromPlayerId: fromPlayerId,
                toPlayerId: toPlayerId,
                resource: stolenResource,
                success: stolenResource !== null,
                hasEnoughCards: totalResources >= 7,
                playerId: socket.id
            });
        }
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

    // Disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);

        // Remove player from rooms
        rooms.forEach((room, code) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex === -1) return;
            const player = room.players[playerIndex];
            
            // If host disconnects
            if (room.host === socket.id) {
                if (room.gamePhase) {
                    // Game already started - don't delete room, just mark as disconnected
                    // Host can rejoin via rejoin-room
                    player.disconnected = true;
                    socket.to(code).emit('host-disconnected', {
                        message: 'Хозяїн тимчасово відключився'
                    });
                } else {
                    // Game not started yet - close the room
                    io.to(code).emit('room-closed', {
                        message: 'Хозяїн вийшов з кімнати'
                    });
                    rooms.delete(code);
                }
                return;
            }
            
            if (!room.gamePhase) {
                // Game not started yet - remove player completely
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    rooms.delete(code);
                    return;
                }
                io.to(code).emit('player-left', {
                    playerId: socket.id,
                    players: room.players
                });
            } else {
                // Game started - mark as disconnected but keep in room
                player.disconnected = true;
                socket.to(code).emit('player-disconnected', {
                    playerId: socket.id
                });
                
                // If all players disconnected, delete the room immediately
                const allDisconnected = room.players.every(p => p.disconnected);
                if (allDisconnected) {
                    rooms.delete(code);
                    io.emit('rooms-list', getRoomsList());
                }
            }
        });
        
        // Update room list
        io.emit('rooms-list', getRoomsList());
    });
});

// Get simplified rooms list for clients
function getRoomsList() {
    return Array.from(rooms.values()).map(room => ({
        code: room.code,
        name: room.name,
        players: room.players.length,
        maxPlayers: room.maxPlayers,
        status: room.status || 'waiting' // 'waiting' or 'in-game'
    }));
}

// ===== LOCAL SERVER FUNCTIONS =====
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
    server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
        const localIp = getLocalIp();
        console.log(`Multiplayer server running on port ${process.env.PORT || 3000}`);
        console.log(`Local URL: http://${localIp}:${process.env.PORT || 3000}`);
        console.log(`Localhost URL: http://localhost:${process.env.PORT || 3000}`);
        getPublicIp().then(ip => {
            if (ip) {
                console.log(`Public URL: http://${ip}:${process.env.PORT || 3000}`);
            }
        });
    });
}

// Auto-start based on environment
if (!isCloud && require.main === module) {
    startServer();
} else if (isCloud) {
    // Cloud mode - server already listening
    console.log(`Cloud multiplayer server running on port ${process.env.PORT || 3000}`);
}

module.exports = { io, rooms, startServer, getPublicIp, getLocalIp, getRoomsList };