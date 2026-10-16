// ===== js/survival/zombie_sounds.js – 僵尸叫声（合成 + 调度） =====
//
// 依赖（都是运行时访问，加载顺序只需在 sound.js 之后）：
//   · audio.js 提供 audio() / noiseBuf / _resolveAudioDest
//   · sound.js 提供 emitWorldSound
//
// 对外接口：
//   · window.ZombieSounds.initSchedule(zombie, now)
//   · window.ZombieSounds.tick(zombie, now)
//   · window.ZombieSounds.triggerAttack(zombie, now)
//   · ZOMBIE_GROWL_PRESETS / sZombieGrowl 供 sound.js 的 _dispatchSound 调用

(function () {
    'use strict';

    // ============================================================
    // 三种僵尸的叫声预设
    //
    //   基础参数（三种都用）：
    //     baseFreq    基频 Hz（越大越尖）
    //     peakGain    峰值音量（0~1）
    //     duration    叫声时长 秒
    //     filterFreq  带通滤波中心 Hz
    //     waveType    振荡器波形
    //     pitchBend   音高漂移幅度
    //     noiseAmount 噪声层比例
    //
    //   ★ 恐怖感增强参数（可选，不传就跳过）：
    //     vibratoRate  LFO 颤音频率 Hz（喉咙抖动）
    //     vibratoDepth LFO 深度（相对基频比例，0.08 = ±8%）
    //     filterSweep  滤波扫频幅度（0.9 = 从 0.55x 扫到 1.45x）
    //     detuneCents  第二振荡器失谐量 cents（30 = 30音分）
    //     detuneGain   第二振荡器增益（相对主振荡器）
    // ============================================================
    const ZOMBIE_GROWL_PRESETS = {

        // ★ 普通僵尸：恐惧感为主
        //   · 基频降低到 80Hz（低沉）
        //   · pitchBend 提高到 0.45（剧烈音高起伏）
        //   · noiseAmount 0.35（呼吸嘶哑）
        //   · vibrato 12Hz × 8%（喉咙快速颤抖）
        //   · filterSweep 0.9（口腔共振扫过）
        //   · detune 30 cents + 0.55 增益（双音撕裂感）
        normal: {
            baseFreq: 80,
            peakGain: 0.35,
            duration: 1.10,
            filterFreq: 700,
            waveType: 'sawtooth',
            pitchBend: 0.45,
            noiseAmount: 0.35,
            // ★ 恐怖感增强
            vibratoRate: 12,
            vibratoDepth: 0.08,
            filterSweep: 0.9,
            detuneCents: 30,
            detuneGain: 0.55,
        },

        // 小僵尸：尖细急促（保持原样）
        small: {
            baseFreq: 240,
            peakGain: 0.26,
            duration: 0.55,
            filterFreq: 2200,
            waveType: 'square',
            pitchBend: 0.30,
            noiseAmount: 0.06,
        },

        // 大僵尸：低沉闷吼（保持原样）
        big: {
            baseFreq: 58,
            peakGain: 0.55,
            duration: 1.15,
            filterFreq: 550,
            waveType: 'sawtooth',
            pitchBend: 0.12,
            noiseAmount: 0.16,
        },
    };

    // ============================================================
    // 合成函数（被 sound.js 的 _dispatchSound 调用）
    //
    //   结构：
    //     1. 主振荡器（喉咙振动）→ 带通滤波（口腔共振）→ 增益包络
    //     1b. LFO 颤音（可选，接 osc.frequency）
    //     1c. 第二失谐振荡器（可选，接同一个 filter）
    //     2. 噪声层（气息）
    //   基频在叫声中先升后降，模拟"嗷——"的起伏。
    // ============================================================
    function sZombieGrowl(dest, preset) {
        preset = preset || ZOMBIE_GROWL_PRESETS.normal;
        const ac = audio();
        const t = ac.currentTime;
        const dst = _resolveAudioDest(dest);

        const {
            baseFreq, peakGain, duration, filterFreq,
            waveType, pitchBend, noiseAmount,
            // ★ 可选增强参数
            vibratoRate, vibratoDepth,
            filterSweep, detuneCents, detuneGain,
        } = preset;

        const attackTime  = duration * 0.15;
        const releaseTime = duration * 0.40;

        // ---- 1. 主振荡器 ----
        const osc = ac.createOscillator();
        osc.type = waveType;

        osc.frequency.setValueAtTime(baseFreq * (1 - pitchBend * 0.5), t);
        osc.frequency.linearRampToValueAtTime(
            baseFreq * (1 + pitchBend * 0.3), t + duration * 0.25
        );
        osc.frequency.linearRampToValueAtTime(
            baseFreq, t + duration * 0.55
        );
        osc.frequency.linearRampToValueAtTime(
            baseFreq * 0.75, t + duration
        );

        // ---- 1b. LFO 颤音（可选）----
        let lfo = null;
        if (vibratoRate && vibratoDepth) {
            lfo = ac.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = vibratoRate;

            const lfoGain = ac.createGain();
            lfoGain.gain.value = baseFreq * vibratoDepth;

            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            lfo.start(t);
            lfo.stop(t + duration + 0.05);
        }

        // ---- 2. 带通滤波（可选扫频）----
        const filter = ac.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 2.5;

        if (filterSweep && filterSweep > 0) {
            // 扫频：低 → 高 → 中 → 更低（模拟"口腔开合"）
            filter.frequency.setValueAtTime(
                filterFreq * (1 - filterSweep * 0.45), t
            );
            filter.frequency.linearRampToValueAtTime(
                filterFreq * (1 + filterSweep * 0.55), t + duration * 0.35
            );
            filter.frequency.linearRampToValueAtTime(
                filterFreq, t + duration * 0.70
            );
            filter.frequency.linearRampToValueAtTime(
                filterFreq * 0.70, t + duration
            );
        } else {
            filter.frequency.value = filterFreq;
        }

        // ---- 3. 增益包络 ----
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(peakGain, t + attackTime);
        gain.gain.setValueAtTime(peakGain, t + duration - releaseTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        osc.connect(filter);

        // ---- 1c. 第二失谐振荡器（可选）----
        //   两个轻微失谐的音源叠加 → 产生拍频（"撕裂 / 粗糙"感）
        //   这是让普通僵尸从"呆滞"变"恐怖"的关键
        let osc2 = null;
        if (detuneCents && detuneGain) {
            const detuneRatio = Math.pow(2, detuneCents / 1200);

            osc2 = ac.createOscillator();
            osc2.type = waveType;
            osc2.frequency.setValueAtTime(
                baseFreq * detuneRatio * (1 - pitchBend * 0.5), t
            );
            osc2.frequency.linearRampToValueAtTime(
                baseFreq * detuneRatio * (1 + pitchBend * 0.3), t + duration * 0.25
            );
            osc2.frequency.linearRampToValueAtTime(
                baseFreq * detuneRatio, t + duration * 0.55
            );
            osc2.frequency.linearRampToValueAtTime(
                baseFreq * detuneRatio * 0.75, t + duration
            );

            const gain2 = ac.createGain();
            gain2.gain.value = detuneGain;

            osc2.connect(gain2);
            gain2.connect(filter);

            osc2.start(t);
            osc2.stop(t + duration + 0.05);
        }

        filter.connect(gain);
        gain.connect(dst);

        osc.start(t);
        osc.stop(t + duration + 0.05);

        // ---- 4. 噪声层（气息）----
        if (noiseAmount > 0) {
            const src = ac.createBufferSource();
            src.buffer = noiseBuf;
            src.loop = true;

            const nFilter = ac.createBiquadFilter();
            nFilter.type = 'bandpass';
            nFilter.frequency.value = filterFreq * 0.6;
            nFilter.Q.value = 1.0;

            const nGain = ac.createGain();
            nGain.gain.setValueAtTime(0.0001, t);
            nGain.gain.exponentialRampToValueAtTime(
                peakGain * noiseAmount, t + attackTime
            );
            nGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

            src.connect(nFilter);
            nFilter.connect(nGain);
            nGain.connect(dst);

            src.start(t);
            src.stop(t + duration + 0.05);
        }
    }

    // ============================================================
    // 调度逻辑
    // ============================================================
    const GROWL_INTERVAL_MIN   = 2500;
    const GROWL_INTERVAL_MAX   = 6000;
    const ATTACK_SUPPRESS_MIN  = 1500;
    const ATTACK_SUPPRESS_MAX  = 3000;

    function _emitGrowl(zombie) {
        if (typeof emitWorldSound !== 'function') return;
        emitWorldSound(
            'zombie_' + (zombie.type || 'normal'),
            zombie.pos.x,
            zombie.pos.y + zombie.eyeH,
            zombie.pos.z,
            false
        );
    }

    function initSchedule(zombie, now) {
        zombie._nextGrowlAt = now + Math.random() * 2000;
    }

    function tick(zombie, now) {
        if (now < zombie._nextGrowlAt) return;
        zombie._nextGrowlAt = now + GROWL_INTERVAL_MIN
            + Math.random() * (GROWL_INTERVAL_MAX - GROWL_INTERVAL_MIN);
        _emitGrowl(zombie);
    }

    function triggerAttack(zombie, now) {
        zombie._nextGrowlAt = now + ATTACK_SUPPRESS_MIN
            + Math.random() * (ATTACK_SUPPRESS_MAX - ATTACK_SUPPRESS_MIN);
        _emitGrowl(zombie);
    }

    // ============================================================
    // 暴露
    // ============================================================
    window.ZombieSounds = {
        initSchedule,
        tick,
        triggerAttack,
    };

    window.ZOMBIE_GROWL_PRESETS = ZOMBIE_GROWL_PRESETS;
    window.sZombieGrowl = sZombieGrowl;

    console.log('[zombie_sounds] 僵尸叫声系统已就绪');
})();