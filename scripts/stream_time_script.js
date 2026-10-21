/**
 * Lowkey Stream Time Badge Script
 * Tự động cày tích lũy giờ phát trực tiếp cho Huy hiệu "Stream cho người khác" (Streamer Badge)
 * Hỗ trợ 10 mốc: Người mới (1h), Chim non (5h), Đột phá (20h), Nổi bật (75h), Người tạo xu hướng (150h),
 *               Tiêu điểm (300h), Ngôi sao (500h), Cảm giác (1000h), Nhà tiên tri (2000h), Xuất thần (5000+h)
 * Tương thích: DevTools Console (F12), Vencord, BetterDiscord, và Chrome DevTools Protocol (CDP)
 */

(() => {
    "use strict";

    const LOCK_KEY = "__LOWKEY_STREAM_TIME__";

    if (window[LOCK_KEY]?.stop) {
        console.warn("[Stream Time] Phiên cày trước đang chạy. Đang dừng để khởi động lại...");
        window[LOCK_KEY].stop();
    }

    const TIERS = [
        { hours: 1, title: "Người mới", icon: "🖥️", color: "#99AAB5" },
        { hours: 5, title: "Chim non", icon: "🟩", color: "#57F287" },
        { hours: 20, title: "Đột phá", icon: "🌲", color: "#248046" },
        { hours: 75, title: "Nổi bật", icon: "🔷", color: "#00A8FC" },
        { hours: 150, title: "Người tạo xu hướng", icon: "🟦", color: "#5865F2" },
        { hours: 300, title: "Tiêu điểm", icon: "🌌", color: "#3C45A5" },
        { hours: 500, title: "Ngôi sao", icon: "⭐", color: "#9B59B6" },
        { hours: 1000, title: "Cảm giác", icon: "🔮", color: "#EB459E" },
        { hours: 2000, title: "Nhà tiên tri", icon: "👑", color: "#ED4245" },
        { hours: 5000, title: "Xuất thần", icon: "⚡", color: "#FEE75C" }
    ];

    const STORAGE_KEY_TOTAL = "lowkey_stream_time_accumulated_seconds";

    function getSavedAccumulated() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_TOTAL);
            if (saved != null) {
                const val = parseInt(saved, 10);
                if (!isNaN(val) && val >= 0) return val;
            }
        } catch (_) {}
        return 0;
    }

    let accumulatedSeconds = getSavedAccumulated();
    const sessionStartTime = Date.now();

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
        let current = { hours: 0, title: "Chưa mở khóa", icon: "🖥️", color: "#99AAB5" };
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
        webpackChunkdiscord_app.push([[Symbol("stream-time")], {}, incoming => {
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

    const req = getWebpackRequire();
    const exports = collectExports(req);

    const dispatcher = exports.find(e => {
        try {
            return e && typeof e.dispatch === "function" && typeof e.subscribe === "function" && !e.getName;
        } catch (_) {
            return false;
        }
    });

    const streamStore = findStore(exports, "ApplicationStreamPreviewStore") || findStore(exports, "StreamWatchStore");
    const mediaEngine = exports.find(e => e?.getMediaEngine?.()?.setGoLiveSource || e?.setGoLiveSource);

    // ── Giao diện Overlay HUD trực quan (Mô phỏng 100% giao diện trong ảnh) ──────
    const HUD_ID = "lowkey-stream-time-hud";
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
        border: 1px solid rgba(87, 242, 135, 0.4);
        border-radius: 14px;
        box-shadow: 0 10px 35px rgba(0, 0, 0, 0.65), 0 0 15px rgba(87, 242, 135, 0.25);
        color: #ffffff;
        font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 13px;
        z-index: 999999;
        overflow: hidden;
        user-select: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    hud.innerHTML = `
        <div id="hud-header" style="
            background: linear-gradient(135deg, rgba(87, 242, 135, 0.25) 0%, rgba(36, 128, 70, 0.2) 100%);
            padding: 12px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            cursor: move;
        ">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span id="hud-tier-icon" style="font-size: 18px;">🖥️</span>
                <div>
                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #57f287; font-weight: 700;">Stream</div>
                    <div id="hud-tier-title" style="font-size: 15px; font-weight: 800; color: #fff; line-height: 1.2;">CHIM NON</div>
                </div>
            </div>
            <button id="hud-btn-close" style="
                background: rgba(255, 255, 255, 0.08);
                border: none;
                color: #b5bac1;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 13px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">✕</button>
        </div>

        <div style="padding: 16px;">
            <div id="hud-subtext" style="font-size: 12px; color: #949ba4; margin-bottom: 12px;">
                5 giờ đã stream cho người khác • Đang cày tự động
            </div>

            <div style="background: rgba(0, 0, 0, 0.3); border-radius: 10px; padding: 12px; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #b5bac1;">Tiến trình của bạn</span>
                    <span id="hud-remaining-text" style="font-size: 12px; font-weight: 700; color: #57f287;">15 giờ nữa</span>
                </div>
                <div style="height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden; position: relative;">
                    <div id="hud-progress-bar" style="height: 100%; width: 25%; background: linear-gradient(90deg, #57f287, #248046); border-radius: 4px; transition: width 0.5s ease;"></div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                <div style="background: rgba(255, 255, 255, 0.03); padding: 8px; border-radius: 6px;">
                    <div style="color: #949ba4;">Phiên hiện tại</div>
                    <div id="hud-session-time" style="font-weight: 700; color: #fff; font-size: 12px;">00m 00s</div>
                </div>
                <div style="background: rgba(255, 255, 255, 0.03); padding: 8px; border-radius: 6px;">
                    <div style="color: #949ba4;">Tổng cộng đã lưu</div>
                    <div id="hud-total-time" style="font-weight: 700; color: #57f287; font-size: 12px;">0h 00m</div>
                </div>
            </div>

            <div style="margin-top: 12px; font-size: 11px; color: #949ba4; text-align: center;">
                Stream thêm nhiều giờ cho người dùng khác để tăng cấp độ huy hiệu này.
            </div>
        </div>
    `;

    document.body.appendChild(hud);

    // Kéo thả HUD
    const header = document.getElementById("hud-header");
    let isDragging = false, dragStartX = 0, dragStartY = 0, hudStartRight = 24, hudStartBottom = 24;

    header.addEventListener("mousedown", e => {
        if (e.target.id === "hud-btn-close") return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = hud.getBoundingClientRect();
        hudStartRight = window.innerWidth - rect.right;
        hudStartBottom = window.innerHeight - rect.bottom;
        e.preventDefault();
    });

    window.addEventListener("mousemove", e => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        hud.style.right = `${Math.max(10, hudStartRight - dx)}px`;
        hud.style.bottom = `${Math.max(10, hudStartBottom - dy)}px`;
    });

    window.addEventListener("mouseup", () => { isDragging = false; });

    document.getElementById("hud-btn-close").addEventListener("click", () => {
        if (confirm("Bạn có chắc muốn DỪNG phiên cày Huy hiệu Stream?")) {
            window[LOCK_KEY].stop();
        }
    });

    // ── Cập nhật tiến độ mỗi 1 giây ──────────────────────────────────────────
    function updateHUD() {
        const sessionSec = Math.floor((Date.now() - sessionStartTime) / 1000);
        const totalSec = accumulatedSeconds + sessionSec;
        const totalHours = Math.floor(totalSec / 3600);

        const { current, next } = getCurrentAndNextTier(totalHours);

        document.getElementById("hud-tier-title").textContent = current.title.toUpperCase();
        document.getElementById("hud-tier-icon").textContent = current.icon;
        document.getElementById("hud-subtext").textContent = `${totalHours} giờ đã stream cho người khác • Đang cày tự động`;
        document.getElementById("hud-session-time").textContent = formatTime(sessionSec);
        document.getElementById("hud-total-time").textContent = formatTime(totalSec);

        if (next) {
            const range = next.hours - current.hours;
            const prog = Math.max(0, totalHours - current.hours);
            const pct = Math.min(100, Math.max(0, Math.round((prog / range) * 100)));
            const remHours = Math.max(1, next.hours - totalHours);
            document.getElementById("hud-remaining-text").textContent = `${remHours} giờ nữa`;
            document.getElementById("hud-progress-bar").style.width = `${pct}%`;
        } else {
            document.getElementById("hud-remaining-text").textContent = "Cấp Tối Đa!";
            document.getElementById("hud-progress-bar").style.width = "100%";
        }

        // Lưu vào LocalStorage mỗi 30s
        if (sessionSec > 0 && sessionSec % 30 === 0) {
            try {
                localStorage.setItem(STORAGE_KEY_TOTAL, String(totalSec));
            } catch (_) {}
        }
    }

    const timer = setInterval(updateHUD, 1000);
    updateHUD();

    window[LOCK_KEY] = {
        stop: () => {
            clearInterval(timer);
            const sessionSec = Math.floor((Date.now() - sessionStartTime) / 1000);
            accumulatedSeconds += sessionSec;
            try {
                localStorage.setItem(STORAGE_KEY_TOTAL, String(accumulatedSeconds));
            } catch (_) {}
            hud.remove();
            delete window[LOCK_KEY];
            console.log(`[Stream Time] Đã dừng cày! Tổng thời gian đã lưu: ${formatTime(accumulatedSeconds)}`);
        }
    };

    console.log("%c[LOWKEY STREAM BADGE]%c Đã khởi động cày Huy hiệu Stream thành công!", "color: #57f287; font-weight: bold;", "color: inherit;");
})();
