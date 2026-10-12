// ===== js/combat_animation.js – 第一 / 第三人称武器动画 =====
// 从 game_combat.js 拆出，不改变任何对外接口
// 依赖：combat_recoil.js 提供 computeSniperRecoil

// 狙击后坐力动画专用的复用向量
const _rcRecoilPos = new THREE.Vector3();
const _rcRecoilRot = new THREE.Euler();

// ============================================================
// 第一人称换弹动画（步枪）
// ============================================================
function updateRifleReloadAnim(vm, p, now) {
    const w = p.weapon;
    const total = w.reloadMs || 2500;
    const elapsed = total - (p.reloadEnd - now);
    const t = Math.max(0, Math.min(1, elapsed / total));

    if (!p._reloadAnimLogged) {
        p._reloadAnimLogged = true;
        console.log('[reload anim] 触发。magazineGroup =',
            vm.userData.magazineGroup ? 'OK' : 'MISSING');
    }

    const bp = vm.userData.basePos;
    const br = vm.userData.baseRot;

    let sink = 0;
    if (t < 0.10) sink = t / 0.10;
    else if (t < 0.90) sink = 1;
    else sink = 1 - (t - 0.90) / 0.10;

    const tilt   = sink * 0.22;
    const sinkY  = sink * 0.10;
    const rollZ  = sink * 0.25;
    const wobble = Math.sin(t * Math.PI * 6) * 0.006 * sink;

    vm.position.set(bp.x + wobble, bp.y - sinkY, bp.z);
    vm.rotation.set(br.x + tilt, br.y, br.z + rollZ);

    const mag = vm.userData.magazineGroup;
    if (!mag) return;

    if (!mag.userData._basePos) {
        mag.userData._basePos = {
            x: mag.position.x,
            y: mag.position.y,
            z: mag.position.z
        };
    }
    const mb = mag.userData._basePos;

    let oy = 0;
    let oz = 0;

    if (t < 0.12) {
        oy = 0; oz = 0;
    } else if (t < 0.30) {
        const mt = (t - 0.12) / 0.18;
        const e = 1 - Math.pow(1 - mt, 2);
        oy =  0.14 * e;
        oz =  0.03 * e;
    } else if (t < 0.50) {
        const mt = (t - 0.30) / 0.20;
        const e = mt * mt;
        oy =  0.14 - 0.75 * e;
        oz =  0.03 - 0.05 * e;
    } else if (t < 0.65) {
        oy = -0.61;
        oz = -0.02;
    } else if (t < 0.85) {
        const mt = (t - 0.65) / 0.20;
        const e = 1 - Math.pow(1 - mt, 2);
        oy = -0.61 + 0.65 * e;
        oz = -0.02 * (1 - e);
    } else {
        const mt = (t - 0.85) / 0.15;
        const e = 1 - Math.pow(1 - mt, 2);
        oy = 0.04 * (1 - e);
        oz = 0;
    }

    mag.position.set(mb.x, mb.y + oy, mb.z + oz);
}

// ============================================================
// 第一人称视图模型动画
// ============================================================
function updateSniperViewmodel(p, dt, now) {
    if (p !== p1) return;
    if (!p.vm || p.vm.children.length === 0) return;
    const vm = p.vm.children[0];
    if (!vm.userData.basePos || !vm.userData.baseRot) return;
    const w = p.weapon;

    if (w && w.key === 'rifle' && vm.userData.magazineGroup
        && p.reloadEnd > now
        && !p.isMelee && !p.isSmoke && !p.isFlash) {
        updateRifleReloadAnim(vm, p, now);
        return;
    }

    if (w && vm.userData.adsPos
        && (w.key === 'rifle' || w.key === 'odin')
        && !p.isMelee && !p.isSmoke && !p.isFlash) {
        const adsOn = !!p.aiming;
        const targetPos = adsOn ? vm.userData.adsPos : vm.userData.basePos;
        const targetRot = adsOn ? vm.userData.adsRot : vm.userData.baseRot;
        const speed = adsOn ? 20 : 12;
        const k = Math.min(1, dt * speed);

        vm.position.x += (targetPos.x - vm.position.x) * k;
        vm.position.y += (targetPos.y - vm.position.y) * k;
        vm.position.z += (targetPos.z - vm.position.z) * k;
        vm.rotation.x += (targetRot.x - vm.rotation.x) * k;
        vm.rotation.y += (targetRot.y - vm.rotation.y) * k;
        vm.rotation.z += (targetRot.z - vm.rotation.z) * k;

        return;
    }

    if (w && w.key === 'sniper' && vm.userData.adsPos
        && !p.isMelee && !p.isSmoke && !p.isFlash
        && p.aiming) {
        const targetPos = vm.userData.adsPos;
        const targetRot = vm.userData.adsRot;
        const speed = 14;
        const k = Math.min(1, dt * speed);

        vm.position.x += (targetPos.x - vm.position.x) * k;
        vm.position.y += (targetPos.y - vm.position.y) * k;
        vm.position.z += (targetPos.z - vm.position.z) * k;
        vm.rotation.x += (targetRot.x - vm.rotation.x) * k;
        vm.rotation.y += (targetRot.y - vm.rotation.y) * k;
        vm.rotation.z += (targetRot.z - vm.rotation.z) * k;

        if (p.boltEnd > now && w.boltMs && vm.userData.boltGroup) {
            const progress = 1 - (p.boltEnd - now) / w.boltMs;
            let pull;
            if (progress < 0.30) {
                const t = progress / 0.30;
                pull = t * t;
            } else if (progress < 0.55) {
                pull = 1.0;
            } else {
                const t = (progress - 0.55) / 0.45;
                pull = 1 - t * t;
            }
            pull = Math.max(0, Math.min(1, pull));
            vm.userData.boltGroup.position.x = -pull * 0.18;
        } else if (vm.userData.boltGroup) {
            vm.userData.boltGroup.position.x *= Math.max(0, 1 - dt * 20);
        }

        return;
    }

    if (p.isMelee && p.meleeEnd > now) {
        const fireMs = p.meleeIsHeavy ? MELEE.heavyFireMs : MELEE.lightFireMs;
        const progress = 1 - (p.meleeEnd - now) / fireMs;
        const bp = vm.userData.basePos;
        const br = vm.userData.baseRot;

        if (p.meleeIsHeavy) {
            let phase, t;
            if (progress < 0.35) { phase = 'wind';   t = progress / 0.35; }
            else if (progress < 0.55) { phase = 'thrust'; t = (progress - 0.35) / 0.20; }
            else { phase = 'recover'; t = (progress - 0.55) / 0.45; }
            if (phase === 'wind') {
                const e = t * t;
                vm.position.set(bp.x + e * 0.16, bp.y + e * 0.12, bp.z + e * 0.18);
                vm.rotation.set(br.x + e * 0.10, br.y - e * 0.60, br.z + e * 0.55);
            } else if (phase === 'thrust') {
                const e = 1 - Math.pow(1 - t, 2.5);
                vm.position.set(bp.x + 0.16 - e * 0.22, bp.y + 0.12 - e * 0.18, bp.z + 0.18 - e * 0.88);
                vm.rotation.set(br.x + 0.10 - e * 0.08, br.y - 0.60 + e * 0.75, br.z + 0.55 - e * 0.70);
            } else {
                const e = 1 - t;
                vm.position.set(bp.x - 0.06 * e, bp.y - 0.06 * e, bp.z - 0.70 * e);
                vm.rotation.set(br.x + 0.02 * e, br.y + 0.15 * e, br.z - 0.15 * e);
            }
            return;
        }

        let phase, t;
        if (progress < 0.25) { phase = 'wind';   t = progress / 0.25; }
        else if (progress < 0.55) { phase = 'swing';  t = (progress - 0.25) / 0.30; }
        else { phase = 'recover'; t = (progress - 0.55) / 0.45; }
        if (phase === 'wind') {
            const e = t * t;
            vm.position.set(bp.x + e * 0.22, bp.y + e * 0.10, bp.z + e * 0.10);
            vm.rotation.set(br.x + e * 0.18, br.y - e * 0.45, br.z + e * 0.45);
        } else if (phase === 'swing') {
            const e = 1 - Math.pow(1 - t, 2.2);
            vm.position.set(bp.x + 0.22 - e * 0.72, bp.y + 0.10 - e * 0.20, bp.z + 0.10 - e * 0.28);
            vm.rotation.set(br.x + 0.18 - e * 0.22, br.y - 0.45 + e * 1.55, br.z + 0.45 - e * 1.15);
        } else {
            const e = 1 - t;
            vm.position.set(bp.x - 0.50 * e, bp.y - 0.10 * e, bp.z - 0.18 * e);
            vm.rotation.set(br.x - 0.04 * e, br.y + 1.10 * e, br.z - 0.70 * e);
        }
        return;
    }

    if (p.isSmoke || p.isFlash) {
        const t = now * 0.003;
        vm.position.set(vm.userData.basePos.x + Math.sin(t) * 0.005,
                        vm.userData.basePos.y + Math.sin(t * 1.3) * 0.008,
                        vm.userData.basePos.z);
        vm.rotation.set(vm.userData.baseRot.x + Math.sin(t * 0.7) * 0.03,
                        vm.userData.baseRot.y + Math.sin(t) * 0.04,
                        vm.userData.baseRot.z);
        return;
    }

    if (w.key === 'sniper' && w.boltMs && p.boltEnd > now) {
        const progress = 1 - (p.boltEnd - now) / w.boltMs;

        let pull;
        if (progress < 0.30) {
            const t = progress / 0.30;
            pull = t * t;
        } else if (progress < 0.55) {
            pull = 1.0;
        } else {
            const t = (progress - 0.55) / 0.45;
            pull = 1 - t * t;
        }
        pull = Math.max(0, Math.min(1, pull));

        const boltGroup = vm.userData.boltGroup;
        if (boltGroup) {
            boltGroup.position.x = -pull * 0.18;
        }

        const recoil = computeSniperRecoil(p, now);

        _rcRecoilPos.copy(vm.userData.basePos);
        _rcRecoilPos.y += recoil * 0.16;
        _rcRecoilPos.z += recoil * 0.13;

        _rcRecoilRot.copy(vm.userData.baseRot);
        _rcRecoilRot.z += recoil * 0.45;

        const k = Math.min(1, dt * 16);
        vm.position.x += (_rcRecoilPos.x - vm.position.x) * k;
        vm.position.y += (_rcRecoilPos.y - vm.position.y) * k;
        vm.position.z += (_rcRecoilPos.z - vm.position.z) * k;
        vm.rotation.x += (_rcRecoilRot.x - vm.rotation.x) * k;
        vm.rotation.y += (_rcRecoilRot.y - vm.rotation.y) * k;
        vm.rotation.z += (_rcRecoilRot.z - vm.rotation.z) * k;

        return;
    }

    const k = Math.min(1, dt * 15);
    vm.position.lerp(vm.userData.basePos, k);
    vm.rotation.x += (vm.userData.baseRot.x - vm.rotation.x) * k;
    vm.rotation.y += (vm.userData.baseRot.y - vm.rotation.y) * k;
    vm.rotation.z += (vm.userData.baseRot.z - vm.rotation.z) * k;

    if (w.key === 'sniper' && vm.userData.boltGroup) {
        vm.userData.boltGroup.position.x *= Math.max(0, 1 - dt * 20);
    }
}

// ============================================================
// ★★★ 第三人称动画 ★★★
// ============================================================
function updateThirdPersonWeapon(p, dt, now) {
    if (!p.gunHolder) return;
    const gh = p.gunHolder;

    if (!gh.userData.basePos) {
        gh.userData.basePos = gh.position.clone();
        gh.userData.baseRot = gh.rotation.clone();
    }
    const bp = gh.userData.basePos;
    const br = gh.userData.baseRot;

    const k = Math.min(1, dt * 14);

    const gun = gh.children.length > 0 ? gh.children[0] : null;

    if (gun && gun.userData && gun.userData.boltGroup) {
        if (p.weapon && p.weapon.key === 'sniper' && p.weapon.boltMs && p.boltEnd > now) {
            const progress = 1 - (p.boltEnd - now) / p.weapon.boltMs;
            let pull;
            if (progress < 0.30) {
                const t = progress / 0.30;
                pull = t * t;
            } else if (progress < 0.55) {
                pull = 1.0;
            } else {
                const t = (progress - 0.55) / 0.45;
                pull = 1 - t * t;
            }
            pull = Math.max(0, Math.min(1, pull));
            gun.userData.boltGroup.position.x = -pull * 0.18;
        } else {
            gun.userData.boltGroup.position.x *= Math.max(0, 1 - dt * 20);
        }
    }

    if (p.isMelee && p.meleeEnd > now) {
        const fireMs = p.meleeIsHeavy ? MELEE.heavyFireMs : MELEE.lightFireMs;
        const t = 1 - (p.meleeEnd - now) / fireMs;

        if (p.meleeIsHeavy) {
            let phase, tt;
            if (t < 0.35) { phase = 'wind'; tt = t / 0.35; }
            else if (t < 0.55) { phase = 'thrust'; tt = (t - 0.35) / 0.20; }
            else { phase = 'recover'; tt = (t - 0.55) / 0.45; }
            if (phase === 'wind') {
                const e = tt * tt;
                gh.position.set(bp.x + e * 0.10, bp.y + e * 0.15, bp.z + e * 0.20);
                gh.rotation.set(br.x - e * 0.30, br.y - e * 0.60, br.z + e * 0.50);
            } else if (phase === 'thrust') {
                const e = 1 - Math.pow(1 - tt, 2.5);
                gh.position.set(bp.x + 0.10 - e * 0.05, bp.y + 0.15 - e * 0.20, bp.z + 0.20 - e * 0.95);
                gh.rotation.set(br.x - 0.30 + e * 0.20, br.y - 0.60 + e * 0.70, br.z + 0.50 - e * 0.60);
            } else {
                const e = 1 - tt;
                gh.position.set(bp.x + 0.05 * e, bp.y - 0.05 * e, bp.z - 0.75 * e);
                gh.rotation.set(br.x - 0.10 * e, br.y + 0.10 * e, br.z - 0.10 * e);
            }
        } else {
            let phase, tt;
            if (t < 0.25) { phase = 'wind'; tt = t / 0.25; }
            else if (t < 0.55) { phase = 'swing'; tt = (t - 0.25) / 0.30; }
            else { phase = 'recover'; tt = (t - 0.55) / 0.45; }
            if (phase === 'wind') {
                const e = tt * tt;
                gh.position.set(bp.x + e * 0.20, bp.y + e * 0.08, bp.z + e * 0.10);
                gh.rotation.set(br.x - e * 0.20, br.y - e * 0.30, br.z + e * 0.30);
            } else if (phase === 'swing') {
                const e = 1 - Math.pow(1 - tt, 2.2);
                gh.position.set(bp.x + 0.20 - e * 0.65, bp.y + 0.08 - e * 0.15, bp.z + 0.10 - e * 0.25);
                gh.rotation.set(br.x - 0.20 + e * 0.30, br.y - 0.30 + e * 1.20, br.z + 0.30 - e * 1.00);
            } else {
                const e = 1 - tt;
                gh.position.set(bp.x - 0.45 * e, bp.y - 0.07 * e, bp.z - 0.15 * e);
                gh.rotation.set(br.x + 0.10 * e, br.y + 0.90 * e, br.z - 0.70 * e);
            }
        }
        return;
    }

    if (p.reloadEnd > now && !p.isMelee && !p.isSmoke && !p.isFlash) {
        const w = p.weapon;
        const total = w.reloadMs || 2000;
        const t = 1 - (p.reloadEnd - now) / total;

        let sink = 0;
        if (t < 0.10) sink = t / 0.10;
        else if (t < 0.90) sink = 1;
        else sink = 1 - (t - 0.90) / 0.10;

        const tilt   = sink * 0.22;
        const sinkY  = sink * 0.10;
        const rollZ  = sink * 0.22;
        const wobble = Math.sin(t * Math.PI * 6) * 0.02 * sink;

        gh.position.set(bp.x + wobble, bp.y - sinkY, bp.z);
        gh.rotation.set(br.x + tilt, br.y, br.z + rollZ);

        if (gun && gun.userData && gun.userData.magazineGroup) {
            const mag = gun.userData.magazineGroup;

            if (!mag.userData._basePos) {
                mag.userData._basePos = {
                    x: mag.position.x,
                    y: mag.position.y,
                    z: mag.position.z
                };
            }
            const mb = mag.userData._basePos;

            let oy = 0;
            let oz = 0;

            if (t < 0.12) {
                oy = 0; oz = 0;
            } else if (t < 0.30) {
                const mt = (t - 0.12) / 0.18;
                const e = 1 - Math.pow(1 - mt, 2);
                oy =  0.14 * e;
                oz =  0.03 * e;
            } else if (t < 0.50) {
                const mt = (t - 0.30) / 0.20;
                const e = mt * mt;
                oy =  0.14 - 0.75 * e;
                oz =  0.03 - 0.05 * e;
            } else if (t < 0.65) {
                oy = -0.61;
                oz = -0.02;
            } else if (t < 0.85) {
                const mt = (t - 0.65) / 0.20;
                const e = 1 - Math.pow(1 - mt, 2);
                oy = -0.61 + 0.65 * e;
                oz = -0.02 * (1 - e);
            } else {
                const mt = (t - 0.85) / 0.15;
                const e = 1 - Math.pow(1 - mt, 2);
                oy = 0.04 * (1 - e);
                oz = 0;
            }

            mag.position.set(mb.x, mb.y + oy, mb.z + oz);
        }

        return;
    }

    if (p.boltEnd > now && p.weapon && p.weapon.boltMs && p.weapon.key !== 'sniper') {
        const total = p.weapon.boltMs;
        const t = 1 - (p.boltEnd - now) / total;
        const pull = Math.sin(t * Math.PI);
        gh.position.set(bp.x, bp.y - pull * 0.06, bp.z + pull * 0.18);
        gh.rotation.set(br.x + pull * 0.35, br.y + pull * 0.15, br.z);
        return;
    }

    gh.position.lerp(bp, k);
    gh.rotation.x += (br.x + p.pitch - gh.rotation.x) * k;
    gh.rotation.y += (br.y - gh.rotation.y) * k;
    gh.rotation.z += (br.z - gh.rotation.z) * k;
}
window.updateThirdPersonWeapon = updateThirdPersonWeapon;