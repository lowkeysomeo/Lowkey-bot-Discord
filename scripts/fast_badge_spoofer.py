# -*- coding: utf-8 -*-
"""
==============================================================================
LOWKEY FAST BADGE SPOOFER (PYTHON TELEMETRY EDITION)
==============================================================================
Tự động tăng tiến trình Huy hiệu Discord bằng cách gửi Telemetry hợp lệ
lên API Science nội bộ của Discord (/api/v9/science) với đầy đủ:
- Chữ ký thực thi Windows PE (executable_fingerprint) gắn liền với User ID
- Header x-super-properties và phiên hoạt động (client_heartbeat_session_id)
- Vòng đời sự kiện chuẩn: initial_heartbeat (0ms) -> launch_game -> final_heartbeat (duration_tracked_ms)

Hỗ trợ 2 Huy hiệu Profile Beta của Discord:
1. "Trò chơi đa dạng" (Game Variety / Sampler - Max 100 Game)
2. "Thời gian chơi" (Game Time / Dedicated - Max 5,000 Giờ)
==============================================================================
"""

from __future__ import annotations

import base64
import glob
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from typing import Sequence

# Đường dẫn dữ liệu
BASE_DIR = Path(__file__).resolve().parent
STATE_FILE = BASE_DIR / "science_state.json"
DETECTABLE_FILE = BASE_DIR / "detectable_games.json"

ME_URL = "https://discord.com/api/v9/users/@me?with_analytics_token=true"
SCIENCE_URL = "https://discord.com/api/v9/science"
PROPERTIES_URL = "https://cordapi.dolfi.es/api/v2/properties/windows"
GAMES_CDN_URL = "https://cdn.discordapp.com/detectables/games.json"

BATCH_GAMES_SIZE = 15     # 15 games x 3 events = 45 events/batch (tối đa 50 events/lần POST)
BATCH_DELAY = 0.35        # Khoảng nghỉ giữa các batch để tránh rate limit
AUTH_MAX_AGE = 12 * 3600  # 12 giờ làm mới analytics token một lần

CLIENT_VERSION = "1.0.9264"
CLIENT_BUILD_NUMBER = 595120
NATIVE_BUILD_NUMBER = 88414
OS_VERSION = "10.0.26200"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) discord/1.0.9264 Chrome/148.0.7778.280 "
    "Electron/42.7.1 Safari/537.36"
)

# Danh sách game dự phòng nếu không tải được catalog
FALLBACK_GAMES = [
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

# PowerShell script trích xuất Windows PE Authenticode metadata và XOR với UserId + MachineGuid
_FINGERPRINT_PS1 = r'''
param(
  [int]$ProcessId = 0,
  [string]$Path,
  [Parameter(Mandatory = $true)][string]$UserId
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CertPubKeyHash {
  const uint X509_ASN_ENCODING = 0x00000001;
  const uint PKCS_7_ASN_ENCODING = 0x00010000;
  const uint CALG_SHA_256 = 0x0000800C;

  [StructLayout(LayoutKind.Sequential)] struct Blob { public uint cbData; public IntPtr pbData; }
  [StructLayout(LayoutKind.Sequential)] struct AlgId { public IntPtr pszObjId; public Blob Parameters; }
  [StructLayout(LayoutKind.Sequential)] struct BitBlob { public uint cbData; public IntPtr pbData; public uint cUnusedBits; }
  [StructLayout(LayoutKind.Sequential)] struct PubKeyInfo { public AlgId Algorithm; public BitBlob PublicKey; }
  [StructLayout(LayoutKind.Sequential)] struct FileTime { public uint Low; public uint High; }
  [StructLayout(LayoutKind.Sequential)]
  struct CertInfo {
    public uint Version; public Blob SerialNumber; public AlgId SignatureAlgorithm; public Blob Issuer;
    public FileTime NotBefore; public FileTime NotAfter; public Blob Subject;
    public PubKeyInfo SubjectPublicKeyInfo; public BitBlob IssuerUniqueId; public BitBlob SubjectUniqueId;
    public uint ExtensionCount; public IntPtr Extensions;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct CertContext {
    public uint EncodingType; public IntPtr Encoded; public uint EncodedSize;
    public IntPtr CertInfo; public IntPtr Store;
  }

  [DllImport("crypt32.dll", SetLastError = true)]
  static extern bool CryptHashPublicKeyInfo(
    IntPtr provider, uint algid, uint flags, uint encoding, ref PubKeyInfo info, byte[] hash, ref uint hashSize);

  public static byte[] Hash(IntPtr certContext) {
    var ctx = Marshal.PtrToStructure<CertContext>(certContext);
    var info = Marshal.PtrToStructure<CertInfo>(ctx.CertInfo);
    var hash = new byte[32];
    uint hashSize = 32;
    if (!CryptHashPublicKeyInfo(IntPtr.Zero, CALG_SHA_256, 0, X509_ASN_ENCODING | PKCS_7_ASN_ENCODING, ref info.SubjectPublicKeyInfo, hash, ref hashSize) || hashSize != 32)
      throw new InvalidOperationException("CryptHashPublicKeyInfo failed");
    return hash;
  }
}
"@

if (!$Path) {
  if (!$ProcessId) { throw "Pass -Path <exe> or -ProcessId <pid>." }
  $Path = (Get-Process -Id $ProcessId).Path
}
if (!$Path) { throw "Could not resolve executable path." }

$fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
try {
  $fileSize = [UInt64]$fs.Length
  $readSize = [int][Math]::Min($fs.Length, 0x10000)
  $buf = [byte[]]::new($readSize)
  $read = $fs.Read($buf, 0, $readSize)
  if ($read -lt 0x40) { throw "File prefix is too small." }
  if ($read -ne $readSize) { [Array]::Resize([ref]$buf, $read) }
} finally {
  $fs.Dispose()
}

if ([BitConverter]::ToUInt16($buf, 0) -ne 0x5A4D) { throw "Not an MZ executable." }
$pe = [BitConverter]::ToInt32($buf, 0x3C)
if ($pe -lt 0 -or [BitConverter]::ToUInt32($buf, $pe) -ne 0x4550) { throw "Not a PE executable." }

$fh = $pe + 4
$sections = [BitConverter]::ToUInt16($buf, $fh + 2)
$timestamp = [BitConverter]::ToUInt32($buf, $fh + 4)
$optSize = [BitConverter]::ToUInt16($buf, $fh + 16)
$opt = $fh + 20
$isPe32Plus = [BitConverter]::ToUInt16($buf, $opt) -eq 0x20B
if (!$isPe32Plus) { throw "Discord only fingerprints PE32+." }
$sizeOfImage = [BitConverter]::ToUInt32($buf, $opt + 56)

$sectionTable = $opt + $optSize
$sha256 = [Security.Cryptography.SHA256]::Create()
$headerHash = $sha256.ComputeHash([byte[]]$buf[0..($sectionTable - 1)])
$sectionHash = $sha256.ComputeHash([byte[]]$buf[$sectionTable..($sectionTable + $sections * 40 - 1)])

$machineGuid = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid).MachineGuid
$machineUserHash = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($machineGuid + $UserId))

$sig = Get-AuthenticodeSignature -LiteralPath $Path
$signed = $sig.Status -eq "Valid" -and $sig.SignerCertificate
if ($signed) {
  $name = $sig.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  $certHash = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($name) + [CertPubKeyHash]::Hash($sig.SignerCertificate.Handle))
} else {
  $certHash = [byte[]]::new(32)
}

$flags = 0
if ($signed) { $flags += 1 }
if ($isPe32Plus) { $flags += 2 }

$out = [byte[]](@(1, [byte]$flags) +
  [BitConverter]::GetBytes($fileSize) +
  [BitConverter]::GetBytes($timestamp) +
  [BitConverter]::GetBytes($sizeOfImage) +
  $headerHash + $machineUserHash + $sectionHash + $certHash)

$key = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($UserId + "https://discord.com/careers"))
for ($i = 1; $i -lt $out.Length; $i++) {
  $out[$i] = $out[$i] -bxor $key[($i - 1) -band 31]
}

[Convert]::ToBase64String($out)
'''

def user_id_from_token(token: str) -> str:
    """Trích xuất User ID từ phần đầu của Discord User Token."""
    try:
        first = token.split(".", 1)[0]
        pad = "=" * (-len(first) % 4)
        decoded = base64.b64decode(first + pad).decode("utf-8")
        if decoded.isdigit():
            return decoded
    except Exception:
        pass
    return ""

def find_pe_executable() -> str:
    """Tự động tìm kiếm file thực thi PE32+ có chữ ký số trên hệ thống Windows."""
    # 1. Tìm Discord.exe trong %LOCALAPPDATA%
    local_app = os.environ.get("LOCALAPPDATA", "")
    if local_app:
        matches = glob.glob(os.path.join(local_app, "Discord", "app-*", "Discord.exe"))
        if matches and os.path.exists(matches[0]):
            return matches[0]

    # 2. Tìm explorer.exe trong %SystemRoot%
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    explorer = os.path.join(system_root, "explorer.exe")
    if os.path.exists(explorer):
        return explorer

    # 3. Fallback notepad.exe
    notepad = os.path.join(system_root, "notepad.exe")
    if os.path.exists(notepad):
        return notepad

    return ""

def generate_fingerprint(user_id: str, exe_path: str = "") -> str:
    """Tạo executable_fingerprint hợp lệ cho User ID trên máy hiện tại."""
    if os.name != "nt":
        raise RuntimeError("Fingerprint generation chỉ hỗ trợ trên hệ điều hành Windows.")

    target_exe = exe_path or find_pe_executable()
    if not target_exe or not os.path.exists(target_exe):
        raise RuntimeError(f"Không tìm thấy file thực thi hợp lệ: {target_exe}")

    temp_script = Path(tempfile.gettempdir()) / f"lowkey_fp_{uuid.uuid4().hex}.ps1"
    temp_script.write_text(_FINGERPRINT_PS1, encoding="utf-8")

    try:
        cmd = [
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", str(temp_script),
            "-UserId", user_id,
            "-Path", target_exe
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    finally:
        try:
            temp_script.unlink()
        except OSError:
            pass

    if result.returncode != 0:
        err_msg = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"PowerShell lỗi: {err_msg}")

    lines = [l.strip() for l in result.stdout.splitlines() if l.strip()]
    if not lines:
        raise RuntimeError("PowerShell không trả về dữ liệu fingerprint.")

    return lines[-1]

def local_properties() -> dict:
    return {
        "os": "Windows",
        "browser": "Discord Client",
        "release_channel": "stable",
        "client_version": CLIENT_VERSION,
        "os_version": OS_VERSION,
        "os_arch": "x64",
        "app_arch": "x64",
        "system_locale": "en-US",
        "has_client_mods": False,
        "browser_user_agent": USER_AGENT,
        "browser_version": "42.7.1",
        "os_sdk_version": "26200",
        "client_build_number": CLIENT_BUILD_NUMBER,
        "native_build_number": NATIVE_BUILD_NUMBER,
        "client_event_source": None,
        "client_app_state": "focused",
    }

def build_super_props(launch_signature: str, heartbeat_session: str) -> str:
    """Tạo chuỗi x-super-properties Base64 đồng bộ với phiên hiện tại."""
    try:
        req = urllib.request.Request(
            PROPERTIES_URL,
            method="POST",
            data=b"{}",
            headers={"content-type": "application/json", "user-agent": USER_AGENT}
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            props = json.loads(resp.read().decode("utf-8")).get("properties", {})
    except Exception:
        props = local_properties()

    props["client_launch_id"] = str(uuid.uuid4())
    props["launch_signature"] = launch_signature
    props["client_heartbeat_session_id"] = heartbeat_session
    raw = json.dumps(props, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")

def fetch_analytics_token(user_token: str, super_props: str, cookie: str = "") -> tuple[str, str, str]:
    """Lấy analytics_token và thông tin người dùng từ Discord API."""
    headers = {
        "Authorization": user_token,
        "User-Agent": USER_AGENT,
        "x-super-properties": super_props,
    }
    if cookie:
        headers["Cookie"] = cookie

    req = urllib.request.Request(ME_URL, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("analytics_token", ""), data.get("username", ""), str(data.get("id", ""))
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise RuntimeError("Token không hợp lệ (HTTP 401 Unauthorized).")
        elif exc.code == 403:
            raise RuntimeError("Bị Cloudflare chặn (HTTP 403 Forbidden). Cần cookie cf_clearance.")
        else:
            raise RuntimeError(f"Lỗi API: HTTP {exc.code}")
    except Exception as exc:
        raise RuntimeError(f"Không thể kết nối đến máy chủ Discord: {exc}")

class ScienceEngine:
    def __init__(self, user_token: str, analytics_token: str, fingerprint: str, cookie: str = "") -> None:
        self.user_token = user_token
        self.analytics_token = analytics_token
        self.fingerprint = fingerprint
        self.cookie = cookie
        self.heartbeat_session = str(uuid.uuid4())
        self.launch_signature = str(uuid.uuid4())
        self.super_props = build_super_props(self.launch_signature, self.heartbeat_session)
        self._seq = 0

    def next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def build_launch(self, game: dict) -> dict:
        now_ms = int(time.time() * 1000)
        props = {
            "client_track_timestamp": now_ms,
            "client_heartbeat_session_id": self.heartbeat_session,
            "event_sequence_number": self.next_seq(),
            "game": game["name"],
            "game_id": str(game["id"]),
            "verified": True,
            "elevated": False,
            "is_launcher": False,
            "game_platform": "desktop",
            "detection_method": "verified_game",
            "is_overlay_enabled": False,
            "is_overlay_game_enabled": True,
            "is_overlay_game_source": "OOP_DEFAULT_DATABASE",
            "fullscreen_type": "UNKNOWN",
            "hardware_display_count": 1,
            "overlay_method": "Disabled",
            "activity_status_enabled": True,
            "activity_status_shared_guilds": [],
            "current_user_status": "online",
            "game_detection_enabled": True,
            "executable_path": game["exe"],
            "voice_channel_id": None,
            "voice_channel_type": None,
            "voice_channel_bitrate": None,
            "voice_channel_guild_id": None,
            "hidden_by_distributor": False,
            "game_metadata": None,
            "executable_fingerprint": self.fingerprint,
            "client_performance_cpu": None,
            "client_performance_memory": None,
            "cpu_core_count": None,
            "accessibility_features": 0,
            "rendered_locale": "en-US",
            "launch_signature": self.launch_signature,
            "client_rtc_state": None,
            "client_app_state": "focused",
            "client_send_timestamp": now_ms,
        }
        if not self.fingerprint:
            del props["executable_fingerprint"]
        return {"type": "launch_game", "properties": props}

    def build_heartbeat(self, game: dict, duration_ms: int, session_id: str,
                        initial: bool, final: bool, ts: int | None = None) -> dict:
        now_ms = int(time.time() * 1000) if ts is None else ts
        return {
            "type": "running_game_heartbeat",
            "properties": {
                "client_track_timestamp": now_ms,
                "client_heartbeat_session_id": self.heartbeat_session,
                "event_sequence_number": self.next_seq(),
                "game_id": str(game["id"]),
                "game_name": game["name"],
                "game_metadata": None,
                "game_executable": game["exe"],
                "game_detection_enabled": True,
                "initial_heartbeat": initial,
                "final_heartbeat": final,
                "game_session_id": session_id,
                "duration_tracked_ms": duration_ms,
                "rtc_connection_id": None,
                "media_session_id": None,
                "launch_signature": self.launch_signature,
                "client_app_state": "focused",
                "client_send_timestamp": now_ms,
            }
        }

    def build_game_session(self, game: dict, duration_ms: int) -> list[dict]:
        """Tạo chuỗi 3 sự kiện hợp lệ cho 1 phiên chơi: Heartbeat ban đầu -> Khởi chạy -> Heartbeat kết thúc."""
        sid = str(uuid.uuid4())
        now = int(time.time() * 1000)
        start = now - duration_ms
        if start < 0:
            start = now

        return [
            self.build_heartbeat(game, 0, sid, initial=True, final=False, ts=start),
            self.build_launch(game),
            self.build_heartbeat(game, duration_ms, sid, initial=False, final=True, ts=now),
        ]

    def post_batch(self, events: Sequence[dict]) -> int:
        payload = {"token": self.analytics_token, "events": list(events)}
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "authorization": self.user_token,
            "content-type": "application/json",
            "origin": "https://discord.com",
            "referer": "https://discord.com/channels/@me",
            "user-agent": USER_AGENT,
            "x-debug-options": "bugReporterEnabled",
            "x-discord-locale": "en-US",
            "x-discord-timezone": "Asia/Ho_Chi_Minh",
            "x-super-properties": self.super_props,
        }
        if self.cookie:
            headers["cookie"] = self.cookie

        req = urllib.request.Request(SCIENCE_URL, data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.status
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                retry_after = 2.0
                try:
                    retry_header = exc.headers.get("Retry-After")
                    if retry_header:
                        retry_after = float(retry_header) + 0.5
                except Exception:
                    pass
                time.sleep(retry_after)
                return self.post_batch(events)
            return exc.code
        except Exception:
            return 0

def load_verified_games(target_count: int = 105) -> list[dict]:
    # 1. Đọc từ file detectable_games.json cục bộ
    if DETECTABLE_FILE.exists():
        try:
            with open(DETECTABLE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if len(data) >= target_count:
                    return data[:target_count]
                elif len(data) > 0:
                    return data
        except Exception:
            pass

    # 2. Thử tải trực tiếp từ CDN nếu file cục bộ chưa có
    try:
        req = urllib.request.Request(GAMES_CDN_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            clean = []
            seen = set()
            for g in data:
                gid = str(g.get("id", ""))
                name = g.get("name", "").strip()
                if not gid or not name or gid in seen:
                    continue
                for e in g.get("executables", []):
                    if e.get("os") == "win32" and e.get("name"):
                        clean.append({"id": gid, "name": name, "exe": e["name"]})
                        seen.add(gid)
                        break
                if len(clean) >= target_count:
                    return clean
            if clean:
                return clean
    except Exception:
        pass

    return FALLBACK_GAMES

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_state(state: dict) -> None:
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

def print_banner():
    print("\n" + "=" * 70)
    print("  ⚡ LOWKEY DISCORD SCIENCE BADGE SPOOFER (PRO EDITION 2026) ⚡")
    print("  Hỗ trợ tăng tiến trình 2 Huy hiệu: 'Trò chơi đa dạng' & 'Thời gian chơi'")
    print("=" * 70)

def main():
    print_banner()

    state = load_state()
    user_token = state.get("user_token", "").strip()

    if not user_token:
        print("\n[?] Bạn chưa cấu hình Token tài khoản.")
        user_token = input("Nhập Discord User Token của bạn: ").strip().strip('"').strip("'")
        if not user_token:
            print("[-] Không có token. Kết thúc chương trình.")
            return
        state["user_token"] = user_token
        save_state(state)

    user_id = user_id_from_token(user_token)
    if not user_id:
        print("[!] Không thể đọc User ID từ Token. Vui lòng kiểm tra lại tính hợp lệ của token.")
        user_id = input("[?] Nhập thủ công User ID của bạn: ").strip()

    print(f"\n[*] User ID xác định: {user_id}")

    # 1. Tạo hoặc tải Fingerprint
    fingerprint = state.get("fingerprint", "")
    if not fingerprint or len(fingerprint) < 100:
        print("[*] Đang tự động tạo Windows PE Authenticode Fingerprint...")
        try:
            fingerprint = generate_fingerprint(user_id)
            state["fingerprint"] = fingerprint
            save_state(state)
            print(f"[+] Đã tạo chữ ký số Windows PE thành công ({len(fingerprint)} ký tự) ✓")
        except Exception as exc:
            print(f"[!] Cảnh báo tạo Fingerprint: {exc}")
            print("[*] Vẫn tiếp tục với cấu hình hiện tại.")
    else:
        print(f"[+] Chữ ký số Windows PE: Đã sẵn sàng ({len(fingerprint)} ký tự) ✓")

    # 2. Lấy Analytics Token
    cookie = state.get("cookie", "")
    temp_sig = str(uuid.uuid4())
    temp_hb = str(uuid.uuid4())
    temp_props = build_super_props(temp_sig, temp_hb)

    print("[*] Đang xác thực với máy chủ Discord và lấy Analytics Token...")
    try:
        analytics_token, username, fetched_uid = fetch_analytics_token(user_token, temp_props, cookie)
        print(f"[+] Xác thực thành công: {username} (ID: {fetched_uid}) ✓")
        state["analytics_token"] = analytics_token
        state["username"] = username
        save_state(state)
    except Exception as exc:
        print(f"[!] Lỗi xác thực: {exc}")
        if "Cloudflare" in str(exc) or "403" in str(exc):
            cf = input("[?] Nhập cookie cf_clearance nếu có (Enter để bỏ qua): ").strip()
            if cf:
                state["cookie"] = cf
                save_state(state)
                cookie = cf
                try:
                    analytics_token, username, fetched_uid = fetch_analytics_token(user_token, temp_props, cookie)
                    print(f"[+] Xác thực thành công: {username} ✓")
                except Exception as e2:
                    print(f"[-] Vẫn không thể kết nối: {e2}")
                    return
            else:
                return
        else:
            return

    engine = ScienceEngine(user_token, analytics_token, fingerprint, cookie)

    while True:
        print("\n" + "-" * 55)
        print(" CHỌN CHỨC NĂNG CÀY TIẾN TRÌNH:")
        print(" [1] [COMBO TOÀN DIỆN] 100 Trò chơi + Cày Giờ (Khuyên dùng nhất!)")
        print(" [2] Cày Max 100 Trò chơi Huy hiệu 'Trò chơi đa dạng' (100 Games)")
        print(" [3] Cày Giờ Huy hiệu 'Thời gian chơi' (Chọn 30h, 150h, 500h, 5000h)")
        print(" [4] Tự động tạo lại Chữ ký PE Fingerprint mới")
        print(" [5] Đổi User Token")
        print(" [0] Thoát")
        print("-" * 55)

        choice = input("[?] Lựa chọn của bạn (0-5): ").strip()

        if choice == "1":
            print("\n[*] Bạn đã chọn COMBO TOÀN DIỆN (100 Trò chơi + Giờ chơi).")
            print("    Huy hiệu 'Trò chơi đa dạng': Cày 105 tựa game chính thức.")
            print("    Huy hiệu 'Thời gian chơi': Cày giờ tích lũy cho game chính.")
            hrs_str = input("[?] Nhập số giờ muốn cày cho game chính (Mặc định 30 giờ, hoặc 5000): ").strip()
            hrs = int(hrs_str) if hrs_str.isdigit() and int(hrs_str) > 0 else 30

            games = load_verified_games(105)
            print(f"\n[*] Bước 1/2: Đang gửi {hrs:,} giờ chơi cho '{games[0]['name']}'...")
            dur_ms = hrs * 3600 * 1000
            events_hours = engine.build_game_session(games[0], dur_ms)
            status1 = engine.post_batch(events_hours)
            if status1 == 204:
                print(f"[+] Gửi thành công {hrs:,} giờ cho game '{games[0]['name']}' (HTTP 204) ✓")
            else:
                print(f"[!] Gửi giờ trả về mã: HTTP {status1}")

            time.sleep(1)

            print(f"\n[*] Bước 2/2: Đang gửi danh sách {len(games)} trò chơi đa dạng...")
            sent_games = 0
            # Chia thành từng batch 15 game (45 events)
            for i in range(0, len(games), BATCH_GAMES_SIZE):
                chunk = games[i:i + BATCH_GAMES_SIZE]
                batch_events = []
                for g in chunk:
                    # Mỗi game kèm 15 phút (900.000 ms) thời lượng thực tế
                    batch_events.extend(engine.build_game_session(g, 900000))
                
                res = engine.post_batch(batch_events)
                if res == 204:
                    sent_games += len(chunk)
                    pct = int((sent_games / len(games)) * 100)
                    print(f"  [>] Tiến độ: {sent_games}/{len(games)} game ({pct}%) - Đã hoàn tất batch HTTP 204 ✓")
                else:
                    print(f"  [!] Batch {i//BATCH_GAMES_SIZE + 1} gặp lỗi HTTP {res}")
                
                time.sleep(BATCH_DELAY)

            print(f"\n🎉 HOÀN THÀNH COMBO! Đã gửi thành công {sent_games}/{len(games)} tựa game và {hrs} giờ!")
            print("📌 LƯU Ý QUAN TRỌNG: Discord tổng hợp telemetry theo chu kỳ định kỳ.")
            print("   Huy hiệu sẽ cập nhật tiến trình trên Profile của bạn trong vòng 24h - 48h.")

        elif choice == "2":
            games = load_verified_games(105)
            print(f"\n[*] Đang gửi danh mục {len(games)} trò chơi độc nhất...")
            sent_games = 0
            for i in range(0, len(games), BATCH_GAMES_SIZE):
                chunk = games[i:i + BATCH_GAMES_SIZE]
                batch_events = []
                for g in chunk:
                    batch_events.extend(engine.build_game_session(g, 900000))
                
                res = engine.post_batch(batch_events)
                if res == 204:
                    sent_games += len(chunk)
                    pct = int((sent_games / len(games)) * 100)
                    print(f"  [>] Đã ghi nhận: {sent_games}/{len(games)} game ({pct}%) ✓")
                else:
                    print(f"  [!] Lỗi HTTP {res}")
                time.sleep(BATCH_DELAY)

            print(f"\n🎉 HOÀN THÀNH! Đã ghi nhận {sent_games} tựa game chính thức lên Discord.")
            print("📌 Tiến trình huy hiệu 'Trò chơi đa dạng' sẽ tăng lên trong 24h - 48h.")

        elif choice == "3":
            games = load_verified_games(10)
            print("\nDanh sách game chính để chọn tích lũy giờ:")
            for idx, g in enumerate(games[:8], 1):
                print(f"  {idx}. {g['name']}")
            g_idx_str = input(f"[?] Chọn game (1-{min(8, len(games))}): ").strip()
            g_idx = int(g_idx_str) - 1 if g_idx_str.isdigit() and 1 <= int(g_idx_str) <= len(games) else 0
            sel_game = games[g_idx]

            hrs_str = input(f"[?] Nhập số giờ muốn cày cho '{sel_game['name']}' (Ví dụ 30, 150, 500, 5000): ").strip()
            hrs = int(hrs_str) if hrs_str.isdigit() and int(hrs_str) > 0 else 30

            print(f"\n[*] Đang gửi telemetry {hrs:,} giờ cho game '{sel_game['name']}'...")
            events = engine.build_game_session(sel_game, hrs * 3600 * 1000)
            res = engine.post_batch(events)
            if res == 204:
                print(f"\n🎉 THÀNH CÔNG! Discord đã xác nhận phiên {hrs:,} giờ qua HTTP 204!")
                print(f"📌 Thời gian chơi '{sel_game['name']}' đã được ghi nhận vào cơ sở dữ liệu Discord.")
            else:
                print(f"\n[!] Thất bại: HTTP {res}")

        elif choice == "4":
            print("\n[*] Đang tạo lại Fingerprint...")
            try:
                new_fp = generate_fingerprint(user_id)
                state["fingerprint"] = new_fp
                save_state(state)
                engine.fingerprint = new_fp
                print(f"[+] Đã tạo mới và lưu Fingerprint thành công ({len(new_fp)} ký tự) ✓")
            except Exception as e:
                print(f"[-] Lỗi: {e}")

        elif choice == "5":
            new_tok = input("\n[?] Nhập Discord User Token mới: ").strip().strip('"').strip("'")
            if new_tok:
                state["user_token"] = new_tok
                save_state(state)
                print("[+] Đã lưu token mới. Vui lòng khởi động lại tool để áp dụng.")
                break

        elif choice == "0":
            print("\n[*] Cảm ơn bạn đã sử dụng Lowkey Spoofer! Tạm biệt.")
            break

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n[-] Đã dừng chương trình.")
