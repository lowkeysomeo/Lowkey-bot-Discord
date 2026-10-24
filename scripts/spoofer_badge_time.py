# -*- coding: utf-8 -*-
"""
==============================================================================
DISCORD BADGE SPOOFER - HUY HIỆU 2: THỜI GIAN CHƠI (GAME TIME / PLAYTIME)
==============================================================================
Chuyên cày riêng Huy hiệu "Thời gian chơi" (Tùy chọn mốc: 150h, 500h, 5.000h Max).
- Đọc danh sách Token từ file tokens.txt (chạy đa luồng song song).
- Gửi thời lượng chuẩn duration_tracked_ms cho game PC chính thức (Counter-Strike 2).
- Tự động tạo chữ ký Windows PE (executable_fingerprint) gắn liền với User ID.
- Gửi trực tiếp lên endpoint nội bộ /api/v9/science của Discord.
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
import threading
import time
import uuid
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Sequence

ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / "science_state.json"
TOKENS_FILE = ROOT / "tokens.txt"
FINGERPRINTS_FILE = ROOT / "fingerprints.txt"

# Cấu hình cày giờ
DEFAULT_HOURS = 5000       # Mặc định cày 5.000 giờ (Cấp tối đa Vĩnh Cửu của Discord)
AUTH_MAX_AGE = 12 * 3600
MAX_WORKERS = 0            # 0 = chạy song song tất cả tài khoản
DEBUG = False

# Game chính thức nhận diện 100% trên Discord
TARGET_GAME = {
    "id": "1158877933042143272",
    "name": "Counter-Strike 2",
    "exe": "cs2.exe"
}

ME_URL = "https://discord.com/api/v9/users/@me?with_analytics_token=true"
SCIENCE_URL = "https://discord.com/api/v9/science"
PROPERTIES_URL = "https://cordapi.dolfi.es/api/v2/properties/windows"

CLIENT_VERSION = "1.0.9264"
CLIENT_BUILD_NUMBER = 595120
NATIVE_BUILD_NUMBER = 88414
OS_VERSION = "10.0.26200"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) discord/1.0.9264 Chrome/148.0.7778.280 "
    "Electron/42.7.1 Safari/537.36"
)

# PowerShell script trích xuất Windows PE Authenticode metadata
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


def _user_id_from_token(token: str) -> str:
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
    local_app = os.environ.get("LOCALAPPDATA", "")
    if local_app:
        matches = glob.glob(os.path.join(local_app, "Discord", "app-*", "Discord.exe"))
        if matches and os.path.exists(matches[0]):
            return matches[0]

    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    explorer = os.path.join(system_root, "explorer.exe")
    if os.path.exists(explorer):
        return explorer

    notepad = os.path.join(system_root, "notepad.exe")
    if os.path.exists(notepad):
        return notepad

    return ""


def generate_fingerprint(user_id: str, exe_path: str = "") -> str:
    if os.name != "nt":
        return ""
    target_exe = exe_path or find_pe_executable()
    if not target_exe or not os.path.exists(target_exe):
        return ""

    temp_script = Path(tempfile.gettempdir()) / f"lowkey_fp_{uuid.uuid4().hex}.ps1"
    temp_script.write_text(_FINGERPRINT_PS1, encoding="utf-8")
    try:
        cmd = [
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", str(temp_script),
            "-UserId", user_id,
            "-Path", target_exe
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    finally:
        try:
            temp_script.unlink()
        except OSError:
            pass

    if res.returncode == 0:
        lines = [l.strip() for l in res.stdout.splitlines() if l.strip()]
        if lines:
            return lines[-1]
    return ""


class Console:
    RED = "\x1b[91m"
    ORANGE = "\x1b[38;5;208m"
    GREEN = "\x1b[92m"
    YELLOW = "\x1b[93m"
    WHITE = "\x1b[97m"
    GREY = "\x1b[90m"
    RESET = "\x1b[0m"
    RULE = "─" * 65

    def __init__(self) -> None:
        self._lock = threading.Lock()
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
        if sys.platform == "win32":
            try:
                import ctypes
                k = ctypes.windll.kernel32
                h = k.GetStdHandle(-11)
                m = ctypes.c_uint32()
                if k.GetConsoleMode(h, ctypes.byref(m)):
                    k.SetConsoleMode(h, m.value | 0x0004)
            except Exception:
                pass

    def _stamp(self) -> str:
        return f"{self.GREY}{time.strftime('%H:%M:%S')}{self.RESET}"

    def _line(self, glyph: str, target: str, detail: str, color: str) -> None:
        line = (f"  {self._stamp()} {glyph} {self.WHITE}{target}{self.RESET} "
                f"{self.GREY}·{self.RESET} {color}{detail}{self.RESET}")
        with self._lock:
            print(line, flush=True)

    def ok(self, target: str, detail: str) -> None:
        self._line(f"{self.GREEN}✓{self.RESET}", target, detail, self.GREEN)

    def sent(self, target: str, detail: str) -> None:
        self._line(f"{self.GREY}·{self.RESET} {self.GREEN}tiến trình{self.RESET}", target, detail, self.GREEN)

    def info(self, detail: str) -> None:
        line = f"  {self._stamp()} {self.GREY}·{self.RESET} {self.WHITE}{detail}{self.RESET}"
        with self._lock:
            print(line, flush=True)

    def rule(self) -> None:
        with self._lock:
            print(f"  {self.GREY}{self.RULE}{self.RESET}", flush=True)

    def banner(self, hours: int) -> None:
        with self._lock:
            print()
            print(f"  {self.ORANGE}LOWKEY DISCORD SPOOFER{self.RESET} {self.GREY}·{self.RESET} "
                  f"{self.YELLOW}HUY HIỆU: THỜI GIAN CHƠI ({hours:,} GIỜ){self.RESET}")
            print(f"    {self.GREY}Cày độc lập số giờ chơi cho game '{TARGET_GAME['name']}'{self.RESET}")
            print(flush=True)


@dataclass
class Account:
    token: str = ""
    fingerprint: str = ""
    analytics_token: str = ""
    fetched_at: int = 0
    total_hours_claimed: float = 0.0

    @property
    def is_stale(self) -> bool:
        return not self.analytics_token or (time.time() - self.fetched_at) > AUTH_MAX_AGE

    @property
    def has_token(self) -> bool:
        return bool(self.token.strip())

    @property
    def uid(self) -> str:
        return _user_id_from_token(self.token)

    @property
    def label(self) -> str:
        return self.uid or (self.token[:12] + "…" if self.token else "empty")


class State:
    def __init__(self) -> None:
        self.accounts: list[Account] = []
        self._lock = threading.Lock()

    @classmethod
    def load(cls) -> "State":
        s = cls()
        if not STATE_FILE.exists():
            return s
        try:
            data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, ValueError):
            return s
        if "accounts" in data and isinstance(data["accounts"], list):
            for entry in data["accounts"]:
                try:
                    entry.pop("cookie", None)
                    entry.pop("used_games", None)
                    entry.pop("total_games_claimed", None)
                    s.accounts.append(Account(**entry))
                except TypeError:
                    continue
            return s
        legacy_token = data.get("user_token") or data.get("token", "")
        if legacy_token:
            s.accounts.append(Account(
                token=legacy_token,
                fingerprint=data.get("fingerprint", ""),
                analytics_token=data.get("analytics_token", ""),
                fetched_at=data.get("fetched_at", 0),
                total_hours_claimed=data.get("total_hours_claimed", 0.0),
            ))
        return s

    def save(self) -> None:
        with self._lock:
            snapshot = [asdict(a) for a in self.accounts]
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"accounts": snapshot}, indent=2), encoding="utf-8")
        tmp.replace(STATE_FILE)

    def find_or_create(self, token: str) -> Account:
        with self._lock:
            for acct in self.accounts:
                if acct.token == token:
                    return acct
            acct = Account(token=token)
            self.accounts.append(acct)
            return acct


def _local_props() -> dict:
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
    try:
        req = urllib.request.Request(
            PROPERTIES_URL, method="POST", data=b"{}",
            headers={"content-type": "application/json", "user-agent": USER_AGENT},
        )
        with urllib.request.urlopen(req, timeout=6) as response:
            props = json.loads(response.read().decode("utf-8")).get("properties", {})
    except Exception:
        props = _local_props()
    props["client_launch_id"] = str(uuid.uuid4())
    props["launch_signature"] = launch_signature
    props["client_heartbeat_session_id"] = heartbeat_session
    raw = json.dumps(props, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def _read_analytics_token(auth_token: str, super_props: str) -> str:
    req = urllib.request.Request(ME_URL, headers={
        "authorization": auth_token,
        "user-agent": USER_AGENT,
        "x-super-properties": super_props,
    })
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Token bị từ chối (HTTP {exc.code})") from exc
    token = data.get("analytics_token")
    if not token:
        raise RuntimeError("Không có analytics_token trả về từ máy chủ Discord")
    return token


def ensure_token(account: Account, super_props: str) -> None:
    if not account.is_stale:
        return
    account.analytics_token = _read_analytics_token(account.token, super_props)
    account.fetched_at = int(time.time())


@dataclass(frozen=True)
class Session:
    heartbeat_session: str
    launch_signature: str
    super_props: str

    @classmethod
    def new(cls) -> "Session":
        hb = str(uuid.uuid4())
        sig = str(uuid.uuid4())
        return cls(hb, sig, build_super_props(sig, hb))


class ScienceClient:
    def __init__(self, account: Account, session: Session) -> None:
        self.account = account
        self.session = session
        self._seq = 0

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def build_launch(self, game: dict) -> dict:
        now = int(time.time() * 1000)
        props = {
            "client_track_timestamp": now,
            "client_heartbeat_session_id": self.session.heartbeat_session,
            "event_sequence_number": self._next_seq(),
            "game": game["name"],
            "game_id": game["id"],
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
            "executable_fingerprint": self.account.fingerprint,
            "client_performance_cpu": None,
            "client_performance_memory": None,
            "cpu_core_count": None,
            "accessibility_features": 0,
            "rendered_locale": "en-US",
            "launch_signature": self.session.launch_signature,
            "client_rtc_state": None,
            "client_app_state": "focused",
            "client_send_timestamp": now,
        }
        if not self.account.fingerprint:
            del props["executable_fingerprint"]
        return {"type": "launch_game", "properties": props}

    def build_heartbeat(self, game: dict, duration_ms: int, session_id: str,
                        initial: bool, final: bool, ts: int | None = None) -> dict:
        now_ms = int(time.time() * 1000) if ts is None else ts
        return {
            "type": "running_game_heartbeat",
            "properties": {
                "client_track_timestamp": now_ms,
                "client_heartbeat_session_id": self.session.heartbeat_session,
                "event_sequence_number": self._next_seq(),
                "game_id": game["id"],
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
                "launch_signature": self.session.launch_signature,
                "client_app_state": "focused",
                "client_send_timestamp": now_ms,
            },
        }

    def build_session(self, game: dict, duration_ms: int) -> list[dict]:
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

    def post(self, events: Sequence[dict]) -> int:
        payload = {"token": self.account.analytics_token, "events": list(events)}
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "authorization": self.account.token,
            "content-type": "application/json",
            "origin": "https://discord.com",
            "referer": "https://discord.com/channels/@me",
            "user-agent": USER_AGENT,
            "x-debug-options": "bugReporterEnabled",
            "x-discord-locale": "en-US",
            "x-discord-timezone": "Asia/Ho_Chi_Minh",
            "x-super-properties": self.session.super_props,
        }
        req = urllib.request.Request(SCIENCE_URL, data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                return response.status
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
                return self.post(events)
            return exc.code
        except Exception:
            return 0


def load_tokens() -> list[str]:
    if not TOKENS_FILE.exists():
        return []
    tokens: list[str] = []
    for line in TOKENS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        tokens.append(line)
    return tokens


def load_fingerprints() -> list[str]:
    if not FINGERPRINTS_FILE.exists():
        return []
    return [
        line.strip()
        for line in FINGERPRINTS_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]


def worker(
    idx: int,
    total_acc: int,
    token: str,
    fingerprint: str,
    target_hours: int,
    state: State,
    console: Console,
    results: dict,
) -> None:
    acct = state.find_or_create(token)
    if fingerprint:
        acct.fingerprint = fingerprint
    elif not acct.fingerprint:
        try:
            acct.fingerprint = generate_fingerprint(acct.uid)
        except Exception:
            pass

    tag = f"[{idx+1}/{total_acc}] {acct.label}"

    session = Session.new()
    try:
        ensure_token(acct, session.super_props)
    except Exception as exc:
        console._line("✗", tag, f"Lỗi xác thực: {exc}", Console.RED)
        results[tag] = ("fail", 0)
        return

    client = ScienceClient(acct, session)
    duration_ms = target_hours * 3600 * 1000
    events = client.build_session(TARGET_GAME, duration_ms)

    status = client.post(events)
    if status == 204:
        acct.total_hours_claimed += target_hours
        state.save()
        console.ok(tag, f"Thành công {target_hours:,} giờ ({TARGET_GAME['name']}) · HTTP 204 ✓")
        results[tag] = ("ok", target_hours)
    else:
        console._line("✗", tag, f"Thất bại (HTTP {status})", Console.RED)
        results[tag] = ("fail", 0)


def main() -> None:
    C = Console()

    # Hỏi số giờ cần cày
    print("\n" + "=" * 65)
    print("  CHỌN SỐ GIỜ CẦY CHO HUY HIỆU 'THỜI GIAN CHƠI':")
    print("  - Gợi ý: 150 (Cấp 5 - Nghiêm túc) | 500 (Cấp 6) | 5000 (Cấp 9 - Vĩnh Cửu)")
    print("=" * 65)
    hrs_input = input(f"  [?] Nhập số giờ muốn cày (Mặc định nhấn Enter = {DEFAULT_HOURS:,}h): ").strip()
    target_hours = int(hrs_input) if hrs_input.isdigit() and int(hrs_input) > 0 else DEFAULT_HOURS

    C.banner(target_hours)
    time.sleep(0.3)

    # Nạp tokens
    if not TOKENS_FILE.exists() or len(load_tokens()) == 0:
        saved_tok = ""
        if STATE_FILE.exists():
            try:
                s_data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
                saved_tok = s_data.get("user_token", "")
            except Exception:
                pass

        if not saved_tok:
            user_input = input("  [?] Nhập Discord User Token của bạn: ").strip().strip('"').strip("'")
            if user_input:
                saved_tok = user_input

        if saved_tok:
            TOKENS_FILE.write_text(f"# Dán mỗi dòng 1 Discord User Token\n{saved_tok}\n", encoding="utf-8")
        else:
            TOKENS_FILE.write_text("# Dán mỗi dòng 1 Discord User Token\n", encoding="utf-8")
            C.info(f"Vui lòng dán token vào file {TOKENS_FILE.name} rồi chạy lại!")
            return

    tokens = load_tokens()
    if not tokens:
        C.info(f"File {TOKENS_FILE.name} đang trống.")
        return

    fingerprints = load_fingerprints()
    state = State.load()

    workers = MAX_WORKERS if MAX_WORKERS > 0 else len(tokens)
    workers = min(workers, len(tokens))

    print()
    C.info(f"Tài khoản: {len(tokens)} · Game: {TARGET_GAME['name']} · Mục tiêu: {target_hours:,} giờ · Luồng: {workers}")
    C.rule()

    results: dict[str, tuple[str, int]] = {}
    threads: list[threading.Thread] = []
    semaphore = threading.Semaphore(workers)

    def bounded(idx: int, token: str, fp: str) -> None:
        with semaphore:
            worker(idx, len(tokens), token, fp, target_hours, state, C, results)

    start_ts = time.time()
    for i, token in enumerate(tokens):
        fp = fingerprints[i] if i < len(fingerprints) else ""
        t = threading.Thread(target=bounded, args=(i, token, fp), daemon=False)
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    elapsed = time.time() - start_ts
    ok_count = sum(1 for status, _ in results.values() if status == "ok")

    print()
    C.rule()
    if ok_count > 0:
        C.ok("HOÀN TẤT",
             f"Đã ghi nhận thành công {target_hours:,} giờ cho {ok_count}/{len(tokens)} tài khoản · {elapsed:.1f}s")
        C.info("📌 Tiến trình Huy hiệu 'Thời gian chơi' sẽ cập nhật sau 24h - 48h.")
    else:
        C.info("Thất bại. Vui lòng kiểm tra lại Token.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        Console().info("Đã dừng chương trình.")
