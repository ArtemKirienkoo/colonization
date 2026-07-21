// ============================================================
// HEX MATH
// ============================================================
function hexAdd(a, b) { return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s }; }

function hexNeighbors(hex) {
    const dirs = [
        { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
        { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 }
    ];
    return dirs.map(d => hexAdd(hex, d));
}

function hexToPixel(hex, size) {
    return {
        x: size * (Math.sqrt(3) * hex.q + Math.sqrt(3) / 2 * hex.r),
        y: size * (3 / 2 * hex.r)
    };
}

function hexCorners(cx, cy, size) {
    const c = [];
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        c.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
    }
    return c;
}

function hexKey(hex) { return hex.q + ',' + hex.r + ',' + hex.s; }

// ============================================================
// EDGE & VERTEX GEOMETRY
// ============================================================
function edgeKey(hex, edgeIdx) {
    const dir = (6 - edgeIdx) % 6;
    const h2 = hexNeighbors(hex)[dir];
    const k1 = hexKey(hex);
    const k2 = hexKey(h2);
    return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
}

function vertexKey(hex, vertIdx) {
    const p = hexToPixel(hex, 1);
    const corner = hexCorners(p.x, p.y, 1)[vertIdx];
    return Math.round(corner.x * 1000) + ',' + Math.round(corner.y * 1000);
}

function computeEdgesAndVertices(hexPositions, hexSize) {
    const edges = new Map();
    const vertices = new Map();
    const hexSet = new Map();
    hexPositions.forEach(h => hexSet.set(hexKey(h), h));

    for (const hex of hexPositions) {
        const p = hexToPixel(hex, hexSize);
        const cx = p.x, cy = p.y;
        const corners = hexCorners(cx, cy, hexSize);

        for (let i = 0; i < 6; i++) {
            const vk = vertexKey(hex, i);
            if (!vertices.has(vk)) {
                vertices.set(vk, { hexes: [], pos: corners[i] });
            }
            const vData = vertices.get(vk);
            if (!vData.hexes.some(h => hexKey(h) === hexKey(hex))) {
                vData.hexes.push(hex);
            }

            const dir = (6 - i) % 6;
            const n = hexNeighbors(hex)[dir];
            if (hexSet.has(hexKey(n))) {
                const ek = edgeKey(hex, i);
                if (!edges.has(ek)) {
                    const midX = (corners[i].x + corners[(i+1)%6].x) / 2;
                    const midY = (corners[i].y + corners[(i+1)%6].y) / 2;
                    const ang = Math.atan2(corners[(i+1)%6].y - corners[i].y, corners[(i+1)%6].x - corners[i].x);
                    edges.set(ek, {
                        hex1: hex, hex2: n,
                        cx: midX, cy: midY, angle: ang,
                        va: corners[i], vb: corners[(i+1)%6]
                    });
                }
            }
        }
    }
    return { edges, vertices };
}