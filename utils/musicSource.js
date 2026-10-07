'use strict';

const { spawn } = require('node:child_process');
const yt = require('youtube-dl-exec');
const ffmpeg = require('ffmpeg-static');

function terminate(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // The Windows yt-dlp executable has a child process; cancel the entire tree.
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill('SIGKILL'));
  } else child.kill('SIGKILL');
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

async function resolveTrack(input) {
  const target = normalizeQuery(input);
  const extract = query => yt(query, { ...flags, dumpSingleJson: true, skipDownload: true },
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
  const downloader = yt.exec(track.url, { ...flags, format: 'bestaudio/best', output: '-' },
    { buffer: false, stdio: ['ignore', 'pipe', 'pipe'] });
  const encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
    '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'] });
  let closed = false;
  const handlers = new Set();
  const fail = error => { if (!closed) for (const handler of handlers) handler(error); };
  downloader.catch(fail); // Always consume the subprocess rejection, including cancellation.
  encoder.on('error', fail);
  encoder.on('close', code => { if (code && !closed) fail(new Error('Không giải mã được âm thanh.')); });
  encoder.stdin.on('error', error => { if (error.code !== 'EPIPE') fail(error); });
  downloader.stdout.on('error', fail);
  downloader.stderr.resume();
  downloader.stdout.pipe(encoder.stdin);
  return { stream: encoder.stdout, onError: handler => handlers.add(handler), close() {
    if (closed) return;
    closed = true;
    downloader.stdout.unpipe(encoder.stdin);
    terminate(downloader);
    terminate(encoder);
    downloader.stdout.destroy();
    downloader.stderr.destroy();
    encoder.stdin.destroy();
    encoder.stdout.destroy();
  } };
}

module.exports = { normalizeQuery, resolveTrack, openAudio };
