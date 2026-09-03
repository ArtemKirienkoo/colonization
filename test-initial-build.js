// ===== Інтеграційний тест: матчмейкінг + фаза кубиків + початкове будівництво =====
// Відтворює РЕАЛЬНИЙ флоу клієнта:
//   splash-сокет -> матч -> навігація (сокет гине) -> гра-сторінка (новий сокет + rejoin)
const { spawn } = require('child_process');
const io = require('socket.io-client');

const PORT = 3100;
const URL = 'http://localhost:' + PORT;

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ✅ ' + name + (extra ? ' | ' + extra : '')); }
    else { failed++; console.log('  ❌ ' + name + (extra ? ' | ' + extra : '')); }
}

function connect() {
    return new Promise((resolve, reject) => {
        const s = io(URL, { transports: ['websocket'], reconnection: false });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
        setTimeout(() => reject(new Error('connect timeout')), 10000);
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Останній отриманий мап-seed (для перевірки цілісності після socket.io-раундтріпу)
let lastGameMapSeed = null;

const LOGGED_EVENTS = [
    'start-dice-phase', 'game-state-sync', 'game-started', 'matchmaking-game-started',
    'matchmaking-can-start', 'initial-build-start', 'initial-build-your-turn', 'initial-build-waiting',
    'initial-build-next-player', 'initial-build-your-done', 'regular-game-start', 'your-turn',
    'waiting-for-turn', 'player-dice-rolled', 'building-synced', 'sync-buildings', 'action-error',
    'dice-tie', 'regular-dice-rolled'
];
function attach(s, name, logSink) {
    LOGGED_EVENTS.forEach(ev => s.on(ev, (d) => {
        let brief = '';
        if (ev === 'initial-build-start') brief = ' first=' + d.currentPlayerId;
        if (ev === 'regular-game-start') brief = ' first=' + d.firstPlayerId;
        if (ev === 'sync-buildings') brief = ' n=' + (d.buildings ? d.buildings.length : '?');
        if (ev === 'building-synced') brief = ' ' + d.type + ' ' + (d.data && (d.data.vertexKey || d.data.edgeKey)) + ' total=' + (d.buildings ? d.buildings.length : '?');
        if (ev === 'action-error') brief = ' MSG="' + d.message + '"';
        if (ev === 'game-started') {
            lastGameMapSeed = d.mapSeed || null;
            brief = ' mapSeed=' + (lastGameMapSeed ? (deserializeAndValidate(lastGameMapSeed) ? 'OK' : 'BROKEN') : 'NULL');
        }
        if (ev === 'your-turn') brief = ' -> me';
        const line = '[' + name + '] ' + ev + brief;
        console.log('    ' + line);
        if (logSink) logSink.push(line);
    }));
}

// Мінімальна карта (структура не важлива для сервера без topology)
const MAP = { center: { q: 0, r: 0, s: 0 }, ring1: [], ring2: [], ring3: [], resources: { '0,0,0': 'forest' }, numbers: { '0,0,0': 8 } };

// Репліка РЕАЛЬНОГО клієнта (index.html generateMap): ресурси/номери/океан — це Map.
const MAP_WITH_MAPS = {
    center: { q: 0, r: 0, s: 0 },
    ring1: [{ q: 1, r: 0, s: -1 }],
    ring2: [],
    ring3: [{ q: 3, r: 0, s: -3 }, { q: -3, r: 0, s: 3 }],
    resources: new Map([['0,0,0', 'desert'], ['1,0,-1', 'forest']]),
    numbers: new Map([['1,0,-1', 8]]),
    ocean: new Map([['3,0,-3', { type: 'ocean', resource: null, portCorners: [] }], ['-3,0,3', { type: 'ocean', resource: null, portCorners: [] }]])
};
// Репліка фіксу index.html serializeMapForServer: Map-и -> plain-об'єкти ДО emit.
function serializeMapForServer(mapData) {
    if (!mapData || !mapData.resources || typeof mapData.resources.entries !== 'function') return mapData;
    return {
        center: mapData.center,
        ring1: mapData.ring1,
        ring2: mapData.ring2,
        ring3: mapData.ring3,
        resources: Object.fromEntries(mapData.resources),
        numbers: Object.fromEntries(mapData.numbers || []),
        ocean: Object.fromEntries(mapData.ocean || [])
    };
}
// Репліка клієнтського deserializeMap + валідації applyMapToClient.
function deserializeAndValidate(seed) {
    if (!seed) return null;
    const des = {
        center: seed.center,
        ring1: seed.ring1,
        ring2: seed.ring2,
        ring3: seed.ring3,
        resources: new Map(Object.entries(seed.resources || {})),
        numbers: new Map(Object.entries(seed.numbers || {})),
        ocean: new Map(Object.entries(seed.ocean || {}))
    };
    const landKeys = [des.center, ...(des.ring1 || []), ...(des.ring2 || []), ...(des.ring3 || [])].map(h => h.q + ',' + h.r + ',' + h.s);
    const hasResources = landKeys.some(k => des.resources.has(k));
    const hasOcean = !(des.ring3 || []).length || (des.ring3 || []).some(h => des.ocean.has(h.q + ',' + h.r + ',' + h.s));
    return hasResources && hasOcean ? des : null;
}


async function runScenario(name, opts) {
    console.log('\n================ ' + name + ' ================');
    // --- 1. Splash-сокети, черга матчмейкінгу ---
    const a1 = await connect();
    const b1 = await connect();
    const foundA = new Promise(res => a1.once('matchmaking-found', res));
    const foundB = new Promise(res => b1.once('matchmaking-found', res));
    a1.emit('join-matchmaking', { playerName: 'Alice' });
    await sleep(150);
    b1.emit('join-matchmaking', { playerName: 'Bob' });
    const [fa] = await Promise.all([foundA, foundB]);
    const roomCode = fa.roomCode;
    console.log('  matched, room=' + roomCode + ' A color=' + fa.yourColor);

    // --- 2. "Навігація": splash-сокети гинуть, гра-сторінка відкриває НОВІ сокети + rejoin ---
    a1.disconnect(); b1.disconnect();
    await sleep(100);
    const errors = [];
    const a2 = await connect(); attach(a2, 'A', errors);
    const b2 = await connect(); attach(b2, 'B', errors);
    a2.emit('rejoin-room', { roomCode, isHost: true, oldPlayerId: fa.yourColor === 'red' ? a1.id : b1.id, playerName: 'Alice' });
    b2.emit('rejoin-room', { roomCode, isHost: false, oldPlayerId: fa.yourColor === 'red' ? b1.id : a1.id, playerName: 'Bob' });
    await sleep(300);

    // --- 3. Гравці готові (гра-сторінка шле ready через 1с після setup) ---
    a2.emit('matchmaking-player-ready', { roomCode });
    b2.emit('matchmaking-player-ready', { roomCode });
    await sleep(200);

    async function buildAndEnd(s, color, vkSuffix) {
        s.emit('sync-build', { roomCode, type: 'settlement', data: { vertexKey: 'v:' + vkSuffix + ':0', color } });
        await sleep(80);
        s.emit('sync-build', { roomCode, type: 'road', data: { edgeKey: 'e:' + vkSuffix + ':a', color } });
        await sleep(80);
        s.emit('sync-build', { roomCode, type: 'road', data: { edgeKey: 'e:' + vkSuffix + ':b', color } });
        await sleep(150);
        s.emit('initial-build-end-turn', { roomCode, playerId: s.id });
        await sleep(250);
    }

    // --- 4. ШВИДКІ КИДКИ (опційно ДО start-game) ---
    if (opts.rollBeforeStart) {
        a2.emit('dice-roll', { roomCode, playerId: a2.id, die1: 5, die2: 2 }); // 7
        await sleep(100);
        b2.emit('dice-roll', { roomCode, playerId: b2.id, die1: 3, die2: 1 }); // 4
        await sleep(300);
    }
    // --- 5. Будівництво A (опційно ДО start-game; ПОВИННО відхилятись сервером) ---
    if (opts.buildABeforeStart) {
        console.log('  -- A намагається будувати ДО start-game (очікуємо відхилення) --');
        await buildAndEnd(a2, 'red', '1,0,-1');
    }
    // --- 6. matchmaking-start-game від хозяїна (РЕПЛІКА ФІКСА: Map-и серіалізовані) ---
    lastGameMapSeed = null;
    a2.emit('matchmaking-start-game', { roomCode, mapData: serializeMapForServer(MAP_WITH_MAPS), topology: null });
    await sleep(400);
    const mapUsable = !!(lastGameMapSeed && deserializeAndValidate(lastGameMapSeed));
    console.log('  mapSeed usable (ресурси+океан повні): ' + mapUsable);
    // --- 7. Решта кидків (якщо не зроблено раніше) ---
    if (!opts.rollBeforeStart) {
        a2.emit('dice-roll', { roomCode, playerId: a2.id, die1: 5, die2: 2 }); // 7
        await sleep(150);
        b2.emit('dice-roll', { roomCode, playerId: b2.id, die1: 3, die2: 1 }); // 4
        await sleep(300);
    }
    // --- 8. Початкове будівництво ПІСЛЯ start-game: A перший (7 > 4), потім B ---
    console.log('  -- A будує (після start-game) --');
    await buildAndEnd(a2, 'red', '1,0,-1');
    console.log('  -- B будує --');
    await buildAndEnd(b2, 'blue', '0,1,-1');
    await sleep(400);

    // --- 8. Фінальний стан ---
    const finalSync = new Promise(res => a2.once('game-state-sync', res));
    const finalBuildings = new Promise(res => a2.once('sync-buildings', res));
    a2.emit('request-game-state', { roomCode });
    const st = await Promise.race([finalSync, sleep(3000).then(() => null)]);
    const bl = await Promise.race([finalBuildings, sleep(2000).then(() => null)]);
    const phase = st ? st.gamePhase : '???';
    const bCount = bl && bl.buildings ? bl.buildings.length : -1;
    console.log('  FINAL: phase=' + phase + ' buildings=' + bCount);
    a2.disconnect(); b2.disconnect();
    return { phase, bCount, errors, mapUsable };
}

async function runFriendScenario(name) {
    console.log('\n================ ' + name + ' ================');
    // Дружня кімната: A створює, B приєднується, A надсилає карту+топологію і стартує
    const a = await connect(); attach(a, 'A');
    const errors = [];
    const created = new Promise(res => a.once('room-created', res));
    a.emit('create-room', { roomName: 'FRIENDS-' + Date.now(), playerName: 'Alice' });
    const cr = await Promise.race([created, sleep(3000).then(() => null)]);
    if (!cr) { console.log('  ❌ room-created не прийшов'); return { phase: 'no-room', bCount: -1, errors }; }
    const roomCode = cr.roomCode || cr.room && cr.room.code;
    const b = await connect(); attach(b, 'B', errors);
    const joined = new Promise(res => b.once('room-joined', res));
    b.emit('join-room', { roomCode, playerName: 'Bob' });
    await Promise.race([joined, sleep(3000)]);
    await sleep(200);

    // Host: карта ДО старту (як у splash.html); topology не шлемо (null валиться guard'ом)
    a.emit('store-map', { roomCode, mapData: MAP });
    a.emit('start-game', { roomCode });
    await sleep(400);

    // Кидки
    a.emit('dice-roll', { roomCode, playerId: a.id, die1: 6, die2: 1 }); // 7
    await sleep(120);
    b.emit('dice-roll', { roomCode, playerId: b.id, die1: 2, die2: 2 }); // 4
    await sleep(300);

    // Будівництво по черзі: A (7) перший
    async function buildAndEnd2(s, color, tag) {
        s.emit('sync-build', { roomCode, type: 'settlement', data: { vertexKey: 'v:' + tag + ':0', color } });
        await sleep(80);
        s.emit('sync-build', { roomCode, type: 'road', data: { edgeKey: 'e:' + tag + ':a', color } });
        await sleep(80);
        s.emit('sync-build', { roomCode, type: 'road', data: { edgeKey: 'e:' + tag + ':b', color } });
        await sleep(150);
        s.emit('initial-build-end-turn', { roomCode, playerId: s.id });
        await sleep(250);
    }
    await buildAndEnd2(a, 'red', '2,0,-2');
    await buildAndEnd2(b, 'blue', '0,2,-2');
    await sleep(300);

    const finalSync = new Promise(res => a.once('game-state-sync', res));
    const finalBuildings = new Promise(res => a.once('sync-buildings', res));
    a.emit('request-game-state', { roomCode });
    const st = await Promise.race([finalSync, sleep(3000).then(() => null)]);
    const bl = await Promise.race([finalBuildings, sleep(2000).then(() => null)]);
    const phase = st ? st.gamePhase : '???';
    const bCount = bl && bl.buildings ? bl.buildings.length : -1;
    console.log('  FINAL: phase=' + phase + ' buildings=' + bCount);
    a.disconnect(); b.disconnect();
    return { phase, bCount, errors };
}

async function main() {
    const srv = spawn('node', ['src/main/server-unified.js'], {
        env: { ...process.env, PORT: String(PORT), DISCONNECT_GRACE_MS: '15000' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    srv.stdout.on('data', d => { const s = d.toString(); if (s.includes('Error') || s.includes('error')) process.stdout.write('  [srv] ' + s); });
    srv.stderr.on('data', d => process.stdout.write('  [srv-err] ' + d.toString()));
    await sleep(1500);

    try {
        // V0: дружня кімната (store-map -> start-game) — гейт не має блокувати
        let r = await runFriendScenario('V0: дружня кімната (не матчмейкінг)');
        check('V0: фаза regular-turn', r.phase === 'regular-turn', 'phase=' + r.phase);
        check('V0: усі 6 будівель на місці', r.bCount === 6, 'buildings=' + r.bCount);

        // V1: нормальний темп
        r = await runScenario('V1: нормальний темп (start-game -> кидки -> будівництво)', { rollBeforeStart: false, buildABeforeStart: false });
        check('V1: фаза regular-turn', r.phase === 'regular-turn', 'phase=' + r.phase);
        check('V1: усі 6 будівель на місці (2 села + 4 дороги)', r.bCount === 6, 'buildings=' + r.bCount);
        check('V1: mapSeed повний (ресурси+океан пережили socket.io)', r.mapUsable === true, 'mapUsable=' + r.mapUsable);

        // V2: обидва кинули І спробували побудувати до start-game (швидкі гравці / пізній can-start)
        r = await runScenario('V2: обидва кинули + спроба будувати ДО matchmaking-start-game', { rollBeforeStart: true, buildABeforeStart: true });
        check('V2: спроби будувати до карти відхилено (2 sync-build + city?)', r.errors.filter(l => l.includes('action-error')).length >= 2, 'errors=' + r.errors.filter(l => l.includes('action-error')).length);
        check('V2: фаза regular-turn', r.phase === 'regular-turn', 'phase=' + r.phase);
        check('V2: усі 6 будівель ВЦІЛІЛИ після пізнього start-game', r.bCount === 6, 'buildings=' + r.bCount);
        check('V2: mapSeed повний (ресурси+океан пережили socket.io)', r.mapUsable === true, 'mapUsable=' + r.mapUsable);
    } catch (e) {
        console.error('TEST ERROR:', e);
        failed++;
    } finally {
        srv.kill();
    }
    console.log('\n================ ПІДСУМОК: ' + passed + ' passed, ' + failed + ' failed ================');
    process.exit(failed > 0 ? 1 : 0);
}
main();

