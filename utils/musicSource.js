'use strict';

const { spawn } = require('node:child_process');
const { PassThrough } = require('node:stream');
const yt = require('youtube-dl-exec');
const ffmpeg = require('ffmpeg-static');

function terminate(child, group = false) {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
  if (process.platform === 'win32') {
    // The Windows yt-dlp executable has a child process; cancel the entire tree.
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill('SIGKILL'));
  } else {
    try { if (group) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
    catch { child.kill('SIGKILL'); }
  }
}

function normalizeQuery(input) {
  const query = String(input || '').trim();
  if (!query || query.length > 500) throw new Error('Nhập tên bài hát hoặc link YouTube/SoundCloud (tối đa 500 ký tự).');
  if (/^[a-z][a-z\d+.-]*:/i.test(query)) {
    let url;
    try { url = new URL(query); } catch { throw new Error('Link bài hát không hợp lệ.'); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be',
          'soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(host)) {
      throw new Error('Chỉ hỗ trợ link HTTPS của YouTube/SoundCloud hoặc tên bài hát.');
    }
    return url.href;
  }
  return `scsearch1:${query}`;
}

const flags = { noConfig: true, noPlaylist: true, noWarnings: true, socketTimeout: 10,
  retries: 1, extractorRetries: 1, jsRuntimes: `node:${process.execPath}` };

function youtubeProxy(env = process.env) {
  if (!env.YOUTUBE_PROXY_URL) return null;
  let url;
  try { url = new URL(env.YOUTUBE_PROXY_URL); } catch { throw new Error('Cấu hình proxy YouTube không hợp lệ.'); }
  // FFmpeg and yt-dlp must use the same egress address; both support HTTP CONNECT.
  if (url.protocol !== 'http:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Proxy YouTube phải là HTTP CONNECT, dạng http://user:password@host:port.');
  }
  return url.href;
}

function sourceFlags(target, env = process.env) {
  const youtube = target.startsWith('ytsearch1:') || /^https:\/\/(?:[^/]+\.)?youtube\.com\//.test(target) || target.startsWith('https://youtu.be/');
  // The web client currently requests sign-in on server IPs. Android exposes
  // a combined audio/video fallback; FFmpeg below reads only its audio track.
  if (!youtube) return flags;
  const proxy = youtubeProxy(env);
  return { ...flags, extractorArgs: 'youtube:player_client=android;player_skip=webpage,configs',
    ...(proxy ? { proxy } : {}) };
}

function sourceErrorMessage(error) {
  const detail = String(error?.stderr || error?.message || '');
  if (/sign in to confirm|not a bot|HTTP Error 429/i.test(detail)) {
    return 'YouTube đang yêu cầu xác minh với mạng của máy chủ bot. Cần cấu hình proxy YouTube hoạt động; hãy dùng SoundCloud trong lúc chờ.';
  }
  if (/private video|members.only|age.restricted|login.required|video unavailable/i.test(detail)) {
    return 'Video này không khả dụng hoặc cần đăng nhập. Hãy chọn video công khai khác.';
  }
  if (/Cấu hình proxy|Proxy YouTube/.test(detail)) return 'Cấu hình proxy YouTube chưa hợp lệ. Quản trị viên cần kiểm tra YOUTUBE_PROXY_URL trên Railway.';
  return 'Không tải được âm thanh từ nguồn này. Thử lại sau hoặc chọn bài khác.';
}

async function resolveTrack(input) {
  const target = normalizeQuery(input);
  const extract = query => yt(query, { ...sourceFlags(query), dumpSingleJson: true, skipDownload: true },
    { timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 });
  let data;
  try { data = await extract(target); }
  catch (error) {
    if (!target.startsWith('scsearch1:')) throw error;
    data = await extract(`ytsearch1:${String(input).trim()}`);
  }
  const item = data.entries ? data.entries.find(Boolean) : data;
  if (!item?.webpage_url || item.is_live || item.live_status === 'is_live') {
    throw new Error('Không tìm thấy bài hát phù hợp. Hiện chưa hỗ trợ livestream.');
  }
  // Validate the resolved webpage as well; never accept arbitrary user-supplied URLs.
  const url = normalizeQuery(item.webpage_url);
  return { title: String(item.title || 'Bài hát').slice(0, 200), url, duration: Number(item.duration) || 0 };
}

function openAudio(track) {
  // Re-extract at playback time so queued tracks never rely on expired CDN URLs.
  const stream = new PassThrough();
  const downloader = yt.exec(track.url, { ...sourceFlags(track.url), format: 'bestaudio/best', dumpSingleJson: true, skipDownload: true },
    { timeout: 20_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024, detached: process.platform !== 'win32' });
  let encoder;
  let closed = false;
  const handlers = new Set();
  const fail = error => { if (!closed) for (const handler of handlers) handler(error); };
  downloader.then(result => {
    if (closed) return;
    const info = JSON.parse(result.stdout);
    if (!info.url || new URL(info.url).protocol !== 'https:') throw new Error('Không có nguồn âm thanh HTTPS.');
    const headers = ['User-Agent', 'Referer'].flatMap(name => {
      const value = info.http_headers?.[name];
      return value && !/[\r\n]/.test(value) ? [`${name}: ${value}\r\n`] : [];
    }).join('');
    // FFmpeg streams the CDN directly: no song files or HLS fragment files on disk.
    const proxy = sourceFlags(track.url).proxy;
    encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-rw_timeout', '15000000',
      ...(proxy ? ['-http_proxy', proxy] : []),
      ...(headers ? ['-headers', headers] : []), '-i', info.url,
      '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'] });
    encoder.on('error', fail);
    encoder.stdout.on('error', fail);
    encoder.on('close', code => { if (code && !closed) fail(new Error('Không giải mã được âm thanh.')); });
    encoder.stdout.pipe(stream);
  }).catch(fail);
  return { stream, onError: handler => handlers.add(handler), close() {
    if (closed) return;
    closed = true;
    terminate(downloader, true);
    terminate(encoder);
    downloader.stdout.destroy();
    downloader.stderr.destroy();
    encoder?.stdout.destroy();
    stream.destroy();
  } };
}

module.exports = { normalizeQuery, resolveTrack, openAudio, sourceFlags, sourceErrorMessage };
