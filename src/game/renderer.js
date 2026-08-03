// ============================================================
// RENDERING
// ============================================================
let mapData = null;
let mapHexSize = 0;
let mapOffset = { ox: 0, oy: 0 };
let edgeGeom = null;
let vertexGeom = null;
let allHexes = [];

// Polyfill for roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        const ctx = this;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    };
}

function drawHexPath(ctx, cx, cy, size) {
    const c = hexCorners(cx, cy, size);
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.closePath();
}

function drawTexture(ctx, cx, cy, size, type) {
    const s = size * 0.15;
    ctx.save();
    ctx.beginPath();
    const c = hexCorners(cx, cy, size * 0.6);
    ctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.clip();
    ctx.globalAlpha = 0.12;
    switch (type) {
        case 'wood':
            ctx.fillStyle = '#1a5c28';
            for (let i = 0; i < 12; i++) {
                const ax = cx + (Math.random() - 0.5) * size * 0.9;
                const ay = cy + (Math.random() - 0.5) * size * 0.9;
                ctx.beginPath(); ctx.arc(ax, ay, s * 0.5, 0, Math.PI * 2); ctx.fill();
            }
            break;
        case 'brick':
            ctx.fillStyle = '#a04a20';
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 3; col++) {
                    const bx = cx - size * 0.6 + col * size * 0.4 + (row % 2) * size * 0.2;
                    const by = cy - size * 0.5 + row * size * 0.25;
                    ctx.fillRect(bx, by, size * 0.3, size * 0.15);
                }
            }
            break;
        case 'geese':
            ctx.fillStyle = '#4a8a2a';
            for (let i = 0; i < 15; i++) {
                const gx = cx + (Math.random() - 0.5) * size * 0.9;
                const gy = cy + (Math.random() - 0.5) * size * 0.9;
                ctx.beginPath();
                ctx.moveTo(gx, gy + s * 0.4);
                ctx.lineTo(gx - s * 0.3, gy - s * 0.3);
                ctx.lineTo(gx + s * 0.3, gy - s * 0.3);
                ctx.closePath(); ctx.fill();
            }
            break;
        case 'water':
            ctx.strokeStyle = '#2a6d9e';
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const wy = cy - size * 0.4 + i * size * 0.16;
                ctx.beginPath();
                for (let x = -size * 0.6; x < size * 0.6; x += 4) {
                    ctx.lineTo(cx + x, wy + Math.sin(x * 0.15) * 4);
                }
                ctx.stroke();
            }
            break;
        case 'stone':
            ctx.fillStyle = '#5a5c60';
            for (let i = 0; i < 6; i++) {
                const rx = cx + (Math.random() - 0.5) * size * 0.8;
                const ry = cy + (Math.random() - 0.5) * size * 0.8;
                const rw = s * (0.5 + Math.random() * 0.8);
                const rh = s * (0.5 + Math.random() * 0.8);
                ctx.beginPath(); ctx.ellipse(rx, ry, rw, rh, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
            }
            break;
    }
    ctx.restore();
}

function markPortCorners(ctx, cx, cy, hexSize, portCorners, portColor) {
    const corners = hexCorners(cx, cy, hexSize);
    const radius = hexSize * 0.12;
    if (!portCorners) return;
    for (const ci of portCorners) {
        ctx.beginPath();
        ctx.arc(corners[ci].x, corners[ci].y, radius, 0, Math.PI * 2);
        ctx.fillStyle = portColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

// Draw robber token (purple figure with "ROBBER" text)
function drawRobberToken(ctx, cx, cy, size) {
    const s = size * 0.38;
    const sx = cx, sy = cy + 2;
    
    // Shadow
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(sx - s*0.05, sy + s*0.08, s*0.25, s*0.14, 0, 0, Math.PI*2);
    ctx.fill();
    
    // Body
    ctx.beginPath();
    ctx.moveTo(sx + s*0.1, sy - s*0.05);
    ctx.lineTo(sx + s*0.35, sy - s*0.1);
    ctx.lineTo(sx + s*0.4, sy - s*0.32);
    ctx.lineTo(sx + s*0.22, sy - s*0.38);
    ctx.closePath();
    ctx.fill();
    
    // Head
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(sx - s*0.02, sy - s*0.2, s*0.18, 0, Math.PI*2);
    ctx.fill();
    
    // Eye
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(sx, sy - s*0.4, s*0.1, 0, Math.PI*2);
    ctx.fill();
    
    // Staff
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + s*0.3, sy - s*0.2);
    ctx.lineTo(sx + s*0.6, sy - s*0.7);
    ctx.stroke();
    
    // Staff top
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.moveTo(sx + s*0.6, sy - s*0.75);
    ctx.lineTo(sx + s*0.54, sy - s*0.62);
    ctx.lineTo(sx + s*0.66, sy - s*0.62);
    ctx.closePath();
    ctx.fill();
    
    // ROBBER text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (size * 0.2) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ROBBER', cx, cy + size * 0.3);
}

function renderMap(data, canvas, hexSize) {
    mapData = data;
    mapHexSize = hexSize;
    const ctx = canvas.getContext('2d');
    const pad = hexSize * 0;
    const all = [data.center, ...data.ring1, ...data.ring2, ...data.ring3];
    allHexes = all;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const hex of all) {
        const p = hexToPixel(hex, hexSize);
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }

    canvas.width = maxX - minX + hexSize * 4 + pad * 1;
    canvas.height = maxY - minY + hexSize * 4 + pad * 1;
    const ox = -minX + hexSize * 2 + pad;
    const oy = -minY + hexSize * 2 + pad;
    mapOffset = { ox, oy };

    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Build edge/vertex geometry
    edgeGeom = computeEdgesAndVertices(all, hexSize);
    vertexGeom = edgeGeom.vertices;

    // 1) Ocean ring
    for (const hex of data.ring3) {
        const p = hexToPixel(hex, hexSize);
        const cx = p.x + ox, cy = p.y + oy;
        const info = data.ocean.get(hexKey(hex));
        drawHexPath(ctx, cx, cy, hexSize);
        if (info.type === 'ocean') {
            ctx.fillStyle = '#152a40';
            ctx.fill();
            ctx.strokeStyle = '#0d1b2a';
            ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            for (let w = 0; w < 3; w++) {
                ctx.beginPath();
                ctx.arc(cx + (w - 1) * 9, cy + 5, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            ctx.fillStyle = '#152a40';
            ctx.fill();
        }
    }

    // 2) Port borders
    for (const hex of data.ring3) {
        const p = hexToPixel(hex, hexSize);
        const cx = p.x + ox, cy = p.y + oy;
        const info = data.ocean.get(hexKey(hex));
        if (info.type !== 'port3' && info.type !== 'port2') continue;
        drawHexPath(ctx, cx, cy, hexSize);
        if (info.type === 'port3') {
            ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.stroke();
            markPortCorners(ctx, cx, cy, hexSize, info.portCorners, '#f1c40f');
            ctx.fillStyle = '#f1c40f';
            ctx.font = 'bold ' + (hexSize * 0.3) + 'px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('3:1', cx, cy - 5);
            ctx.font = (hexSize * 0.32) + 'px sans-serif';
            ctx.fillText('?', cx, cy + hexSize * 0.25);
        } else {
            ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 3; ctx.stroke();
            markPortCorners(ctx, cx, cy, hexSize, info.portCorners, '#e67e22');
            ctx.fillStyle = '#e67e22';
            ctx.font = 'bold ' + (hexSize * 0.3) + 'px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('2:1', cx, cy - 5);
            ctx.font = (hexSize * 0.32) + 'px sans-serif';
            ctx.fillText(RESOURCES[info.resource].icon, cx, cy + hexSize * 0.25);
        }
    }

    // 3) Land hexes
    const landSet = new Set();
    [data.center, ...data.ring1, ...data.ring2].forEach(h => landSet.add(hexKey(h)));

    for (const hex of all) {
        const key = hexKey(hex);
        if (!landSet.has(key)) continue;
        const p = hexToPixel(hex, hexSize);
        const cx = p.x + ox, cy = p.y + oy;
        const resType = data.resources.get(key);
        const number = data.numbers.get(key);
        const res = RESOURCES[resType];

        drawHexPath(ctx, cx, cy, hexSize);
        ctx.fillStyle = res.border;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2; ctx.stroke();

        const innerScale = 0.88;
        drawHexPath(ctx, cx, cy, hexSize * innerScale);
        ctx.fillStyle = res.fill;
        ctx.fill();

        if (resType !== 'desert') drawTexture(ctx, cx, cy, hexSize, resType);

        drawHexPath(ctx, cx, cy, hexSize * 0.82);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1; ctx.stroke();

        ctx.font = (hexSize * 0.42) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        if (number) {
            ctx.fillText(res.icon, cx, cy - hexSize * 0.24);
            const tr = hexSize * 0.24;
            const tcx = cx, tcy = cy + hexSize * 0.35;
            ctx.beginPath();
            ctx.arc(tcx + 1.5, tcy + 1.5, tr, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
            ctx.beginPath();
            ctx.arc(tcx, tcy, tr, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill();
            ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.fillStyle = '#333';
            ctx.font = 'bold ' + (hexSize * 0.34) + 'px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(number.toString(), tcx, tcy);
            const dots = Math.floor((6 - Math.abs(7 - number)) / 2) + 1;
            if (dots > 0) {
                const dotR = 2, dotSp = 5;
                const dotY = tcy + tr * 0.7;
                const sx = tcx - (dots - 1) * dotSp / 2;
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                for (let d = 0; d < dots; d++) {
                    ctx.beginPath();
                    ctx.arc(sx + d * dotSp, dotY, dotR, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else {
            // Desert - no robber token drawn here anymore
            // Robber is drawn separately below if placed on a non-desert hex
        }
    }

    // Draw built roads
    ctx.lineCap = 'butt';
    for (const ek of gameState.roads) {
        const edge = edgeGeom.edges.get(ek);
        if (!edge) continue;
        const ax = edge.va.x + ox, ay = edge.va.y + oy;
        const bx = edge.vb.x + ox, by = edge.vb.y + oy;
        const dx = bx - ax, dy = by - ay;
        const len = Math.sqrt(dx*dx + dy*dy);
        const nx = -dy / len, ny = dx / len;
        const halfW = hexSize * 0.16;

        ctx.lineWidth = hexSize * 0.35;
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.strokeStyle = '#6B4226';
        ctx.stroke();

        ctx.lineWidth = hexSize * 0.26;
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.strokeStyle = '#C4904A';
        ctx.stroke();

        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax + nx * halfW, ay + ny * halfW);
        ctx.lineTo(bx + nx * halfW, by + ny * halfW);
        ctx.strokeStyle = 'rgba(60,30,10,0.25)';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(ax - nx * halfW, ay - ny * halfW);
        ctx.lineTo(bx - nx * halfW, by - ny * halfW);
        ctx.strokeStyle = 'rgba(60,30,10,0.25)';
        ctx.stroke();

        ctx.setLineDash([3, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.strokeStyle = 'rgba(232,200,128,0.5)';
        ctx.stroke();
        ctx.setLineDash([]);

        const rutOff = halfW * 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax + nx * rutOff, ay + ny * rutOff);
        ctx.lineTo(bx + nx * rutOff, by + ny * rutOff);
        ctx.strokeStyle = 'rgba(40,20,5,0.2)';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax - nx * rutOff, ay - ny * rutOff);
        ctx.lineTo(bx - nx * rutOff, by - ny * rutOff);
        ctx.strokeStyle = 'rgba(40,20,5,0.2)';
        ctx.stroke();
    }

    // Draw settlements/cities
    for (const [vk, bld] of gameState.settlements) {
        const vert = vertexGeom.get(vk);
        if (!vert) continue;
        const vx = vert.pos.x + ox, vy = vert.pos.y + oy;

        if (bld.type === 'settlement') {
            const s = hexSize * 0.32;
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(vx + 2, vy + s*0.55, s*0.85, s*0.15, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#D4A574';
            ctx.beginPath();
            ctx.roundRect(vx - s*0.55, vy - s*0.2, s*1.1, s*0.6, 2);
            ctx.fill();
            ctx.strokeStyle = '#8B6914';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(vx - s*0.55, vy - s*0.2, s*1.1, s*0.6, 2);
            ctx.stroke();
            ctx.fillStyle = '#A0522D';
            ctx.beginPath();
            ctx.moveTo(vx - s*0.72, vy - s*0.2);
            ctx.lineTo(vx, vy - s*0.72);
            ctx.lineTo(vx + s*0.72, vy - s*0.2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#6B3410';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(80,40,10,0.2)';
            ctx.lineWidth = 0.5;
            for (let i = 1; i < 4; i++) {
                const t = i / 4;
                const lx = vx - s*0.72 + t * s*0.72;
                const rx = vx + s*0.72 - t * s*0.72;
                const ly = vy - s*0.2 + t * (vy - s*0.72 - (vy - s*0.2));
                ctx.beginPath();
                ctx.moveTo(lx, ly); ctx.lineTo(rx, ly);
                ctx.stroke();
            }
            ctx.fillStyle = '#6B3410';
            const dw = s*0.22, dh = s*0.32;
            ctx.beginPath();
            ctx.roundRect(vx - dw/2, vy + s*0.05, dw, dh, 1);
            ctx.fill();
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.roundRect(vx - s*0.35, vy - s*0.05, s*0.2, s*0.15, 1);
            ctx.fill();
        } else {
            const s = hexSize * 0.4;
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(vx + 2, vy + s*0.65, s*0.9, s*0.15, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#8B9DC3';
            ctx.beginPath();
            ctx.roundRect(vx - s*0.6, vy - s*0.25, s*1.2, s*0.7, 2);
            ctx.fill();
            ctx.strokeStyle = '#5A6E8E';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(vx - s*0.6, vy - s*0.25, s*1.2, s*0.7, 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(70,90,120,0.2)';
            ctx.lineWidth = 0.5;
            for (let row = 1; row <= 3; row++) {
                const ry = vy - s*0.25 + row * (s*0.7 / 4);
                ctx.beginPath();
                ctx.moveTo(vx - s*0.58, ry);
                ctx.lineTo(vx + s*0.58, ry);
                ctx.stroke();
            }
            ctx.fillStyle = '#7B8DB3';
            ctx.beginPath();
            ctx.moveTo(vx - s*0.32, vy - s*0.25);
            ctx.lineTo(vx - s*0.38, vy - s*0.8);
            ctx.lineTo(vx + s*0.38, vy - s*0.8);
            ctx.lineTo(vx + s*0.32, vy - s*0.25);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#5A6E8E';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            for (let i = -1; i <= 1; i+=1) {
                const cx = vx + i * s*0.16;
                ctx.fillStyle = '#6B7DA3';
                ctx.fillRect(cx - s*0.06, vy - s*0.85, s*0.12, s*0.1);
                ctx.strokeStyle = '#5A6E8E';
                ctx.lineWidth = 1;
                ctx.strokeRect(cx - s*0.06, vy - s*0.85, s*0.12, s*0.1);
            }
            ctx.fillStyle = '#FFD700';
            const ww = s*0.12, wh = s*0.14;
            for (let i = -1; i <= 1; i++) {
                ctx.fillRect(vx + i * s*0.24 - ww/2, vy - s*0.55, ww, wh);
                ctx.strokeStyle = '#8B6914';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(vx + i * s*0.24 - ww/2, vy - s*0.55, ww, wh);
            }
            ctx.fillStyle = '#4A3A1A';
            ctx.beginPath();
            ctx.roundRect(vx - s*0.14, vy + s*0.05, s*0.28, s*0.4, 2);
            ctx.fill();
            ctx.strokeStyle = '#2A1A0A';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(vx - s*0.14, vy + s*0.05, s*0.28, s*0.4, 2);
            ctx.stroke();
        }
    }

    drawHoverHighlight(ctx, ox, oy, hexSize);

    for (const hex of all) {
        const p = hexToPixel(hex, hexSize);
        drawHexPath(ctx, p.x + ox, p.y + oy, hexSize);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1; ctx.stroke();
    }
    
    // Draw robber on the hex where it's placed (if not on desert)
    if (gameState.robber && gameState.robber.hexKey) {
        const robberHexParts = gameState.robber.hexKey.split(',').map(Number);
        const robberHex = { q: robberHexParts[0], r: robberHexParts[1], s: robberHexParts[2] };
        const rp = hexToPixel(robberHex, hexSize);
        const rcx = rp.x + ox, rcy = rp.y + oy;
        const robberRes = mapData.resources.get(gameState.robber.hexKey);
        if (robberRes !== 'desert') {
            // Draw the robber token (same as desert token)
            drawRobberToken(ctx, rcx, rcy, hexSize);
        }
    }
}

function drawHoverHighlight(ctx, ox, oy, hexSize) {
    if (buildMode === 'none') return;
    if (buildMode === 'road' && hoverEdge) {
        const edge = edgeGeom.edges.get(hoverEdge);
        if (!edge) return;
        const ax = edge.va.x + ox, ay = edge.va.y + oy;
        const bx = edge.vb.x + ox, by = edge.vb.y + oy;
        ctx.lineCap = 'round';
        ctx.lineWidth = hexSize * 0.22;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = 'rgba(241,196,15,0.6)';
        ctx.stroke();
    }
    if ((buildMode === 'settlement' || buildMode === 'city') && hoverVertex) {
        const vert = vertexGeom.get(hoverVertex);
        if (!vert) return;
        const vx = vert.pos.x + ox, vy = vert.pos.y + oy;
        const r = hexSize * 0.22;
        ctx.beginPath();
        ctx.arc(vx, vy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(241,196,15,0.4)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(241,196,15,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}