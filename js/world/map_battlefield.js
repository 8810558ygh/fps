// ===== js/world/map_battlefield.js – 战场地图 =====
registerMap('battlefield', {
    name: '战场',
    ambience: {
        background: 0xbcc9d2,
        fog: 0xbcc9d2,
        fogNear: 50,
        fogFar: 120
    },
    spawns: {
        p1: { x: -21, z: -21, yaw: -3 * Math.PI / 4 },
        p2: { x: 21, z: 21, yaw: Math.PI / 4 }
    },
    build() {
        // ----------------------------------------------------
        // 获取 HD_UTIL（用于生成圆角汽车和反光）
        // ----------------------------------------------------
        const U = window.HD_UTIL;
        const envMap = U ? U.buildEnvMap({ key: 'rifle_env' }) : null; // 复用步枪的环境贴图

        // ---- 外围墙 ----
        solid(0, -(ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
        solid(0, (ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
        solid(-(ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);
        solid((ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);

        // ---- 稀疏砖柱（★ B2：使用共享材质） ----
        [
            [-22, -22], [22, -22], [-22, 22], [22, 22],
            [-22, 0], [22, 0], [0, -22], [0, 22]
        ].forEach(([x, z]) => {
            const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 1.2),
                _getStaticMat(brickTex));
            p.position.set(x, 2.6, z);
            p.castShadow = p.receiveShadow = true;
            if (currentMapGroup) currentMapGroup.add(p);
            else scene.add(p);
            wallMeshes.push(p);
            colliders.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6, top: 5.2, bottom: 0 });
        });

        // ---- 中央高台 ----
        (function centralPlatform() {
            const H = 2.5;
            solid(0, 0, 8, H, 8, concreteTex);
            addPlatform(0, 0, 8, 8, H);
            addStairs(0, -4, 'N', 2.5, 5, 0.5, 0.6);
            addStairs(0, 4, 'S', 2.5, 5, 0.5, 0.6);
            addStairs(4, 0, 'E', 2.5, 5, 0.5, 0.6);
            addStairs(-4, 0, 'W', 2.5, 5, 0.5, 0.6);
            function railAt(x, z, w, d) {
                const h = 0.6;
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
                    _getStaticMat(brickTex));
                m.position.set(x, H + h / 2, z);
                m.castShadow = m.receiveShadow = true;
                if (currentMapGroup) currentMapGroup.add(m);
                else scene.add(m);
                wallMeshes.push(m);
                colliders.push({
                    x0: x - w / 2, x1: x + w / 2,
                    z0: z - d / 2, z1: z + d / 2,
                    top: H + h, bottom: H
                });
            }
            railAt(-3, -3, 1.8, 0.4);
            railAt(3, -3, 1.8, 0.4);
            railAt(-3, 3, 1.8, 0.4);
            railAt(3, 3, 1.8, 0.4);
        })();

        // ---- 西北、东南侧翼平台 ----
        (function westPlatform() {
            const H = 3.0;
            solid(-15, 15, 6, H, 6, concreteTex);
            addPlatform(-15, 15, 6, 6, H);
            addStairs(-12, 15, 'E', 2.5, 6, 0.5, 0.6);
        })();
        (function eastPlatform() {
            const H = 3.0;
            solid(15, -15, 6, H, 6, concreteTex);
            addPlatform(15, -15, 6, 6, H);
            addStairs(12, -15, 'W', 2.5, 6, 0.5, 0.6);
        })();

        // ---- 沙袋工事 ----
        const sandbags = [
            [-6, -8, 3.0, 0.95, 0.8], [6, -8, 3.0, 0.95, 0.8],
            [-6, 8, 3.0, 0.95, 0.8], [6, 8, 3.0, 0.95, 0.8],
            [-8, -3, 0.8, 0.95, 2.4], [-8, 3, 0.8, 0.95, 2.4],
            [8, -3, 0.8, 0.95, 2.4], [8, 3, 0.8, 0.95, 2.4],
            [-20, -10, 2.6, 0.95, 0.8], [20, 10, 2.6, 0.95, 0.8],
            [-10, -20, 0.8, 0.95, 2.6], [10, 20, 0.8, 0.95, 2.6]
        ];
        sandbags.forEach(([x, z, w, h, d]) => {
            solid(x, z, w, h, d, sandTex);
            addPlatform(x, z, w, d, h);
        });

        // ---- 木箱（★ B2：使用共享材质） ----
        const crateDefs = [
            [-11, 0, 2, 1.4], [11, 0, 2, 1.4],
            [0, -11, 2, 1.4], [0, 11, 2, 1.4],
            [-19, 7, 2, 1.2], [19, -7, 2, 1.2],
            [7, -19, 2, 1.2], [-7, 19, 2, 1.2],
            [-19, -19, 2.4, 1.8], [19, 19, 2.4, 1.8],
            [-22, 5, 2, 1.0], [22, -5, 2, 1.0]
        ];
        crateDefs.forEach(([cx, cz, w, h]) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w),
                _getStaticMat(woodTex));
            m.position.set(cx, h / 2, cz);
            m.castShadow = m.receiveShadow = true;
            if (currentMapGroup) currentMapGroup.add(m);
            else scene.add(m);
            crateMeshes.push(m);
            colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - w / 2, z1: cz + w / 2, top: h, bottom: 0 });
            addPlatform(cx, cz, w, w, h);
        });

        // ---- 油桶 ----
        addBarrel(-13, -13);
        addBarrel(-12.2, -13.2);
        addBarrel(13, 13);
        addBarrel(13.2, 12.2);
        addBarrel(-20, -3);
        addBarrel(-20, -4);
        addBarrel(20, 3);
        addBarrel(20, 4);
        addBarrel(-3, 20);
        addBarrel(3, -20);

        // ============================================================
        // ★ 高精度报废汽车 (替换原有的 addCar)
        // ============================================================
        function addCarPBR(x, z, col, ry) {
            const g = new THREE.Group();
            
            // 1. 车身（圆角流线）
            const bodyMat = new THREE.MeshStandardMaterial({ 
                color: col, metalness: 0.6, roughness: 0.6, envMap: envMap
            });
            let bodyGeo;
            if (U && U.roundedBoxX) {
                bodyGeo = U.roundedBoxX(4.2, 0.85, 1.9, 0.2, 0.05, 10);
            } else {
                bodyGeo = new THREE.BoxGeometry(4.2, 0.85, 1.9);
            }
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.82;
            g.add(body);

            // 2. 车窗（黑色反光玻璃）
            const glassMat = new THREE.MeshStandardMaterial({ 
                color: 0x111111, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.8, envMap: envMap
            });
            let cabGeo;
            if (U && U.roundedBoxX) {
                cabGeo = U.roundedBoxX(2.1, 0.72, 1.72, 0.2, 0.05, 10);
            } else {
                cabGeo = new THREE.BoxGeometry(2.1, 0.72, 1.72);
            }
            const cab = new THREE.Mesh(cabGeo, glassMat);
            cab.position.set(-0.35, 1.6, 0);
            g.add(cab);

            // 3. 车灯（微弱的自发光）
            const lightMat = new THREE.MeshStandardMaterial({ 
                color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0.3 
            });
            const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.3), lightMat);
            hl.position.set(2.1, 0.85, 0.6); 
            g.add(hl);
            
            const hl2 = hl.clone(); 
            hl2.position.z = -0.6; 
            g.add(hl2);

            // 4. 轮子
            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
            const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
            [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]].forEach(([wx, wz]) => {
                const w = new THREE.Mesh(wheelGeo, wheelMat);
                w.rotation.x = Math.PI / 2;
                w.position.set(wx, 0.36, wz);
                g.add(w);
            });

            // 挂载与阴影
            g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
            g.position.set(x, 0, z);
            if (ry) g.rotation.y = ry;
            if (currentMapGroup) currentMapGroup.add(g);
            else scene.add(g);

            // 碰撞与射线检测（完全保持原来的逻辑）
            const rotated = ry && Math.abs(Math.sin(ry)) > 0.5;
            const cw = rotated ? 1.9 : 4.2;
            const cd = rotated ? 4.2 : 1.9;
            colliders.push({ x0: x - cw / 2, x1: x + cw / 2, z0: z - cd / 2, z1: z + cd / 2, top: 1.8, bottom: 0 });
            addPlatform(x, z, cw, cd, 1.8);
            g.traverse(o => { if (o.isMesh) wallMeshes.push(o); });
        }

        // 调用新的汽车生成函数
        addCarPBR(-13, 7, 0x6a4a3a, 0);
        addCarPBR(13, -7, 0x46586a, 0);
        addCarPBR(-7, -13, 0x4a5a3a, 0);
        addCarPBR(7, 13, 0x6a3a4a, 0);

        // ---- 路灯 ----
        addLamp(20, -20);
        addLamp(-20, 20);
        addLamp(20, 20);
        addLamp(-20, -20);
    }
});