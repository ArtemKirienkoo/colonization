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
    socket.on('create-room', ({ roomName, playerName, maxPlayers, color }) => {
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
            buildings: new Map(),
            topology: null // edgeKey/vertexKey -> {playerId, color, type}
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

    // Rejoin room after page navigation (when game starts)
    // The room still exists because we DON'T delete it on disconnect during game
    socket.on('rejoin-room', ({ roomCode, isHost }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        if (isHost) room.host = socket.id;
        let existingPlayer = room.players.find(p => p.id === socket.id);
        if (!existingPlayer) {
            room.players.push({ id: socket.id, name: 'Гравець', isHost: isHost });
        }
        socket.join(roomCode);
        
        // Завжди надсилаємо карту та будівлі
        if (room.gameState) socket.emit('game-started', { mapSeed: room.gameState });
        if (room.buildings) {
            socket.emit('sync-buildings', { buildings: Array.from(room.buildings.entries()).map(([key, val]) => ({key, ...val})) });
        }

        // ===== ЗМІНЕНО ТУТ =====
        // Якщо фаза 'dice-roll' активна, але цей гравець ЩЕ НЕ кинув кубики - надсилаємо йому вікно
        if (room.gamePhase === 'dice-roll' && !room.diceRolls.has(socket.id)) {
            socket.emit('start-dice-phase', { players: room.players.map(p => ({ id: p.id, name: p.name })) });
        } else if (room.gamePhase === 'initial-build') {
            const currentPlayerId = room.initialBuildOrder[room.currentInitialBuildIndex]?.playerId;
            
            // Надсилаємо синхронізацію стану
            const playerData = { 
                gamePhase: room.gamePhase, 
                currentPlayerId: currentPlayerId, 
                initialBuildOrder: room.initialBuildOrder, 
                currentIndex: room.currentInitialBuildIndex 
            };
            socket.emit('game-state-sync', playerData);

            // ===== ДОДАНО: ЯВНО НАДСИЛАЄМО ПОДІЇ ХОДУ =====
            if (currentPlayerId === socket.id) {
                // Якщо перезавантажився ТОЙ, хто зараз має ходити
                socket.emit('initial-build-your-turn', { 
                    playerId: socket.id, 
                    order: room.initialBuildOrder 
                });
            } else if (currentPlayerId) {
                // Якщо перезавантажився той, хто ЧЕКАЄ
                const yourPosition = room.initialBuildOrder.findIndex(p => p.playerId === socket.id);
                socket.emit('initial-build-waiting', { 
                    currentPlayerId: currentPlayerId, 
                    yourPosition: yourPosition,
                    order: room.initialBuildOrder 
                });
            }
            // ===== КІНЕЦЬ ДОДАНОЇ ЧАСТИНИ =====
        } else if (room.gamePhase === 'regular-turn') {
            // Звичайна гра
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            socket.emit('game-state-sync', { gamePhase: room.gamePhase, currentTurnPlayerId: currentPlayerId, turnOrder: room.turnOrder });
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
    // Додати це після socket.on('store-map', ...)
    socket.on('store-topology', ({ roomCode, topology }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            room.topology = topology; // Зберігаємо топологію в кімнаті
        }
    });
    // Start game
    socket.on('start-game', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            // Initialize game phase
            room.gamePhase = 'dice-roll';
            room.diceRolls = new Map();
            room.initialBuildOrder = [];
            room.currentInitialBuildIndex = 0;
            room.initialBuildRoundComplete = false;
            room.buildings = new Map();
            
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
            // Check for ties
            const totals = rolls.map(r => r.total);
            const uniqueTotals = new Set(totals);
            if (uniqueTotals.size < rolls.length) {
                // There's a tie - need re-roll for tied players
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
    socket.on('initial-build-end-turn', ({ roomCode, playerId, settlements, roads }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'initial-build') return;
        
        // Verify it's this player's turn
        const currentPlayerId = room.initialBuildOrder[room.currentInitialBuildIndex].playerId;
        if (currentPlayerId !== playerId) {
            socket.emit('action-error', { message: 'Зараз не ваш хід!' });
            return;
        }
        
        // Validate that the player has built the required items
        if (settlements < 1 || roads < 2) {
            socket.emit('action-error', { message: 'Ви повинні побудувати 1 село та 2 дороги!' });
            return;
        }
        
        // Store this player's progress
        room.initialBuildProgress.set(playerId, { settlements, roads });
        
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
            
            // Tell the ended player they're done
            io.to(playerId).emit('initial-build-your-done', {
                nextPlayerId: nextPlayerId
            });
            
            // Tell next player it's their turn
            io.to(nextPlayerId).emit('initial-build-your-turn', {
                playerId: nextPlayerId,
                order: room.initialBuildOrder
            });
            
            // Update build phase overlay for remaining players
            io.to(roomCode).emit('initial-build-next-player', {
                currentPlayerId: nextPlayerId,
                currentIndex: room.currentInitialBuildIndex
            });
            
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
        // Each client will calculate their own resources based on their settlements
        io.to(roomCode).emit('collect-resources', {
            diceTotal: total
        });
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
    });
    // ===== ДОПОМІЖНІ ФУНКЦІЇ ДЛЯ СЕРВЕРНОЇ ПЕРЕВІРКИ =====
    // Перевірка, чи належить ребро (дорога) гравцеві
    function isMyServerRoad(edgeKey, playerId, room) {
        const bld = room.buildings.get(edgeKey);
        return bld && bld.playerId === playerId;
    }
    // Перевірка, чи належить вершина (поселення/місто) гравцеві
    function isMyServerVertex(vertexKey, playerId, room) {
        const bld = room.buildings.get(vertexKey);
        return bld && bld.playerId === playerId;
    }
    // Чи з'єднана дорога з існуючою мережею гравця (свої поселення або свої дороги)
    function isEdgeConnectedServer(edgeKey, playerId, room) {
        const edgeMap = new Map(room.topology.edges);
        const edge = edgeMap.get(edgeKey);
        if (!edge) return false;
        const va = edge[1].va; const vb = edge[1].vb;
        // Шукаємо вершини (координати) в будівлях
        const vertexMap = new Map(room.topology.vertices);
        let vkA = null, vkB = null;
        for (const [vk, vData] of vertexMap) {
            if (vData.pos.x === va.x && vData.pos.y === va.y) vkA = vk;
            if (vData.pos.x === vb.x && vData.pos.y === vb.y) vkB = vk;
        }
        // Якщо своє поселення на одному з кінців дороги - можна будувати
        if (vkA && isMyServerVertex(vkA, playerId, room)) return true;
        if (vkB && isMyServerVertex(vkB, playerId, room)) return true;
        // Якщо своя дорога з'єднується з цим ребром
        for (const [ek2, bld] of room.buildings) {
            if (bld.type !== 'road' || bld.playerId !== playerId) continue;
            const edge2 = edgeMap.get(ek2);
            if (!edge2) continue;
            // Спільна вершина
            if ((edge2[1].va.x === va.x && edge2[1].va.y === va.y) ||
                (edge2[1].va.x === vb.x && edge2[1].va.y === vb.y) ||
                (edge2[1].vb.x === va.x && edge2[1].vb.y === va.y) ||
                (edge2[1].vb.x === vb.x && edge2[1].vb.y === vb.y)) {
                return true;
            }
        }
        return false;
    }
    // Чи можна поставити поселення (не ближче 2 ребер від ЧУЖИХ і СВОЇХ)
    function canPlaceSettlementServer(vertexKey, playerId, room) {
        const vertexMap = new Map(room.topology.vertices);
        const vData = vertexMap.get(vertexKey);
        if (!vData) return false;
        // Шукаємо сусідні вершини (відстань 1 ребро)
        const neighborKeys = [];
        const edgeMap = new Map(room.topology.edges);
        for (const [ek, edge] of edgeMap) {
            if ((edge[1].va.x === vData.pos.x && edge[1].va.y === vData.pos.y) ||
                (edge[1].vb.x === vData.pos.x && edge[1].vb.y === vData.pos.y)) {
                // Знаходимо іншу точку ребра
                const target = (edge[1].va.x === vData.pos.x && edge[1].va.y === vData.pos.y) ? edge[1].vb : edge[1].va;
                for (const [vk2, v2] of vertexMap) {
                    if (v2.pos.x === target.x && v2.pos.y === target.y) neighborKeys.push(vk2);
                }
            }
        }
        // Перевіряємо всі існуючі поселення/міста
        for (const [vk2, bld] of room.buildings) {
            if (bld.type === 'settlement' || bld.type === 'city') {
                if (vk2 === vertexKey) return false; // Місце зайняте
                // Відстань 0 (це саме місце) або 1 (сусідня вершина)
                if (neighborKeys.includes(vk2)) return false;
            }
        }
        return true;
    }
    // ===== КІНЕЦЬ ДОПОМІЖНИХ ФУНКЦІЙ =====
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
        // ===== ДОДАТИ ЦЮ ПЕРЕВІРКУ ВІДРАЗУ ПІСЛЯ ПОПЕРЕДНЬОГО IF =====
        if (room.topology) {
            if (type === 'road') {
                // Не будувати, якщо не з'єднано зі своєю мережею
                if (!isEdgeConnectedServer(key, socket.id, room)) {
                    socket.emit('action-error', { message: 'Дорога не з\'єднана з вашою мережею!' });
                    return;
                }
            } else if (type === 'settlement') {
                // Не будувати, якщо поруч є інше поселення (відстань 2)
                if (!canPlaceSettlementServer(key, socket.id, room)) {
                    socket.emit('action-error', { message: 'Не можна будувати поселення тут (відстань або чужі дороги)!' });
                    return;
                }
            } else if (type === 'city') {
                // Місто можна будувати тільки на своєму поселенні
                const existing = room.buildings.get(key);
                if (!existing || existing.playerId !== socket.id || existing.type !== 'settlement') {
                    socket.emit('action-error', { message: 'Не можна покращити це місто!' });
                    return;
                }
            }
        }
        // ===== КІНЕЦЬ ВСТАВКИ =====
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
        
        // Broadcast to all players in room (including sender for confirmation)
        io.to(roomCode).emit('building-synced', {
            type,
            data: {
                ...data,
                playerId: socket.id,
                color: data.color || player.color
            },
            buildings: Array.from(room.buildings.entries()).map(([key, val]) => ({key, ...val}))
        });
    });

    // Game actions (generic forwarding)
    socket.on('game-action', ({ roomCode, action, data }) => {
        socket.to(roomCode).emit('game-action', { action, data });
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
