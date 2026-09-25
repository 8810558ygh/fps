// ===== js/map_desert.js – 沙漠地图（原封搬用沙漠 HTML 场景，带真实起伏沙丘） =====

/* ---------- 工具 ---------- */
function desertMulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function desertCreateNoise2D(seed){
  const rand = desertMulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y) => {
    switch (h & 7){
      case 0: return  x + y;
      case 1: return  x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return  x;
      case 5: return -x;
      case 6: return  y;
      default: return -y;
    }
  };
  return function(x, y){
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y],     ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf),     grad(ba, xf - 1, yf),     u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  };
}

const desertNoise2 = desertCreateNoise2D(20240613);
const desertClamp  = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- 沙丘高度场 ---------- */
const DESERT_WIND = new THREE.Vector2(1.0, 0.35).normalize();

const DESERT_MAP_HALF = 160;         // 地形视觉半宽
const DESERT_ARENA_R  = 32;          // 竞技场核心半径
const DESERT_BLEND_W  = 60;          // 从竞技场过渡到全高度沙丘的宽度
const DESERT_ARENA_SCALE = 0.12;     // 竞技场内高度缩放（12% -> 让玩家能玩又能看到起伏）

function desertRidged(u, v, oct, freq, stretch){
  let sum = 0, amp = 1, norm = 0, f = freq;
  for (let i = 0; i < oct; i++){
    let n = desertNoise2(u * f * stretch, v * f);
    n = 1 - Math.abs(n);
    n *= n;
    sum += n * amp; norm += amp;
    amp *= 0.45; f *= 2.19;
  }
  return sum / norm;
}

function desertHeight(x, z){
  const wx =  x * DESERT_WIND.x + z * DESERT_WIND.y;
  const wz = -x * DESERT_WIND.y + z * DESERT_WIND.x;

  let h = desertRidged(wx, wz, 3, 0.0090, 0.30) * 58.0;
  h += desertRidged(wx, wz, 2, 0.0300, 0.45) * 14.0;
  h += desertNoise2(x * 0.011, z * 0.011) * 13.0;
  h += desertNoise2(x * 0.028, z * 0.028) * 3.5;

  // ★ 竞技场内缩放高度（不再拍平！）
  const dist = Math.max(Math.abs(x), Math.abs(z));
  let scale = 1.0;
  if (dist < DESERT_ARENA_R) {
    scale = DESERT_ARENA_SCALE;
  } else if (dist < DESERT_ARENA_R + DESERT_BLEND_W) {
    const t = (dist - DESERT_ARENA_R) / DESERT_BLEND_W;
    // 平滑过渡
    const s = t * t * (3 - 2 * t);
    scale = DESERT_ARENA_SCALE + s * (1 - DESERT_ARENA_SCALE);
  }
  return h * scale;
}

/* ---------- 沙地纹理（原 HTML 逻辑） ---------- */
function createDesertSandTextures(size = 512){
  const H = new Float32Array(size * size);
  const rnd = desertMulberry32(777);

  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const i = y * size + x;
      const warp   = desertNoise2(x * 0.02, y * 0.02) * 3.0;
      let ripple   = Math.sin(x * 0.55 + y * 0.16 + warp) * 0.5 + 0.5;
      ripple       = Math.pow(ripple, 2.0);
      const grain  = rnd();
      const patch  = desertNoise2(x * 0.012, y * 0.012) * 0.5 + 0.5;
      H[i] = ripple * 0.40 + grain * 0.42 + patch * 0.18;
    }
  }

  const cCol = document.createElement('canvas');
  cCol.width = cCol.height = size;
  const ctxC = cCol.getContext('2d');
  const imgC = ctxC.createImageData(size, size);
  const dc = imgC.data;
  for (let i = 0; i < size * size; i++){
    const h = H[i] - 0.5;
    dc[i * 4]     = desertClamp(206 + h * 60, 0, 255);
    dc[i * 4 + 1] = desertClamp(173 + h * 54, 0, 255);
    dc[i * 4 + 2] = desertClamp(124 + h * 46, 0, 255);
    dc[i * 4 + 3] = 255;
  }
  ctxC.putImageData(imgC, 0, 0);

  const cNor = document.createElement('canvas');
  cNor.width = cNor.height = size;
  const ctxN = cNor.getContext('2d');
  const imgN = ctxN.createImageData(size, size);
  const dn = imgN.data;
  const S = 3.2;
  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const i = y * size + x;
      const xl = H[y * size + ((x - 1 + size) % size)];
      const xr = H[y * size + ((x + 1) % size)];
      const yd = H[((y - 1 + size) % size) * size + x];
      const yu = H[((y + 1) % size) * size + x];
      let nx = (xl - xr) * S, ny = (yd - yu) * S, nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      dn[i * 4]     = (nx * 0.5 + 0.5) * 255;
      dn[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      dn[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      dn[i * 4 + 3] = 255;
    }
  }
  ctxN.putImageData(imgN, 0, 0);

  const texCol = new THREE.CanvasTexture(cCol);
  texCol.encoding = THREE.sRGBEncoding;
  texCol.wrapS = texCol.wrapT = THREE.RepeatWrapping;

  const texNor = new THREE.CanvasTexture(cNor);
  texNor.wrapS = texNor.wrapT = THREE.RepeatWrapping;

  return { texCol, texNor };
}

/* ---------- 干草贴图（原 HTML 逻辑） ---------- */
function createDesertGrassTexture(size = 256){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rnd = desertMulberry32(4242);

  for (let i = 0; i < 110; i++){
    const bx = size * (0.10 + rnd() * 0.80);
    const by = size;
    const len = size * (0.30 + rnd() * 0.58);
    const lean = (rnd() - 0.5) * size * 0.6;
    const g = 95 + rnd() * 65;
    ctx.strokeStyle = `rgba(${g + 62},${g + 26},${g * 0.52},${0.55 + rnd() * 0.45})`;
    ctx.lineWidth = 0.8 + rnd() * 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + lean * 0.32, by - len * 0.55, bx + lean, by - len);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/* ---------- 岩石几何（原 HTML 逻辑） ---------- */
function createDesertRockGeometry(radius, seed){
  const g = new THREE.IcosahedronGeometry(radius, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < p.count; i++){
    v.fromBufferAttribute(p, i);
    const n1 = desertNoise2(v.x * 0.06 + seed, v.z * 0.06 + seed * 0.7);
    const n2 = desertNoise2(v.x * 0.22 + seed * 2.1, v.y * 0.22);
    const d = 1 + n1 * 0.42 + n2 * 0.16;
    v.multiplyScalar(d);
    v.y *= 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------- 干草风摆时间（独立 rAF） ---------- */
const desertGrassTime = { value: 0 };
(function tickDesertGrassTime(){
  desertGrassTime.value = performance.now() / 1000;
  requestAnimationFrame(tickDesertGrassTime);
})();

/* ---------- 注册地图 ---------- */
registerMap('desert', {
  name: '沙漠',
  hideGround: true,
  terrainHeightFn: desertHeight,        // ★ 让游戏物理知道地形高度
  ambience: {
    background: 0xc19a68,
    fogExp2:    0xc19a68,
    fogDensity: 0.0026
  },
  spawns: {
    p1: { x: -21, z: -21, yaw: -3 * Math.PI / 4 },
    p2: { x:  21, z:  21, yaw:  Math.PI / 4 }
  },
  build() {
    // -------- 1. 沙丘地形 --------
    const TERRAIN_SIZE = DESERT_MAP_HALF * 2;
    const TERRAIN_SEG  = 400;

    const { texCol, texNor } = createDesertSandTextures(512);
    const REPEAT = 32;
    texCol.repeat.set(REPEAT, REPEAT);
    texNor.repeat.set(REPEAT, REPEAT);

    if (typeof renderer !== 'undefined' && renderer.capabilities) {
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      texCol.anisotropy = maxAniso;
      texNor.anisotropy = maxAniso;
    }

    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
    geo.rotateX(-Math.PI / 2);

    {
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);

      for (let i = 0; i < pos.count; i++){
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, desertHeight(x, z));

        const v = 0.90 + (desertNoise2(x * 0.03, z * 0.03) * 0.5 + 0.5) * 0.20;

        const dist = Math.max(Math.abs(x), Math.abs(z));
        const t = dist > DESERT_ARENA_R
          ? desertClamp((dist - DESERT_ARENA_R) / DESERT_BLEND_W, 0, 1)
          : 0;
        const rockAmt = t * t;

        colors[i * 3]     = v * (1 - rockAmt * 0.10);
        colors[i * 3 + 1] = v * 0.985 * (1 - rockAmt * 0.22);
        colors[i * 3 + 2] = v * 0.945 * (1 - rockAmt * 0.36);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
    }

    const sandMaterial = new THREE.MeshStandardMaterial({
      map: texCol,
      normalMap: texNor,
      normalScale: new THREE.Vector2(0.85, 0.85),
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0
    });

    const terrain = new THREE.Mesh(geo, sandMaterial);
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    currentMapGroup.add(terrain);

    // -------- 2. 天空球 --------
    const SUN_DIR = new THREE.Vector3(0.60, 0.34, 0.72).normalize();
    const skyUniforms = {
      uTop:     { value: new THREE.Color(0x1f4b8f) },
      uHorizon: { value: new THREE.Color(0xe8a860) },
      uBottom:  { value: new THREE.Color(0x6b4c2a) },
      uSunCol:  { value: new THREE.Color(0xffd9a0) },
      uSunDir:  { value: SUN_DIR.clone() }
    };

    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uTop, uHorizon, uBottom, uSunCol, uSunDir;
        void main(){
          vec3 dir = normalize(vDir);
          float h = dir.y;
          vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
          col = mix(uBottom, col, smoothstep(-0.18, 0.02, h));
          float sd = max(dot(dir, uSunDir), 0.0);
          float disc = smoothstep(0.99970, 0.99996, sd);
          col += uSunCol * disc * 9.0;
          col += uSunCol * pow(sd, 900.0) * 1.6;
          col += uSunCol * pow(sd, 24.0)  * 0.34;
          col += uSunCol * pow(sd, 4.0)   * 0.10;
          col += vec3(0.45, 0.24, 0.08) * pow(max(1.0 - abs(h) * 2.4, 0.0), 3.0) * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const skyGeo = new THREE.SphereGeometry(200, 48, 32);
    const skyMesh = new THREE.Mesh(skyGeo, skyMaterial);
    skyMesh.renderOrder = -1000;
    skyMesh.frustumCulled = false;
    currentMapGroup.add(skyMesh);

    // -------- 3. 岩石 --------
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x9a7f60,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true
    });

    {
      const rockCount = 60;
      const rnd = desertMulberry32(31337);

      for (let i = 0; i < rockCount; i++){
        const r = 30 + Math.sqrt(rnd()) * 240;
        const a = rnd() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;

        const size = 0.8 + Math.pow(rnd(), 2.2) * 5.5;
        const rockGeo = createDesertRockGeometry(size, rnd() * 100);
        const rock = new THREE.Mesh(rockGeo, rockMaterial);

        rock.position.set(x, desertHeight(x, z) - size * 0.35, z);
        rock.rotation.set(rnd() * 0.6 - 0.3, rnd() * Math.PI * 2, rnd() * 0.6 - 0.3);
        rock.castShadow = true;
        rock.receiveShadow = true;
        currentMapGroup.add(rock);
      }
    }

    // -------- 4. 干草 --------
    const grassMat = new THREE.MeshStandardMaterial({
      map: createDesertGrassTexture(256),
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0,
      color: 0xcfb98a
    });

    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = desertGrassTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
          #include <begin_vertex>
          float hgt = max(position.y, 0.0) / 4.0;
          float sway = sin(uTime * 1.7 + position.x * 0.6 + position.z * 0.35) * 0.55
                     + sin(uTime * 3.1 + position.z * 0.9) * 0.22;
          transformed.x += sway * hgt * hgt * 0.75;
          transformed.z += sway * hgt * hgt * 0.30;
        `
      );
    };

    {
      const W = 3.2, H = 3.0;
      const g1 = new THREE.PlaneGeometry(W, H);
      g1.translate(0, H * 0.5, 0);

      const g2 = g1.clone();
      g2.rotateY(Math.PI / 2);

      const COUNT = 900;
      const grass1 = new THREE.InstancedMesh(g1, grassMat, COUNT);
      const grass2 = new THREE.InstancedMesh(g2, grassMat, COUNT);
      grass1.castShadow = grass2.castShadow = true;
      grass1.receiveShadow = grass2.receiveShadow = true;
      grass1.frustumCulled = grass2.frustumCulled = false;

      const dummy = new THREE.Object3D();
      const rnd = desertMulberry32(90210);

      for (let i = 0; i < COUNT; i++){
        const r = Math.sqrt(rnd()) * 250;
        const a = rnd() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = desertHeight(x, z);

        dummy.position.set(x, y - 0.4, z);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        const s = 0.55 + rnd() * 1.15;
        dummy.scale.set(s, s * (0.8 + rnd() * 0.6), s);
        dummy.updateMatrix();

        grass1.setMatrixAt(i, dummy.matrix);
        grass2.setMatrixAt(i, dummy.matrix);
      }
      grass1.instanceMatrix.needsUpdate = true;
      grass2.instanceMatrix.needsUpdate = true;
      currentMapGroup.add(grass1, grass2);
    }
  }
});