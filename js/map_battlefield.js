// ===== js/map_battlefield.js – 战场地图 =====
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
        // ---- 外围墙 ----
        solid(0, -(ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
        solid(0, (ARENA + 0.5), ARENA * 2 + 2, 4.5, 1, concreteTex);
        solid(-(ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);
        solid((ARENA + 0.5), 0, 1, 4.5, ARENA * 2 + 2, concreteTex);

        // ---- 稀疏砖柱 ----
        [
            [-22, -22], [22, -22], [-22, 22], [22, 22],
            [-22, 0], [22, 0], [0, -22], [0, 22]
        ].forEach(([x, z]) => {
            const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 1.2),
                new THREE.MeshLambertMaterial({ map: brickTex }));
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
                    new THREE.MeshLambertMaterial({ map: brickTex }));
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

        // ---- 木箱 ----
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
                new THREE.MeshLambertMaterial({ map: woodTex }));
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

        // ---- 报废汽车 ----
        addCar(-13, 7, 0x6a4a3a, 0);
        addCar(13, -7, 0x46586a, 0);
        addCar(-7, -13, 0x4a5a3a, 0);
        addCar(7, 13, 0x6a3a4a, 0);

        // ---- 路灯 ----
        addLamp(20, -20);
        addLamp(-20, 20);
        addLamp(20, 20);
        addLamp(-20, -20);

        // ---- 地面杂物 ----
        const debrisMats = [0x555a52, 0x6b6154, 0x4a4f45].map(c => new THREE.MeshLambertMaterial({ color: c }));
        for (let i = 0; i < 40; i++) {
            const s = 0.15 + Math.random() * 0.4;
            const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s), debrisMats[i % 3]);
            m.position.set((Math.random() - 0.5) * (ARENA * 2 - 4), s * 0.25, (Math.random() - 0.5) * (ARENA * 2 - 4));
            m.rotation.y = Math.random() * 3;
            m.castShadow = true;
            if (currentMapGroup) currentMapGroup.add(m);
            else scene.add(m);
        }
    }
});