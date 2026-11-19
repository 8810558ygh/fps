// ===== js/lan/lan_survival.js – 局域网合作生存 =====

(function () {
    'use strict';

    const MAPS = ['battlefield', 'desert', 'indoor_complex'];
    const PORTAL_RADIUS = 4.0;
    const REVIVE_MS = 5000;
    const REVIVE_RANGE = 1.8;

    const S = {
        active: false,
        phase: 'idle',
        wave: 0,
        mapIndex: 0,
        mapId: 'battlefield',
        isHost: false,
        playersPlaced: false,
        waveQueue: [],
        nextSpawnAt: 0,
        lastZombieSnapshotAt: 0,
        lastWaveClearSent: -1,
        hostWaveStarted: -1,
        zombieCounter: 0,
        portalReady: new Set(),
        portalRequired: [],
        rescueTargetId: null,
        rescueStartedAt: 0,
        rescueSentFor: null,
        healTargetId: null,
        healStart: 0,
        healEnd: 0,
        healLockX: null,
        healLockZ: null,
        lastHealCancelReason: '',
        summaryTimer: 0,
        promptEl: null,
        rescueEl: null,
        portalEl: null,
    };

    function isSurvivalContext() {
        return typeof gameMode !== 'undefined'
            && gameMode === 'lan'
            && typeof LAN !== 'undefined'
            && LAN.mode === 'survival'
            && S.active;
    }
    window.IS_SURVIVAL_CONTEXT = isSurvivalContext;

    function ownState() {
        return LAN.playerStates.get(LAN.selfId);
    }

    function survivalPlayers() {
        const players = [];
        if (typeof p1 !== 'undefined' && p1) players.push(p1);
        if (typeof LAN_foreachRemote === 'function') {
            LAN_foreachRemote(remote => {
                if (remote && remote.baseVisible) players.push(remote);
            });
        }
        return players;
    }

    function ensureUi() {
        if (!S.promptEl) {
            S.promptEl = document.createElement('div');
            S.promptEl.id = 'lanSurvivalPrompt';
            S.promptEl.className = 'lan-survival-prompt';
            document.body.appendChild(S.promptEl);
        }
        if (!S.rescueEl) {
            S.rescueEl = document.createElement('div');
            S.rescueEl.id = 'lanRescueProgress';
            S.rescueEl.className = 'lan-rescue-progress';
            S.rescueEl.innerHTML = `
                <div class="lan-rescue-title"></div>
                <div class="lan-rescue-track"><span></span></div>
                <div class="lan-rescue-time"></div>
            `;
            document.body.appendChild(S.rescueEl);
        }
        if (!S.portalEl) {
            S.portalEl = document.createElement('div');
            S.portalEl.id = 'lanPortalStatus';
            S.portalEl.className = 'lan-portal-status';
            document.body.appendChild(S.portalEl);
        }
    }

    function setPrompt(text) {
        ensureUi();
        if (!S.promptEl) return;
        S.promptEl.textContent = text || '';
        S.promptEl.style.display = text ? 'block' : 'none';
    }

    function showRescue(target, progress) {
        ensureUi();
        if (!S.rescueEl) return;
        const title = S.rescueEl.querySelector('.lan-rescue-title');
        const fill = S.rescueEl.querySelector('.lan-rescue-track span');
        const time = S.rescueEl.querySelector('.lan-rescue-time');
        if (title) title.textContent = `救援 ${target.name || '队友'}`;
        if (fill) fill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
        if (time) time.textContent = `${Math.max(0, 5 - progress * 5).toFixed(1)}s`;
        S.rescueEl.style.display = 'block';
    }

    function hideRescue() {
        if (S.rescueEl) S.rescueEl.style.display = 'none';
    }

    function updatePortalStatus(text) {
        ensureUi();
        if (!S.portalEl) return;
        S.portalEl.textContent = text || '';
        S.portalEl.style.display = text ? 'block' : 'none';
    }

    function setPlayerAliveState(player, alive, downed, hp, armor) {
        if (!player) return;
        player.downed = !!downed;
        if (player === p1) {
            p1.hp = Number.isFinite(hp) ? hp : p1.hp;
            p1.armor = Number.isFinite(armor) ? armor : p1.armor;
            p1.deadUntil = 0;
            p1.baseVisible = !!alive;
            if (downed) {
                p1.aiming = false;
                p1.aimStage = 0;
                if (p1.input) {
                    p1.input.fire = false;
                    p1.input.aim = false;
                    p1.input.forward = 0;
                    p1.input.right = 0;
                }
            }
            return;
        }
        player.baseVisible = !!alive || !!downed;
        player.deadUntil = alive ? 0 : Infinity;
        if (Number.isFinite(hp)) player.hp = hp;
        if (Number.isFinite(armor)) player.armor = armor;
        player.mesh.visible = player.baseVisible;
        applyRemoteDownedPose(player);
    }

    function applyRemoteDownedPose(player) {
        if (!player || !player.mesh) return;
        if (player.downed) {
            player.mesh.visible = true;
            player.mesh.rotation.x = -Math.PI / 2;
            player.mesh.rotation.z = 0.08;
            player.mesh.position.y = player.pos.y + 0.24;
            if (player.gunHolder) player.gunHolder.visible = false;
        } else {
            player.mesh.rotation.x = 0;
            player.mesh.rotation.z = 0;
            player.mesh.position.y = player.pos.y;
            if (player.gunHolder) player.gunHolder.visible = true;
        }
    }

    function placePlayers(players) {
        if (!Array.isArray(players)) return;
        for (const state of players) {
            if (state.id === LAN.selfId) {
                const spawn = _lanGetSpawn('blue', state.spawnSlot || 0);
                p1.pos.set(spawn.x, terrainGroundAt(spawn.x, spawn.z), spawn.z);
                p1.yaw = spawn.yaw;
                p1.baseVisible = true;
                p1.deadUntil = 0;
                p1.downed = false;
                p1.cam.position.set(p1.pos.x, p1.pos.y + p1.eyeH, p1.pos.z);
                p1.cam.rotation.y = p1.yaw;
                p1.cam.rotation.x = p1.pitch;
            } else {
                const remote = _lanEnsureRemote(state);
                const spawn = _lanGetSpawn('blue', state.spawnSlot || 0);
                remote.pos.set(spawn.x, terrainGroundAt(spawn.x, spawn.z), spawn.z);
                remote.yaw = spawn.yaw;
                remote._netTargetPos.copy(remote.pos);
                remote._netTargetYaw = spawn.yaw;
                remote.baseVisible = true;
                remote.mesh.position.copy(remote.pos);
                remote.mesh.rotation.y = spawn.yaw;
            }
        }
        S.playersPlaced = true;
    }

    function begin(mapId) {
        S.active = true;
        S.phase = 'prep';
        S.wave = 0;
        S.mapId = mapId || LAN.mapId || 'battlefield';
        S.mapIndex = Math.max(0, MAPS.indexOf(S.mapId));
        S.isHost = !!(LAN.room && LAN.room.ownerId === LAN.selfId);
        S.playersPlaced = false;
        S.waveQueue = [];
        S.nextSpawnAt = 0;
        S.lastZombieSnapshotAt = 0;
        S.lastWaveClearSent = -1;
        S.hostWaveStarted = -1;
        S.portalReady.clear();
        S.portalRequired = [];
        S.summaryTimer = 0;

        SurvivalState.active = true;
        SurvivalState.phase = 'prep';
        SurvivalState.wave = 0;
        SurvivalState.mapIndex = S.mapIndex;
        SurvivalState.coins = 0;
        SurvivalState.unlockedWeapons = ['rifle'];
        SurvivalState.waveQueue = [];
        SurvivalState.nextSpawnAt = 0;
        SurvivalState.endlessMode = false;
        SurvivalState.endlessLoop = 0;
        if (typeof SurvivalStats !== 'undefined') SurvivalStats.reset();
        if (typeof clearAllZombies === 'function') clearAllZombies();
        if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
        ensureUi();
        hideRescue();
        updatePortalStatus('');
        placePlayers(Array.from(LAN.playerStates.values()));
    }

    function applyState(msg) {
        S.phase = msg.phase || S.phase;
        S.wave = Number(msg.wave) || 0;
        S.mapIndex = Number(msg.mapIndex) || 0;
        S.mapId = msg.mapId || S.mapId;
        S.portalReady = new Set(Array.isArray(msg.portalReady) ? msg.portalReady : []);
        S.portalRequired = Array.isArray(msg.portalRequired) ? msg.portalRequired : [];

        SurvivalState.active = true;
        SurvivalState.phase = S.phase;
        SurvivalState.wave = S.wave;
        SurvivalState.mapIndex = S.mapIndex;
        SurvivalState.prepEndTime = performance.now() + Math.max(0, Number(msg.phaseRemain) || 0);
        gameState = S.phase === 'wave' ? 'combat'
            : (['prep', 'portal', 'mapLoading'].includes(S.phase) ? 'prep' : gameState);
        roundNumber = S.wave;
        if (S.phase !== 'wave' && typeof clearAllZombies === 'function') {
            clearAllZombies();
            S.waveQueue = [];
            SurvivalState.waveQueue = [];
        }
        if (S.phase === 'portal' && typeof spawnSurvivalPortal === 'function') {
            spawnSurvivalPortal();
        } else if (S.phase !== 'portal' && typeof despawnSurvivalPortal === 'function') {
            despawnSurvivalPortal();
        }
        if (S.phase === 'wave' && S.isHost && S.hostWaveStarted !== S.wave) {
            startHostWave(S.wave);
        }
        if (S.phase !== 'portal') updatePortalStatus('');
    }

    function handleSnapshot(msg) {
        if (!isSurvivalContext()) return;
        const players = Array.isArray(msg.players) ? msg.players : [];
        for (const state of players) {
            LAN.playerStates.set(state.id, state);
            if (state.id === LAN.selfId) _lanSyncSelf(state, players);
            else _lanSyncRemote(state);
            const player = state.id === LAN.selfId ? p1 : LAN.models.get(state.id);
            setPlayerAliveState(player, state.alive, state.downed, state.hp, state.armor);
        }
        if (!S.playersPlaced) placePlayers(players);

        const liveIds = new Set(players.map(player => player.id));
        for (const [id, player] of LAN.models) {
            if (liveIds.has(id)) continue;
            _lanDisposeRemote(player);
            LAN.models.delete(id);
            LAN.playerStates.delete(id);
        }

        LAN.phase = msg.phase;
        LAN.round = msg.round || LAN.round;
        stateEndTime = performance.now() + Math.max(0, Number(msg.phaseRemain) || 0);
        if (typeof _lanUpdateHUD === 'function' && LAN.mode !== 'survival') _lanUpdateHUD(msg);
    }

    function scaledWaveComposition(wave) {
        const base = (typeof buildWaveComposition === 'function')
            ? buildWaveComposition(wave, 0)
            : Array.from({ length: 3 + wave * 2 }, () => 'normal');
        const extraPlayers = Math.max(0, survivalPlayers().length - 1);
        const extra = Math.round(base.length * 0.22 * extraPlayers);
        for (let i = 0; i < extra; i++) base.push('normal');
        return base;
    }

    function startHostWave(wave) {
        S.hostWaveStarted = wave;
        S.waveQueue = scaledWaveComposition(wave);
        SurvivalState.wave = wave;
        SurvivalState.phase = 'wave';
        SurvivalState.waveQueue = S.waveQueue;
        SurvivalState.nextSpawnAt = performance.now() + 500;
        SurvivalState.MAX_ALIVE_ZOMBIES = Math.min(
            32,
            12 + Math.max(1, survivalPlayers().length) * 2
        );
        S.lastWaveClearSent = -1;
    }

    function spawnAroundPlayer(type) {
        const players = survivalPlayers().filter(player => player.hp > 0 && !player.downed);
        const target = players[Math.floor(Math.random() * players.length)] || p1;
        if (typeof window.findIndoorSurvivalSpawn === 'function'
            && getCurrentMapId() === 'indoor_complex') {
            const spot = window.findIndoorSurvivalSpawn();
            if (spot) {
                const zombie = spawnZombie(spot.x, spot.z, S.wave, type);
                if (zombie) {
                    zombie._indoorRoute = spot.route;
                    zombie._indoorRouteIndex = 0;
                }
                return zombie;
            }
        }
        const half = typeof window.currentArenaHalf === 'number' ? window.currentArenaHalf : ARENA;
        const limit = half - 3;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 15;
        const x = Math.max(-limit, Math.min(limit, target.pos.x + Math.cos(angle) * distance));
        const z = Math.max(-limit, Math.min(limit, target.pos.z + Math.sin(angle) * distance));
        return spawnZombie(x, z, S.wave, type);
    }

    function sendZombieSnapshot(now) {
        if (!S.isHost || now - S.lastZombieSnapshotAt < 80) return;
        S.lastZombieSnapshotAt = now;
        const zombies = [];
        for (const zombie of getAllZombies()) {
            if (!zombie.alive) continue;
            if (!zombie.netId) zombie.netId = `z${++S.zombieCounter}`;
            zombies.push({
                netId: zombie.netId,
                type: zombie.type,
                hp: zombie.hp,
                maxHp: zombie.maxHp,
                x: zombie.pos.x,
                y: zombie.pos.y,
                z: zombie.pos.z,
                yaw: zombie.yaw,
            });
        }
        LANNET.send({
            type: 'survivalSnapshot',
            zombies,
            queueRemaining: S.waveQueue.length,
        });
    }

    function applyZombieSnapshots(list) {
        const incoming = new Map((list || []).map(item => [item.netId, item]));
        const active = new Map();
        for (const zombie of getAllZombies()) {
            if (!zombie.alive || !zombie.netId) continue;
            active.set(zombie.netId, zombie);
        }

        for (const [netId, item] of incoming) {
            let zombie = active.get(netId);
            if (!zombie) {
                zombie = spawnZombie(item.x, item.z, S.wave, item.type);
                if (!zombie) continue;
                zombie.netId = netId;
                zombie.pos.set(item.x, item.y, item.z);
                zombie._netTargetPos = new THREE.Vector3(item.x, item.y, item.z);
                zombie.mesh.position.copy(zombie.pos);
            }
            if (!zombie._netTargetPos) zombie._netTargetPos = new THREE.Vector3();
            zombie.hp = item.hp;
            zombie.maxHp = item.maxHp;
            zombie._netTargetPos.set(item.x, item.y, item.z);
            zombie._netTargetYaw = item.yaw;
            active.set(netId, zombie);
        }

        for (const [netId, zombie] of active) {
            if (incoming.has(netId)) continue;
            zombie.alive = false;
            zombie.hp = 0;
            zombie.mesh.visible = false;
        }
    }

    function updateClientZombies(dt, now) {
        for (const zombie of getAllZombies()) {
            if (!zombie.alive || !zombie._netTargetPos) continue;
            const k = Math.min(1, dt * 12);
            zombie.pos.lerp(zombie._netTargetPos, k);
            const targetYaw = Number(zombie._netTargetYaw) || zombie.yaw;
            let diff = targetYaw - zombie.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            zombie.yaw += diff * Math.min(1, dt * 10);
            zombie.mesh.position.copy(zombie.pos);
            zombie.mesh.rotation.y = zombie.yaw;
            if (typeof _updateZombieAnimation === 'function') {
                _updateZombieAnimation(
                    zombie, dt, now,
                    (typeof ZOMBIE_TYPES !== 'undefined' && ZOMBIE_TYPES[zombie.type])
                        || { speedMul: 0.8 }
                );
            }
        }
    }

    function hostTick(dt, now) {
        if (S.phase !== 'wave') return;
        if (typeof updateAllZombies === 'function') updateAllZombies(dt, now);

        let alive = getZombiesAliveCount();
        if (S.waveQueue.length > 0
            && alive < SurvivalState.MAX_ALIVE_ZOMBIES
            && now >= S.nextSpawnAt) {
            const type = S.waveQueue.shift();
            const zombie = spawnAroundPlayer(type);
            if (zombie) zombie.netId = `z${++S.zombieCounter}`;
            S.nextSpawnAt = now + 650;
            alive = getZombiesAliveCount();
        }

        sendZombieSnapshot(now);
        if (S.waveQueue.length === 0 && alive === 0
            && S.lastWaveClearSent !== S.wave) {
            S.lastWaveClearSent = S.wave;
            LANNET.send({ type: 'survivalWaveClear', wave: S.wave });
        }
    }

    function nearestDownedTeammate() {
        let best = null;
        let bestDistance = Infinity;
        if (typeof LAN_foreachRemote !== 'function') return null;
        LAN_foreachRemote(remote => {
            const state = LAN.playerStates.get(remote.netId);
            if (!state?.downed || !remote.baseVisible) return;
            const distance = Math.hypot(remote.pos.x - p1.pos.x, remote.pos.z - p1.pos.z);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = remote;
            }
        });
        return bestDistance <= REVIVE_RANGE ? best : null;
    }

    function updateRescue(dt, now) {
        const self = ownState();
        if (!self?.alive || self.downed || p1.downed
            || p1.healing || p1.healingTeammate || p1.beingHealed) {
            S.rescueTargetId = null;
            S.rescueStartedAt = 0;
            hideRescue();
            setPrompt('');
            return;
        }
        const target = nearestDownedTeammate();
        if (!target) {
            S.rescueTargetId = null;
            S.rescueStartedAt = 0;
            hideRescue();
            return;
        }
        const holding = !!(typeof keys !== 'undefined' && keys.KeyE);
        if (!holding) {
            S.rescueTargetId = target.netId;
            S.rescueStartedAt = 0;
            hideRescue();
            setPrompt(`按住 E 救援 ${target.name || '队友'}（5 秒）`);
            return;
        }
        setPrompt('');
        if (S.rescueTargetId !== target.netId) {
            S.rescueTargetId = target.netId;
            S.rescueStartedAt = now;
            S.rescueSentFor = null;
        }
        const progress = Math.min(1, (now - S.rescueStartedAt) / REVIVE_MS);
        showRescue(target, progress);
        if (progress >= 1 && S.rescueSentFor !== target.netId) {
            S.rescueSentFor = target.netId;
            LANNET.send({ type: 'survivalRevive', targetId: target.netId });
        }
    }

    function clearRemoteHealState(player) {
        if (!player) return;
        player.healingTeammate = false;
        player.beingHealed = false;
    }

    function clearLocalTeammateHeal(notifyServer = true) {
        if (notifyServer && S.healTargetId && LANNET.connected) {
            LANNET.send({ type: 'survivalHealCancel' });
        }
        S.healTargetId = null;
        S.healStart = 0;
        S.healEnd = 0;
        S.healLockX = null;
        S.healLockZ = null;
        p1.healingTeammate = false;
    }

    function teammateUnderCrosshair() {
        const origin = p1.cam.getWorldPosition(new THREE.Vector3());
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(p1.cam.quaternion).normalize();
        const raycaster = new THREE.Raycaster(origin, direction, 0.01, 3.0);
        const meshToPlayer = new Map();
        const meshes = typeof prepareShotTargets === 'function'
            ? prepareShotTargets().slice()
            : [];
        LAN_foreachRemote(remote => {
            const state = LAN.playerStates.get(remote.netId);
            if (!state?.alive || state.downed) return;
            if (Math.hypot(remote.pos.x - p1.pos.x, remote.pos.z - p1.pos.z) > 3.2) return;
            for (const mesh of getPlayerHitMeshes(remote)) {
                if (!mesh) continue;
                meshToPlayer.set(mesh, remote);
                meshes.push(mesh);
            }
        });
        const hits = raycaster.intersectObjects(meshes, false);
        for (const hit of hits) {
            const player = meshToPlayer.get(hit.object);
            if (player) return player;
            return null;
        }
        return null;
    }

    function preUpdate(now) {
        if (!isSurvivalContext()) return;
        if (p1.healingTeammate) {
            const target = S.healTargetId ? LAN.models.get(S.healTargetId) : null;
            const state = target ? LAN.playerStates.get(target.netId) : null;
            const distance = target
                ? Math.hypot(target.pos.x - p1.pos.x, target.pos.z - p1.pos.z)
                : Infinity;
            if (!mouse.rightDown || !p1.isMedkit || p1.downed
                || !state?.alive || state.downed || distance > 3.2) {
                clearLocalTeammateHeal(true);
                setPrompt('');
            } else {
                p1.input.forward = 0;
                p1.input.right = 0;
                p1.input.jump = false;
            }
            return;
        }
        if (!mouse.rightDown || !p1.isMedkit || p1.downed
            || p1.healing || p1.beingHealed || gameState !== 'combat') {
            setPrompt('');
            return;
        }
        if ((p1.medkits || 0) <= 0) {
            setPrompt('没有医疗包了');
            return;
        }
        const target = teammateUnderCrosshair();
        if (!target) {
            setPrompt('右键瞄准身边队友进行治疗');
            return;
        }
        const state = LAN.playerStates.get(target.netId);
        const maxHp = Math.max(100, Number(state?.maxHp) || p1.maxHp || 100);
        if (!state || state.hp >= maxHp) {
            setPrompt('队友血量已满');
            return;
        }
        if (target.beingHealed || state.healing || state.beingHealed) {
            setPrompt('该队友正在接受治疗');
            return;
        }
        S.healTargetId = target.netId;
        S.healStart = now;
        S.healEnd = now + MEDKIT.useTimeMs;
        S.healLockX = p1.pos.x;
        S.healLockZ = p1.pos.z;
        p1.healingTeammate = true;
        p1.healingTargetId = target.netId;
        p1.healStart = S.healStart;
        p1.healEnd = S.healEnd;
        p1.input.fire = false;
        p1.input.forward = 0;
        p1.input.right = 0;
        p1.input.jump = false;
        setPrompt('');
        LANNET.send({ type: 'survivalHealStart', targetId: target.netId });
    }

    function portalCenter() {
        return { x: 0, z: S.mapId === 'indoor_complex' ? -9.5 : 0 };
    }

    function updatePortalInteraction() {
        if (S.phase !== 'portal') {
            updatePortalStatus('');
            return;
        }
        const ready = S.portalReady.size;
        const total = Math.max(S.portalRequired.length, ready);
        if (ready >= total && total > 0) {
            updatePortalStatus('全队已就位');
            return;
        }
        const center = portalCenter();
        const near = Math.hypot(p1.pos.x - center.x, p1.pos.z - center.z) <= PORTAL_RADIUS;
        const selfReady = S.portalReady.has(LAN.selfId);
        if (!near || selfReady) {
            updatePortalStatus(`传送门已就位 ${ready} / ${total}`);
            return;
        }
        updatePortalStatus(`传送门已就位 ${ready} / ${total} · 靠近后按 F 确认`);
    }

    function tryPortalConfirm() {
        if (!isSurvivalContext() || S.phase !== 'portal' || S.portalReady.has(LAN.selfId)) return false;
        const center = portalCenter();
        if (Math.hypot(p1.pos.x - center.x, p1.pos.z - center.z) > PORTAL_RADIUS) return false;
        LANNET.send({ type: 'survivalPortalReady' });
        S.portalReady.add(LAN.selfId);
        updatePortalInteraction();
        return true;
    }

    function showSummary(summary) {
        const panel = document.getElementById('survivalWaveSummary');
        const waveEl = document.getElementById('svSummaryWave');
        const list = document.getElementById('svSummaryList');
        if (!panel || !list) return;
        if (waveEl) waveEl.textContent = summary.wave;
        const title = panel.querySelector('.sv-summary-title');
        if (title) {
            title.innerHTML = `第 <span id="svSummaryWave">${summary.wave}</span> 波 · 队伍击杀 ${summary.totalKills}`;
        }
        const players = (summary.players || []).slice().sort((a, b) => b.kills - a.kills);
        list.innerHTML = players.map((player, index) => {
            const tag = [player.bestLabel, player.worstLabel].filter(Boolean).join(' · ');
            return `
                <div class="sv-summary-row">
                    <span class="sv-summary-rank">#${index + 1}</span>
                    <span class="sv-summary-name">${String(player.name || '玩家').replace(/[<>&"']/g, '')}
                        ${tag ? `<small class="sv-summary-tag">${tag}</small>` : ''}
                    </span>
                    <span class="sv-summary-kills">${player.kills} 杀</span>
                </div>
            `;
        }).join('');
        panel.style.display = 'block';
        void panel.offsetWidth;
        panel.classList.add('show');
        clearTimeout(S.summaryTimer);
        S.summaryTimer = setTimeout(() => {
            panel.classList.remove('show');
            setTimeout(() => { panel.style.display = 'none'; }, 400);
        }, 3000);
    }

    function loadNextMap(mapId) {
        S.phase = 'mapLoading';
        gameState = 'prep';
        running = false;
        if (typeof clearAllZombies === 'function') clearAllZombies();
        if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
        updatePortalStatus('正在加载下一张地图…');
        const ready = () => {
            S.mapId = mapId;
            S.mapIndex = Math.max(0, MAPS.indexOf(mapId));
            S.playersPlaced = false;
            if (typeof LANNET !== 'undefined') LANNET.send({ type: 'survivalMapReady' });
        };
        if (typeof beginMapSwitchLoading === 'function') {
            beginMapSwitchLoading(mapId, ready);
        } else if (typeof loadMap === 'function') {
            loadMap(mapId);
            setTimeout(ready, 500);
        } else {
            ready();
        }
    }

    function endSurvival(victory) {
        running = false;
        gameState = 'idle';
        S.phase = victory ? 'victory' : 'defeat';
        if (typeof clearAllZombies === 'function') clearAllZombies();
        if (document.pointerLockElement) document.exitPointerLock();
        const overlay = document.getElementById('survivalEndOverlay');
        if (overlay) {
            const icon = overlay.querySelector('.sv-end-icon');
            const title = overlay.querySelector('.sv-end-title');
            const hint = overlay.querySelector('.sv-end-hint');
            if (icon) icon.textContent = victory ? '🏆' : '💀';
            if (title) title.textContent = victory ? '通 关' : '失 败';
            if (hint) {
                hint.textContent = LAN.room?.ownerId === LAN.selfId
                    ? '点击返回房间'
                    : '等待房主返回房间';
            }
            overlay.style.display = 'flex';
            overlay.onclick = () => {
                if (LAN.room?.ownerId === LAN.selfId) {
                    LANNET.send({ type: 'returnLobby' });
                }
            };
        }
        document.body.classList.remove('in-game');
    }

    function handleMessage(msg) {
        if (!S.active && msg.type !== 'survivalState') return;
        if (msg.type === 'survivalState') {
            applyState(msg);
            return;
        }
        if (msg.type === 'survivalSnapshot') {
            applyZombieSnapshots(msg.zombies);
            SurvivalState.waveQueue = Array.from(
                { length: Math.max(0, Number(msg.queueRemaining) || 0) },
                () => 'normal'
            );
            return;
        }
        if (msg.type === 'survivalZombieDamaged') {
            const zombie = getAllZombies().find(item => item.alive && item.netId === msg.zombieId);
            if (zombie) {
                zombie.hp = msg.hp;
                if (msg.killed) {
                    zombie.alive = false;
                    zombie.mesh.visible = false;
                }
            }
            if (msg.killed) {
                if (typeof feed === 'function') {
                    feed(p1, `<b>${msg.killerId === LAN.selfId ? '你' : _lanPlayerName(msg.killerId)}</b> 击杀了一只僵尸`);
                }
                if (msg.killerId === LAN.selfId) {
                    p1.survivalKills = (p1.survivalKills || 0) + 1;
                    SurvivalState.coins = (SurvivalState.coins || 0) + (msg.coinReward || 0);
                }
            }
            return;
        }
        if (msg.type === 'survivalHealStart') {
            const healer = msg.healerId === LAN.selfId ? p1 : LAN.models.get(msg.healerId);
            const target = msg.targetId === LAN.selfId ? p1 : LAN.models.get(msg.targetId);
            const start = performance.now();
            const duration = Math.max(100, Number(msg.durationMs) || MEDKIT.useTimeMs);
            if (healer) {
                healer.healingTeammate = true;
                healer.healingTargetId = msg.targetId;
                healer.healStart = start;
                healer.healEnd = start + duration;
            }
            if (target) {
                target.beingHealed = true;
                target.healStart = start;
                target.healEnd = start + duration;
            }
            if (msg.healerId === LAN.selfId) {
                S.healTargetId = msg.targetId;
                S.healStart = start;
                S.healEnd = start + duration;
                p1.healingTeammate = true;
                p1.healingTargetId = msg.targetId;
                p1.healStart = start;
                p1.healEnd = start + duration;
                if (S.healLockX === null || S.healLockZ === null) {
                    S.healLockX = p1.pos.x;
                    S.healLockZ = p1.pos.z;
                }
            }
            return;
        }
        if (msg.type === 'survivalHealCancel') {
            S.lastHealCancelReason = msg.reason || 'cancelled';
            const healer = msg.healerId === LAN.selfId ? p1 : LAN.models.get(msg.healerId);
            const target = msg.targetId === LAN.selfId ? p1 : LAN.models.get(msg.targetId);
            clearRemoteHealState(healer);
            clearRemoteHealState(target);
            if (msg.healerId === LAN.selfId) {
                S.healTargetId = null;
                S.healStart = 0;
                S.healEnd = 0;
                S.healLockX = null;
                S.healLockZ = null;
                p1.healingTeammate = false;
            }
            if ((msg.healerId === LAN.selfId || msg.targetId === LAN.selfId)
                && typeof lanNotify === 'function') {
                lanNotify(msg.reason === 'out-of-range'
                    ? '治疗中断 · 距离过远'
                    : '治疗已中断', 1800);
            }
            return;
        }
        if (msg.type === 'survivalHealComplete') {
            const healer = msg.healerId === LAN.selfId ? p1 : LAN.models.get(msg.healerId);
            const target = msg.targetId === LAN.selfId ? p1 : LAN.models.get(msg.targetId);
            clearRemoteHealState(healer);
            clearRemoteHealState(target);
            if (msg.healerId === LAN.selfId) {
                S.healTargetId = null;
                S.healStart = 0;
                S.healEnd = 0;
                S.healLockX = null;
                S.healLockZ = null;
                p1.healingTeammate = false;
                p1.medkits = Math.max(0, (p1.medkits || 0) - 1);
                setWeapon(p1, p1.primaryWeaponKey || 'rifle');
            }
            if (msg.targetId === LAN.selfId) {
                p1.beingHealed = false;
                p1.hp = msg.hp;
            } else if (target) {
                target.hp = msg.hp;
            }
            if (msg.healerId === LAN.selfId && typeof lanNotify === 'function') {
                lanNotify(`治疗完成 · 队友恢复 ${msg.amount} 血`, 1600);
            } else if (msg.targetId === LAN.selfId && typeof lanNotify === 'function') {
                lanNotify(`接受治疗 · 恢复 ${msg.amount} 血`, 1600);
            }
            return;
        }
        if (msg.type === 'survivalPlayerDowned') {
            if (msg.playerId === LAN.selfId && typeof lanNotify === 'function') {
                lanNotify('你已倒地 · 等待队友按住 E 救援', 3500);
            }
            return;
        }
        if (msg.type === 'survivalPlayerRevived') {
            const target = msg.playerId === LAN.selfId ? p1 : LAN.models.get(msg.playerId);
            if (target) setPlayerAliveState(target, true, false, msg.hp, target.armor);
            if (msg.playerId === LAN.selfId && typeof lanNotify === 'function') {
                lanNotify(`你已被救起 · ${msg.hp} 血`, 2200);
            }
            return;
        }
        if (msg.type === 'survivalWaveSummary') {
            showSummary(msg.summary || { wave: S.wave, totalKills: 0, players: [] });
            return;
        }
        if (msg.type === 'survivalPortalProgress') {
            S.portalReady = new Set(msg.ready || []);
            S.portalRequired = msg.required || [];
            updatePortalInteraction();
            return;
        }
        if (msg.type === 'survivalPortalComplete') {
            S.portalReady = new Set(S.portalRequired);
            updatePortalStatus('全队已就位');
            return;
        }
        if (msg.type === 'survivalMapChange') {
            loadNextMap(msg.mapId);
            return;
        }
        if (msg.type === 'survivalMapLoaded') {
            S.phase = 'prep';
            S.wave = 0;
            S.hostWaveStarted = -1;
            S.playersPlaced = false;
            running = true;
            gameState = 'prep';
            updatePortalStatus('');
            if (typeof clearAllZombies === 'function') clearAllZombies();
            placePlayers(Array.from(LAN.playerStates.values()));
            if (typeof enterFullscreenAndLock === 'function') enterFullscreenAndLock();
            return;
        }
        if (msg.type === 'survivalEnd') {
            endSurvival(!!msg.victory);
        }
    }

    function tick(dt, now) {
        if (!isSurvivalContext()) return;
        if (S.isHost) hostTick(dt, now);
        else updateClientZombies(dt, now);

        for (const player of LAN.models.values()) applyRemoteDownedPose(player);

        if (p1.downed && p1.deadUntil === 0) {
            p1.baseVisible = false;
            p1.cam.position.set(p1.pos.x, p1.pos.y + 0.42, p1.pos.z);
            p1.cam.rotation.y = p1.yaw;
            p1.cam.rotation.x = p1.pitch;
            if (p1.vm) p1.vm.visible = false;
        }
        if (p1.healingTeammate && S.healLockX !== null && S.healLockZ !== null) {
            p1.pos.x = S.healLockX;
            p1.pos.z = S.healLockZ;
            p1.cam.position.x = S.healLockX;
            p1.cam.position.z = S.healLockZ;
        }

        updateRescue(dt, now);
        updatePortalInteraction();
    }

    function stop() {
        S.active = false;
        S.phase = 'idle';
        S.waveQueue = [];
        SurvivalState.active = false;
        SurvivalState.phase = 'idle';
        SurvivalState.waveQueue = [];
        if (typeof clearAllZombies === 'function') clearAllZombies();
        if (typeof despawnSurvivalPortal === 'function') despawnSurvivalPortal();
        const endOverlay = document.getElementById('survivalEndOverlay');
        if (endOverlay) endOverlay.style.display = 'none';
        const summary = document.getElementById('survivalWaveSummary');
        if (summary) summary.style.display = 'none';
        setPrompt('');
        hideRescue();
        updatePortalStatus('');
    }

    window.LAN_SURVIVAL_begin = begin;
    window.LAN_SURVIVAL_handleMessage = handleMessage;
    window.LAN_SURVIVAL_handleSnapshot = handleSnapshot;
    window.LAN_SURVIVAL_preUpdate = preUpdate;
    window.LAN_SURVIVAL_tick = tick;
    window.LAN_SURVIVAL_stop = stop;
    window.LAN_SURVIVAL_tryPortalConfirm = tryPortalConfirm;
    window.LAN_SURVIVAL_debugHealTarget = teammateUnderCrosshair;
    window.LAN_SURVIVAL_handleZombieHit = function (zombie, damage, part, point) {
        if (!zombie || !zombie.alive) return;
        zombie.hp -= damage;
        if (zombie.hp <= 0) {
            zombie.hp = 0;
            zombie.alive = false;
            zombie.mesh.visible = false;
        }
        LANNET.send({
            type: 'survivalZombieHit',
            zombieId: zombie.netId,
            damage,
            part,
        });
    };
    window.LAN_SURVIVAL_handleZombieAttack = function (target, damage) {
        if (!S.isHost || !target) return;
        LANNET.send({
            type: 'survivalZombieAttack',
            targetId: target.netId || target.id,
            damage,
        });
    };
    window.LAN_SURVIVAL_STATE = S;
})();
