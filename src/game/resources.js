// ============================================================
// RESOURCE DEFINITIONS
// ============================================================
const RESOURCES = {
    desert: { name: 'Пустиня', fill: '#e8d5a3', border: '#c4a96a', icon: '🏜️' },
    wood:   { name: 'Дерево', fill: '#2d7d3a', border: '#1e5c28', icon: '🌲' },
    brick:  { name: 'Цегла',  fill: '#d4764a', border: '#b85a30', icon: '🧱' },
    geese:  { name: 'Гуси',   fill: '#8fbc6a', border: '#6d9e4a', icon: '🦆' },
    water:  { name: 'Вода',   fill: '#4a8fc2', border: '#2e6d9e', icon: '💧' },
    stone:  { name: 'Камінь', fill: '#8a8d91', border: '#6b6e72', icon: '🪨' },
    ocean:  { name: 'Океан',  fill: '#1a3a5c', border: '#0d1b2a', icon: '🌊' },
    port3:  { name: 'Порт 3:1', fill: '#1a3a5c', border: '#f1c40f', icon: '⚓' },
    port2:  { name: 'Порт 2:1', fill: '#1a3a5c', border: '#e67e22', icon: '⚓' }
};

const RESOURCE_TYPES = ['wood', 'brick', 'geese', 'water', 'stone'];
const RESOURCE_DISTRIBUTION = [4, 3, 4, 4, 3];

// Game state
let gameState = {
    roads: new Set(),
    settlements: new Map(),
    resourceCards: {
        wood: 0,
        brick: 0,
        geese: 0,
        water: 0,
        stone: 0
    }
};

let buildMode = 'none';
let hoverEdge = null;
let hoverVertex = null;
let isRolling = false;

const INITIAL_SETTLEMENT_LIMIT = 1;
const INITIAL_ROAD_LIMIT = 2;
const MAX_SETTLEMENTS = 5;
const MAX_CITIES = 4;
const MAX_ROADS = 15;
const VP_SETTLEMENT = 1;
const VP_CITY = 2;
const VP_ROAD = 0;

function countBuildings() {
    let settlements = 0, cities = 0;
    for (const [, bld] of gameState.settlements) {
        if (bld.type === 'city') cities++;
        else settlements++;
    }
    return { settlements, cities, roads: gameState.roads.size };
}

function canBuildPiece(buildingType) {
    const counts = countBuildings();
    switch (buildingType) {
        case 'road': return counts.roads < MAX_ROADS;
        case 'settlement': return counts.settlements < MAX_SETTLEMENTS;
        case 'city': return counts.cities < MAX_CITIES;
        default: return false;
    }
}

function computeVictoryPoints() {
    const counts = countBuildings();
    return counts.settlements * VP_SETTLEMENT + counts.cities * VP_CITY + counts.roads * VP_ROAD;
}

function updateBuildStats() {
    const counts = countBuildings();
    const vp = computeVictoryPoints();
    const sEl = document.getElementById('stat-settlements');
    const cEl = document.getElementById('stat-cities');
    const rEl = document.getElementById('stat-roads');
    const vEl = document.getElementById('stat-vp');
    if (sEl) { sEl.textContent = `${counts.settlements} / ${MAX_SETTLEMENTS}`; sEl.parentElement.classList.toggle('depleted', counts.settlements >= MAX_SETTLEMENTS); }
    if (cEl) { cEl.textContent = `${counts.cities} / ${MAX_CITIES}`; cEl.parentElement.classList.toggle('depleted', counts.cities >= MAX_CITIES); }
    if (rEl) { rEl.textContent = `${counts.roads} / ${MAX_ROADS}`; rEl.parentElement.classList.toggle('depleted', counts.roads >= MAX_ROADS); }
    if (vEl) { vEl.textContent = vp; }
}

function updateResourceCardsDisplay() {
    const resources = {
        wood: document.getElementById('res-wood'),
        brick: document.getElementById('res-brick'),
        geese: document.getElementById('res-geese'),
        water: document.getElementById('res-water'),
        stone: document.getElementById('res-stone')
    };
    for (const [type, count] of Object.entries(gameState.resourceCards)) {
        if (resources[type]) resources[type].textContent = count;
    }
}

function hasResourcesForBuilding(buildingType) {
    const cards = gameState.resourceCards;
    switch (buildingType) {
        case 'road': return cards.wood >= 1 && cards.brick >= 1;
        case 'settlement': return cards.wood >= 1 && cards.brick >= 1 && cards.geese >= 1 && cards.water >= 1;
        case 'city': return cards.stone >= 3 && cards.water >= 2;
        default: return false;
    }
}

function deductResources(buildingType) {
    const cards = gameState.resourceCards;
    switch (buildingType) {
        case 'road': cards.wood--; cards.brick--; break;
        case 'settlement': cards.wood--; cards.brick--; cards.geese--; cards.water--; break;
        case 'city': cards.stone -= 3; cards.water -= 2; break;
    }
    updateResourceCardsDisplay();
}

function isInitialPhaseComplete() {
    return gameState.settlements.size >= INITIAL_SETTLEMENT_LIMIT && 
           gameState.roads.size >= INITIAL_ROAD_LIMIT;
}

function buildSettlementGraph() {
    const graph = new Map();
    const posToVk = new Map();
    for (const [vk, vert] of vertexGeom) {
        const pk = Math.round(vert.pos.x * 1000) + ',' + Math.round(vert.pos.y * 1000);
        posToVk.set(pk, vk);
    }
    for (const ek of gameState.roads) {
        const edge = edgeGeom.edges.get(ek);
        if (!edge) continue;
        const vaPk = Math.round(edge.va.x * 1000) + ',' + Math.round(edge.va.y * 1000);
        const vbPk = Math.round(edge.vb.x * 1000) + ',' + Math.round(edge.vb.y * 1000);
        const vkA = posToVk.get(vaPk);
        const vkB = posToVk.get(vbPk);
        if (!vkA || !vkB) continue;
        if (!graph.has(vkA)) graph.set(vkA, new Set());
        if (!graph.has(vkB)) graph.set(vkB, new Set());
        graph.get(vkA).add(vkB);
        graph.get(vkB).add(vkA);
    }
    return graph;
}

function roadPathLength(fromVk, toVk, graph) {
    if (fromVk === toVk) return 0;
    const visited = new Set([fromVk]);
    const queue = [{ vk: fromVk, dist: 0 }];
    while (queue.length > 0) {
        const { vk, dist } = queue.shift();
        const neighbors = graph.get(vk);
        if (!neighbors) continue;
        for (const nvk of neighbors) {
            if (nvk === toVk) return dist + 1;
            if (!visited.has(nvk)) {
                visited.add(nvk);
                queue.push({ vk: nvk, dist: dist + 1 });
            }
        }
    }
    return -1;
}

function isVertexOnLand(vertexKey) {
    const vert = vertexGeom.get(vertexKey);
    if (!vert) return false;
    const landSet = new Set();
    if (mapData) {
        [mapData.center, ...mapData.ring1, ...mapData.ring2].forEach(h => landSet.add(hexKey(h)));
    }
    return vert.hexes.some(h => landSet.has(hexKey(h)));
}

function canPlaceSettlement(vertexKey) {
    if (gameState.settlements.has(vertexKey)) return false;
    if (!isVertexOnLand(vertexKey)) return false;
    if (gameState.settlements.size === 0) return true;
    const graph = buildSettlementGraph();
    for (const [existingVk] of gameState.settlements) {
        const len = roadPathLength(existingVk, vertexKey, graph);
        if (len >= 0 && len < 2) return false;
        if (len === -1) return false;
    }
    return true;
}

function isEdgeValidForRoad(ek) {
    const edge = edgeGeom.edges.get(ek);
    if (!edge) return false;
    const landSet = new Set();
    if (mapData) {
        [mapData.center, ...mapData.ring1, ...mapData.ring2].forEach(h => landSet.add(hexKey(h)));
    }
    const k1 = hexKey(edge.hex1);
    const k2 = hexKey(edge.hex2);
    return landSet.has(k1) || landSet.has(k2);
}

function isEdgeConnected(ek) {
    const edge = edgeGeom.edges.get(ek);
    if (!edge) return false;
    const posToVk = new Map();
    for (const [vk, vert] of vertexGeom) {
        const pk = Math.round(vert.pos.x * 1000) + ',' + Math.round(vert.pos.y * 1000);
        posToVk.set(pk, vk);
    }
    const vaPk = Math.round(edge.va.x * 1000) + ',' + Math.round(edge.va.y * 1000);
    const vbPk = Math.round(edge.vb.x * 1000) + ',' + Math.round(edge.vb.y * 1000);
    const vkA = posToVk.get(vaPk);
    const vkB = posToVk.get(vbPk);
    if ((vkA && gameState.settlements.has(vkA)) || (vkB && gameState.settlements.has(vkB))) return true;
    for (const ek2 of gameState.roads) {
        if (ek2 === ek) continue;
        const e2 = edgeGeom.edges.get(ek2);
        if (!e2) continue;
        const e2vaPk = Math.round(e2.va.x * 1000) + ',' + Math.round(e2.va.y * 1000);
        const e2vbPk = Math.round(e2.vb.x * 1000) + ',' + Math.round(e2.vb.y * 1000);
        if (vaPk === e2vaPk || vaPk === e2vbPk || vbPk === e2vaPk || vbPk === e2vbPk) return true;
    }
    return false;
}

function showLimitMessage(msg) {
    const totalEl = document.getElementById('total');
    const originalText = totalEl.textContent;
    totalEl.textContent = msg;
    totalEl.style.color = '#e74c3c';
    setTimeout(() => {
        totalEl.textContent = originalText;
        totalEl.style.color = '#f1c40f';
    }, 2000);
}