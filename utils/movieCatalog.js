'use strict';

// Durations measured from the media files, not inferred from scheduled show slots.
// Matching file size avoids reusing an old duration if a video is replaced.
const movies = new Map([
  ['Bẫy Tiền Vietsub - Motchill.mp4', { title: 'Bẫy Tiền', size: 1027658862, durationSeconds: 6530 }],
  ['Phí Phông- Quỷ Máu Rừng Thiêng Vietsub - Motchill.mp4', { title: 'Phí Phông – Quỷ Máu Rừng Thiêng', size: 2106145509, durationSeconds: 7241 }],
  ['thanh-xuan-18-2.mp4', { title: 'Thanh Xuân 18x2', size: 1045179373, durationSeconds: 7442 }],
]);

function movieDetails(key, size, fallbackTitle) {
  let name = String(key || '').split('/').pop();
  try { name = decodeURIComponent(name); } catch {}
  name = name.normalize('NFC');
  const known = movies.get(name);
  const title = known?.title || fallbackTitle || name.replace(/\.[^.]+$/, '')
    .replace(/(?:\s|[-_.])+(?:vietsub|thuyết minh|motchill)\b.*$/iu, '')
    .replace(/[-_.]+/g, ' ').trim()
    .replace(/(^|\s)\p{L}/gu, c => c.toLocaleUpperCase('vi')) || 'Phim không tên';
  return { title, durationSeconds: known && Number(size) === known.size ? known.durationSeconds : null };
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Chưa cập nhật';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const remainder = total % 60;
  const pad = n => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours} giờ ${pad(minutes)} phút ${pad(remainder)} giây`;
  }
  return [minutes ? `${minutes} phút` : '', `${remainder} giây`].filter(Boolean).join(' ') || '0 giây';
}

module.exports = { movieDetails, formatDuration };
