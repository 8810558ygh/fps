// ===== js/profile/profile_store.js – 玩家 ID 与本地战绩 =====

(function () {
    'use strict';

    const ID_STORAGE_KEY = 'pvp_nick';
    const ID_CONFIRMED_STORAGE_KEY = 'pvp_nick_confirmed_v1';
    const MATCH_STORAGE_KEY = 'pvp_match_history_v1';
    const MAX_LOCAL_MATCHES = 500;

    const PROFILE = {
        info: {
            id: '',
            playerKey: '',
            directory: '',
            isNew: false,
            idConfirmed: false,
            electron: !!(window.electronAPI && window.electronAPI.getProfile),
        },
        matches: [],
        ready: false,
        error: '',
    };

    let resolveReady;
    PROFILE.readyPromise = new Promise(resolve => {
        resolveReady = resolve;
    });

    function normalizeId(value) {
        return Array.from(String(value || '')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim())
            .slice(0, 20)
            .join('');
    }

    function makeDefaultId() {
        return '玩家' + Math.floor(1000 + Math.random() * 9000);
    }

    function readLocalMatches() {
        try {
            const parsed = JSON.parse(localStorage.getItem(MATCH_STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.slice(-MAX_LOCAL_MATCHES) : [];
        } catch {
            return [];
        }
    }

    function writeLocalMatches(matches) {
        localStorage.setItem(
            MATCH_STORAGE_KEY,
            JSON.stringify(matches.slice(-MAX_LOCAL_MATCHES))
        );
    }

    function notifyProfileEvent(name) {
        window.dispatchEvent(new CustomEvent(name, { detail: PROFILE }));
    }

    async function refreshMatches() {
        if (PROFILE.info.electron) {
            try {
                const result = await window.electronAPI.getMatches(50);
                PROFILE.matches = Array.isArray(result.matches) ? result.matches : [];
                if (result.directory) PROFILE.info.directory = result.directory;
                return;
            } catch (error) {
                PROFILE.error = error.message || '读取战绩失败';
            }
        }
        PROFILE.matches = readLocalMatches().slice().reverse();
    }

    async function initialize() {
        try {
            if (PROFILE.info.electron) {
                const loaded = await window.electronAPI.getProfile();
                PROFILE.info = { ...PROFILE.info, ...loaded };
                PROFILE.info.idConfirmed = true;

                if (loaded.isNew) {
                    const legacyId = normalizeId(localStorage.getItem(ID_STORAGE_KEY));
                    if (legacyId) {
                        const changed = await window.electronAPI.setPlayerId(legacyId);
                        if (changed && changed.ok) PROFILE.info = { ...PROFILE.info, ...changed.profile };
                    }
                }
            } else {
                PROFILE.info.id = normalizeId(localStorage.getItem(ID_STORAGE_KEY)) || makeDefaultId();
                PROFILE.info.idConfirmed = localStorage.getItem(ID_CONFIRMED_STORAGE_KEY) === '1';
                PROFILE.info.directory = '浏览器本地存储';
            }

            if (!PROFILE.info.id) PROFILE.info.id = makeDefaultId();
            localStorage.setItem(ID_STORAGE_KEY, PROFILE.info.id);
            await refreshMatches();
        } catch (error) {
            PROFILE.error = error.message || '玩家资料读取失败';
            PROFILE.info.id = normalizeId(localStorage.getItem(ID_STORAGE_KEY)) || makeDefaultId();
            PROFILE.info.idConfirmed = localStorage.getItem(ID_CONFIRMED_STORAGE_KEY) === '1';
        } finally {
            PROFILE.ready = true;
            resolveReady(PROFILE);
            notifyProfileEvent('profile-ready');
        }
    }

    function getPlayerId() {
        return PROFILE.info.id || normalizeId(localStorage.getItem(ID_STORAGE_KEY));
    }

    async function setPlayerId(value) {
        const id = normalizeId(value);
        if (!id) {
            return { ok: false, message: '玩家 ID 不能为空' };
        }

        try {
            if (PROFILE.info.electron) {
                const result = await window.electronAPI.setPlayerId(id);
                if (!result || !result.ok) return result || { ok: false, message: '保存失败' };
                PROFILE.info = { ...PROFILE.info, ...result.profile };
            } else {
                PROFILE.info.id = id;
            }
        } catch (error) {
            return { ok: false, message: error.message || '保存失败' };
        }

        localStorage.setItem(ID_STORAGE_KEY, PROFILE.info.id);
        localStorage.setItem(ID_CONFIRMED_STORAGE_KEY, '1');
        PROFILE.info.idConfirmed = true;
        if (window.LAN) window.LAN.selfName = PROFILE.info.id;
        if (window.LANNET && window.LANNET.connected) {
            window.LANNET.send({ type: 'hello', name: PROFILE.info.id });
        }
        notifyProfileEvent('profile-updated');
        return { ok: true, profile: PROFILE.info };
    }

    async function addMatch(record) {
        await PROFILE.readyPromise;
        const normalized = {
            ...record,
            playerId: normalizeId(record.playerId) || getPlayerId(),
            playedAt: record.playedAt || new Date().toISOString(),
        };

        try {
            if (PROFILE.info.electron) {
                const result = await window.electronAPI.addMatch(normalized);
                if (!result || !result.ok) return result || { ok: false, message: '保存战绩失败' };
            } else {
                const matches = readLocalMatches();
                if (!normalized.matchId || !matches.some(match => match.matchId === normalized.matchId)) {
                    matches.push({ ...normalized, matchId: normalized.matchId || String(Date.now()) });
                    writeLocalMatches(matches);
                }
            }
            await refreshMatches();
            notifyProfileEvent('profile-updated');
            return { ok: true };
        } catch (error) {
            PROFILE.error = error.message || '保存战绩失败';
            return { ok: false, message: PROFILE.error };
        }
    }

    function getSummary() {
        const summary = {
            games: PROFILE.matches.length,
            wins: 0,
            losses: 0,
            draws: 0,
            kills: 0,
            deaths: 0,
            damage: 0,
            kd: '0.00',
        };

        for (const match of PROFILE.matches) {
            if (match.result === 'win') summary.wins++;
            else if (match.result === 'loss') summary.losses++;
            else summary.draws++;
            summary.kills += Number(match.kills) || 0;
            summary.deaths += Number(match.deaths) || 0;
            summary.damage += Number(match.damage) || 0;
        }
        summary.kd = (summary.kills / Math.max(1, summary.deaths)).toFixed(2);
        return summary;
    }

    async function openDataFolder() {
        if (!PROFILE.info.electron || typeof window.electronAPI.openPlayerDataFolder !== 'function') {
            return { ok: false, message: '浏览器模式没有资料文件夹' };
        }
        return window.electronAPI.openPlayerDataFolder();
    }

    window.PROFILE = PROFILE;
    window.PROFILE_GetId = getPlayerId;
    window.PROFILE_SetId = setPlayerId;
    window.PROFILE_AddMatch = addMatch;
    window.PROFILE_RefreshMatches = refreshMatches;
    window.PROFILE_GetSummary = getSummary;
    window.PROFILE_OpenDataFolder = openDataFolder;

    initialize();
})();
