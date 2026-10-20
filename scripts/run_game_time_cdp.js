'use strict';

/**
 * Lowkey Discord Auto Game Time Badge (1-Click CDP Runner)
 * Tự động kết nối Discord qua Chrome DevTools Protocol (CDP) và cày tích lũy giờ chơi cho Huy hiệu "Thời gian chơi"
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const readline = require('node:readline');

const SCRIPT_PATH = path.join(__dirname, 'game_time_script.js');
let GAMETIME_SCRIPT = '';
try {
  GAMETIME_SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');
} catch (e) {
  console.error('[LỖI] Không thể đọc file scripts/game_time_script.js:', e.message);
  process.exit(1);
}

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function log(msg) {
  console.log(msg);
}

function findDiscordExe() {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
  const discordBase = path.join(localAppData, 'Discord');

  const defaultExe = path.join(discordBase, 'Discord.exe');
  if (fs.existsSync(defaultExe)) return defaultExe;

  if (fs.existsSync(discordBase)) {
    const entries = fs.readdirSync(discordBase);
    const appDirs = entries.filter((e) => e.startsWith('app-')).sort().reverse();
    for (const d of appDirs) {
      const p = path.join(discordBase, d, 'Discord.exe');
      if (fs.existsSync(p)) return p;
    }
  }

  return 'Discord.exe';
}

function isDiscordRunning() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq Discord.exe" /NH', { encoding: 'utf8' });
    return out.toLowerCase().includes('discord.exe');
  } catch {
    return false;
  }
}

function killDiscord() {
  try {
    execSync('taskkill /F /T /IM Discord.exe', { stdio: 'ignore' });
  } catch {}
}

async function checkPortOpen(port = 9222) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getDiscordTargets(port = 9222) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function injectScriptViaWebSocket(wsUrl, scriptContent) {
  let WebSocketImpl = globalThis.WebSocket;
  try {
    WebSocketImpl = require('ws');
  } catch (_) {}

  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout kết nối WebSocket DevTools.'));
    }, 10000);

    ws.on('open', () => {
      const id = Date.now();
      const payload = {
        id,
        method: 'Runtime.evaluate',
        params: {
          expression: scriptContent,
          userGesture: true,
          awaitPromise: true,
          returnByValue: true,
        },
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data) => {
      try {
        const res = JSON.parse(data.toString());
        if (res.result) {
          clearTimeout(timeout);
          ws.close();
          resolve(res.result);
        }
      } catch (_) {}
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  log('');
  log(`${C.cyan}${C.bold}╔═══════════════════════════════════════════════════════════════╗${C.reset}`);
  log(`${C.cyan}${C.bold}║       LOWKEY AUTO GAME TIME BADGE — TỰ ĐỘNG CÀY GIỜ CHƠI      ║${C.reset}`);
  log(`${C.cyan}${C.bold}║    Huy hiệu "Thời gian chơi" (Dedicated / Tâm huyết / 5000h)  ║${C.reset}`);
  log(`${C.cyan}${C.bold}╚═══════════════════════════════════════════════════════════════╝${C.reset}`);
  log('');

  const PORT = 9222;
  const isPortReady = await checkPortOpen(PORT);

  if (!isPortReady) {
    if (isDiscordRunning()) {
      log(`${C.yellow}⚠️ Discord đang chạy nhưng chưa mở cổng gỡ lỗi (port ${PORT}).${C.reset}`);
      log(`${C.yellow}🔄 Đang khởi động lại Discord với chế độ gỡ lỗi...${C.reset}`);
      killDiscord();
      await sleep(1500);
    }

    const discordExe = findDiscordExe();
    log(`${C.gray}🚀 Khởi chạy Discord: ${discordExe} --remote-debugging-port=${PORT}${C.reset}`);

    const child = spawn(discordExe, [`--remote-debugging-port=${PORT}`], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    log(`${C.cyan}⏳ Đang chờ Discord tải (tối đa 15 giây)...${C.reset}`);
    let ready = false;
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      if (await checkPortOpen(PORT)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      log(`${C.red}❌ Không thể kết nối tới cổng gỡ lỗi Discord (port ${PORT}).${C.reset}`);
      log(`${C.yellow}💡 Mẹo: Hãy mở Discord bằng lệnh sau:${C.reset}`);
      log(`   "${discordExe}" --remote-debugging-port=${PORT}`);
      process.exit(1);
    }
  }

  log(`${C.green}✅ Đã kết nối tới cổng DevTools của Discord (port ${PORT})!${C.reset}`);
  await sleep(2000);

  const targets = await getDiscordTargets(PORT);
  const mainTarget =
    targets.find((t) => t.type === 'page' && t.url && t.url.includes('discord.com')) ||
    targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);

  if (!mainTarget || !mainTarget.webSocketDebuggerUrl) {
    log(`${C.red}❌ Không tìm thấy tab Discord đang mở.${C.reset}`);
    process.exit(1);
  }

  log(`${C.cyan}💉 Đang nạp script cày giờ chơi vào Discord...${C.reset}`);

  try {
    await injectScriptViaWebSocket(mainTarget.webSocketDebuggerUrl, GAMETIME_SCRIPT);
    log('');
    log(`${C.green}${C.bold}🎉 NẠP SCRIPT CÀY GIỜ CHƠI THÀNH CÔNG!${C.reset}`);
    log(`${C.green}► Bạn sẽ thấy bảng điều khiển nổi xuất hiện ở góc dưới màn hình Discord.${C.reset}`);
    log(`${C.cyan}► Tựa game đang treo: Counter-Strike 2 (hoặc bấm Đổi Game trên bảng).${C.reset}`);
    log(`${C.yellow}► Giữ Discord mở, giờ chơi sẽ được tích lũy liên tục vào Huy hiệu.${C.reset}`);
    log('');
  } catch (err) {
    log(`${C.red}❌ Lỗi khi nạp script: ${err.message}${C.reset}`);
  }
}

main().catch(console.error);
