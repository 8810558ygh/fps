// ===== js/survival/zombies/player_zombie.js – 演奏僵尸（基于普通僵尸 + 吉他） =====

(function () {
    'use strict';

    const MUSIC_VOLUME  = 0.6;
    const FADE_IN_MS    = 500;
    const FADE_OUT_MS   = 300;
    const SLOW_STEP     = 0.05;
    const SLOW_INTERVAL = 10000;
    const MAX_HP        = 200;

    // ============================================================
    // 合成音乐引擎
    // ============================================================
    const MUSIC_BPM       = 80;
    const BEAT_DUR        = 60 / MUSIC_BPM;
    const SIXTEENTH_DUR   = BEAT_DUR / 4;
    const LOOP_16TH_NOTES = 64;

    const MusicEngine = {
        ctx: null, masterGain: null, isPlaying: false, _schedulerTimer: 0, _nextNoteTime: 0, _noteIndex: 0,
        _ensureCtx() {
            if (this.ctx) return;
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this.ctx = new AC();
                const g = this.ctx.createGain();
                g.gain.value = 0;
                g.connect(this.ctx.destination);
                this.masterGain = g;
            } catch (e) { this.ctx = null; }
        },
        start() {
            this._ensureCtx();
            if (!this.ctx || this.isPlaying) return;
            this.isPlaying = true;
            if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
            const t = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(t);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
            this.masterGain.gain.linearRampToValueAtTime(MUSIC_VOLUME, t + FADE_IN_MS / 1000);
            this._noteIndex = 0;
            this._nextNoteTime = this.ctx.currentTime + 0.05;
            this._scheduleLoop();
        },
        stop() {
            if (!this.isPlaying) return;
            this.isPlaying = false;
            if (this._schedulerTimer) { clearTimeout(this._schedulerTimer); this._schedulerTimer = 0; }
            if (!this.ctx || !this.masterGain) return;
            const t = this.ctx.currentTime;
            const cur = this.masterGain.gain.value;
            this.masterGain.gain.cancelScheduledValues(t);
            this.masterGain.gain.setValueAtTime(cur, t);
            this.masterGain.gain.linearRampToValueAtTime(0, t + FADE_OUT_MS / 1000);
        },
        stopImmediate() {
            this.isPlaying = false;
            if (this._schedulerTimer) { clearTimeout(this._schedulerTimer); this._schedulerTimer = 0; }
            if (!this.ctx || !this.masterGain) return;
            const t = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(t);
            this.masterGain.gain.setValueAtTime(0, t);
        },
        _scheduleLoop() {
            if (!this.isPlaying || !this.ctx) return;
            const lookAhead = 0.15;
            while (this._nextNoteTime < this.ctx.currentTime + lookAhead) {
                this._scheduleNote(this._noteIndex, this._nextNoteTime);
                this._noteIndex = (this._noteIndex + 1) % LOOP_16TH_NOTES;
                this._nextNoteTime += SIXTEENTH_DUR;
            }
            this._schedulerTimer = setTimeout(() => this._scheduleLoop(), 100);
        },
        _scheduleNote(idx, time) {
            const beatPos = idx / 4;
            const beatInt = Math.floor(beatPos);
            const inBeat  = beatPos - beatInt;

            if (inBeat === 0) this._kick(time, 55, 0.5);
            if (inBeat === 0.5) this._snare(time);
            if (inBeat === 0 && beatInt % 2 === 0) {
                const notes = [523.25, 622.25, 698.46, 830.61];
                this._ding(time, notes[Math.floor(Math.random() * notes.length)], 0.15);
            }
            if (inBeat === 0 || inBeat === 0.5) {
                const arp = [130.81, 155.56, 196.00, 233.08];
                this._pad(time, arp[(idx >> 2) % arp.length], BEAT_DUR * 0.45, 0.08);
            }
            if (idx % 16 === 0) this._drone(time, 65.41, BEAT_DUR * 4);
        },
        _kick(time, freq, vol) {
            if (!this.ctx) return;
            const ac = this.ctx;
            const o = ac.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(freq * 2, time);
            o.frequency.exponentialRampToValueAtTime(freq * 0.6, time + 0.12);
            const g = ac.createGain(); g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
            o.connect(g); g.connect(this.masterGain); o.start(time); o.stop(time + 0.22);
        },
        _snare(time) {
            if (!this.ctx) return;
            const ac = this.ctx;
            const bufSize = Math.floor(ac.sampleRate * 0.15);
            const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
            const src = ac.createBufferSource(); src.buffer = buf;
            const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.8;
            const g = ac.createGain(); g.gain.setValueAtTime(0.12, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
            src.connect(f); f.connect(g); g.connect(this.masterGain); src.start(time); src.stop(time + 0.13);
        },
        _ding(time, freq, vol) {
            if (!this.ctx) return;
            const ac = this.ctx;
            const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
            const g = ac.createGain(); g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
            o.connect(g); g.connect(this.masterGain); o.start(time); o.stop(time + 0.5);
        },
        _pad(time, freq, dur, vol) {
            if (!this.ctx) return;
            const ac = this.ctx;
            const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
            const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
            const g = ac.createGain(); g.gain.setValueAtTime(0.001, time);
            g.gain.linearRampToValueAtTime(vol, time + 0.03);
            g.gain.linearRampToValueAtTime(0.001, time + dur);
            o.connect(f); f.connect(g); g.connect(this.masterGain); o.start(time); o.stop(time + dur + 0.05);
        },
        _drone(time, freq, dur) {
            if (!this.ctx) return;
            const ac = this.ctx;
            const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
            const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
            const g = ac.createGain(); g.gain.setValueAtTime(0.001, time);
            g.gain.linearRampToValueAtTime(0.06, time + 0.5);
            g.gain.linearRampToValueAtTime(0.001, time + dur);
            o.connect(f); f.connect(g); g.connect(this.masterGain); o.start(time); o.stop(time + dur + 0.1);
        },
    };

    // ============================================================
    // PlayerZombie (普通僵尸 + 吉他)
    // ============================================================
    const PlayerZombie = {
        active: null,
        slowAmount: 0,
        slowStartTime: 0,
        _spawnedThisWave: false,
        _warmedUp: false,

        resetWaveFlag() { this._spawnedThisWave = false; },

        canSpawn(wave) {
            if (typeof SurvivalState === 'undefined' || !SurvivalState) return false;
            if (!SurvivalState.endlessMode) return false;
            if (wave < 3) return false;
            if (this._spawnedThisWave) return false;
            if (this.active && !this.active.dead) return false;
            return true;
        },

        markSpawnedThisWave() { this._spawnedThisWave = true; },

        spawn(x, z) {
            if (this.active) this._cleanupMesh();

            const groundY = (typeof terrainGroundAt === 'function') ? terrainGroundAt(x, z) : 0;
            const mesh = this._buildMesh();
            mesh.position.set(x, groundY, z);
            if (typeof scene !== 'undefined' && scene) scene.add(mesh);

            const hitMeshes = this._collectHitMeshes(mesh);

            const z1 = {
                _isZombie: true,
                _isPlayerZombie: true,
                type: 'musician',
                hp: MAX_HP, maxHp: MAX_HP,
                alive: true, dead: false,
                pos: new THREE.Vector3(x, groundY, z),
                mesh, hitMeshes,
                spawnTime: performance.now(),
                yaw: 0, height: 1.8, eyeH: 1.6, armor: 0,
                _parts: mesh.userData.parts
            };

            for (const m of hitMeshes) m.userData.zombieRef = z1;

            this.active = z1;
            this.slowAmount = 0;
            this.slowStartTime = performance.now();
            this.markSpawnedThisWave();

            MusicEngine.start();
            console.log('[player_zombie] 演奏僵尸已生成 @', x.toFixed(1), z.toFixed(1));
            return z1;
        },

        tick(dt, now) {
            if (!this.active || this.active.dead) return;

            const elapsed = now - this.slowStartTime;
            const steps = Math.floor(elapsed / SLOW_INTERVAL);
            this.slowAmount = steps * SLOW_STEP;

            const p = this.active._parts;
            if (p && p.pivots) {
                const t = now * 0.008;
                
                if (p.pivots.armR) {
                    p.pivots.armR.rotation.x = -Math.PI / 2 + Math.sin(t * 3) * 0.3; 
                }
                if (p.pivots.armL) {
                    p.pivots.armL.rotation.x = -Math.PI / 2 + Math.sin(t * 5) * 0.1;
                    p.pivots.armL.rotation.z = 0.2; 
                }
                this.active.mesh.rotation.z = Math.sin(t) * 0.05;
                if (p.pivots.head) {
                    p.pivots.head.rotation.x = Math.sin(t * 2) * 0.1;
                }
            }
        },

        damage(dmg, from) {
            if (!this.active || this.active.dead) return;
            this.active.hp -= dmg;
            if (this.active.hp <= 0) this._kill(from);
        },

        _kill(from) {
            if (!this.active || this.active.dead) return;
            this.active.dead = true;
            this.active.alive = false;

            if (from && !from._isZombie && from.id !== undefined) {
                if (typeof from.survivalKills !== 'number') from.survivalKills = 0;
                from.survivalKills++;
            }

            this.slowAmount = 0;
            this.slowStartTime = 0;
            MusicEngine.stop();
            if (this.active.mesh) this.active.mesh.visible = false;

            const deadRef = this.active;
            setTimeout(() => {
                if (this.active === deadRef) {
                    this._cleanupMesh();
                    this.active = null;
                }
            }, 1000);
        },

        forceStopMusic() {
            MusicEngine.stopImmediate();
            if (this.active && !this.active.dead) {
                this.active.dead = true;
                this.active.alive = false;
                if (this.active.mesh) this.active.mesh.visible = false;
            }
            this.active = null;
            this.slowAmount = 0;
            this.slowStartTime = 0;
        },

        // ============================================================
        // ★ 模型构建
        // ============================================================
        _buildMesh() {
            if (!window.ZOMBIE_MODEL_NORMAL || typeof window.ZOMBIE_MODEL_NORMAL.build !== 'function') {
                console.error('[player_zombie] 找不到 ZOMBIE_MODEL_NORMAL 模型');
                return new THREE.Group();
            }

            const zData = window.ZOMBIE_MODEL_NORMAL.build();
            const group = zData.group;

            const guitarGroup = new THREE.Group();
            guitarGroup.position.set(0, 1.1, -0.25);
            guitarGroup.rotation.set(0.2, 0, -0.8);
            group.add(guitarGroup);

            const matWood = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.6 });
            const matMetal = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });

            const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.08), matWood);
            body.userData.part = 'zombie_body';
            guitarGroup.add(body);

            const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.04), matWood);
            neck.position.y = 0.5;
            guitarGroup.add(neck);

            const headstock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.03), matWood);
            headstock.position.y = 0.85;
            guitarGroup.add(headstock);

            for(let i=-1; i<=1; i++) {
                const string = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.7, 4), matMetal);
                string.position.set(i * 0.02, 0.45, 0.03);
                guitarGroup.add(string);
            }

            const noteMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
            const note = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), noteMat);
            note.position.set(0, 2.05, 0);
            note.renderOrder = 90;
            note.userData.part = 'zombie_head';
            group.add(note);

            group.userData.parts = {
                pivots: zData.pivots,
                original: zData
            };

            return group;
        },

        _collectHitMeshes(mesh) {
            const hit = [];
            mesh.traverse(o => {
                if (o.isMesh && o.userData.part && o.userData.part.startsWith('zombie_')) {
                    hit.push(o);
                }
            });
            return hit;
        },

        _cleanupMesh() {
            if (!this.active || !this.active.mesh) return;
            const m = this.active.mesh;
            if (m.parent) m.parent.remove(m);
            m.traverse(o => {
                if (o.isMesh) {
                    if (o.geometry) o.geometry.dispose();
                    if (o.material) o.material.dispose();
                }
            });
        },

        pause() { MusicEngine.stop(); },
        resume() { if (this.active && !this.active.dead) MusicEngine.start(); },

        // ============================================================
        // ★ 新增：加载阶段预热模型
        // ============================================================
        warmup() {
            if (this._warmedUp) return;
            this._warmedUp = true;
            try {
                const tempMesh = this._buildMesh();
                tempMesh.position.set(0, 50, 0);
                
                if (typeof scene !== 'undefined' && scene) {
                    scene.add(tempMesh);
                    scene.updateMatrixWorld(true);
                    
                    if (typeof renderer !== 'undefined' && renderer && typeof p1 !== 'undefined' && p1 && p1.cam) {
                        try {
                            if (typeof renderer.compile === 'function') {
                                renderer.compile(scene, p1.cam);
                            }
                            renderer.render(scene, p1.cam);
                        } catch(e) {}
                    }
                    
                    scene.remove(tempMesh);
                }
                
                tempMesh.traverse(o => {
                    if (o.isMesh && o.geometry && !o.geometry._shared) {
                        o.geometry.dispose();
                    }
                });
                console.log('[player_zombie] 演奏僵尸模型预热完成');
            } catch (e) {
                console.warn('[player_zombie] 预热失败:', e);
            }
        },
    };

    window.PlayerZombie = PlayerZombie;
    console.log('[player_zombie] 演奏僵尸（普通僵尸+吉他）已就绪');
})();