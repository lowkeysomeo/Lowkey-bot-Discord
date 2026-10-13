'use strict';

const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTS = new Set(['.mp3', '.mp4', '.m4a', '.wav', '.ogg', '.flac', '.webm', '.aac']);

/**
 * Lấy danh sách các thư mục chứa nhạc (cả thư mục repo lẫn volume Railway)
 */
function getMusicDirectories() {
  const dirs = [];
  const localDir = path.join(process.cwd(), 'data', 'local_music');
  if (fs.existsSync(localDir)) dirs.push(localDir);

  const railwayDir = '/data';
  if (fs.existsSync(railwayDir)) {
    const p = path.join(railwayDir, 'local_music');
    if (!fs.existsSync(p)) {
      try { fs.mkdirSync(p, { recursive: true }); } catch {}
    }
    if (fs.existsSync(p) && p !== localDir) dirs.push(p);
  }

  if (!dirs.length) {
    try { fs.mkdirSync(localDir, { recursive: true }); } catch {}
    dirs.push(localDir);
  }
  return dirs;
}

/**
 * Thư mục ưu tiên để lưu trữ khi tải file mới lên qua Discord
 */
function getUploadDirectory() {
  const railwayDir = '/data';
  if (fs.existsSync(railwayDir)) {
    const p = path.join(railwayDir, 'local_music');
    if (!fs.existsSync(p)) {
      try { fs.mkdirSync(p, { recursive: true }); } catch {}
    }
    return p;
  }
  const localDir = path.join(process.cwd(), 'data', 'local_music');
  if (!fs.existsSync(localDir)) {
    try { fs.mkdirSync(localDir, { recursive: true }); } catch {}
  }
  return localDir;
}

/**
 * Lấy danh sách tất cả các bài nhạc có sẵn trong kho (gộp từ các thư mục)
 */
function listTracks() {
  const dirs = getMusicDirectories();
  const tracksMap = new Map();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) continue;
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
        const nameWithoutExt = path.basename(file, ext);
        if (!tracksMap.has(file)) {
          tracksMap.set(file, {
            id: file,
            filename: file,
            title: nameWithoutExt,
            ext,
            sizeBytes: stat.size,
            sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
            filePath: fullPath,
          });
        }
      } catch {}
    }
  }

  return [...tracksMap.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Tìm bài hát theo tên hoặc id (không phân biệt hoa thường)
 */
function findTrack(query) {
  const tracks = listTracks();
  if (!tracks.length) return null;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;

  // 1. Khớp chính xác ID hoặc tên file
  const exact = tracks.find(t => t.id.toLowerCase() === q || t.filename.toLowerCase() === q);
  if (exact) return exact;

  // 2. Khớp chính xác tiêu đề
  const exactTitle = tracks.find(t => t.title.toLowerCase() === q);
  if (exactTitle) return exactTitle;

  // 3. Khớp một phần tiêu đề
  const partial = tracks.find(t => t.title.toLowerCase().includes(q));
  return partial || null;
}

/**
 * Chuyển track info thành đối tượng tương thích với musicSystem
 */
function toMusicTrack(trackInfo) {
  if (!trackInfo) return null;
  return {
    title: `[Local] ${trackInfo.title}`,
    url: `local:${trackInfo.filename}`,
    filePath: trackInfo.filePath,
    isLocal: true,
    duration: 0,
  };
}

/**
 * Tải file nhạc từ URL (Discord Attachment) và lưu vào kho nhạc
 */
async function saveTrackFromUrl(downloadUrl, originalFilename, customName = null) {
  const ext = path.extname(originalFilename || '').toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) {
    throw new Error(`Định dạng "${ext || 'không rõ'}" không được hỗ trợ. Các định dạng hợp lệ: ${[...SUPPORTED_EXTS].join(', ')}`);
  }

  const baseRaw = (customName && String(customName).trim())
    ? String(customName).trim()
    : path.basename(originalFilename, ext);

  const safeBaseName = baseRaw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'bai_hat';
  const filename = `${safeBaseName}${ext}`;
  const dir = getUploadDirectory();
  const targetPath = path.join(dir, filename);

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Không thể tải file từ Discord (HTTP ${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(targetPath, buffer);

  const stat = fs.statSync(targetPath);
  return {
    id: filename,
    filename,
    title: safeBaseName,
    ext,
    sizeBytes: stat.size,
    sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
    filePath: targetPath,
  };
}

/**
 * Xóa một bài hát khỏi kho nhạc
 */
function deleteTrack(filenameOrQuery) {
  const track = findTrack(filenameOrQuery);
  if (!track) return null;
  if (fs.existsSync(track.filePath)) {
    fs.unlinkSync(track.filePath);
    return track;
  }
  return null;
}

module.exports = {
  SUPPORTED_EXTS,
  getMusicDirectory: getUploadDirectory,
  getMusicDirectories,
  getUploadDirectory,
  listTracks,
  findTrack,
  toMusicTrack,
  saveTrackFromUrl,
  deleteTrack,
};
