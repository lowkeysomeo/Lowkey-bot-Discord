const fs = require('node:fs');
const path = require('node:path');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
require('dotenv').config();

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '64c6ad1cf148f3d10b27cc9b5ff9347c';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'vnl-cinema';
const PUBLIC_DOMAIN = process.env.CINEMA_MEDIA_ORIGIN || 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev';

async function uploadMovie(filePath, customKey) {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    console.error('❌ Thiếu R2_ACCESS_KEY_ID hoặc R2_SECRET_ACCESS_KEY trong .env');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Không tìm thấy file: ${filePath}`);
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  const totalBytes = stat.size;
  const fileName = customKey || path.basename(filePath)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

  console.log(`🎬 Bắt đầu upload: ${path.basename(filePath)}`);
  console.log(`📦 Tên lưu trên kho: ${fileName}`);
  console.log(`📊 Dung lượng: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });

  const fileStream = fs.createReadStream(filePath);
  const parallelUploads = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileStream,
      ContentType: fileName.endsWith('.webm') ? 'video/webm' : 'video/mp4',
    },
    partSize: 10 * 1024 * 1024, // 10MB chunks
    queueSize: 4,
  });

  let lastPct = 0;
  parallelUploads.on('httpUploadProgress', progress => {
    if (progress.loaded && totalBytes) {
      const pct = Math.round((progress.loaded / totalBytes) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        process.stdout.write(`\r🚀 Tiến độ upload: ${pct}% [${(progress.loaded / (1024 * 1024)).toFixed(1)}MB / ${(totalBytes / (1024 * 1024)).toFixed(1)}MB]`);
      }
    }
  });

  await parallelUploads.done();
  console.log('\n\n✅ Tải phim lên Cloudflare R2 thành công!');
  const finalUrl = `${PUBLIC_DOMAIN.replace(/\/$/, '')}/${fileName}`;
  console.log(`🔗 Link phim của bạn để dán vào Dashboard:\n👉 ${finalUrl}\n`);
  return finalUrl;
}

if (require.main === module) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.log('Cách dùng: node scripts/uploadMovie.js "<duong_dan_file_phim>" [ten_tren_kho.mp4]');
    process.exit(1);
  }
  uploadMovie(targetFile, process.argv[3]).catch(err => {
    console.error('\n❌ Lỗi khi tải lên:', err.message);
    process.exit(1);
  });
}

module.exports = { uploadMovie };
