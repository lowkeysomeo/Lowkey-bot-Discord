// check.js - Kiểm tra bot trước khi push lên GitHub/Railway.
// Chạy: node check.js   (hoặc: npm run check)
//
// Script KHÔNG đăng nhập bot. Nó chỉ:
//   1. Kiểm tra cú pháp các file .js
//   2. Nạp thử từng file trong utils/ và commands/ (bắt lỗi kiểu "undefined.map" lúc khởi động)
//   3. Gọi loadCommands() giống như index.js

process.env.DB_PATH = ':memory:';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const errors = [];
const brokenSyntax = new Set();

function listJs(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];

  const files = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const filePath = path.join(full, entry.name);
    if (entry.isDirectory()) files.push(...listJs(path.relative(root, filePath)));
    else if (/\.(?:js|cjs)$/.test(entry.name)) files.push(filePath);
  }
  return files;
}

const loadFiles = [...listJs('utils'), ...listJs('commands')];

const syntaxFiles = [
  ...fs.readdirSync(root).filter(name => /\.(?:js|cjs)$/.test(name)).map(name => path.join(root, name)),
  ...listJs('dashboard'), ...listJs('tests'), ...loadFiles,
];
// 1. Cú pháp
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    brokenSyntax.add(file);
    errors.push({ file, step: 'Cú pháp', message: result.stderr.trim() });
  }
}

// 2. Nạp thử từng file
for (const file of loadFiles) {
  if (brokenSyntax.has(file)) continue;
  try {
    require(file);
  } catch (error) {
    errors.push({ file, step: 'Nạp file', message: error.stack || String(error) });
  }
}

// 3. loadCommands (giống index.js)
try {
  const commands = require('./utils/loadCommands').loadCommands();
  for (const command of commands.values()) {
    const data = typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data;
    if (!data.name || !data.description) throw new Error('Lệnh thiếu tên hoặc mô tả.');
  }
  require('./dashboard/server');
  console.log(`Nạp được ${commands.size} command.`);
} catch (error) {
  errors.push({
    file: path.join(root, 'utils', 'loadCommands.js'),
    step: 'loadCommands()',
    message: error.stack || String(error),
  });
}

// Chạy từng bộ kiểm tra bằng tiến trình riêng để không dùng chung trạng thái.
if (process.argv.includes('--tests') && errors.length === 0) {
  for (const file of listJs('tests')) {
    const result = spawnSync(process.execPath, [file], {
      encoding: 'utf8', timeout: 60000, env: { ...process.env, DB_PATH: ':memory:' },
    });
    console.log(result.stdout || '');
    if (result.status !== 0) errors.push({ file, step: 'Kiểm thử', message: result.stderr || result.error?.message || 'Tiến trình kiểm tra thất bại.' });
  }
}

// Kết quả
if (errors.length === 0) {
  console.log('\nOK: không phát hiện lỗi nào. Có thể push.');
} else {
  console.log(`\nPHÁT HIỆN ${errors.length} LỖI:\n`);
  for (const { file, step, message } of errors) {
    console.log(`--- [${step}] ${path.relative(root, file)}`);
    console.log(message.split('\n').slice(0, 6).join('\n'));
    console.log('');
  }
}

// Thoát hẳn để các timer/kết nối do file nạp lên không giữ tiến trình
process.exit(errors.length ? 1 : 0);
