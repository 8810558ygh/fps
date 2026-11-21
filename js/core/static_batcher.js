// ===== js/core/static_batcher.js – 静态地图合批 =====
//
// 地图中的墙体、箱体和车辆零件大多是独立 Mesh，视觉内容相同但会产生
// 大量 draw call。这里把材质、属性布局和阴影设置一致的静态 Mesh 合并成
// 少量几何体。碰撞数据 colliders 不参与合批，因此移动和射线判定不变。
//
// 油桶会在战斗中隐藏/爆炸，必须排除；实例化对象和透明对象也保持不变。

(function () {
    'use strict';

    if (typeof THREE === 'undefined') return;

    const MERGE_ATTRIBUTES = ['position', 'normal', 'uv', 'uv2', 'color', 'tangent'];
    const MIN_BATCH_SIZE = 3;

    function _attributeSignature(geometry) {
        let out = '';
        for (const name of MERGE_ATTRIBUTES) {
            const attr = geometry.getAttribute(name);
            if (!attr) continue;
            out += name + ':' + attr.itemSize + ':' + attr.normalized + ';';
        }
        return out;
    }

    function _canBatch(mesh) {
        if (!mesh || !mesh.isMesh || mesh.isInstancedMesh) return false;
        if (mesh.userData && mesh.userData.noBatch) return false;
        if (!mesh.geometry || !mesh.material || Array.isArray(mesh.material)) return false;
        if (mesh.material.transparent || mesh.material.opacity < 1) return false;
        if (mesh.userData && mesh.userData.barrelRef) return false;
        if (mesh.isSkinnedMesh || mesh.morphTargetInfluences) return false;
        return true;
    }

    function _prepareGeometry(mesh, parentInverse) {
        const source = mesh.geometry.index
            ? mesh.geometry.toNonIndexed()
            : mesh.geometry.clone();

        const localWorld = new THREE.Matrix4()
            .multiplyMatrices(parentInverse, mesh.matrixWorld);
        source.applyMatrix4(localWorld);

        // 只保留渲染需要的通用静态属性，避免不同几何体之间无法合并。
        const kept = [];
        for (const name of MERGE_ATTRIBUTES) {
            const attr = source.getAttribute(name);
            if (!attr) continue;
            kept.push({
                name,
                itemSize: attr.itemSize,
                normalized: attr.normalized,
                array: attr.array,
            });
        }

        source.dispose();
        return kept;
    }

    function _mergePrepared(prepared) {
        const geometry = new THREE.BufferGeometry();
        const names = prepared[0] ? prepared[0].map(a => a.name) : [];

        for (const name of names) {
            let total = 0;
            let template = null;
            for (const attrs of prepared) {
                const attr = attrs.find(a => a.name === name);
                if (!attr || !template) {
                    if (!template && attr) template = attr;
                }
                total += attr ? attr.array.length : 0;
            }
            if (!template) continue;

            const merged = new Float32Array(total);
            let offset = 0;
            for (const attrs of prepared) {
                const attr = attrs.find(a => a.name === name);
                if (!attr) continue;
                merged.set(attr.array, offset);
                offset += attr.array.length;
            }

            geometry.setAttribute(
                name,
                new THREE.BufferAttribute(merged, template.itemSize, template.normalized)
            );
        }

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    function _batchList(list, mapGroup) {
        if (!Array.isArray(list) || list.length < MIN_BATCH_SIZE || !mapGroup) {
            return { before: list ? list.length : 0, after: list ? list.length : 0, removed: 0 };
        }

        mapGroup.updateMatrixWorld(true);
        const parentInverse = new THREE.Matrix4()
            .copy(mapGroup.matrixWorld)
            .invert();

        const groups = new Map();
        const unique = new Set();

        for (const mesh of list) {
            if (!_canBatch(mesh) || unique.has(mesh)) continue;
            unique.add(mesh);

            // 当前所有地图都使用可见对象；若未来出现隐藏占位物，保留原样。
            if (!mesh.visible) continue;

            const sig = _attributeSignature(mesh.geometry);
            const key = [
                mesh.material.uuid,
                sig,
                mesh.castShadow ? 1 : 0,
                mesh.receiveShadow ? 1 : 0,
                mesh.renderOrder || 0,
            ].join('|');

            let group = groups.get(key);
            if (!group) {
                group = {
                    material: mesh.material,
                    castShadow: mesh.castShadow,
                    receiveShadow: mesh.receiveShadow,
                    renderOrder: mesh.renderOrder || 0,
                    meshes: [],
                };
                groups.set(key, group);
            }
            group.meshes.push(mesh);
        }

        const consumed = new Set();
        const mergedMeshes = [];
        let removed = 0;

        groups.forEach(group => {
            if (group.meshes.length < MIN_BATCH_SIZE) return;

            try {
                const prepared = group.meshes.map(mesh => _prepareGeometry(mesh, parentInverse));
                const geometry = _mergePrepared(prepared);
                const merged = new THREE.Mesh(geometry, group.material);
                merged.castShadow = group.castShadow;
                merged.receiveShadow = group.receiveShadow;
                merged.renderOrder = group.renderOrder;
                merged.frustumCulled = true;
                merged.userData.mergedStatic = true;
                merged.userData.mergedCount = group.meshes.length;
                mapGroup.add(merged);
                mergedMeshes.push(merged);

                for (const mesh of group.meshes) {
                    consumed.add(mesh);
                    if (mesh.parent) mesh.parent.remove(mesh);
                    if (mesh.geometry && !mesh.geometry._shared) mesh.geometry.dispose();
                    removed++;
                }
            } catch (e) {
                console.warn('[static_batcher] 合批失败，保留原网格:', e);
            }
        });

        if (consumed.size === 0) {
            return { before: list.length, after: list.length, removed: 0 };
        }

        const remaining = list.filter(mesh => !consumed.has(mesh));
        for (const mesh of mergedMeshes) remaining.push(mesh);
        list.length = 0;
        for (const mesh of remaining) list.push(mesh);

        mapGroup.updateMatrixWorld(true);
        return { before: list.length + removed, after: list.length, removed };
    }

    window.batchStaticMapMeshes = function (mapGroup) {
        if (!mapGroup) return null;

        const walls = _batchList(
            typeof wallMeshes !== 'undefined' ? wallMeshes : null,
            mapGroup
        );
        const crates = _batchList(
            typeof crateMeshes !== 'undefined' ? crateMeshes : null,
            mapGroup
        );

        if (typeof window.markShotTargetsDirty === 'function') {
            window.markShotTargetsDirty();
        }

        const result = {
            walls,
            crates,
            totalBefore: walls.before + crates.before,
            totalAfter: walls.after + crates.after,
        };
        console.log(
            '[static_batcher] 静态合批完成:',
            result.totalBefore,
            '→',
            result.totalAfter,
            '（墙体', walls.before, '→', walls.after,
            '，箱体', crates.before, '→', crates.after, '）'
        );
        return result;
    };
})();
