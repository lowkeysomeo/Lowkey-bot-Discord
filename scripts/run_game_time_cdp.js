'use strict';

/**
 * Lowkey Discord Auto Game Time Badge (1-Click CDP Runner)
 * Tự động 100% kết nối Discord qua CDP và cày tích lũy giờ chơi cho Huy hiệu "Thời gian chơi"
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
    for (const appDir of appDirs) {
      const targetExe = path.join(discordBase, appDir, 'Discord.exe');
      if (fs.existsSync(targetExe)) return targetExe;
    }
  }
  return null;
}

async function isPortOpen() {
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version', {
      signal: AbortSignal.timeout(1500),
      headers: { Connection: 'close' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function killExistingDiscord() {
  try {
    execSync('taskkill /F /T /IM Discord.exe', { stdio: 'ignore' });
  } catch {}
}

function cleanConsoleArg(arg) {
  if (typeof arg !== 'string') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return arg.replace(/%c/g, '').trim();
}

function printFormattedLog(args) {
  if (!args || args.length === 0) return;
  const filtered = args
    .map((a) => cleanConsoleArg(a.value ?? a))
    .filter((a) => a && !a.startsWith('color:') && !a.startsWith('font-') && !a.startsWith('background:'));

  const text = filtered.join(' ');
  if (!text) return;

  if (text.includes('[Game Time]') || text.includes('[Lowkey Game Time]')) {
    if (text.includes('Đang cày') || text.includes('✅') || text.includes('🔄')) {
      log(`${C.green}${C.bold}${text}${C.reset}`);
    } else if (text.includes('❌') || text.includes('Lỗi')) {
      log(`${C.red}${text}${C.reset}`);
    } else if (text.includes('⏹️') || text.includes('Dừng')) {
      log(`${C.yellow}${text}${C.reset}`);
    } else {
      log(`${C.cyan}${text}${C.reset}`);
    }
  }
}

async function main() {
  console.clear();
  log(`${C.cyan}${C.bold}========================================================================${C.reset}`);
  log(`${C.cyan}${C.bold}⏱️ LOWKEY DISCORD AUTO GAME TIME BADGE (1-CLICK RUNNER)${C.reset}`);
  log(`${C.cyan}${C.bold}🏆 TỰ ĐỘNG CÀY TÍCH LŨY GIỜ CHƠI CHO HUY HIỆU "THỜI GIAN CHƠI" (DEDICATED)${C.reset}`);
  log(`${C.cyan}${C.bold}========================================================================${C.reset}\n`);

  const discordExe = findDiscordExe();
  if (!discordExe) {
    log(`${C.red}❌ Không tìm thấy Discord Desktop trên máy tính! Vui lòng cài đặt Discord Desktop.${C.reset}`);
    await waitExit();
    return;
  }

  // BƯỚC 1: KIỂM TRA & MỞ DISCORD VỚI DEBUG PORT
  log(`${C.yellow}[1/3] 🔍 Đang kiểm tra cổng kết nối Discord Desktop...${C.reset}`);
  let portReady = await isPortOpen();

  if (!portReady) {
    log(`${C.yellow}[1/3] 🚀 Đang khởi động Discord Desktop với cổng kết nối 9222...${C.reset}`);
    killExistingDiscord();

    await new Promise((r) => setTimeout(r, 1500));

    const child = spawn(discordExe, ['--remote-debugging-port=9222'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    for (let i = 1; i <= 25; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await isPortOpen()) {
        portReady = true;
        break;
      }
      log(`${C.gray}  [${i}/25] Đang chờ Discord mở cổng kết nối 9222...${C.reset}`);
    }
  }

  if (!portReady) {
    log(`${C.red}❌ Không thể kết nối với Discord Desktop qua cổng 9222.${C.reset}`);
    log(`${C.yellow}👉 MẸO: Bạn có thể mở Discord, nhấn Ctrl + Shift + I và dán mã scripts/game_time_script.js trực tiếp vào tab Console!${C.reset}`);
    await waitExit();
    return;
  }

  log(`${C.green}✅ [1/3] Discord Desktop đã sẵn sàng trên cổng 9222!${C.reset}`);

  // BƯỚC 2: TÌM CỬA SỔ DISCORD
  log(`${C.yellow}[2/3] ⏳ Đang kết nối tới cửa sổ Discord...${C.reset}`);
  let mainPage = null;

  for (let attempt = 1; attempt <= 30; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list', {
        signal: AbortSignal.timeout(2000),
        headers: { Connection: 'close' },
      });
      if (!res.ok) continue;

      const list = await res.json();
      if (!Array.isArray(list) || list.length === 0) {
        log(`${C.gray}  [${attempt}/30] Discord đang tải dữ liệu giao diện...${C.reset}`);
        continue;
      }

      mainPage = list.find(
        (t) =>
          t.type === 'page' &&
          (t.url?.includes('discord.com') ||
            t.title?.includes('Discord') ||
            t.title === 'Bạn bè' ||
            t.title === 'Friends' ||
            t.url?.startsWith('https://'))
      );

      if (!mainPage) {
        mainPage = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      }

      if (mainPage && mainPage.webSocketDebuggerUrl) {
        break;
      } else {
        log(`${C.gray}  [${attempt}/30] Đang chờ cửa sổ chính của Discord sẵn sàng...${C.reset}`);
      }
    } catch (_) {
      log(`${C.gray}  [${attempt}/30] Đang kết nối...${C.reset}`);
    }
  }

  if (!mainPage) {
    log(`${C.red}❌ Không tìm thấy cửa sổ chính của Discord. Hãy đảm bảo Discord đã tải xong giao diện.${C.reset}`);
    await waitExit();
    return;
  }

  log(`${C.green}✅ [2/3] Đã kết nối cửa sổ Discord (${mainPage.title || 'Discord App'})!${C.reset}`);

  // BƯỚC 3: KẾT NỐI VÀ INJECT SCRIPT
  log(`${C.yellow}[3/3] ⚡ Đang nạp mã cày giờ chơi vào Discord...${C.reset}`);
  let WebSocketImpl = globalThis.WebSocket;
  try {
    WebSocketImpl = require('ws');
  } catch (_) {}

  const ws = new WebSocketImpl(mainPage.webSocketDebuggerUrl);

  process.on('SIGINT', () => {
    log(`\n${C.yellow}🛑 Đang dừng cày giờ chơi và khôi phục Discord...${C.reset}`);
    try {
      if (ws.readyState === 1 || ws.readyState === WebSocketImpl?.OPEN) {
        ws.send(
          JSON.stringify({
            id: 999,
            method: 'Runtime.evaluate',
            params: { expression: 'window.__LOWKEY_GAME_TIME__?.stop();' },
          })
        );
      }
    } catch (_) {}
    setTimeout(() => {
      log(`${C.green}✅ Đã thoát an toàn.${C.reset}`);
      process.exit(0);
    }, 600);
  });

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));

      log(`${C.green}✅ [3/3] ĐÃ NẠP SCRIPT CÀY GIỜ CHƠI THÀNH CÔNG!${C.reset}`);
      log(`${C.cyan}\n------------------------------------------------------------------------${C.reset}`);
      log(`${C.cyan}${C.bold}🚀 TIẾN TRÌNH ĐANG CHẠY (BẢNG ĐIỀU KHIỂN NỔI ĐANG HIỂN THỊ TRONG DISCORD):${C.reset}`);
      log(`${C.cyan}⏱️ Giờ chơi sẽ được đếm liên tục theo từng giây trên màn hình Discord.${C.reset}`);
      log(`${C.cyan}🎮 Bạn có thể bấm "Đổi Game" trực tiếp trên bảng nổi trong Discord.${C.reset}`);
      log(`${C.cyan}👉 Nhấn Ctrl + C tại đây để dừng lại bất kỳ lúc nào.${C.reset}`);
      log(`${C.cyan}------------------------------------------------------------------------\n${C.reset}`);

      ws.send(
        JSON.stringify({
          id: 100,
          method: 'Runtime.evaluate',
          params: { expression: GAMETIME_SCRIPT, awaitPromise: true },
        })
      );
    });

    ws.on('message', (event) => {
      try {
        const data = JSON.parse(event.toString());
        if (data.method === 'Runtime.consoleAPICalled') {
          printFormattedLog(data.params.args);
        }
      } catch (_) {}
    });

    ws.on('error', (err) => {
      log(`${C.red}❌ Lỗi kết nối WebSocket: ${err.message}${C.reset}`);
      reject(err);
    });
  });
}

async function waitExit() {
  if (!process.stdin.isTTY) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('\n👉 Nhấn phím [Enter] để đóng cửa sổ...', () => {
      rl.close();
      resolve();
    });
  });
}

main().catch((err) => {
  log(`\n${C.red}❌ Lỗi: ${err.message}${C.reset}`);
  waitExit();
});
