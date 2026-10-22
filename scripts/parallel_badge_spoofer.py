from __future__ import annotations

import base64
import json
import sys
import threading
import time
import uuid
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterator, Sequence

ROOT = Path(__file__).resolve().parent
GAMES_FILE = ROOT.parent / "data" / "games.json"
STATE_FILE = ROOT / "science_state.json"
TOKENS_FILE = ROOT / "tokens.txt"
FINGERPRINTS_FILE = ROOT / "fingerprints.txt"

# Đã điều chỉnh theo yêu cầu:
GAMES_PER_TOKEN = 105       # 105 tựa game (đủ max 100 game huy hiệu Trò chơi đa dạng)
HOURS_PER_GAME = 1.0        # 1.0 giờ mỗi game
BATCH_SIZE = 15             # 15 game / batch (= 45 sự kiện, nằm trong ngưỡng an toàn < 50)
BATCH_DELAY = 0.3           # 0.3s nghỉ giữa các batch
REPORT_EVERY = 5            # Báo cáo tiến độ sau mỗi 5 batch
AUTH_MAX_AGE = 12 * 3600
MAX_WORKERS = 0
DEBUG = False

ME_URL = "https://discord.com/api/v9/users/@me?with_analytics_token=true"
SCIENCE_URL = "https://discord.com/api/v9/science"
PROPERTIES_URL = "https://cordapi.dolfi.es/api/v2/properties/windows"
GAMES_CDN_URL = "https://cdn.discordapp.com/detectables/games.json"

CLIENT_VERSION = "1.0.9253"
CLIENT_BUILD_NUMBER = 594031
NATIVE_BUILD_NUMBER = 88414
OS_VERSION = "10.0.26200"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) discord/1.0.9253 Chrome/148.0.7778.280 "
    "Electron/42.7.1 Safari/537.36"
)


def _user_id_from_token(token: str) -> str:
    try:
        first = token.split(".", 1)[0]
        pad = "=" * (-len(first) % 4)
        return base64.b64decode(first + pad).decode("utf-8")
    except Exception:
        return ""


class Console:
    RED = "\x1b[91m"
    ORANGE = "\x1b[38;5;208m"
    GREEN = "\x1b[92m"
    YELLOW = "\x1b[93m"
    WHITE = "\x1b[97m"
    GREY = "\x1b[90m"
    RESET = "\x1b[0m"
    RULE = "─" * 60

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
        self._line(f"{self.GREY}·{self.RESET} {self.GREEN}farmed{self.RESET}", target, detail, self.GREEN)

    def info(self, detail: str) -> None:
        line = f"  {self._stamp()} {self.GREY}·{self.RESET} {self.WHITE}{detail}{self.RESET}"
        with self._lock:
            print(line, flush=True)

    def rule(self) -> None:
        with self._lock:
            print(f"  {self.GREY}{self.RULE}{self.RESET}", flush=True)

    def banner(self) -> None:
        with self._lock:
            print()
            print(f"  {self.ORANGE}spoofer{self.RESET} {self.GREY}·{self.RESET} "
                  f"{self.WHITE}discord badges (parallel){self.RESET}")
            print(f"    {self.GREY}by revere group (optimized 105 games / 15 batch){self.RESET}")
            print(flush=True)


@dataclass
class Account:
    token: str = ""
    fingerprint: str = ""
    analytics_token: str = ""
    fetched_at: int = 0
    used_games: list[str] = None
    total_games_claimed: int = 0
    total_hours_claimed: float = 0.0

    def __post_init__(self) -> None:
        if self.used_games is None:
            self.used_games = []

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
                    s.accounts.append(Account(**entry))
                except TypeError:
                    continue
            return s
        legacy = Account(
            token=data.get("user_token") or data.get("token", ""),
            fingerprint=data.get("fingerprint", ""),
            analytics_token=data.get("analytics_token", ""),
            fetched_at=data.get("fetched_at", 0),
            used_games=data.get("used_games", []),
            total_games_claimed=data.get("total_games_claimed", 0),
            total_hours_claimed=data.get("total_hours_claimed", 0.0),
        )
        if legacy.has_token:
            s.accounts.append(legacy)
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
        "system_locale": "en-GB",
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
        with urllib.request.urlopen(req, timeout=10) as response:
            props = json.loads(response.read().decode("utf-8"))["properties"]
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
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"token rejected ({exc.code})") from exc
    token = data.get("analytics_token")
    if not token:
        raise RuntimeError("no analytics_token in response")
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


@dataclass(frozen=True)
class Game:
    id: str
    name: str
    exe: str


def _win_exe(game: dict) -> str:
    for entry in game.get("executables", []):
        if entry.get("os") == "win32" and entry.get("name"):
            return entry["name"]
    return "game.exe"


def _download_games() -> str:
    req = urllib.request.Request(GAMES_CDN_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8")
    try:
        GAMES_FILE.parent.mkdir(parents=True, exist_ok=True)
        GAMES_FILE.write_text(raw, encoding="utf-8")
    except OSError:
        pass
    return raw


def _parse_games(raw: str) -> list[Game]:
    data = json.loads(raw)
    games: list[Game] = []
    seen: set[str] = set()
    for entry in data:
        gid = str(entry.get("id", ""))
        if not gid.isdigit() or gid in seen:
            continue
        if not any(e.get("os") == "win32" and e.get("name") for e in entry.get("executables", [])):
            continue
        seen.add(gid)
        games.append(Game(gid, entry.get("name", "Unknown"), _win_exe(entry)))
    return games


def load_games() -> list[Game]:
    # 1. Ưu tiên đọc file detectable_games.json cục bộ để nạp tức thì
    local_detectable = ROOT / "detectable_games.json"
    if local_detectable.exists():
        try:
            with open(local_detectable, "r", encoding="utf-8") as f:
                data = json.load(f)
                if len(data) > 0:
                    return [Game(str(g["id"]), g["name"], g["exe"]) for g in data]
        except Exception:
            pass

    # 2. Đọc file cache games.json
    raw = ""
    if GAMES_FILE.exists():
        raw = GAMES_FILE.read_text(encoding="utf-8").strip()
    if raw:
        try:
            games = _parse_games(raw)
            if games:
                return games
        except (json.JSONDecodeError, ValueError):
            pass

    # 3. Tải từ CDN
    try:
        return _parse_games(_download_games())
    except Exception:
        return []


class ScienceClient:
    def __init__(self, account: Account, session: Session) -> None:
        self.account = account
        self.session = session
        self._seq = 0

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def build_launch(self, game: Game) -> dict:
        now = int(time.time() * 1000)
        props = {
            "client_track_timestamp": now,
            "client_heartbeat_session_id": self.session.heartbeat_session,
            "event_sequence_number": self._next_seq(),
            "game": game.name,
            "game_id": game.id,
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
            "executable_path": game.exe,
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
            "rendered_locale": "en-GB",
            "launch_signature": self.session.launch_signature,
            "client_rtc_state": None,
            "client_app_state": "focused",
            "client_send_timestamp": now,
        }
        if not self.account.fingerprint:
            del props["executable_fingerprint"]
        return {"type": "launch_game", "properties": props}

    def build_heartbeat(self, game: Game, duration_ms: int, session_id: str,
                        initial: bool, final: bool, ts: int | None = None) -> dict:
        ts = int(time.time() * 1000) if ts is None else ts
        return {
            "type": "running_game_heartbeat",
            "properties": {
                "client_track_timestamp": ts,
                "client_heartbeat_session_id": self.session.heartbeat_session,
                "event_sequence_number": self._next_seq(),
                "game_id": game.id,
                "game_name": game.name,
                "game_metadata": None,
                "game_executable": game.exe,
                "game_detection_enabled": True,
                "initial_heartbeat": initial,
                "final_heartbeat": final,
                "game_session_id": session_id,
                "duration_tracked_ms": duration_ms,
                "rtc_connection_id": None,
                "media_session_id": None,
                "launch_signature": self.session.launch_signature,
                "client_app_state": "focused",
                "client_send_timestamp": ts,
            },
        }

    def build_session(self, game: Game, duration_ms: int) -> list[dict]:
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
            "accept-language": "en-GB",
            "authorization": self.account.token,
            "content-type": "application/json",
            "origin": "https://discord.com",
            "referer": "https://discord.com/channels/@me",
            "user-agent": USER_AGENT,
            "x-debug-options": "bugReporterEnabled",
            "x-discord-locale": "en-GB",
            "x-discord-timezone": "Europe/Oslo",
            "x-super-properties": self.session.super_props,
        }
        if DEBUG:
            print("\n" + "=" * 72)
            print(f"POST {SCIENCE_URL} ({len(payload['events'])} events)")
            print("body:", json.dumps(payload, indent=2))
            print("=" * 72)
        request = urllib.request.Request(SCIENCE_URL, data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
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


def _chunked(items: Sequence[Game], size: int) -> Iterator[Sequence[Game]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


class Spoofer:
    def __init__(self, client: ScienceClient, console: Console, tag: str = "") -> None:
        self.client = client
        self.console = console
        self.tag = tag

    def run(self, games: Sequence[Game], build_events) -> int:
        total = len(games)
        sent_ok = 0
        batch_num = 0
        for chunk in _chunked(games, BATCH_SIZE):
            batch_num += 1
            events = []
            for game in chunk:
                events.extend(build_events(game))
            status = self.client.post(events)
            if status == 204:
                sent_ok += len(chunk)
                if batch_num % REPORT_EVERY == 0 or sent_ok == total:
                    self.console.sent(
                        self.tag,
                        f"{sent_ok}/{total} games · {sent_ok * HOURS_PER_GAME:,.0f}h",
                    )
            elif status in (401, 403):
                return sent_ok
            time.sleep(BATCH_DELAY)
        return sent_ok


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
    games: list[Game],
    state: State,
    console: Console,
    results: dict,
) -> None:
    acct = state.find_or_create(token)
    if fingerprint:
        acct.fingerprint = fingerprint
    elif not acct.fingerprint:
        # Tự động tạo Fingerprint PE chuẩn nếu file fingerprints.txt không có
        try:
            from fast_badge_spoofer import generate_fingerprint
            acct.fingerprint = generate_fingerprint(acct.uid)
        except Exception:
            pass

    tag = f"[{idx+1}/{total_acc}] {acct.label}"

    session = Session.new()
    try:
        ensure_token(acct, session.super_props)
    except Exception:
        results[tag] = ("fail", 0)
        return

    client = ScienceClient(acct, session)
    sequence = [games[j % len(games)] for j in range(GAMES_PER_TOKEN)]

    try:
        ok = Spoofer(client, console, tag).run(
            sequence,
            lambda g: client.build_session(g, int(HOURS_PER_GAME * 3600 * 1000)),
        )
    except Exception:
        results[tag] = ("fail", 0)
        return

    if ok <= 0:
        results[tag] = ("fail", 0)
        return

    acct.total_games_claimed += ok
    acct.total_hours_claimed += ok * HOURS_PER_GAME
    state.save()

    console.ok(tag, f"{ok} games · {ok * HOURS_PER_GAME:,.0f}h")
    results[tag] = ("ok", ok)


def main() -> None:
    C = Console()
    C.banner()
    time.sleep(0.3)

    games = load_games()
    if not games:
        C.info("games · load failed")
        return

    if not TOKENS_FILE.exists():
        # Nếu chưa có tokens.txt nhưng có token lưu trong science_state.json thì tự động điền
        saved_tok = ""
        if STATE_FILE.exists():
            try:
                s_data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
                saved_tok = s_data.get("user_token", "")
            except Exception:
                pass
        
        default_content = "# Dán mỗi dòng 1 Discord User Token\n"
        if saved_tok:
            default_content += f"{saved_tok}\n"
        TOKENS_FILE.write_text(default_content, encoding="utf-8")
        C.info(f"tokens · created {TOKENS_FILE.name}")

    tokens = load_tokens()
    if not tokens:
        C.info(f"tokens · {TOKENS_FILE.name} is empty - paste tokens to run")
        return

    fingerprints = load_fingerprints()
    state = State.load()

    workers = MAX_WORKERS if MAX_WORKERS > 0 else len(tokens)
    workers = min(workers, len(tokens))

    print()
    C.info(f"accounts: {len(tokens)} · games: {len(games)} · "
           f"plan: {GAMES_PER_TOKEN} × {HOURS_PER_GAME:g}h each · workers: {workers}")
    C.rule()

    results: dict[str, tuple[str, int]] = {}
    threads: list[threading.Thread] = []
    semaphore = threading.Semaphore(workers)

    def bounded(idx: int, token: str, fp: str) -> None:
        with semaphore:
            worker(idx, len(tokens), token, fp, games, state, C, results)

    start_ts = time.time()
    for i, token in enumerate(tokens):
        fp = fingerprints[i] if i < len(fingerprints) else ""
        t = threading.Thread(target=bounded, args=(i, token, fp), daemon=False)
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    elapsed = time.time() - start_ts
    total_ok = sum(n for status, n in results.values() if status == "ok")
    ok_count = sum(1 for status, _ in results.values() if status == "ok")
    fail_count = len(results) - ok_count

    print()
    C.rule()
    if total_ok > 0:
        C.ok("complete",
             f"{total_ok} games · {total_ok * HOURS_PER_GAME:,.0f}h "
             f"· {ok_count} accounts · {elapsed:.1f}s")
    else:
        C.info(f"nothing farmed · {fail_count} accounts failed · {elapsed:.1f}s")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        Console().info("interrupted")
