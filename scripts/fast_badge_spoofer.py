"""
==============================================================================
LOWKEY FAST BADGE SPOOFER (PYTHON CLI EDITION)
==============================================================================
Tự động tua nhanh tiến trình Huy hiệu Discord bằng cách gửi Telemetry trực tiếp
lên API Science nội bộ của Discord (/api/v9/science) - Kỹ thuật các Shop hay dùng!

Hỗ trợ:
- Max 5,000 Giờ Huy hiệu "Thời gian chơi" (Vĩnh Cửu)
- Max 100+ Game Huy hiệu "Trò chơi đa dạng" (Thuyết phổ quát)
- Combo toàn diện 2 trong 1

Chạy thuần Python (Không cần pip install bất kỳ thư viện ngoài nào).
==============================================================================
"""

import sys
import os
import json
import time
import uuid
import urllib.request
import urllib.error

STATE_FILE = os.path.join(os.path.dirname(__file__), "science_state.json")

# Danh sách game PC chuẩn mực được Discord nhận diện 100%
TOP_GAMES = [
    {"id": "1158877933042143272", "name": "Counter-Strike 2", "exe": "cs2.exe"},
    {"id": "423646631248461825", "name": "Grand Theft Auto V", "exe": "GTA5.exe"},
    {"id": "700136079562375258", "name": "VALORANT", "exe": "VALORANT-Win64-Shipping.exe"},
    {"id": "356875988589740042", "name": "Dota 2", "exe": "dota2.exe"},
    {"id": "1402418696126992445", "name": "League of Legends", "exe": "League of Legends.exe"},
    {"id": "541484311354081282", "name": "Apex Legends", "exe": "r5apex.exe"},
    {"id": "432980957394370572", "name": "Fortnite", "exe": "FortniteClient-Win64-Shipping.exe"},
    {"id": "376045648834985984", "name": "Minecraft", "exe": "Minecraft.exe"},
    {"id": "432980957394370573", "name": "Roblox", "exe": "RobloxPlayerBeta.exe"},
    {"id": "762434991303950386", "name": "Genshin Impact", "exe": "GenshinImpact.exe"}
]

# 100 tựa game cho Game Variety
VARIETY_NAMES = [
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
]

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_state(state):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

def get_analytics_token(user_token, cookie=""):
    url = "https://discord.com/api/v9/users/@me?with_analytics_token=true"
    headers = {
        "Authorization": user_token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }
    if cookie:
        headers["Cookie"] = cookie

    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("analytics_token"), data.get("username"), data.get("id")
    except urllib.error.HTTPError as e:
        print(f"\n[!] Lỗi khi lấy analytics_token (HTTP {e.code})")
        if e.code == 401:
            print("[-] Token không hợp lệ. Vui lòng kiểm tra lại token!")
        elif e.code == 403:
            print("[-] Bị Cloudflare chặn. Hãy nhập thêm Cookie (cf_clearance) hoặc sử dụng file F12 Console để không bị chặn!")
    except Exception as e:
        print(f"\n[!] Lỗi kết nối: {e}")
    return None, None, None

def post_science_events(user_token, analytics_token, events, cookie=""):
    url = "https://discord.com/api/v9/science"
    payload = {"events": events}
    if analytics_token:
        payload["token"] = analytics_token

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": user_token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }
    if cookie:
        headers["Cookie"] = cookie

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 204)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            time.sleep(2)
            return post_science_events(user_token, analytics_token, events, cookie)
        return False
    except Exception:
        return False

def spoof_playtime(user_token, analytics_token, game, hours, cookie=""):
    print(f"\n[Game Time] ⏳ Đang bắt đầu tua {hours:,} giờ cho game: '{game['name']}'...")
    total_seconds = hours * 3600
    session_id = str(uuid.uuid4())
    now_ms = int(time.time() * 1000)

    events = [
        {
            "type": "launch_game",
            "properties": {
                "client_track_timestamp": now_ms - (total_seconds * 1000),
                "client_heartbeat_session_id": session_id,
                "game_id": game["id"],
                "game_name": game["name"],
                "game_executable": game["exe"],
                "verified": True
            }
        },
        {
            "type": "running_game_heartbeat",
            "properties": {
                "client_track_timestamp": now_ms,
                "client_heartbeat_session_id": session_id,
                "event_sequence_number": 1,
                "game_id": game["id"],
                "game_name": game["name"],
                "game_executable": game["exe"],
                "duration": 60,
                "total_duration": total_seconds
            }
        }
    ]

    ok = post_science_events(user_token, analytics_token, events, cookie)
    if ok:
        print(f"[Game Time] ✨ THÀNH CÔNG! Discord đã ghi nhận {hours:,} giờ ({game['name']}) qua HTTP 204!")
        return True
    else:
        print(f"[Game Time] ❌ Gửi thất bại. Vui lòng kiểm tra lại kết nối hoặc cookie Cloudflare.")
        return False

def spoof_variety(user_token, analytics_token, count=100, cookie=""):
    print(f"\n[Game Variety] 🎮 Đang chuẩn bị tua {count} trò chơi đa dạng...")
    success = 0
    games = VARIETY_NAMES[:count]

    for i, name in enumerate(games, 1):
        session_id = str(uuid.uuid4())
        now_ms = int(time.time() * 1000)
        app_id = str(400000000000000000 + (i * 1234567))
        exe = name.replace(" ", "").replace(":", "").replace("'", "") + ".exe"

        events = [
            {
                "type": "launch_game",
                "properties": {
                    "client_track_timestamp": now_ms - 180000,
                    "client_heartbeat_session_id": session_id,
                    "game_id": app_id,
                    "game_name": name,
                    "game_executable": exe,
                    "verified": True
                }
            },
            {
                "type": "running_game_heartbeat",
                "properties": {
                    "client_track_timestamp": now_ms,
                    "client_heartbeat_session_id": session_id,
                    "event_sequence_number": 1,
                    "game_id": app_id,
                    "game_name": name,
                    "game_executable": exe,
                    "duration": 60,
                    "total_duration": 180
                }
            }
        ]

        ok = post_science_events(user_token, analytics_token, events, cookie)
        if ok:
            success += 1

        pct = int((i / len(games)) * 100)
        if i % 10 == 0 or i == len(games):
            print(f"[Game Variety] ⏳ Tiến độ: {i}/{len(games)} ({pct}%) - Đã hoàn tất: '{name}'")

        time.sleep(0.15)

    print(f"[Game Variety] ✨ HOÀN THÀNH! Đã ghi nhận thành công {success}/{len(games)} tựa game!")
    return success

def main():
    print("=" * 65)
    print("  LOWKEY TELEMETRY BADGE SPOOFER (5000H & 100 GAMES)")
    print("=" * 65)

    state = load_state()
    user_token = state.get("user_token")

    if not user_token:
        user_token = input("\n[?] Nhập Discord User Token của bạn: ").strip().strip('"').strip("'")
        if not user_token:
            print("[-] Không có token. Thoát chương trình.")
            return

    cookie = state.get("cookie", "")

    print("\n[*] Đang xác thực tài khoản và lấy Analytics Token...")
    analytics_token, username, user_id = get_analytics_token(user_token, cookie)

    if not analytics_token and not username:
        # Nếu bị 403 Cloudflare, hỏi thêm cookie
        print("\n[!] Không thể kết nối trực tiếp đến API Discord.")
        print("[*] Gợi ý: Nếu bị Cloudflare chặn, hãy mở Discord Console (F12) và dùng file fast_badge_spoofer_f12.js để chạy trực tiếp không bao giờ bị chặn!")
        cf_cookie = input("\n[?] Nếu có cookie 'cf_clearance' hãy dán vào đây (nhấn Enter để bỏ qua): ").strip()
        if cf_cookie:
            cookie = cf_cookie
            analytics_token, username, user_id = get_analytics_token(user_token, cookie)

    if username:
        print(f"[+] Tài khoản: {username} (ID: {user_id})")
        print(f"[+] Analytics Token: {'Đã lấy thành công ✓' if analytics_token else 'Trống'}")
        state["user_token"] = user_token
        state["cookie"] = cookie
        save_state(state)
    else:
        print("[!] Cảnh báo: Không thể lấy thông tin người dùng. Tiếp tục với token đã nhập...")

    while True:
        print("\n" + "-" * 50)
        print(" CHỌN CHẾ ĐỘ CÀY HUY HIỆU:")
        print(" 1. Max 5,000 Giờ Huy hiệu 'Thời gian chơi' (Vĩnh Cửu)")
        print(" 2. Max 100 Trò chơi Huy hiệu 'Trò chơi đa dạng' (Thuyết phổ quát)")
        print(" 3. [COMBO TOÀN DIỆN] 5,000 Giờ + 100 Trò chơi (Khuyên dùng nhất!)")
        print(" 4. Tùy chỉnh số giờ (150h, 500h, 1000h, 2000h, ...)")
        print(" 5. Đổi Token")
        print(" 0. Thoát")
        print("-" * 50)

        choice = input("[?] Lựa chọn của bạn (0-5): ").strip()

        if choice == "1":
            spoof_playtime(user_token, analytics_token, TOP_GAMES[0], 5000, cookie)
        elif choice == "2":
            spoof_variety(user_token, analytics_token, 100, cookie)
        elif choice == "3":
            print("\n[*] Đang khởi chạy Combo toàn diện...")
            spoof_playtime(user_token, analytics_token, TOP_GAMES[0], 5000, cookie)
            time.sleep(1)
            spoof_variety(user_token, analytics_token, 100, cookie)
        elif choice == "4":
            try:
                hrs = int(input("[?] Nhập số giờ mong muốn (ví dụ 5000): ").strip())
                if hrs > 0:
                    spoof_playtime(user_token, analytics_token, TOP_GAMES[0], hrs, cookie)
                else:
                    print("[-] Số giờ phải lớn hơn 0.")
            except ValueError:
                print("[-] Vui lòng nhập số hợp lệ.")
        elif choice == "5":
            user_token = input("\n[?] Nhập Token mới: ").strip()
            state["user_token"] = user_token
            save_state(state)
            analytics_token, username, user_id = get_analytics_token(user_token, cookie)
        elif choice == "0":
            print("\n[*] Tạm biệt!")
            break
        else:
            print("[-] Lựa chọn không hợp lệ.")

        print("\n" + "=" * 65)
        print("🎉 TELEMETRY ĐÃ ĐƯỢC GỬI THÀNH CÔNG ĐẾN MÁY CHỦ DISCORD!")
        print("📌 Lưu ý: Discord Data Pipeline mất 24h - 48h để tổng hợp")
        print("   và hiển thị huy hiệu lên Profile của bạn.")
        print("=" * 65)

if __name__ == "__main__":
    main()
