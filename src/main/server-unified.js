// Multiplayer Server for Colonization - Unified Version
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// ===== СЕРВЕРНА ВАЛІДАЦІЯ ТОПОЛОГІЇ =====
function isMyServerVertex(vertexKey, playerId, room) {
    const bld = room.buildings.get(vertexKey);
    return bld && bld.playerId === playerId;
}
function isMyServerRoad(edgeKey, playerId, room) {
    const bld = room.buildings.get(edgeKey);
    return bld && bld.playerId === playerId;
}
function isEdgeConnectedServer(edgeKey, playerId, room) {
    if (!room.topology) return true;
    const edgeMap = new Map(room.topology.edges);
    const edge = edgeMap.get(edgeKey);
    if (!edge) return false;
    const va = edge.va, vb = edge.vb;
    const vertexMap = new Map(room.topology.vertices);
    let vkA = null, vkB = null;
    for (const [vk, vData] of vertexMap) {
        if (Math.abs(vData.pos.x - va.x) < 0.001 && Math.abs(vData.pos.y - va.y) < 0.001) vkA = vk;
        if (Math.abs(vData.pos.x - vb.x) < 0.001 && Math.abs(vData.pos.y - vb.y) < 0.001) vkB = vk;
    }
    if (vkA && isMyServerVertex(vkA, playerId, room)) return true;
    if (vkB && isMyServerVertex(vkB, playerId, room)) return true;
    for (const [ek2, bld] of room.buildings) {
        if (bld.type !== 'road' || bld.playerId !== playerId) continue;
        const edge2 = edgeMap.get(ek2);
        if (!edge2) continue;
        if ((edge2.va.x === va.x && edge2.va.y === va.y) || (edge2.va.x === vb.x && edge2.va.y === vb.y) ||
            (edge2.vb.x === va.x && edge2.vb.y === va.y) || (edge2.vb.x === vb.x && edge2.vb.y === vb.y)) return true;
    }
    return false;
}
function canPlaceSettlementServer(vertexKey, playerId, room) {
    if (!room.topology) return true;
    const vertexMap = new Map(room.topology.vertices);
    const vData = vertexMap.get(vertexKey);
    if (!vData) return false;
    const neighborKeys = [];
    const edgeMap = new Map(room.topology.edges);
    for (const [ek, edge] of edgeMap) {
        if (!edge.va || !edge.vb) continue;
        if ((edge.va.x === vData.pos.x && edge.va.y === vData.pos.y) ||
            (edge.vb.x === vData.pos.x && edge.vb.y === vData.pos.y)) {
            const target = (edge.va.x === vData.pos.x && edge.va.y === vData.pos.y) ? edge.vb : edge.va;
            for (const [vk2, v2] of vertexMap) if (v2.pos.x === target.x && v2.pos.y === target.y) neighborKeys.push(vk2);
        }
    }
    for (const [vk2, bld] of room.buildings) {
        if (bld.type === 'settlement' || bld.type === 'city') {
            if (vk2 === vertexKey) return false; // Тут вже зайнято
            if (neighborKeys.includes(vk2)) return false; // Занадто близько до іншого
        }
        if (bld.type === 'road') {
            // Крок 6: Не можна будувати поселення на чужих дорогах
            const edge2 = edgeMap.get(vk2);
            if (!edge2) continue;
            if ((edge2.va.x === vData.pos.x && edge2.va.y === vData.pos.y) ||
                (edge2.vb.x === vData.pos.x && edge2.vb.y === vData.pos.y)) return false;
        }
    }
    return true;
}
function getBuildingsArray(room) { return Array.from(room.buildings.entries()).map(([key, val]) => ({key, ...val})); }
function syncBuildingsToRoom(roomCode, room) { const data = getBuildingsArray(room); io.to(roomCode).emit('sync-buildings', { buildings: data }); return data; }

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('create-room', ({ roomName, playerName, maxPlayers, color }) => {
        const roomCode = generateRoomCode();
        const defaultColors = ['red', 'blue', 'yellow', 'green'];
        const room = {
            code: roomCode, name: roomName || 'Кімната', host: socket.id, maxPlayers: maxPlayers || 4,
            players: [{ id: socket.id, name: playerName || 'Гравець', isHost: true, color: color || defaultColors[0] }],
            gameState: null, createdAt: Date.now(),
            gamePhase: null,
            diceRolls: new Map(),
            initialBuildOrder: [], currentInitialBuildIndex: 0,
            turnOrder: [], currentTurnIndex: 0,
            turnState: { diceRolled: false, actionsLocked: true },
            buildings: new Map(), topology: null,
            initialBuildProgress: new Map() // playerId -> { settlements: 0, roads: 0 }
        };
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.emit('room-created', { roomCode, roomName: room.name, maxPlayers: room.maxPlayers, players: room.players });
        io.emit('rooms-list', Array.from(rooms.values()).map(r => ({ code: r.code, name: r.name, players: r.players.length, maxPlayers: r.maxPlayers })));
    });

    socket.on('join-room', ({ roomCode, playerName, color }) => {
        const room = rooms.get(roomCode);
        if (!room) return socket.emit('join-error', { message: 'Кімната не знайдена' });
        if (room.players.length >= room.maxPlayers) return socket.emit('join-error', { message: 'Кімната заповнена' });
        const defaultColors = ['red', 'blue', 'yellow', 'green'];
        const usedColors = new Set(room.players.map(p => p.color));
        let assignedColor = color;
        if (!assignedColor || usedColors.has(assignedColor)) assignedColor = defaultColors.find(c => !usedColors.has(c)) || defaultColors[0];
        room.players.push({ id: socket.id, name: playerName || 'Гравець', isHost: false, color: assignedColor });
        socket.join(roomCode);
        io.to(roomCode).emit('player-joined', { player: { id: socket.id, name: playerName || 'Гравець', color: assignedColor }, players: room.players });
        socket.emit('room-joined', { roomCode, roomName: room.name, players: room.players });
        io.emit('rooms-list', Array.from(rooms.values()).map(r => ({ code: r.code, name: r.name, players: r.players.length, maxPlayers: r.maxPlayers })));
    });

    socket.on('rejoin-room', ({ roomCode, isHost, oldPlayerId }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        // Логіка перепідключення гравця зі збереженням старого ID
        if (oldPlayerId) {
            const idx = room.players.findIndex(p => p.id === oldPlayerId);
            if (idx !== -1) room.players[idx].id = socket.id;
            if (room.turnOrder) room.turnOrder = room.turnOrder.map(pid => pid === oldPlayerId ? socket.id : pid);
            if (room.initialBuildOrder) room.initialBuildOrder = room.initialBuildOrder.map(item => item.playerId === oldPlayerId ? { ...item, playerId: socket.id } : item);
            if (room.diceRolls && room.diceRolls.has(oldPlayerId)) { const roll = room.diceRolls.get(oldPlayerId); room.diceRolls.delete(oldPlayerId); room.diceRolls.set(socket.id, roll); }
            if (room.initialBuildProgress && room.initialBuildProgress.has(oldPlayerId)) { const progress = room.initialBuildProgress.get(oldPlayerId); room.initialBuildProgress.delete(oldPlayerId); room.initialBuildProgress.set(socket.id, progress); }
            if (room.buildings) { for (const [key, b] of room.buildings) if (b.playerId === oldPlayerId) room.buildings.set(key, { ...b, playerId: socket.id }); }
        }
        if (isHost) room.host = socket.id;
        socket.join(roomCode);
        if (room.gameState) socket.emit('game-started', { mapSeed: room.gameState });
        if (room.buildings) socket.emit('sync-buildings', { buildings: getBuildingsArray(room) });
        // Повертаємо поточний стан гри
        if (room.gamePhase === 'dice-roll') {
            socket.emit('start-dice-phase', { players: room.players.map(p => ({ id: p.id, name: p.name })), diceRolls: Array.from(room.diceRolls.entries()).map(([pid, t]) => ({ playerId: pid, total: t })) });
        } else if (room.gamePhase === 'initial-build') {
            const currentId = room.initialBuildOrder[room.currentInitialBuildIndex]?.playerId;
            socket.emit('game-state-sync', { gamePhase: room.gamePhase, currentPlayerId: currentId, initialBuildOrder: room.initialBuildOrder, currentIndex: room.currentInitialBuildIndex, buildings: getBuildingsArray(room) });
        } else if (room.gamePhase === 'regular-turn') {
            const currentId = room.turnOrder[room.currentTurnIndex];
            socket.emit('game-state-sync', { gamePhase: room.gamePhase, currentTurnPlayerId: currentId, turnOrder: room.turnOrder, buildings: getBuildingsArray(room) });
        }
    });

    socket.on('store-map', ({ roomCode, mapData }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) room.gameState = mapData;
    });
    socket.on('store-topology', ({ roomCode, topology }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) room.topology = { edges: new Map(topology.edges || []), vertices: new Map(topology.vertices || []) };
    });

    // ============================================================
    // КРОК 1: ХОЗЯЇН ЗАПУСКАЄ ГРУ
    // ============================================================
    socket.on('start-game', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.host === socket.id) {
            room.gamePhase = 'dice-roll';
            room.diceRolls = new Map();
            room.initialBuildOrder = [];
            room.currentInitialBuildIndex = 0;
            room.buildings = new Map();
            room.initialBuildProgress = new Map();
            room.turnOrder = [];
            room.currentTurnIndex = 0;
            room.turnState = { diceRolled: false, actionsLocked: true };

            const mapSeed = room.gameState || { center: {q:0,r:0,s:0}, ring1: [], ring2: [], ring3: [], resources: {}, numbers: {} };
            io.to(roomCode).emit('game-started', { mapSeed });
            // ============================================================
            // КРОК 2: ПОЧАТКОВА ФАЗА - КИДАННЯ КУБИКІВ
            // ============================================================
            io.to(roomCode).emit('start-dice-phase', { players: room.players.map(p => ({ id: p.id, name: p.name })) });
        }
    });

    // КРОК 2: ГРАВЦІ КИДАЮТЬ КУБИКИ
    socket.on('dice-roll', ({ roomCode, playerId, die1, die2 }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'dice-roll') return;
        if (die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6) return;
        const total = die1 + die2;
        room.diceRolls.set(playerId, total);
        io.to(roomCode).emit('player-dice-rolled', { playerId, total, die1, die2, rollsCount: room.diceRolls.size, totalPlayers: room.players.length });

        if (room.diceRolls.size === room.players.length) {
            const rolls = Array.from(room.diceRolls.entries()).map(([id, t]) => ({ playerId: id, total: t }));
            rolls.sort((a, b) => b.total - a.total);
            const totals = rolls.map(r => r.total);
            if (new Set(totals).size < rolls.length) {
                const tiedPlayers = [];
                for (let i=0; i<rolls.length; i++) for (let j=i+1; j<rolls.length; j++) if (rolls[i].total === rolls[j].total) { tiedPlayers.push(rolls[i].playerId, rolls[j].playerId); }
                const uniqueTied = [...new Set(tiedPlayers)];
                for (const pid of uniqueTied) room.diceRolls.delete(pid);
                io.to(roomCode).emit('dice-tie', { players: uniqueTied, message: 'Нічия! Перекиньте кубики' });
                return;
            }
            // ============================================================
            // КРОК 3: ВИЗНАЧАЄТЬСЯ ЧЕРГА НА БУДІВНИЦТВО (СПАДАННЯ)
            // ============================================================
            room.initialBuildOrder = rolls;
            room.turnOrder = rolls.map(r => r.playerId);
            for (const p of room.players) room.initialBuildProgress.set(p.id, { settlements: 0, roads: 0 });

            room.gamePhase = 'initial-build';
            room.currentInitialBuildIndex = 0;
            const firstPlayerId = rolls[0].playerId;
            io.to(roomCode).emit('initial-build-start', { order: rolls, currentPlayerId: firstPlayerId, round: 0 });
            io.to(firstPlayerId).emit('initial-build-your-turn', { playerId: firstPlayerId, order: rolls });
            for (let i = 1; i < rolls.length; i++) {
                io.to(rolls[i].playerId).emit('initial-build-waiting', { currentPlayerId: firstPlayerId, yourPosition: i, order: rolls });
            }
        }
    });

    // ============================================================
    // КРОКИ 4-6: ПОЧАТКОВЕ БУДІВНИЦТВО (1 ПОСЕЛЕННЯ + 2 ДОРОГИ)
    // ============================================================
    socket.on('initial-build-end-turn', ({ roomCode, playerId }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'initial-build') return;
        const currentId = room.initialBuildOrder[room.currentInitialBuildIndex]?.playerId;
        if (currentId !== playerId) return socket.emit('action-error', { message: 'Зараз не ваш хід!' });
        const progress = room.initialBuildProgress.get(playerId) || { settlements: 0, roads: 0 };
        if (progress.settlements < 1 || progress.roads < 2) return socket.emit('action-error', { message: 'Побудуйте 1 село та 2 дороги!' });

        room.currentInitialBuildIndex++;
        syncBuildingsToRoom(roomCode, room);

        if (room.currentInitialBuildIndex >= room.initialBuildOrder.length) {
            // ============================================================
            // КРОК 7: ПОЧАТОК ЗВИЧАЙНОЇ ГРИ (ПОРЯДОК ХОДІВ ТАКИЙ ЖЕ)
            // ============================================================
            room.gamePhase = 'regular-turn';
            room.currentTurnIndex = 0;
            room.turnState = { diceRolled: false, actionsLocked: true };
            const firstPlayer = room.turnOrder[0];
            io.to(roomCode).emit('regular-game-start', { turnOrder: room.turnOrder, firstPlayerId: firstPlayer });
            io.to(firstPlayer).emit('your-turn', { playerId: firstPlayer, mustRollDice: true });
            for (let i = 1; i < room.turnOrder.length; i++) io.to(room.turnOrder[i]).emit('waiting-for-turn', { currentPlayerId: firstPlayer, yourPosition: i });
        } else {
            const nextId = room.initialBuildOrder[room.currentInitialBuildIndex].playerId;
            io.to(nextId).emit('initial-build-your-turn', { playerId: nextId, order: room.initialBuildOrder });
            io.to(playerId).emit('initial-build-your-done', { nextPlayerId: nextId });
            for (let i = room.currentInitialBuildIndex + 1; i < room.initialBuildOrder.length; i++) {
                const pid = room.initialBuildOrder[i].playerId;
                io.to(pid).emit('initial-build-waiting', { currentPlayerId: nextId, yourPosition: i - room.currentInitialBuildIndex, order: room.initialBuildOrder });
            }
        }
    });

    // ============================================================
    // КРОК 8: ЗВИЧАЙНИЙ ХІД (СПОЧАТКУ КУБИКИ, ПОТІМ ДІЇ)
    // ============================================================
    socket.on('regular-dice-roll', ({ roomCode, playerId, die1, die2 }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'regular-turn') return;
        if (room.turnOrder[room.currentTurnIndex] !== playerId) return socket.emit('action-error', { message: 'Зараз не ваш хід!' });
        if (room.turnState.diceRolled) return socket.emit('action-error', { message: 'Ви вже кинули кубик!' });
        const total = die1 + die2;
        room.turnState.diceRolled = true;
        room.turnState.actionsLocked = false;
        io.to(roomCode).emit('regular-dice-rolled', { playerId, total, die1, die2, canActNow: true });
        // ============================================================
        // КРОК 10: ЗБІР РЕСУРСІВ ДЛЯ ВСІХ ГРАВЦІВ
        // ============================================================
        io.to(roomCode).emit('collect-resources', { diceTotal: total });
        syncBuildingsToRoom(roomCode, room);
    });

    socket.on('end-turn', ({ roomCode, playerId }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gamePhase !== 'regular-turn') return;
        if (room.turnOrder[room.currentTurnIndex] !== playerId) return socket.emit('action-error', { message: 'Зараз не ваш хід!' });
        room.turnState = { diceRolled: false, actionsLocked: true };
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
        syncBuildingsToRoom(roomCode, room);
        const nextId = room.turnOrder[room.currentTurnIndex];
        io.to(playerId).emit('turn-ended', { nextPlayerId: nextId });
        io.to(nextId).emit('your-turn', { playerId: nextId, mustRollDice: true });
        for (let i = 0; i < room.turnOrder.length; i++) {
            if (room.turnOrder[i] !== nextId && room.turnOrder[i] !== playerId) io.to(room.turnOrder[i]).emit('waiting-for-turn', { currentPlayerId: nextId, yourPosition: i });
        }
    });

    // КРОКИ 6, 9: ВАЛІДАЦІЯ БУДІВНИЦТВА ТА БЛОКУВАННЯ ДІЙ
    socket.on('sync-build', ({ roomCode, type, data }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        const key = data.edgeKey || data.vertexKey;
        if (!key) return;
        if (room.buildings.has(key)) return socket.emit('action-error', { message: 'Це місце вже зайняте!' });
        if (room.gamePhase === 'initial-build') {
            if (room.initialBuildOrder[room.currentInitialBuildIndex]?.playerId !== socket.id) return socket.emit('action-error', { message: 'Зараз не ваш хід!' });
            const progress = room.initialBuildProgress.get(socket.id) || { settlements: 0, roads: 0 };
            if (type === 'settlement' && progress.settlements >= 1) return socket.emit('action-error', { message: 'Ви вже побудували 1 поселення!' });
            if (type === 'road' && progress.roads >= 2) return socket.emit('action-error', { message: 'Ви вже побудували 2 дороги!' });
        } else if (room.gamePhase === 'regular-turn') {
            if (room.turnOrder[room.currentTurnIndex] !== socket.id) return socket.emit('action-error', { message: 'Зараз не ваш хід!' });
            if (room.turnState.actionsLocked) return socket.emit('action-error', { message: 'Спочатку киньте кубики!' });
        }

        if (room.topology) {
            try {
                if (type === 'road') {
                    if (!isEdgeConnectedServer(key, socket.id, room)) return socket.emit('action-error', { message: 'Дорога не з\'єднана з вашою мережею!' });
                } else if (type === 'settlement') {
                    if (!canPlaceSettlementServer(key, socket.id, room)) return socket.emit('action-error', { message: 'Не можна будувати поселення тут!' });
                } else if (type === 'city') {
                    const existing = room.buildings.get(key);
                    if (!existing || existing.playerId !== socket.id || existing.type !== 'settlement') return socket.emit('action-error', { message: 'Не можна покращити це місто!' });
                }
            } catch (e) {
                console.error('Topology validation error:', e);
                return socket.emit('action-error', { message: 'Помилка топології!' });
            }
        }

        room.buildings.set(key, { playerId: socket.id, color: data.color || player.color, type: type, edgeKey: data.edgeKey, vertexKey: data.vertexKey });
        if (room.gamePhase === 'initial-build') {
            const progress = room.initialBuildProgress.get(socket.id) || { settlements: 0, roads: 0 };
            if (type === 'settlement') progress.settlements++;
            if (type === 'road') progress.roads++;
            room.initialBuildProgress.set(socket.id, progress);
        }
        io.to(roomCode).emit('building-synced', { type, data: { ...data, playerId: socket.id, color: data.color || player.color }, buildings: getBuildingsArray(room) });
        syncBuildingsToRoom(roomCode, room);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        rooms.forEach((room, code) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx === -1) return;
            if (!room.gamePhase) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) rooms.delete(code);
                else { if (room.host === socket.id && room.players.length > 0) { room.host = room.players[0].id; room.players[0].isHost = true; } io.to(code).emit('player-left', { playerId: socket.id, players: room.players }); }
            } else {
                room.players[idx].disconnected = true;
                socket.to(code).emit('player-disconnected', { playerId: socket.id });
            }
        });
        io.emit('rooms-list', Array.from(rooms.values()).map(r => ({ code: r.code, name: r.name, players: r.players.length, maxPlayers: r.maxPlayers })));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
module.exports = { io, rooms };