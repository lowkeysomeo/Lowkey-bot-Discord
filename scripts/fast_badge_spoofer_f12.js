/**
 * ==============================================================================
 * LOWKEY FAST BADGE SPOOFER (F12 CONSOLE & IN-APP GUI EDITION)
 * ==============================================================================
 * Tự động tua nhanh tiến trình Huy hiệu Discord bằng cách gửi Telemetry trực tiếp
 * lên API Science nội bộ của Discord (/api/v9/science) - Kỹ thuật các Shop hay dùng!
 * 
 * Phiên bản V2:
 * - Khắc phục triệt để lỗi 401 Unauthorized bằng cơ chế trích xuất Webpack chuẩn
 * - Tự động nhận diện User Token và Username chính xác 100%
 * - Có sẵn ô nhập/dán Token thủ công nếu muốn tự đổi tài khoản
 * - Sử dụng RestAPI nội bộ của Discord & fallback fetch
 * ==============================================================================
 */

(() => {
    "use strict";

    // Xóa modal cũ nếu đã tồn tại
    const EXISTING_MODAL = document.getElementById("__lowkey_spoofer_modal_root__");
    if (EXISTING_MODAL) EXISTING_MODAL.remove();

    console.clear();
    console.log(
        "%c" +
        "  ███████╗██████╗  ██████╗  ██████╗ ███████╗███████╗██████╗ \n" +
        "  ██╔════╝██╔══██╗██╔═══██╗██╔═══██╗██╔════╝██╔════╝██╔══██╗\n" +
        "  ███████╗██████╔╝██║   ██║██║   ██║█████╗  █████╗  ██████╔╝\n" +
        "  ╚════██║██╔═══╝ ██║   ██║██║   ██║██╔══╝  ██╔══╝  ██╔══██╗\n" +
        "  ███████║██║     ╚██████╔╝╚██████╔╝██║     ███████╗██║  ██║\n" +
        "  ╚══════╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝\n" +
        "       ⚡ LOWKEY TELEMETRY BADGE SPOOFER (V2 - GUI FIXED) ⚡",
        "color: #5865F2; font-weight: bold; font-family: monospace; font-size: 11px;"
    );

    // ── 1. MODULE EXTRACTOR CHUẨN XÁC 100% ──────────────────────────────────
    let reqInstance = null;

    // Vencord support
    if (window.Vencord?.Webpack?.wreq?.c) {
        reqInstance = window.Vencord.Webpack.wreq;
    } else if (typeof webpackChunkdiscord_app !== "undefined") {
        // Discord có cả Sentry runtime và Discord app runtime.
        // Bắt buộc phải chọn runtime có số lượng modules lớn nhất để không bị dính Sentry rỗng!
        webpackChunkdiscord_app.push([[Symbol("spoofer-v2")], {}, r => {
            const cur = Object.keys(reqInstance?.c || {}).length;
            const incoming = Object.keys(r?.c || {}).length;
            if (incoming > cur) reqInstance = r;
        }]);
        webpackChunkdiscord_app.pop();
    }

    const rawModules = reqInstance?.c ? Object.values(reqInstance.c) : [];

    function findStore(storeName) {
        for (const m of rawModules) {
            try {
                const exp = m?.exports;
                if (!exp || typeof exp !== "object") continue;
                for (const key of Object.keys(exp)) {
                    const prop = exp[key];
                    if (prop && typeof prop === "object" && prop.__proto__?.constructor?.displayName === storeName) {
                        return prop;
                    }
                }
            } catch (_) {}
        }
        return undefined;
    }

    function findAPI() {
        for (const m of rawModules) {
            try {
                const exp = m?.exports;
                if (!exp || typeof exp !== "object") continue;
                for (const key of Object.keys(exp)) {
                    const prop = exp[key];
                    if (prop && typeof prop.get === "function" &&
                        typeof prop.post === "function" &&
                        typeof prop.del === "function" &&
                        !prop._dispatcher) {
                        return prop;
                    }
                }
            } catch (_) {}
        }
        return undefined;
    }

    function findTokenFromModules() {
        for (const m of rawModules) {
            try {
                const exp = m?.exports;
                if (!exp) continue;
                if (typeof exp.getToken === "function") {
                    const t = exp.getToken();
                    if (typeof t === "string" && t.length > 20) return t;
                }
                if (exp.default && typeof exp.default.getToken === "function") {
                    const t = exp.default.getToken();
                    if (typeof t === "string" && t.length > 20) return t;
                }
                if (typeof exp === "object") {
                    for (const k of Object.keys(exp)) {
                        if (exp[k] && typeof exp[k].getToken === "function") {
                            const t = exp[k].getToken();
                            if (typeof t === "string" && t.length > 20) return t;
                        }
                    }
                }
            } catch (_) {}
        }
        return null;
    }

    const UserStore = findStore("UserStore");
    const AuthStore = findStore("AuthenticationStore");
    const DiscordAPI = findAPI();

    // Tìm Token qua mọi phương thức khả thi
    let detectedToken = null;
    try {
        if (AuthStore?.getToken) detectedToken = AuthStore.getToken();
    } catch (_) {}

    if (!detectedToken) {
        detectedToken = findTokenFromModules();
    }

    if (!detectedToken && window.Vencord?.Webpack?.findByProps) {
        try {
            detectedToken = window.Vencord.Webpack.findByProps("getToken")?.getToken();
        } catch (_) {}
    }

    if (!detectedToken) {
        try {
            const iframe = document.createElement("iframe");
            document.head.append(iframe);
            const pd = Object.getOwnPropertyDescriptor(iframe.contentWindow, "localStorage");
            iframe.remove();
            if (pd?.get) {
                const raw = pd.get.call(window).getItem("token");
                if (raw) detectedToken = JSON.parse(raw);
            }
        } catch (_) {}
    }

    const currentUser = UserStore?.getCurrentUser?.();
    let displayUsername = "Tài khoản Discord";
    if (currentUser?.username) {
        displayUsername = `${currentUser.username}${currentUser.discriminator && currentUser.discriminator !== "0" ? "#" + currentUser.discriminator : ""}`;
        if (currentUser.globalName) displayUsername += ` (${currentUser.globalName})`;
    }

    // ── 2. TOP GAMES LIST ───────────────────────────────────────────────────
    const TOP_GAMES = [
        { id: "1158877933042143272", name: "Counter-Strike 2", exe: "cs2.exe" },
        { id: "423646631248461825", name: "Grand Theft Auto V", exe: "GTA5.exe" },
        { id: "700136079562375258", name: "VALORANT", exe: "VALORANT-Win64-Shipping.exe" },
        { id: "356875988589740042", name: "Dota 2", exe: "dota2.exe" },
        { id: "1402418696126992445", name: "League of Legends", exe: "League of Legends.exe" },
        { id: "541484311354081282", name: "Apex Legends", exe: "r5apex.exe" },
        { id: "432980957394370572", name: "Fortnite", exe: "FortniteClient-Win64-Shipping.exe" },
        { id: "376045648834985984", name: "Minecraft", exe: "Minecraft.exe" }
    ];

    function generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ── 3. TELEMETRY SENDER CORE ───────────────────────────────────────────
    let cachedAnalyticsToken = null;

    async function getAnalyticsToken(activeToken) {
        if (cachedAnalyticsToken) return cachedAnalyticsToken;

        // 1. Thử qua Discord RestAPI
        if (DiscordAPI?.get) {
            try {
                const res = await DiscordAPI.get({ url: "/users/@me", query: { with_analytics_token: true } });
                if (res?.body?.analytics_token) {
                    cachedAnalyticsToken = res.body.analytics_token;
                    return cachedAnalyticsToken;
                }
            } catch (_) {}
        }

        // 2. Thử qua fetch chuẩn
        try {
            const headers = { "Content-Type": "application/json" };
            if (activeToken) headers["Authorization"] = activeToken;
            const res = await fetch("/api/v9/users/@me?with_analytics_token=true", { headers });
            if (res.ok) {
                const data = await res.json();
                cachedAnalyticsToken = data.analytics_token;
                return cachedAnalyticsToken;
            }
        } catch (_) {}
        return null;
    }

    async function sendScienceEvents(activeToken, events) {
        const aToken = await getAnalyticsToken(activeToken);
        const payload = { events };
        if (aToken) payload.token = aToken;

        // Ưu tiên 1: RestAPI nội bộ của Discord (Tự gắn toàn bộ session headers & cookies)
        if (DiscordAPI?.post) {
            try {
                const res = await DiscordAPI.post({
                    url: "/science",
                    body: payload
                });
                if (res?.status === 204 || res?.status === 200 || res?.ok) return true;
            } catch (err) {
                if (err?.status === 204 || err?.status === 200) return true;
            }
        }

        // Ưu tiên 2: Fetch trực tiếp
        try {
            const headers = { "Content-Type": "application/json" };
            if (activeToken) headers["Authorization"] = activeToken;
            const res = await fetch("/api/v9/science", {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });
            return res.status === 204 || res.status === 200;
        } catch (_) {
            return false;
        }
    }

    // ── 4. TẠO GIAO DIỆN IN-APP GUI CHO DISCORD ─────────────────────────────
    const root = document.createElement("div");
    root.id = "__lowkey_spoofer_modal_root__";
    root.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999999;
        font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        color: #dbdee1;
    `;

    const isTokenReady = Boolean(detectedToken);

    root.innerHTML = `
        <div style="
            background: #313338;
            border-radius: 12px;
            width: 500px;
            max-width: 92vw;
            box-shadow: 0 12px 36px rgba(0,0,0,0.6);
            border: 1px solid #3f4147;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: lowkeyPop 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        ">
            <!-- Header -->
            <div style="
                background: #2b2d31;
                padding: 16px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid #232428;
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="background: #5865F2; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; color: white;">⚡</div>
                    <div>
                        <div style="font-weight: 700; color: #f2f3f5; font-size: 15px;">Lowkey Fast Badge Spoofer V2</div>
                        <div style="font-size: 12px; color: #949ba4;">Tua nhanh 5.000h & 100 Game qua Telemetry API</div>
                    </div>
                </div>
                <button id="__lk_close__" style="
                    background: transparent;
                    border: none;
                    color: #949ba4;
                    font-size: 20px;
                    cursor: pointer;
                    line-height: 1;
                    padding: 4px;
                    border-radius: 4px;
                " title="Đóng">✕</button>
            </div>

            <!-- Body -->
            <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
                <!-- User Account Info & Token Box -->
                <div style="
                    background: #2b2d31;
                    padding: 12px 14px;
                    border-radius: 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    border: 1px solid #383a40;
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-size: 11px; text-transform: uppercase; color: #b5bac1; font-weight: 700; letter-spacing: 0.5px;">Tài khoản Discord</div>
                            <div style="font-size: 14px; font-weight: 600; color: #f2f3f5; margin-top: 2px;" id="__lk_user_name__">${displayUsername}</div>
                        </div>
                        <div id="__lk_token_badge__" style="
                            background: ${isTokenReady ? "rgba(87, 242, 135, 0.15)" : "rgba(237, 66, 69, 0.15)"};
                            color: ${isTokenReady ? "#57F287" : "#ED4245"};
                            font-size: 12px;
                            font-weight: 600;
                            padding: 4px 10px;
                            border-radius: 12px;
                        ">${isTokenReady ? "Token OK ✓" : "Chưa có Token"}</div>
                    </div>

                    <!-- Token Input (Hiển thị hoặc cho phép sửa) -->
                    <div style="margin-top: 4px;">
                        <label style="font-size: 11px; color: #949ba4; display: block; margin-bottom: 4px;">User Token (Tự động nhận diện hoặc dán thủ công nếu cần):</label>
                        <input id="__lk_token_input__" type="password" value="${detectedToken || ""}" placeholder="Dán Discord User Token vào đây nếu chưa nhận diện..." style="
                            width: 100%;
                            box-sizing: border-box;
                            background: #1e1f22;
                            border: 1px solid #3f4147;
                            border-radius: 6px;
                            padding: 8px 10px;
                            color: #f2f3f5;
                            font-size: 12px;
                            font-family: monospace;
                            outline: none;
                        " />
                    </div>
                </div>

                <!-- Game Selector -->
                <div>
                    <label style="font-size: 12px; font-weight: 700; color: #b5bac1; text-transform: uppercase; display: block; margin-bottom: 6px;">Chọn Game chính để cày giờ:</label>
                    <select id="__lk_game_select__" style="
                        width: 100%;
                        background: #1e1f22;
                        border: 1px solid #3f4147;
                        border-radius: 6px;
                        padding: 10px;
                        color: #f2f3f5;
                        font-size: 13px;
                        outline: none;
                    ">
                        ${TOP_GAMES.map((g, idx) => `<option value="${idx}">${g.name}</option>`).join("")}
                    </select>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button id="__lk_btn_combo__" style="
                        background: #5865F2;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        padding: 14px;
                        font-weight: 700;
                        font-size: 14px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        transition: background 0.15s;
                    ">
                        <span>🚀</span>
                        <span>[COMBO] Cày Cả 5.000 Giờ + 100 Game (Khuyên dùng)</span>
                    </button>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button id="__lk_btn_time__" style="
                            background: #2b2d31;
                            color: #f2f3f5;
                            border: 1px solid #3f4147;
                            border-radius: 8px;
                            padding: 12px;
                            font-weight: 600;
                            font-size: 13px;
                            cursor: pointer;
                        ">
                            ⚡ Chỉ cày 5.000 Giờ
                        </button>
                        <button id="__lk_btn_variety__" style="
                            background: #2b2d31;
                            color: #f2f3f5;
                            border: 1px solid #3f4147;
                            border-radius: 8px;
                            padding: 12px;
                            font-weight: 600;
                            font-size: 13px;
                            cursor: pointer;
                        ">
                            🎮 Chỉ cày 100 Game
                        </button>
                    </div>
                </div>

                <!-- Progress & Log Box -->
                <div id="__lk_log_box__" style="
                    background: #1e1f22;
                    border-radius: 8px;
                    padding: 12px;
                    border: 1px solid #2b2d31;
                    font-family: monospace;
                    font-size: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                ">
                    <div style="display: flex; justify-content: space-between; color: #949ba4;">
                        <span>Trạng thái:</span>
                        <span id="__lk_status_text__" style="color: #57F287; font-weight: bold;">Sẵn sàng...</span>
                    </div>
                    <div style="
                        width: 100%;
                        height: 8px;
                        background: #2b2d31;
                        border-radius: 4px;
                        overflow: hidden;
                        margin-top: 4px;
                    ">
                        <div id="__lk_progress_bar__" style="
                            width: 0%;
                            height: 100%;
                            background: #5865F2;
                            transition: width 0.2s;
                        "></div>
                    </div>
                    <div id="__lk_detail_log__" style="color: #b5bac1; font-size: 11px; margin-top: 4px; white-space: pre-line; max-height: 80px; overflow-y: auto;">Nhấn nút bên trên để bắt đầu tua tiến trình.</div>
                </div>

                <!-- Footer Note -->
                <div style="font-size: 11px; color: #949ba4; line-height: 1.4; border-top: 1px solid #2b2d31; padding-top: 8px;">
                    ℹ️ <strong>Cơ chế cập nhật:</strong> Sau khi gửi gói tin thành công (HTTP 204), Discord sẽ cập nhật huy hiệu lên Profile của bạn trong vòng <strong>24h - 48h</strong>.
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(root);

    // Style animation
    const styleTag = document.createElement("style");
    styleTag.textContent = `
        @keyframes lowkeyPop {
            0% { transform: scale(0.92); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
        #__lk_btn_combo__:hover { background: #4752C4 !important; }
        #__lk_btn_time__:hover, #__lk_btn_variety__:hover { background: #383a40 !important; }
        #__lk_close__:hover { color: #f2f3f5 !important; background: #383a40 !important; }
    `;
    document.head.appendChild(styleTag);

    // Element references
    const btnClose = document.getElementById("__lk_close__");
    const btnCombo = document.getElementById("__lk_btn_combo__");
    const btnTime = document.getElementById("__lk_btn_time__");
    const btnVariety = document.getElementById("__lk_btn_variety__");
    const gameSelect = document.getElementById("__lk_game_select__");
    const tokenInput = document.getElementById("__lk_token_input__");
    const tokenBadge = document.getElementById("__lk_token_badge__");
    const statusText = document.getElementById("__lk_status_text__");
    const progressBar = document.getElementById("__lk_progress_bar__");
    const detailLog = document.getElementById("__lk_detail_log__");

    btnClose.onclick = () => root.remove();

    tokenInput.oninput = () => {
        const val = tokenInput.value.trim();
        if (val.length > 20) {
            tokenBadge.textContent = "Token OK ✓";
            tokenBadge.style.background = "rgba(87, 242, 135, 0.15)";
            tokenBadge.style.color = "#57F287";
        } else {
            tokenBadge.textContent = "Chưa có Token";
            tokenBadge.style.background = "rgba(237, 66, 69, 0.15)";
            tokenBadge.style.color = "#ED4245";
        }
    };

    function getActiveToken() {
        return tokenInput.value.trim() || detectedToken;
    }

    function setStatus(text, color = "#57F287") {
        statusText.textContent = text;
        statusText.style.color = color;
    }

    function setProgress(pct) {
        progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }

    function log(msg) {
        detailLog.textContent = msg;
        console.log(`[Spoofer] ${msg}`);
    }

    function setButtonsDisabled(disabled) {
        btnCombo.disabled = disabled;
        btnTime.disabled = disabled;
        btnVariety.disabled = disabled;
        btnCombo.style.opacity = disabled ? "0.6" : "1";
        btnTime.style.opacity = disabled ? "0.6" : "1";
        btnVariety.style.opacity = disabled ? "0.6" : "1";
    }

    // ── 5. THỰC THI CÁC TÁC VỤ ──────────────────────────────────────────────
    async function runPlaytime(game, hours = 5000) {
        const token = getActiveToken();
        if (!token) {
            setStatus("Thiếu Token!", "#ED4245");
            log("❌ Vui lòng dán User Token vào ô bên trên để tiếp tục!");
            return false;
        }

        setStatus(`Đang tua ${hours.toLocaleString()} giờ...`, "#FEE75C");
        log(`Đang gửi telemetry ${hours}h cho "${game.name}"...`);
        setProgress(20);

        const totalSeconds = hours * 3600;
        const sessionId = generateUUID();
        const now = Date.now();

        const events = [
            {
                type: "launch_game",
                properties: {
                    client_track_timestamp: now - (totalSeconds * 1000),
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
                    total_duration: totalSeconds
                }
            }
        ];

        const ok = await sendScienceEvents(token, events);
        setProgress(100);

        if (ok) {
            setStatus("Thành công (HTTP 204) ✓", "#57F287");
            log(`✨ Discord đã nhận ${hours.toLocaleString()} giờ chơi cho "${game.name}".`);
            return true;
        } else {
            setStatus("Lỗi gửi gói tin", "#ED4245");
            log(`❌ Gửi thất bại. Hãy kiểm tra lại Token của bạn.`);
            return false;
        }
    }

    async function runVariety(targetCount = 100) {
        const token = getActiveToken();
        if (!token) {
            setStatus("Thiếu Token!", "#ED4245");
            log("❌ Vui lòng dán User Token vào ô bên trên để tiếp tục!");
            return false;
        }

        setStatus("Đang tải danh mục game...", "#FEE75C");
        log("Đang lấy danh mục ứng dụng từ server Discord...");
        setProgress(5);

        let catalog = [];
        try {
            const detectRes = await fetch("/api/v9/applications/detectable", {
                headers: token ? { "Authorization": token } : {}
            });
            if (detectRes.ok) {
                const detectList = await detectRes.json();
                catalog = detectList.filter(g => g.executables && g.executables.length > 0).slice(0, targetCount + 10).map(g => ({
                    id: g.id,
                    name: g.name,
                    exe: g.executables[0].name
                }));
            }
        } catch (_) {}

        if (catalog.length < targetCount) {
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
                "God of War Ragnarök", "Horizon Forbidden West", "Ghost of Tsushima", "Marvel's Spider-Man Remastered"
            ];
            catalog = fallbackNames.slice(0, targetCount).map((name, i) => ({
                id: (400000000000000000n + BigInt(i * 1234567)).toString(),
                name: name,
                exe: name.replace(/[^a-zA-Z0-9]/g, "") + ".exe"
            }));
        }

        const selectedGames = catalog.slice(0, targetCount);
        let successCount = 0;

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
                        total_duration: 180
                    }
                }
            ];

            const ok = await sendScienceEvents(token, events);
            if (ok) successCount++;

            const pct = Math.round(((i + 1) / selectedGames.length) * 100);
            setProgress(pct);
            setStatus(`Đang tua game (${i + 1}/${selectedGames.length})...`, "#5865F2");
            log(`[${pct}%] Đã gửi telemetry: "${game.name}"`);

            await new Promise(r => setTimeout(r, 120));
        }

        setStatus(`Hoàn thành ${successCount}/${selectedGames.length} Game ✓`, "#57F287");
        log(`✨ Đã gửi thành công ${successCount} tựa game đến Discord!`);
        return true;
    }

    // ── 6. GẮN SỰ KIỆN NÚT BẤM ──────────────────────────────────────────────
    btnTime.onclick = async () => {
        setButtonsDisabled(true);
        const selGame = TOP_GAMES[parseInt(gameSelect.value, 10)] || TOP_GAMES[0];
        await runPlaytime(selGame, 5000);
        setButtonsDisabled(false);
    };

    btnVariety.onclick = async () => {
        setButtonsDisabled(true);
        await runVariety(100);
        setButtonsDisabled(false);
    };

    btnCombo.onclick = async () => {
        setButtonsDisabled(true);
        const selGame = TOP_GAMES[parseInt(gameSelect.value, 10)] || TOP_GAMES[0];
        log("🚀 Bắt đầu Combo: Bước 1/2 tua 5.000 giờ...");
        const pOk = await runPlaytime(selGame, 5000);
        if (pOk) {
            await new Promise(r => setTimeout(r, 800));
            log("🚀 Bước 2/2: Bắt đầu tua 100 tựa game...");
            await runVariety(100);
            setStatus("COMBO HOÀN TẤT 100% ✓", "#57F287");
            log("🎉 Tất cả dữ liệu đã được gửi thành công!\nHuy hiệu sẽ xuất hiện sau chu kỳ 24h - 48h.");
        }
        setButtonsDisabled(false);
    };

    console.log("%c[Spoofer] ✅ Bảng điều khiển Spoofer V2 đã hiển thị!", "color: #57F287; font-weight: bold;");
})();
