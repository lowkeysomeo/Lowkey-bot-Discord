# Reaction role

Bảng tự nhận role bằng nút Discord, không cần bật intent reaction hoặc collector tạm. Bấm để nhận; bấm lại để bỏ. Mặc định mỗi bảng giới hạn member chỉ được chọn 1 role (chọn role khác sẽ yêu cầu bấm bỏ role cũ trước). Có thể tắt tùy chọn này nếu muốn cho phép giữ nhiều role cùng lúc.

## Thiết lập

- Dashboard → server → Reaction role: chọn kênh, tiêu đề, lời giới thiệu và các role. Dùng “Thêm role” để thêm tối đa 10 nút; tên nút hỗ trợ emoji trong văn bản. Có checkbox chọn/bỏ chế độ chỉ được pick 1 role trong bảng.
- `/reactionrole create`: tạo nhanh với tối đa 5 role. Có tùy chọn `single_choice` (mặc định: Đúng). `/reactionrole list`: xem 10 bảng hoạt động gần đây (dashboard hiển thị nhiều hơn). `/reactionrole disable id:...`: đóng bảng.
- Chỉ chủ server/admin quản lý. Bot cần Manage Roles và role cao hơn mọi role tự nhận; cần View Channel, Send Messages, Embed Links để đăng bảng.
- Không chấp nhận @everyone, role tích hợp, role ngang/trên bot hoặc quyền quản trị/điều hành. Kiểm tra lại quyền role mỗi lần member bấm.
- Nên dùng role sở thích/game/thông báo riêng với role thưởng level/top tháng. Đây là role tự do nhận/bỏ.

## Vận hành

Dữ liệu bảng, tin nhắn và nút lưu SQLite, tách theo server. Tối đa 20 bảng hoạt động/server. Bảng mới gửi với nút tắt trước rồi mới kích hoạt sau khi ghi nhận message ID. Đóng bảng không thu hồi role đã cấp. Nếu không sửa được tin Discord, backend vẫn chặn các nút của bảng đã đóng. Bảng do người khác sao chép hoặc nút từ tin/kênh/server khác không cấp role. Xử lý tuần tự để tránh bấm nhanh gây trạng thái sai. Khi bật chế độ chỉ chọn 1 role (mặc định), bot sẽ chặn không cho nhận thêm nếu thành viên đang giữ role khác thuộc cùng bảng, kèm hướng dẫn bấm bỏ role cũ trước khi đổi.

Chưa hỗ trợ reaction emoji dưới tin nhắn hoặc sửa nội dung bảng đã đăng; có thể đóng bảng cũ rồi tạo bảng mới.

Kiểm tra: `node tests/reaction-roles.cjs`, `node tests/dashboard.cjs`, `node tests/multiserver.cjs`.

Emoji: Dashboard có ô Emoji riêng, gợi ý emoji server; nhận mã <:ten:ID>, :ten:, ID hoặc một emoji Unicode. Lệnh create có emoji1–emoji5. Mã emoji nhập nhầm trong Tên nút được tách thành emoji và giữ phần chữ; nếu chỉ nhập mã, dùng tên role làm nhãn. Bot chỉ nhận custom emoji từ chính server và kiểm tra khả dụng/quyền dùng. Kiểm tra: node tests/reaction-role-emoji.cjs.
