// Multiplayer Server for Colonization - Unified Version
// Supports both local and cloud deployment
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
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

// ===== MATCHMAKING QUEUE =====
// Queue of players waiting for a quick match (1v1)
// Each entry: { socketId, playerName, avatar, joinedAt }
const matchmakingQueue = [];

// Active matchmaking games (roomCode -> { player1Id, player2Id })
const matchmakingGames = new Map();

// Remove a player from the matchmaking queue
function removeFromMatchmakingQueue(socketId) {
    const index = matchmakingQueue.findIndex(p => p.socketId === socketId);
    if (index !== -1) {
        matchmakingQueue.splice(index, 1);
    }
}

// Try to match a player with another waiting player
function tryMatchmaking(socketId) {
    // Remove current player from queue if already there
    removeFromMatchmakingQueue(socketId);

    // Add current player to queue
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) return;

    let playerName = 'Гравець';
    let avatar = 0;
    try {
        const acc = socket.authAccount;
        if (acc) {
            playerName = acc.nick || 'Гравець';
            avatar = (Number.isInteger(acc.avatar) && acc.avatar >= 0 && acc.avatar <= 8) ? acc.avatar : 0;
        }
    } catch (e) {}

    matchmakingQueue.push({
        socketId,
        playerName,
        avatar,
        joinedAt: Date.now()
    });

    console.log('[matchmaking] Player joined queue:', socketId, playerName, 'Queue size:', matchmakingQueue.length);

    // Check if we can make a match (need at least 2 players)
    if (matchmakingQueue.length >= 2) {
        const player1 = matchmakingQueue.shift();
        const player2 = matchmakingQueue.shift();

        createMatchmakingGame(player1, player2);
    }
}

// Create a game for two matched players
function createMatchmakingGame(player1, player2) {
    const roomCode = generateRoomCode();

    const room = {
        code: roomCode,
        name: 'Швидка гра',
        host: player1.socketId, // First player is host
        maxPlayers: 2,
        players: [
            {
                id: player1.socketId,
                name: player1.playerName,
                isHost: true,
                color: 'red', // First player gets red
                avatar: player1.avatar
            },
            {
                id: player2.socketId,
                name: player2.playerName,
                isHost: false,
                color: 'blue', // Second player gets blue
                avatar: player2.avatar
            }
        ],
        gameState: null,
        createdAt: Date.now(),
        status: 'in-game', // Immediately in-game
        gamePhase: 'dice-roll',
        diceRolls: new Map(),
        initialBuildOrder: [],
        currentInitialBuildIndex: 0,
        initialBuildRoundComplete: false,
        turnOrder: [],
        currentTurnIndex: 0,
        turnState: { diceRolled: false, actionsLocked: true },
        buildings: new Map(),
        topology: null,
        robber: { hexKey: null, placedBy: null },
        devCardHands: new Map(),
        knightCards: new Map(),
        largestArmy: { holderId: null, level: 0 },
        longestRoad: { holderId: null, level: 0 },
        winnerId: null,
        restartReady: new Set(),
        restarting: false,
        restartBlocked: false,
        playerVP: new Map(),
        playerResources: new Map(),
        isMatchmaking: true, // Flag to identify matchmaking games
        matchmakingReady: new Set() // Track which players are ready
    };

    rooms.set(roomCode, room);

    // Make both players join the room
    const socket1 = io.sockets.sockets.get(player1.socketId);
    const socket2 = io.sockets.sockets.get(player2.socketId);

    if (socket1) socket1.join(roomCode);
    if (socket2) socket2.join(roomCode);

    // Store matchmaking game info
    matchmakingGames.set(roomCode, {
        player1Id: player1.socketId,
        player2Id: player2.socketId
    });

    console.log('[matchmaking] Game created:', roomCode, 'Players:', player1.playerName, '(red)', 'vs', player2.playerName, '(blue)');

    // Notify both players about the match
    const matchData = {
        roomCode,
        roomName: room.name,
        players: room.players,
        mapSeed: null // Will be set by host
    };

    if (socket1) {
        socket1.emit('matchmaking-found', {
            ...matchData,
            yourColor: 'red',
            opponent: { name: player2.playerName, color: 'blue', avatar: player2.avatar }
        });
    }
    if (socket2) {
        socket2.emit('matchmaking-found', {
            ...matchData,
            yourColor: 'blue',
            opponent: { name: player1.playerName, color: 'red', avatar: player1.avatar }
        });
    }
}

// ===== AUTO-CLEANUP: таймери відключення та прибиральник мертвих кімнат =====
// Якщо гравець відключився під час гри (збій мережі / закрив гру), у нього є
// 1 хвилина, щоб повернутися через rejoin-room. Якщо не повернувся:
//   - звичайний гравець -> катка автоматично завершується (кімната закривається);
//   - хозяїн -> кімната автоматично зникає.
// Явний вихід хозяїна кнопкою "Вийти" (leave-room) закриває кімнату миттєво.
// Тривалість таймера на повернення: 1 хвилина за замовчуванням.
// Можна перевизначити через env (наприклад, для тестів: DISCONNECT_GRACE_MS=3000).
const DISCONNECT_GRACE_MS = parseInt(process.env.DISCONNECT_GRACE_MS, 10) > 0
    ? parseInt(process.env.DISCONNECT_GRACE_MS, 10)
    : 60 * 1000;
const disconnectTimers = new Map(); // `${roomCode}:${socketId}` -> { timer, player }

function clearDisconnectTimer(roomCode, socketId) {
    const key = roomCode + ':' + socketId;
    const entry = disconnectTimers.get(key);
    if (entry) {
        clearTimeout(entry.timer);
        disconnectTimers.delete(key);
    }
}

function clearAllDisconnectTimersForRoom(roomCode) {
    const prefix = roomCode + ':';
    for (const [key, entry] of disconnectTimers) {
        if (key.startsWith(prefix)) {
            clearTimeout(entry.timer);
            disconnectTimers.delete(key);
        }
    }
}

function hasPendingDisconnectTimers(roomCode) {
    const prefix = roomCode + ':';
    for (const key of disconnectTimers.keys()) {
        if (key.startsWith(prefix)) return true;
    }
    return false;
}

// Закрити кімнату автоматично: повідомити всіх, видалити кімнату, оновити список
function closeRoomAutomatically(roomCode, message) {
    const room = rooms.get(roomCode);
    if (!room) return;
    console.log('[server] Auto-closing room ' + roomCode + ': ' + message);
    io.to(roomCode).emit('room-closed', { message });
    rooms.delete(roomCode);
    clearAllDisconnectTimersForRoom(roomCode);
    io.emit('rooms-list', getRoomsList());
}

// Запустити 1-хвилинний таймер на повернення для гравця, що відключився
function scheduleDisconnectTimeout(room, player, socketId) {
    const key = room.code + ':' + socketId;
    if (disconnectTimers.has(key)) return; // таймер уже запущено
    const isHostLeaver = room.host === socketId;
    const graceSeconds = Math.round(DISCONNECT_GRACE_MS / 1000);
    const timer = setTimeout(() => {
        disconnectTimers.delete(key);
        // Кімната ще існує і гравець так і не повернувся?
        const current = rooms.get(room.code);
        if (!current) return;
        if (!current.players.includes(player) || !player.disconnected) return; // повернувся
        if (current.status === 'game-over') {
            // Гра вже завершилась — просто закриваємо кімнату
            closeRoomAutomatically(room.code, 'Кімнату закрито: гравці покинули гру');
        } else if (isHostLeaver) {
            // Хозяїн не повернувся — кімната зникає автоматично
            closeRoomAutomatically(room.code, 'Хозяїн не повернувся — кімнату закрито автоматично');
        } else {
            // Звичайний гравець не повернувся — катка завершується автоматично
            closeRoomAutomatically(
                room.code,
                'Гравець ' + (player.name || 'Гравець') + ' не повернувся — катку завершено автоматично'
            );
        }
    }, DISCONNECT_GRACE_MS);
    disconnectTimers.set(key, { timer, player });
    console.log('[server] Disconnect grace timer (' + graceSeconds + 's) started for room ' + room.code + ', player ' + socketId);
}

// Перемістити ВСІ сліди гравця зі старого id на новий (reconnect / навігація між сторінками).
// Важливо: без цього залишаються "привиди" у devCardHands / knightCards / playerResources /
// playerVP, через які sync-и надсилають дані неіснуючого гравця.
function remapPlayerIdEverywhere(room, oldPlayerId, newPlayerId) {
    if (!oldPlayerId || oldPlayerId === newPlayerId) return;

    const playerIndex = room.players.findIndex(p => p.id === oldPlayerId);
    if (playerIndex !== -1) {
        room.players[playerIndex].id = newPlayerId;
        room.players[playerIndex].disconnected = false;
    }

    if (Array.isArray(room.turnOrder)) {
        room.turnOrder = room.turnOrder.map(pid => pid === oldPlayerId ? newPlayerId : pid);
    }

    if (Array.isArray(room.initialBuildOrder)) {
        room.initialBuildOrder = room.initialBuildOrder.map(item =>
            item && item.playerId === oldPlayerId ? { ...item, playerId: newPlayerId } : item
        );
    }

    if (room.diceRolls instanceof Map && room.diceRolls.has(oldPlayerId)) {
        const roll = room.diceRolls.get(oldPlayerId);
        room.diceRolls.delete(oldPlayerId);
        room.diceRolls.set(newPlayerId, roll);
    }

    if (room.initialBuildProgress instanceof Map && room.initialBuildProgress.has(oldPlayerId)) {
        const progress = room.initialBuildProgress.get(oldPlayerId);
        room.initialBuildProgress.delete(oldPlayerId);
        room.initialBuildProgress.set(newPlayerId, progress);
    }

    if (room.buildings instanceof Map) {
        for (const [key, building] of room.buildings.entries()) {
            if (building && building.playerId === oldPlayerId) {
                room.buildings.set(key, { ...building, playerId: newPlayerId });
            }
        }
    }

    if (room.devCardHands instanceof Map && room.devCardHands.has(oldPlayerId)) {
        const hand = room.devCardHands.get(oldPlayerId);
        room.devCardHands.delete(oldPlayerId);
        room.devCardHands.set(newPlayerId, hand);
    }

    if (room.knightCards instanceof Map && room.knightCards.has(oldPlayerId)) {
        const cnt = room.knightCards.get(oldPlayerId);
        room.knightCards.delete(oldPlayerId);
        room.knightCards.set(newPlayerId, cnt);
    }

    if (room.playerResources instanceof Map && room.playerResources.has(oldPlayerId)) {
        const res = room.playerResources.get(oldPlayerId);
        room.playerResources.delete(oldPlayerId);
        room.playerResources.set(newPlayerId, res);
    }

    if (room.playerVP instanceof Map && room.playerVP.has(oldPlayerId)) {
        const vp = room.playerVP.get(oldPlayerId);
        room.playerVP.delete(oldPlayerId);
        room.playerVP.set(newPlayerId, vp);
    }
}

// Прибрати записи "привидів" — ключі, що не відповідають жодному гравцю кімнати
function pruneGhostPlayerEntries(room) {
    const ids = new Set(room.players.map(p => p.id));
    for (const mapName of ['devCardHands', 'knightCards', 'playerResources', 'playerVP']) {
        const m = room[mapName];
        if (!(m instanceof Map)) continue;
        for (const key of Array.from(m.keys())) {
            if (!ids.has(key)) m.delete(key);
        }
    }
    if (Array.isArray(room.turnOrder)) {
        room.turnOrder = room.turnOrder.filter(pid => ids.has(pid));
    }
}

// Страховка: раз на 30 с підчищаемо кімнати, де ВСІ гравці відключилися, але
// з якоїсь причини таймери не спрацювали (наприклад, подія disconnect загубилася).
// Кімнати з активними таймерами очікування не чіпаємо — вони закриються самі.
const ROOM_REAPER_INTERVAL_MS = 30 * 1000;
setInterval(() => {
    rooms.forEach((room, code) => {
        const everyoneGone = room.players.length === 0 || room.players.every(p => p.disconnected);
        if (everyoneGone && !hasPendingDisconnectTimers(code)) {
            closeRoomAutomatically(code, 'Кімнату закрито: гравців немає в мережі');
        }
    });
}, ROOM_REAPER_INTERVAL_MS);

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
// ===== ХЕШУВАННЯ ПАРОЛІВ (scrypt) =====
// Паролі НІКОЛИ не зберігаються у відкритому вигляді. Замість цього зберігається
// рядок формату "scrypt$<salt-hex>$<hash-hex>". Для кожного пароля генерується
// власна випадкова сіль, тому однакові паролі дають різні хеші.
const SCRYPT_KEYLEN = 64; // довжина похідного ключа в байтах

// Чи збережений пароль вже є scrypt-хешем (а не легасі-відкритим текстом)
function isHashedPassword(stored) {
    return typeof stored === 'string' && stored.startsWith('scrypt$');
}

// Хешує пароль: випадкова сіль + scrypt (памʼяттєстійка KDF, розрахована саме на паролі)
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
    return 'scrypt$' + salt + '$' + hash;
}

// Перевіряє введений проти збереженого. Підтримує і легасі-паролі у відкритому
// вигляді (щоб старі акаунти могли увійти до міграції), і scrypt-хеші.
// Порівняння хешів — через timingSafeEqual (захист від timing-атак).
function verifyPassword(password, stored) {
    if (typeof stored !== 'string') return false;
    if (!isHashedPassword(stored)) {
        // Легасі: пароль ще збережений відкритим текстом (до міграції)
        return stored === String(password);
    }
    try {
        const parts = stored.split('$');
        if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
        const [, salt, expectedHex] = parts;
        const expected = Buffer.from(expectedHex, 'hex');
        const actual = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
        return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    } catch (e) {
        console.error('[auth] Password verification error:', e.message);
        return false;
    }
}

// Одноразова міграція локального JSON-сховища: відкриті паролі -> scrypt-хеші
function migratePlaintextPasswordsToHashes() {
    let changed = false;
    for (const acc of Object.values(accounts)) {
        if (
            acc && typeof acc === 'object' &&
            typeof acc.password === 'string' &&
            acc.password.length > 0 &&
            !isHashedPassword(acc.password)
        ) {
            acc.password = hashPassword(acc.password);
            changed = true;
        }
    }
    if (changed) {
        saveAccounts();
        console.log('[auth] Migrated local account passwords to scrypt hashes');
    }
}



// Генератор випадкового ніка для нового акаунта.
// При реєстрації гравець вводить ТІЛЬКИ логін і пароль; нік генерується сам,
// а гравець може змінити його згодом через вікно профілю (auth-change-nick).
function generateRandomNick() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    // Ніки унікальні (вони є ключем у списках друзів), тому перевіряємо зайнятість
    for (let attempt = 0; attempt < 20; attempt++) {
        let nick = '';
        const letterCount = 6 + Math.floor(Math.random() * 3);
        for (let i = 0; i < letterCount; i++) {
            nick += letters[Math.floor(Math.random() * letters.length)];
        }
        const digitCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < digitCount; i++) {
            nick += digits[Math.floor(Math.random() * digits.length)];
        }
        if (!findAccountByNick(nick)) return nick;
    }
    return 'player' + Date.now().toString(36);
}

// Пошук акаунта за ID у локальному JSON-сховищі
// (акаунти зберігаються за ключем login, тому потрібно перебрати всі значення)
function findAccountById(playerId) {
    for (const acc of Object.values(accounts)) {
        if (acc && typeof acc === 'object' && acc.id === playerId) return acc;
    }
    return null;
}

// Одноразова конвертація старих масивів друзів/запитів (айді) у ніки
function migrateFriendsArraysToNicks() {
    const idToNick = new Map();
    Object.values(accounts).forEach(a => {
        if (a && typeof a === 'object' && a.id && a.nick) idToNick.set(a.id, a.nick);
    });
    let changed = false;
    for (const a of Object.values(accounts)) {
        if (!a || typeof a !== 'object') continue;
        const conv = (arr) => (Array.isArray(arr) ? arr : []).map(v => idToNick.get(v) || v);
        const f = conv(a.friends);
        const r = conv(a.requests);
        if (JSON.stringify(f) !== JSON.stringify(a.friends)) { a.friends = f; changed = true; }
        if (JSON.stringify(r) !== JSON.stringify(a.requests)) { a.requests = r; changed = true; }
    }
    if (changed) {
        saveAccounts();
        console.log('[friends] Migrated local accounts to nick-based friends/requests arrays');
    }
}

loadAccounts();
migrateFriendsArraysToNicks();
migratePlaintextPasswordsToHashes(); // одноразова конвертація відкритих паролів у хеші

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
        // Одноразова конвертація старих масивів друзів/запитів (айді) у ніки
        const all = await accountsCollection.find({}).toArray();
        const idToNick = new Map();
        all.forEach(a => { if (a && a.id && a.nick) idToNick.set(a.id, a.nick); });
        for (const a of all) {
            const conv = (arr) => (Array.isArray(arr) ? arr : []).map(v => idToNick.get(v) || v);
            const f = conv(a.friends);
            const r = conv(a.requests);
            if (JSON.stringify(f) !== JSON.stringify(a.friends) || JSON.stringify(r) !== JSON.stringify(a.requests)) {
                await accountsCollection.updateOne({ id: a.id }, { $set: { friends: f, requests: r } });
                console.log('[friends] Migrated to nicks:', a.login);
            }
        }
        // Одноразова міграція БД: паролі у відкритому вигляді -> scrypt-хеші
        for (const a of all) {
            if (
                a && typeof a.password === 'string' &&
                a.password.length > 0 && !isHashedPassword(a.password)
            ) {
                await accountsCollection.updateOne({ id: a.id }, { $set: { password: hashPassword(a.password) } });
                console.log('[auth] Hashed legacy plaintext password for:', a.login);
            }
        }
        // Унікальні індекси: email використовується для відновлення пароля,
        // googleId — для вимкненої (але збереженої) Google-привʼязки. Sparse — бо поле є не в всіх.
        try { await accountsCollection.createIndex({ email: 1 }, { unique: true, sparse: true }); } catch (_) {}
        try { await accountsCollection.createIndex({ googleId: 1 }, { unique: true, sparse: true }); } catch (_) {}
    } catch (e) {
        console.error('[auth] MongoDB connection FAILED, falling back to local JSON:', e.message);
        accountsCollection = null;
    }
}

initAccountsStorage();

// ===== GOOGLE OAUTH (вхід / реєстрація / прив'язка акаунта через Google) =====
// Схема для Electron: гра через socket.io створює сесію (google-auth-start) і відкриває
// системний браузер на /google-auth?session=KEY; користувач логіниться через Google,
// Google повертає код на /api/auth/google/callback, сервер обмінює код на профіль і
// позначає сесію готовою; гра опитує google-auth-poll і отримує акаунт з усіма даними.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
// Тестовий режим: емулює відповідь Google без реальних ключів (автотести/розробка)
const TEST_FAKE_GOOGLE = process.env.TEST_FAKE_GOOGLE === 'true';
const GOOGLE_AUTH_ENABLED = TEST_FAKE_GOOGLE || !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://colonization.onrender.com').replace(/\/+$/, '');
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (PUBLIC_BASE_URL + '/api/auth/google/callback');

// Параїнг-сесії: sessionKey -> { status:'pending'|'done'|'error', createdAt, linkPlayerId, result?, error? }
const googleAuthSessions = new Map();
const GOOGLE_SESSION_TTL = 10 * 60 * 1000; // 10 хвилин на весь прохід

// ===== SMTP (надсилання листів) — використовується для відновлення пароля =====
// Налаштування через env-змінні на Render (підходить будь-який SMTP-провайдер:
// Brevo, SendGrid, Gmail з app-password тощо). Якщо не налаштовано — сервер
// працює у DEV-режимі: код відновлення пишеться в консоль сервера.
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || ('Colonization <' + (SMTP_USER || 'noreply@colonization.game') + '>');
// Рекомендований спосіб для Render free: надсилання через HTTPS-API Brevo (порт 443,
// який Render гарантовано дозволяє). SMTP-порти (587/465) на free-тарифі Render можуть
// блокуватися (звідси "Connection timeout"). BREVO_API_KEY береться в Brevo:
// SMTP & API -> API Keys -> Generate new API key (v3).
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';

function parseMailFrom(value) {
    // "Name <email>"
    const m = String(value || '').match(/^([^<]*)<([^>]*)>$/);
    if (m) return { name: m[1].trim() || 'Colonization', email: m[2].trim() };
    return { name: '', email: String(value || '') };
}

// ===== ВІДНОВЛЕННЯ ПАРОЛЯ: одноразові коди й токени =====
// passwordResets: email -> { codeHash (sha256), expiresAt, attempts, lastSentAt, login }
// resetTokens: одноразовий токен (видається після правильного коду) -> { email, expiresAt }
const passwordResets = new Map();
const resetTokens = new Map();
const RESET_CODE_TTL_MS = 10 * 60 * 1000;      // код живе 10 хвилин
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;    // повторна відправка не частіше ніж раз на хвилину
const RESET_MAX_ATTEMPTS = 5;                  // максимум спроб вводу коду
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;     // токен на зміну пароля живе 15 хвилин

function normalizeEmail(v) {
    return String(v || '').trim().toLowerCase();
}

function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}

function generateResetCode() {
    // 6-значний числовий код
    return String(crypto.randomInt(100000, 1000000));
}

function hashResetCode(code) {
    // Код зберігаємо лише як хеш: навіть витік памʼяті не дає готових кодів
    return crypto.createHash('sha256').update('colonization-reset:' + String(code)).digest('hex');
}

function safeEqualStr(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

let smtpTransport = null;
function getSmtpTransport() {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
    if (!smtpTransport) {
        // Ліниве підключення nodemailer: пакет потрібен лише коли SMTP налаштовано
        const nodemailer = require('nodemailer');
        smtpTransport = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS },
            // Щоб повільний/недоступний SMTP не підвішував запити гри
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });
    }
    return smtpTransport;
}

async function sendResetCodeEmail(toEmail, code) {
    const subject = 'Colonization — код підтвердження';
    const text = 'Ви запросили відновлення пароля в грі Colonization.\n\n'
        + 'Код підтвердження: ' + code + '\n'
        + 'Код дійсний 10 хвилин.\n\n'
        + 'Якщо це були не ви — просто проігноруйте цей лист.';
    const html = '<div style="background:#12122a;padding:28px;font-family:Segoe UI,Arial,sans-serif;color:#eee;border-radius:12px;max-width:480px;margin:auto;text-align:center;">'
        + '<h2 style="color:#f39c12;letter-spacing:3px;margin:0 0 14px;">COLONIZATION</h2>'
        + '<p style="margin:0 0 18px;">Ви запросили відновлення пароля.<br>Ваш код підтвердження:</p>'
        + '<div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#f1c40f;background:#1f1f3d;display:inline-block;padding:12px 22px;border-radius:10px;border:1px solid rgba(243,156,18,.4);">' + code + '</div>'
        + '<p style="color:#999;font-size:13px;margin-top:18px;">Код дійсний 10 хвилин.<br>Якщо це були не ви — просто проігноруйте лист.</p>'
        + '</div>';

    // --- Пріоритет 1: HTTPS-API Brevo (порт 443, працює з Render free) ---
    if (BREVO_API_KEY) {
        const sender = parseMailFrom(MAIL_FROM);
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 15000);
        try {
            const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'api-key': BREVO_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: sender.name || 'Colonization', email: sender.email || 'noreply@colonization.game' },
                    to: [{ email: toEmail }],
                    subject,
                    textContent: text,
                    htmlContent: html
                }),
                signal: controller.signal
            });
            clearTimeout(abortTimer);
            if (!resp.ok) {
                const bodyText = await resp.text().catch(() => '');
                throw new Error('Brevo API HTTP ' + resp.status + ': ' + bodyText.slice(0, 300));
            }
            console.log('[reset] Reset email sent via Brevo API to:', toEmail);
            return { sent: true };
        } catch (e) {
            clearTimeout(abortTimer);
            console.error('[reset] Brevo API error:', e.name || '', e.message);
            throw e; // поверне клієнту "Не вдалося надіслати"
        }
    }

    // --- Пріоритет 2: SMTP (nodemailer) ---
    const transport = getSmtpTransport();
    if (!transport) {
        // DEV-режим: жодного провайдера не налаштовано — код у консоль сервера
        console.log('[reset] No mail provider (SMTP/Brevo) configured. Reset code for ' + toEmail + ': ' + code);
        return { sent: false };
    }
    const sendPromise = transport.sendMail({ from: MAIL_FROM, to: toEmail, subject, text, html });
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('SMTP timeout')), 15000);
    });
    try {
        await Promise.race([sendPromise, timeoutPromise]);
        console.log('[reset] Reset email sent via SMTP to:', toEmail);
        return { sent: true };
    } catch (e) {
        console.error('[reset] SMTP error:', e.name || '', e.message);
        throw e;
    }
}

// Періодичне прибирання протермінованих кодів/токенів (щоб Map не ріс безмежно)
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of passwordResets) if (now > v.expiresAt) passwordResets.delete(k);
    for (const [k, v] of resetTokens) if (now > v.expiresAt) resetTokens.delete(k);
}, 5 * 60 * 1000).unref();

function createGoogleAuthSession(linkPlayerId) {
    const key = crypto.randomBytes(24).toString('hex');
    googleAuthSessions.set(key, { status: 'pending', createdAt: Date.now(), linkPlayerId: linkPlayerId || null });
    return key;
}

// Періодичне чищення протермінованих сесій
setInterval(() => {
    const now = Date.now();
    for (const [key, s] of googleAuthSessions) {
        if (now - s.createdAt > GOOGLE_SESSION_TTL) googleAuthSessions.delete(key);
    }
}, 60 * 1000).unref();

function buildGoogleConsentUrl(sessionKey) {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        state: sessionKey,
        access_type: 'online',
        prompt: 'select_account'
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// Обмін коду на профіль (sub + email). id_token отримано напряму від токен-ендпоінту
// Google по HTTPS — payload можна довіряти без перевірки підпису (стандартна практика).
function exchangeGoogleCodeForUserInfo(code) {
    return new Promise((resolve, reject) => {
        if (TEST_FAKE_GOOGLE) {
            setImmediate(() => resolve({
                sub: 'test-google-id-' + String(code).slice(-12),
                email: 'tester.' + String(code).slice(-8).toLowerCase() + '@example.com',
                email_verified: true
            }));
            return;
        }
        const body = new URLSearchParams({
            code: code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code'
        }).toString();
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.id_token) return reject(new Error(json.error_description || json.error || 'Google не повернув id_token'));
                    const payload = JSON.parse(Buffer.from(json.id_token.split('.')[1], 'base64').toString('utf8'));
                    if (payload.aud && payload.aud !== GOOGLE_CLIENT_ID) return reject(new Error('id_token виданий іншому клієнту'));
                    resolve({ sub: String(payload.sub || ''), email: payload.email ? String(payload.email).toLowerCase() : '', email_verified: !!payload.email_verified });
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('Таймаут запиту до Google')));
        req.write(body);
        req.end();
    });
}

// Generate random room code
// Пошук акаунта за Google ID / email / playerId (Atlas або локальний JSON)
async function findAccountByGoogleId(googleId) {
    if (!googleId) return null;
    if (accountsCollection) return accountsCollection.findOne({ googleId: googleId });
    for (const acc of Object.values(accounts)) {
        if (acc && typeof acc === 'object' && acc.googleId === googleId) return acc;
    }
    return null;
}
async function findAccountByEmail(email) {
    const norm = String(email || '').toLowerCase();
    if (!norm) return null;
    if (accountsCollection) return accountsCollection.findOne({ email: norm });
    for (const acc of Object.values(accounts)) {
        if (acc && typeof acc === 'object' && String(acc.email || '').toLowerCase() === norm) return acc;
    }
    return null;
}
async function findAccountByIdAsync(playerId) {
    if (!playerId) return null;
    if (accountsCollection) return accountsCollection.findOne({ id: playerId });
    return findAccountById(playerId);
}

function sanitizeLoginBase(str) {
    const cleaned = String(str || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    return cleaned.slice(0, 15) || 'player';
}

// Створення нового акаунта з Google-профілю (без пароля — вхід лише через Google)
async function createAccountFromGoogle(googleId, email) {
    let login = '';
    const base = sanitizeLoginBase(String(email || '').split('@')[0]);
    for (let i = 0; i < 50 && !login; i++) {
        const candidate = i === 0 ? base : base + i;
        const taken = accountsCollection ? (await accountsCollection.findOne({ login: candidate })) : !!accounts[candidate];
        if (!taken) login = candidate;
    }
    if (!login) login = 'g' + crypto.randomBytes(4).toString('hex');
    const account = {
        id: generateAccountId(),
        login: login,
        nick: generateRandomNick(),
        password: '',            // пароля немає: такий акаунт входить тільки через Google
        email: String(email || ''),
        emailVerified: true,     // Google сам підтверджує пошту власника
        googleId: googleId,
        cups: 0,
        friends: [],
        requests: []
    };
    for (let i = 0; i < 20; i++) {
        const nickTaken = accountsCollection ? (await accountsCollection.findOne({ nick: account.nick })) : !!findAccountByNick(account.nick);
        if (!nickTaken) break;
        account.nick = generateRandomNick();
    }
    if (accountsCollection) {
        await accountsCollection.insertOne(account);
    } else {
        accounts[account.login] = account;
        saveAccounts();
    }
    return account;
}

// Головна логіка після успішного Google-логіну: прив'язка АБО вхід/створення
async function handleGoogleIdentity(info, session) {
    const { sub, email } = info;
    // --- Прив'язка до вже залогіненого акаунта ---
    if (session.linkPlayerId) {
        const target = await findAccountByIdAsync(session.linkPlayerId);
        if (!target) throw new Error('Акаунт для привʼязки не знайдено');
        const already = await findAccountByGoogleId(sub);
        if (already && already.id !== target.id) throw new Error('Цей Google-акаунт вже привʼязаний до іншого акаунта гри');
        if (email) {
            const byEmail = await findAccountByEmail(email);
            if (byEmail && byEmail.id !== target.id) throw new Error('Ця електронна пошта вже використовується іншим акаунтом');
        }
        const update = { googleId: sub };
        if (email && !target.email) update.email = email; // наявну пошту не перезаписуємо
        if (accountsCollection) {
            await accountsCollection.updateOne({ id: target.id }, { $set: update });
        } else {
            Object.assign(target, update);
            saveAccounts();
        }
        console.log('[google] Linked Google account to:', target.login);
        return { mode: 'link', account: Object.assign({}, target, update) };
    }
    // --- Вхід або реєстрація ---
    let account = await findAccountByGoogleId(sub);
    let created = false;
    if (!account) {
        account = await createAccountFromGoogle(sub, email);
        created = true;
        console.log('[google] Created account from Google:', account.login);
    } else {
        console.log('[google] Login via Google:', account.login);
    }
    return { mode: created ? 'created' : 'login', account: account };
}

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

// ===== GOOGLE: сторінки браузера та колбек =====
function googleHtmlPage(bodyHtml) {
    return '<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<title>Colonization — Google</title><style>body{font-family:sans-serif;background:#1a1a2e;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}'
        + '.box{max-width:440px;padding:32px;border-radius:12px;background:#24243e;word-break:break-word}h2{margin-top:0}'
        + 'a.gbtn{display:inline-block;margin-top:16px;padding:14px 28px;background:#fff;color:#3c4043;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px}</style></head>'
        + '<body><div class="box">' + bodyHtml + '</div></body></html>';
}

// Крок 1: сторінка, яку відкриває системний браузер (посилання надсилає гра)
app.get('/google-auth', (req, res) => {
    const sessionKey = String(req.query.session || '');
    if (!GOOGLE_AUTH_ENABLED) {
        return res.status(503).send(googleHtmlPage('<h2>Google-вхід не налаштований</h2><p>Сервер працює без GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.</p>'));
    }
    const session = googleAuthSessions.get(sessionKey);
    if (!session || session.status !== 'pending') {
        return res.status(400).send(googleHtmlPage('<h2>Посилання недійсне</h2><p>Воно протермінувалося або вже використане. Поверніться у гру і натисніть кнопку ще раз.</p>'));
    }
    const actionUrl = TEST_FAKE_GOOGLE
        ? ('/api/auth/google/fake-consent?state=' + encodeURIComponent(sessionKey))
        : buildGoogleConsentUrl(sessionKey);
    res.send(googleHtmlPage('<h2>Colonization</h2><p>Продовжіть вхід через акаунт Google:</p><a class="gbtn" href="' + actionUrl + '">Увійти через Google</a>'));
});

// Тестова емуляція екрану згоди Google (лише для TEST_FAKE_GOOGLE)
if (TEST_FAKE_GOOGLE) {
    app.get('/api/auth/google/fake-consent', (req, res) => {
        const state = String(req.query.state || '');
        res.redirect('/api/auth/google/callback?code=fakecode' + crypto.randomBytes(6).toString('hex') + '&state=' + encodeURIComponent(state));
    });
}

// Крок 2: Google повертає код сюди; обмінюємо на профіль і завершуємо сесію
app.get('/api/auth/google/callback', async (req, res) => {
    try {
        if (!GOOGLE_AUTH_ENABLED) return res.status(503).send(googleHtmlPage('<h2>Google-вхід не налаштований</h2>'));
        const code = String(req.query.code || '');
        const state = String(req.query.state || '');
        const session = googleAuthSessions.get(state);
        if (!code || !session || session.status !== 'pending') {
            return res.status(400).send(googleHtmlPage('<h2>Посилання протермінувалося</h2><p>Поверніться у гру і спробуйте ще раз.</p>'));
        }
        const info = await exchangeGoogleCodeForUserInfo(code);
        if (!info.sub) throw new Error('Google не повернув ідентифікатор акаунта');
        const outcome = await handleGoogleIdentity(info, session);
        session.status = 'done';
        session.result = {
            mode: outcome.mode,
            playerId: outcome.account.id,
            nick: outcome.account.nick,
            login: outcome.account.login,
            cups: outcome.account.cups || 0,
            email: outcome.account.email || '',
            googleLinked: true
        };
        console.log('[google] Session done:', outcome.mode, '->', outcome.account.login);
        const verb = outcome.mode === 'created' ? 'створено' : (outcome.mode === 'link' ? 'привʼязано' : 'підтверджено');
        res.send(googleHtmlPage('<h2>✅ Готово!</h2><p>Акаунт успішно ' + verb + '. Поверніться у гру — вхід виконається автоматично.</p>'));
    } catch (e) {
        console.error('[google] Callback error:', e.message);
        const session = googleAuthSessions.get(String(req.query.state || ''));
        if (session && session.status === 'pending') { session.status = 'error'; session.error = e.message; }
        res.status(500).send(googleHtmlPage('<h2>Не вдалося увійти</h2><p>' + String(e.message || e).replace(/</g, '&lt;') + '</p>'));
    }
});

// ===== PRESENCE (хто зараз в мережі / у грі) =====
const presenceBySocket = new Map(); // socketId -> { playerId, inGame }
const socketsByPlayer = new Map();  // playerId -> Set<socketId>

// ===== FRIENDS: робота з ніками =====
// Друзі та запити зберігаються в БД як НІКИ (а не айді), тому:
// 1) ніки унікальні (генератор + перевірка при зміні ніка);
// 2) при зміні ніка він оновлюється у списках друзів/запитів інших гравців;
// 3) для статусу онлайн нік резолвиться назад в акаунт.
function findAccountByNick(nick) {
    for (const acc of Object.values(accounts)) {
        if (acc && typeof acc === 'object' && acc.nick === nick) return acc;
    }
    return null;
}
function friendOnlineState(friendNick) {
    const acc = findAccountByNick(friendNick);
    if (!acc || !acc.id) return 'offline';
    const set = socketsByPlayer.get(acc.id);
    if (!set || !set.size) return 'offline';
    for (const sid of set) {
        const info = presenceBySocket.get(sid);
        if (info && info.inGame) return 'ingame';
    }
    return 'online';
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
    
    // ===== PRESENCE: акаунт в мережі (клієнт надсилає при кожному конекті) =====
    socket.on('presence-online', ({ playerId, inGame }) => {
        playerId = String(playerId || '');
        if (!playerId) return;
        presenceBySocket.set(socket.id, { playerId, inGame: !!inGame });
        if (!socketsByPlayer.has(playerId)) socketsByPlayer.set(playerId, new Set());
        socketsByPlayer.get(playerId).add(socket.id);
    });

    socket.on('disconnect', (reason) => {
        console.log('Player disconnected:', socket.id, 'Reason:', reason);
        const pidInfo = presenceBySocket.get(socket.id);
        if (pidInfo) {
            presenceBySocket.delete(socket.id);
            const set = socketsByPlayer.get(pidInfo.playerId);
            if (set) {
                set.delete(socket.id);
                if (!set.size) socketsByPlayer.delete(pidInfo.playerId);
            }
        }
    });

    // ===== AUTH: GOOGLE (вхід / реєстрація / прив'язка через системний браузер) =====
    socket.on('google-auth-start', async ({ playerId }) => {
        try {
            if (!GOOGLE_AUTH_ENABLED) {
                socket.emit('google-auth-start-result', { success: false, error: 'На сервері не налаштовано вхід через Google' });
                return;
            }
            playerId = String(playerId || '');
            if (playerId) {
                const target = await findAccountByIdAsync(playerId);
                if (!target) {
                    socket.emit('google-auth-start-result', { success: false, error: 'Акаунт не знайдено' });
                    return;
                }
                if (target.googleId) {
                    socket.emit('google-auth-start-result', { success: false, error: 'До цього акаунта вже привʼязаний Google' });
                    return;
                }
            }
            const sessionKey = createGoogleAuthSession(playerId || null);
            const url = PUBLIC_BASE_URL + '/google-auth?session=' + encodeURIComponent(sessionKey);
            socket.emit('google-auth-start-result', { success: true, url: url, sessionKey: sessionKey });
        } catch (e) {
            console.error('[google] Start error:', e.message);
            socket.emit('google-auth-start-result', { success: false, error: 'Помилка запуску Google-входу' });
        }
    });

    // Гра опитує стан сесії кожні кілька секунд, доки браузерна частина не завершиться
    socket.on('google-auth-poll', ({ sessionKey }) => {
        const key = String(sessionKey || '');
        const s = googleAuthSessions.get(key);
        if (!s) {
            socket.emit('google-auth-poll-result', { status: 'error', error: 'Сесію не знайдено або вона протермінувалася' });
            return;
        }
        if (s.status === 'pending') {
            socket.emit('google-auth-poll-result', { status: 'pending' });
            return;
        }
        // Результат одноразовий: після видачі сесія знищується
        googleAuthSessions.delete(key);
        if (s.status === 'error') {
            socket.emit('google-auth-poll-result', { status: 'error', error: s.error || 'Помилка Google-входу' });
            return;
        }
        socket.emit('google-auth-poll-result', Object.assign({ status: 'done' }, s.result));
    });

    // ===== AUTH: ПРИВ'ЯЗКА EMAIL ДО АКАУНТА (кнопка в профілі) =====
    // Email потрібен, щоб гравець міг відновити пароль через код з листа.
    socket.on('account-bind-email', async ({ playerId, email }) => {
        playerId = String(playerId || '');
        const norm = normalizeEmail(email);

        if (!playerId) {
            socket.emit('account-bind-email-result', { success: false, error: 'Акаунт не знайдено' });
            return;
        }
        if (!isValidEmail(norm)) {
            socket.emit('account-bind-email-result', { success: false, error: 'Введіть коректний email' });
            return;
        }

        if (accountsCollection) {
            try {
                const acc = await accountsCollection.findOne({ id: playerId });
                if (!acc) {
                    socket.emit('account-bind-email-result', { success: false, error: 'Акаунт не знайдено' });
                    return;
                }
                const taken = await accountsCollection.findOne({ email: norm });
                if (taken && taken.id !== playerId) {
                    socket.emit('account-bind-email-result', { success: false, error: 'Цей email вже привʼязаний до іншого акаунта' });
                    return;
                }
                await accountsCollection.updateOne({ id: playerId }, { $set: { email: norm } });
                console.log('[auth] Email bound (Atlas):', acc.login, '->', norm);
                socket.emit('account-bind-email-result', { success: true, email: norm });
            } catch (e) {
                console.error('[auth] Bind email error:', e.message);
                socket.emit('account-bind-email-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const acc = findAccountById(playerId);
        if (!acc) {
            socket.emit('account-bind-email-result', { success: false, error: 'Акаунт не знайдено' });
            return;
        }
        const takenLocal = await findAccountByEmail(norm);
        if (takenLocal && takenLocal.id !== playerId) {
            socket.emit('account-bind-email-result', { success: false, error: 'Цей email вже привʼязаний до іншого акаунта' });
            return;
        }
        acc.email = norm;
        if (!saveAccounts()) {
            socket.emit('account-bind-email-result', { success: false, error: 'Помилка збереження на сервері' });
            return;
        }
        console.log('[auth] Email bound (local JSON):', acc.login, '->', norm);
        socket.emit('account-bind-email-result', { success: true, email: norm });
    });

    // ===== AUTH: ЗАБУЛИ ПАРОЛЬ — КРОК 1. Надіслати код на email =====
    socket.on('auth-forgot-password', async ({ email }) => {
        const norm = normalizeEmail(email);

        if (!isValidEmail(norm)) {
            socket.emit('auth-forgot-password-result', { success: false, error: 'Введіть коректний email' });
            return;
        }

        // Анти-спам: повторна відправка не частіше ніж раз на хвилину
        const existing = passwordResets.get(norm);
        if (existing && Date.now() - existing.lastSentAt < RESET_RESEND_COOLDOWN_MS) {
            const waitSec = Math.ceil((RESET_RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt)) / 1000);
            socket.emit('auth-forgot-password-result', { success: false, error: 'Код уже надіслано. Повторно можна через ' + waitSec + ' с' });
            return;
        }

        const acc = await findAccountByEmail(norm);
        if (!acc) {
            socket.emit('auth-forgot-password-result', { success: false, error: 'Акаунт з таким email не знайдено' });
            return;
        }
        // Акаунти без пароля (створені через соцмережі) не відновлюються через код
        if (!acc.password) {
            socket.emit('auth-forgot-password-result', { success: false, error: 'Для цього акаунта пароль не встановлено' });
            return;
        }

        let outcome;
        try {
            const code = generateResetCode();
            outcome = await sendResetCodeEmail(norm, code);
            passwordResets.set(norm, {
                codeHash: hashResetCode(code),
                expiresAt: Date.now() + RESET_CODE_TTL_MS,
                attempts: 0,
                lastSentAt: Date.now(),
                login: acc.login
            });
        } catch (e) {
            console.error('[reset] Send error:', e.message);
            socket.emit('auth-forgot-password-result', { success: false, error: 'Не вдалося надіслати листа. Спробуйте пізніше' });
            return;
        }
        socket.emit('auth-forgot-password-result', { success: true, devMode: !outcome.sent });
    });

    // ===== AUTH: ЗАБУЛИ ПАРОЛЬ — КРОК 2. Перевірка коду =====
    socket.on('auth-verify-reset-code', ({ email, code }) => {
        const norm = normalizeEmail(email);
        code = String(code || '').trim();

        const rec = passwordResets.get(norm);
        if (!rec) {
            socket.emit('auth-verify-reset-code-result', { success: false, error: 'Спочатку запросіть код підтвердження' });
            return;
        }
        if (Date.now() > rec.expiresAt) {
            passwordResets.delete(norm);
            socket.emit('auth-verify-reset-code-result', { success: false, error: 'Код протермінувався. Запросіть новий' });
            return;
        }
        if (rec.attempts >= RESET_MAX_ATTEMPTS) {
            passwordResets.delete(norm);
            socket.emit('auth-verify-reset-code-result', { success: false, error: 'Забагато невдалих спроб. Запросіть новий код' });
            return;
        }

        if (!safeEqualStr(rec.codeHash, hashResetCode(code))) {
            rec.attempts++;
            const left = RESET_MAX_ATTEMPTS - rec.attempts;
            socket.emit('auth-verify-reset-code-result', { success: false, error: 'Неправильний код' + (left > 0 ? ('. Залишилось спроб: ' + left) : '') });
            return;
        }

        // Код правильний: видаємо одноразовий токен на зміну пароля
        const token = crypto.randomBytes(24).toString('hex');
        resetTokens.set(token, { email: norm, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
        passwordResets.delete(norm); // код одноразовий
        socket.emit('auth-verify-reset-code-result', { success: true, resetToken: token, login: rec.login || '' });
    });

    // ===== AUTH: ЗАБУЛИ ПАРОЛЬ — КРОК 3. Встановлення нового пароля =====
    socket.on('auth-reset-password-confirm', async ({ resetToken, newPassword }) => {
        newPassword = String(newPassword || '');
        const token = String(resetToken || '');

        const t = resetTokens.get(token);
        if (!t) {
            socket.emit('auth-reset-password-confirm-result', { success: false, error: 'Сесія відновлення недійсна. Почніть спочатку' });
            return;
        }
        if (Date.now() > t.expiresAt) {
            resetTokens.delete(token);
            socket.emit('auth-reset-password-confirm-result', { success: false, error: 'Час на зміну пароля вичерпано. Почніть спочатку' });
            return;
        }
        if (!newPassword || newPassword.length < 4) {
            socket.emit('auth-reset-password-confirm-result', { success: false, error: 'Пароль занадто короткий (мін. 4 символи)' });
            return;
        }
        if (newPassword.length > 100) {
            socket.emit('auth-reset-password-confirm-result', { success: false, error: 'Пароль занадто довгий (макс. 100 символів)' });
            return;
        }

        const newHash = hashPassword(newPassword);

        if (accountsCollection) {
            try {
                const res = await accountsCollection.updateOne({ email: t.email }, { $set: { password: newHash } });
                if (res.matchedCount === 0) {
                    resetTokens.delete(token);
                    socket.emit('auth-reset-password-confirm-result', { success: false, error: 'Акаунт не знайдено' });
                    return;
                }
                console.log('[reset] Password changed for account with email:', t.email);
            } catch (e) {
                console.error('[reset] Confirm error:', e.message);
                socket.emit('auth-reset-password-confirm-result', { success: false, error: 'Помилка бази даних' });
                return;
            }
        } else {
            // ===== Локальний JSON fallback =====
            const acc = await findAccountByEmail(t.email);
            if (!acc) {
                resetTokens.delete(token);
                socket.emit('auth-reset-password-confirm-result', { success: false, error: 'Акаунт не знайдено' });
                return;
            }
            acc.password = newHash;
            if (!saveAccounts()) {
                socket.emit('auth-reset-password-confirm-result', { success: false, error: 'Помилка збереження на сервері' });
                return;
            }
            console.log('[reset] Password changed (local JSON) for:', t.email);
        }

        // Токен одноразовий: після успішної зміни пароля знищуємо
        resetTokens.delete(token);
        socket.emit('auth-reset-password-confirm-result', { success: true });
    });

    // ===== AUTH: РЕЄСТРАЦІЯ АКАУНТА =====
    // Працює постійно (сервер завжди запущений), гравці можуть реєструватися будь-коли
    socket.on('auth-register', async ({ login, password }) => {
        login = String(login || '').trim();
        password = String(password || '');

        // Валідація: і логін, і пароль обов'язкові (поля не можуть бути порожніми)
        if (!login || !password) {
            socket.emit('auth-register-result', { success: false, error: 'Введіть логін і пароль!' });
            return;
        }
        if (login.length > 20) {
            socket.emit('auth-register-result', { success: false, error: 'Логін занадто довгий (макс. 20 символів)' });
            return;
        }

        // Нік генерується випадково, бо при реєстрації гравець вводить тільки логін і пароль
        const account = {
            id: generateAccountId(),
            login: login,
            nick: generateRandomNick(),
            // Пароль зберігається ТІЛЬКИ як scrypt-хеш (відкритий текст не пишемо в БД ніколи)
            password: hashPassword(password),
            cups: 0,
            // Айді друзів (потрапляють сюди після взаємного підтвердження запиту)
            friends: [],
            // Вхідні запити «додати в друзі», що чекають відповіді (Прийняти/Відхилити);
            // з них рахується кількість для червоного бейджа в меню
            requests: []
        };

        // ===== MongoDB Atlas — ПОСТІЙНЕ сховище (акаунти не губляться) =====
        if (accountsCollection) {
            try {
                // Логін чутливий до регістру: "Kirik" і "kirik" — різні акаунти
                const exists = await accountsCollection.findOne({ login: login });
                if (exists) {
                    socket.emit('auth-register-result', { success: false, error: 'Такий логін вже занятий!' });
                    return;
                }
                // Нік теж має бути унікальним (він — ключ у списках друзів)
                for (let i = 0; i < 20; i++) {
                    if (!(await accountsCollection.findOne({ nick: account.nick }))) break;
                    account.nick = generateRandomNick();
                }
                await accountsCollection.insertOne(account);
                console.log('[auth] Registered (Atlas):', login, '->', account.id);
                socket.emit('auth-register-result', { success: true, playerId: account.id, nick: account.nick, login: account.login, cups: account.cups || 0 });
            } catch (e) {
                console.error('[auth] Register error:', e.message);
                socket.emit('auth-register-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback (якщо Atlas не налаштований) =====
        const key = login;
        if (accounts[key]) {
            socket.emit('auth-register-result', { success: false, error: 'Такий логін вже занятий!' });
            return;
        }

        accounts[key] = account;

        if (!saveAccounts()) {
            delete accounts[key];
            socket.emit('auth-register-result', { success: false, error: 'Помилка збереження на сервері' });
            return;
        }

        console.log('[auth] Registered account (local JSON):', login, '->', account.id);
        socket.emit('auth-register-result', { success: true, playerId: account.id, nick: account.nick, login: account.login, cups: account.cups || 0 });
    });

    // ===== AUTH: ПЕРЕВІРКА АКАУНТА (валідація клієнтського кешу) =====
    // Клієнт зберігає акаунт у localStorage. Цей обробник дозволяє клієнту
    // при запуску перевірити, чи акаунт досі існує в БД. Якщо ні (видалий),
    // клієнт скидає кеш і повертається в режим гостя.
    socket.on('auth-validate', async ({ playerId }) => {
        playerId = String(playerId || '');

        // Валидація іде за playerId (ID акаунта стабильний), а не за ніком,
        // бо нік гравець може змінити через вікно профілю.
        if (!playerId) {
            socket.emit('auth-validate-result', { valid: false });
            return;
        }

        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const account = await accountsCollection.findOne({ id: playerId });
                socket.emit('auth-validate-result', {
                    valid: !!account,
                    nick: account ? account.nick : undefined,
                    login: account ? account.login : undefined,
                    cups: account ? (account.cups || 0) : undefined,
                    email: account ? (account.email || '') : undefined,
                    googleLinked: account ? !!account.googleId : undefined
                });
            } catch (e) {
                console.error('[auth] Validate error:', e.message);
                // Помилка БД: не підтверджуємо і не спростовуємо акаунт
                socket.emit('auth-validate-result', { error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const account = findAccountById(playerId);
        socket.emit('auth-validate-result', {
            valid: !!account,
            nick: account ? account.nick : undefined,
            login: account ? account.login : undefined,
            cups: account ? (account.cups || 0) : undefined,
            email: account ? (account.email || '') : undefined,
            googleLinked: account ? !!account.googleId : undefined
        });
    });

    // ===== AUTH: ВХІД В АКАУНТ =====
    socket.on('auth-login', async ({ login, password }) => {
        login = String(login || '').trim();
        password = String(password || '');

        // Валідація: і логін, і пароль обов'язкові
        if (!login || !password) {
            socket.emit('auth-login-result', { success: false, error: 'Введіть логін і пароль!' });
            return;
        }

        // ===== MongoDB Atlas — постійне сховище =====
        if (accountsCollection) {
            try {
                // Логін чутливий до регістру: "Kirik" і "kirik" — різні акаунти
                const account = await accountsCollection.findOne({ login: login });
                if (!account) {
                    socket.emit('auth-login-result', { success: false, error: 'Такого акаунта не існує' });
                    return;
                }

                if (!verifyPassword(password, account.password)) {
                    socket.emit('auth-login-result', { success: false, error: 'Невірний пароль!' });
                    return;
                }

                // Самозцілення: якщо цей акаунт досі має легасі-пароль відкритим
                // текстом — після успішного входу одразу замінюємо його на хеш
                if (!isHashedPassword(account.password)) {
                    try {
                        await accountsCollection.updateOne({ id: account.id }, { $set: { password: hashPassword(password) } });
                    } catch (_) { /* не критично: стартова міграція підхопить пізніше */ }
                }

                console.log('[auth] Login (Atlas):', account.login, '->', account.id);
                socket.emit('auth-login-result', { success: true, playerId: account.id, nick: account.nick, login: account.login, cups: account.cups || 0, email: account.email || '', googleLinked: !!account.googleId });
            } catch (e) {
                console.error('[auth] Login error:', e.message);
                socket.emit('auth-login-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        // Логін чутливий до регістру: "Kirik" і "kirik" — різні акаунти
        const account = accounts[login];
        if (!account) {
            socket.emit('auth-login-result', { success: false, error: 'Такого акаунта не існує' });
            return;
        }

        if (!verifyPassword(password, account.password)) {
            socket.emit('auth-login-result', { success: false, error: 'Невірний пароль!' });
            return;
        }

        // Самозцілення: якщо цей акаунт досі має легасі-пароль відкритим
        // текстом — після успішного входу одразу замінюємо його на хеш
        if (!isHashedPassword(account.password)) {
            account.password = hashPassword(password);
            saveAccounts();
        }

        console.log('[auth] Login (local JSON):', account.login, '->', account.id);
        socket.emit('auth-login-result', { success: true, playerId: account.id, nick: account.nick, login: account.login, cups: account.cups || 0, email: account.email || '', googleLinked: !!account.googleId });
    });

    // ===== AUTH: ЗМІНА НІКА =====
    // Нік можна змінити будь-коли через вікно профілю (кнопка ✏️ біля ніка).
    // Ніки унікальні і є ключем у списках друзів, тому при зміні ніка він
    // оновлюється також у списках друзів/запитів усіх інших гравців.
    socket.on('auth-change-nick', async ({ playerId, newNick }) => {
        playerId = String(playerId || '');
        newNick = String(newNick || '').trim();

        if (!playerId || !newNick) {
            socket.emit('auth-change-nick-result', { success: false, error: 'Введіть новий нік!' });
            return;
        }
        if (newNick.length > 20) {
            socket.emit('auth-change-nick-result', { success: false, error: 'Нік занадто довгий (макс. 20 символів)' });
            return;
        }

        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const account = await accountsCollection.findOne({ id: playerId });
                if (!account) {
                    socket.emit('auth-change-nick-result', { success: false, error: 'Акаунт не знайдено' });
                    return;
                }
                const oldNick = account.nick;
                if (oldNick === newNick) {
                    socket.emit('auth-change-nick-result', { success: true, playerId, nick: newNick, login: account.login, cups: account.cups || 0 });
                    return;
                }
                const nickTaken = await accountsCollection.findOne({ nick: newNick });
                if (nickTaken && nickTaken.id !== playerId) {
                    socket.emit('auth-change-nick-result', { success: false, error: 'Цей нік вже зайнятий!' });
                    return;
                }
                await accountsCollection.updateOne({ id: playerId }, { $set: { nick: newNick } });
                // Оновлюємо нік у списках друзів/запитів інших гравців
                await accountsCollection.updateMany({ friends: oldNick }, { $set: { 'friends.$': newNick } });
                await accountsCollection.updateMany({ requests: oldNick }, { $set: { 'requests.$': newNick } });
                console.log('[auth] Nick changed (Atlas):', account.login, '->', newNick);
                socket.emit('auth-change-nick-result', { success: true, playerId, nick: newNick, login: account.login, cups: account.cups || 0 });
            } catch (e) {
                console.error('[auth] Change nick error:', e.message);
                socket.emit('auth-change-nick-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const account = findAccountById(playerId);
        if (!account) {
            socket.emit('auth-change-nick-result', { success: false, error: 'Акаунт не знайдено' });
            return;
        }

        const oldNick = account.nick;
        if (oldNick === newNick) {
            socket.emit('auth-change-nick-result', { success: true, playerId, nick: newNick, login: account.login, cups: account.cups || 0 });
            return;
        }
        const nickTaken = findAccountByNick(newNick);
        if (nickTaken && nickTaken.id !== playerId) {
            socket.emit('auth-change-nick-result', { success: false, error: 'Цей нік вже зайнятий!' });
            return;
        }

        account.nick = newNick;
        // Пропагація: оновлюємо нік у списках друзів/запитів інших гравців
        for (const acc of Object.values(accounts)) {
            if (!acc || typeof acc !== 'object') continue;
            if (Array.isArray(acc.friends)) acc.friends = acc.friends.map(n => n === oldNick ? newNick : n);
            if (Array.isArray(acc.requests)) acc.requests = acc.requests.map(n => n === oldNick ? newNick : n);
        }
        if (!saveAccounts()) {
            socket.emit('auth-change-nick-result', { success: false, error: 'Помилка збереження на сервері' });
            return;
        }

        console.log('[auth] Nick changed (local JSON):', account.login, '->', newNick);
        socket.emit('auth-change-nick-result', { success: true, playerId, nick: newNick, login: account.login, cups: account.cups || 0 });
    });

    // ===== FRIENDS: СПИСОК ДРУЗІВ =====
    socket.on('friends-get', async ({ playerId }) => {
        playerId = String(playerId || '');

        if (!playerId) {
            socket.emit('friends-get-result', { success: false, error: 'Не вказано айді гравця' });
            return;
        }

        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const me = await accountsCollection.findOne({ id: playerId });
                if (!me) {
                    socket.emit('friends-get-result', { success: false, error: 'Акаунт не знайдено' });
                    return;
                }
                // У БД зберігаються НІКИ друзів/запитів
                const friendNicks = Array.isArray(me.friends) ? me.friends : [];
                const reqNicks = Array.isArray(me.requests) ? me.requests : [];
                const friends = friendNicks.map(n => ({ nick: n, state: friendOnlineState(n) }));
                const requests = reqNicks.map(n => ({ nick: n }));
                socket.emit('friends-get-result', { success: true, friends, requests });
            } catch (e) {
                console.error('[friends] Get error:', e.message);
                socket.emit('friends-get-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const me = findAccountById(playerId);
        if (!me) {
            socket.emit('friends-get-result', { success: false, error: 'Акаунт не знайдено' });
            return;
        }
        const friendNicks = Array.isArray(me.friends) ? me.friends : [];
        const reqNicks = Array.isArray(me.requests) ? me.requests : [];
        const friends = friendNicks.map(n => ({ nick: n, state: friendOnlineState(n) }));
        const requests = reqNicks.map(n => ({ nick: n }));
        socket.emit('friends-get-result', { success: true, friends, requests });
    });

        // ===== FRIENDS: НАДСИЛАННЯ ЗАПИТУ НА ДРУЖБУ =====
    socket.on('friends-request', async ({ playerId, friendId }) => {
        playerId = String(playerId || '').trim();
        friendId = String(friendId || '').trim();

        if (!playerId || !friendId) {
            socket.emit('friends-request-result', { success: false, error: 'Введіть айді гравця!' });
            return;
        }
        if (playerId === friendId) {
            socket.emit('friends-request-result', { success: false, error: 'Не можна додати в друзі самого себе!' });
            return;
        }

        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const me = await accountsCollection.findOne({ id: playerId });
                if (!me) {
                    socket.emit('friends-request-result', { success: false, error: 'Акаунт не знайдено' });
                    return;
                }
                const fr = await accountsCollection.findOne({ id: friendId });
                if (!fr) {
                    socket.emit('friends-request-result', { success: false, error: 'Гравця з таким айді не знайдено' });
                    return;
                }
                const mine = Array.isArray(me.friends) ? me.friends : [];
                if (mine.includes(fr.nick)) {
                    socket.emit('friends-request-result', { success: false, error: 'Цей гравець вже у твоїх друзях' });
                    return;
                }
                const frRequests = Array.isArray(fr.requests) ? fr.requests : [];
                if (frRequests.includes(me.nick)) {
                    socket.emit('friends-request-result', { success: false, error: 'Запит цьому гравцю вже надіслано' });
                    return;
                }
                const myRequests = Array.isArray(me.requests) ? me.requests : [];
                if (myRequests.includes(fr.nick)) {
                    socket.emit('friends-request-result', { success: false, error: 'Цей гравець уже надіслав тобі запит — прийми його у розділі «Друзі»' });
                    return;
                }
                // У запити отримувача пишемо МІЙ НІК
                await accountsCollection.updateOne({ id: friendId }, { $addToSet: { requests: me.nick } });
                console.log('[friends] Request sent (Atlas):', me.login, '->', fr.nick);
                socket.emit('friends-request-result', { success: true, message: 'Запит надіслано!', friend: { id: fr.id, nick: fr.nick } });
            } catch (e) {
                console.error('[friends] Request error:', e.message);
                socket.emit('friends-request-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const me = findAccountById(playerId);
        if (!me) {
            socket.emit('friends-request-result', { success: false, error: 'Акаунт не знайдено' });
            return;
        }
        const fr = findAccountById(friendId);
        if (!fr) {
            socket.emit('friends-request-result', { success: false, error: 'Гравця з таким айді не знайдено' });
            return;
        }
        const mine = Array.isArray(me.friends) ? me.friends : [];
        if (mine.includes(fr.nick)) {
            socket.emit('friends-request-result', { success: false, error: 'Цей гравець вже у твоїх друзях' });
            return;
        }
        fr.requests = Array.isArray(fr.requests) ? fr.requests : [];
        if (fr.requests.includes(me.nick)) {
            socket.emit('friends-request-result', { success: false, error: 'Запит цьому гравцю вже надіслано' });
            return;
        }
        const myRequests = Array.isArray(me.requests) ? me.requests : [];
        if (myRequests.includes(fr.nick)) {
            socket.emit('friends-request-result', { success: false, error: 'Цей гравець вже надіслав тобі запит — прийми його у розділі «Друзі»' });
            return;
        }
        // У запити отримувача пишемо МІЙ НІК
        fr.requests.push(me.nick);
        if (!saveAccounts()) {
            socket.emit('friends-request-result', { success: false, error: 'Помилка збереження на сервері' });
            return;
        }
        console.log('[friends] Request sent (local JSON):', me.login, '->', fr.nick);
        socket.emit('friends-request-result', { success: true, message: 'Запит надіслано!', friend: { id: fr.id, nick: fr.nick } });
    });

    // ===== FRIENDS: ПРИЙНЯТИ ЗАПИТ (взаємна дружба) =====
    socket.on('friends-accept', async ({ playerId, friendNick }) => {
        playerId = String(playerId || '').trim();
        friendNick = String(friendNick || '').trim();
        if (!playerId || !friendNick) {
            socket.emit('friends-accept-result', { success: false, error: 'Немає даних запиту' });
            return;
        }

        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const me = await accountsCollection.findOne({ id: playerId });
                const myRequests = (me && Array.isArray(me.requests)) ? me.requests : [];
                if (!me || !myRequests.includes(friendNick)) {
                    socket.emit('friends-accept-result', { success: false, error: 'Запит не знайдено' });
                    return;
                }
                const fr = await accountsCollection.findOne({ nick: friendNick });
                if (!fr) {
                    socket.emit('friends-accept-result', { success: false, error: 'Акаунт гравця не знайдено' });
                    return;
                }
                await accountsCollection.updateOne({ id: playerId }, { $pull: { requests: friendNick }, $addToSet: { friends: friendNick } });
                await accountsCollection.updateOne({ id: friendNick }, { $addToSet: { friends: me.nick } });
                console.log('[friends] Accepted (Atlas):', me.login, '<->', fr.nick);
                socket.emit('friends-accept-result', { success: true, friend: { nick: fr.nick } });
            } catch (e) {
                console.error('[friends] Accept error:', e.message);
                socket.emit('friends-accept-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const me = findAccountById(playerId);
        if (!me) {
            socket.emit('friends-accept-result', { success: false, error: 'Акаунт не знайдено' });
            return;
        }
        me.requests = Array.isArray(me.requests) ? me.requests : [];
        if (!me.requests.includes(friendNick)) {
            socket.emit('friends-accept-result', { success: false, error: 'Запит не знайдено' });
            return;
        }
        const fr = findAccountByNick(friendNick);
        if (!fr) {
            socket.emit('friends-accept-result', { success: false, error: 'Акаунт гравця не знайдено' });
            return;
        }
        // Взаємно додаємо одне одного в друзі (ніками)
        me.requests = me.requests.filter(n => n !== friendNick);
        me.friends = Array.isArray(me.friends) ? me.friends : [];
        if (!me.friends.includes(friendNick)) me.friends.push(friendNick);
        fr.friends = Array.isArray(fr.friends) ? fr.friends : [];
        if (!fr.friends.includes(me.nick)) fr.friends.push(me.nick);
        if (!saveAccounts()) {
            socket.emit('friends-accept-result', { success: false, error: 'Помилка збереження на сервері' });
            return;
        }
        console.log('[friends] Accepted (local JSON):', me.login, '<->', fr.nick);
        socket.emit('friends-accept-result', { success: true, friend: { nick: fr.nick } });
    });

    // ===== FRIENDS: ВІДХИЛИТИ ЗАПИТ =====
    socket.on('friends-decline', async ({ playerId, friendNick }) => {
        playerId = String(playerId || '').trim();
        friendNick = String(friendNick || '').trim();
        if (!playerId || !friendNick) {
            socket.emit('friends-decline-result', { success: false, error: 'Немає даних запиту' });
            return;
        }
        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                await accountsCollection.updateOne({ id: playerId }, { $pull: { requests: friendNick } });
                socket.emit('friends-decline-result', { success: true });
            } catch (e) {
                console.error('[friends] Decline error:', e.message);
                socket.emit('friends-decline-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }
        // ===== Локальний JSON fallback =====
        const me = findAccountById(playerId);
        if (!me) {
            socket.emit('friends-decline-result', { success: false, error: 'Акаунт не знайдено' });
            return;
        }
        me.requests = Array.isArray(me.requests) ? me.requests.filter(n => n !== friendNick) : [];
        saveAccounts();
        socket.emit('friends-decline-result', { success: true });
    });

    // ===== FRIENDS: ВИДАЛИТИ ІЗ ДРУЗІВ (взаємно, в обох гравців) =====
    socket.on('friends-remove', async ({ playerId, friendNick }) => {
        playerId = String(playerId || '').trim();
        friendNick = String(friendNick || '').trim();
        if (!playerId || !friendNick) {
            socket.emit('friends-remove-result', { success: false, error: 'Немає даних' });
            return;
        }
        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const me = await accountsCollection.findOne({ id: playerId });
                if (!me) {
                    socket.emit('friends-remove-result', { success: false, error: 'Акаунт не знайдено' });
                    return;
                }
                const mine = Array.isArray(me.friends) ? me.friends : [];
                if (!mine.includes(friendNick)) {
                    socket.emit('friends-remove-result', { success: false, error: 'Цього гравця немає у твоїх друзях' });
                    return;
                }
                await accountsCollection.updateOne({ id: playerId }, { $pull: { friends: friendNick } });
                await accountsCollection.updateOne({ nick: friendNick }, { $pull: { friends: me.nick } });
                console.log('[friends] Removed (Atlas):', me.login, '-/->', friendNick);
                socket.emit('friends-remove-result', { success: true });
            } catch (e) {
                console.error('[friends] Remove error:', e.message);
                socket.emit('friends-remove-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }
        // ===== Локальний JSON fallback =====
        const me = findAccountById(playerId);
        if (!me) {
            socket.emit('friends-remove-result', { success: false, error: 'Акаунт не знайдено' });
            return;
        }
        me.friends = Array.isArray(me.friends) ? me.friends : [];
        if (!me.friends.includes(friendNick)) {
            socket.emit('friends-remove-result', { success: false, error: 'Цього гравця немає у твоїх друзях' });
            return;
        }
        me.friends = me.friends.filter(n => n !== friendNick);
        const fr = findAccountByNick(friendNick);
        if (fr) {
            fr.friends = Array.isArray(fr.friends) ? fr.friends.filter(n => n !== me.nick) : [];
        }
        if (!saveAccounts()) {
            socket.emit('friends-remove-result', { success: false, error: 'Помилка збереження на сервері' });
            return;
        }
        console.log('[friends] Removed (local JSON):', me.login, '-/->', friendNick);
        socket.emit('friends-remove-result', { success: true });
    });

    // ===== FRIENDS: КІЛЬКІСТЬ ЗАПИТІВ (для червоного бейджа) =====
    socket.on('requests-count', async ({ playerId }) => {
        playerId = String(playerId || '');
        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const me = await accountsCollection.findOne({ id: playerId }, { projection: { _id: 0, requests: 1 } });
                const count = (me && Array.isArray(me.requests)) ? me.requests.length : 0;
                socket.emit('requests-count-result', { success: true, count });
            } catch (e) {
                socket.emit('requests-count-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }
        // ===== Локальний JSON fallback =====
        const me = findAccountById(playerId);
        const count = (me && Array.isArray(me.requests)) ? me.requests.length : 0;
        socket.emit('requests-count-result', { success: true, count });
    });

    // ===== USERS: ПОШУК ГРАВЦЯ ЗА АЙДІ (живий пошук у вікні додавання) =====
    socket.on('users-search', async ({ excludePlayerId, query }) => {
        excludePlayerId = String(excludePlayerId || '');
        const q = String(query || '').trim().toLowerCase();
        const LIMIT = 8;

        if (!q || q.length < 2) {
            socket.emit('users-search-result', { success: true, users: [] });
            return;
        }

        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Пошук СТРОГО за айді (префікс, щоб працював живий пошук під час вводу)
                const matchStage = { id: { $ne: excludePlayerId, $regex: '^' + escaped, $options: 'i' } };
                const me = await accountsCollection.findOne({ id: excludePlayerId });
                const myNick = me ? me.nick : '';
                const myFriends = new Set((me && Array.isArray(me.friends)) ? me.friends : []);
                const myRequests = new Set((me && Array.isArray(me.requests)) ? me.requests : []);
                const docs = await accountsCollection.aggregate([
                    { $match: matchStage },
                    { $limit: LIMIT },
                    { $project: { _id: 0, id: 1, nick: 1, requests: 1 } }
                ]).toArray();
                // Точний збіг айді — першим у списку
                docs.sort((a, b) => (a.id.toLowerCase() === q ? 0 : 1) - (b.id.toLowerCase() === q ? 0 : 1));
                const users = docs.map(d => {
                    let status = 'none';
                    if (myFriends.has(d.nick)) status = 'friend';
                    else if (Array.isArray(d.requests) && d.requests.includes(myNick)) status = 'sent';
                    else if (myRequests.has(d.nick)) status = 'received';
                    return { id: d.id, nick: d.nick, status };
                });
                socket.emit('users-search-result', { success: true, users });
            } catch (e) {
                console.error('[users] Search error:', e.message);
                socket.emit('users-search-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const me = findAccountById(excludePlayerId);
        const myNick = me ? me.nick : '';
        const myFriends = new Set((me && Array.isArray(me.friends)) ? me.friends : []);
        const myRequests = new Set((me && Array.isArray(me.requests)) ? me.requests : []);
        const pool = Object.values(accounts).filter(a =>
            a && typeof a === 'object' && a.id && a.id !== excludePlayerId &&
            String(a.id).toLowerCase().startsWith(q)
        );
        // Точний збіг айді — першим у списку
        pool.sort((a, b) => (a.id.toLowerCase() === q ? 0 : 1) - (b.id.toLowerCase() === q ? 0 : 1));
        const users = pool.slice(0, LIMIT).map(a => {
            let status = 'none';
            if (myFriends.has(a.nick)) status = 'friend';
            else if (Array.isArray(a.requests) && a.requests.includes(myNick)) status = 'sent';
            else if (myRequests.has(a.nick)) status = 'received';
            return { id: a.id, nick: a.nick, status };
        });
        socket.emit('users-search-result', { success: true, users });
    });

    // ===== USERS: ВИПАДКОВИЙ СПИСОК РЕАЛЬНИХ АКАУНТІВ (для додавання в друзі) =====
    socket.on('users-random', async ({ excludePlayerId }) => {
        excludePlayerId = String(excludePlayerId || '');
        const LIMIT = 12;
        const statusOf = (me, acc) => {
            const myFriends = (me && Array.isArray(me.friends)) ? me.friends : [];
            const myRequests = (me && Array.isArray(me.requests)) ? me.requests : [];
            const myNick = me ? me.nick : '';
            if (myFriends.includes(acc.nick)) return 'friend';
            if (Array.isArray(acc.requests) && acc.requests.includes(myNick)) return 'sent';
            if (myRequests.includes(acc.nick)) return 'received';
            return 'none';
        };

        // ===== MongoDB Atlas =====
        if (accountsCollection) {
            try {
                const matchStage = excludePlayerId ? { id: { $ne: excludePlayerId } } : {};
                const me = await accountsCollection.findOne({ id: excludePlayerId });
                const docs = await accountsCollection.aggregate([
                    { $match: matchStage },
                    { $sample: { size: LIMIT } }
                ]).toArray();
                const users = docs.map(d => ({ id: d.id, nick: d.nick, status: statusOf(me, d) }));
                socket.emit('users-random-result', { success: true, users });
            } catch (e) {
                console.error('[users] Random error:', e.message);
                socket.emit('users-random-result', { success: false, error: 'Помилка бази даних' });
            }
            return;
        }

        // ===== Локальний JSON fallback =====
        const me = findAccountById(excludePlayerId);
        const pool = Object.values(accounts).filter(a =>
            a && typeof a === 'object' && a.id && a.id !== excludePlayerId
        );
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const users = pool.slice(0, LIMIT).map(a => ({ id: a.id, nick: a.nick, status: statusOf(me, a) }));
        socket.emit('users-random-result', { success: true, users });
    });

    // Create room
    socket.on('create-room', ({ roomName, playerName, maxPlayers, color, avatar }) => {
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
                color: color || defaultColors[0],
                avatar: (Number.isInteger(avatar) && avatar >= 0 && avatar <= 8) ? avatar : 0
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
    socket.on('join-room', ({ roomCode, playerName, color, avatar }) => {
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
            color: assignedColor,
            avatar: (Number.isInteger(avatar) && avatar >= 0 && avatar <= 8) ? avatar : 0
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
    socket.on('rejoin-room', ({ roomCode, isHost, oldPlayerId, playerName }) => {
        console.log('[server] rejoin-room', { roomCode, isHost, oldPlayerId, socketId: socket.id });
        const room = rooms.get(roomCode);
        if (!room) return;

        // ===== Preserve the same player record on reconnect (NO duplicates) =====
        // 1) Основний шлях: прямий ремап за oldPlayerId (навігація splash -> index)
        remapPlayerIdEverywhere(room, oldPlayerId, socket.id);

        if (isHost) room.host = socket.id;

        // Check if player already exists in the room (by socket.id after remap)
        let existingPlayer = room.players.find(p => p.id === socket.id);

        // 2) Збіг за іменем серед ВІДКЛЮЧЕНИХ гравців (той самий фізичний гравець
        //    повернувся, але sessionStorage містив id, якого сервер ніколи не бачив)
        if (!existingPlayer && playerName) {
            const nameMatch = room.players.find(p =>
                p.id !== socket.id &&
                p.disconnected === true &&
                p.name === playerName
            );
            if (nameMatch) {
                remapPlayerIdEverywhere(room, nameMatch.id, socket.id);
                existingPlayer = room.players.find(p => p.id === socket.id);
                console.log('[server] rejoin-room: reused disconnected player by name (no duplicate)', { playerName, socketId: socket.id });
            }
        }

        // 3) Реаттач до відключеного запису навіть якщо ім'я невідоме.
        //    rejoin-room емітять ЛИШЕ гравці, що повертаються, тому відключений
        //    запис у кімнаті завжди кращий варіант, ніж створення дубліката.
        if (!existingPlayer) {
            const disconnectedPlayers = room.players.filter(p => p.id !== socket.id && p.disconnected === true);
            let reattach = null;
            if (disconnectedPlayers.length === 1) {
                reattach = disconnectedPlayers[0];
            } else if (disconnectedPlayers.length > 1) {
                // Якщо ролі відрізняються — предпочту запис із такою ж роллю (host/не host)
                const byRole = disconnectedPlayers.filter(p => !!p.isHost === !!isHost);
                reattach = byRole[0] || disconnectedPlayers[0];
            }
            if (reattach) {
                remapPlayerIdEverywhere(room, reattach.id, socket.id);
                existingPlayer = room.players.find(p => p.id === socket.id);
                console.log('[server] rejoin-room: reattached to disconnected player entry (no duplicate)', { reattachedName: reattach.name, socketId: socket.id });
            }
        }

        // Гравець повернувся — скасовуємо таймери очікування повернення
        clearDisconnectTimer(roomCode, oldPlayerId);
        clearDisconnectTimer(roomCode, socket.id);

        // Прибираємо "привиди" — ключі зі старих id, що лишились від попередніх підключень
        pruneGhostPlayerEntries(room);

        // 4) Останній засіб — створити новий запис (гравця, якого раніше в кімнаті
        //    не було взагалі). Використовуємо передане ім'я, а не дефолтне.
        if (!existingPlayer) {
            console.log('[server] rejoin-room: no matching entry, pushing new player', { roomCode, socketId: socket.id, oldPlayerId });
            const rejoinDefaultColors = ['red', 'blue', 'yellow', 'green'];
            const rejoinUsedColors = new Set(room.players.map(p => p.color).filter(c => c));
            const rejoinAssignedColor = rejoinDefaultColors.find(c => !rejoinUsedColors.has(c)) || 'red';
            room.players.push({
                id: socket.id,
                name: playerName || 'Гравець',
                isHost: isHost,
                disconnected: false,
                color: rejoinAssignedColor
            });
            existingPlayer = room.players[room.players.length - 1];
        } else {
            console.log('[server] rejoin-room: player found, no duplicate created', { roomCode, socketId: socket.id });
        }

        // If every player is connected again, allow restart once more
        // (restart gets blocked when someone disconnects during game-over)
        if (!room.players.some(p => p.disconnected)) {
            room.restartBlocked = false;
        }

        socket.join(roomCode);

        // Страховка: той самий сокет не повинен мати більше одного запису в кімнаті

        const socksHere = room.players.filter(p => p.id === socket.id);
        if (socksHere.length > 1) {
            // Лишаємо перше входження, решту прибираємо
            const removed = [];
            for (let i = socksHere.length - 1; i >= 1; i--) {
                const idx = room.players.indexOf(socksHere[i]);
                room.players.splice(idx, 1);
                removed.push(idx);
            }
            console.log('[server] rejoin-room: pruned duplicate player entries for socket', socket.id, 'removed', removed.length);
        }

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
                room.players[oldPlayerIndex].disconnected = false;
                player = room.players[oldPlayerIndex];

                // Гравець повернувся — скасовуємо таймер автозакриття катки/кімнати
                clearDisconnectTimer(roomCode, oldPlayerId);
                clearDisconnectTimer(roomCode, socket.id);
                console.log('[server] request-game-state: mapped old player ID to new socket ID', { oldPlayerId, newSocketId: socket.id });

                // Повний ремап усіх структур (devCardHands, playerVP тощо включно)
                remapPlayerIdEverywhere(room, oldPlayerId, socket.id);
                // Відновлюємо прапорець disconnected і пов'язуємо запис із кімнатою,
                // бо remapPlayerIdEverywhere міг не знайти запис, якщо він уже був
                // переміщений раніше — у цьому разі нічого робити не треба.
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

                // If host left, delete room and notify all players.
                // Хозяїн вийшов з кімнати — кімната зникає автоматично.
                if (wasHost) {
                    io.to(roomCode).emit('room-closed', {
                        message: 'Хозяїн вийшов з кімнати'
                    });
                    rooms.delete(roomCode);
                    clearAllDisconnectTimersForRoom(roomCode);
                } else if (room.gamePhase && room.status !== 'game-over') {
                    // Гра триває: гравець, що вийшов, має 1 хвилину, щоб повернутися
                    // через rejoin-room. Якщо не повернеться — катку буде завершено
                    // автоматично (кімната закриється).
                    const leaver = room.players[playerIndex];
                    leaver.disconnected = true;
                    io.to(roomCode).emit('player-disconnected', {
                        playerId: socket.id,
                        graceSeconds: Math.round(DISCONNECT_GRACE_MS / 1000)
                    });
                    scheduleDisconnectTimeout(room, leaver, socket.id);
                } else {
                    const leftPlayerName = (room.players[playerIndex] && room.players[playerIndex].name) || 'Гравець ' + socket.id.slice(0, 4);
                    room.players.splice(playerIndex, 1);

                    // If a player leaves during the restart voting phase (game over),
                    // remove them from the ready set so the vote count stays correct.
                    if (room.restartReady && room.restartReady.has(socket.id)) {
                        room.restartReady.delete(socket.id);
                    }

                    io.to(roomCode).emit('player-left', {
                        playerId: socket.id,
                        players: room.players
                    });

                    // If the game is over and a player left, block restart and notify all players
                    if (room.status === 'game-over' && room.players.length > 0) {
                        room.restartBlocked = true;

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
                        clearAllDisconnectTimersForRoom(roomCode);
                    }
                }

                // Update room list
                io.emit('rooms-list', getRoomsList());
            }
        }
    });

    // ===== MATCHMAKING HANDLERS =====

    // Join matchmaking queue
    socket.on('join-matchmaking', ({ playerName, avatar }) => {
        console.log('[matchmaking] Player joining queue:', socket.id, playerName);

        // Remove from queue if already there
        removeFromMatchmakingQueue(socket.id);

        // Add to queue
        matchmakingQueue.push({
            socketId: socket.id,
            playerName: playerName || 'Гравець',
            avatar: (Number.isInteger(avatar) && avatar >= 0 && avatar <= 8) ? avatar : 0,
            joinedAt: Date.now()
        });

        console.log('[matchmaking] Queue size:', matchmakingQueue.length);

        // Notify player they're in queue
        socket.emit('matchmaking-queued', {
            message: 'Пошук противника...',
            queueSize: matchmakingQueue.length
        });

        // Try to find a match
        if (matchmakingQueue.length >= 2) {
            const player1 = matchmakingQueue.shift();
            const player2 = matchmakingQueue.shift();
            createMatchmakingGame(player1, player2);
        }
    });

    // Leave matchmaking queue
    socket.on('leave-matchmaking', () => {
        console.log('[matchmaking] Player leaving queue:', socket.id);
        removeFromMatchmakingQueue(socket.id);
        socket.emit('matchmaking-left', { message: 'Пошук скасовано' });
    });

    // Handle matchmaking player ready (both players must be ready before host starts)
    socket.on('matchmaking-player-ready', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        // Mark player as ready
        if (!room.matchmakingReady) {
            room.matchmakingReady = new Set();
        }
        room.matchmakingReady.add(socket.id);

        console.log('[matchmaking] Player ready:', socket.id, 'Ready count:', room.matchmakingReady.size, 'Total players:', room.players.length);

        // Notify other player that this player is ready
        socket.to(roomCode).emit('matchmaking-player-ready', {
            playerId: socket.id,
            readyCount: room.matchmakingReady.size,
            totalPlayers: room.players.length
        });

        // If all players are ready and this is the host, auto-start
        if (room.matchmakingReady.size >= room.players.length && socket.id === room.host) {
            console.log('[matchmaking] All players ready, host can start the game');
            socket.emit('matchmaking-can-start', { roomCode });
        }
    });

    // Handle matchmaking game start (host sends map)
    socket.on('matchmaking-start-game', ({ roomCode, mapData, topology }) => {
        const room = rooms.get(roomCode);
        if (!room || room.host !== socket.id) return;

        // Store map data
        room.gameState = mapData;

        // Store topology
        if (topology) {
            room.topology = {
                edges: new Map(topology.edges || []),
                vertices: new Map(topology.vertices || [])
            };
        }

        // Initialize game state
        room.status = 'in-game';
        room.gamePhase = 'dice-roll';
        room.diceRolls = new Map();
        room.initialBuildOrder = [];
        room.currentInitialBuildIndex = 0;
        room.initialBuildRoundComplete = false;
        room.buildings = new Map();
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
        room.playerResources = new Map();

        // Initialize robber on desert hex
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

        // Initialize dev card deck
        room.devCardDeck = createDevCardDeck();

        // Initialize player resources and dev card hands
        for (const p of room.players) {
            room.devCardHands.set(p.id, []);
            room.knightCards.set(p.id, 0);
            room.playerResources.set(p.id, { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 });
            room.playerVP.set(p.id, 0);
        }

        console.log('[matchmaking] Game starting:', roomCode);

        // Send game-started event first (for map deserialization)
        io.to(roomCode).emit('game-started', { mapSeed: room.gameState || {} });

        // Notify both players to start the game
        io.to(roomCode).emit('matchmaking-game-started', {
            roomCode,
            mapSeed: room.gameState,
            players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
        });

        // Start dice phase
        io.to(roomCode).emit('start-dice-phase', {
            players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color }))
        });
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);

        // Remove from matchmaking queue if waiting
        removeFromMatchmakingQueue(socket.id);

        // Remove player from rooms
        rooms.forEach((room, code) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex === -1) return;
            const player = room.players[playerIndex];

            // If host disconnects
            if (room.host === socket.id) {
                if (room.gamePhase) {
                    // Гра вже почалась: хозяїн має 1 хвилину, щоб повернутися
                    // через rejoin-room. Якщо не повернеться — кімната зникне автоматично.
                    player.disconnected = true;
                    socket.to(code).emit('host-disconnected', {
                        message: 'Хозяїн тимчасово відключився. Якщо не повернеться за 1 хвилину — кімнату буде закрито.',
                        graceSeconds: Math.round(DISCONNECT_GRACE_MS / 1000)
                    });
                    scheduleDisconnectTimeout(room, player, socket.id);
                } else {
                    // Гра не почалась — закриваємо кімнату одразу
                    io.to(code).emit('room-closed', {
                        message: 'Хозяїн вийшов з кімнати'
                    });
                    rooms.delete(code);
                    clearAllDisconnectTimersForRoom(code);
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
                // Гра ще не почалась — прибираємо гравця з кімнати одразу
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    rooms.delete(code);
                    clearAllDisconnectTimersForRoom(code);
                    return;
                }
                io.to(code).emit('player-left', {
                    playerId: socket.id,
                    players: room.players
                });
            } else {
                // Гра почалась — даємо гравцю 1 хвилину, щоб повернутися
                // через rejoin-room. Якщо не повернеться — катку буде завершено
                // автоматично (кімната закриється, всі повернуться в лобі).
                const wasAlreadyMarked = !!player.disconnected;
                player.disconnected = true;
                if (!wasAlreadyMarked) {
                    socket.to(code).emit('player-disconnected', {
                        playerId: socket.id,
                        graceSeconds: Math.round(DISCONNECT_GRACE_MS / 1000)
                    });
                }
                scheduleDisconnectTimeout(room, player, socket.id);

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

                // NOTE: кімнату НЕ видаляємо навіть якщо відключились усі —
                // у кожного є 1 хвилина, щоб повернутися. Якщо ніхто не повернеться,
                // таймери очікування (або прибиральник кімнат) закриють її автоматично.
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