// ===== Е2Е-тест правила розбійника та авторитетного синку ресурсів =====
// Перевіряє:
//   (1) ПРАВИЛО ГРИ: розбійник стоїть на гексі з числом N → коли хтось кидає N,
//       ресурс цього гекса отримує ТОЙ, ХТО ПОСТАВИВ розбійника (placer),
//       а не власник території і не «в нікуду».
//   (2) Після виробництва сервер розсилає resources-synced (повна серверна
//       правда) ОБОМ гравцям — клієнт жорстко виставляє лічильники (лікує
//       «попап показується, лічильники не змінюються»).
//   (3) Гравець, чужий до пограбованого гекса, нічого не отримує.
const { spawn } = require('child_process');
const io = require('socket.io-client');

const PORT = 3120;
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
function once(s, ev, timeout = 4000) {
    return new Promise((resolve) => {
        const t = setTimeout(() => { s.off(ev, h); resolve(null); }, timeout);
        const h = (d) => { clearTimeout(t); s.off(ev, h); resolve(d); };
        s.on(ev, h);
    });
}

// Карта: пустеля в центрі (розбійник стартує тут), ліс-«wood» з числом 8,
// цегла-«brick» з числом 9. Значення resources — ключі ресурсів (як у реальній карті).
const MAP = {
    center: { q: 0, r: 0, s: 0 },
    ring1: [{ q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 }],
    ring2: [], ring3: [],
    resources: { '0,0,0': 'desert', '1,0,-1': 'wood', '0,1,-1': 'brick' },
    numbers: { '1,0,-1': 8, '0,1,-1': 9 },
    ocean: {}
};

// Топологія: vA1/vA2 біля лісу (поселення Alice), vB1/vB2 біля цегли (Bob).
// Формат — масиви пар [ключ, значення]: сервер робить new Map(...).
const TOPOLOGY = {
    vertices: [
        ['vA1', { pos: { x: 100, y: 0 }, hexes: [{ q: 1, r: 0, s: -1 }] }],
        ['vA2', { pos: { x: 160, y: 40 }, hexes: [{ q: 1, r: 0, s: -1 }] }],
        ['vB1', { pos: { x: -100, y: 0 }, hexes: [{ q: 0, r: 1, s: -1 }] }],
        ['vB2', { pos: { x: -160, y: 40 }, hexes: [{ q: 0, r: 1, s: -1 }] }]
    ],
    edges: [
        ['eAa', { va: { x: 100, y: 0 }, vb: { x: 160, y: 40 } }],
        ['eAb', { va: { x: 100, y: 0 }, vb: { x: 100, y: 90 } }],
        ['eBa', { va: { x: -100, y: 0 }, vb: { x: -160, y: 40 } }],
        ['eBb', { va: { x: -100, y: 0 }, vb: { x: -100, y: 90 } }]
    ]
};

(async () => {
    const srv = spawn('node', ['src/main/server-unified.js'], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    srv.stderr.on('data', d => process.stdout.write('  [srv-err] ' + d.toString()));
    await sleep(1200);

    try {
        // === 1. Матчмейкінг: Alice (хост) vs Bob ===
        const a1 = await connect();
        const b1 = await connect();
        const fA = once(a1, 'matchmaking-found');
        const fB = once(b1, 'matchmaking-found');
        a1.emit('join-matchmaking', { playerName: 'Alice', avatar: 0 });
        await sleep(150);
        b1.emit('join-matchmaking', { playerName: 'Bob', avatar: 1 });
        const [m1, m2] = [await fA, await fB];
        check('Матч створено (обом matchmaking-found)', !!(m1 && m2 && m1.roomCode === m2.roomCode), 'room=' + (m1 && m1.roomCode));
        const roomCode = m1.roomCode;
        const aIsHost = m1.yourColor === 'red';

        // === 2. «Навігація» у гру: нові сокети + rejoin (як у реальному клієнті) ===
        const a1Id = a1.id, b1Id = b1.id;
        a1.disconnect(); b1.disconnect();
        await sleep(150);
        const A = await connect();
        const B = await connect();
        A.emit('rejoin-room', { roomCode, isHost: aIsHost, oldPlayerId: aIsHost ? a1Id : b1Id, playerName: 'Alice' });
        B.emit('rejoin-room', { roomCode, isHost: !aIsHost, oldPlayerId: aIsHost ? b1Id : a1Id, playerName: 'Bob' });
        await sleep(300);
        A.emit('matchmaking-player-ready', { roomCode });
        B.emit('matchmaking-player-ready', { roomCode });
        await sleep(250);

        // === 3. Фаза кубиків (черга ходів): Alice 7 > Bob 4 → Alice перша ===
        A.emit('dice-roll', { roomCode, playerId: A.id, die1: 5, die2: 2 });
        await sleep(150);
        B.emit('dice-roll', { roomCode, playerId: B.id, die1: 3, die2: 1 });
        await sleep(300);

        // === 4. Старт гри: карта + топологія від хоста ===
        A.emit('matchmaking-start-game', { roomCode, mapData: MAP, topology: TOPOLOGY });
        await sleep(500);

        // === 5. Початкове будівництво: по 1 селу + 2 дороги ===
        A.emit('sync-build', { roomCode, type: 'settlement', data: { vertexKey: 'vA1', color: 'red' } });
        await sleep(100);
        A.emit('sync-build', { roomCode, type: 'road', data: { edgeKey: 'eAa', color: 'red' } });
        await sleep(100);
        A.emit('sync-build', { roomCode, type: 'road', data: { edgeKey: 'eAb', color: 'red' } });
        await sleep(150);
        A.emit('initial-build-end-turn', { roomCode, playerId: A.id });
        await sleep(300);
        B.emit('sync-build', { roomCode, type: 'settlement', data: { vertexKey: 'vB1', color: 'blue' } });
        await sleep(100);
        B.emit('sync-build', { roomCode, type: 'road', data: { edgeKey: 'eBa', color: 'blue' } });
        await sleep(100);
        B.emit('sync-build', { roomCode, type: 'road', data: { edgeKey: 'eBb', color: 'blue' } });
        await sleep(150);
        B.emit('initial-build-end-turn', { roomCode, playerId: B.id });
        await sleep(500);

        // === 6. Хід Alice: кидок 7 → розбійник на ліс (1,0,-1) → кінець ходу ===
        A.emit('regular-dice-roll', { roomCode, playerId: A.id, die1: 3, die2: 4 });
        await sleep(300);
        A.emit('game-action', { roomCode, action: 'place-robber', payload: { hexKey: '1,0,-1', fromKnight: false } });
        await sleep(300);
        A.emit('end-turn', { roomCode, playerId: A.id });
        await sleep(400);

        // === 7. Хід Bob: кидок 5 (його цегла — число 9, нічого) → кінець ходу ===
        B.emit('regular-dice-roll', { roomCode, playerId: B.id, die1: 2, die2: 3 });
        await sleep(300);
        B.emit('end-turn', { roomCode, playerId: B.id });
        await sleep(400);

        // === 8. Хід Alice: кидок 8 — ліс ПІД РОЗБІЙНИКОМ ===
        const crA = once(A, 'collect-resources');
        const rsA = once(A, 'resources-synced');
        const crB = once(B, 'collect-resources');
        const rsB = once(B, 'resources-synced');
        A.emit('regular-dice-roll', { roomCode, playerId: A.id, die1: 4, die2: 4 });
        const [cA, sA, cB, sB] = await Promise.all([crA, rsA, crB, rsB]);

        check('collect-resources прийшов обом гравцям', !!(cA && cB));
        const upd = (cA && cA.resourceUpdates) || {};
        const aliceEntry = upd[A.id];
        check('ПРАВИЛО: ресурс пограбованого гекса пішов placer’у (Alice)', !!aliceEntry && (aliceEntry.wood || 0) >= 1,
            aliceEntry ? ('wood=' + aliceEntry.wood) : ('updates=' + JSON.stringify(upd).slice(0, 140)));
        check('Bob (не placer) нічого не отримав', !!(cA && cB) && !upd[B.id]);
        check('resources-synced прийшов обом (авторитетний синк після виробництва)', !!(sA && sB));
        const syncRes = (sA && sA.resources) || {};
        check('resources-synced: у Alice wood >= 1 (server truth)', !!syncRes[A.id] && (syncRes[A.id].wood || 0) >= 1,
            syncRes[A.id] ? ('wood=' + syncRes[A.id].wood) : 'немає запису');
        check('resources-synced: у Bob wood == 0', !!syncRes[B.id] && (syncRes[B.id].wood || 0) === 0);
    } catch (e) {
        failed++;
        console.error('  ❌ Виняток у тесті:', e.message);
    }

    srv.kill();
    await sleep(200);
    console.log('\n===== РЕЗУЛЬТАТ: ' + passed + ' passed, ' + failed + ' failed =====');
    process.exit(failed > 0 ? 1 : 0);
})();
