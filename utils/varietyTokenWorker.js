'use strict';

/**
 * Lowkey Game Variety Badge Token Worker
 * Cày tiến trình Huy hiệu "Trò chơi đa dạng" (Game Variety) 100% tự động bằng User Token
 * Chạy ngầm 24/7 trên Server/Bot hoặc máy tính, tắt máy vẫn tiếp tục chạy trên VPS/Server
 */

const fs = require('node:fs');
const path = require('node:path');
let WebSocketImpl = globalThis.WebSocket;
try {
  WebSocketImpl = require('ws');
} catch (e) {}

function resolveProgressFilePath() {
  const railwayDataDir = '/data';
  if (fs.existsSync(railwayDataDir)) {
    return path.join(railwayDataDir, 'variety_progress.json');
  }
  return path.join(__dirname, '..', 'data', 'variety_progress.json');
}

const PROGRESS_FILE = resolveProgressFilePath();

// Danh mục 130 tựa game PC Detectable của Discord kèm Application ID chính thức
const GAME_CATALOG = Object.freeze([
  { name: 'Counter-Strike 2', appId: '730', exe: 'cs2.exe' },
  { name: 'Dota 2', appId: '570', exe: 'dota2.exe' },
  { name: 'Team Fortress 2', appId: '440', exe: 'hl2.exe' },
  { name: 'Half-Life 2', appId: '220', exe: 'hl2.exe' },
  { name: 'Portal 2', appId: '620', exe: 'portal2.exe' },
  { name: 'Left 4 Dead 2', appId: '550', exe: 'left4dead2.exe' },
  { name: 'VALORANT', appId: '700136079562375258', exe: 'VALORANT-Win64-Shipping.exe' },
  { name: 'League of Legends', appId: '401518656763592704', exe: 'League of Legends.exe' },
  { name: 'Apex Legends', appId: '542786198303866880', exe: 'r5apex.exe' },
  { name: 'Fortnite', appId: '432980957394370572', exe: 'FortniteClient-Win64-Shipping.exe' },
  { name: 'Overwatch 2', appId: '356875221077819392', exe: 'Overwatch.exe' },
  { name: 'Minecraft', appId: '436224161702805514', exe: 'Minecraft.exe' },
  { name: 'Roblox', appId: '439223656200077313', exe: 'RobloxPlayerBeta.exe' },
  { name: 'Genshin Impact', appId: '762434991303950386', exe: 'GenshinImpact.exe' },
  { name: 'Honkai: Star Rail', appId: '1095982855111872582', exe: 'StarRail.exe' },
  { name: 'Zenless Zone Zero', appId: '1236894541577977937', exe: 'ZenlessZoneZero.exe' },
  { name: 'Grand Theft Auto V', appId: '423646631248461825', exe: 'GTA5.exe' },
  { name: 'Red Dead Redemption 2', appId: '552467140882661376', exe: 'RDR2.exe' },
  { name: 'Cyberpunk 2077', appId: '438122941394255882', exe: 'Cyberpunk2077.exe' },
  { name: 'The Witcher 3: Wild Hunt', appId: '292030', exe: 'witcher3.exe' },
  { name: 'Elden Ring', appId: '1245620', exe: 'eldenring.exe' },
  { name: 'Dark Souls III', appId: '374320', exe: 'DarkSoulsIII.exe' },
  { name: 'Sekiro: Shadows Die Twice', appId: '814380', exe: 'sekiro.exe' },
  { name: 'Baldur\'s Gate 3', appId: '1086940', exe: 'bg3_dx11.exe' },
  { name: 'Black Myth: Wukong', appId: '2358720', exe: 'b1-Win64-Shipping.exe' },
  { name: 'PUBG: BATTLEGROUNDS', appId: '578080', exe: 'TslGame.exe' },
  { name: 'Rust', appId: '252490', exe: 'RustClient.exe' },
  { name: 'Palworld', appId: '1623730', exe: 'Palworld-Win64-Shipping.exe' },
  { name: 'Terraria', appId: '105600', exe: 'Terraria.exe' },
  { name: 'Stardew Valley', appId: '413150', exe: 'Stardew Valley.exe' },
  { name: 'Helldivers 2', appId: '553850', exe: 'helldivers2.exe' },
  { name: 'Warframe', appId: '230410', exe: 'Warframe.x64.exe' },
  { name: 'Destiny 2', appId: '1085660', exe: 'destiny2.exe' },
  { name: 'Diablo IV', appId: '1157147775986872361', exe: 'Diablo IV.exe' },
  { name: 'Path of Exile', appId: '238960', exe: 'PathOfExile.exe' },
  { name: 'World of Warcraft', appId: '356875502041792512', exe: 'Wow.exe' },
  { name: 'FINAL FANTASY XIV', appId: '392130', exe: 'ffxiv_dx11.exe' },
  { name: 'Tom Clancy\'s Rainbow Six Siege', appId: '359576595561578497', exe: 'RainbowSix.exe' },
  { name: 'Escape from Tarkov', appId: '440263300891082752', exe: 'EscapeFromTarkov.exe' },
  { name: 'Lethal Company', appId: '1966720', exe: 'Lethal Company.exe' },
  { name: 'Among Us', appId: '945360', exe: 'Among Us.exe' },
  { name: 'Fall Guys', appId: '1097150', exe: 'FallGuys_client.exe' },
  { name: 'Rocket League', appId: '252950', exe: 'RocketLeague.exe' },
  { name: 'Garry\'s Mod', appId: '4000', exe: 'gmod.exe' },
  { name: 'osu!', appId: '367827983903031296', exe: 'osu!.exe' },
  { name: 'EA SPORTS FC 25', appId: '2195250', exe: 'FC25.exe' },
  { name: 'Forza Horizon 5', appId: '1551360', exe: 'ForzaHorizon5.exe' },
  { name: 'Euro Truck Simulator 2', appId: '227300', exe: 'eurotrucks2.exe' },
  { name: 'American Truck Simulator', appId: '270880', exe: 'amtrucks.exe' },
  { name: 'BeamNG.drive', appId: '284160', exe: 'BeamNG.drive.x64.exe' },
  { name: 'Assetto Corsa', appId: '244210', exe: 'acs.exe' },
  { name: 'Need for Speed Unbound', appId: '1846380', exe: 'NeedForSpeedUnbound.exe' },
  { name: 'Cities: Skylines II', appId: '949230', exe: 'Cities2.exe' },
  { name: 'Factorio', appId: '427520', exe: 'factorio.exe' },
  { name: 'Satisfactory', appId: '526870', exe: 'FactoryGame.exe' },
  { name: 'RimWorld', appId: '294100', exe: 'RimWorldWin64.exe' },
  { name: 'Frostpunk 2', appId: '1601580', exe: 'Frostpunk2.exe' },
  { name: 'Sid Meier\'s Civilization VI', appId: '289070', exe: 'CivilizationVI.exe' },
  { name: 'Age of Empires IV', appId: '1466860', exe: 'RelicCardinal.exe' },
  { name: 'Total War: WARHAMMER III', appId: '1142710', exe: 'Warhammer3.exe' },
  { name: 'Crusader Kings III', appId: '1158310', exe: 'ck3.exe' },
  { name: 'Europa Universalis IV', appId: '236850', exe: 'eu4.exe' },
  { name: 'Hearts of Iron IV', appId: '394360', exe: 'hoi4.exe' },
  { name: 'Stellaris', appId: '281990', exe: 'stellaris.exe' },
  { name: 'Deep Rock Galactic', appId: '548430', exe: 'FSD-Win64-Shipping.exe' },
  { name: 'War Thunder', appId: '236390', exe: 'aces.exe' },
  { name: 'World of Tanks', appId: '140720', exe: 'WorldOfTanks.exe' },
  { name: 'World of Warships', appId: '552990', exe: 'WorldOfWarships64.exe' },
  { name: 'Call of Duty', appId: '1938090', exe: 'cod.exe' },
  { name: 'Battlefield 2042', appId: '1517290', exe: 'BF2042.exe' },
  { name: 'Halo Infinite', appId: '1240440', exe: 'HaloInfinite.exe' },
  { name: 'DOOM Eternal', appId: '782330', exe: 'DOOMEternalx64vk.exe' },
  { name: 'PAYDAY 2', appId: '218620', exe: 'payday2_win32_release.exe' },
  { name: 'Ready or Not', appId: '1144200', exe: 'ReadyOrNot-Win64-Shipping.exe' },
  { name: 'Squad', appId: '393380', exe: 'SquadGame.exe' },
  { name: 'Arma 3', appId: '107410', exe: 'arma3_x64.exe' },
  { name: 'Hell Let Loose', appId: '686810', exe: 'HLL-Win64-Shipping.exe' },
  { name: 'Dead by Daylight', appId: '381210', exe: 'DeadByDaylight-Win64-Shipping.exe' },
  { name: 'Phasmophobia', appId: '739630', exe: 'Phasmophobia.exe' },
  { name: 'Hades II', appId: '1145350', exe: 'Hades2.exe' },
  { name: 'Dead Cells', appId: '588650', exe: 'deadcells.exe' },
  { name: 'Hollow Knight', appId: '367520', exe: 'hollow_knight.exe' },
  { name: 'Celeste', appId: '504230', exe: 'Celeste.exe' },
  { name: 'Cuphead', appId: '268910', exe: 'Cuphead.exe' },
  { name: 'The Binding of Isaac: Rebirth', appId: '250900', exe: 'isaac-ng.exe' },
  { name: 'Vampire Survivors', appId: '1794680', exe: 'VampireSurvivors.exe' },
  { name: 'Risk of Rain 2', appId: '632360', exe: 'Risk of Rain 2.exe' },
  { name: 'Slay the Spire', appId: '646570', exe: 'SlayTheSpire.exe' },
  { name: 'Balatro', appId: '2379780', exe: 'Balatro.exe' },
  { name: 'Dave the Diver', appId: '1868140', exe: 'DaveTheDiver.exe' },
  { name: 'Disco Elysium', appId: '632470', exe: 'disco.exe' },
  { name: 'Undertale', appId: '391540', exe: 'UNDERTALE.exe' },
  { name: 'Resident Evil 4', appId: '2050650', exe: 're4.exe' },
  { name: 'Silent Hill 2', appId: '2124490', exe: 'SHProto-Win64-Shipping.exe' },
  { name: 'Dead Space', appId: '1693980', exe: 'DeadSpace.exe' },
  { name: 'Alan Wake 2', appId: '1172935293478940732', exe: 'AlanWake2.exe' },
  { name: 'The Last of Us Part I', appId: '1888930', exe: 'tlou-i.exe' },
  { name: 'God of War Ragnarök', appId: '2322010', exe: 'GoWR.exe' },
  { name: 'Horizon Forbidden West', appId: '2420110', exe: 'HorizonForbiddenWest.exe' },
  { name: 'Ghost of Tsushima', appId: '2215430', exe: 'GhostOfTsushima.exe' },
  { name: 'Marvel\'s Spider-Man Remastered', appId: '1817070', exe: 'Spider-Man.exe' },
  { name: 'Death Stranding', appId: '1190460', exe: 'ds.exe' },
  { name: 'No Man\'s Sky', appId: '275850', exe: 'NMS.exe' },
  { name: 'Subnautica', appId: '264710', exe: 'Subnautica.exe' },
  { name: 'Sea of Thieves', appId: '1172620', exe: 'SoTGame.exe' },
  { name: 'Monster Hunter: World', appId: '582010', exe: 'MonsterHunterWorld.exe' },
  { name: 'Hogwarts Legacy', appId: '990080', exe: 'HogwartsLegacy.exe' },
  { name: 'PAYDAY 3', appId: '1272080', exe: 'PAYDAY3Client-Win64-Shipping.exe' },
  { name: 'The Finals', appId: '2073850', exe: 'Discovery.exe' },
  { name: 'Brawlhalla', appId: '291550', exe: 'Brawlhalla.exe' },
  { name: 'Smite 2', appId: '2437170', exe: 'Smite2.exe' },
  { name: 'Trackmania', appId: '2225070', exe: 'Trackmania.exe' },
  { name: 'Hunt: Showdown 1896', appId: '594650', exe: 'HuntGame.exe' },
  { name: 'StarCraft II', appId: '356875932598829056', exe: 'SC2_x64.exe' },
  { name: 'Warcraft III', appId: '356876115998965760', exe: 'Warcraft III.exe' },
  { name: 'Oxygen Not Included', appId: '457140', exe: 'OxygenNotIncluded.exe' },
  { name: 'Foxhole', appId: '505460', exe: 'War-Win64-Shipping.exe' },
  { name: 'Insurgency: Sandstorm', appId: '581320', exe: 'InsurgencyClient-Win64-Shipping.exe' },
  { name: 'Assetto Corsa Competizione', appId: '805550', exe: 'acc.exe' },
  { name: 'DayZ', appId: '221100', exe: 'DayZ_x64.exe' },
  { name: 'ARK: Survival Ascended', appId: '2399830', exe: 'ArkAscended.exe' },
  { name: 'Divinity: Original Sin 2', appId: '435150', exe: 'EoCApp.exe' },
  { name: 'Guild Wars 2', appId: '1284210', exe: 'Gw2-64.exe' },
  { name: 'The Elder Scrolls Online', appId: '306130', exe: 'eso64.exe' },
  { name: 'Lost Ark', appId: '1599340', exe: 'LOSTARK.exe' }
]);

const TIERS = [
  { count: 2, title: 'Người dùng thử' },
  { count: 5, title: 'Người chơi qua' },
  { count: 10, title: 'Người đam mê' },
  { count: 15, title: 'Trinh Sát' },
  { count: 20, title: 'Người khám phá' },
  { count: 30, title: 'Nhà Thám Hiểm' },
  { count: 40, title: 'Nhà du hành' },
  { count: 60, title: 'Người khác biệt' },
  { count: 80, title: 'Người đa tài' },
  { count: 100, title: 'Thuyết phổ quát (Tối đa)' }
];

function getTierTitle(count) {
  let title = 'Chưa mở khóa';
  for (const t of TIERS) {
    if (count >= t.count) title = t.title;
  }
  return title;
}

// Lưu và nạp tiến trình
function loadProgress(userId) {
  const uid = String(userId || '');
  // 1. Ưu tiên đọc từ SQLite database bền vững
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const row = db.prepare('SELECT * FROM variety_sessions WHERE user_id = ?').get(uid);
    if (row) {
      let completed = [];
      try { completed = JSON.parse(row.completed_json) || []; } catch {}
      let notifiedCounts = [];
      try { notifiedCounts = JSON.parse(row.notified_counts_json || '[]') || []; } catch {}
      return {
        userId: uid,
        completed,
        currentIndex: row.current_index || 0,
        status: row.status || 'idle',
        notifiedCounts,
        updatedAt: row.updated_at || Date.now()
      };
    }
  } catch (_) {}

  // 2. Dự phòng đọc từ file JSON nếu database chưa có
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (data && data[uid]) {
        return {
          ...data[uid],
          notifiedCounts: data[uid].notifiedCounts || []
        };
      }
    }
  } catch {}
  return {
    userId: uid,
    completed: [],
    currentIndex: 0,
    status: 'idle',
    notifiedCounts: [],
    updatedAt: Date.now()
  };
}

function saveProgress(userId, progress) {
  const uid = String(userId || '');
  // 1. Lưu vào SQLite database bền vững
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const existing = db.prepare('SELECT user_id, token, started_at, username FROM variety_sessions WHERE user_id = ?').get(uid);
    const startedAt = progress.startedAt || existing?.started_at || Date.now();
    const token = progress.token || existing?.token || '';
    const username = progress.username || existing?.username || null;
    const completedJson = JSON.stringify(progress.completed || []);
    const notifiedCountsJson = JSON.stringify(progress.notifiedCounts || []);

    db.prepare(`
      INSERT INTO variety_sessions (
        user_id, token, username, status, completed_json, current_index, started_at, updated_at,
        notified_counts_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        token = CASE WHEN excluded.token != '' THEN excluded.token ELSE variety_sessions.token END,
        username = COALESCE(excluded.username, variety_sessions.username),
        status = excluded.status,
        completed_json = excluded.completed_json,
        current_index = excluded.current_index,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        notified_counts_json = excluded.notified_counts_json
    `).run(
      uid,
      token,
      username,
      progress.status || 'running',
      completedJson,
      progress.currentIndex || 0,
      startedAt,
      Date.now(),
      notifiedCountsJson
    );
  } catch (e) {
    console.warn('[VARIETY WORKER] DB saveProgress error:', e.message);
  }

  // 2. Ghi ra file JSON mirror
  try {
    const dir = path.dirname(PROGRESS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let data = {};
    if (fs.existsSync(PROGRESS_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) || {};
      } catch {}
    }
    data[uid] = {
      ...progress,
      updatedAt: Date.now()
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[VARIETY WORKER] saveProgress error:', e.message);
  }
}

// Kiểm tra token qua Discord REST API
async function validateToken(token) {
  const clean = (token || '').trim().replace(/^['"]|['"]$/g, '');
  if (!clean || clean.length < 25) return null;

  try {
    const res = await fetch('https://discord.com/api/v9/users/@me', {
      headers: {
        Authorization: clean,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9168 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Lớp Client Gateway kết nối trực tiếp WebSocket đóng vai trò Discord Desktop Client chính thức
class VarietyGatewayClient {
  constructor(token) {
    this.token = token.trim().replace(/^['"]|['"]$/g, '');
    this.ws = null;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.sequence = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.connected = false;
    this.isReady = false;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.lastHeartbeatAck = Date.now();
    this.currentGame = null;
    this.onReadyCallback = null;
    this.onCloseCallback = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.clearReconnectTimer();

      if (this.ws) {
        try {
          if (typeof this.ws.terminate === 'function') this.ws.terminate();
          else if (typeof this.ws.close === 'function') this.ws.close();
        } catch (_) {}
        this.ws = null;
      }

      let isInitialConnect = !this.isReady;
      const timeoutTimer = setTimeout(() => {
        if (!this.isReady && isInitialConnect) {
          isInitialConnect = false;
          this.disconnect(false);
          reject(new Error('Hết thời gian chờ kết nối Gateway (Timeout 15s).'));
        }
      }, 15000);
      if (timeoutTimer && typeof timeoutTimer.unref === 'function') {
        timeoutTimer.unref();
      }

      try {
        const endpoint = (this.resumeGatewayUrl && this.sessionId)
          ? `${this.resumeGatewayUrl.replace(/\/$/, '')}/?v=9&encoding=json`
          : 'wss://gateway.discord.gg/?v=9&encoding=json';
        this.ws = new WebSocketImpl(endpoint);
      } catch (e) {
        clearTimeout(timeoutTimer);
        return reject(e);
      }

      this.ws.on('open', () => {
        this.connected = true;
        this.lastHeartbeatAck = Date.now();
      });

      this.ws.on('message', (raw) => {
        try {
          const payload = JSON.parse(raw.toString());
          const { op, d, s, t } = payload;
          if (s != null) this.sequence = s;

          // Op 10: Hello -> Bắt đầu Heartbeat & (Resume hoặc Identify)
          if (op === 10) {
            const interval = d?.heartbeat_interval || 41250;
            this.startHeartbeat(interval);

            if (this.sessionId && this.sequence != null) {
              this.send({
                op: 6,
                d: {
                  token: this.token,
                  session_id: this.sessionId,
                  seq: this.sequence
                }
              });
            } else {
              // Gửi gói tin Identify với thông số định danh chuẩn Discord Windows Client
              const identifyPayload = {
                op: 2,
                d: {
                  token: this.token,
                  capabilities: 16381,
                  properties: {
                    os: 'Windows',
                    browser: 'Discord Client',
                    release_channel: 'stable',
                    client_version: '1.0.9168',
                    os_version: '10.0.19045',
                    os_arch: 'x64',
                    system_locale: 'vi-VN'
                  },
                  presence: {
                    status: 'online',
                    since: 0,
                    activities: this.currentGame ? [this.buildActivity(this.currentGame)] : [],
                    afk: false
                  }
                }
              };
              this.send(identifyPayload);
            }
          }

          // Op 1: Heartbeat request từ Discord
          if (op === 1) {
            this.send({ op: 1, d: this.sequence });
          }

          // Op 11: Heartbeat ACK
          if (op === 11) {
            this.lastHeartbeatAck = Date.now();
          }

          // Op 7: Reconnect request
          if (op === 7) {
            this.reconnect(500);
          }

          // Op 9: Invalid Session
          if (op === 9) {
            const resumable = Boolean(d);
            if (!resumable) {
              this.sessionId = null;
              this.sequence = null;
            }
            this.reconnect(resumable ? 1000 : 2500);
          }

          // Op 0: Dispatch READY
          if (op === 0 && t === 'READY') {
            this.isReady = true;
            this.sessionId = d?.session_id || this.sessionId;
            this.resumeGatewayUrl = d?.resume_gateway_url || null;
            this.reconnectAttempts = 0;
            clearTimeout(timeoutTimer);
            if (this.currentGame) {
              this.setGame(this.currentGame);
            }
            if (typeof this.onReadyCallback === 'function') {
              this.onReadyCallback(d?.user);
            }
            resolve(d?.user);
          }

          // Op 0: Dispatch RESUMED
          if (op === 0 && t === 'RESUMED') {
            this.isReady = true;
            this.reconnectAttempts = 0;
            clearTimeout(timeoutTimer);
            if (this.currentGame) {
              this.setGame(this.currentGame);
            }
            if (isInitialConnect) {
              isInitialConnect = false;
              resolve({ resumed: true });
            }
          }
        } catch (e) {}
      });

      this.ws.on('error', (err) => {
        if (!this.isReady && isInitialConnect) {
          isInitialConnect = false;
          clearTimeout(timeoutTimer);
          reject(err);
        }
      });

      this.ws.on('close', (code) => {
        this.stopHeartbeat();
        this.connected = false;
        this.isReady = false;

        if (!this.shouldReconnect) {
          if (typeof this.onCloseCallback === 'function') {
            this.onCloseCallback({ code });
          }
          return;
        }

        if (code === 4004) {
          this.shouldReconnect = false;
          if (typeof this.onCloseCallback === 'function') {
            this.onCloseCallback({ code, tokenExpired: true });
          }
          return;
        }

        const delay = Math.min(30000, 2000 * Math.pow(1.5, Math.min(this.reconnectAttempts++, 6)));
        this.scheduleReconnect(delay);
      });
    });
  }

  buildActivity(game) {
    return {
      name: game.name,
      type: 0, // Playing
      application_id: String(game.appId),
      timestamps: {
        start: Date.now()
      },
      flags: 1
    };
  }

  setGame(game) {
    this.currentGame = game;
    if (!this.isReady) return;

    this.send({
      op: 3,
      d: {
        since: 0,
        activities: [this.buildActivity(game)],
        status: 'online',
        afk: false
      }
    });
  }

  startHeartbeat(interval) {
    this.stopHeartbeat();
    this.lastHeartbeatAck = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastHeartbeatAck > interval * 2.5) {
        console.warn('[VARIETY WORKER] Gateway zombie socket (Heartbeat ACK missing). Đang kết nối lại...');
        this.reconnect(500);
        return;
      }
      this.send({ op: 1, d: this.sequence });
    }, interval);
    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  scheduleReconnect(delayMs) {
    this.clearReconnectTimer();
    if (!this.shouldReconnect) return;
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch((e) => {
          console.warn('[VARIETY WORKER] Thử kết nối lại thất bại:', e.message);
        });
      }
    }, delayMs);
    if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref();
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  reconnect(delayMs = 2500) {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        if (typeof this.ws.terminate === 'function') this.ws.terminate();
        else if (typeof this.ws.close === 'function') this.ws.close(4000, 'Reconnecting');
      } catch (_) {}
      this.ws = null;
    }
    this.connected = false;
    this.isReady = false;
    this.scheduleReconnect(delayMs);
  }

  send(data) {
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === WebSocketImpl?.OPEN)) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (e) {}
    }
  }

  disconnect(permanent = true) {
    if (permanent) {
      this.shouldReconnect = false;
    }
    this.clearReconnectTimer();
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close(1000, 'Normal closure');
      } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
    this.isReady = false;
  }
}

// Quản lý các phiên chạy ngầm theo User ID
const activeSessions = new Map();

function isFarmingActive(userId) {
  const session = activeSessions.get(String(userId));
  return !!(session && session.running);
}

function getActiveSession(userId) {
  return activeSessions.get(String(userId)) || null;
}

/**
 * Khởi động tiến trình cày game ngầm bằng Token
 */
async function startVarietyFarming({
  token,
  userId,
  durationPerGameMs = 360000, // 6 phút mỗi game (chuẩn Discord Heartbeat Telemetry)
  targetCount = 100,
  onProgress = null,
  onMilestone = null,
  onComplete = null,
  onError = null
}) {
  const uid = String(userId);

  // Nếu đang chạy thì thông báo
  if (isFarmingActive(uid)) {
    return { success: false, message: 'Tiến trình cày ngầm đang chạy trên tài khoản này rồi!' };
  }

  // 1. Kiểm tra Token
  const userProfile = await validateToken(token);
  if (!userProfile) {
    return { success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' };
  }

  // 2. Nạp tiến trình trước đó
  const progress = loadProgress(uid);
  let completedSet = new Set(progress.completed || []);

  const client = new VarietyGatewayClient(token);
  const session = {
    userId: uid,
    username: userProfile.username,
    client,
    running: true,
    timer: null,
    startedAt: Date.now(),
    durationPerGameMs,
    targetCount
  };

  activeSessions.set(uid, session);

  try {
    await client.connect();
  } catch (err) {
    activeSessions.delete(uid);
    client.disconnect();
    return { success: false, message: `Không thể kết nối Gateway: ${err.message}` };
  }

  const currentInitialCount = completedSet.size;
  if (!Array.isArray(progress.notifiedCounts)) {
    progress.notifiedCounts = [];
  }
  for (const t of TIERS) {
    if (t.count <= currentInitialCount && !progress.notifiedCounts.includes(t.count)) {
      progress.notifiedCounts.push(t.count);
    }
  }

  progress.status = 'running';
  saveProgress(uid, progress);

  let currentIndex = progress.currentIndex || 0;

  const cycleNextGame = async () => {
    if (!session.running) return;

    if (completedSet.size >= targetCount) {
      finishFarming();
      return;
    }

    // Tìm game tiếp theo chưa hoàn thành
    let game = null;
    for (let i = 0; i < GAME_CATALOG.length; i++) {
      const idx = (currentIndex + i) % GAME_CATALOG.length;
      const candidate = GAME_CATALOG[idx];
      if (!completedSet.has(candidate.name)) {
        game = candidate;
        currentIndex = (idx + 1) % GAME_CATALOG.length;
        break;
      }
    }

    if (!game) {
      finishFarming();
      return;
    }

    // Đặt game trên Gateway
    client.setGame(game);

    const prevCount = completedSet.size;
    completedSet.add(game.name);

    progress.completed = Array.from(completedSet);
    progress.currentIndex = currentIndex;
    saveProgress(uid, progress);

    const currentCount = completedSet.size;
    const tierTitle = getTierTitle(currentCount);

    if (typeof onProgress === 'function') {
      try {
        onProgress({
          game,
          count: currentCount,
          target: targetCount,
          tierTitle,
          durationMs: durationPerGameMs
        });
      } catch (_) {}
    }

    // Báo mốc danh hiệu nếu đạt mốc mới (chỉ báo 1 lần duy nhất cho mỗi mốc)
    if (!Array.isArray(progress.notifiedCounts)) {
      progress.notifiedCounts = [];
    }
    for (const tier of TIERS) {
      if (currentCount >= tier.count && !progress.notifiedCounts.includes(tier.count)) {
        progress.notifiedCounts.push(tier.count);
        saveProgress(uid, progress);
        if (typeof onMilestone === 'function') {
          try {
            onMilestone({ count: tier.count, tier });
          } catch (_) {}
        }
      }
    }

    session.timer = setTimeout(() => {
      cycleNextGame();
    }, durationPerGameMs);
  };

  const finishFarming = () => {
    stopVarietyFarming(uid);
    progress.status = 'completed';
    saveProgress(uid, progress);

    if (typeof onComplete === 'function') {
      try {
        onComplete({
          totalGames: completedSet.size,
          tierTitle: getTierTitle(completedSet.size)
        });
      } catch (_) {}
    }
  };

  // Bắt đầu chu kỳ game đầu tiên
  cycleNextGame();

  return {
    success: true,
    message: 'Đã khởi chạy cày ngầm bằng Token thành công!',
    username: userProfile.username,
    completedCount: completedSet.size,
    targetCount
  };
}

/**
 * Dừng tiến trình cày ngầm
 */
function stopVarietyFarming(userId) {
  const uid = String(userId);
  const session = activeSessions.get(uid);
  if (!session) return false;

  session.running = false;
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  if (session.client) {
    session.client.disconnect(true);
  }

  activeSessions.delete(uid);

  const progress = loadProgress(uid);
  progress.status = 'stopped';
  saveProgress(uid, progress);

  return true;
}

/**
 * Tự động khôi phục các phiên cày Trò chơi đa dạng khi bot khởi động lại (trên Railway / Cloud)
 */
async function initVarietyAutoResume(client) {
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const rows = db.prepare("SELECT * FROM variety_sessions WHERE status = 'running'").all();
    if (!rows || rows.length === 0) return;

    console.log(`[VARIETY WORKER] 🔄 Phát hiện ${rows.length} phiên cày Trò chơi đa dạng cần khôi phục sau khi bot khởi động...`);

    setTimeout(async () => {
      for (const row of rows) {
        try {
          const uid = row.user_id;
          if (activeSessions.has(uid)) continue;

          let token = row.token;
          const sub = db.prepare('SELECT token FROM quest_subscribers WHERE user_id = ?').get(uid);
          if (sub && sub.token) token = sub.token;

          if (!token || token.length < 20) {
            db.prepare("UPDATE variety_sessions SET status = 'token_expired' WHERE user_id = ?").run(uid);
            continue;
          }

          const res = await startVarietyFarming({
            token,
            userId: uid,
            durationPerGameMs: 360000,
            targetCount: 100,
            onMilestone: async ({ count, tier }) => {
              try {
                if (client && typeof client.users?.fetch === 'function') {
                  const user = await client.users.fetch(uid);
                  await user.send(`🎉 **Đạt mốc huy hiệu!** Bạn đã chơi **${count}/100** game — Cấp: **${tier.title}**!`);
                }
              } catch (_) {}
            },
            onComplete: async ({ totalGames, tierTitle }) => {
              try {
                if (client && typeof client.users?.fetch === 'function') {
                  const user = await client.users.fetch(uid);
                  await user.send(`🏆 **HOÀN TẤT 100% CÀY HUY HIỆU!**\nĐã ghi nhận **${totalGames}** game — Huy hiệu: **${tierTitle}**!`);
                }
              } catch (_) {}
            }
          });

          if (res.success) {
            console.log(`[VARIETY WORKER] ✅ Đã tự động khôi phục cày Trò chơi đa dạng cho User ${uid}.`);
          } else {
            console.warn(`[VARIETY WORKER] ⚠️ Không thể khôi phục User ${uid}: ${res.message}`);
          }
        } catch (e) {
          console.error(`[VARIETY WORKER] Lỗi khôi phục User ${row.user_id}:`, e.message);
        }
      }
    }, 8000);
  } catch (err) {
    console.error('[VARIETY WORKER] initVarietyAutoResume error:', err.message);
  }
}

module.exports = {
  GAME_CATALOG,
  TIERS,
  getTierTitle,
  loadProgress,
  saveProgress,
  validateToken,
  startVarietyFarming,
  stopVarietyFarming,
  isFarmingActive,
  getActiveSession,
  initVarietyAutoResume,
  activeSessions
};
