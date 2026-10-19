# Rà soát và sửa Cinema — 19/10/2026

## Các lỗi đã sửa

- Chặn thành viên thường, người đã rời guild và guild khác gọi API kết thúc suất chiếu. Chỉ Administrator/chủ guild được tua, bắt đầu hoặc kết thúc; tên role Staff/Admin và Manage Server không đủ quyền.
- Video kết thúc trên thiết bị người xem chỉ đóng player của người đó, không dừng cả phòng. Trạng thái kết thúc cục bộ được giữ để lần polling kế tiếp không tải và phát lại chính tệp vừa hết.
- Mất quyền xem/phiên hết hạn dừng media ngay; lỗi mạng ngắn vẫn giữ video, lỗi kéo dài trên 30 giây (được kiểm tra khi request polling hoàn tất) sẽ đóng nguồn. Phiên có thể tự xác thực lại qua SDK.
- Tua video lưu vị trí phát riêng, giữ nguyên startsAt/endsAt để không phá lịch kế tiếp và không tạo lại thông báo hoặc tải lại video. Giới hạn tua trong thời lượng suất chiếu.
- Phòng trống không tự lấy phim của phòng khác. Không fallback phòng 2/3 vào phòng 1 hoặc tìm ngoài category đã cấu hình.
- Dọn Cinema chỉ hủy connection do Cinema sở hữu, không hủy kết nối nhạc khác đang chạy. Không tự mở ViewChannel/Connect của category/kênh riêng tư; quyền đã được admin cấu hình trước đó được giữ.
- Thông báo bắt đầu/nhắc lịch chỉ ghi nhận đã gửi sau khi gửi thành công; có chặn các tick đang gửi đồng thời và thử lại khi gửi lỗi. Cùng tên phim ở hai phòng vẫn có thông báo riêng, giữ chống lặp sau restart.
- Form không tự thay revision rồi gửi lại để ghi đè cấu hình mới của admin khác. Archive/seek tăng revision; lịch sử do server quản lý.
- Lệnh phát ngay chỉ dành cho admin, kiểm tra lại member ở backend khi bấm menu, kiểm tra nguồn video, dùng khóa nguồn phim ổn định thay vì vị trí trong danh sách, không xóa các suất khác khi đạt giới hạn và không kéo dài đè suất kế tiếp.

## Ảnh riêng cho từng phim

Mỗi suất có `imageUrl`, có thể nhập URL HTTPS hoặc tải ảnh PNG/JPG/GIF/WebP tối đa 2 MB. Backend kiểm tra quyền Administrator, Origin/CSRF, giới hạn dung lượng và magic bytes; không chấp nhận SVG/HTML. Ảnh tải lên được lưu vào R2 bằng key ngẫu nhiên theo guild, không lưu vào filesystem tạm Railway.

Để tải ảnh cần các biến môi trường sẵn có của kho R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `CINEMA_MEDIA_ORIGIN`. Public origin phải trỏ tới đúng bucket lưu ảnh. Không đưa secrets vào Git. Nếu kho chưa cấu hình, form báo rõ và vẫn cho nhập URL ảnh HTTPS.

Discord hiển thị hai embed theo thứ tự **tên phim → ảnh → giờ chiếu/nội dung**. Các thông báo bắt đầu, nhắc trước và thẻ xem phim đều dùng ảnh của suất tương ứng. Suất không có ảnh giữ thông báo một embed. Ảnh được lưu theo suất và giữ trong lịch sử/chiếu lại. Thông báo đã gửi trước bản cập nhật không được tự sửa ảnh; ảnh mới áp dụng cho thông báo gửi tiếp theo. File ảnh tải lên chưa gắn vào lịch không tự xóa; có thể quản lý vòng đời trong bucket.

## Xác minh

- `node check.js --tests` trên bản sao không có `.env` production, dùng SQLite memory: toàn bộ bộ kiểm thử đạt; script debug token được bỏ qua như thiết kế.
- Kiểm thử API: admin/viewer tách phiên, 401/403 khi thiếu quyền, CSRF, chặn kết thúc chéo guild, ảnh MIME/dung lượng, upload R2 qua adapter giả lập, archive giữ ảnh và tua giữ lịch.
- Kiểm thử scheduler: gửi lỗi rồi thử lại, hai phòng cùng tên phim, chống lặp sau restart, bố cục hai embed có ảnh, không hủy kết nối nhạc khác.
- Kiểm thử player bằng DOM/media giả lập: mất quyền, mạng chập chờn/kéo dài, hết phim cục bộ, polling không tải lại file sau tua.
- Dashboard trình duyệt local với API giả: trường ảnh hiển thị, nhập/lưu/bỏ ảnh, đúng giờ Asia/Bangkok. `npm run build` đạt.

Chưa gửi thông báo tới Discord thật, chưa upload ảnh vào bucket production và chưa xác minh phát video với hai tài khoản Discord. Cần smoke test các bước này trên guild thử nghiệm sau deploy. CDN video công khai vẫn không phải DRM; quyền API/player không thu hồi được một URL tệp đã biết.

## File thay đổi

`utils/cinema.js`, `utils/cinemaScheduler.js`, `utils/cinemaPresentation.js`, `dashboard/cinemaActivity.js`, `dashboard/cinemaPoster.js`, `dashboard/server.js`, `dashboard/public/app.js`, `dashboard/public/style.css`, `activity/src/main.js`, `commands/fun/cinema.js`, `tests/cinema.cjs`, `tests/cinemaScheduler.cjs`, `tests/cinema-player.cjs`, `docs/cinema-fixes.md`.
