const { randomUUID } = require('node:crypto');
const { mediaOrigin } = require('../utils/cinema');

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function posterFile(input) {
  if (!input || typeof input.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) fail(400, 'Dữ liệu ảnh không hợp lệ.');
  if (input.data.length > 2800000) fail(413, 'Ảnh tối đa 2 MB.');
  const bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) fail(413, 'Ảnh tối đa 2 MB.');
  let ext, type;
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) { ext = 'png'; type = 'image/png'; }
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) { ext = 'jpg'; type = 'image/jpeg'; }
  else if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) { ext = 'gif'; type = 'image/gif'; }
  else if (bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP') { ext = 'webp'; type = 'image/webp'; }
  else fail(400, 'Chỉ nhận ảnh PNG, JPG, GIF hoặc WebP.');
  return { bytes, ext, type };
}
async function uploadPoster(guildId, input, env, putObject) {
  const file = posterFile(input);
  const origin = mediaOrigin(env);
  if (!origin || !env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) fail(503, 'Chủ bot cần cấu hình kho R2 để tải ảnh. Bạn vẫn có thể nhập URL ảnh HTTPS.');
  const key = `cinema-posters/${guildId}/${randomUUID()}.${file.ext}`;
  const object = { Bucket: env.R2_BUCKET_NAME, Key: key, Body: file.bytes, ContentType: file.type, CacheControl: 'public, max-age=31536000, immutable' };
  if (putObject) await putObject(object);
  else {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, maxAttempts: 2 });
    try { await client.send(new PutObjectCommand(object), { abortSignal: AbortSignal.timeout(20000) }); }
    finally { client.destroy(); }
  }
  return { imageUrl: `${origin}/${key}` };
}
module.exports = { posterFile, uploadPoster };
