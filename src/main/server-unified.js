// Multiplayer Server for Colonization - Unified Version
// Supports both local and cloud deployment
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingInterval: 15000, // Send ping every 15s to keep connection alive
    pingTimeout: 30000,  // Consider connection dead after 30s without pong
    transports: ['websocket', 'polling']
});

// Serve static files for browser testing (local mode only)
const isCloud = process.env.CLOUD === 'true';
if (!isCloud) {
    app.use(express.static(path.join(__dirname, '..', 'ui')));
}

// Store active rooms
const rooms = new Map();

// ===== ACCOUNTS DB (проста JSON-файлова база даних акаунтів) =====
// Зберігається у файлі accounts.json у корені проєкту.
// Сервер працює постійно, тому реєстрація/вхід доступні будь-коли.
const ACCOUNTS_FILE = path.join(__dirname, '..', '..', 'accounts.json');
let accounts = {}; // локальний JSON fallback: нік (точний регістр) -> { id, nick, password }

function loadAccounts() {
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
            console.log('[auth] Loaded ' + Object.keys(accounts).length + ' account(s) from DB');
        } else {
            console.log('[auth] No accounts DB yet - starting fresh');
        }
    } catch (e) {
        console.error('[auth] Failed to load accounts DB:', e.message);
        accounts = {};
    }
}

function saveAccounts() {
    try {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        return true;
    } catch (e) {
        console.error('[auth] Failed to save accounts DB:', e.message);
        return false;
    }
}

// Унікальний ID гравця для акаунта
function generateAccountId() {
    return 'p_' + crypto.randomBytes(8).toString('hex');
}

loadAccounts();

// ===== MONGODB ATLAS (постійне хмарне сховище акаунтів) =====
// Якщо задана змінна середовища MONGODB_URI (рядок підключення з Atlas),
// акаунти зберігаються в MongoDB Atlas НАЗАВЖДИ і переживають перезапуски
// та редеплої сервера. Якщо змінна не задана (локальна розробка) —
// використовується локальний JSON-файл accounts.json.
const MONGODB_URI = process.env.MONGODB_URI || '';
let accountsCollection = null; // колекція MongoDB, якщо підключено

async function initAccountsStorage() {
    if (!MONGODB_URI) return;
    try {
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        accountsCollection = client.db('colonization').collection('accounts');
        console.log('[auth] Connected to MongoDB Atlas - accounts are stored PERMANENTLY');
    } catch (e) {
        console.error('[auth] MongoDB connection FAILED, falling back to local JSON:', e.message);
        accountsCollection = null;
    }
}

initAccountsStorage();

// Generate random room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Create dev card deck (same composition as client-side)
function createDevCardDeck() {
    const deck = [];
    for (let i = 0; i < 14; i++) deck.push({ type: 'knight', id: 'knight_' + i });
    for (let i = 0; i < 2; i++) deck.push({ type: 'plenty', id: 'plenty_' + i });
    for (let i = 0; i < 2; i++) deck.push({ type: 'monopoly', id: 'monopoly_' + i });
    for (let i = 0; i < 2; i++) deck.push({ type: 'roads', id: 'roads_' + i });
    deck.push({ type: 'vp_market', id: 'vp_market' },
        { type: 'vp_library', id: 'vp_library' },
        { type: 'vp_cathedral', id: 'vp_cathedral' },
        { type: 'vp_townhall', id: 'vp_townhall' },
        { type: 'vp_university', id: 'vp_university' });
    
    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
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

    // Cannot place a road on an edge that borders an OPPONENT settlement
    if (vkA && room.buildings.has(vkA) && room.buildings.get(vkA).playerId !== playerId) return false;
    if (vkB && room.buildings.has(vkB) && room.buildings.get(vkB).playerId !== playerId) return false;

    // NEW: Cannot place a road on an edge that is adjacent to an OPPONENT's road
    for (const [ek2, bld] of room.buildings) {
        if (bld.type !== 'road' || bld.playerId === playerId) continue;
        const edge2 = edgeMap.get(ek2);
        if (!edge2) continue;
        
        const round3 = (n) => Math.round(n * 1000);
        if ((round3(edge2.va.x) === round3(va.x) && round3(edge2.va.y) === round3(va.y)) ||
            (round3(edge2.va.x) === round3(vb.x) && round3(edge2.va.y) === round3(vb.y)) ||
            (round3(edge2.vb.x) === round3(va.x) && round3(edge2.vb.y) === round3(va.y)) ||
            (round3(edge2.vb.x) === round3(vb.x) && round3(edge2.vb.y) === round3(vb.y))) {
            return false;
        }
    }

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
        if ((bld.type === 'settlement' || bld.type === 'city') && bld.playerId === playerId) {
            // Rule: settlements of the SAME player must be at least 2 edges apart
            // No exception - minimum 2 edges required between any two settlements of the same player
            if (vk2 === vertexKey) return false;
            if (neighborKeys.includes(vk2)) {
                // Road exists between them - can't place (2 edges minimum)
                return false;
            }
        }
    }
    // Check if vertex is already occupied by ANY player
    if (room.buildings.has(vertexKey)) return false;
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

// ===== MEDALS (LARGEST ARMY / LONGEST ROAD) - SERVER-SIDE AUTHORITATIVE =====
const ARMY_BASE_THRESHOLD = 3;
const ROAD_BASE_THRESHOLD = 5;

// Compute a player's longest contiguous road on the server (mirrors client logic)
function computeLongestRoadServer(room, playerId) {
    if (!room.buildings || !room.topology || !room.topology.edges || !room.topology.vertices) return 0;
    const edgeMap = new Map(room.topology.edges);
    const vertexMap = new Map(room.topology.vertices);
    const getCoordKey = (pos) => `${Math.round(pos.x * 1000)},${Math.round(pos.y * 1000)}`;

    // All settlements/cities break roads
    const separatorKeys = new Set();
    for (const [vk, bld] of room.buildings) {
        if (bld.type !== 'settlement' && bld.type !== 'city') continue;
        const vData = vertexMap.get(vk);
        if (vData && vData.pos) separatorKeys.add(getCoordKey(vData.pos));
    }

    // Build graph of this player's roads only
    const roadGraph = new Map();
    for (const [ek, bld] of room.buildings) {
        if (bld.type !== 'road' || bld.playerId !== playerId) continue;
        const edge = edgeMap.get(ek);
        if (!edge || !edge.va || !edge.vb) continue;
        const keyA = getCoordKey(edge.va), keyB = getCoordKey(edge.vb);
        if (!roadGraph.has(keyA)) roadGraph.set(keyA, []);
        if (!roadGraph.has(keyB)) roadGraph.set(keyB, []);
        roadGraph.get(keyA).push({ nextKey: keyB });
        roadGraph.get(keyB).push({ nextKey: keyA });
    }
    if (roadGraph.size === 0) return 0;

    let best = 0;
    const visited = new Set();
    function dfs(nodeKey, length) {
        if (length > best) best = length;
        for (const nb of roadGraph.get(nodeKey) || []) {
            if (visited.has(nb.nextKey)) continue;
            if (separatorKeys.has(nb.nextKey)) {
                if (length + 1 > best) best = length + 1;
                continue;
            }
            visited.add(nb.nextKey);
            dfs(nb.nextKey, length + 1);
            visited.delete(nb.nextKey);
        }
    }
    for (const [nodeKey] of roadGraph) {
        visited.add(nodeKey);
        dfs(nodeKey, 0);
        visited.delete(nodeKey);
    }
    return best;
}

// Helper: count available (unused) knight cards in a player's hand
function getAvailableKnightCount(room, playerId) {
    const hand = room.devCardHands.get(playerId) || [];
    return hand.filter(c => c.type === 'knight' && !c.used).length;
}

// Recompute and persist the largest army medal (with escalation), broadcast to room
function updateLargestArmy(room, roomCode) {
    if (!room.largestArmy) room.largestArmy = { holderId: null, level: 0 };
    const entry = room.largestArmy;

    // Compute available (unused) knight counts from dev card hands
    const knightCounts = {};
    for (const p of room.players) {
        knightCounts[p.id] = getAvailableKnightCount(room, p.id);
    }

    // If a holder exists, check whether they still hold enough knights
    if (entry.holderId !== null) {
        const holderCount = knightCounts[entry.holderId] || 0;
        const holderMinThreshold = ARMY_BASE_THRESHOLD + entry.level;
        if (holderCount < holderMinThreshold) {
            // Holder no longer meets the minimum -> release the medal
            entry.holderId = null;
        }
    }

    if (entry.holderId === null) {
        // No holder: first one to reach the base threshold takes the medal
        let bestId = null, bestCount = 0;
        for (const [pid, count] of Object.entries(knightCounts)) {
            if (count >= ARMY_BASE_THRESHOLD && count > bestCount) {
                bestId = pid;
                bestCount = count;
            }
        }
        if (bestId) {
            entry.holderId = bestId;
            entry.level = 0;
        }
    } else {
        // Holder exists: to steal, a challenger must have MORE knights than the holder
        const holderCount = knightCounts[entry.holderId] || 0;
        let bestId = null, bestCount = 0;
        for (const [pid, count] of Object.entries(knightCounts)) {
            if (pid !== entry.holderId && count > holderCount && count > bestCount) {
                bestId = pid;
                bestCount = count;
            }
        }
        if (bestId) {
            // Someone steals the medal -> escalate
            entry.level++;
            entry.holderId = bestId;
        }
    }

    broadcastMedals(room, roomCode);

    // Check for victory after medal changes (largest army gives +2 VP)
    checkVictory(roomCode, room);
}

// Recompute and persist the longest road medal (with escalation), broadcast to room
function updateLongestRoad(room, roomCode) {
    if (!room.longestRoad) room.longestRoad = { holderId: null, level: 0 };
    const entry = room.longestRoad;

    // Compute each player's longest road
    const roadLengths = {};
    for (const p of room.players) {
        roadLengths[p.id] = computeLongestRoadServer(room, p.id);
    }

    // If a holder exists, check whether they still hold the required minimum
    if (entry.holderId !== null) {
        const holderLen = roadLengths[entry.holderId] || 0;
        const holderMinThreshold = ROAD_BASE_THRESHOLD + entry.level;
        if (holderLen < holderMinThreshold) {
            // Holder no longer meets the minimum -> release the medal
            entry.holderId = null;
        }
    }

    if (entry.holderId === null) {
        // No holder: first one to reach the base threshold takes the medal
        let bestId = null, bestLen = 0;
        for (const [pid, len] of Object.entries(roadLengths)) {
            if (len >= ROAD_BASE_THRESHOLD && len > bestLen) {
                bestId = pid;
                bestLen = len;
            }
        }
        if (bestId) {
            entry.holderId = bestId;
            entry.level = 0;
        }
    } else {
        // Holder exists: to steal, a challenger must have a LONGER road than the holder
        const holderLen = roadLengths[entry.holderId] || 0;
        let bestId = null, bestLen = 0;
        for (const [pid, len] of Object.entries(roadLengths)) {
            if (pid !== entry.holderId && len > holderLen && len > bestLen) {
                bestId = pid;
                bestLen = len;
            }
        }
        if (bestId) {
            // Someone steals the medal -> escalate
            entry.level++;
            entry.holderId = bestId;
        }
    }

    broadcastMedals(room, roomCode);

    // Check for victory after medal changes (longest road gives +2 VP)
    checkVictory(roomCode, room);
}

// Broadcast the authoritative medal state to all players in the room
function broadcastMedals(room, roomCode) {
    const medals = {
        largestArmy: room.largestArmy || { holderId: null, level: 0 },
        longestRoad: room.longestRoad || { holderId: null, level: 0 }
    };
    // Send authoritative AVAILABLE (unused) knight counts for ALL players so the client can
    // display the correct threshold and who currently holds the medal
    const knightCardsData = {};
    if (room.devCardHands) {
        for (const [pid, hand] of room.devCardHands) {
            knightCardsData[pid] = hand.filter(c => c.type === 'knight' && !c.used).length;
        }
    }
    medals.knightCards = knightCardsData;

    // Send authoritative road lengths for ALL players
    const roadLengthsData = {};
    for (const p of room.players) {
        roadLengthsData[p.id] = computeLongestRoadServer(room, p.id);
    }
    medals.roadLengths = roadLengthsData;

    // Thresholds for VISUAL display: how many a challenger needs to steal the medal
    const armyHolderId = medals.largestArmy.holderId;
    const armyHolderCount = armyHolderId ? (knightCardsData[armyHolderId] || 0) : 0;
    medals.armyThreshold = armyHolderId ? armyHolderCount + 1 : ARMY_BASE_THRESHOLD;

    const roadHolderId = medals.longestRoad.holderId;
    const roadHolderCount = roadHolderId ? (roadLengthsData[roadHolderId] || 0) : 0;
    medals.roadThreshold = roadHolderId ? roadHolderCount + 1 : ROAD_BASE_THRESHOLD;

    io.to(roomCode).emit('medals-synced', medals);
}

// Compute a player's victory points on the server (authoritative)
// Includes: settlements (1 VP), cities (2 VP), unused VP dev cards (+1 each),
// largest army medal (+2), longest road medal (+2)
function computeVictoryPointsServer(room, playerId) {
    let vp = 0;

    // 1) Settlements (1 VP) and cities (2 VP) from server-authoritative buildings
    if (room.buildings) {
        for (const [, bld] of room.buildings) {
            if (bld.playerId !== playerId) continue;
            if (bld.type === 'settlement') vp += 1;
            else if (bld.type === 'city') vp += 2;
        }
    }

    // 2) Victory point dev cards (unused) from server-authoritative hands
    if (room.devCardHands) {
        const hand = room.devCardHands.get(playerId) || [];
        for (const card of hand) {
            if (card && card.type && card.type.startsWith('vp_') && !card.used) {
                vp += 1;
            }
        }
    }

    // 3) Largest army medal (+2 VP)
    if (room.largestArmy && room.largestArmy.holderId === playerId) {
        vp += 2;
    }

    // 4) Longest road medal (+2 VP)
    if (room.longestRoad && room.longestRoad.holderId === playerId) {
        vp += 2;
    }

    return vp;
}

// NEW: Check if any player has reached 10 victory points
function checkVictory(roomCode, room) {
    // Compute VP authoritatively on the server for each player
    for (const p of room.players) {
        const vp = computeVictoryPointsServer(room, p.id);
        // Store the authoritative VP so clients can sync from it
        if (!room.playerVP) room.playerVP = new Map();
        room.playerVP.set(p.id, vp);

        if (vp >= 10) {
            // Player has reached 10 VP and wins the game
            room.winnerId = p.id;
            room.status = 'game-over';
            
            // Broadcast victory to all players in the room
            io.to(roomCode).emit('game-over', {
                winnerId: p.id,
                message: `Гравець ${p.name} переміг!`,
                players: room.players.map(pl => ({ id: pl.id, name: pl.name, color: pl.color }))
            });
            
            // Stop the game - no more turns
            return;
        }
    }
}

// Reset room for a new game (restart)
function resetRoomForRestart(roomCode, room) {
    // If a player left during game-over, restart is blocked
    if (room.restartBlocked) {
        console.log('[server] Restart blocked: a player left during game-over');
        return;
    }
    
    // Reset all game state
    room.status = 'in-game';
    room.gamePhase = 'dice-roll';
    room.diceRolls = new Map();
    room.initialBuildOrder = [];
    room.currentInitialBuildIndex = 0;
    room.initialBuildRoundComplete = false;
    room.turnOrder = [];
    room.currentTurnIndex = 0;
    room.turnState = {
        diceRolled: false,
        actionsLocked: true
    };
    room.buildings = new Map();
    // NOTE: room.topology is NOT reset to null here.
    // If the host sends a NEW topology via 'store-topology' before the restart completes,
    // that new topology will be used for the next game. Otherwise the previous topology
    // is retained so server-side validation still works for the reused map.
    room.robber = { hexKey: null, placedBy: null };
    room.devCardHands = new Map();
    room.knightCards = new Map();
    room.largestArmy = { holderId: null, level: 0 };
    room.longestRoad = { holderId: null, level: 0 };
    room.winnerId = null;
    room.restartReady = new Set();
    room.restarting = false;
    room.playerVP = new Map();
    room.playerResources = new Map();
    room.pendingKnightCards = new Map();
    // NOTE: room.gameState is NOT reset to null here.
    // If the host sends a NEW map via 'store-map' before voting for restart,
    // that new map will be used for the next game. Otherwise the previous
    // map is reused (which still gives players a valid board to play on).
    
    // Initialize player resources for all players
    for (const p of room.players) {
        room.playerResources.set(p.id, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
        room.devCardHands.set(p.id, []);
        room.knightCards.set(p.id, 0);
        room.playerVP.set(p.id, 0);
    }
    
    // Initialize dev card deck
    room.devCardDeck = createDevCardDeck();
    // NOTE: No cards are dealt at game start - players must BUY dev cards
    // with resources (geese + water + stone) during the game.
    
    // Find desert hex for robber initial position
    let desertHexKey = '0,0,0';
    if (room.gameState && room.gameState.resources) {
        for (const [key, res] of Object.entries(room.gameState.resources)) {
            if (res === 'desert') {
                desertHexKey = key;
                break;
            }
        }
    }
    room.robber = { hexKey: desertHexKey, placedBy: null };
    
    // Notify all players that restart is happening
    io.to(roomCode).emit('restart-started', {
        message: 'Гра перезапускається!',
        players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
    });
    
    // Send new game state
    io.to(roomCode).emit('game-started', { mapSeed: room.gameState || {} });
    io.to(roomCode).emit('start-dice-phase', {
        players: room.players.map(p => ({ id: p.id, name: p.name }))
    });
    
    // Sync the robber position (desert hex) to ALL clients so the robber
    // token appears on the new board after restart. Must be sent AFTER
    // 'game-started' so clients already render the new map.
    io.to(roomCode).emit('robber-synced', { robber: room.robber });
    
    // Update room list
    io.emit('rooms-list', getRoomsList());
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Global error handler for this socket
    socket.on('error', (error) => {
        console.error('Socket error for', socket.id, ':', error);
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Player disconnected:', socket.id, 'Reason:', reason);
    });

    // ===== AUTH: РЕЄСТРАЦІЯ АКАУНТА =====
    // Працює постійно (сервер завжди запущений), гравці можуть реєструватися будь-коли
    socket.on('auth-register', async ({ nick, password }) => {
        nick = String(nick || '').trim();
        password = String(password || '');

        // Валідація: і нік, і пароль обов'язкові (поля не можуть бути порожніми)
        if (!nick || !password) {
            socket.emit('auth-register-result', { success: false, error: 'Введіть нік і пароль!' });
            return;
        }
        if (nick.length > 20) {
            socket.emit('auth-register-result', { success: false, error: 'Нік занадто довгий (макс. 20 символів)' });
            return;
        }

        // Акаунт зберігає рівно те, що ввів гравець: нік і пароль як є
        const account = {
            id: generateAccountId(),
            nick: nick,
            password: password
        };

        // ===== MongoDB Atlas — ПОСТІЙНЕ сховище (акаунти не губляться) =====
        if (accountsCollection) {
            try {
                // Ніки чутливі до регістру: "Kirik" і "kirik" — різні акаунти
                const exists = await accountsCollection.findOne({ nick: nick });
                if (exists) {
                    socket.emit('auth-register-result', { success: false, error: 'Такий нік вже зайнятий!' });
                    return;
                }
                await accountsCollection.insertOne(account);
                console.log('[auth] Registered (Atlas):', nick, '->', account.id);
                socket.emit('auth-register-result', { success: true, playerId: account.id, nick: account.nick });
            } catch (e) {
                console.error('[auth] Register error:', e.message);
                socket.emit('auth-register-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback (якщо Atlas не налаштований) =====
        const key = nick;
        if (accounts[key]) {
            socket.emit('auth-register-result', { success: false, error: 'Такий нік вже зайнятий!' });
            return;
        }

        accounts[key] = account;

        if (!saveAccounts()) {
            delete accounts[key];
            socket.emit('auth-register-result', { success: false, error: 'Помилка збереження на сервері' });
            return;
        }

        console.log('[auth] Registered new account (local JSON):', nick, '->', account.id);
        socket.emit('auth-register-result', { success: true, playerId: account.id, nick: account.nick });
    });

    // ===== AUTH: ПЕРЕВІРКА АКАУНТА (валідація клієнтського кешу) =====
    // Клієнт зберігає акаунт у localStorage. Цей обробник дозволяє клієнту
    // при запуску перевірити, чи акаунт досі існує в БД. Якщо ні (видалий),
    // клієнт скидає кеш і повертається в режим гостя.
    socket.on('auth-validate', async ({ nick, playerId }) => {
        nick = String(nick || '').trim();
        playerId = String(playerId || '');

        if (!nick || !playerId) {
            socket.emit('auth-validate-result', { valid: false });
            return;
        }

        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const account = await accountsCollection.findOne({ nick: nick });
                socket.emit('auth-validate-result', { valid: !!(account && account.id === playerId) });
            } catch (e) {
                console.error('[auth] Validate error:', e.message);
                // Помилка БД: не підтверджуємо і не спростовуємо акаунт
                socket.emit('auth-validate-result', { error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const account = accounts[nick];
        socket.emit('auth-validate-result', { valid: !!(account && account.id === playerId) });
    });

    // ===== AUTH: ВХІД В АКАУНТ =====
    socket.on('auth-login', async ({ nick, password }) => {
        nick = String(nick || '').trim();
        password = String(password || '');

        // Валідація: і нік, і пароль обов'язкові
        if (!nick || !password) {
            socket.emit('auth-login-result', { success: false, error: 'Введіть нік і пароль!' });
            return;
        }

        // ===== MongoDB Atlas — постійне сховище =====
        if (accountsCollection) {
            try {
                // Нік чутливий до регістру: "Kirik" і "kirik" — різні акаунти
                const account = await accountsCollection.findOne({ nick: nick });
                if (!account) {
                    socket.emit('auth-login-result', { success: false, error: 'Такого ака не існує' });
                    return;
                }

                if (account.password !== password) {
                    socket.emit('auth-login-result', { success: false, error: 'Невірний пароль!' });
                    return;
                }

                console.log('[auth] Login (Atlas):', account.nick, '->', account.id);
                socket.emit('auth-login-result', { success: true, playerId: account.id, nick: account.nick });
            } catch (e) {
                console.error('[auth] Login error:', e.message);
                socket.emit('auth-login-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        // Нік чутливий до регістру: "Kirik" і "kirik" — різні акаунти
        const account = accounts[nick];
        if (!account) {
            socket.emit('auth-login-result', { success: false, error: 'Такого ака не існує' });
            return;
        }

        if (account.password !== password) {
            socket.emit('auth-login-result', { success: false, error: 'Невірний пароль!' });
            return;
        }

        console.log('[auth] Login (local JSON):', account.nick, '->', account.id);
        socket.emit('auth-login-result', { success: true, playerId: account.id, nick: account.nick });
    });

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
            knightCards: new Map(), // playerId -> count of active knights
            largestArmy: { holderId: null, level: 0 }, // who holds largest army medal + escalation level
            longestRoad: { holderId: null, level: 0 }, // who holds longest road medal + escalation level
            winnerId: null, // player who reached 10 VP (game over)
            restartReady: new Set(), // player IDs who clicked "Play Again"
            restarting: false, // true while restarting (waiting for new map)
            restartBlocked: false, // true if a player left during game-over (restart disabled)
            playerVP: new Map() // playerId -> current victory points (synced from client)
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
            // Check if there's already a player with this socket.id in the room
            // (e.g., from a previous connection that wasn't cleaned up)
            const duplicateBySocket = room.players.find(p => p.id === socket.id);
            if (duplicateBySocket) {
                console.log('[server] rejoin-room: player already exists by socket.id, no duplicate created', { roomCode, socketId: socket.id });
                existingPlayer = duplicateBySocket;
            } else {
                console.log('[server] rejoin-room: player not found, pushing new player', { roomCode, socketId: socket.id, oldPlayerId });
                // Assign a free color instead of always 'red' to avoid duplicate colors
                const rejoinDefaultColors = ['red', 'blue', 'yellow', 'green'];
                const rejoinUsedColors = new Set(room.players.map(p => p.color).filter(c => c));
                const rejoinAssignedColor = rejoinDefaultColors.find(c => !rejoinUsedColors.has(c)) || 'red';
                room.players.push({
                    id: socket.id,
                    name: 'Гравець',
                    isHost: isHost,
                    color: rejoinAssignedColor
                });
            }
        } else {
            console.log('[server] rejoin-room: player found, no duplicate created', { roomCode, socketId: socket.id });
        }

        // If every player is connected again, allow restart once more
        // (restart gets blocked when someone disconnects during game-over)
        if (!room.players.some(p => p.disconnected)) {
            room.restartBlocked = false;
        }

        socket.join(roomCode);

        // Always send map and buildings (but never "resume" a finished game)
        if (room.gameState && room.status !== 'game-over') socket.emit('game-started', { mapSeed: room.gameState });
        if (room.buildings) {
            socket.emit('sync-buildings', { buildings: getBuildingsArray(room) });
        }
        
        // Send current robber state
        if (room.robber) {
            socket.emit('robber-synced', { robber: room.robber });
        }

        // Broadcast updated players list to the WHOLE room so other clients
        // (e.g., players already sitting in the lobby) see the returning player
        // as connected again with the SAME player entry (no duplicates)
        io.to(roomCode).emit('player-joined', {
            player: room.players.find(p => p.id === socket.id) || null,
            players: room.players
        });

        // If the previous game has ended, do NOT send resume-game events.
        // Players returning to the room lobby simply ignore this event, while
        // a client still sitting on the game page re-shows the victory overlay.
        if (room.status === 'game-over') {
            socket.emit('game-over', {
                winnerId: room.winnerId,
                message: 'Game over',
                players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
            });
            return;
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

        // If the previous game has ended, report the final result instead of
        // resume-game events (clients in the room lobby ignore this event)
        if (room.status === 'game-over') {
            socket.emit('game-over', {
                winnerId: room.winnerId,
                message: 'Game over',
                players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
            });
            return;
        }

        // Send map and buildings always
        if (room.gameState) socket.emit('game-started', { mapSeed: room.gameState });
        if (room.buildings) {
            socket.emit('sync-buildings', { buildings: getBuildingsArray(room) });
        }
        
        // Send current robber state
        if (room.robber) {
            socket.emit('robber-synced', { robber: room.robber });
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
            
            // Reset leftover per-game state from a previous game
            // (e.g., when a new game is started from the room lobby after game-over)
            room.turnOrder = [];
            room.currentTurnIndex = 0;
            room.turnState = { diceRolled: false, actionsLocked: true };
            room.largestArmy = { holderId: null, level: 0 };
            room.longestRoad = { holderId: null, level: 0 };
            room.winnerId = null;
            room.restartReady = new Set();
            room.restarting = false;
            room.restartBlocked = false;
            room.playerVP = new Map();
            
            // Initialize robber on desert hex (desert is always at center 0,0,0 in generateMap)
            let desertHexKey = '0,0,0';
            if (room.gameState && room.gameState.resources) {
                for (const [key, res] of Object.entries(room.gameState.resources)) {
                    if (res === 'desert') {
                        desertHexKey = key;
                        break;
                    }
                }
            }
            room.robber = { hexKey: desertHexKey, placedBy: null };
            room.devCardHands = new Map();
            room.knightCards = new Map();
            room.playerResources = new Map();
            
            // Initialize dev card deck (shared among all players)
            room.devCardDeck = createDevCardDeck();
            
            // Initialize dev card hands for all players
            for (const p of room.players) {
                room.devCardHands.set(p.id, []);
                room.knightCards.set(p.id, 0);
                room.playerResources.set(p.id, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
            }
            // NOTE: No cards are dealt at game start - players must BUY dev cards
            // with resources (geese + water + stone) during the game.
            
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
        
        // ===== SERVER-SIDE RESOURCE COLLECTION =====
        // Initialize player resources if needed
        if (!room.playerResources) {
            room.playerResources = new Map();
        }
        for (const p of room.players) {
            if (!room.playerResources.has(p.id)) {
                room.playerResources.set(p.id, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
            }
        }
        
        // Collect resources for each player based on their buildings
        const resourceGains = new Map(); // playerId -> {resource: count}
        for (const p of room.players) {
            resourceGains.set(p.id, {});
        }
        
        // Get robber hex key
        const robberHexKey = room.robber?.hexKey || null;
        
        // Iterate through all buildings
        for (const [buildingKey, building] of room.buildings) {
            if (building.type !== 'settlement' && building.type !== 'city') continue;
            
            const vertexKey = building.vertexKey || building.key;
            if (!vertexKey) continue;
            
            // Find adjacent hexes for this vertex
            const vertexData = room.topology?.vertices?.get(vertexKey);
            if (!vertexData || !vertexData.hexes) continue;
            
            const multiplier = building.type === 'city' ? 2 : 1;
            
            // Check each adjacent hex
            for (const hex of vertexData.hexes) {
                const hexKeyStr = hex.q + ',' + hex.r + ',' + hex.s;
                const hexNumber = room.gameState?.numbers?.[hexKeyStr];
                const hexResource = room.gameState?.resources?.[hexKeyStr];
                
                // Skip if number doesn't match dice total
                if (hexNumber !== total) continue;
                
                // Skip desert
                if (!hexResource || hexResource === 'desert') continue;
                
                // Check if robber is on this hex
                if (robberHexKey === hexKeyStr) {
                    // Robber is here - resources go to the robber placer
                    const robberPlacerId = room.robber?.placedBy;
                    if (robberPlacerId && resourceGains.has(robberPlacerId)) {
                        resourceGains.get(robberPlacerId)[hexResource] = (resourceGains.get(robberPlacerId)[hexResource] || 0) + multiplier;
                    }
                } else {
                    // Normal resource collection
                    const playerId = building.playerId;
                    if (resourceGains.has(playerId)) {
                        resourceGains.get(playerId)[hexResource] = (resourceGains.get(playerId)[hexResource] || 0) + multiplier;
                    }
                }
            }
        }
        
        // Apply resource gains to player resources
        const resourceUpdates = {};
        for (const [playerId, gains] of resourceGains) {
            const playerRes = room.playerResources.get(playerId);
            if (!playerRes) continue;
            
            let totalGained = 0;
            for (const [resource, count] of Object.entries(gains)) {
                playerRes[resource] += count;
                totalGained += count;
            }
            
            if (totalGained > 0) {
                resourceUpdates[playerId] = { ...playerRes };
            }
        }
        
        // Send resource collection data to all players
        io.to(roomCode).emit('collect-resources', {
            diceTotal: total,
            resourceUpdates: resourceUpdates,
            robberHexKey: robberHexKey
        });
        
        // Check for victory (player reached 10 VP) after resource collection
        checkVictory(roomCode, room);
        
        // Sync buildings after dice roll (in case robber moved, etc.)
        syncBuildingsToRoom(roomCode, room);
    });

    // Handle end turn
    socket.on('end-turn', ({ roomCode, playerId }) => {
        try {
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
        } catch (error) {
            console.error('Error in end-turn handler:', error);
            socket.emit('action-error', { message: 'Помилка завершення ходу' });
        }
    });

    // Sync a building action to all players (with validation)
    socket.on('sync-build', ({ roomCode, type, data }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        
        const key = data.edgeKey || data.vertexKey;
        if (!key) return;
        
        // VALIDATION: For cities, check if it's the player's own settlement first
        if (type === 'city') {
            const existing = room.buildings.get(key);
            if (!existing || existing.playerId !== socket.id || existing.type !== 'settlement') {
                socket.emit('action-error', { message: 'Не можна покращити це місто!' });
                return;
            }
        }
        // VALIDATION: Check if building spot is already taken (for non-city buildings)
        else if (room.buildings.has(key)) {
            socket.emit('action-error', { message: 'Це місце вже зайняте!' });
            return;
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
        
        // SERVER-SIDE VALIDATION: Check topology rules
        if (room.topology) {
            if (type === 'road') {
                // During initial build, skip connectivity validation for roads so that
                // road counting is handled purely by initialBuildProgress tracking
                if (room.gamePhase !== 'initial-build') {
                    // Don't build if not connected to player's network
                    if (!isEdgeConnectedServer(key, socket.id, room)) {
                        socket.emit('action-error', { message: 'Дорога не з\'єднана з вашою мережею!' });
                        return;
                    }
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
        
        // Recompute the longest road medal (with escalation) whenever ANY building is placed,
        // because a new settlement/city can break the holder's longest road.
        // Например: if the holder builds a settlement in the middle of their longest road,
        // the road segments get split and the medal must be recalculated.
        updateLongestRoad(room, roomCode);

        // Check for victory after any building is placed (e.g. building a city to reach 10 VP)
        checkVictory(roomCode, room);
    });

    // Handle game actions
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
        // Update robber position on server — use room.robber (NOT room.gameState.robber)
        // room.robber is what regular-dice-roll uses for resource collection
        // Robber on desert should always be purple, regardless of who placed it
        const robberPlayer = room.players.find(p => p.id === socket.id);
        room.robber = {
            hexKey: payload.hexKey,
            placedBy: socket.id,
            color: robberPlayer ? robberPlayer.color : 'purple'
        };
            
            // ===== RESOURCE THEFT =====
            // When robber is placed on a hex belonging to another player,
            // check if that player has 7+ cards in hand and steal a random one
            const targetPlayerId = payload.targetPlayerId;
            
            // If this is from a knight card, mark it as used now
            if (payload.fromKnight && room.pendingKnightCards && room.pendingKnightCards.has(socket.id)) {
                const knightCard = room.pendingKnightCards.get(socket.id);
                knightCard.used = true;
                
                // Update knight count for largest army tracking
                if (!room.knightCards.has(socket.id)) {
                    room.knightCards.set(socket.id, 0);
                }
                room.knightCards.set(socket.id, room.knightCards.get(socket.id) + 1);
                
                // Clear pending knight card
                room.pendingKnightCards.delete(socket.id);
                
                // Recompute the largest army medal (with escalation) and broadcast
                updateLargestArmy(room, roomCode);
            }
            if (targetPlayerId && targetPlayerId !== socket.id) {
                // Initialize player resources if needed
                if (!room.playerResources) {
                    room.playerResources = new Map();
                }
                if (!room.playerResources.has(targetPlayerId)) {
                    room.playerResources.set(targetPlayerId, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
                }
                if (!room.playerResources.has(socket.id)) {
                    room.playerResources.set(socket.id, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
                }
                
                const fromResources = room.playerResources.get(targetPlayerId);
                const toResources = room.playerResources.get(socket.id);
                
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
                
                // Broadcast theft result to ALL players
                io.to(roomCode).emit('resource-stolen', {
                    fromPlayerId: targetPlayerId,
                    toPlayerId: socket.id,
                    resource: stolenResource,
                    success: stolenResource !== null,
                    hasEnoughCards: totalResources >= 7,
                    playerId: socket.id
                });
            }
            
            // Broadcast to all players
            io.to(roomCode).emit('game-state-update', {
                type: 'robber-placed',
                robber: room.robber,
                gameState: room.gameState
            });
            
            // Also emit robber-synced event for clients to update their local state
            io.to(roomCode).emit('robber-synced', {
                robber: room.robber
            });
        }
        else if (action === 'activate-knight') {
            // ===== SERVER-SIDE TURN VALIDATION FOR DEV CARDS =====
            // Dev cards can only be used during the player's own turn AFTER rolling the dice
            if (room.gamePhase !== 'regular-turn') {
                socket.emit('action-error', { message: 'Карти розвитку можна використовувати тільки під час гри!' });
                return;
            }
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentPlayerId !== socket.id) {
                socket.emit('action-error', { message: 'Зараз не ваш хід!' });
                return;
            }
            if (!room.turnState || !room.turnState.diceRolled || room.turnState.actionsLocked) {
                socket.emit('action-error', { message: 'Спочатку киньте кубики!' });
                return;
            }
            
            // Track knight usage on server - use devCardHands
            const playerHand = room.devCardHands.get(socket.id) || [];
            const knightCard = payload && payload.cardId 
                ? playerHand.find(c => c.id === payload.cardId && !c.used) 
                : playerHand.find(c => c.type === 'knight' && !c.used);
            
            if (knightCard) {
                // Mark card as used immediately to prevent reuse
                knightCard.used = true;
                
                // Store pending knight card for tracking
                if (!room.pendingKnightCards) {
                    room.pendingKnightCards = new Map();
                }
                room.pendingKnightCards.set(socket.id, knightCard);
                
                // Broadcast to all players that knight activation started
                io.to(roomCode).emit('game-state-update', {
                    type: 'knight-activated',
                    playerId: socket.id,
                    cardId: knightCard.id,
                    gameState: room.gameState
                });
                // Also emit direct event for client handlers
                io.to(roomCode).emit('knight-activated', {
                    playerId: socket.id,
                    cardId: knightCard.id
                });
            }
        }
        else if (action === 'activate-roads') {
            // ===== SERVER-SIDE TURN VALIDATION FOR DEV CARDS =====
            if (room.gamePhase !== 'regular-turn') {
                socket.emit('action-error', { message: 'Карти розвитку можна використовувати тільки під час гри!' });
                return;
            }
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentPlayerId !== socket.id) {
                socket.emit('action-error', { message: 'Зараз не ваш хід!' });
                return;
            }
            if (!room.turnState || !room.turnState.diceRolled || room.turnState.actionsLocked) {
                socket.emit('action-error', { message: 'Спочатку киньте кубики!' });
                return;
            }
            
            // Track roads card usage on server - use devCardHands
            const playerHand = room.devCardHands.get(socket.id) || [];
            const roadsCard = payload && payload.cardId 
                ? playerHand.find(c => c.id === payload.cardId && !c.used) 
                : playerHand.find(c => c.type === 'roads' && !c.used);
            
            if (roadsCard) {
                roadsCard.used = true;
                
                // Broadcast to all players
                io.to(roomCode).emit('game-state-update', {
                    type: 'roads-activated',
                    playerId: socket.id,
                    cardId: roadsCard.id,
                    gameState: room.gameState
                });
                // Also emit direct event for client handlers
                io.to(roomCode).emit('roads-activated', {
                    playerId: socket.id,
                    cardId: roadsCard.id
                });
            }
        }
        else if (action === 'activate-plenty') {
            // ===== SERVER-SIDE TURN VALIDATION FOR DEV CARDS =====
            if (room.gamePhase !== 'regular-turn') {
                socket.emit('action-error', { message: 'Карти розвитку можна використовувати тільки під час гри!' });
                return;
            }
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentPlayerId !== socket.id) {
                socket.emit('action-error', { message: 'Зараз не ваш хід!' });
                return;
            }
            if (!room.turnState || !room.turnState.diceRolled || room.turnState.actionsLocked) {
                socket.emit('action-error', { message: 'Спочатку киньте кубики!' });
                return;
            }
            
            // Track Year of Plenty card usage on server - use devCardHands
            const playerHand = room.devCardHands.get(socket.id) || [];
            const plentyCard = playerHand.find(c => c.type === 'plenty' && !c.used);
            
            if (plentyCard) {
                plentyCard.used = true;
                
                // NOTE: Resources are NOT added here because the client already
                // syncs them via 'sync-resources' action. Adding them again here
                // would DOUBLE the resources on the server side.
                
                // Broadcast to all players
                io.to(roomCode).emit('game-state-update', {
                    type: 'plenty-activated',
                    playerId: socket.id,
                    gameState: room.gameState
                });
                // Also emit direct event for client handlers
                io.to(roomCode).emit('plenty-activated', {
                    playerId: socket.id
                });
                
                // Sync dev cards to all players so the used status is preserved
                const devCardHandsData = {};
                for (const [pid, hand] of room.devCardHands) {
                    devCardHandsData[pid] = hand;
                }
                io.to(roomCode).emit('sync-dev-cards', { devCardHands: devCardHandsData });
            }
        }
        else if (action === 'sync-resources') {
            // Client updated its own resources locally (trading, building, year of plenty, etc.)
            // Sync the full resource state to the server so theft and buying work correctly
            if (payload && payload.resources) {
                if (!room.playerResources) {
                    room.playerResources = new Map();
                }
                room.playerResources.set(socket.id, { ...payload.resources });
            }
        }
        else if (action === 'monopoly') {
            // ===== SERVER-SIDE TURN VALIDATION FOR DEV CARDS =====
            if (room.gamePhase !== 'regular-turn') {
                socket.emit('action-error', { message: 'Карти розвитку можна використовувати тільки під час гри!' });
                return;
            }
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentPlayerId !== socket.id) {
                socket.emit('action-error', { message: 'Зараз не ваш хід!' });
                return;
            }
            if (!room.turnState || !room.turnState.diceRolled || room.turnState.actionsLocked) {
                socket.emit('action-error', { message: 'Спочатку киньте кубики!' });
                return;
            }
            
            // ===== SERVER-SIDE RESOURCE TRANSFER =====
            // Monopoly: ALL other players give ALL their resources of the selected type
            if (!room.playerResources) {
                room.playerResources = new Map();
            }
            
            const resource = payload.resource;
            if (!resource || !['wood', 'brick', 'geese', 'water', 'stone'].includes(resource)) {
                socket.emit('action-error', { message: 'Невірний тип ресурсу!' });
                return;
            }
            
            // Initialize my resources if needed
            if (!room.playerResources.has(socket.id)) {
                room.playerResources.set(socket.id, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
            }
            const myResources = room.playerResources.get(socket.id);
            
            // Collect resources from ALL other players
            let totalStolen = 0;
            const stolenFrom = {}; // playerId -> stolenCount
            
            for (const player of room.players) {
                if (player.id === socket.id) continue; // Skip self
                
                // Initialize player resources if needed
                if (!room.playerResources.has(player.id)) {
                    room.playerResources.set(player.id, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
                }
                const playerRes = room.playerResources.get(player.id);
                
                // Take ALL resources of this type
                const stolenCount = playerRes[resource] || 0;
                if (stolenCount > 0) {
                    playerRes[resource] -= stolenCount;
                    myResources[resource] += stolenCount;
                    totalStolen += stolenCount;
                    stolenFrom[player.id] = stolenCount;
                }
            }
            
            // Mark the monopoly card as used in server dev card hand
            const monoPlayerHand = room.devCardHands.get(socket.id) || [];
            const monoCard = monoPlayerHand.find(c => c.type === 'monopoly' && !c.used);
            if (monoCard) {
                monoCard.used = true;
            }
            
            // Broadcast monopoly result to all players
            io.to(roomCode).emit('game-state-update', {
                type: 'monopoly-completed',
                playerId: socket.id,
                resource: resource,
                stolenCount: totalStolen,
                stolenFrom: stolenFrom,
                myResources: myResources
            });
            // Also emit direct event for client handlers
            io.to(roomCode).emit('monopoly-completed', {
                playerId: socket.id,
                resource: resource,
                stolenCount: totalStolen,
                stolenFrom: stolenFrom,
                myResources: myResources
            });
            
            // Sync updated resources to all players
            const resourcesData = {};
            for (const [pid, res] of room.playerResources) {
                resourcesData[pid] = res;
            }
            io.to(roomCode).emit('resources-synced', { resources: resourcesData });
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
            io.to(roomCode).emit('resource-stolen', {
                fromPlayerId: fromPlayerId,
                toPlayerId: toPlayerId,
                resource: stolenResource,
                success: stolenResource !== null,
                hasEnoughCards: totalResources >= 7,
                playerId: socket.id
            });
        }
        else if (action === 'cancel-dev-card') {
            // Player cancelled a dev card action - restore the card to unused state
            const playerId = socket.id;
            const playerHand = room.devCardHands.get(playerId) || [];
            const card = payload && payload.cardId
                ? playerHand.find(c => c.id === payload.cardId)
                : (payload && payload.cardType
                    ? playerHand.find(c => c.type === payload.cardType && c.used)
                    : null);
            
            if (card) {
                card.used = false;
                
                // If this was a pending knight card, remove the pending state
                if (card.type === 'knight' && room.pendingKnightCards && room.pendingKnightCards.has(playerId)) {
                    room.pendingKnightCards.delete(playerId);
                }
                
                // Sync dev cards to all players so the restored state is preserved
                const devCardHandsData = {};
                for (const [pid, hand] of room.devCardHands) {
                    devCardHandsData[pid] = hand;
                }
                io.to(roomCode).emit('sync-dev-cards', { 
                    devCardHands: devCardHandsData,
                    remainingDeckCount: room.devCardDeck ? room.devCardDeck.length : 0
                });
            }
        }
        else if (action === 'buy-dev-card') {
            // ===== SERVER-SIDE DEV CARD PURCHASE =====
            const playerId = socket.id;
            
            // Initialize dev card hand if needed
            if (!room.devCardHands.has(playerId)) {
                room.devCardHands.set(playerId, []);
            }
            
            // Check if player has resources (client should validate, but server double-checks)
            const playerRes = room.playerResources?.get(playerId);
            if (!playerRes || playerRes.stone < 1 || playerRes.geese < 1 || playerRes.water < 1) {
                socket.emit('action-error', { message: 'Недостатньо ресурсів для покупки карти!' });
                return;
            }
            
            // Check if deck has cards
            if (!room.devCardDeck || room.devCardDeck.length === 0) {
                socket.emit('action-error', { message: 'Колода карт розвитку порожня!' });
                return;
            }
            
            // Deduct resources
            playerRes.stone--;
            playerRes.geese--;
            playerRes.water--;
            
            // Draw card from deck
            const card = room.devCardDeck.pop();
            card.used = false;
            card.ownerId = playerId;
            
            // Add to player's hand
            room.devCardHands.get(playerId).push(card);
            
            // Broadcast to all players
            io.to(roomCode).emit('game-state-update', {
                type: 'dev-card-purchased',
                playerId: playerId,
                card: card,
                remainingDeckCount: room.devCardDeck.length,
                playerResources: playerRes
            });
            // Also emit direct event for client handlers
            io.to(roomCode).emit('dev-card-purchased', {
                playerId: playerId,
                card: card,
                remainingDeckCount: room.devCardDeck.length,
                playerResources: playerRes
            });
            
            // Sync dev cards to all players
            const devCardHandsData = {};
            for (const [pid, hand] of room.devCardHands) {
                devCardHandsData[pid] = hand;
            }
            io.to(roomCode).emit('sync-dev-cards', { devCardHands: devCardHandsData });

            // Recompute the largest army medal (with escalation) and broadcast,
            // so the client gets updated UNUSED knight counts for army tracking.
            updateLargestArmy(room, roomCode);

            // Check for victory after buying a dev card (VP cards give +1 VP)
            checkVictory(roomCode, room);
        }
    });

    // Sync victory points from client (server-authoritative check)
    socket.on('sync-vp', ({ roomCode, playerId, vp }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        // Only accept VP updates from the player themselves
        if (playerId !== socket.id) return;
        
        // Store VP on server
        if (!room.playerVP) room.playerVP = new Map();
        room.playerVP.set(playerId, vp);
        
        // Broadcast VP update to all players
        io.to(roomCode).emit('vp-synced', {
            playerId,
            vp,
            playerVP: Object.fromEntries(room.playerVP)
        });
        
        // Check for victory
        checkVictory(roomCode, room);
    });

    // Player votes to restart the game
    socket.on('restart-vote', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        // Check if game is over
        if (room.status !== 'game-over') return;
        
        // If restart is blocked (player left), don't accept votes
        if (room.restartBlocked) {
            socket.emit('action-error', { message: 'Рестарт заблоковано: гравець вийшов з гри' });
            return;
        }
        
        // Add player to restart ready set
        room.restartReady.add(socket.id);
        
        // Broadcast updated restart votes to all players
        io.to(roomCode).emit('restart-votes-updated', {
            readyCount: room.restartReady.size,
            totalPlayers: room.players.length,
            readyPlayers: Array.from(room.restartReady),
            players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
        });
        
        // Check if all players voted to restart
        if (room.restartReady.size >= room.players.length) {
            // All players ready - restart the game
            resetRoomForRestart(roomCode, room);
        }
    });

    // Host forces restart (or restart after all votes)
    socket.on('restart-game', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        // Only host can force restart
        if (room.host !== socket.id) return;
        
        // If restart is blocked (player left), don't allow restart
        if (room.restartBlocked) {
            socket.emit('action-error', { message: 'Рестарт заблоковано: гравець вийшов з гри' });
            return;
        }
        
        resetRoomForRestart(roomCode, room);
    });

    // Leave room explicitly
    socket.on('leave-room', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
            const wasHost = room.host === socket.id;
                room.players.splice(playerIndex, 1);
                
                // If a player leaves during the restart voting phase (game over),
                // remove them from the ready set so the vote count stays correct.
                if (room.restartReady && room.restartReady.has(socket.id)) {
                    room.restartReady.delete(socket.id);
                }
                
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
                    
                    // If the game is over and a player left, block restart and notify all players
                    if (room.status === 'game-over' && room.players.length > 0) {
                        room.restartBlocked = true;
                        const leftPlayer = room.players.find(p => p.id === socket.id);
                        const leftPlayerName = leftPlayer ? leftPlayer.name : 'Гравець ' + socket.id.slice(0, 4);
                        
                        io.to(roomCode).emit('game-over-blocked', {
                            message: 'Гравець ' + leftPlayerName + ' вийшов з гри. Рестарт неможливий.',
                        leftPlayerId: socket.id,
                        leftPlayerName: leftPlayerName,
                        readyPlayers: Array.from(room.restartReady || []),
                        players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
                        });
                    }
                    
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

                // If the game is over and the HOST leaves, block restart and notify
                // the remaining players (same as for a regular leaver) so their
                // votes list shows the X mark next to the host.
                // NOTE: this must live OUTSIDE the gamePhase if/else above because
                // the host branch returns early and would otherwise skip the
                // game-over-blocked broadcast entirely.
                if (room.gamePhase && room.status === 'game-over') {
                    room.restartBlocked = true;
                    io.to(code).emit('game-over-blocked', {
                        leftPlayerId: socket.id,
                        readyPlayers: Array.from(room.restartReady || []),
                        players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
                    });
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
                
                // If the game is over and a player disconnects, block restart
                if (room.status === 'game-over') {
                    room.restartBlocked = true;
                    const leftPlayerName = player.name || 'Гравець ' + socket.id.slice(0, 4);
                    io.to(code).emit('game-over-blocked', {
                        message: 'Гравець ' + leftPlayerName + ' відключився. Рестарт неможливий.',
                            leftPlayerId: socket.id,
                            leftPlayerName: leftPlayerName,
                            readyPlayers: Array.from(room.restartReady || []),
                            players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
                    });
                }
                
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