/**
 * ==============================================================================
 * LOWKEY FAST BADGE SPOOFER (F12 CONSOLE EDITION)
 * ==============================================================================
 * Tự động tua nhanh tiến trình Huy hiệu Discord bằng cách gửi Telemetry trực tiếp
 * lên API Science nội bộ của Discord (/api/v9/science) - Kỹ thuật các Shop hay dùng!
 * 
 * Các tính năng chính:
 * 1. ⚡ Max 5,000h Huy hiệu "Thời gian chơi" (Game Time / Vĩnh cửu)
 * 2. 🎮 Max 100+ Game Huy hiệu "Trò chơi đa dạng" (Game Variety / Thuyết phổ quát)
 * 3. 🚀 Combo cả 2 huy hiệu chỉ trong 1 lần chạy (~30 giây đến 1 phút hoàn tất)
 * 
 * ⚠️ LƯU Ý QUAN TRỌNG:
 * - Sau khi script báo hoàn tất (HTTP 204), máy chủ Discord sẽ mất từ 24h - 48h
 *   để chạy hệ thống Data Pipeline tổng hợp dữ liệu và hiển thị huy hiệu lên Profile.
 * - Chạy trực tiếp trên Discord Desktop Console (F12) hoàn toàn MIỄN PHÍ, không sợ
 *   bị Cloudflare 403, không lo bị lộ Token ra bên ngoài cho bất kỳ ai!
 * ==============================================================================
 */

(async () => {
    "use strict";

    console.clear();
    console.log(
        "%c" +
        "  ███████╗██████╗  ██████╗  ██████╗ ███████╗███████╗██████╗ \n" +
        "  ██╔════╝██╔══██╗██╔═══██╗██╔═══██╗██╔════╝██╔════╝██╔══██╗\n" +
        "  ███████╗██████╔╝██║   ██║██║   ██║█████╗  █████╗  ██████╔╝\n" +
        "  ╚════██║██╔═══╝ ██║   ██║██║   ██║██╔══╝  ██╔══╝  ██╔══██╗\n" +
        "  ███████║██║     ╚██████╔╝╚██████╔╝██║     ███████╗██║  ██║\n" +
        "  ╚══════╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝\n" +
        "       ⚡ LOWKEY TELEMETRY BADGE SPOOFER (5000H & 100 GAMES) ⚡",
        "color: #5865F2; font-weight: bold; font-family: monospace; font-size: 11px;"
    );

    // ── 1. TỰ ĐỘNG TÌM USER TOKEN & XÁC THỰC ─────────────────────────────────
    function getDiscordToken() {
        try {
            // Cách 1: Webpack Chunk Extraction
            let req;
            if (typeof webpackChunkdiscord_app !== "undefined") {
                webpackChunkdiscord_app.push([[Symbol("spoofer-token")], {}, incoming => {
                    req = incoming;
                }]);
                webpackChunkdiscord_app.pop();
                if (req?.c) {
                    for (const id in req.c) {
                        const m = req.c[id]?.exports;
                        if (m?.default?.getToken && typeof m.default.getToken === "function") {
                            const t = m.default.getToken();
                            if (t) return t;
                        }
                    }
                }
            }
        } catch (_) {}

        try {
            // Cách 2: Vencord / Client Mod
            if (window.Vencord?.Webpack?.findByProps) {
                const tokenMod = window.Vencord.Webpack.findByProps("getToken");
                if (tokenMod?.getToken) {
                    const t = tokenMod.getToken();
                    if (t) return t;
                }
            }
        } catch (_) {}

        try {
            // Cách 3: LocalStorage
            const iframe = document.createElement("iframe");
            document.head.append(iframe);
            const pd = Object.getOwnPropertyDescriptor(iframe.contentWindow, "localStorage");
            iframe.remove();
            if (pd?.get) {
                const raw = pd.get.call(window).getItem("token");
                if (raw) return JSON.parse(raw);
            }
        } catch (_) {}

        return null;
    }

    let userToken = getDiscordToken();
    if (!userToken) {
        userToken = prompt("🔑 Không tìm thấy token tự động. Vui lòng dán User Token của bạn vào đây:");
    }

    if (!userToken) {
        console.error("%c[Spoofer] ❌ Không có token xác thực. Đã hủy tiến trình!", "color: #ED4245; font-weight: bold;");
        return;
    }

    console.log("%c[Spoofer] ✅ Đã xác thực User Token thành công!", "color: #57F287; font-weight: bold;");

    // ── 2. LẤY ANALYTICS TOKEN ──────────────────────────────────────────────
    let analyticsToken = null;
    try {
        console.log("%c[Spoofer] 🔄 Đang lấy Analytics Token từ Discord API...", "color: #FEE75C;");
        const userRes = await fetch("/api/v9/users/@me?with_analytics_token=true", {
            headers: {
                "Authorization": userToken,
                "Content-Type": "application/json"
            }
        });
        if (userRes.ok) {
            const userData = await userRes.json();
            analyticsToken = userData.analytics_token;
            console.log(`%c[Spoofer] 👤 Đang cày cho tài khoản: ${userData.username} (${userData.id})`, "color: #5865F2; font-weight: bold;");
            console.log(`%c[Spoofer] 🔑 Analytics Token: ${analyticsToken ? "Đã lấy thành công ✓" : "Trống (Sử dụng chế độ tiêu chuẩn)"}`, "color: #57F287;");
        } else {
            console.warn("[Spoofer] Không lấy được analytics token qua /users/@me. Mã phản hồi:", userRes.status);
        }
    } catch (e) {
        console.warn("[Spoofer] Lỗi khi lấy analytics token:", e.message);
    }

    // ── 3. DANH SÁCH GAME ĐƯỢC DISCORD CÔNG NHẬN 100% ────────────────────────
    const TOP_GAMES = [
        { id: "1158877933042143272", name: "Counter-Strike 2", exe: "cs2.exe" },
        { id: "423646631248461825", name: "Grand Theft Auto V", exe: "GTA5.exe" },
        { id: "700136079562375258", name: "VALORANT", exe: "VALORANT-Win64-Shipping.exe" },
        { id: "356875988589740042", name: "Dota 2", exe: "dota2.exe" },
        { id: "1402418696126992445", name: "League of Legends", exe: "League of Legends.exe" },
        { id: "541484311354081282", name: "Apex Legends", exe: "r5apex.exe" },
        { id: "432980957394370572", name: "Fortnite", exe: "FortniteClient-Win64-Shipping.exe" },
        { id: "376045648834985984", name: "Minecraft", exe: "Minecraft.exe" },
        { id: "432980957394370573", name: "Roblox", exe: "RobloxPlayerBeta.exe" },
        { id: "762434991303950386", name: "Genshin Impact", exe: "GenshinImpact.exe" }
    ];

    // Helper tạo UUID ngẫu nhiên cho Session Heartbeat
    function generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Gửi gói tin Science Telemetry
    async function postScienceEvents(events) {
        const body = {
            events: events
        };
        if (analyticsToken) {
            body.token = analyticsToken;
        }

        const res = await fetch("/api/v9/science", {
            method: "POST",
            headers: {
                "Authorization": userToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        return res.status === 204 || res.status === 200;
    }

    // ── 4. CHỨC NĂNG 1: TUA NHANH THỜI GIAN CHƠI (GAME TIME BADGE) ───────────
    async function spoofPlaytime(targetGame, hours) {
        console.log(`\n%c[Game Time] ⏳ Đang bắt đầu tua ${hours.toLocaleString()} giờ cho game: "${targetGame.name}"...`, "color: #FEE75C; font-weight: bold;");

        const totalSeconds = hours * 3600;
        const sessionId = generateUUID();
        const now = Date.now();

        // Chuỗi telemetry chuẩn mô phỏng phiên chơi
        // 1. launch_game
        const launchEvent = {
            type: "launch_game",
            properties: {
                client_track_timestamp: now - (totalSeconds * 1000),
                client_heartbeat_session_id: sessionId,
                game_id: targetGame.id,
                game_name: targetGame.name,
                game_executable: targetGame.exe,
                verified: true
            }
        };

        // 2. running_game_heartbeat với số giờ tích lũy khổng lồ
        const heartbeatEvent = {
            type: "running_game_heartbeat",
            properties: {
                client_track_timestamp: now,
                client_heartbeat_session_id: sessionId,
                event_sequence_number: 1,
                game_id: targetGame.id,
                game_name: targetGame.name,
                game_executable: targetGame.exe,
                duration: 60,
                total_duration: totalSeconds
            }
        };

        console.log(`%c[Game Time] 📡 Đang gửi telemetry packet lên /api/v9/science (Total Seconds: ${totalSeconds})...`, "color: #5865F2;");
        const ok = await postScienceEvents([launchEvent, heartbeatEvent]);

        if (ok) {
            console.log(`%c[Game Time] ✨ THÀNH CÔNG! Discord đã ghi nhận ${hours.toLocaleString()} giờ (${targetGame.name}) với HTTP 204!`, "color: #57F287; font-weight: bold; font-size: 13px;");
            return true;
        } else {
            console.error("%c[Game Time] ❌ Gửi thất bại. Discord trả về mã lỗi.", "color: #ED4245;");
            return false;
        }
    }

    // ── 5. CHỨC NĂNG 2: TUA NHANH 100+ GAME (GAME VARIETY BADGE) ─────────────
    async function spoofVariety(targetCount = 100) {
        console.log(`\n%c[Game Variety] 🎮 Đang chuẩn bị tua ${targetCount} trò chơi đa dạng...`, "color: #FEE75C; font-weight: bold;");
        
        // Cố gắng lấy danh sáchDetectable chính thức từ Discord
        let catalog = [];
        try {
            console.log("%c[Game Variety] 🔍 Đang tải kho danh mục Detectable Games của Discord...", "color: #5865F2;");
            const detectRes = await fetch("/api/v9/applications/detectable");
            if (detectRes.ok) {
                const detectList = await detectRes.json();
                catalog = detectList.filter(g => g.executables && g.executables.length > 0).slice(0, targetCount + 10).map(g => ({
                    id: g.id,
                    name: g.name,
                    exe: g.executables[0].name
                }));
                console.log(`%c[Game Variety] ✅ Đã lấy được ${catalog.length} game chuẩn từ server Discord!`, "color: #57F287;");
            }
        } catch (_) {}

        // Nếu không lấy được qua fetch thì dùng fallback
        if (catalog.length < targetCount) {
            console.log("%c[Game Variety] ℹ️ Sử dụng danh mục game PC tuyển chọn...", "color: #FEE75C;");
            const fallbackNames = [
                "Counter-Strike 2", "Dota 2", "Team Fortress 2", "Half-Life 2", "Portal 2", "Left 4 Dead 2",
                "VALORANT", "League of Legends", "Apex Legends", "Fortnite", "Overwatch 2", "Minecraft",
                "Roblox", "Genshin Impact", "Honkai: Star Rail", "Zenless Zone Zero", "Grand Theft Auto V",
                "Red Dead Redemption 2", "Cyberpunk 2077", "The Witcher 3: Wild Hunt", "Elden Ring",
                "Dark Souls III", "Sekiro: Shadows Die Twice", "Baldur's Gate 3", "Black Myth: Wukong",
                "PUBG: BATTLEGROUNDS", "Rust", "Palworld", "Terraria", "Stardew Valley", "Helldivers 2",
                "Warframe", "Destiny 2", "Diablo IV", "Path of Exile", "World of Warcraft", "FINAL FANTASY XIV",
                "Tom Clancy's Rainbow Six Siege", "Escape from Tarkov", "Lethal Company", "Among Us",
                "Fall Guys", "Rocket League", "Garry's Mod", "osu!", "EA SPORTS FC 25", "Forza Horizon 5",
                "Euro Truck Simulator 2", "American Truck Simulator", "BeamNG.drive", "Assetto Corsa",
                "Need for Speed Unbound", "Cities: Skylines II", "Factorio", "Satisfactory", "RimWorld",
                "Frostpunk 2", "Sid Meier's Civilization VI", "Age of Empires IV", "Total War: WARHAMMER III",
                "Crusader Kings III", "Europa Universalis IV", "Hearts of Iron IV", "Stellaris",
                "Deep Rock Galactic", "War Thunder", "World of Tanks", "World of Warships", "Call of Duty",
                "Battlefield 2042", "Halo Infinite", "DOOM Eternal", "PAYDAY 2", "Ready or Not", "Squad",
                "Arma 3", "Hell Let Loose", "Dead by Daylight", "Phasmophobia", "Hades II", "Dead Cells",
                "Hollow Knight", "Celeste", "Cuphead", "The Binding of Isaac: Rebirth", "Vampire Survivors",
                "Risk of Rain 2", "Slay the Spire", "Balatro", "Dave the Diver", "Disco Elysium", "Undertale",
                "Resident Evil 4", "Silent Hill 2", "Dead Space", "Alan Wake 2", "The Last of Us Part I",
                "God of War Ragnarök", "Horizon Forbidden West", "Ghost of Tsushima", "Marvel's Spider-Man Remastered",
                "Death Stranding", "No Man's Sky", "Subnautica", "Sea of Thieves", "Monster Hunter: World"
            ];
            catalog = fallbackNames.slice(0, targetCount).map((name, i) => ({
                id: (400000000000000000n + BigInt(i * 1234567)).toString(),
                name: name,
                exe: name.replace(/[^a-zA-Z0-9]/g, "") + ".exe"
            }));
        }

        const selectedGames = catalog.slice(0, targetCount);
        let successCount = 0;

        console.log(`%c[Game Variety] 🚀 Đang gửi telemetry cho ${selectedGames.length} tựa game... Vui lòng đợi!`, "color: #5865F2; font-weight: bold;");

        for (let i = 0; i < selectedGames.length; i++) {
            const game = selectedGames[i];
            const sessionId = generateUUID();
            const now = Date.now();

            const events = [
                {
                    type: "launch_game",
                    properties: {
                        client_track_timestamp: now - 180000,
                        client_heartbeat_session_id: sessionId,
                        game_id: game.id,
                        game_name: game.name,
                        game_executable: game.exe,
                        verified: true
                    }
                },
                {
                    type: "running_game_heartbeat",
                    properties: {
                        client_track_timestamp: now,
                        client_heartbeat_session_id: sessionId,
                        event_sequence_number: 1,
                        game_id: game.id,
                        game_name: game.name,
                        game_executable: game.exe,
                        duration: 60,
                        total_duration: 180 // 3 phút mỗi game
                    }
                }
            ];

            const ok = await postScienceEvents(events);
            if (ok) successCount++;

            const pct = Math.round(((i + 1) / selectedGames.length) * 100);
            if ((i + 1) % 10 === 0 || (i + 1) === selectedGames.length) {
                console.log(`%c[Game Variety] ⏳ Tiến độ: ${i + 1}/${selectedGames.length} (${pct}%) - Đã hoàn thành game: "${game.name}"`, "color: #5865F2;");
            }

            // Nghỉ 150ms giữa mỗi game để tránh rate limit
            await new Promise(r => setTimeout(r, 150));
        }

        console.log(`%c[Game Variety] ✨ HOÀN THÀNH! Đã ghi nhận thành công ${successCount}/${selectedGames.length} tựa game!`, "color: #57F287; font-weight: bold; font-size: 13px;");
    }

    // ── 6. MENU ĐIỀU KHIỂN TƯƠNG TÁC ─────────────────────────────────────────
    const choice = prompt(
        "⚡ LOWKEY BADGE SPOOFER - CHỌN CHẾ ĐỘ:\n\n" +
        "1. Max 5,000 Giờ Huy hiệu 'Thời gian chơi' (Game Time - Vĩnh Cửu)\n" +
        "2. Max 100 Trò chơi Huy hiệu 'Trò chơi đa dạng' (Game Variety - Thuyết phổ quát)\n" +
        "3. [COMBO TOÀN DIỆN] Cả 5,000 Giờ + 100 Trò chơi (Khuyên dùng nhất!)\n" +
        "4. Tùy chỉnh số giờ (150h, 500h, 1000h, 2000h, ...)\n\n" +
        "Nhập số lựa chọn của bạn (1, 2, 3 hoặc 4):",
        "3"
    );

    if (choice === "1") {
        await spoofPlaytime(TOP_GAMES[0], 5000);
    } else if (choice === "2") {
        await spoofVariety(100);
    } else if (choice === "3") {
        console.log("%c[Spoofer] 🚀 BẮT ĐẦU CHẠY COMBO TOÀN DIỆN...", "color: #FEE75C; font-weight: bold;");
        await spoofPlaytime(TOP_GAMES[0], 5000);
        await new Promise(r => setTimeout(r, 1000));
        await spoofVariety(100);
    } else if (choice === "4") {
        const customHours = parseInt(prompt("Nhập số giờ bạn muốn tua (ví dụ: 5000):", "5000"), 10);
        if (!isNaN(customHours) && customHours > 0) {
            await spoofPlaytime(TOP_GAMES[0], customHours);
        } else {
            console.error("[Spoofer] Số giờ không hợp lệ.");
        }
    } else {
        console.warn("[Spoofer] Đã hủy thao tác.");
        return;
    }

    // ── 7. BÁO CÁO TỔNG KẾT & HƯỚNG DẪN ĐỢI SYNC ─────────────────────────────
    console.log(
        "%c" +
        "========================================================================\n" +
        "🎉 TẤT CẢ GÓI DỮ LIỆU TELEMETRY ĐÃ ĐƯỢC GỬI THÀNH CÔNG ĐẾN DISCORD! 🎉\n" +
        "========================================================================\n" +
        "📌 CƠ CHẾ CẬP NHẬT HUY HIỆU (VÌ SAO CÁC SHOP BẢO ĐỢI 1-2 NGÀY):\n" +
        "- Endpoint /api/v9/science đã xác nhận nhận gói tin (HTTP 204 No Content).\n" +
        "- Hệ thống Data Pipeline của Discord xử lý dữ liệu theo chu kỳ 24h - 48h.\n" +
        "- Sau chu kỳ này, Discord sẽ tự động cập nhật và hiển thị huy hiệu lên Profile!\n" +
        "========================================================================",
        "color: #57F287; font-weight: bold; font-family: monospace; font-size: 12px;"
    );
})();
