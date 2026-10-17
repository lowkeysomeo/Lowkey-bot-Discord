'use strict';

/**
 * Lowkey Discord Auto Quest - 1-Click Desktop Runner
 * Chạy tự động 100% - Không cần mở DevTools Console, không cần gõ lệnh hay nhập token thủ công
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const readline = require('node:readline');
const { QUEST_SCRIPT } = require('../utils/questManager');

const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'data', 'saved_quest_token.txt');

// Màu sắc ANSI cho cửa sổ dòng lệnh
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

function loadSavedToken() {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      const data = fs.readFileSync(TOKEN_CACHE_PATH, 'utf8').trim();
      if (data && data.length > 20) return data;
    }
  } catch {}
  return null;
}

function findDiscordExe() {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
  const discordBase = path.join(localAppData, 'Discord');

  if (fs.existsSync(discordBase)) {
    const entries = fs.readdirSync(discordBase);
    const appDirs = entries.filter((e) => e.startsWith('app-')).sort().reverse();
    for (const appDir of appDirs) {
      const targetExe = path.join(discordBase, appDir, 'Discord.exe');
      if (fs.existsSync(targetExe)) return targetExe;
    }
    const defaultExe = path.join(discordBase, 'Discord.exe');
    if (fs.existsSync(defaultExe)) return defaultExe;
  }
  return null;
}

async function isPortOpen() {
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

function cleanConsoleArg(arg) {
  if (typeof arg !== 'string') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  // Loại bỏ các định dạng CSS console (%c, color: ..., font-weight: ...)
  return arg.replace(/%c/g, '').trim();
}

function printFormattedLog(args) {
  if (!args || args.length === 0) return;
  // Bỏ qua các đối số định dạng css console (ví dụ "color: red; font-weight: bold")
  const filtered = args
    .map((a) => cleanConsoleArg(a.value ?? a))
    .filter((a) => a && !a.startsWith('color:') && !a.startsWith('font-') && !a.startsWith('background:'));

  const text = filtered.join(' ');
  if (!text) return;

  // Chỉ hiển thị các thông báo từ hệ thống Auto Quest, bỏ qua log rác nội bộ của Discord
  const isQuestLog =
    text.includes('[Lowkey Quest]') ||
    text.includes('[TỰ NHẬN') ||
    text.includes('[Video') ||
    text.includes('[Game') ||
    text.includes('[Tiến độ') ||
    text.includes('[Giả lập]') ||
    text.includes('[HOÀN TẤT') ||
    text.includes('[NHẬN THƯỞNG') ||
    text.includes('[CHÚC MỪNG]') ||
    text.includes('[LƯU Ý]') ||
    text.includes('↪') ||
    text.includes('[Lỗi]') ||
    text.includes('[BỎ QUA') ||
    text.includes('[HOẠT ĐỘNG') ||
    text.includes('[CẢNH BÁO') ||
    text.includes('⚠️');

  if (!isQuestLog) return;

  if (text.includes('[TỰ NHẬN]')) {
    log(`${C.yellow}${C.bold}${text}${C.reset}`);
  } else if (text.includes('[TỰ NHẬN THÀNH CÔNG]') || text.includes('[HOÀN TẤT]') || text.includes('[NHẬN THƯỞNG THÀNH CÔNG]')) {
    log(`${C.green}${C.bold}${text}${C.reset}`);
  } else if (text.includes('[Tiến độ') || text.includes('[Video') || text.includes('[Game') || text.includes('↪')) {
    log(`${C.cyan}${text}${C.reset}`);
  } else if (text.includes('[CHÚC MỪNG]')) {
    log(`${C.green}${C.bold}\n✨ ${text}${C.reset}`);
  } else if (text.includes('[Lỗi]') || text.includes('Không thể')) {
    log(`${C.red}${text}${C.reset}`);
  } else if (text.includes('[BỎ QUA') || text.includes('[HOẠT ĐỘNG') || text.includes('[CẢNH BÁO') || text.includes('[LƯU Ý]')) {
    log(`${C.yellow}${C.bold}${text}${C.reset}`);
  } else if (text.includes('[Lowkey Quest]') || text.includes('[Giả lập]')) {
    log(`${C.magenta}${text}${C.reset}`);
  } else {
    log(`${C.white}${text}${C.reset}`);
  }
}

async function main() {
  console.clear();
  log(`${C.cyan}${C.bold}==============================================================${C.reset}`);
  log(`${C.cyan}${C.bold}🔮 LOWKEY DISCORD AUTO QUEST & ORB HUNTER (1-CLICK RUNNER)${C.reset}`);
  log(`${C.cyan}${C.bold}==============================================================${C.reset}\n`);

  const savedToken = loadSavedToken();
  const discordExe = findDiscordExe();

  if (!discordExe) {
    log(`${C.red}❌ Không tìm thấy Discord Desktop trên máy tính! Vui lòng cài đặt Discord Desktop.${C.reset}`);
    await waitExit();
    return;
  }

  // BƯỚC 1: KIỂM TRA & KHỞI CHẠY DISCORD DESKTOP
  log(`${C.yellow}[1/4] 🔍 Đang kiểm tra kết nối Discord Desktop...${C.reset}`);
  let portReady = await isPortOpen();

  if (!portReady) {
    log(`${C.yellow}[1/4] 🚀 Đang khởi chạy Discord Desktop với chế độ tự động hoá...${C.reset}`);
    try {
      execSync('taskkill /F /IM Discord.exe', { stdio: 'ignore' });
    } catch {}

    const child = spawn(discordExe, ['--remote-debugging-port=9222'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await isPortOpen()) {
        portReady = true;
        break;
      }
    }
  }

  if (!portReady) {
    log(`${C.red}❌ Không thể kết nối với Discord Desktop qua cổng 9222. Hãy thử đóng hẳn Discord rồi mở lại.${C.reset}`);
    await waitExit();
    return;
  }

  log(`${C.green}✅ [1/4] Discord Desktop đã sẵn sàng!${C.reset}`);

  // BƯỚC 2: TÌM CỬA SỔ DISCORD CHÍNH
  log(`${C.yellow}[2/4] ⏳ Đang kết nối tới giao diện Discord...${C.reset}`);
  let mainPage = null;

  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      const list = await res.json();
      mainPage = list.find((t) => t.type === 'page' && t.url && t.url.includes('discord.com'));
      if (mainPage && mainPage.webSocketDebuggerUrl) break;
    } catch (e) {}
  }

  if (!mainPage) {
    log(`${C.red}❌ Không tìm thấy cửa sổ chính của Discord. Hãy đảm bảo Discord đang mở.${C.reset}`);
    await waitExit();
    return;
  }

  log(`${C.green}✅ [2/4] Đã kết nối cửa sổ Discord (${mainPage.title || 'Discord App'})!${C.reset}`);

  // BƯỚC 3: KẾT NỐI WEBSOCKET DEVTOOLS
  log(`${C.yellow}[3/4] ⚡ Đang khởi tạo bộ nạp script tự động...${C.reset}`);
  const ws = new WebSocket(mainPage.webSocketDebuggerUrl);

  let isFinished = false;

  await new Promise((resolve, reject) => {
    ws.onopen = async () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));

      // Tự động xử lý đăng nhập nếu đang ở trang Login và có Token đã lưu
      if (mainPage.url.includes('/login') && savedToken) {
        log(`${C.yellow}🔑 Đang tự động đăng nhập Discord bằng Token đã lưu...${C.reset}`);
        const loginExpr = `
          (() => {
            const token = ${JSON.stringify(savedToken)};
            setInterval(() => {
              try {
                document.body.appendChild(document.createElement('iframe')).contentWindow.localStorage.token = JSON.stringify(token);
              } catch (e) {}
            }, 50);
            setTimeout(() => {
              window.location.href = 'https://discord.com/channels/@me';
            }, 1200);
          })()
        `;
        ws.send(JSON.stringify({ id: 99, method: 'Runtime.evaluate', params: { expression: loginExpr } }));
        await new Promise((r) => setTimeout(r, 3500));
      }

      log(`${C.green}✅ [3/4] Đã nạp thành công! Bắt đầu quét và làm nhiệm vụ...${C.reset}`);
      log(`${C.cyan}\n--------------------------------------------------------------${C.reset}`);
      log(`${C.cyan}${C.bold}[4/4] 🚀 TIẾN TRÌNH TỰ ĐỘNG LÀM VÀ NHẬN THƯỞNG ORB:${C.reset}`);
      log(`${C.cyan}--------------------------------------------------------------${C.reset}\n`);

      ws.send(
        JSON.stringify({
          id: 100,
          method: 'Runtime.evaluate',
          params: { expression: QUEST_SCRIPT, awaitPromise: true },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method === 'Runtime.consoleAPICalled') {
          printFormattedLog(data.params.args);
        }
        if (data.id === 100) {
          isFinished = true;
          resolve();
        }
      } catch (err) {}
    };

    ws.onerror = (err) => {
      log(`${C.red}❌ Lỗi kết nối WebSocket: ${err.message}${C.reset}`);
      reject(err);
    };

    // Kiểm tra định kỳ cờ hoàn thành từ Discord
    const checkInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            id: 200,
            method: 'Runtime.evaluate',
            params: { expression: 'window.__LOWKEY_QUEST_FINISHED__ === true', returnByValue: true },
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
        if (data.id === 100) {
          clearInterval(checkInterval);
          isFinished = true;
          resolve();
        }
      } catch (err) {}
    };
  });

  log(`\n${C.green}${C.bold}==============================================================${C.reset}`);
  log(`${C.green}${C.bold}🎉 HOÀN TẤT 100%! TẤT CẢ NHIỆM VỤ ĐÃ ĐƯỢC XỬ LÝ & NHẬN THƯỞNG!${C.reset}`);
  log(`${C.green}${C.bold}==============================================================${C.reset}`);
  log(`${C.white}💡 Bạn có thể vào Cài đặt -> Nhiệm vụ (Quests) trên Discord để xem ORB và Quà.${C.reset}`);
  log(`${C.gray}👉 Cửa sổ sẽ tự đóng sau 8 giây (hoặc nhấn Enter để thoát)...${C.reset}\n`);

  try {
    ws.close();
  } catch {}

  await waitOrTimeout(8000);
}

async function waitOrTimeout(ms = 8000) {
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
