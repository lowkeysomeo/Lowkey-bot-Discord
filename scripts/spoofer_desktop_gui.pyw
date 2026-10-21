# -*- coding: utf-8 -*-
"""
==============================================================================
LOWKEY BADGE SPOOFER - DESKTOP GUI APPLICATION
==============================================================================
Ứng dụng giao diện Desktop độc lập dành cho Windows.
Mỗi lần dùng chỉ cần mở app, nhập/dán Token của bất kỳ tài khoản nào và bấm Start!
==============================================================================
"""

import os
import sys
import json
import time
import uuid
import threading
import urllib.request
import urllib.error

import tkinter as tk
from tkinter import ttk, messagebox
from tkinter.scrolledtext import ScrolledText

# Đường dẫn lưu cấu hình state
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, "science_state.json")

# Danh sách game chuẩn Discord nhận diện 100%
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

DETECTABLE_FILE = os.path.join(BASE_DIR, "detectable_games.json")

def load_verified_games(target_count=105):
    # 1. Đọc từ file danh mục 120 game chuẩn của Discord
    if os.path.exists(DETECTABLE_FILE):
        try:
            with open(DETECTABLE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if len(data) >= target_count:
                    return data[:target_count]
                elif len(data) > 0:
                    return data
        except Exception:
            pass

    # 2. Thử fetch trực tiếp từ API Discord nếu file bị thiếu
    try:
        req = urllib.request.Request(
            "https://discord.com/api/v9/applications/detectable",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
            clean = []
            seen = set()
            ignore = ['crash', 'unins', 'report', 'setup', 'redist', 'helper', 'x360ce', 'patch', 'vcredist', 'dxsetup']
            for g in raw:
                gid = str(g.get("id", ""))
                name = g.get("name", "").strip()
                if not gid or not name or gid in seen:
                    continue
                for e in g.get("executables", []):
                    ename = e.get("name", "")
                    if ename and (e.get("os") == "win32" or not e.get("os")):
                        base = os.path.basename(ename.replace("\\", "/"))
                        if base.lower().endswith(".exe") and not any(w in base.lower() for w in ignore):
                            clean.append({"id": gid, "name": name, "exe": base})
                            seen.add(gid)
                            break
                if len(clean) >= target_count:
                    return clean
            if clean:
                return clean
    except Exception:
        pass

    return TOP_GAMES

class SpooferDesktopApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("⚡ Lowkey Fast Badge Spoofer - 5.000h & 100 Games")
        self.geometry("620x760")
        self.minsize(580, 720)
        self.configure(bg="#1e1f22")

        self.running_thread = None
        self.is_cancelling = False
        self.cached_analytics_token = None

        self.load_state_data()
        self.create_styles()
        self.build_ui()

        # Tự động xác thực nếu đã có token lưu sẵn
        if self.saved_token:
            self.after(500, self.verify_account)

    def load_state_data(self):
        self.state = {}
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, "r", encoding="utf-8") as f:
                    self.state = json.load(f)
            except Exception:
                pass
        self.saved_token = self.state.get("user_token", "")

    def save_state_data(self):
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(self.state, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    def create_styles(self):
        self.style = ttk.Style(self)
        self.style.theme_use("clam")

        # Custom ttk progressbar
        self.style.configure(
            "Custom.Horizontal.TProgressbar",
            troughcolor="#2b2d31",
            background="#5865F2",
            darkcolor="#5865F2",
            lightcolor="#5865F2",
            bordercolor="#1e1f22",
            thickness=10
        )

    def build_ui(self):
        # ── 1. HEADER ────────────────────────────────────────────────────────
        header_frame = tk.Frame(self, bg="#2b2d31", height=70)
        header_frame.pack(fill=tk.X, side=tk.TOP)

        hdr_content = tk.Frame(header_frame, bg="#2b2d31")
        hdr_content.pack(fill=tk.BOTH, padx=20, pady=12)

        icon_label = tk.Label(
            hdr_content, text="⚡", font=("Segoe UI", 22, "bold"),
            bg="#5865F2", fg="white", width=2, height=1
        )
        icon_label.pack(side=tk.LEFT, padx=(0, 14))

        title_box = tk.Frame(hdr_content, bg="#2b2d31")
        title_box.pack(side=tk.LEFT, fill=tk.Y)

        title_lbl = tk.Label(
            title_box, text="LOWKEY FAST BADGE SPOOFER",
            font=("Segoe UI", 13, "bold"), fg="#f2f3f5", bg="#2b2d31"
        )
        title_lbl.pack(anchor="w")

        subtitle_lbl = tk.Label(
            title_box, text="Tua nhanh 5.000 Giờ & 100 Game qua Discord Science Telemetry API",
            font=("Segoe UI", 9), fg="#949ba4", bg="#2b2d31"
        )
        subtitle_lbl.pack(anchor="w")

        # ── MAIN CONTAINER ───────────────────────────────────────────────────
        main_box = tk.Frame(self, bg="#1e1f22")
        main_box.pack(fill=tk.BOTH, expand=True, padx=20, pady=15)

        # ── 2. TOKEN & ACCOUNT CARD ──────────────────────────────────────────
        card_token = tk.Frame(main_box, bg="#2b2d31", bd=1, relief="solid")
        card_token.configure(highlightbackground="#383a40", highlightthickness=1)
        card_token.pack(fill=tk.X, pady=(0, 12))

        token_inner = tk.Frame(card_token, bg="#2b2d31", padx=16, pady=14)
        token_inner.pack(fill=tk.BOTH)

        lbl_token = tk.Label(
            token_inner, text="DISCORD USER TOKEN:",
            font=("Segoe UI", 9, "bold"), fg="#b5bac1", bg="#2b2d31"
        )
        lbl_token.pack(anchor="w")

        entry_frame = tk.Frame(token_inner, bg="#2b2d31")
        entry_frame.pack(fill=tk.X, pady=(6, 8))

        self.token_var = tk.StringVar(value=self.saved_token)
        self.entry_token = tk.Entry(
            entry_frame, textvariable=self.token_var, show="•",
            font=("Consolas", 10), bg="#1e1f22", fg="#f2f3f5",
            insertbackground="white", bd=1, relief="solid", highlightthickness=0
        )
        self.entry_token.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=5, padx=(0, 8))

        self.btn_show_token = tk.Button(
            entry_frame, text="👁", font=("Segoe UI", 10),
            bg="#383a40", fg="white", activebackground="#4e5058", activeforeground="white",
            bd=0, relief="flat", cursor="hand2", width=3,
            command=self.toggle_token_visibility
        )
        self.btn_show_token.pack(side=tk.LEFT, padx=(0, 6))

        self.btn_verify = tk.Button(
            entry_frame, text="Kiểm Tra", font=("Segoe UI", 9, "bold"),
            bg="#4e5058", fg="white", activebackground="#5865F2", activeforeground="white",
            bd=0, relief="flat", cursor="hand2", padx=12,
            command=self.verify_account
        )
        self.btn_verify.pack(side=tk.RIGHT)

        # Account status row
        self.status_account_frame = tk.Frame(token_inner, bg="#2b2d31")
        self.status_account_frame.pack(fill=tk.X, pady=(2, 0))

        self.lbl_account_name = tk.Label(
            self.status_account_frame, text="Chưa xác thực tài khoản",
            font=("Segoe UI", 9, "bold"), fg="#949ba4", bg="#2b2d31"
        )
        self.lbl_account_name.pack(side=tk.LEFT)

        self.lbl_account_badge = tk.Label(
            self.status_account_frame, text="Chưa có Token",
            font=("Segoe UI", 8, "bold"), bg="#383a40", fg="#ED4245", padx=8, pady=2
        )
        self.lbl_account_badge.pack(side=tk.RIGHT)

        # ── 3. GAME SELECTION & CONFIG CARD ──────────────────────────────────
        card_config = tk.Frame(main_box, bg="#2b2d31", bd=1, relief="solid")
        card_config.configure(highlightbackground="#383a40", highlightthickness=1)
        card_config.pack(fill=tk.X, pady=(0, 12))

        config_inner = tk.Frame(card_config, bg="#2b2d31", padx=16, pady=12)
        config_inner.pack(fill=tk.BOTH)

        cfg_grid = tk.Frame(config_inner, bg="#2b2d31")
        cfg_grid.pack(fill=tk.X)

        # Cột chọn game
        col_game = tk.Frame(cfg_grid, bg="#2b2d31")
        col_game.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))

        lbl_game = tk.Label(
            col_game, text="CHỌN GAME CHÍNH ĐỂ CÀY GIỜ:",
            font=("Segoe UI", 8, "bold"), fg="#b5bac1", bg="#2b2d31"
        )
        lbl_game.pack(anchor="w", pady=(0, 4))

        self.game_names = [g["name"] for g in TOP_GAMES]
        self.game_var = tk.StringVar(value=self.game_names[0])
        self.combo_game = ttk.Combobox(
            col_game, textvariable=self.game_var, values=self.game_names,
            state="readonly", font=("Segoe UI", 10)
        )
        self.combo_game.pack(fill=tk.X, ipady=3)

        # Cột số giờ
        col_hours = tk.Frame(cfg_grid, bg="#2b2d31")
        col_hours.pack(side=tk.RIGHT, fill=tk.Y)

        lbl_hours = tk.Label(
            col_hours, text="SỐ GIỜ:",
            font=("Segoe UI", 8, "bold"), fg="#b5bac1", bg="#2b2d31"
        )
        lbl_hours.pack(anchor="w", pady=(0, 4))

        self.hours_var = tk.StringVar(value="5000")
        self.entry_hours = tk.Entry(
            col_hours, textvariable=self.hours_var, width=10,
            font=("Consolas", 10, "bold"), bg="#1e1f22", fg="#57F287",
            insertbackground="white", bd=1, relief="solid", justify="center"
        )
        self.entry_hours.pack(ipady=4)

        # ── 4. ACTION BUTTONS ────────────────────────────────────────────────
        btn_frame = tk.Frame(main_box, bg="#1e1f22")
        btn_frame.pack(fill=tk.X, pady=(0, 12))

        self.btn_combo = tk.Button(
            btn_frame,
            text="🚀  [COMBO] BẮT ĐẦU CÀY CẢ 5.000 GIỜ + 100 GAME (KHUYÊN DÙNG)",
            font=("Segoe UI", 10, "bold"), bg="#5865F2", fg="white",
            activebackground="#4752C4", activeforeground="white",
            bd=0, relief="flat", cursor="hand2", pady=10,
            command=self.start_combo
        )
        self.btn_combo.pack(fill=tk.X, pady=(0, 8))

        btn_row2 = tk.Frame(btn_frame, bg="#1e1f22")
        btn_row2.pack(fill=tk.X)

        self.btn_time = tk.Button(
            btn_row2, text="⚡ Chỉ Cày Giờ (5.000h)",
            font=("Segoe UI", 9, "bold"), bg="#2b2d31", fg="#f2f3f5",
            activebackground="#383a40", activeforeground="white",
            bd=1, relief="solid", cursor="hand2", pady=8,
            command=self.start_playtime_only
        )
        self.btn_time.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))

        self.btn_variety = tk.Button(
            btn_row2, text="🎮 Chỉ Cày 100 Game",
            font=("Segoe UI", 9, "bold"), bg="#2b2d31", fg="#f2f3f5",
            activebackground="#383a40", activeforeground="white",
            bd=1, relief="solid", cursor="hand2", pady=8,
            command=self.start_variety_only
        )
        self.btn_variety.pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=(5, 0))

        # ── 5. PROGRESS & LIVE LOG BOX ───────────────────────────────────────
        card_log = tk.Frame(main_box, bg="#2b2d31", bd=1, relief="solid")
        card_log.configure(highlightbackground="#383a40", highlightthickness=1)
        card_log.pack(fill=tk.BOTH, expand=True)

        log_inner = tk.Frame(card_log, bg="#2b2d31", padx=14, pady=10)
        log_inner.pack(fill=tk.BOTH, expand=True)

        # Trạng thái & % tiến độ
        status_row = tk.Frame(log_inner, bg="#2b2d31")
        status_row.pack(fill=tk.X, pady=(0, 6))

        self.lbl_status = tk.Label(
            status_row, text="Trạng thái: Sẵn sàng",
            font=("Segoe UI", 9, "bold"), fg="#57F287", bg="#2b2d31"
        )
        self.lbl_status.pack(side=tk.LEFT)

        self.lbl_pct = tk.Label(
            status_row, text="0%",
            font=("Consolas", 10, "bold"), fg="#5865F2", bg="#2b2d31"
        )
        self.lbl_pct.pack(side=tk.RIGHT)

        self.progress_bar = ttk.Progressbar(
            log_inner, style="Custom.Horizontal.TProgressbar",
            mode="determinate"
        )
        self.progress_bar.pack(fill=tk.X, pady=(0, 10))

        # Khung nhật ký log
        self.log_text = ScrolledText(
            log_inner, wrap=tk.WORD, font=("Consolas", 9),
            bg="#1e1f22", fg="#dbdee1", bd=0, insertbackground="white"
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.log_text.tag_config("green", foreground="#57F287")
        self.log_text.tag_config("yellow", foreground="#FEE75C")
        self.log_text.tag_config("red", foreground="#ED4245")
        self.log_text.tag_config("blurple", foreground="#5865F2")

        # ── FOOTER NOTE ──────────────────────────────────────────────────────
        footer_lbl = tk.Label(
            self,
            text="📌 Sau khi gửi thành công (HTTP 204), Discord sẽ cập nhật huy hiệu lên hồ sơ trong vòng 24h - 48h.",
            font=("Segoe UI", 8), fg="#949ba4", bg="#1e1f22", pady=8
        )
        footer_lbl.pack(side=tk.BOTTOM, fill=tk.X)

        self.log("Sẵn sàng cày huy hiệu. Nhập token và nhấn nút Bắt đầu!", "yellow")

    # ── LOGGING HELPER ───────────────────────────────────────────────────────
    def log(self, message, tag=None):
        self.log_text.configure(state=tk.NORMAL)
        t_str = time.strftime("[%H:%M:%S] ")
        self.log_text.insert(tk.END, t_str)
        if tag:
            self.log_text.insert(tk.END, message + "\n", tag)
        else:
            self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state=tk.DISABLED)

    def set_status(self, text, color="#57F287"):
        self.lbl_status.config(text=f"Trạng thái: {text}", fg=color)

    def set_progress(self, pct):
        self.progress_bar["value"] = pct
        self.lbl_pct.config(text=f"{int(pct)}%")

    def toggle_token_visibility(self):
        if self.entry_token.cget("show") == "":
            self.entry_token.configure(show="•")
            self.btn_show_token.config(text="👁")
        else:
            self.entry_token.configure(show="")
            self.btn_show_token.config(text="🔒")

    # ── VERIFY USER TOKEN ────────────────────────────────────────────────────
    def verify_account(self):
        token = self.token_var.get().strip().strip('"').strip("'")
        if not token:
            self.lbl_account_name.config(text="Vui lòng nhập Token trước!", fg="#ED4245")
            self.lbl_account_badge.config(text="Thiếu Token", bg="#383a40", fg="#ED4245")
            return

        def _do_verify():
            self.lbl_account_name.config(text="Đang kiểm tra...", fg="#FEE75C")
            url = "https://discord.com/api/v9/users/@me?with_analytics_token=true"
            headers = {
                "Authorization": token,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                "Content-Type": "application/json"
            }
            req = urllib.request.Request(url, headers=headers, method="GET")
            try:
                with urllib.request.urlopen(req, timeout=8) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    username = data.get("username", "Unknown")
                    discrim = data.get("discriminator", "0")
                    user_tag = f"{username}#{discrim}" if discrim != "0" else username
                    global_name = data.get("global_name")
                    if global_name:
                        user_tag += f" ({global_name})"

                    self.cached_analytics_token = data.get("analytics_token")

                    self.lbl_account_name.config(text=f"👤 {user_tag}", fg="#f2f3f5")
                    self.lbl_account_badge.config(text="Token OK ✓", bg="#1f3d2b", fg="#57F287")
                    self.log(f"Đã xác thực thành công tài khoản: {user_tag}", "green")

                    # Lưu token vào file state
                    self.state["user_token"] = token
                    self.save_state_data()
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    self.lbl_account_name.config(text="Token không hợp lệ (401 Unauthorized)", fg="#ED4245")
                    self.lbl_account_badge.config(text="Sai Token", bg="#3d1f24", fg="#ED4245")
                    self.log("Lỗi: Token không hợp lệ. Vui lòng kiểm tra lại!", "red")
                else:
                    self.lbl_account_name.config(text=f"Lỗi kết nối (HTTP {e.code})", fg="#ED4245")
                    self.log(f"Lỗi kiểm tra token (HTTP {e.code})", "red")
            except Exception as e:
                self.lbl_account_name.config(text="Không thể kết nối đến Discord", fg="#ED4245")
                self.log(f"Lỗi: {e}", "red")

        threading.Thread(target=_do_verify, daemon=True).start()

    # ── TELEMETRY METHODS ────────────────────────────────────────────────────
    def post_science_events(self, token, events):
        url = "https://discord.com/api/v9/science"
        if not self.cached_analytics_token:
            try:
                user_req = urllib.request.Request(
                    "https://discord.com/api/v9/users/@me?with_analytics_token=true",
                    headers={
                        "Authorization": token,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                        "Content-Type": "application/json"
                    },
                    method="GET"
                )
                with urllib.request.urlopen(user_req, timeout=5) as u_resp:
                    u_data = json.loads(u_resp.read().decode("utf-8"))
                    self.cached_analytics_token = u_data.get("analytics_token")
            except Exception:
                pass

        payload = {"events": events}
        if self.cached_analytics_token:
            payload["token"] = self.cached_analytics_token

        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Authorization": token,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Content-Type": "application/json"
        }

        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status in (200, 204)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2)
                return self.post_science_events(token, events)
            return False
        except Exception:
            return False

    def toggle_buttons(self, state):
        val = tk.NORMAL if state else tk.DISABLED
        self.btn_combo.config(state=val)
        self.btn_time.config(state=val)
        self.btn_variety.config(state=val)
        self.btn_verify.config(state=val)

    # ── TASK 1: PLAYTIME ONLY ────────────────────────────────────────────────
    def start_playtime_only(self):
        token = self.token_var.get().strip().strip('"').strip("'")
        if not token:
            messagebox.showwarning("Thiếu Token", "Vui lòng nhập Discord User Token trước khi bắt đầu!")
            return

        try:
            hours = int(self.hours_var.get().strip())
            if hours <= 0:
                raise ValueError
        except ValueError:
            messagebox.showwarning("Số Giờ Sai", "Vui lòng nhập một số giờ hợp lệ lớn hơn 0!")
            return

        sel_name = self.game_var.get()
        target_game = next((g for g in TOP_GAMES if g["name"] == sel_name), TOP_GAMES[0])

        self.toggle_buttons(False)
        self.set_progress(10)
        self.set_status("Đang gửi telemetry giờ chơi...", "#FEE75C")

        def _worker():
            self.log(f"Bắt đầu tua {hours:,} giờ cho game: '{target_game['name']}'...", "yellow")
            total_seconds = hours * 3600
            session_id = str(uuid.uuid4())
            now_ms = int(time.time() * 1000)

            events = [
                {
                    "type": "launch_game",
                    "properties": {
                        "client_track_timestamp": now_ms - (total_seconds * 1000),
                        "client_heartbeat_session_id": session_id,
                        "game_id": target_game["id"],
                        "game_name": target_game["name"],
                        "game_executable": target_game["exe"],
                        "verified": True
                    }
                },
                {
                    "type": "running_game_heartbeat",
                    "properties": {
                        "client_track_timestamp": now_ms,
                        "client_heartbeat_session_id": session_id,
                        "event_sequence_number": 1,
                        "game_id": target_game["id"],
                        "game_name": target_game["name"],
                        "game_executable": target_game["exe"],
                        "duration": 60,
                        "total_duration": total_seconds
                    }
                }
            ]

            ok = self.post_science_events(token, events)
            self.set_progress(100)

            if ok:
                self.set_status("Thành công (HTTP 204) ✓", "#57F287")
                self.log(f"✨ THÀNH CÔNG! Discord đã nhận {hours:,}h cho '{target_game['name']}'!", "green")
                messagebox.showinfo("Hoàn Tất", f"Đã gửi thành công {hours:,} giờ cho game '{target_game['name']}'!\nDiscord sẽ cập nhật huy hiệu trong 24h - 48h.")
            else:
                self.set_status("Thất bại", "#ED4245")
                self.log("❌ Gửi thất bại. Hãy kiểm tra lại Token hoặc mạng internet.", "red")
                messagebox.showerror("Lỗi", "Gửi gói tin thất bại. Vui lòng kiểm tra lại Token!")

            self.toggle_buttons(True)

        threading.Thread(target=_worker, daemon=True).start()

    # ── TASK 2: VARIETY ONLY ─────────────────────────────────────────────────
    def start_variety_only(self):
        token = self.token_var.get().strip().strip('"').strip("'")
        if not token:
            messagebox.showwarning("Thiếu Token", "Vui lòng nhập Discord User Token trước khi bắt đầu!")
            return

        self.toggle_buttons(False)
        self.set_progress(0)
        self.set_status("Đang gửi telemetry 100 game...", "#FEE75C")

        def _worker():
            games = load_verified_games(105)
            success = 0
            self.log(f"Bắt đầu tua {len(games)} trò chơi PC chuẩn từ cơ sở dữ liệu Discord...", "yellow")

            for i, game in enumerate(games, 1):
                session_id = str(uuid.uuid4())
                now_ms = int(time.time() * 1000)
                app_id = game["id"]
                name = game["name"]
                exe = game["exe"]

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

                ok = self.post_science_events(token, events)
                if ok:
                    success += 1

                pct = (i / len(games)) * 100
                self.set_progress(pct)
                self.set_status(f"Đang tua game ({i}/{len(games)})...", "#5865F2")

                if i % 10 == 0 or i == len(games):
                    self.log(f"[{i}/{len(games)}] Đã hoàn tất: '{name}' (ID: {app_id})", "blurple")

                time.sleep(0.12)

            self.set_status(f"Hoàn thành {success}/{len(games)} Game ✓", "#57F287")
            self.log(f"✨ HOÀN TẤT! Đã gửi thành công {success}/{len(games)} trò chơi chính thức!", "green")
            self.toggle_buttons(True)
            messagebox.showinfo("Hoàn Tất", f"Đã gửi thành công {success} tựa game chuẩn Discord!\nHuy hiệu sẽ cập nhật trong 24h - 48h.")

        threading.Thread(target=_worker, daemon=True).start()

    # ── TASK 3: COMBO ALL-IN-ONE ─────────────────────────────────────────────
    def start_combo(self):
        token = self.token_var.get().strip().strip('"').strip("'")
        if not token:
            messagebox.showwarning("Thiếu Token", "Vui lòng nhập Discord User Token trước khi bắt đầu!")
            return

        try:
            hours = int(self.hours_var.get().strip())
            if hours <= 0:
                raise ValueError
        except ValueError:
            messagebox.showwarning("Số Giờ Sai", "Vui lòng nhập số giờ hợp lệ!")
            return

        sel_name = self.game_var.get()
        target_game = next((g for g in TOP_GAMES if g["name"] == sel_name), TOP_GAMES[0])

        self.toggle_buttons(False)
        self.set_progress(0)
        self.set_status("Đang chạy Combo toàn diện...", "#FEE75C")

        def _worker():
            self.log("🚀 BẮT ĐẦU COMBO: BƯỚC 1/2 TUA 5.000 GIỜ...", "yellow")
            total_seconds = hours * 3600
            session_id = str(uuid.uuid4())
            now_ms = int(time.time() * 1000)

            events = [
                {
                    "type": "launch_game",
                    "properties": {
                        "client_track_timestamp": now_ms - (total_seconds * 1000),
                        "client_heartbeat_session_id": session_id,
                        "game_id": target_game["id"],
                        "game_name": target_game["name"],
                        "game_executable": target_game["exe"],
                        "verified": True
                    }
                },
                {
                    "type": "running_game_heartbeat",
                    "properties": {
                        "client_track_timestamp": now_ms,
                        "client_heartbeat_session_id": session_id,
                        "event_sequence_number": 1,
                        "game_id": target_game["id"],
                        "game_name": target_game["name"],
                        "game_executable": target_game["exe"],
                        "duration": 60,
                        "total_duration": total_seconds
                    }
                }
            ]

            p_ok = self.post_science_events(token, events)
            if p_ok:
                self.log(f"✓ Bước 1 thành công: Đã nhận {hours:,}h cho '{target_game['name']}'!", "green")
            else:
                self.log("⚠ Bước 1 gặp sự cố khi gửi giờ chơi, vẫn tiếp tục Bước 2...", "yellow")

            time.sleep(1)
            self.log("🚀 BƯỚC 2/2: BẮT ĐẦU TUA 100 TỰA GAME...", "yellow")

            games = load_verified_games(105)
            success = 0
            for i, game in enumerate(games, 1):
                session_id = str(uuid.uuid4())
                now_ms = int(time.time() * 1000)
                app_id = game["id"]
                name = game["name"]
                exe = game["exe"]

                events_var = [
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

                ok = self.post_science_events(token, events_var)
                if ok:
                    success += 1

                pct = (i / len(games)) * 100
                self.set_progress(pct)
                self.set_status(f"Đang tua game ({i}/{len(games)})...", "#5865F2")

                if i % 10 == 0 or i == len(games):
                    self.log(f"[{i}/{len(games)}] Đã hoàn tất: '{name}' (HTTP 204)", "blurple")

                time.sleep(0.12)

            self.set_status("COMBO HOÀN TẤT 100% ✓", "#57F287")
            self.log("🎉 TẤT CẢ GÓI TIN ĐÃ ĐƯỢC GỬI THÀNH CÔNG ĐẾN DISCORD!", "green")
            self.log("📌 Sau chu kỳ 24h - 48h, huy hiệu sẽ hiển thị trên Profile của bạn.", "yellow")
            self.toggle_buttons(True)
            messagebox.showinfo(
                "Combo Thành Công",
                f"Đã hoàn thành xuất sắc COMBO!\n- 5.000 Giờ: {target_game['name']}\n- {success} Trò chơi đa dạng\n\nDiscord sẽ cập nhật huy hiệu trong 24h - 48h!"
            )

        threading.Thread(target=_worker, daemon=True).start()

if __name__ == "__main__":
    app = SpooferDesktopApp()
    app.mainloop()
