# Dùng bot trên nhiều server

Bot đăng ký lệnh toàn cục, chỉ dùng trong server đã mời bot. Chat XP, Voice XP,
bảng xếp hạng, confession và cấu hình được lưu riêng theo ID server trong SQLite.

Admin của mỗi server có thể dùng:

- `/confessionconfig channel:#confession`
- `/botconfig setting:LEVEL_CHANNEL_ID channel:#level`
- `/botconfig setting:MONTHLY_RANK_CHANNEL_ID channel:#top-thang`
- `/botconfig setting:LEVEL_ROLE_10 role:@Level10`
- `/botconfig setting:VOICE_ROLE_10 role:@Voice10`
- `/botconfig setting:VNL_BOOSTER_ROLE_ID role:@Booster`

Discord hiển thị tên tiếng Việt cho các lựa chọn setting. Chỉ chọn setting để xem
giá trị hiện tại; thêm `disable:true` để tắt mục đó. Các role top tháng cũng nằm
trong danh sách setting. Bot cần Manage Roles và role của bot cao hơn role thưởng.
Khi đổi role thưởng, các role cũ đã cấp không tự động bị thu hồi.

Server mới tự nhận XP; chưa chọn kênh thì không gửi thông báo level/tổng kết tháng.
Tháng vẫn chốt và XP tháng được reset riêng, XP tổng được giữ nguyên. Tổng kết các
tháng đã chốt khi chưa có kênh không được gửi bù sau khi chọn kênh.

`GUILD_ID` trong Railway/.env chỉ còn chỉ định server gốc cho cấu hình cũ và import
JSON cũ. Không xóa hoặc thay nó khi mời bot vào server khác. Cấu hình SQLite được
ưu tiên; các server khác không dùng chung kênh/role từ biến môi trường.

Giữ SQLite trên Volume `/data`. Không chạy thêm một bản bot bằng cùng token trên
máy cá nhân trong khi bản Railway đang chạy vì có thể xử lý sự kiện hai lần.

Khởi động sẽ đăng ký lệnh global rồi xóa bản lệnh guild cũ của server gốc để tránh
trùng lệnh. `node deploy.js` dùng cùng cơ chế. Người mời cần quyền quản lý server;
bot cần bật Public Bot để người khác mời. Không cần quyền Administrator cho bot.

Kiểm thử offline: `node tests/multiserver.cjs` (SQLite trong bộ nhớ, không đăng nhập Discord).
