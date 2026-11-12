// ===== js/world/map_indoor_complex.js – 设备间（大型室内地图） =====
(function () {
    'use strict';

    const HALF_X = 44;
    const HALF_Z = 36;
    const WALL_H = 6;
    const WALL_T = 0.8;
    const DOOR_H = 2.9;

    const _indoorWallTex = canvasTex(512, (ctx, s) => {
        ctx.fillStyle = '#aeb8c3';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 900, 0.08);

        // 复合墙板接缝与轻微高光
        ctx.strokeStyle = 'rgba(55, 65, 76, 0.52)';
        ctx.lineWidth = 4;
        for (let i = 1; i < 4; i++) {
            const x = i * s / 4;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, s);
            ctx.stroke();
        }
        for (let i = 1; i < 3; i++) {
            const y = i * s / 3;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(s, y);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(235, 241, 246, 0.22)';
        ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
            const x = i * s / 4 + 4;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, s);
            ctx.stroke();
        }

        // 深色设备踢脚、金属压条和青色设备线
        ctx.fillStyle = '#303941';
        ctx.fillRect(0, s * 0.74, s, s * 0.26);
        ctx.fillStyle = '#4f5b65';
        ctx.fillRect(0, s * 0.72, s, 7);
        ctx.fillStyle = '#36bfd7';
        ctx.fillRect(0, s * 0.69, s, 8);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(0, s * 0.89, s, 5);

        // 固定螺丝与局部污渍
        ctx.fillStyle = 'rgba(36, 43, 49, 0.55)';
        for (let x = 18; x < s; x += s / 4) {
            for (let y = 22; y < s * 0.68; y += s / 3) {
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        for (let i = 0; i < 7; i++) {
            const x = Math.random() * s;
            const y = Math.random() * s * 0.68;
            const g = ctx.createRadialGradient(x, y, 1, x, y, 18 + Math.random() * 28);
            g.addColorStop(0, 'rgba(44, 50, 54, 0.18)');
            g.addColorStop(1, 'rgba(44, 50, 54, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - 45, y - 45, 90, 90);
        }
    });

    const _indoorHeaderTex = canvasTex(512, (ctx, s) => {
        ctx.fillStyle = '#b7c0ca';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 650, 0.07);
        ctx.strokeStyle = 'rgba(56, 66, 76, 0.5)';
        ctx.lineWidth = 4;
        for (let i = 1; i < 4; i++) {
            const x = i * s / 4;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, s);
            ctx.stroke();
        }
        ctx.fillStyle = '#3d4852';
        ctx.fillRect(0, s * 0.84, s, s * 0.16);
        ctx.fillStyle = '#36bfd7';
        ctx.fillRect(0, s * 0.82, s, 6);
    });

    const _indoorFloorTex = canvasTex(512, (ctx, s) => {
        ctx.fillStyle = '#3c464f';
        ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 1300, 0.13);

        // 防滑地砖接缝
        ctx.strokeStyle = 'rgba(16, 22, 27, 0.72)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(s / 2, 0);
        ctx.lineTo(s / 2, s);
        ctx.moveTo(0, s / 2);
        ctx.lineTo(s, s / 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(122, 139, 151, 0.16)';
        ctx.lineWidth = 2;
        ctx.strokeRect(3, 3, s - 6, s - 6);

        // 细碎防滑颗粒与轮胎/鞋底磨损
        ctx.fillStyle = 'rgba(188, 196, 202, 0.12)';
        for (let i = 0; i < 420; i++) {
            ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
        }
        for (let i = 0; i < 9; i++) {
            const x = Math.random() * s;
            const y = Math.random() * s;
            const g = ctx.createRadialGradient(x, y, 2, x, y, 24 + Math.random() * 38);
            g.addColorStop(0, 'rgba(10, 14, 18, 0.18)');
            g.addColorStop(1, 'rgba(10, 14, 18, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - 65, y - 65, 130, 130);
        }
        ctx.strokeStyle = 'rgba(9, 13, 16, 0.22)';
        for (let i = 0; i < 7; i++) {
            ctx.beginPath();
            let x = Math.random() * s;
            let y = Math.random() * s;
            ctx.moveTo(x, y);
            for (let j = 0; j < 4; j++) {
                x += (Math.random() - 0.5) * 70;
                y += (Math.random() - 0.5) * 36;
                ctx.lineTo(x, y);
            }
            ctx.lineWidth = 1 + Math.random() * 1.5;
            ctx.stroke();
        }
    });

    const _signGeo = new THREE.PlaneGeometry(3.4, 0.85);
    _signGeo._shared = true;
    const _signMats = new Map();
    const _tileGeo = new THREE.BoxGeometry(5.5, 0.08, 6);
    _tileGeo._shared = true;
    const _fixtureGeo = new THREE.BoxGeometry(3.0, 0.08, 0.46);
    _fixtureGeo._shared = true;
    const _fixtureMats = new Map();
    const _markGeo = new THREE.PlaneGeometry(1, 1);
    _markGeo._shared = true;
    const _markMats = new Map();
    const _pipeGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 10);
    _pipeGeo._shared = true;

    function _getSignMat(text, color) {
        const key = text + '|' + color;
        let mat = _signMats.get(key);
        if (mat) return mat;

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(12, 16, 21, 0.96)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
        ctx.fillStyle = color;
        ctx.font = 'bold 54px "Microsoft YaHei", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

        const tex = new THREE.CanvasTexture(canvas);
        if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
        mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        _signMats.set(key, mat);
        return mat;
    }

    function _addSign(x, y, z, rotY, text, color) {
        const mesh = new THREE.Mesh(_signGeo, _getSignMat(text, color || '#ffd24a'));
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotY;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        currentMapGroup.add(mesh);
    }

    function _addCover(x, z, w, h, d, tex, baseY) {
        baseY = baseY || 0;
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            _getStaticMat(tex || woodTex)
        );
        mesh.position.set(x, baseY + h / 2, z);
        mesh.castShadow = mesh.receiveShadow = true;
        currentMapGroup.add(mesh);
        crateMeshes.push(mesh);
        colliders.push({
            x0: x - w / 2, x1: x + w / 2,
            z0: z - d / 2, z1: z + d / 2,
            top: baseY + h, bottom: baseY,
        });
        addPlatform(x, z, w, d, baseY + h);
        return mesh;
    }

    function _addFloorMark(x, z, w, d, color, opacity) {
        opacity = opacity === undefined ? 0.62 : opacity;
        const key = color + '|' + opacity;
        let mat = _markMats.get(key);
        if (!mat) {
            mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity,
                depthWrite: false,
                toneMapped: false,
            });
            _markMats.set(key, mat);
        }
        const mesh = new THREE.Mesh(_markGeo, mat);
        mesh.position.set(x, 0.018, z);
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.set(w, d, 1);
        mesh.renderOrder = 1;
        currentMapGroup.add(mesh);
    }

    function _addWallVent(x, y, z, w, h, rotY, color) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, 0.045),
            _getColorMat(color || 0x20262c)
        );
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotY || 0;
        mesh.castShadow = mesh.receiveShadow = false;
        currentMapGroup.add(mesh);
    }

    function _hWall(z, x0, x1, gaps, tex, h, thick) {
        gaps = (gaps || []).slice().sort((a, b) => a[0] - b[0]);
        tex = tex || _indoorWallTex;
        h = h || WALL_H;
        thick = thick || WALL_T;
        const headerTex = (tex === _indoorWallTex) ? _indoorHeaderTex : tex;

        let cursor = x0;
        for (let i = 0; i < gaps.length; i++) {
            const a = Math.max(x0, Math.min(x1, gaps[i][0]));
            const b = Math.max(x0, Math.min(x1, gaps[i][1]));
            if (b <= a) continue;
            if (a > cursor + 0.02) {
                solid((cursor + a) / 2, z, a - cursor, h, thick, tex);
            }
            if (h > DOOR_H + 0.02) {
                addFloatingSlab((a + b) / 2, z, b - a, h - DOOR_H, thick, DOOR_H, headerTex);
            }
            cursor = Math.max(cursor, b);
        }
        if (cursor < x1 - 0.02) {
            solid((cursor + x1) / 2, z, x1 - cursor, h, thick, tex);
        }
    }

    function _vWall(x, z0, z1, gaps, tex, h, thick) {
        gaps = (gaps || []).slice().sort((a, b) => a[0] - b[0]);
        tex = tex || _indoorWallTex;
        h = h || WALL_H;
        thick = thick || WALL_T;
        const headerTex = (tex === _indoorWallTex) ? _indoorHeaderTex : tex;

        let cursor = z0;
        for (let i = 0; i < gaps.length; i++) {
            const a = Math.max(z0, Math.min(z1, gaps[i][0]));
            const b = Math.max(z0, Math.min(z1, gaps[i][1]));
            if (b <= a) continue;
            if (a > cursor + 0.02) {
                solid(x, (cursor + a) / 2, thick, h, a - cursor, tex);
            }
            if (h > DOOR_H + 0.02) {
                addFloatingSlab(x, (a + b) / 2, thick, h - DOOR_H, b - a, DOOR_H, headerTex);
            }
            cursor = Math.max(cursor, b);
        }
        if (cursor < z1 - 0.02) {
            solid(x, (cursor + z1) / 2, thick, h, z1 - cursor, tex);
        }
    }

    function _addCeilingFixture(x, z, color) {
        color = color || 0xffe2b0;
        let mat = _fixtureMats.get(color);
        if (!mat) {
            mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
            _fixtureMats.set(color, mat);
        }
        const mesh = new THREE.Mesh(_fixtureGeo, mat);
        mesh.position.set(x, 5.62, z);
        currentMapGroup.add(mesh);
    }

    function _addPointLight(x, z, color, intensity) {
        const light = new THREE.PointLight(color || 0xffc780, intensity || 1.0, 34, 2);
        light.position.set(x, 5.1, z);
        currentMapGroup.add(light);
    }

    registerMap('indoor_complex', {
        name: '设备间',
        hideGround: true,
        arenaHalf: HALF_X,
        shadowHalf: HALF_X,
        ambience: {
            background: 0x070a0e,
            fog: 0x070a0e,
            fogNear: 30,
            fogFar: 92,
        },
        spawns: {
            p1: { x: -34, z: -25, yaw: -Math.PI / 2 },
            p2: { x: 34, z: 25, yaw: Math.PI / 2 },
        },

        build() {
            // ---------- 地面 ----------
            const tileMat = _getStaticMat(_indoorFloorTex);
            const tileCols = 16;
            const tileRows = 12;
            const floorMesh = new THREE.InstancedMesh(_tileGeo, tileMat, tileCols * tileRows);
            const dummy = new THREE.Object3D();
            let tileIndex = 0;
            for (let ix = 0; ix < tileCols; ix++) {
                for (let iz = 0; iz < tileRows; iz++) {
                    dummy.position.set(
                        -HALF_X + 2.75 + ix * 5.5,
                        -0.04,
                        -HALF_Z + 3 + iz * 6
                    );
                    dummy.updateMatrix();
                    floorMesh.setMatrixAt(tileIndex++, dummy.matrix);
                }
            }
            floorMesh.instanceMatrix.needsUpdate = true;
            floorMesh.receiveShadow = true;
            floorMesh.castShadow = false;
            floorMesh.frustumCulled = false;
            if (typeof floorMesh.computeBoundingSphere === 'function') {
                floorMesh.computeBoundingSphere();
            }
            currentMapGroup.add(floorMesh);
            wallMeshes.push(floorMesh);

            // ---------- 天花板与结构梁 ----------
            const ceiling = new THREE.Mesh(
                new THREE.BoxGeometry(HALF_X * 2 + 1, 0.3, HALF_Z * 2 + 1),
                _getColorMat(0x24282e)
            );
            ceiling.position.set(0, 6.15, 0);
            ceiling.castShadow = true;
            ceiling.receiveShadow = false;
            currentMapGroup.add(ceiling);
            wallMeshes.push(ceiling);

            [-30, -15, 0, 15, 30].forEach(x => {
                addFloatingSlab(x, 0, 0.38, 0.35, HALF_Z * 2 - 1, 5.68, metalTex);
            });
            [-24, -8, 8, 24].forEach(z => {
                addFloatingSlab(0, z, HALF_X * 2 - 1, 0.32, 0.34, 5.7, metalTex);
            });

            // 天花板下方的设备管线与线槽
            const pipeMat = _getColorMat(0x59646d);
            const cableMat = _getColorMat(0x1e2429);
            [-27, 27].forEach((x, i) => {
                const pipe = new THREE.Mesh(_pipeGeo, pipeMat);
                pipe.position.set(x + i * 0.45, 5.34, 0);
                pipe.rotation.x = Math.PI / 2;
                pipe.scale.y = HALF_Z * 2 - 2;
                pipe.castShadow = true;
                currentMapGroup.add(pipe);

                const tray = new THREE.Mesh(
                    new THREE.BoxGeometry(0.62, 0.12, HALF_Z * 2 - 3),
                    cableMat
                );
                tray.position.set(x - 0.75, 5.43, 0);
                tray.castShadow = true;
                currentMapGroup.add(tray);
            });
            const crossPipe = new THREE.Mesh(_pipeGeo, pipeMat);
            crossPipe.position.set(0, 5.25, -16);
            crossPipe.rotation.z = Math.PI / 2;
            crossPipe.scale.y = HALF_X * 2 - 4;
            crossPipe.castShadow = true;
            currentMapGroup.add(crossPipe);

            // ---------- 外围墙 ----------
            _hWall(-HALF_Z, -HALF_X, HALF_X);
            _hWall(HALF_Z, -HALF_X, HALF_X);
            _vWall(-HALF_X, -HALF_Z, HALF_Z);
            _vWall(HALF_X, -HALF_Z, HALF_Z);

            // ---------- 口字型走廊 + 四条长房 ----------
            // 长房靠走廊一侧各有两个门洞。
            _hWall(19, -23, 23, [[-14, -9], [9, 14]]);       // 北长房 -> 北走廊
            _hWall(-19, -23, 23, [[-14, -9], [9, 14]]);      // 南长房 -> 南走廊
            _vWall(-23, -19, 19, [[-12, -7], [7, 12]]);      // 东长房 -> 东走廊
            _vWall(23, -19, 19, [[-12, -7], [7, 12]]);       // 西长房 -> 西走廊

            // ---------- 四角方房 ----------
            // 每个角房分别连接相邻的两个长房。
            _hWall(19, -HALF_X, -23, [[-38, -33]]);          // 东北角房 <-> 东长房
            _hWall(19, 23, HALF_X, [[33, 38]]);              // 西北角房 <-> 西长房
            _hWall(-19, -HALF_X, -23, [[-38, -33]]);         // 东南角房 <-> 东长房
            _hWall(-19, 23, HALF_X, [[33, 38]]);             // 西南角房 <-> 西长房
            _vWall(-23, 19, HALF_Z, [[24, 29]]);             // 东北角房 <-> 北长房
            _vWall(23, 19, HALF_Z, [[24, 29]]);              // 西北角房 <-> 北长房
            _vWall(-23, -HALF_Z, -19, [[-29, -24]]);         // 东南角房 <-> 南长房
            _vWall(23, -HALF_Z, -19, [[-29, -24]]);          // 西南角房 <-> 南长房

            // ---------- 中央中庭 ----------
            _hWall(13, -17, 17, [[3, 9]]);
            _hWall(-13, -17, 17, [[-9, -3]]);
            _vWall(-17, -13, 13, [[3, 9]]);
            _vWall(17, -13, 13, [[-9, -3]]);

            // 中庭中央高台：四面楼梯，顶部形成低位掩体
            solid(0, 1, 10, 1.2, 8, metalTex);
            addPlatform(0, 1, 10, 8, 1.2);
            addStairs(0, -3, 'N', 2.4, 3, 0.4, 0.6);
            addStairs(0, 5, 'S', 2.4, 3, 0.4, 0.6);
            addStairs(-5, 1, 'W', 2.4, 3, 0.4, 0.6);
            addStairs(5, 1, 'E', 2.4, 3, 0.4, 0.6);
            _addCover(0, 1, 4.2, 1.25, 1.2, brickTex, 1.2);

            [
                [-9, -7], [9, -7], [-9, 7], [9, 7],
            ].forEach(([x, z]) => solid(x, z, 1.4, WALL_H, 1.4, brickTex));

            // ---------- 房间内部家具与掩体 ----------
            // 四个方房
            _addCover(-35, 26, 4.0, 1.5, 2.0, woodTex);
            _addCover(-40, 32, 1.4, 2.2, 4.0, metalTex);
            _addCover(-27, 32, 2.2, 2.0, 1.2, metalTex);

            _addCover(35, 26, 4.0, 1.5, 2.0, woodTex);
            _addCover(40, 32, 1.4, 2.2, 4.0, metalTex);
            _addCover(27, 32, 2.2, 2.0, 1.2, metalTex);

            _addCover(-35, -26, 4.0, 1.5, 2.0, woodTex);
            _addCover(-40, -32, 1.4, 2.2, 4.0, metalTex);
            _addCover(-27, -32, 2.2, 2.0, 1.2, metalTex);

            _addCover(35, -26, 4.0, 1.5, 2.0, woodTex);
            _addCover(40, -32, 1.4, 2.2, 4.0, metalTex);
            _addCover(27, -32, 2.2, 2.0, 1.2, metalTex);

            // 南北长房
            _addCover(-14, 28, 5.0, 1.2, 1.2, woodTex);
            _addCover(14, 28, 5.0, 1.2, 1.2, woodTex);
            _addCover(0, 33, 7.0, 0.95, 1.5, metalTex);

            _addCover(-14, -28, 5.0, 1.2, 1.2, woodTex);
            _addCover(14, -28, 5.0, 1.2, 1.2, woodTex);
            _addCover(0, -33, 7.0, 0.95, 1.5, metalTex);

            // 东西长房
            _addCover(-34, 10, 1.2, 1.2, 5.0, woodTex);
            _addCover(-34, -10, 1.2, 1.2, 5.0, woodTex);
            _addCover(-40, 0, 1.2, 2.2, 6.0, metalTex);

            _addCover(34, 10, 1.2, 1.2, 5.0, woodTex);
            _addCover(34, -10, 1.2, 1.2, 5.0, woodTex);
            _addCover(40, 0, 1.2, 2.2, 6.0, metalTex);

            // 中庭低位掩体，打断中央长直线
            _addCover(-10, -2, 2.8, 1.15, 2.0, woodTex);
            _addCover(10, 4, 2.8, 1.15, 2.0, woodTex);
            _addCover(-3.5, 9.5, 1.5, 2.2, 1.5, metalTex);

            [
                [-38, -20], [38, 20], [-20, 30], [20, -30],
                [-7, 8], [7, -8], [-28, -4], [28, 4],
            ].forEach(([x, z]) => addBarrel(x, z));

            // ---------- 分区导视与地面标记 ----------
            _addFloorMark(-20, 0, 0.14, 38, 0x36bfd7, 0.46);
            _addFloorMark(20, 0, 0.14, 38, 0x36bfd7, 0.46);
            _addFloorMark(0, 16, 46, 0.14, 0xffc94a, 0.48);
            _addFloorMark(0, -16, 46, 0.14, 0xffc94a, 0.48);

            // 四条长房与走廊之间的门洞门槛
            _addFloorMark(-11.5, 19, 5.0, 0.24, 0xffb83d, 0.72);
            _addFloorMark(11.5, 19, 5.0, 0.24, 0xffb83d, 0.72);
            _addFloorMark(-11.5, -19, 5.0, 0.24, 0xffb83d, 0.72);
            _addFloorMark(11.5, -19, 5.0, 0.24, 0xffb83d, 0.72);
            _addFloorMark(-23, -9.5, 0.24, 5.0, 0xffb83d, 0.72);
            _addFloorMark(-23, 9.5, 0.24, 5.0, 0xffb83d, 0.72);
            _addFloorMark(23, -9.5, 0.24, 5.0, 0xffb83d, 0.72);
            _addFloorMark(23, 9.5, 0.24, 5.0, 0xffb83d, 0.72);

            // 中央高台的危险边缘线
            _addFloorMark(0, -3.55, 11.4, 0.18, 0xffb83d, 0.8);
            _addFloorMark(0, 5.55, 11.4, 0.18, 0xffb83d, 0.8);
            _addFloorMark(-5.55, 1, 0.18, 9.1, 0xffb83d, 0.8);
            _addFloorMark(5.55, 1, 0.18, 9.1, 0xffb83d, 0.8);

            // 设备检修口
            _addWallVent(-22.56, 2.2, 5.0, 2.4, 0.8, Math.PI / 2);
            _addWallVent(-22.56, 2.2, -5.0, 2.4, 0.8, Math.PI / 2);
            _addWallVent(22.56, 2.2, 5.0, 2.4, 0.8, Math.PI / 2);
            _addWallVent(22.56, 2.2, -5.0, 2.4, 0.8, Math.PI / 2);
            _addWallVent(-8, 2.25, 18.56, 2.8, 0.75, 0);
            _addWallVent(8, 2.25, -18.56, 2.8, 0.75, 0);

            // ---------- 照明 ----------
            [
                [-30, -24], [-30, 24], [0, 0],
                [30, -24], [30, 24], [0, -27], [0, 27],
            ].forEach(([x, z], i) => {
                _addCeilingFixture(x, z, i === 2 ? 0x9bd8ff : 0xffe2b0);
                _addPointLight(x, z, i === 2 ? 0x9bd8ff : 0xffbe78, 1.05);
            });

            // ---------- 导视牌 ----------
            _addSign(0, 3.5, -12.58, 0, '南翼 · 中庭', '#ffd24a');
            _addSign(0, 3.5, 12.58, Math.PI, '北翼 · 中庭', '#ffd24a');
            _addSign(-16.58, 3.5, 0, Math.PI / 2, '东长房入口', '#6db3ff');
            _addSign(16.58, 3.5, 0, -Math.PI / 2, '西长房入口', '#6db3ff');
            _addSign(0, 3.4, 19.58, 0, '北设备长房', '#7ee08a');
            _addSign(0, 3.4, -19.58, Math.PI, '南设备长房', '#7ee08a');
        },
    });
})();
