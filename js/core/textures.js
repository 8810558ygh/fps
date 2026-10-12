// ===== js/textures.js – 程序化纹理 =====
function canvasTex(size, draw, rx = 1, ry = 1) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
}

function noise(ctx, s, n, alpha) {
    for (let i = 0; i < n; i++) {
        const g = 70 + Math.random() * 90 | 0;
        ctx.fillStyle = `rgba(${g},${g},${g},${alpha * (0.5 + Math.random())})`;
        const r = 1 + Math.random() * 3;
        ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
    }
}

// ---- 地面 ----
const groundTex = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#67685c';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 3000, 0.16);
    for (let i = 0; i < 12; i++) {
        const x = Math.random() * s,
            y = Math.random() * s,
            r = 25 + Math.random() * 60;
        const gr = ctx.createRadialGradient(x, y, 2, x, y, r);
        gr.addColorStop(0, 'rgba(38,40,34,.4)');
        gr.addColorStop(1, 'rgba(38,40,34,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 7);
        ctx.fill();
    }
    ctx.strokeStyle = 'rgba(35,37,32,.55)';
    for (let i = 0; i < 16; i++) {
        ctx.beginPath();
        let x = Math.random() * s,
            y = Math.random() * s;
        ctx.moveTo(x, y);
        for (let j = 0; j < 6; j++) { x += (Math.random() - .5) * 80;
            y += (Math.random() - .5) * 80;
            ctx.lineTo(x, y); }
        ctx.lineWidth = .8 + Math.random();
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,116,100,.25)';
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 30 + Math.random() * 50, 20 + Math.random() * 40);
}, 5, 5);

// ---- 混凝土 ----
const concreteTex = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#8d9094';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 1500, 0.12);
    ctx.strokeStyle = 'rgba(60,62,66,.6)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath();
        ctx.moveTo(i * s / 4, 0);
        ctx.lineTo(i * s / 4, s);
        ctx.stroke(); }
    ctx.beginPath();
    ctx.moveTo(0, s * 0.55);
    ctx.lineTo(s, s * 0.55);
    ctx.stroke();
    ctx.fillStyle = 'rgba(50,52,48,.28)';
    for (let i = 0; i < 8; i++) { const x = Math.random() * s;
        ctx.fillRect(x, 0, 3 + Math.random() * 6, 40 + Math.random() * 90); }
    for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = 'rgba(45,47,44,.5)';
        ctx.beginPath();
        let x = Math.random() * s,
            y = Math.random() * s;
        ctx.moveTo(x, y);
        for (let j = 0; j < 5; j++) { x += (Math.random() - .5) * 60;
            y += (Math.random() - .5) * 60;
            ctx.lineTo(x, y); }
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}, 3, 1);

// ---- 砖墙 ----
const brickTex = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#6e4634';
    ctx.fillRect(0, 0, s, s);
    const bh = 16,
        bw = 42;
    for (let row = 0; row < s / bh; row++) {
        const off = (row % 2) * bw / 2;
        for (let col = -1; col < s / bw + 1; col++) {
            const x = col * bw + off,
                y = row * bh;
            const shade = 100 + Math.random() * 45 | 0;
            ctx.fillStyle = `rgb(${shade+30},${shade-18},${shade-40})`;
            ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        }
    }
    noise(ctx, s, 900, 0.14);
    ctx.fillStyle = 'rgba(40,36,30,.3)';
    for (let i = 0; i < 6; i++) { const x = Math.random() * s;
        ctx.fillRect(x, 0, 4 + Math.random() * 10, 50 + Math.random() * 120); }
}, 2, 1);

// ---- 木箱 ----
const woodTex = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#8a6742';
    ctx.fillRect(0, 0, s, s);
    for (let p = 0; p < 4; p++) {
        const y = p * s / 4;
        ctx.fillStyle = `rgba(${115+Math.random()*30|0},${82+Math.random()*20|0},${50+Math.random()*15|0},1)`;
        ctx.fillRect(0, y + 1, s, s / 4 - 2);
        ctx.strokeStyle = 'rgba(60,42,26,.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, y + 1, s - 2, s / 4 - 2);
        ctx.strokeStyle = 'rgba(70,50,30,.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(0, y + 4 + Math.random() * (s / 4 - 8));
            ctx.bezierCurveTo(s * 0.3, y + Math.random() * s / 4, s * 0.7, y + Math.random() * s / 4, s, y + 4 + Math.random() * (s / 4 - 8));
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,30,20,.8)';
        ctx.fillRect(8, y + s / 8 - 1.5, 3, 3);
        ctx.fillRect(s - 12, y + s / 8 - 1.5, 3, 3);
    }
    noise(ctx, s, 500, 0.1);
}, 1, 1);

// ---- 沙袋 ----
const sandTex = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#9a8a66';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 2600, 0.2);
    ctx.strokeStyle = 'rgba(70,60,42,.55)';
    for (let i = 1; i < 3; i++) { ctx.beginPath();
        ctx.moveTo(0, i * s / 3);
        ctx.lineTo(s, i * s / 3);
        ctx.lineWidth = 3;
        ctx.stroke(); }
    for (let i = 1; i < 4; i++) { ctx.beginPath();
        ctx.moveTo(i * s / 4, 0);
        ctx.lineTo(i * s / 4, s);
        ctx.lineWidth = 2;
        ctx.stroke(); }
}, 2, 1);

// ---- 金属 ----
const metalTex = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#5d6b5f';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 1200, 0.13);
    ctx.fillStyle = 'rgba(120,72,40,.5)';
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * s,
            y = Math.random() * s,
            r = 8 + Math.random() * 22;
        const gr = ctx.createRadialGradient(x, y, 1, x, y, r);
        gr.addColorStop(0, 'rgba(130,75,40,.55)');
        gr.addColorStop(1, 'rgba(130,75,40,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 7);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(30,34,30,.6)';
    ctx.fillRect(0, s * 0.18, s, 5);
    ctx.fillRect(0, s * 0.72, s, 5);
}, 1, 1);

// ---- 天空 ----
const skyTex = canvasTex(512, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#5b8ec4');
    g.addColorStop(0.55, '#a9c2d4');
    g.addColorStop(0.8, '#d8cdae');
    g.addColorStop(1, '#e6d3a8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 14; i++) {
        const x = Math.random() * s,
            y = s * 0.35 + Math.random() * s * 0.4;
        ctx.beginPath();
        ctx.ellipse(x, y, 25 + Math.random() * 45, 6 + Math.random() * 10, 0, 0, 7);
        ctx.fill();
    }
});