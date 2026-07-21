// ============================================================
// GAME INITIALIZATION — головний файл гри
// ============================================================
const genBtn = document.getElementById('generateBtn');
const rollBtn = document.getElementById('rollBtn');
const tradeBtn = document.getElementById('tradeBtn');

tradeBtn.addEventListener('click', openTradeModal);

function generateAndRender() {
    gameState = { 
        roads: new Set(), 
        settlements: new Map(),
        resourceCards: { wood: 0, brick: 0, geese: 0, water: 0, stone: 0 }
    };
    buildMode = 'none';
    document.querySelectorAll('.build-btn').forEach(btn => btn.classList.remove('active'));
    canvas.style.cursor = 'default';

    mapData = generateMap();
    const all = [mapData.center, ...mapData.ring1, ...mapData.ring2, ...mapData.ring3];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const hex of all) {
        const p = hexToPixel(hex, 1);
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const frame = Math.min(window.innerWidth - 10, window.innerHeight - 30);
    const size = Math.max(24, Math.floor(frame / (Math.max(contentW, contentH))));
    renderMap(mapData, canvas, size);
}

genBtn.addEventListener('click', generateAndRender);
rollBtn.addEventListener('click', rollDice);

// ============================================================
// ELECTRON INTEGRATION
// ============================================================
if (window.electronAPI) {
    window.electronAPI.onNewGame(() => generateAndRender());
    window.electronAPI.onGenerateMap(() => generateAndRender());
    window.electronAPI.onRollDice(() => rollDice());
    window.electronAPI.onOpenTrade(() => openTradeModal());
}

// Автостарт гри
generateAndRender();