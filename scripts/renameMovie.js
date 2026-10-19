'use strict';

const { S3Client, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config();

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '64c6ad1cf148f3d10b27cc9b5ff9347c';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'vnl-cinema-2';
const PUBLIC_DOMAIN = (process.env.CINEMA_MEDIA_ORIGIN || 'https://pub-9e387f89fa4744778a8723b46d9017cf.r2.dev').replace(/\/$/, '');

async function main() {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    console.error('❌ Thiếu R2_ACCESS_KEY_ID hoặc R2_SECRET_ACCESS_KEY trong .env');
    process.exit(1);
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });

  const args = process.argv.slice(2);
  const oldKey = args[0];
  const newKey = args[1];

  if (!oldKey) {
    console.log(`\n📦 DANH SÁCH TỆP TRÊN R2 BUCKET [${BUCKET_NAME}]:`);
    const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME }));
    if (!listRes.Contents || !listRes.Contents.length) {
      console.log('  (Kho phim đang trống)');
    } else {
      listRes.Contents.forEach((o, i) => {
        console.log(`  ${i + 1}. "${o.Key}" (${(o.Size / (1024 * 1024)).toFixed(2)} MB)`);
      });
    }
    console.log('\n💡 CÁCH SỬ DỤNG:');
    console.log('  node scripts/renameMovie.js "<tên_file_cũ>" "<tên_file_mới>"\n');
    console.log('Ví dụ:');
    console.log('  node scripts/renameMovie.js "Bẫy Tiền Vietsub - Motchill.mp4" "bay-tien.mp4"\n');
    return;
  }

  if (!newKey) {
    console.error('❌ Vui lòng cung cấp cả tên file cũ và tên file mới!');
    console.log('Ví dụ: node scripts/renameMovie.js "Bẫy Tiền Vietsub - Motchill.mp4" "bay-tien.mp4"');
    process.exit(1);
  }

  // Đảm bảo có đuôi .mp4 hoặc .webm
  const targetKey = /\.(mp4|webm|mkv|mov)$/i.test(newKey) ? newKey : `${newKey}.mp4`;

  console.log(`⏳ Đang đổi tên trên Cloudflare R2...`);
  console.log(`   Từ: [${oldKey}]`);
  console.log(`   Sang: [${targetKey}]`);

  try {
    // 1. Sao chép sang key mới
    // Lưu ý: CopySource cần encodeURIComponent cho các ký tự tiếng Việt / khoảng trắng
    const copySource = `${BUCKET_NAME}/${encodeURIComponent(oldKey).replace(/%2F/g, '/')}`;
    await s3.send(new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: copySource,
      Key: targetKey,
    }));

    // 2. Xóa key cũ
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: oldKey,
    }));

    console.log(`\n✅ ĐỔI TÊN THÀNH CÔNG!`);
    console.log(`📁 Tệp mới: ${targetKey}`);
    console.log(`🔗 Link xem video mới:`);
    console.log(`   ${PUBLIC_DOMAIN}/${targetKey}\n`);
  } catch (err) {
    console.error('❌ Lỗi đổi tên trên R2:', err.message);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
