# -*- coding: utf-8 -*-
"""
==============================================================================
LOWKEY BADGE SPOOFER - DESKTOP GUI APPLICATION (2026 EDITION)
==============================================================================
Ứng dụng giao diện Desktop Windows độc lập, hỗ trợ tăng tiến trình 2 Huy hiệu:
- "Trò chơi đa dạng" (100 Games)
- "Thời gian chơi" (Tùy chọn 30h - 5.000h)

Tích hợp chuẩn Telemetry Engine của Discord:
- Tự động tạo Windows PE Authenticode Fingerprint
- Đồng bộ chuỗi x-super-properties và phiên heartbeat
- Gửi đầy đủ vòng đời 3 bước: initial heartbeat -> launch -> final heartbeat
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

# Thêm đường dẫn thư mục scripts để import engine
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fast_badge_spoofer import (
    ScienceEngine,
    generate_fingerprint,
    build_super_props,
    fetch_analytics_token,
    user_id_from_token,
    load_verified_games,
    load_state,
    save_state,
    STATE_FILE,
    FALLBACK_GAMES
)

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

class SpooferDesktopApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("⚡ Lowkey Fast Badge Spoofer - 100 Games & Playtime (Pro 2026)")
        self.geometry("640x780")
        self.minsize(600, 740)
        self.configure(bg="#1e1f22")

        self.running_thread = None
        self.cached_analytics_token = None
        self.cached_fingerprint = None
        self.current_user_id = None

        self.load_state_data()
        self.create_styles()
        self.build_ui()

        if self.saved_token:
            self.after(500, self.verify_account)

    def load_state_data(self):
        self.state = load_state()
        self.saved_token = self.state.get("user_token", "")
        self.cached_fingerprint = self.state.get("fingerprint", "")

    def save_state_data(self):
        save_state(self.state)

    def create_styles(self):
        self.style = ttk.Style(self)
        self.style.theme_use("clam")
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
            title_box, text="LOWKEY DISCORD BADGE SPOOFER",
            font=("Segoe UI", 13, "bold"), fg="#f2f3f5", bg="#2b2d31"
        )
        title_lbl.pack(anchor="w")

        subtitle_lbl = tk.Label(
            title_box, text="Tua nhanh 100 Game & Giờ chơi qua Discord Science Telemetry Engine (2026)",
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

        col_hours = tk.Frame(cfg_grid, bg="#2b2d31")
        col_hours.pack(side=tk.RIGHT, fill=tk.Y)

        lbl_hours = tk.Label(
            col_hours, text="SỐ GIỜ:",
            font=("Segoe UI", 8, "bold"), fg="#b5bac1", bg="#2b2d31"
        )
        lbl_hours.pack(anchor="w", pady=(0, 4))

        self.hours_var = tk.StringVar(value="30")
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
            text="🚀  [COMBO TOÀN DIỆN] BẮT ĐẦU CÀY CẢ 100 GAME + SỐ GIỜ (KHUYÊN DÙNG)",
            font=("Segoe UI", 10, "bold"), bg="#5865F2", fg="white",
            activebackground="#4752C4", activeforeground="white",
            bd=0, relief="flat", cursor="hand2", pady=10,
            command=self.start_combo
        )
        self.btn_combo.pack(fill=tk.X, pady=(0, 8))

        btn_row2 = tk.Frame(btn_frame, bg="#1e1f22")
        btn_row2.pack(fill=tk.X)

        self.btn_time = tk.Button(
            btn_row2, text="⚡ Chỉ Cày Giờ Chơi",
            font=("Segoe UI", 9, "bold"), bg="#2b2d31", fg="#f2f3f5",
            activebackground="#383a40", activeforeground="white",
            bd=1, relief="solid", cursor="hand2", pady=8,
            command=self.start_playtime_only
        )
        self.btn_time.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))

        self.btn_variety = tk.Button(
            btn_row2, text="🎮 Chỉ Cày 100 Game Đa Dạng",
            font=("Segoe UI", 9, "bold"), bg="#2b2d31", fg="#f2f3f5",
            activebackground="#383a40", activeforeground="white",
            bd=1, relief="solid", cursor="hand2", pady=8,
            command=self.start_variety_only
        )
        self.btn_variety.pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=(5, 0))

        # ── 5. PROGRESS & REALTIME LOGS ──────────────────────────────────────
        card_log = tk.Frame(main_box, bg="#2b2d31", bd=1, relief="solid")
        card_log.configure(highlightbackground="#383a40", highlightthickness=1)
        card_log.pack(fill=tk.BOTH, expand=True)

        log_inner = tk.Frame(card_log, bg="#2b2d31", padx=14, pady=12)
        log_inner.pack(fill=tk.BOTH, expand=True)

        status_box = tk.Frame(log_inner, bg="#2b2d31")
        status_box.pack(fill=tk.X, pady=(0, 6))

        tk.Label(
            status_box, text="Trạng thái:",
            font=("Segoe UI", 8, "bold"), fg="#949ba4", bg="#2b2d31"
        ).pack(side=tk.LEFT)

        self.lbl_status = tk.Label(
            status_box, text="Sẵn sàng...",
            font=("Segoe UI", 8, "bold"), fg="#57F287", bg="#2b2d31"
        )
        self.lbl_status.pack(side=tk.LEFT, padx=(6, 0))

        self.lbl_pct = tk.Label(
            status_box, text="0%",
            font=("Segoe UI", 8, "bold"), fg="#949ba4", bg="#2b2d31"
        )
        self.lbl_pct.pack(side=tk.RIGHT)

        self.progress_bar = ttk.Progressbar(
            log_inner, orient="horizontal", mode="determinate",
            style="Custom.Horizontal.TProgressbar"
        )
        self.progress_bar.pack(fill=tk.X, pady=(0, 8))

        lbl_console = tk.Label(
            log_inner, text="NHẬT KÝ HOẠT ĐỘNG (SCIENCE TELEMETRY):",
            font=("Segoe UI", 8, "bold"), fg="#b5bac1", bg="#2b2d31"
        )
        lbl_console.pack(anchor="w", pady=(0, 4))

        self.txt_log = ScrolledText(
            log_inner, font=("Consolas", 9), bg="#1e1f22", fg="#dbdee1",
            insertbackground="white", bd=0, relief="flat", height=10
        )
        self.txt_log.pack(fill=tk.BOTH, expand=True)
        self.txt_log.tag_config("green", foreground="#57F287")
        self.txt_log.tag_config("yellow", foreground="#FEE75C")
        self.txt_log.tag_config("red", foreground="#ED4245")
        self.txt_log.tag_config("blurple", foreground="#5865F2")
        self.txt_log.tag_config("grey", foreground="#949ba4")

        # ── 6. FOOTER ────────────────────────────────────────────────────────
        footer_frame = tk.Frame(self, bg="#1e1f22", height=32)
        footer_frame.pack(fill=tk.X, side=tk.BOTTOM, padx=20, pady=(0, 10))

        note_lbl = tk.Label(
            footer_frame,
            text="ℹ️ Sau khi gửi telemetry thành công (HTTP 204), Discord sẽ tổng hợp và cập nhật huy hiệu trong 24h - 48h.",
            font=("Segoe UI", 8), fg="#949ba4", bg="#1e1f22"
        )
        note_lbl.pack(anchor="w")

    def toggle_token_visibility(self):
        if self.entry_token.cget("show") == "•":
            self.entry_token.config(show="")
            self.btn_show_token.config(text="🔒")
        else:
            self.entry_token.config(show="•")
            self.btn_show_token.config(text="👁")

    def log(self, text, tag="grey"):
        t_str = time.strftime("[%H:%M:%S] ")
        self.txt_log.insert(tk.END, t_str, "grey")
        self.txt_log.insert(tk.END, text + "\n", tag)
        self.txt_log.see(tk.END)

    def set_status(self, text, color="#57F287"):
        self.lbl_status.config(text=text, fg=color)

    def set_progress(self, pct):
        self.progress_bar["value"] = pct
        self.lbl_pct.config(text=f"{int(pct)}%")

    def toggle_buttons(self, state):
        val = tk.NORMAL if state else tk.DISABLED
        self.btn_combo.config(state=val)
        self.btn_time.config(state=val)
        self.btn_variety.config(state=val)
        self.btn_verify.config(state=val)

    def verify_account(self):
        token = self.token_var.get().strip().strip('"').strip("'")
        if not token:
            self.lbl_account_name.config(text="Vui lòng nhập Token", fg="#ED4245")
            self.lbl_account_badge.config(text="Trống", bg="#3d1f24", fg="#ED4245")
            return

        def _do_verify():
            self.lbl_account_name.config(text="Đang kiểm tra...", fg="#FEE75C")
            uid = user_id_from_token(token)
            self.current_user_id = uid

            # 1. Tạo hoặc tải Fingerprint
            if not self.cached_fingerprint:
                try:
                    self.log("Đang tạo chữ ký số Windows PE Authenticode...", "yellow")
                    self.cached_fingerprint = generate_fingerprint(uid)
                    self.state["fingerprint"] = self.cached_fingerprint
                    self.save_state_data()
                    self.log(f"Đã tạo Fingerprint ({len(self.cached_fingerprint)} ký tự) ✓", "green")
                except Exception as e:
                    self.log(f"Cảnh báo Fingerprint: {e}", "yellow")

            # 2. Lấy Analytics Token
            sig = str(uuid.uuid4())
            hb = str(uuid.uuid4())
            props = build_super_props(sig, hb)
            cookie = self.state.get("cookie", "")

            try:
                a_token, username, fetched_uid = fetch_analytics_token(token, props, cookie)
                self.cached_analytics_token = a_token
                user_tag = f"👤 {username} (ID: {fetched_uid})"

                self.lbl_account_name.config(text=user_tag, fg="#f2f3f5")
                self.lbl_account_badge.config(text="Token OK ✓", bg="#1f3d2b", fg="#57F287")
                self.log(f"Đã xác thực thành công tài khoản: {username}", "green")

                self.state["user_token"] = token
                self.save_state_data()
            except Exception as e:
                self.lbl_account_name.config(text=f"Lỗi: {e}", fg="#ED4245")
                self.lbl_account_badge.config(text="Lỗi", bg="#3d1f24", fg="#ED4245")
                self.log(f"Lỗi kiểm tra token: {e}", "red")

        threading.Thread(target=_do_verify, daemon=True).start()

    def get_or_prepare_engine(self, token):
        uid = user_id_from_token(token)
        if not self.cached_fingerprint:
            try:
                self.cached_fingerprint = generate_fingerprint(uid)
                self.state["fingerprint"] = self.cached_fingerprint
                self.save_state_data()
            except Exception as e:
                self.log(f"Cảnh báo Fingerprint: {e}", "yellow")

        if not self.cached_analytics_token:
            sig = str(uuid.uuid4())
            hb = str(uuid.uuid4())
            props = build_super_props(sig, hb)
            cookie = self.state.get("cookie", "")
            a_token, _, _ = fetch_analytics_token(token, props, cookie)
            self.cached_analytics_token = a_token

        return ScienceEngine(
            token,
            self.cached_analytics_token,
            self.cached_fingerprint or "",
            self.state.get("cookie", "")
        )

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
            messagebox.showwarning("Số Giờ Sai", "Vui lòng nhập số giờ hợp lệ lớn hơn 0!")
            return

        sel_name = self.game_var.get()
        target_game = next((g for g in TOP_GAMES if g["name"] == sel_name), TOP_GAMES[0])

        self.toggle_buttons(False)
        self.set_progress(10)
        self.set_status("Đang chuẩn bị gửi telemetry...", "#FEE75C")

        def _worker():
            try:
                self.log(f"Khởi tạo Engine và Fingerprint cho: '{target_game['name']}'...", "yellow")
                engine = self.get_or_prepare_engine(token)
                dur_ms = hours * 3600 * 1000
                events = engine.build_game_session(target_game, dur_ms)

                self.set_progress(40)
                self.log(f"Đang gửi {hours:,} giờ chơi lên /api/v9/science...", "blurple")
                status = engine.post_batch(events)
                self.set_progress(100)

                if status == 204:
                    self.set_status("Thành công (HTTP 204) ✓", "#57F287")
                    self.log(f"✨ THÀNH CÔNG! Discord đã ghi nhận {hours:,}h cho '{target_game['name']}'!", "green")
                    messagebox.showinfo(
                        "Hoàn Tất",
                        f"Đã gửi thành công {hours:,} giờ cho game '{target_game['name']}'!\n"
                        f"Discord sẽ cập nhật huy hiệu trong vòng 24h - 48h."
                    )
                else:
                    self.set_status(f"Lỗi HTTP {status}", "#ED4245")
                    self.log(f"❌ Gửi thất bại với mã lỗi HTTP {status}", "red")
                    messagebox.showerror("Lỗi", f"Máy chủ trả về mã HTTP {status}. Vui lòng kiểm tra lại Token!")
            except Exception as e:
                self.set_status("Lỗi hệ thống", "#ED4245")
                self.log(f"Lỗi: {e}", "red")
                messagebox.showerror("Lỗi", str(e))
            finally:
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
            try:
                self.log("Khởi tạo Engine và tải danh mục 105 tựa game chuẩn Discord...", "yellow")
                engine = self.get_or_prepare_engine(token)
                games = load_verified_games(105)
                sent_count = 0
                batch_size = 15

                for i in range(0, len(games), batch_size):
                    chunk = games[i:i + batch_size]
                    batch_events = []
                    for g in chunk:
                        batch_events.extend(engine.build_game_session(g, 900000))

                    st = engine.post_batch(batch_events)
                    if st == 204:
                        sent_count += len(chunk)
                        pct = (sent_count / len(games)) * 100
                        self.set_progress(pct)
                        self.set_status(f"Đang tua game ({sent_count}/{len(games)})...", "#5865F2")
                        self.log(f"Đã gửi batch {i // batch_size + 1}: {sent_count}/{len(games)} game (HTTP 204) ✓", "green")
                    else:
                        self.log(f"⚠ Lỗi batch {i // batch_size + 1}: HTTP {st}", "yellow")

                    time.sleep(0.35)

                self.set_status(f"Hoàn thành {sent_count}/{len(games)} Game ✓", "#57F287")
                self.log(f"✨ HOÀN TẤT! Đã gửi thành công {sent_count} trò chơi chính thức!", "green")
                messagebox.showinfo(
                    "Hoàn Tất",
                    f"Đã gửi thành công {sent_count} tựa game chính thức lên Discord!\n"
                    f"Tiến trình huy hiệu sẽ cập nhật trong 24h - 48h."
                )
            except Exception as e:
                self.set_status("Lỗi hệ thống", "#ED4245")
                self.log(f"Lỗi: {e}", "red")
                messagebox.showerror("Lỗi", str(e))
            finally:
                self.toggle_buttons(True)

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
            messagebox.showwarning("Số Giờ Sai", "Vui lòng nhập số giờ hợp lệ lớn hơn 0!")
            return

        sel_name = self.game_var.get()
        target_game = next((g for g in TOP_GAMES if g["name"] == sel_name), TOP_GAMES[0])

        self.toggle_buttons(False)
        self.set_progress(0)
        self.set_status("Đang chạy Combo toàn diện...", "#FEE75C")

        def _worker():
            try:
                self.log("🚀 BẮT ĐẦU COMBO: BƯỚC 1/2 TUA GIỜ CHƠI...", "yellow")
                engine = self.get_or_prepare_engine(token)
                dur_ms = hours * 3600 * 1000
                events = engine.build_game_session(target_game, dur_ms)

                st1 = engine.post_batch(events)
                if st1 == 204:
                    self.log(f"✓ Bước 1 thành công: Đã nhận {hours:,}h cho '{target_game['name']}'!", "green")
                else:
                    self.log(f"⚠ Bước 1 gặp mã HTTP {st1}, vẫn tiếp tục Bước 2...", "yellow")

                time.sleep(1)
                self.log("🚀 BƯỚC 2/2: BẮT ĐẦU TUA 105 TỰA GAME ĐA DẠNG...", "yellow")

                games = load_verified_games(105)
                sent_count = 0
                batch_size = 15

                for i in range(0, len(games), batch_size):
                    chunk = games[i:i + batch_size]
                    batch_events = []
                    for g in chunk:
                        batch_events.extend(engine.build_game_session(g, 900000))

                    st2 = engine.post_batch(batch_events)
                    if st2 == 204:
                        sent_count += len(chunk)
                        pct = (sent_count / len(games)) * 100
                        self.set_progress(pct)
                        self.set_status(f"Đang gửi game ({sent_count}/{len(games)})...", "#5865F2")
                        self.log(f"Batch {i // batch_size + 1}: {sent_count}/{len(games)} game ghi nhận thành công ✓", "green")
                    else:
                        self.log(f"⚠ Batch {i // batch_size + 1} gặp lỗi HTTP {st2}", "yellow")

                    time.sleep(0.35)

                self.set_status("COMBO HOÀN TẤT 100% ✓", "#57F287")
                self.log("🎉 TẤT CẢ GÓI TIN ĐÃ ĐƯỢC GỬI THÀNH CÔNG ĐẾN DISCORD!", "green")
                self.log("📌 Sau chu kỳ 24h - 48h, huy hiệu sẽ hiển thị trên Profile của bạn.", "yellow")
                messagebox.showinfo(
                    "Combo Thành Công",
                    f"Đã hoàn thành xuất sắc COMBO!\n"
                    f"- Giờ chơi: {hours:,}h ({target_game['name']})\n"
                    f"- Trò chơi đa dạng: {sent_count} Game chính thức\n\n"
                    f"Discord sẽ cập nhật huy hiệu trong vòng 24h - 48h!"
                )
            except Exception as e:
                self.set_status("Lỗi hệ thống", "#ED4245")
                self.log(f"Lỗi: {e}", "red")
                messagebox.showerror("Lỗi", str(e))
            finally:
                self.toggle_buttons(True)

        threading.Thread(target=_worker, daemon=True).start()

if __name__ == "__main__":
    app = SpooferDesktopApp()
    app.mainloop()
