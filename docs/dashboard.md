# VietNam Legacy Dashboard

Dashboard tiếng Việt, nền tối, chạy cùng tiến trình bot và dùng chung SQLite trên Railway.
Bao gồm đăng nhập Discord, chọn server, cấu hình kênh Level/Confession, role thưởng,
Booster, role top tháng và xem bảng tổng XP. Cấu hình được áp dụng ngay sau khi lưu.

## Các mục có thể chỉnh trên dashboard

- **Mốc level & Role**: thêm mốc Chat/Voice bất kỳ (tối đa 50 mốc), chọn giữ role cao nhất hoặc giữ tất cả role đã đạt.
- **XP & Kênh bỏ qua**: bật/tắt XP Chat/Voice, đặt XP tối thiểu/tối đa, cooldown Chat, XP Voice, Booster và kênh/danh mục không tính XP.
- **Thông báo lên cấp**: chọn kênh chung hoặc riêng cho Chat/Voice, kiểu thẻ ảnh/embed/văn bản, màu, tiêu đề, nội dung và việc nhắc tên thành viên.
- **Top tháng**: bật/tắt tổng kết và chuyển role, chỉnh tiêu đề, nội dung, màu và các role Top 1/2/3.
- **Confession**: bật/tắt, cooldown, độ dài, luồng bình luận, nút thích, tiêu đề, chân trang và màu bài đăng.
- **Gửi thử**: chọn kênh nhận và gửi bản TEST theo cấu hình đã lưu. Hỗ trợ Chat/Voice với level mẫu, bảng tháng với 10 người minh họa mỗi bảng và Confession với nội dung mẫu. Bản thử không ping, không ghi XP, không trao role, không chốt tháng và không tăng số confession; nút thích bị vô hiệu hóa và không tạo luồng. Chỉ admin/owner được dùng, có CSRF và giới hạn 6 lần/phút theo người dùng/server.

Các lựa chọn được lưu riêng theo từng server trong SQLite và có hiệu lực ngay sau khi bấm **Lưu thay đổi**.

## Bật trên Railway

Thêm các biến môi trường vào đúng dịch vụ bot:

- `DASHBOARD_ENABLED=true`
- `PORT=3000` (hoặc dùng cổng Railway cung cấp)
- `DASHBOARD_URL=https://ten-website.up.railway.app`
- `DISCORD_CLIENT_SECRET`: Client Secret của ứng dụng Discord hiện có.

`CLIENT_ID`, `TOKEN` và `DB_PATH` tiếp tục dùng cấu hình của bot. Chỉ lưu Client Secret
trong Variables của Railway, không đưa vào Git hoặc frontend.

Trong Railway Settings → Networking, tạo domain trỏ tới cổng dashboard. Trong
Discord Developer Portal → OAuth2 → Redirects, thêm chính xác:

`https://ten-website.up.railway.app/auth/callback`

Chỉ cần scope `identify guilds` cho đăng nhập. Không bật Requires OAuth2 Code Grant
cho luồng mời bot. Dashboard dùng cùng ứng dụng Discord của bot.

## Quyền truy cập

- Chỉ chủ server hoặc người có quyền Administrator được xem và sửa dữ liệu server.
- Quyền được kiểm tra lại với Discord khi truy cập API của server.
- Kênh và role phải thuộc server đang được quản lý; kiểm tra quyền bot trước khi lưu.
- Phiên đăng nhập hết hạn sau tối đa một giờ và bị xóa khi bot restart.
- Session cookie là HttpOnly/SameSite; Secure trên HTTPS. Token OAuth chỉ nằm trong
  bộ nhớ máy chủ; không trả về trình duyệt, không ghi log token hoặc Client Secret.
- OAuth state được ràng buộc với trình duyệt, dùng một lần; thao tác lưu có kiểm tra
  Origin và CSRF token. Dữ liệu người dùng trong giao diện được escape HTML.
- `/health` kiểm tra web server; trang dashboard báo riêng trạng thái kết nối bot.

Giữ một replica để bot và session hoạt động nhất quán với SQLite. Tiếp tục gắn
Volume `/data`; không chạy thêm bot local cùng token để thử website.

## Kiểm tra

`node tests/dashboard.cjs` chạy OAuth/API giả lập và SQLite trong bộ nhớ, không đăng
nhập Discord thật. `node tests/multiserver.cjs` kiểm tra chức năng bot nhiều server.

`DASHBOARD_ENABLED` mặc định tắt. Nếu thiếu OAuth Client Secret hoặc URL, giao diện
đăng nhập báo đang chờ cấu hình; các API cấu hình vẫn yêu cầu đăng nhập.
