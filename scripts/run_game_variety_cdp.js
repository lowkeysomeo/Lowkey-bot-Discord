'use strict';

/**
 * Lowkey Discord Auto Game Variety Badge (1-Click Runner)
 * Tự động 100% kết nối Discord qua CDP và cày huy hiệu "Trò chơi đa dạng" lên 100 games
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const readline = require('node:readline');

const SCRIPT_PATH = path.join(__dirname, 'game_variety_script.js');
let VARIETY_SCRIPT = '';
try {
  VARIETY_SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');
} catch (e) {
  console.error('[LỖI] Không thể đọc file scripts/game_variety_script.js:', e.message);
  process.exit(1);
}

// Màu sắc ANSI cho terminal
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

  // Ưu tiên file Discord.exe gốc của Squirrel để nhận tham số sạch sẽ
  const defaultExe = path.join(discordBase, 'Discord.exe');
  if (fs.existsSync(defaultExe)) return defaultExe;

  // Dự phòng kiểm tra thư mục app-1.0.x
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
    // Dùng /F /T để kill toàn bộ cây tiến trình (bao gồm các tiến trình con tránh giữ port 9222)
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

  if (text.includes('[Game Variety]')) {
    if (text.includes('Đang chơi:') || text.includes('🎮')) {
      log(`${C.green}${C.bold}${text}${C.reset}`);
    } else if (text.includes('CHÚC MỪNG') || text.includes('🎉')) {
      log(`${C.yellow}${C.bold}\n✨ ${text}\n${C.reset}`);
    } else if (text.includes('❌') || text.includes('Lỗi')) {
      log(`${C.red}${text}${C.reset}`);
    } else if (text.includes('⏸️') || text.includes('⏹️') || text.includes('dừng')) {
      log(`${C.yellow}${text}${C.reset}`);
    } else {
      log(`${C.cyan}${text}${C.reset}`);
    }
  }
}

async function main() {
  console.clear();
  log(`${C.cyan}${C.bold}========================================================================${C.reset}`);
  log(`${C.cyan}${C.bold}🎮 LOWKEY DISCORD AUTO GAME VARIETY BADGE (1-CLICK RUNNER)${C.reset}`);
  log(`${C.cyan}${C.bold}🏆 TỰ ĐỘNG CÀY TIẾN TRÌNH HUY HIỆU "TRÒ CHƠI ĐA DẠNG" LÊN MỐC 100 GAMES${C.reset}`);
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
    log(`${C.yellow}[1/3] 🚀 Đang khởi động Discord Desktop với cổng kết nối tự động hoá 9222...${C.reset}`);
    killExistingDiscord();

    // Chờ 1.5s để Windows kernel giải phóng hoàn toàn socket mạng
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
    log(`${C.yellow}👉 MẸO: Bạn có thể mở Discord bình thường, nhấn Ctrl + Shift + I và dán mã scripts/game_variety_script.js trực tiếp vào tab Console!${C.reset}`);
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

      // Tìm target trang chính của Discord
      mainPage = list.find(
        (t) =>
          t.type === 'page' &&
          (t.url?.includes('discord.com') ||
            t.title?.includes('Discord') ||
            t.title === 'Bạn bè' ||
            t.title === 'Friends' ||
            t.url?.startsWith('https://'))
      );

      // Dự phòng: lấy bất kỳ trang nào có debugger url
      if (!mainPage) {
        mainPage = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      }

      if (mainPage && mainPage.webSocketDebuggerUrl) {
        break;
      } else {
        log(`${C.gray}  [${attempt}/30] Đang chờ cửa sổ chính của Discord sẵn sàng...${C.reset}`);
      }
    } catch (e) {
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
  log(`${C.yellow}[3/3] ⚡ Đang nạp mã cày huy hiệu vào Discord...${C.reset}`);
  const ws = new WebSocket(mainPage.webSocketDebuggerUrl);

  let isFinished = false;

  // Xử lý khi người dùng ấn Ctrl+C
  process.on('SIGINT', () => {
    log(`\n${C.yellow}🛑 Đang dừng cày và khôi phục cài đặt gốc của Discord...${C.reset}`);
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            id: 999,
            method: 'Runtime.evaluate',
            params: { expression: 'window.__LOWKEY_GAME_VARIETY__?.stop();' },
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
    ws.onopen = async () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));

      log(`${C.green}✅ [3/3] Đã nạp thành công! Bắt đầu cày tiến trình huy hiệu Trò chơi đa dạng...${C.reset}`);
      log(`${C.cyan}\n------------------------------------------------------------------------${C.reset}`);
      log(`${C.cyan}${C.bold}🚀 TIẾN TRÌNH ĐANG CHẠY (BẠN SẼ THẤY CỬA SỔ OVERLAY NHỎ TRONG DISCORD):${C.reset}`);
      log(`${C.cyan}💡 Mỗi game sẽ chạy 20 giây để Discord ghi nhận heartbeat.${C.reset}`);
      log(`${C.cyan}👉 Nhấn Ctrl + C tại đây để dừng bất kỳ lúc nào.${C.reset}`);
      log(`${C.cyan}------------------------------------------------------------------------\n${C.reset}`);

      ws.send(
        JSON.stringify({
          id: 100,
          method: 'Runtime.evaluate',
          params: { expression: VARIETY_SCRIPT, awaitPromise: true },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method === 'Runtime.consoleAPICalled') {
          printFormattedLog(data.params.args);
        }
      } catch (err) {}
    };

    ws.onerror = (err) => {
      log(`${C.red}❌ Lỗi kết nối WebSocket: ${err.message}${C.reset}`);
      reject(err);
    };

    // Định kỳ kiểm tra cờ hoàn thành
    const checkInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            id: 200,
            method: 'Runtime.evaluate',
            params: { expression: 'window.__LOWKEY_GAME_VARIETY_FINISHED__ === true', returnByValue: true },
          })
        );
      }
    }, 3000);

    const origOnMessage = ws.onmessage;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method === 'Runtime.consoleAPICalled') {
          printFormattedLog(data.params.args);
        }
        if (data.id === 200 && data.result?.result?.value === true) {
          clearInterval(checkInterval);
          isFinished = true;
          resolve();
        }
      } catch (err) {}
    };
  });

  log(`\n${C.green}${C.bold}========================================================================${C.reset}`);
  log(`${C.green}${C.bold}🎉 HOÀN TẤT 100%! ĐÃ CHẠY ĐỦ TẤT CẢ CÁC TỰA GAME PC DETECTABLE!${C.reset}`);
  log(`${C.green}${C.bold}========================================================================${C.reset}`);
  log(`${C.white}💡 Discord sẽ đồng bộ dữ liệu phân tích và cập nhật huy hiệu Thuyết phổ quát trên hồ sơ của bạn.${C.reset}`);
  log(`${C.gray}👉 Cửa sổ sẽ tự đóng sau 10 giây (hoặc nhấn Enter để thoát)...${C.reset}\n`);

  try {
    ws.close();
  } catch {}

  await waitOrTimeout(10000);
}

async function waitOrTimeout(ms = 10000) {
  if (!process.stdin.isTTY) {
    await new Promise((r) => setTimeout(r, 2000));
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      rl.close();
      resolve();
    }, ms);

    rl.on('line', () => {
      clearTimeout(timer);
      rl.close();
      resolve();
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
