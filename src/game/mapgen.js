// ============================================================
// MAP GENERATION
// ============================================================
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateHexRing(radius) {
    if (radius === 0) return [{ q: 0, r: 0, s: 0 }];
    const hexes = [];
    let h = { q: radius, r: 0, s: -radius };
    const dirs = [
        { q: 0, r: -1, s: 1 }, { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 },
        { q: 0, r: 1, s: -1 }, { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }
    ];
    for (let d = 0; d < 6; d++)
        for (let s = 0; s < radius; s++) { hexes.push({ q: h.q, r: h.r, s: h.s }); h = hexAdd(h, dirs[d]); }
    return hexes;
}

function generateResources(hexPositions) {
    let pool = [];
    RESOURCE_TYPES.forEach((type, idx) => {
        for (let i = 0; i < RESOURCE_DISTRIBUTION[idx]; i++) pool.push(type);
    });
    const hexList = [...hexPositions];
    const posSet = new Set(hexList.map(hexKey));
    hexList.sort((a, b) => {
        return hexNeighbors(b).filter(n => posSet.has(hexKey(n))).length -
               hexNeighbors(a).filter(n => posSet.has(hexKey(n))).length;
    });
    for (let attempt = 0; attempt < 2000; attempt++) {
        const assigned = new Map();
        const remaining = shuffleArray([...pool]);
        let ok = true;
        for (let i = 0; i < hexList.length; i++) {
            const hex = hexList[i];
            const used = hexNeighbors(hex).map(hexKey).map(k => assigned.get(k)).filter(t => t);
            let placed = false;
            for (let r = 0; r < remaining.length; r++) {
                if (remaining[r] === null) continue;
                if (!used.includes(remaining[r])) {
                    assigned.set(hexKey(hex), remaining[r]);
                    remaining[r] = null; placed = true; break;
                }
            }
            if (!placed) { ok = false; break; }
        }
        if (ok) return assigned;
        shuffleArray(pool);
    }
    const fb = new Map();
    const fbPool = shuffleArray([...pool]);
    hexList.forEach((hex, i) => fb.set(hexKey(hex), fbPool[i]));
    return fb;
}

function generateNumbers(hexPositions, resourceMap) {
    const numPool = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    const hexList = [...hexPositions];
    const posSet = new Set(hexList.map(hexKey));
    hexList.sort((a, b) => {
        return hexNeighbors(b).filter(n => posSet.has(hexKey(n))).length -
               hexNeighbors(a).filter(n => posSet.has(hexKey(n))).length;
    });
    for (let attempt = 0; attempt < 4000; attempt++) {
        const assigned = new Map();
        const usedCombos = {};
        const remaining = shuffleArray([...numPool]);
        let ok = true;
        for (let i = 0; i < hexList.length; i++) {
            const hex = hexList[i];
            const key = hexKey(hex);
            const resType = resourceMap.get(key);
            const usedNums = hexNeighbors(hex).map(hexKey).map(k => assigned.get(k)).filter(n => n !== undefined);
            let placed = false;
            for (let r = 0; r < remaining.length; r++) {
                if (remaining[r] === null) continue;
                const num = remaining[r];
                if (usedNums.includes(num)) continue;
                const combo = num + ':' + resType;
                if (usedCombos[combo]) continue;
                assigned.set(key, num);
                usedCombos[combo] = true;
                remaining[r] = null; placed = true; break;
            }
            if (!placed) { ok = false; break; }
        }
        if (ok) return assigned;
    }
    const fb = new Map();
    const fbNums = shuffleArray([...numPool]);
    hexList.forEach((hex, i) => fb.set(hexKey(hex), fbNums[i]));
    return fb;
}

function generateOcean(radius, landHexes) {
    const hexes = generateHexRing(radius);
    const landSet = new Set(landHexes.map(hexKey));
    function getLandEdges(hex) {
        const neighbors = hexNeighbors(hex);
        const edges = [];
        for (let i = 0; i < 6; i++) {
            if (landSet.has(hexKey(neighbors[i]))) edges.push((6 - i) % 6);
        }
        return edges;
    }
    function getPortCorners(landEdges) {
        const touches = [];
        for (let c = 0; c < 6; c++) {
            const e1 = (c - 1 + 6) % 6;
            const e2 = c;
            touches[c] = landEdges.includes(e1) || landEdges.includes(e2);
        }
        for (let c = 0; c < 6; c++) {
            const c2 = (c + 1) % 6;
            if (touches[c] && touches[c2]) return [c, c2];
        }
        return null;
    }
    const offset = Math.floor(Math.random() * hexes.length);
    const ordered = hexes.map((_, i) => hexes[(i + offset) % hexes.length]);
    const totalPorts = Math.ceil(ordered.length / 2);
    const specRes = shuffleArray(['wood', 'brick', 'geese', 'water', 'stone']);
    let specIdx = 0, portCount = 0;
    const map = new Map();
    for (let i = 0; i < ordered.length; i++) {
        const hex = ordered[i];
        const key = hexKey(hex);
        if (i % 2 === 0) {
            const landEdges = getLandEdges(hex);
            const portCorners = getPortCorners(landEdges);
            if (!portCorners) {
                map.set(key, { type: 'ocean', resource: null, landEdges: [], portCorners: null });
                continue;
            }
            let type = (portCount % 2 === 0) ? 'port3' : 'port2';
            if (portCount === totalPorts - 1) type = 'port2';
            const resource = (type === 'port2') ? specRes[specIdx++ % specRes.length] : null;
            map.set(key, { type, resource, landEdges, portCorners });
            portCount++;
        } else {
            map.set(key, { type: 'ocean', resource: null, landEdges: [], portCorners: null });
        }
    }
    return map;
}

function generateMap() {
    const center = { q: 0, r: 0, s: 0 };
    const ring1 = generateHexRing(1);
    const ring2 = generateHexRing(2);
    const ring3 = generateHexRing(3);
    const landHexes = [...ring1, ...ring2];
    const resources = generateResources(landHexes);
    resources.set(hexKey(center), 'desert');
    const numbers = generateNumbers(landHexes, resources);
    const ocean = generateOcean(3, landHexes);
    return { center, ring1, ring2, ring3, resources, numbers, ocean };
}