/**
 * Lowkey Game Time Badge Presence Script
 * Tự động cày tích lũy giờ chơi cho Huy hiệu "Thời gian chơi" (Game Time / Dedicated Badge)
 * Hỗ trợ các mốc: 1h, 5h, 20h, 75h (Tâm huyết), 150h (Nghiêm túc), 300h, 500h, 1000h, 2000h, 5000+h (Vĩnh cửu)
 * Tương thích: DevTools Console (F12), Vencord, và Chrome DevTools Protocol (CDP)
 */

(() => {
    "use strict";

    const LOCK_KEY = "__LOWKEY_GAME_TIME__";

    // Nếu đã chạy trước đó thì dừng lại trước khi tạo mới
    if (window[LOCK_KEY]?.stop) {
        console.warn("[Game Time] Phiên cày trước đang chạy. Đang dừng để khởi động lại...");
        window[LOCK_KEY].stop();
    }

    // Danh sách các tựa game PC phổ biến nhất được Discord nhận diện 100%
    const SUPPORTED_GAMES = [
        {
            name: "Counter-Strike 2",
            appId: "1158877933042143272",
            winExe: "cs2.exe",
            winPath: "c:/program files (x86)/steam/steamapps/common/counter-strike global offensive/game/bin/win64/cs2.exe",
            linuxExe: "cs2",
            linuxPath: "/home/user/.local/share/Steam/steamapps/common/Counter-Strike Global Offensive/game/bin/linuxsteamrt64/cs2"
        },
        {
            name: "Grand Theft Auto V",
            appId: "423646631248461825",
            winExe: "GTA5.exe",
            winPath: "c:/program files/rockstar games/grand theft auto v/gta5.exe",
            linuxExe: "GTA5.exe",
            linuxPath: "/home/user/.local/share/Steam/steamapps/common/Grand Theft Auto V/GTA5.exe"
        },
        {
            name: "VALORANT",
            appId: "700136079562375258",
            winExe: "VALORANT-Win64-Shipping.exe",
            winPath: "c:/riot games/valorant/live/shootergame/binaries/win64/valorant-win64-shipping.exe",
            linuxExe: "VALORANT.exe",
            linuxPath: "/home/user/games/valorant/valorant.exe"
        },
        {
            name: "Dota 2",
            appId: "356875988589740042",
            winExe: "dota2.exe",
            winPath: "c:/program files (x86)/steam/steamapps/common/dota 2 beta/game/bin/win64/dota2.exe",
            linuxExe: "dota2",
            linuxPath: "/home/user/.local/share/Steam/steamapps/common/dota 2 beta/game/bin/linuxsteamrt64/dota2"
        },
        {
            name: "League of Legends",
            appId: "1402418696126992445",
            winExe: "League of Legends.exe",
            winPath: "c:/riot games/league of legends/league of legends.exe",
            linuxExe: "League of Legends.exe",
            linuxPath: "/home/user/games/league/league.exe"
        }
    ];

    // Các mốc Huy hiệu Thời gian chơi của Discord
    const TIERS = [
        { hours: 1, title: "Giải Trí" },
        { hours: 5, title: "Giải trí" },
        { hours: 20, title: "Gắn bó" },
        { hours: 75, title: "Tâm huyết" },
        { hours: 150, title: "Nghiêm túc" },
        { hours: 300, title: "Tận hiến" },
        { hours: 500, title: "Lão luyện" },
        { hours: 1000, title: "Sắt đá" },
        { hours: 2000, title: "Kiên định" },
        { hours: 5000, title: "Vĩnh cửu" }
    ];

    const STORAGE_KEY_TOTAL = "lowkey_game_time_accumulated_seconds";
    const STORAGE_KEY_GAME = "lowkey_game_time_selected_game";

    const IS_LINUX = /Linux/i.test(navigator.userAgent);

    function getSavedGameIndex() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_GAME);
            if (saved != null) {
                const idx = parseInt(saved, 10);
                if (idx >= 0 && idx < SUPPORTED_GAMES.length) return idx;
            }
        } catch (_) {}
        return 0; // Mặc định CS2
    }

    let currentGameIndex = getSavedGameIndex();

    function formatTime(totalSec) {
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = Math.floor(totalSec % 60);
        const pad = n => String(n).padStart(2, '0');
        if (hours > 0) {
            return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
        }
        return `${pad(minutes)}m ${pad(seconds)}s`;
    }

    function getCurrentAndNextTier(totalHours) {
        let current = { hours: 0, title: "Chưa mở khóa" };
        let next = TIERS[0];
        for (let i = 0; i < TIERS.length; i++) {
            if (totalHours >= TIERS[i].hours) {
                current = TIERS[i];
                next = TIERS[i + 1] || null;
            }
        }
        return { current, next };
    }

    // ── Webpack Registry Injection ──────────────────────────────────────────
    function getWebpackRequire() {
        if (window.Vencord?.Webpack?.wreq?.c) return window.Vencord.Webpack.wreq;
        if (typeof webpackChunkdiscord_app === "undefined") return null;
        let req;
        webpackChunkdiscord_app.push([[Symbol("game-time")], {}, incoming => {
            if (Object.keys(incoming?.c ?? {}).length > Object.keys(req?.c ?? {}).length) req = incoming;
        }]);
        webpackChunkdiscord_app.pop();
        return req;
    }

    function collectExports(req) {
        return Object.values(req?.c ?? {}).flatMap(module => {
            try {
                const exp = module?.exports;
                if (!exp) return [];
                return [exp, exp.default, ...(typeof exp === "object" ? Object.values(exp) : [])];
            } catch (_) {
                return [];
            }
        }).filter(Boolean);
    }

    function findStore(exports, name) {
        return exports.find(value => {
            try {
                return value && typeof value === "object" &&
                    (value.getName?.() === name || value.__proto__?.constructor?.displayName === name);
            } catch (_) {
                return false;
            }
        });
    }

    function findDispatcher(exports) {
        return exports.find(value => value && typeof value.dispatch === "function" &&
            typeof value.subscribe === "function" && value._subscriptions);
    }

    const req = getWebpackRequire();
    if (!req?.c) {
        console.error("%c[Game Time] ❌ Không tìm thấy Webpack registry của Discord!", "color: red; font-weight: bold;");
        alert("Không tìm thấy Discord Webpack. Vui lòng mở script trong Discord Desktop hoặc Client có hỗ trợ DevTools.");
        return;
    }

    const exports = collectExports(req);
    const runStore = findStore(exports, "RunningGameStore");
    const dispatcher = findDispatcher(exports);

    if (!runStore || !dispatcher) {
        console.error("%c[Game Time] ❌ Không tìm thấy RunningGameStore hoặc Dispatcher!", "color: red; font-weight: bold;");
        return;
    }

    const original = {};
    const patchable = [
        "getRunningGames", "getGameForPID", "getVisibleGame", "getVisibleRunningGames",
        "getCandidateGames", "getRunningDiscordApplicationIds"
    ];
    for (const key of patchable) {
        if (typeof runStore[key] === "function") original[key] = runStore[key];
    }

    if (!original.getRunningGames || !original.getGameForPID) {
        console.error("%c[Game Time] ❌ Không tìm thấy phương thức RunningGameStore cần thiết!", "color: red; font-weight: bold;");
        return;
    }

    // Khởi tạo thông số game giả lập
    const pid = 50000 + Math.floor(Math.random() * 20000);
    const sessionStartTime = Date.now();

    function createGameEntry(gameInfo) {
        const exeName = IS_LINUX ? gameInfo.linuxExe : gameInfo.winExe;
        const exePath = IS_LINUX ? gameInfo.linuxPath : gameInfo.winPath;
        const os = IS_LINUX ? "linux" : "win32";

        return {
            id: null,
            name: gameInfo.name,
            pid,
            pidPath: [pid],
            processName: gameInfo.name,
            start: sessionStartTime,
            exeName,
            exePath,
            cmdLine: exePath,
            executables: [{ os, name: exeName, is_launcher: false }],
            windowHandle: 0,
            fullscreenType: 0,
            overlay: true,
            sandboxed: false,
            hidden: false,
            isLauncher: false
        };
    }

    let activeGameEntry = createGameEntry(SUPPORTED_GAMES[currentGameIndex]);

    const withoutOurs = games => (games ?? []).filter(item => item?.pid !== pid);

    runStore.getRunningGames = () => [...withoutOurs(original.getRunningGames.call(runStore)), activeGameEntry];
    runStore.getGameForPID = value => (value === pid ? activeGameEntry : original.getGameForPID.call(runStore, value));
    if (original.getVisibleGame) runStore.getVisibleGame = () => activeGameEntry;
    if (original.getVisibleRunningGames) {
        runStore.getVisibleRunningGames = () => [...withoutOurs(original.getVisibleRunningGames.call(runStore)), activeGameEntry];
    }
    if (original.getCandidateGames) {
        runStore.getCandidateGames = () => [...withoutOurs(original.getCandidateGames.call(runStore)), activeGameEntry];
    }

    function announce() {
        try {
            dispatcher.dispatch({
                type: "RUNNING_GAMES_CHANGE",
                added: [activeGameEntry],
                removed: [],
                games: runStore.getRunningGames()
            });

            dispatcher.dispatch({
                type: "LOCAL_ACTIVITY_UPDATE",
                socketId: null,
                pid,
                activity: {
                    name: activeGameEntry.name,
                    type: 0, // Playing
                    details: null,
                    state: null,
                    timestamps: { start: sessionStartTime },
                    assets: null
                }
            });
        } catch (e) {
            console.warn("[Game Time] Dispatch error:", e.message);
        }
    }

    // Phát tín hiệu mỗi 2 phút để giữ kết nối game detection luôn hoạt động
    const announceTimer = setInterval(announce, 2 * 60 * 1000);

    // Phát tín hiệu ban đầu
    announce();

    // ── Giao diện Overlay HUD trực quan ──────────────────────────────────────
    const HUD_ID = "lowkey-game-time-hud";
    let existingHud = document.getElementById(HUD_ID);
    if (existingHud) existingHud.remove();

    const hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 360px;
        background: rgba(18, 19, 26, 0.96);
        backdrop-filter: blur(14px);
        border: 1px solid rgba(88, 101, 242, 0.4);
        border-radius: 14px;
        box-shadow: 0 10px 35px rgba(0, 0, 0, 0.65), 0 0 15px rgba(88, 101, 242, 0.25);
        color: #ffffff;
        font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 13px;
        z-index: 999999;
        overflow: hidden;
        user-select: none;
        transition: transform 0.2s ease, opacity 0.2s ease;
    `;

    hud.innerHTML = `
        <div id="${HUD_ID}-header" style="
            background: linear-gradient(135deg, #5865f2 0%, #4752c4 100%);
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: move;
            font-weight: 700;
            font-size: 14px;
            letter-spacing: 0.3px;
        ">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>⏱️ CÀY HUY HIỆU GIỜ CHƠI</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <button id="${HUD_ID}-min-btn" style="
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    color: #fff;
                    width: 22px;
                    height: 22px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                " title="Thu nhỏ / Mở rộng">_</button>
                <button id="${HUD_ID}-close-btn" style="
                    background: rgba(237, 66, 69, 0.85);
                    border: none;
                    color: #fff;
                    width: 22px;
                    height: 22px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    font-weight: bold;
                " title="Dừng cày giờ chơi">✕</button>
            </div>
        </div>

        <div id="${HUD_ID}-body" style="padding: 14px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.05); padding: 8px 12px; border-radius: 8px;">
                <span style="color: #b5bac1;">Tựa game đang treo:</span>
                <span id="${HUD_ID}-game-name" style="font-weight: 700; color: #57f287;">${activeGameEntry.name}</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px; text-align: center; background: rgba(88, 101, 242, 0.1); border: 1px solid rgba(88, 101, 242, 0.25); padding: 10px; border-radius: 10px;">
                <span style="font-size: 11px; text-transform: uppercase; color: #949ba4; letter-spacing: 0.5px;">Thời gian phiên này</span>
                <span id="${HUD_ID}-session-timer" style="font-size: 24px; font-weight: 800; color: #ffffff; font-family: monospace;">00m 00s</span>
                <span id="${HUD_ID}-status-tag" style="font-size: 11px; color: #57f287; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <span style="width: 8px; height: 8px; background: #57f287; border-radius: 50%; display: inline-block; box-shadow: 0 0 6px #57f287;"></span>
                    Đang truyền tín hiệu chơi game tới Discord
                </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px;">
                    <span style="color: #b5bac1;">Mục tiêu tiếp theo:</span>
                    <span id="${HUD_ID}-tier-info" style="font-weight: 700; color: #f2a357;">Tâm huyết (75h) → Nghiêm túc (150h)</span>
                </div>
                <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden;">
                    <div id="${HUD_ID}-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #5865f2, #57f287); transition: width 0.4s ease;"></div>
                </div>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 4px;">
                <button id="${HUD_ID}-switch-game-btn" style="
                    flex: 1;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 12px;
                    transition: background 0.2s;
                ">🎮 Đổi Game</button>
                <button id="${HUD_ID}-stop-btn" style="
                    flex: 1;
                    padding: 8px;
                    background: rgba(237, 66, 69, 0.2);
                    border: 1px solid rgba(237, 66, 69, 0.4);
                    border-radius: 8px;
                    color: #ff7b7b;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 12px;
                    transition: background 0.2s;
                ">⏹️ Dừng cày</button>
            </div>
            
            <div style="font-size: 11px; color: #949ba4; text-align: center; line-height: 1.4;">
                💡 <b>Mẹo:</b> Cứ mở Discord và để script chạy ngầm. Sau mỗi phiên, máy chủ Discord sẽ tự động cộng dồn giờ chơi vào Huy hiệu.
            </div>
        </div>
    `;

    document.body.appendChild(hud);

    // Kéo thả HUD tự do trên màn hình
    const header = document.getElementById(`${HUD_ID}-header`);
    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    header.addEventListener("mousedown", e => {
        if (e.target.tagName === "BUTTON") return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = hud.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        hud.style.right = "auto";
        hud.style.bottom = "auto";
        hud.style.left = `${initialLeft}px`;
        hud.style.top = `${initialTop}px`;
    });

    window.addEventListener("mousemove", e => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        hud.style.left = `${Math.max(10, Math.min(window.innerWidth - hud.offsetWidth - 10, initialLeft + dx))}px`;
        hud.style.top = `${Math.max(10, Math.min(window.innerHeight - hud.offsetHeight - 10, initialTop + dy))}px`;
    });

    window.addEventListener("mouseup", () => {
        isDragging = false;
    });

    // Cập nhật đồng hồ đếm thời gian
    const timerElem = document.getElementById(`${HUD_ID}-session-timer`);
    const gameNameElem = document.getElementById(`${HUD_ID}-game-name`);
    const tierInfoElem = document.getElementById(`${HUD_ID}-tier-info`);
    const progressBarElem = document.getElementById(`${HUD_ID}-progress-bar`);
    const bodyElem = document.getElementById(`${HUD_ID}-body`);

    let isMinimized = false;
    document.getElementById(`${HUD_ID}-min-btn`).addEventListener("click", () => {
        isMinimized = !isMinimized;
        bodyElem.style.display = isMinimized ? "none" : "flex";
        document.getElementById(`${HUD_ID}-min-btn`).textContent = isMinimized ? "□" : "_";
    });

    function switchGame() {
        currentGameIndex = (currentGameIndex + 1) % SUPPORTED_GAMES.length;
        try {
            localStorage.setItem(STORAGE_KEY_GAME, String(currentGameIndex));
        } catch (_) {}

        activeGameEntry = createGameEntry(SUPPORTED_GAMES[currentGameIndex]);
        gameNameElem.textContent = activeGameEntry.name;
        announce();
        console.log(`%c[Game Time] 🔄 Đã chuyển sang game: ${activeGameEntry.name}`, "color: #57f287; font-weight: bold;");
    }

    document.getElementById(`${HUD_ID}-switch-game-btn`).addEventListener("click", switchGame);

    const updateInterval = setInterval(() => {
        const elapsedSec = (Date.now() - sessionStartTime) / 1000;
        timerElem.textContent = formatTime(elapsedSec);

        // Giả định tiến trình hiện tại của user từ ảnh là ~124 giờ
        const estimatedTotalHours = 124 + (elapsedSec / 3600);
        const { current, next } = getCurrentAndNextTier(estimatedTotalHours);

        if (next) {
            tierInfoElem.textContent = `${current.title} (${Math.floor(estimatedTotalHours)}h) → ${next.title} (${next.hours}h)`;
            const range = next.hours - current.hours;
            const progressInRange = estimatedTotalHours - current.hours;
            const pct = Math.min(100, Math.max(0, (progressInRange / range) * 100));
            progressBarElem.style.width = `${pct.toFixed(1)}%`;
        } else {
            tierInfoElem.textContent = `${current.title} (${Math.floor(estimatedTotalHours)}h) - Cấp tối đa!`;
            progressBarElem.style.width = "100%";
        }
    }, 1000);

    // Hàm dừng sạch sẽ
    function stop() {
        clearInterval(announceTimer);
        clearInterval(updateInterval);

        // Khôi phục RunningGameStore
        for (const [key, fn] of Object.entries(original)) {
            runStore[key] = fn;
        }

        try {
            dispatcher.dispatch({
                type: "RUNNING_GAMES_CHANGE",
                added: [],
                removed: [activeGameEntry],
                games: withoutOurs(original.getRunningGames.call(runStore))
            });
            dispatcher.dispatch({
                type: "LOCAL_ACTIVITY_UPDATE",
                socketId: null,
                pid,
                activity: null
            });
        } catch (_) {}

        if (hud?.parentNode) hud.remove();
        delete window[LOCK_KEY];
        console.log("%c[Game Time] ⏹️ Đã dừng cày giờ chơi và khôi phục Discord hoàn tất.", "color: #ed4245; font-weight: bold;");
    }

    document.getElementById(`${HUD_ID}-close-btn`).addEventListener("click", stop);
    document.getElementById(`${HUD_ID}-stop-btn`).addEventListener("click", stop);
    window.addEventListener("pagehide", stop, { once: true });

    window[LOCK_KEY] = {
        stop,
        game: activeGameEntry,
        switchGame
    };

    console.log(
        "%c[Lowkey Game Time] ✅ Đang cày giờ chơi tự động cho: " + activeGameEntry.name + "\n" +
        "⏱️ Giữ Discord mở, giờ chơi sẽ liên tục được tích lũy vào Huy hiệu của bạn.\n" +
        "⏹️ Để dừng: gọi lệnh window.__LOWKEY_GAME_TIME__.stop() hoặc bấm nút ✕ trên bảng điều khiển.",
        "color: #5865f2; font-size: 13px; font-weight: bold;"
    );
})();
