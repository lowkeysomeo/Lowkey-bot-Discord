/**
 * Lowkey Game Variety Badge Presence Script
 * Tự động 100% cày tiến trình Huy hiệu "Trò chơi đa dạng" (Game Variety) lên mốc 100 game (Thuyết phổ quát)
 * Tương thích: DevTools Console, Vencord, và Chrome DevTools Protocol (CDP) Runner
 */

(() => {
    "use strict";

    const LOCK_KEY = "__LOWKEY_GAME_VARIETY__";

    // Nếu đã chạy trước đó thì dọn dẹp hoặc cảnh báo
    if (window[LOCK_KEY]?.stop) {
        console.warn("[Game Variety] Script đang chạy rồi. Đang khởi động lại...");
        window[LOCK_KEY].stop();
    }

    // Cấu hình thời gian chạy mỗi game (ms). Mặc định 20 giây mỗi game để Discord kịp ghi nhận launch_game & heartbeat
    const CONFIG = {
        DURATION_PER_GAME_MS: 20000, // 20 giây mỗi game
        TARGET_GAMES: 100,           // Mốc tối đa của huy hiệu (Thuyết phổ quát)
        AUTO_NEXT: true,
        STORAGE_KEY: "lowkey_game_variety_completed_v1"
    };

    // Danh sách 130 tựa game PC nổi tiếng có trong danh mục nhận diện (Detectable Games) của Discord
    const GAME_CATALOG = Object.freeze([
        { name: "Counter-Strike 2", exe: "cs2.exe" },
        { name: "Dota 2", exe: "dota2.exe" },
        { name: "Team Fortress 2", exe: "hl2.exe" },
        { name: "Half-Life 2", exe: "hl2.exe" },
        { name: "Portal 2", exe: "portal2.exe" },
        { name: "Left 4 Dead 2", exe: "left4dead2.exe" },
        { name: "VALORANT", exe: "VALORANT-Win64-Shipping.exe" },
        { name: "League of Legends", exe: "League of Legends.exe" },
        { name: "Apex Legends", exe: "r5apex.exe" },
        { name: "Fortnite", exe: "FortniteClient-Win64-Shipping.exe" },
        { name: "Overwatch 2", exe: "Overwatch.exe" },
        { name: "Minecraft", exe: "Minecraft.exe" },
        { name: "Roblox", exe: "RobloxPlayerBeta.exe" },
        { name: "Genshin Impact", exe: "GenshinImpact.exe" },
        { name: "Honkai: Star Rail", exe: "StarRail.exe" },
        { name: "Zenless Zone Zero", exe: "ZenlessZoneZero.exe" },
        { name: "Grand Theft Auto V", exe: "GTA5.exe" },
        { name: "Red Dead Redemption 2", exe: "RDR2.exe" },
        { name: "Cyberpunk 2077", exe: "Cyberpunk2077.exe" },
        { name: "The Witcher 3: Wild Hunt", exe: "witcher3.exe" },
        { name: "Elden Ring", exe: "eldenring.exe" },
        { name: "Dark Souls III", exe: "DarkSoulsIII.exe" },
        { name: "Sekiro: Shadows Die Twice", exe: "sekiro.exe" },
        { name: "Baldur's Gate 3", exe: "bg3_dx11.exe" },
        { name: "Black Myth: Wukong", exe: "b1-Win64-Shipping.exe" },
        { name: "PUBG: BATTLEGROUNDS", exe: "TslGame.exe" },
        { name: "Rust", exe: "RustClient.exe" },
        { name: "Palworld", exe: "Palworld-Win64-Shipping.exe" },
        { name: "Terraria", exe: "Terraria.exe" },
        { name: "Stardew Valley", exe: "Stardew Valley.exe" },
        { name: "Helldivers 2", exe: "helldivers2.exe" },
        { name: "Warframe", exe: "Warframe.x64.exe" },
        { name: "Destiny 2", exe: "destiny2.exe" },
        { name: "Diablo IV", exe: "Diablo IV.exe" },
        { name: "Path of Exile", exe: "PathOfExile.exe" },
        { name: "World of Warcraft", exe: "Wow.exe" },
        { name: "FINAL FANTASY XIV", exe: "ffxiv_dx11.exe" },
        { name: "Tom Clancy's Rainbow Six Siege", exe: "RainbowSix.exe" },
        { name: "Escape from Tarkov", exe: "EscapeFromTarkov.exe" },
        { name: "Lethal Company", exe: "Lethal Company.exe" },
        { name: "Among Us", exe: "Among Us.exe" },
        { name: "Fall Guys", exe: "FallGuys_client.exe" },
        { name: "Rocket League", exe: "RocketLeague.exe" },
        { name: "Garry's Mod", exe: "gmod.exe" },
        { name: "osu!", exe: "osu!.exe" },
        { name: "EA SPORTS FC 25", exe: "FC25.exe" },
        { name: "Forza Horizon 5", exe: "ForzaHorizon5.exe" },
        { name: "Euro Truck Simulator 2", exe: "eurotrucks2.exe" },
        { name: "American Truck Simulator", exe: "amtrucks.exe" },
        { name: "BeamNG.drive", exe: "BeamNG.drive.x64.exe" },
        { name: "Assetto Corsa", exe: "acs.exe" },
        { name: "Need for Speed Unbound", exe: "NeedForSpeedUnbound.exe" },
        { name: "Cities: Skylines II", exe: "Cities2.exe" },
        { name: "Factorio", exe: "factorio.exe" },
        { name: "Satisfactory", exe: "FactoryGame.exe" },
        { name: "RimWorld", exe: "RimWorldWin64.exe" },
        { name: "Frostpunk 2", exe: "Frostpunk2.exe" },
        { name: "Sid Meier's Civilization VI", exe: "CivilizationVI.exe" },
        { name: "Age of Empires IV", exe: "RelicCardinal.exe" },
        { name: "Total War: WARHAMMER III", exe: "Warhammer3.exe" },
        { name: "Crusader Kings III", exe: "ck3.exe" },
        { name: "Europa Universalis IV", exe: "eu4.exe" },
        { name: "Hearts of Iron IV", exe: "hoi4.exe" },
        { name: "Stellaris", exe: "stellaris.exe" },
        { name: "Deep Rock Galactic", exe: "FSD-Win64-Shipping.exe" },
        { name: "War Thunder", exe: "aces.exe" },
        { name: "World of Tanks", exe: "WorldOfTanks.exe" },
        { name: "World of Warships", exe: "WorldOfWarships64.exe" },
        { name: "Call of Duty", exe: "cod.exe" },
        { name: "Battlefield 2042", exe: "BF2042.exe" },
        { name: "Halo Infinite", exe: "HaloInfinite.exe" },
        { name: "DOOM Eternal", exe: "DOOMEternalx64vk.exe" },
        { name: "PAYDAY 2", exe: "payday2_win32_release.exe" },
        { name: "Ready or Not", exe: "ReadyOrNot-Win64-Shipping.exe" },
        { name: "Squad", exe: "SquadGame.exe" },
        { name: "Arma 3", exe: "arma3_x64.exe" },
        { name: "Hell Let Loose", exe: "HLL-Win64-Shipping.exe" },
        { name: "Dead by Daylight", exe: "DeadByDaylight-Win64-Shipping.exe" },
        { name: "Phasmophobia", exe: "Phasmophobia.exe" },
        { name: "Hades II", exe: "Hades2.exe" },
        { name: "Dead Cells", exe: "deadcells.exe" },
        { name: "Hollow Knight", exe: "hollow_knight.exe" },
        { name: "Celeste", exe: "Celeste.exe" },
        { name: "Cuphead", exe: "Cuphead.exe" },
        { name: "The Binding of Isaac: Rebirth", exe: "isaac-ng.exe" },
        { name: "Vampire Survivors", exe: "VampireSurvivors.exe" },
        { name: "Risk of Rain 2", exe: "Risk of Rain 2.exe" },
        { name: "Slay the Spire", exe: "SlayTheSpire.exe" },
        { name: "Balatro", exe: "Balatro.exe" },
        { name: "Dave the Diver", exe: "DaveTheDiver.exe" },
        { name: "Disco Elysium", exe: "disco.exe" },
        { name: "Undertale", exe: "UNDERTALE.exe" },
        { name: "Resident Evil 4", exe: "re4.exe" },
        { name: "Silent Hill 2", exe: "SHProto-Win64-Shipping.exe" },
        { name: "Dead Space", exe: "DeadSpace.exe" },
        { name: "Alan Wake 2", exe: "AlanWake2.exe" },
        { name: "The Last of Us Part I", exe: "tlou-i.exe" },
        { name: "God of War Ragnarök", exe: "GoWR.exe" },
        { name: "Horizon Forbidden West", exe: "HorizonForbiddenWest.exe" },
        { name: "Ghost of Tsushima", exe: "GhostOfTsushima.exe" },
        { name: "Marvel's Spider-Man Remastered", exe: "Spider-Man.exe" },
        { name: "Death Stranding", exe: "ds.exe" },
        { name: "No Man's Sky", exe: "NMS.exe" },
        { name: "Subnautica", exe: "Subnautica.exe" },
        { name: "Sea of Thieves", exe: "SoTGame.exe" },
        { name: "Monster Hunter: World", exe: "MonsterHunterWorld.exe" },
        { name: "Hogwarts Legacy", exe: "HogwartsLegacy.exe" },
        { name: "PAYDAY 3", exe: "PAYDAY3Client-Win64-Shipping.exe" },
        { name: "The Finals", exe: "Discovery.exe" },
        { name: "Brawlhalla", exe: "Brawlhalla.exe" },
        { name: "Smite 2", exe: "Smite2.exe" },
        { name: "Trackmania", exe: "Trackmania.exe" },
        { name: "Hunt: Showdown 1896", exe: "HuntGame.exe" },
        { name: "StarCraft II", exe: "SC2_x64.exe" },
        { name: "Warcraft III", exe: "Warcraft III.exe" },
        { name: "Oxygen Not Included", exe: "OxygenNotIncluded.exe" },
        { name: "Foxhole", exe: "War-Win64-Shipping.exe" },
        { name: "Insurgency: Sandstorm", exe: "InsurgencyClient-Win64-Shipping.exe" },
        { name: "Assetto Corsa Competizione", exe: "acc.exe" },
        { name: "DayZ", exe: "DayZ_x64.exe" },
        { name: "ARK: Survival Ascended", exe: "ArkAscended.exe" },
        { name: "Divinity: Original Sin 2", exe: "EoCApp.exe" },
        { name: "Guild Wars 2", exe: "Gw2-64.exe" },
        { name: "The Elder Scrolls Online", exe: "eso64.exe" },
        { name: "Lost Ark", exe: "LOSTARK.exe" }
    ]);

    // Bảng mốc danh hiệu Discord Game Variety
    const TIERS = [
        { count: 2, title: "Người dùng thử" },
        { count: 5, title: "Người chơi qua" },
        { count: 10, title: "Người đam mê" },
        { count: 15, title: "Trinh Sát" },
        { count: 20, title: "Người khám phá" },
        { count: 30, title: "Nhà Thám Hiểm" },
        { count: 40, title: "Nhà du hành" },
        { count: 60, title: "Người khác biệt" },
        { count: 80, title: "Người đa tài" },
        { count: 100, title: "Thuyết phổ quát (Tối đa)" }
    ];

    function getTierTitle(count) {
        let currentTitle = "Chưa mở khóa";
        for (const t of TIERS) {
            if (count >= t.count) currentTitle = t.title;
        }
        return currentTitle;
    }

    // Trích xuất Webpack Registry của Discord
    function getWebpackRequire() {
        if (window.Vencord?.Webpack?.wreq?.c) return window.Vencord.Webpack.wreq;
        if (typeof webpackChunkdiscord_app === "undefined") return null;
        let req;
        webpackChunkdiscord_app.push([[Symbol("game-variety")], {}, incoming => {
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
        console.error("%c[Game Variety] ❌ Không tìm thấy Webpack registry của Discord!", "color: red; font-weight: bold;");
        return;
    }

    const exports = collectExports(req);
    const runStore = findStore(exports, "RunningGameStore");
    const dispatcher = findDispatcher(exports);

    if (!runStore || !dispatcher) {
        console.error("%c[Game Variety] ❌ Không tìm thấy RunningGameStore hoặc Dispatcher!", "color: red; font-weight: bold;");
        return;
    }

    // Lưu trữ các hàm nguyên bản của RunningGameStore để khôi phục khi hoàn tất
    const original = {};
    const patchable = ["getRunningGames", "getGameForPID", "getVisibleGame", "getVisibleRunningGames", "getCandidateGames"];
    for (const key of patchable) {
        if (typeof runStore[key] === "function") original[key] = runStore[key];
    }

    if (!original.getRunningGames || !original.getGameForPID) {
        console.error("%c[Game Variety] ❌ Không tìm thấy phương thức cần thiết trên RunningGameStore!", "color: red; font-weight: bold;");
        return;
    }

    // Quản lý trạng thái đã cày
    let completedSet = new Set();
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (raw) completedSet = new Set(JSON.parse(raw));
    } catch (_) {}

    const fakePid = 48000 + Math.floor(Math.random() * 5000);
    let currentIndex = 0;
    let currentGame = null;
    let timer = null;
    let isPaused = false;
    let countdownInterval = null;
    let remainingSeconds = CONFIG.DURATION_PER_GAME_MS / 1000;

    // Tìm index đầu tiên chưa cày
    for (let i = 0; i < GAME_CATALOG.length; i++) {
        if (!completedSet.has(GAME_CATALOG[i].name)) {
            currentIndex = i;
            break;
        }
    }

    const buildGamePayload = (item) => {
        const isLinux = /Linux/i.test(navigator.userAgent);
        const exeName = isLinux ? item.exe.replace(/\.exe$/i, "") : item.exe;
        return {
            id: null,
            name: item.name,
            pid: fakePid,
            pidPath: [fakePid],
            processName: item.name,
            start: Date.now(),
            exeName: exeName,
            exePath: `C:\\Program Files\\Steam\\steamapps\\common\\${item.name}\\${exeName}`,
            cmdLine: `"${exeName}"`,
            executables: [{ os: isLinux ? "linux" : "win32", name: exeName, is_launcher: false }],
            windowHandle: 12345,
            fullscreenType: 0,
            overlay: false,
            sandboxed: false,
            hidden: false,
            isLauncher: false
        };
    };

    const realGames = () => (original.getRunningGames.call(runStore) ?? []).filter(g => g?.pid !== fakePid);

    // Patch store
    runStore.getRunningGames = () => currentGame ? [...realGames(), currentGame] : realGames();
    runStore.getGameForPID = (pid) => (pid === fakePid && currentGame) ? currentGame : original.getGameForPID.call(runStore, pid);
    if (original.getVisibleGame) runStore.getVisibleGame = () => currentGame ?? original.getVisibleGame.call(runStore);
    if (original.getVisibleRunningGames) {
        runStore.getVisibleRunningGames = () => currentGame
            ? [...(original.getVisibleRunningGames.call(runStore) ?? []).filter(g => g?.pid !== fakePid), currentGame]
            : original.getVisibleRunningGames.call(runStore);
    }
    if (original.getCandidateGames) {
        runStore.getCandidateGames = () => currentGame
            ? [...(original.getCandidateGames.call(runStore) ?? []).filter(g => g?.pid !== fakePid), currentGame]
            : original.getCandidateGames.call(runStore);
    }

    const dispatchRemoval = (game) => {
        if (!game) return;
        dispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", added: [], removed: [game], games: realGames() });
        dispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", socketId: null, pid: fakePid, activity: null });
    };

    // Tạo giao diện Mini Overlay trên Discord Client
    function createOverlayUI() {
        const id = "lowkey-variety-overlay";
        let existing = document.getElementById(id);
        if (existing) existing.remove();

        const el = document.createElement("div");
        el.id = id;
        el.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 360px;
            background: rgba(22, 24, 30, 0.95);
            border: 1px solid #5865F2;
            border-radius: 12px;
            padding: 16px;
            color: #fff;
            font-family: 'gg sans', 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            z-index: 999999;
            backdrop-filter: blur(8px);
        `;

        el.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">🎮</span>
                    <div>
                        <div style="font-weight: 700; font-size: 14px; color: #5865F2;">Auto Cày Huy Hiệu Trò Chơi</div>
                        <div style="font-size: 11px; color: #b5bac1;" id="lv-tier-text">Cấp độ: Đang tính...</div>
                    </div>
                </div>
                <button id="lv-close-btn" style="background:none;border:none;color:#b5bac1;cursor:pointer;font-size:16px;">✕</button>
            </div>

            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px; margin-bottom: 12px;">
                <div style="font-size: 11px; color: #949ba4; text-transform: uppercase; font-weight: 600;">Game hiện tại:</div>
                <div id="lv-current-game" style="font-size: 14px; font-weight: 600; color: #57F287; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Đang khởi tạo...</div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #b5bac1; margin-top: 6px;">
                    <span>Tiến độ: <b id="lv-progress-count">0/100</b></span>
                    <span>Đổi sau: <b id="lv-countdown" style="color: #FEE75C;">20s</b></span>
                </div>
                <div style="width: 100%; height: 6px; background: #2f3136; border-radius: 3px; margin-top: 8px; overflow: hidden;">
                    <div id="lv-progress-bar" style="width: 0%; height: 100%; background: #5865F2; transition: width 0.3s;"></div>
                </div>
            </div>

            <div style="display: flex; gap: 8px;">
                <button id="lv-next-btn" style="flex: 1; background: #5865F2; border: none; border-radius: 6px; color: white; padding: 8px 12px; font-weight: 600; font-size: 12px; cursor: pointer;">⏩ Chuyển ngay</button>
                <button id="lv-pause-btn" style="flex: 1; background: #4f545c; border: none; border-radius: 6px; color: white; padding: 8px 12px; font-weight: 600; font-size: 12px; cursor: pointer;">⏸️ Tạm dừng</button>
                <button id="lv-stop-btn" style="background: #ed4245; border: none; border-radius: 6px; color: white; padding: 8px 12px; font-weight: 600; font-size: 12px; cursor: pointer;">⏹️ Dừng</button>
            </div>
        `;

        document.body.appendChild(el);

        document.getElementById("lv-next-btn").onclick = () => next();
        document.getElementById("lv-pause-btn").onclick = () => togglePause();
        document.getElementById("lv-stop-btn").onclick = () => stop();
        document.getElementById("lv-close-btn").onclick = () => el.remove();
    }

    function updateOverlayUI() {
        const gameEl = document.getElementById("lv-current-game");
        const countEl = document.getElementById("lv-progress-count");
        const countBar = document.getElementById("lv-progress-bar");
        const tierEl = document.getElementById("lv-tier-text");
        const countdownEl = document.getElementById("lv-countdown");

        const count = completedSet.size;
        const target = CONFIG.TARGET_GAMES;
        const pct = Math.min(100, Math.round((count / target) * 100));

        if (gameEl && currentGame) gameEl.textContent = currentGame.name;
        if (countEl) countEl.textContent = `${count}/${target} game`;
        if (countBar) countBar.style.width = `${pct}%`;
        if (tierEl) tierEl.textContent = `Huy hiệu: ${getTierTitle(count)} (${pct}%)`;
        if (countdownEl) countdownEl.textContent = isPaused ? "Tạm dừng" : `${remainingSeconds}s`;
    }

    function togglePause() {
        isPaused = !isPaused;
        const btn = document.getElementById("lv-pause-btn");
        if (btn) btn.textContent = isPaused ? "▶️ Tiếp tục" : "⏸️ Tạm dừng";
        if (isPaused) {
            console.log("[Game Variety] ⏸️ Đã tạm dừng cày game.");
        } else {
            console.log("[Game Variety] ▶️ Đang tiếp tục cày...");
        }
        updateOverlayUI();
    }

    // Kích hoạt một game trong Discord
    const activate = (item) => {
        const previous = currentGame;
        if (previous) {
            dispatchRemoval(previous);
            completedSet.add(previous.name);
            try {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(Array.from(completedSet)));
            } catch (_) {}
        }

        currentGame = buildGamePayload(item);

        // Phát sự kiện RUNNING_GAMES_CHANGE
        dispatcher.dispatch({
            type: "RUNNING_GAMES_CHANGE",
            added: [currentGame],
            removed: [],
            games: runStore.getRunningGames()
        });

        // Phát sự kiện LOCAL_ACTIVITY_UPDATE (hiển thị trạng thái "Đang chơi...")
        dispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: null,
            pid: fakePid,
            activity: {
                name: currentGame.name,
                type: 0,
                details: null,
                state: null,
                timestamps: { start: currentGame.start },
                assets: null
            }
        });

        remainingSeconds = Math.round(CONFIG.DURATION_PER_GAME_MS / 1000);
        updateOverlayUI();

        console.log(
            `%c[Game Variety] 🎮 [${completedSet.size + 1}/${CONFIG.TARGET_GAMES}] Đang chơi: ${currentGame.name} (Huy hiệu hiện tại: ${getTierTitle(completedSet.size + 1)})`,
            "color: #57F287; font-weight: bold;"
        );
    };

    const next = () => {
        if (completedSet.size >= CONFIG.TARGET_GAMES) {
            finishAll();
            return;
        }

        // Tìm game kế tiếp chưa cày
        let found = false;
        for (let step = 0; step < GAME_CATALOG.length; step++) {
            currentIndex = (currentIndex + 1) % GAME_CATALOG.length;
            const candidate = GAME_CATALOG[currentIndex];
            if (!completedSet.has(candidate.name)) {
                activate(candidate);
                found = true;
                break;
            }
        }

        if (!found) {
            finishAll();
        }
    };

    const finishAll = () => {
        stop();
        window.__LOWKEY_GAME_VARIETY_FINISHED__ = true;
        console.log(
            "%c[Game Variety] 🎉 CHÚC MỪNG! Đã hoàn thành 100/100 trò chơi! Huy hiệu của bạn sẽ sớm đạt mốc Thuyết phổ quát!",
            "color: #FEE75C; font-size: 16px; font-weight: bold;"
        );
        const overlay = document.getElementById("lowkey-variety-overlay");
        if (overlay) {
            overlay.innerHTML = `
                <div style="text-align: center; padding: 12px;">
                    <div style="font-size: 32px;">🏆</div>
                    <div style="font-weight: 700; font-size: 16px; color: #FEE75C; margin: 8px 0;">HOÀN TẤT 100% CÀY HUY HIỆU!</div>
                    <div style="font-size: 12px; color: #b5bac1;">Đã ghi nhận 100 trò chơi PC detectable. Discord sẽ cập nhật huy hiệu "Thuyết phổ quát" trên hồ sơ của bạn.</div>
                    <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 14px; background: #5865F2; border:none; border-radius:6px; color:white; padding:8px 18px; font-weight:600; cursor:pointer;">Đóng</button>
                </div>
            `;
        }
    };

    const stop = () => {
        if (timer) clearTimeout(timer);
        if (countdownInterval) clearInterval(countdownInterval);
        timer = null;
        countdownInterval = null;

        const previous = currentGame;
        currentGame = null;

        for (const [key, fn] of Object.entries(original)) {
            runStore[key] = fn;
        }

        dispatchRemoval(previous);
        delete window[LOCK_KEY];

        const overlay = document.getElementById("lowkey-variety-overlay");
        if (overlay) overlay.remove();

        console.log("%c[Game Variety] ⏹️ Đã dừng và khôi phục trạng thái Discord ban đầu.", "color: #faa61a; font-weight: bold;");
    };

    // Vòng lặp đếm ngược và đổi game
    countdownInterval = setInterval(() => {
        if (isPaused) return;
        if (remainingSeconds > 0) {
            remainingSeconds--;
            const countdownEl = document.getElementById("lv-countdown");
            if (countdownEl) countdownEl.textContent = `${remainingSeconds}s`;
        } else {
            next();
        }
    }, 1000);

    createOverlayUI();
    activate(GAME_CATALOG[currentIndex]);

    // Gán API toàn cục để người dùng điều khiển
    window[LOCK_KEY] = {
        stop,
        next,
        togglePause,
        get current() { return currentGame?.name ?? null; },
        get count() { return completedSet.size; },
        get completed() { return Array.from(completedSet); },
        resetProgress() {
            completedSet.clear();
            localStorage.removeItem(CONFIG.STORAGE_KEY);
            console.log("[Game Variety] Đã đặt lại toàn bộ tiến độ.");
        }
    };

    console.log(
        "%c[Game Variety] 🚀 Script đã khởi chạy thành công! Cửa sổ Overlay hiển thị ở góc dưới bên phải màn hình Discord.",
        "color: #5865F2; font-weight: bold;"
    );
})();
