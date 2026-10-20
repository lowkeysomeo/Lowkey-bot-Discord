/**
 * Lowkey Combo Badge Presence Script (2-in-1 Dual Runner)
 * Chạy ĐỒNG THỜI cả 2 nhiệm vụ huy hiệu Discord trên cùng 1 phiên:
 * 1. Huy hiệu "Trò chơi đa dạng" (Game Variety) — Xoay vòng 100+ tựa game PC (mỗi game 6 phút chuẩn Discord Telemetry)
 * 2. Huy hiệu "Thời gian chơi" (Game Time / Dedicated) — Tích lũy giờ chơi liên tục không ngắt quãng
 * Tương thích: DevTools Console (F12), Vencord, và Chrome DevTools Protocol (CDP)
 */

(() => {
    "use strict";

    const LOCK_KEY = "__LOWKEY_COMBO_BADGE__";

    if (window[LOCK_KEY]?.stop) {
        console.warn("[Combo Badge] Đang dừng phiên cũ để khởi động lại...");
        window[LOCK_KEY].stop();
    }

    // Cấu hình Combo
    // Đặt mặc định 6 phút (360.000 ms) để máy chủ Discord kịp ghi nhận ít nhất 2-3 chu kỳ heartbeat/telemetry
    let currentDurationSec = 360; // 6 phút

    const CONFIG = {
        STORAGE_VARIETY_KEY: "lowkey_game_variety_completed_v1",
        STORAGE_GAMETIME_KEY: "lowkey_game_time_accumulated_seconds",
        MAIN_GAME_NAME: "Counter-Strike 2"
    };

    // 130 tựa game Detectable cho Huy hiệu Trò chơi đa dạng
    const VARIETY_GAMES = Object.freeze([
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
        { name: "Subnautica", exe: "Subnautica.exe" },
        { name: "No Man's Sky", exe: "NMS.exe" },
        { name: "ARK: Survival Evolved", exe: "ShooterGame.exe" },
        { name: "Sea of Thieves", exe: "SoTGame.exe" },
        { name: "Valheim", exe: "valheim.exe" },
        { name: "Monster Hunter: World", exe: "MonsterHunterWorld.exe" },
        { name: "Monster Hunter Rise", exe: "MonsterHunterRise.exe" },
        { name: "God of War", exe: "GoW.exe" },
        { name: "Marvel's Spider-Man Remastered", exe: "Spider-Man.exe" },
        { name: "Horizon Zero Dawn", exe: "HorizonZeroDawn.exe" },
        { name: "Death Stranding", exe: "ds.exe" },
        { name: "Resident Evil 4", exe: "re4.exe" },
        { name: "Resident Evil Village", exe: "re8.exe" },
        { name: "Resident Evil 2", exe: "re2.exe" },
        { name: "SILENT HILL 2", exe: "SHProto-Win64-Shipping.exe" },
        { name: "Street Fighter 6", exe: "StreetFighter6.exe" },
        { name: "TEKKEN 8", exe: "Polaris-Win64-Shipping.exe" },
        { name: "Mortal Kombat 1", exe: "MK12.exe" },
        { name: "Guilty Gear -Strive-", exe: "GGST-Win64-Shipping.exe" },
        { name: "DRAGON BALL: Sparking! ZERO", exe: "SparkingZERO-Win64-Shipping.exe" },
        { name: "S.T.A.L.K.E.R. 2: Heart of Chornobyl", exe: "Stalker2-Win64-Shipping.exe" },
        { name: "Space Marine 2", exe: "Warhammer 40000 Space Marine 2 - Retail.exe" },
        { name: "Metaphor: ReFantazio", exe: "METAPHOR.exe" },
        { name: "Persona 3 Reload", exe: "p3r.exe" },
        { name: "Persona 5 Royal", exe: "P5R.exe" },
        { name: "Like a Dragon: Infinite Wealth", exe: "likeadragon8.exe" },
        { name: "Yakuza: Like a Dragon", exe: "YakuzaLikeADragon.exe" },
        { name: "Starfield", exe: "Starfield.exe" },
        { name: "Fallout 4", exe: "Fallout4.exe" },
        { name: "Fallout 76", exe: "Fallout76.exe" },
        { name: "The Elder Scrolls V: Skyrim", exe: "SkyrimSE.exe" },
        { name: "The Elder Scrolls Online", exe: "eso64.exe" },
        { name: "Guild Wars 2", exe: "Gw2-64.exe" },
        { name: "Lost Ark", exe: "LOSTARK.exe" }
    ]);

    const VARIETY_TIERS = [
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

    const GAMETIME_TIERS = [
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

    function getVarietyTierTitle(count) {
        let title = "Chưa mở khóa";
        for (const t of VARIETY_TIERS) {
            if (count >= t.count) title = t.title;
        }
        return title;
    }

    const IS_LINUX = /Linux/i.test(navigator.userAgent);

    // ── Webpack Registry Injection ──────────────────────────────────────────
    function getWebpackRequire() {
        if (window.Vencord?.Webpack?.wreq?.c) return window.Vencord.Webpack.wreq;
        if (typeof webpackChunkdiscord_app === "undefined") return null;
        let req;
        webpackChunkdiscord_app.push([[Symbol("combo-badge")], {}, incoming => {
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
        console.error("%c[Combo] ❌ Không tìm thấy Webpack registry của Discord!", "color: red; font-weight: bold;");
        return;
    }

    const exports = collectExports(req);
    const runStore = findStore(exports, "RunningGameStore");
    const dispatcher = findDispatcher(exports);

    if (!runStore || !dispatcher) {
        console.error("%c[Combo] ❌ Không tìm thấy RunningGameStore hoặc Dispatcher!", "color: red; font-weight: bold;");
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
        console.error("%c[Combo] ❌ Thiếu phương thức RunningGameStore cần thiết!", "color: red; font-weight: bold;");
        return;
    }

    // Quản lý trạng thái 100 game đã hoàn thành
    let completedSet = new Set();
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_VARIETY_KEY);
        if (raw) completedSet = new Set(JSON.parse(raw));
    } catch (_) {}

    const PID_MAIN = 41000 + Math.floor(Math.random() * 5000);
    const PID_VARIETY = 51000 + Math.floor(Math.random() * 5000);
    const sessionStartTime = Date.now();

    // 1. Game chính cày Giờ chơi (CS2) - giữ nguyên từ đầu tới cuối
    const gameMain = {
        id: null,
        name: CONFIG.MAIN_GAME_NAME,
        pid: PID_MAIN,
        pidPath: [PID_MAIN],
        processName: CONFIG.MAIN_GAME_NAME,
        start: sessionStartTime,
        exeName: IS_LINUX ? "cs2" : "cs2.exe",
        exePath: IS_LINUX ? "/home/user/cs2" : "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe",
        cmdLine: "cs2.exe",
        executables: [{ os: IS_LINUX ? "linux" : "win32", name: IS_LINUX ? "cs2" : "cs2.exe", is_launcher: false }],
        windowHandle: 0,
        fullscreenType: 0,
        overlay: true,
        sandboxed: false,
        hidden: false,
        isLauncher: false
    };

    // 2. Game xoay vòng cày 100 Game (Variety)
    let currentVarietyIndex = 0;
    let gameVariety = null;

    function buildVarietyGameEntry(gameInfo) {
        return {
            id: null,
            name: gameInfo.name,
            pid: PID_VARIETY,
            pidPath: [PID_VARIETY],
            processName: gameInfo.name,
            start: Date.now(),
            exeName: gameInfo.exe,
            exePath: `C:\\Games\\${gameInfo.name}\\${gameInfo.exe}`,
            cmdLine: gameInfo.exe,
            executables: [{ os: IS_LINUX ? "linux" : "win32", name: gameInfo.exe, is_launcher: false }],
            windowHandle: 0,
            fullscreenType: 0,
            overlay: true,
            sandboxed: false,
            hidden: false,
            isLauncher: false
        };
    }

    const withoutOurs = games => (games ?? []).filter(item => item?.pid !== PID_MAIN && item?.pid !== PID_VARIETY);

    runStore.getRunningGames = () => {
        const base = withoutOurs(original.getRunningGames.call(runStore));
        return gameVariety ? [...base, gameMain, gameVariety] : [...base, gameMain];
    };

    runStore.getGameForPID = value => {
        if (value === PID_MAIN) return gameMain;
        if (value === PID_VARIETY) return gameVariety;
        return original.getGameForPID.call(runStore, value);
    };

    if (original.getVisibleGame) runStore.getVisibleGame = () => gameMain;
    if (original.getVisibleRunningGames) {
        runStore.getVisibleRunningGames = () => runStore.getRunningGames();
    }
    if (original.getCandidateGames) {
        runStore.getCandidateGames = () => runStore.getRunningGames();
    }

    function announce() {
        try {
            const runningList = runStore.getRunningGames();
            dispatcher.dispatch({
                type: "RUNNING_GAMES_CHANGE",
                added: [gameMain, ...(gameVariety ? [gameVariety] : [])],
                removed: [],
                games: runningList
            });

            // Gửi activity chính cày giờ chơi liên tục
            dispatcher.dispatch({
                type: "LOCAL_ACTIVITY_UPDATE",
                socketId: null,
                pid: PID_MAIN,
                activity: {
                    name: gameMain.name,
                    type: 0,
                    details: null,
                    state: null,
                    timestamps: { start: sessionStartTime },
                    assets: null
                }
            });

            // Gửi activity game variety xoay vòng
            if (gameVariety) {
                dispatcher.dispatch({
                    type: "LOCAL_ACTIVITY_UPDATE",
                    socketId: null,
                    pid: PID_VARIETY,
                    activity: {
                        name: gameVariety.name,
                        type: 0,
                        details: null,
                        state: null,
                        timestamps: { start: gameVariety.start },
                        assets: null
                    }
                });
            }
        } catch (e) {
            console.warn("[Combo] Dispatch error:", e.message);
        }
    }

    // ── Giao diện Overlay HUD Kép (Dual Progress) ───────────────────────────
    const HUD_ID = "lowkey-combo-badge-hud";
    let existingHud = document.getElementById(HUD_ID);
    if (existingHud) existingHud.remove();

    const hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 390px;
        background: rgba(18, 19, 26, 0.96);
        backdrop-filter: blur(14px);
        border: 1px solid rgba(88, 101, 242, 0.5);
        border-radius: 14px;
        box-shadow: 0 10px 35px rgba(0, 0, 0, 0.7), 0 0 20px rgba(88, 101, 242, 0.3);
        color: #ffffff;
        font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 13px;
        z-index: 999999;
        overflow: hidden;
        user-select: none;
    `;

    hud.innerHTML = `
        <div id="${HUD_ID}-header" style="
            background: linear-gradient(135deg, #5865f2 0%, #eb459e 100%);
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: move;
            font-weight: 700;
            font-size: 14px;
        ">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>⚡ CÀY COMBO 2 HUY HIỆU CÙNG LÚC</span>
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
                ">_</button>
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
                ">✕</button>
            </div>
        </div>

        <div id="${HUD_ID}-body" style="padding: 14px; display: flex; flex-direction: column; gap: 12px;">
            <!-- Phần 1: Huy hiệu Thời gian chơi -->
            <div style="background: rgba(88, 101, 242, 0.12); border: 1px solid rgba(88, 101, 242, 0.3); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: #5865f2; font-size: 12px;">⏱️ 1. THỜI GIAN CHƠI (TÂM HUYẾT)</span>
                    <span id="${HUD_ID}-gt-timer" style="font-family: monospace; font-weight: 700; color: #fff;">00m 00s</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #b5bac1;">
                    <span>Tích lũy phiên này:</span>
                    <span id="${HUD_ID}-gt-status" style="font-weight: 600; color: #57f287;">124h → Cần thêm 26h lên 150h</span>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
                    <div id="${HUD_ID}-gt-bar" style="width: 82.6%; height: 100%; background: linear-gradient(90deg, #5865f2, #57f287);"></div>
                </div>
            </div>

            <!-- Phần 2: Huy hiệu Trò chơi đa dạng -->
            <div style="background: rgba(235, 69, 158, 0.12); border: 1px solid rgba(235, 69, 158, 0.3); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: #eb459e; font-size: 12px;">🎮 2. TRÒ CHƠI ĐA DẠNG (100 GAMES)</span>
                    <span id="${HUD_ID}-var-count" style="font-weight: 700; color: #fff;">0 / 100</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #b5bac1;">
                    <span>Đang xoay vòng game:</span>
                    <span id="${HUD_ID}-var-game" style="font-weight: 600; color: #f2a357; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">...</span>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
                    <div id="${HUD_ID}-var-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #eb459e, #fee75c); transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 11px; color: #949ba4; display: flex; justify-content: space-between; align-items: center;">
                    <span>Cấp: <b id="${HUD_ID}-var-tier" style="color: #fff;">Chưa rõ</b></span>
                    <span>Đổi sau: <b id="${HUD_ID}-var-countdown" style="color: #57f287; font-family: monospace; font-size: 12px;">06m 00s</b></span>
                </div>
                
                <!-- Thanh chọn tốc độ đổi game -->
                <div style="display: flex; gap: 4px; margin-top: 2px;">
                    <button class="${HUD_ID}-spd-btn" data-sec="360" style="flex: 1; padding: 4px; font-size: 10px; font-weight: 700; background: #57f287; color: #000; border: none; border-radius: 4px; cursor: pointer;">⭐ 6 Phút</button>
                    <button class="${HUD_ID}-spd-btn" data-sec="600" style="flex: 1; padding: 4px; font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 4px; cursor: pointer;">10 Phút</button>
                    <button class="${HUD_ID}-spd-btn" data-sec="120" style="flex: 1; padding: 4px; font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 4px; cursor: pointer;">2 Phút</button>
                    <button class="${HUD_ID}-spd-btn" data-sec="20" style="flex: 1; padding: 4px; font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 4px; cursor: pointer;">20 Giây</button>
                </div>
            </div>

            <div style="display: flex; gap: 8px;">
                <button id="${HUD_ID}-next-btn" style="
                    flex: 1;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 12px;
                ">⏩ Đổi Game Ngay</button>
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
                ">⏹️ Dừng Combo</button>
            </div>

            <div style="font-size: 11px; color: #949ba4; text-align: center; line-height: 1.4;">
                🛡️ <b>Chế độ 6 Phút:</b> Giữ mỗi game 6 phút để máy chủ Discord ghi nhận 100% Heartbeat Telemetry hợp lệ!
            </div>
        </div>
    `;

    document.body.appendChild(hud);

    // Kéo thả HUD
    const header = document.getElementById(`${HUD_ID}-header`);
    let isDragging = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

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

    window.addEventListener("mouseup", () => { isDragging = false; });

    let isMinimized = false;
    const bodyElem = document.getElementById(`${HUD_ID}-body`);
    document.getElementById(`${HUD_ID}-min-btn`).addEventListener("click", () => {
        isMinimized = !isMinimized;
        bodyElem.style.display = isMinimized ? "none" : "flex";
        document.getElementById(`${HUD_ID}-min-btn`).textContent = isMinimized ? "□" : "_";
    });

    const gtTimerElem = document.getElementById(`${HUD_ID}-gt-timer`);
    const gtStatusElem = document.getElementById(`${HUD_ID}-gt-status`);
    const gtBarElem = document.getElementById(`${HUD_ID}-gt-bar`);

    const varCountElem = document.getElementById(`${HUD_ID}-var-count`);
    const varGameElem = document.getElementById(`${HUD_ID}-var-game`);
    const varBarElem = document.getElementById(`${HUD_ID}-var-bar`);
    const varTierElem = document.getElementById(`${HUD_ID}-var-tier`);
    const varCountdownElem = document.getElementById(`${HUD_ID}-var-countdown`);

    function formatTime(totalSec) {
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = Math.floor(totalSec % 60);
        const pad = n => String(n).padStart(2, '0');
        return hours > 0 ? `${hours}h ${pad(minutes)}m ${pad(seconds)}s` : `${pad(minutes)}m ${pad(seconds)}s`;
    }

    let remainingSecondsInGame = currentDurationSec;

    // Bắt sự kiện đổi tốc độ cày
    document.querySelectorAll(`.${HUD_ID}-spd-btn`).forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(`.${HUD_ID}-spd-btn`).forEach(b => {
                b.style.background = "rgba(255,255,255,0.1)";
                b.style.color = "#fff";
                b.style.fontWeight = "600";
            });
            btn.style.background = "#57f287";
            btn.style.color = "#000";
            btn.style.fontWeight = "700";

            currentDurationSec = parseInt(btn.dataset.sec, 10);
            remainingSecondsInGame = Math.min(remainingSecondsInGame, currentDurationSec);
            console.log(`%c[Combo] ⏱️ Đã chuyển thời lượng mỗi game sang: ${currentDurationSec} giây`, "color: #57f287; font-weight: bold;");
        });
    });

    function nextVarietyGame() {
        if (completedSet.size >= 100) {
            varGameElem.textContent = "Đã hoàn thành 100/100 game!";
            return;
        }

        let target = null;
        for (let i = 0; i < VARIETY_GAMES.length; i++) {
            const idx = (currentVarietyIndex + i) % VARIETY_GAMES.length;
            const candidate = VARIETY_GAMES[idx];
            if (!completedSet.has(candidate.name)) {
                target = candidate;
                currentVarietyIndex = (idx + 1) % VARIETY_GAMES.length;
                break;
            }
        }

        if (target) {
            completedSet.add(target.name);
            try {
                localStorage.setItem(CONFIG.STORAGE_VARIETY_KEY, JSON.stringify(Array.from(completedSet)));
            } catch (_) {}

            gameVariety = buildVarietyGameEntry(target);
            varGameElem.textContent = target.name;
            varCountElem.textContent = `${completedSet.size} / 100`;
            varBarElem.style.width = `${Math.min(100, completedSet.size)}%`;
            varTierElem.textContent = getVarietyTierTitle(completedSet.size);

            remainingSecondsInGame = currentDurationSec;
            announce();

            console.log(`%c[Combo] 🎮 [${completedSet.size}/100] Đang cày game: ${target.name} (Treo ${currentDurationSec}s)`, "color: #eb459e; font-weight: bold;");
        }
    }

    document.getElementById(`${HUD_ID}-next-btn`).addEventListener("click", nextVarietyGame);

    // Bắt đầu game đầu tiên
    nextVarietyGame();

    // Vòng lặp cập nhật mỗi 1s
    const tickInterval = setInterval(() => {
        // 1. Cập nhật Thời gian chơi
        const elapsedSec = (Date.now() - sessionStartTime) / 1000;
        gtTimerElem.textContent = formatTime(elapsedSec);

        const estimatedTotalHours = 124 + (elapsedSec / 3600);
        const hoursNeeded = Math.max(0, 150 - estimatedTotalHours);
        gtStatusElem.textContent = `${estimatedTotalHours.toFixed(1)}h tích lũy • Cần ${hoursNeeded.toFixed(1)}h nữa lên 150h`;
        gtBarElem.style.width = `${Math.min(100, (estimatedTotalHours / 150) * 100).toFixed(1)}%`;

        // 2. Cập nhật đếm ngược Variety
        remainingSecondsInGame--;
        const m = Math.floor(Math.max(0, remainingSecondsInGame) / 60);
        const s = Math.max(0, remainingSecondsInGame) % 60;
        const pad = n => String(n).padStart(2, '0');
        varCountdownElem.textContent = `${pad(m)}m ${pad(s)}s`;

        if (remainingSecondsInGame <= 0) {
            nextVarietyGame();
        }
    }, 1000);

    // Heartbeat announce mỗi 2 phút
    const announceTimer = setInterval(announce, 2 * 60 * 1000);

    function stop() {
        clearInterval(tickInterval);
        clearInterval(announceTimer);

        for (const [key, fn] of Object.entries(original)) {
            runStore[key] = fn;
        }

        try {
            dispatcher.dispatch({
                type: "RUNNING_GAMES_CHANGE",
                added: [],
                removed: [gameMain, ...(gameVariety ? [gameVariety] : [])],
                games: withoutOurs(original.getRunningGames.call(runStore))
            });
            dispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", socketId: null, pid: PID_MAIN, activity: null });
            if (gameVariety) {
                dispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", socketId: null, pid: PID_VARIETY, activity: null });
            }
        } catch (_) {}

        if (hud?.parentNode) hud.remove();
        delete window[LOCK_KEY];
        console.log("%c[Combo] ⏹️ Đã dừng cả 2 nhiệm vụ và khôi phục Discord hoàn tất.", "color: #ed4245; font-weight: bold;");
    }

    document.getElementById(`${HUD_ID}-close-btn`).addEventListener("click", stop);
    document.getElementById(`${HUD_ID}-stop-btn`).addEventListener("click", stop);
    window.addEventListener("pagehide", stop, { once: true });

    window[LOCK_KEY] = {
        stop,
        nextVarietyGame
    };

    console.log(
        "%c[Lowkey Combo] 🚀 Đang cày ĐỒNG THỜI cả 2 nhiệm vụ huy hiệu:\n" +
        "1. ⏱️ Thời gian chơi (Counter-Strike 2 chạy liên tục tích lũy giờ)\n" +
        "2. 🎮 Trò chơi đa dạng (Xoay vòng 100 game, 6 phút/game chuẩn Telemetry)\n" +
        "⏹️ Dừng: gọi window.__LOWKEY_COMBO_BADGE__.stop() hoặc bấm nút ✕ trên bảng.",
        "color: #5865f2; font-size: 13px; font-weight: bold;"
    );
})();
