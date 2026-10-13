'use strict';

/**
 * utils/spotifySource.js
 * Xử lý giải mã link Spotify (Track, Playlist, Album) từ Spotify Embed Next Data.
 * Hoạt động độc lập, không yêu cầu API key phức tạp, tự động cập nhật khi playlist có bài mới.
 */

function isSpotifyUrl(input) {
  if (!input || typeof input !== 'string') return false;
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase();
    return ['open.spotify.com', 'spotify.link', 'spotify.com'].includes(host);
  } catch {
    return false;
  }
}

function parseSpotifyUrl(input) {
  const url = new URL(input.trim());
  const parts = url.pathname.split('/').filter(Boolean);
  // Ví dụ: /track/4cOdK2wGLETKBW3PvgPWqT hoặc /intl-vi/track/...
  let type = null;
  let id = null;

  for (let i = 0; i < parts.length; i++) {
    if (['track', 'playlist', 'album'].includes(parts[i]) && parts[i + 1]) {
      type = parts[i];
      id = parts[i + 1].split('?')[0];
      break;
    }
  }

  return { type, id, originalUrl: url.href };
}

async function fetchSpotifyData(type, id) {
  const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
  const response = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Không thể kết nối tới Spotify (HTTP ${response.status}). Vui lòng kiểm tra lại link.`);
  }

  const text = await response.text();
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    throw new Error('Không trích xuất được dữ liệu từ link Spotify này. Có thể bài hát/playlist ở chế độ riêng tư.');
  }

  const start = idx + marker.length;
  const end = text.indexOf('</script>', start);
  const jsonStr = text.slice(start, end);
  const data = JSON.parse(jsonStr);
  const entity = data.props?.pageProps?.state?.data?.entity;

  if (!entity) {
    throw new Error('Dữ liệu bài hát hoặc playlist trên Spotify không tồn tại hoặc đã bị xóa.');
  }

  return entity;
}

/**
 * Lấy thông tin 1 bài hát Spotify
 */
async function getSpotifyTrack(id) {
  const entity = await fetchSpotifyData('track', id);
  const title = entity.name || 'Bài hát Spotify';
  const artist = entity.artists?.map(a => a.name).join(', ') || '';
  const fullName = artist ? `${title} - ${artist}` : title;
  const duration = Math.round((Number(entity.duration) || 0) / 1000);

  return {
    isSpotify: true,
    title: fullName,
    query: `${title} ${artist}`.trim(),
    duration,
    uri: entity.uri || `spotify:track:${id}`,
  };
}

/**
 * Lấy danh sách bài hát trong Playlist hoặc Album Spotify
 */
async function getSpotifyCollection(type, id, originalUrl) {
  const entity = await fetchSpotifyData(type, id);
  const name = entity.name || (type === 'album' ? 'Album Spotify' : 'Playlist Spotify');
  const trackList = entity.trackList || [];

  if (!trackList.length) {
    throw new Error(`Danh sách "${name}" trên Spotify hiện đang trống.`);
  }

  const tracks = trackList.slice(0, 50).map(t => {
    const title = t.title || 'Bài hát Spotify';
    const artist = t.subtitle || '';
    const fullName = artist ? `${title} - ${artist}` : title;
    const duration = Math.round((Number(t.duration) || 0) / 1000);

    return {
      isSpotify: true,
      title: fullName,
      query: `${title} ${artist}`.trim(),
      duration,
      uri: t.uri || `spotify:track:${t.title}`,
      fromPlaylist: name,
    };
  });

  return {
    isCollection: true,
    type,
    id,
    url: originalUrl,
    name,
    totalCount: trackList.length,
    tracks,
  };
}

/**
 * Giải quyết bất kỳ link Spotify nào (Track, Album, Playlist)
 */
async function resolveSpotify(url) {
  const parsed = parseSpotifyUrl(url);
  if (!parsed.type || !parsed.id) {
    throw new Error('Link Spotify không hợp lệ. Hãy dùng link dạng open.spotify.com/track/... hoặc playlist/...');
  }

  if (parsed.type === 'track') {
    return getSpotifyTrack(parsed.id);
  }

  return getSpotifyCollection(parsed.type, parsed.id, parsed.originalUrl);
}

/**
 * Kiểm tra xem Playlist Spotify có bài hát mới vừa được thêm vào không
 */
async function checkNewTracksInPlaylist(collectionUrl, existingUris) {
  try {
    const parsed = parseSpotifyUrl(collectionUrl);
    if (!parsed.type || !parsed.id) return [];

    const entity = await fetchSpotifyData(parsed.type, parsed.id);
    const trackList = entity.trackList || [];

    const newTracks = [];
    for (const t of trackList) {
      const uri = t.uri || `spotify:track:${t.title}`;
      if (!existingUris.has(uri)) {
        const title = t.title || 'Bài hát Spotify';
        const artist = t.subtitle || '';
        const fullName = artist ? `${title} - ${artist}` : title;
        const duration = Math.round((Number(t.duration) || 0) / 1000);

        newTracks.push({
          isSpotify: true,
          title: fullName,
          query: `${title} ${artist}`.trim(),
          duration,
          uri,
          fromPlaylist: entity.name || 'Playlist Spotify',
        });
      }
    }

    return newTracks;
  } catch (err) {
    console.warn('[SPOTIFY SYNC ERROR]', err.message);
    return [];
  }
}

module.exports = {
  isSpotifyUrl,
  parseSpotifyUrl,
  resolveSpotify,
  checkNewTracksInPlaylist,
};
