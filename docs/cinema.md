# VNL Cinema — Premium

## Phạm vi

Cinema tích hợp vào dashboard hiện có, lưu cấu hình trong `guild_settings` bằng khóa `CINEMA_CONFIG` theo từng guild. Không sửa dữ liệu level, ticket, role hay hệ thống phát nhạc/voice. Chưa truy cập được ZIP trong hội thoại cũ; đây là triển khai mới dựa trên repository hiện tại.

Admin chỉnh tên rạp, giới thiệu, bật/tắt, đối tượng xem, role, xác nhận quyền trình chiếu và tối đa 20 suất chiếu. Mỗi suất có tiêu đề, URL MP4/WebM, giờ bắt đầu/kết thúc. Giờ nhập theo thiết bị, lưu UTC. Không nhận lịch chồng nhau, suất dài quá 24 giờ, URL ngoài kho đã duyệt hoặc liên kết chứa credentials/query. Chưa hỗ trợ HLS, DRM, tải video lên, YouTube/Netflix, host điều khiển pause/seek chung hay thanh toán Premium. Premium là danh mục quản trị, không phải paywall.

Activity tự đồng bộ vị trí theo đồng hồ server, cập nhật mỗi 5 giây; người vào muộn xem cùng thời điểm. Âm thanh ban đầu tắt để tương thích autoplay; người xem có thể bật âm thanh hoặc bấm bắt đầu. Khi không xác thực được quyền hoặc mất kết nối, player dừng và xóa nguồn cũ. Session tối đa một giờ, cần mở lại Activity khi hết hạn hoặc sau restart.

## Phân quyền và bảo mật

- API `/api/guilds/:guildId/premium/cinema` kiểm tra lại danh sách guild từ OAuth Discord cho mỗi request, dùng quyền Administrator (`8`) hoặc chủ guild (có toàn quyền). Manage Server (`32`) và chủ bot không được bypass. POST yêu cầu Origin và CSRF token của session dashboard.
- URL trực tiếp `/premium/guilds/:guildId/cinema` cũng kiểm tra backend trước khi trả HTML. JavaScript/CSS chung là tài sản công khai, không chứa cấu hình hoặc secrets. Sidebar Premium chỉ hiện khi đã tải được một guild quản trị.
- OAuth Activity đổi code tại backend; token người dùng ngắn hạn chỉ trả để gọi SDK authenticate. Bot token/client secret không trả về frontend. Viewer dùng bearer session riêng, không dùng cookie dashboard và không cấp quyền sửa cấu hình.
- Mỗi lần đọc trạng thái xem đều force-fetch thành viên Discord, kiểm tra guild, Cinema bật/tắt và role. Administrator được xem trong chế độ role; chế độ members yêu cầu thành viên guild. Guild từ client chỉ là bộ chọn, không phải chứng cứ xác thực. Không yêu cầu chung voice channel: quyền xem áp dụng cho toàn guild theo cấu hình.
- Giới hạn request/session, JSON 16 KiB, kiểm tra input và revision chống ghi đè giữa hai admin. Nguồn video không được server tải/proxy tùy ý. CSP iframe chỉ mở cho trang Activity; dashboard giữ frame-ancestors none.
- Media là tệp được truy cập qua CDN/Discord URL mapping. Quyền xem bảo vệ API/lịch và player, **không phải DRM hay bảo vệ URL video công khai**. Người đã biết URL có thể truy cập ngoài player. Không đặt video bí mật cần phân quyền CDN trong kho này; signed URL/per-user media gateway là phần mở rộng chưa có.
- Chỉ dùng video tự sở hữu hoặc được cấp phép trình chiếu. Checkbox là xác nhận của admin, không tự xác minh giấy phép.

## Cấu hình và build

1. Dùng cùng ứng dụng Discord với bot: `CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `TOKEN`; giữ `DASHBOARD_ENABLED=true`, `DASHBOARD_URL=https://<domain>` và volume DB hiện có. Không đưa secrets vào Git hoặc frontend.
2. Cài/build từ gốc repository (Node 24):

   ```powershell
   npm --prefix activity ci --include=dev
   npm run build
   npm run check
   node tests/cinema.cjs
   npm test
   ```

   Đã tạo `activity/package-lock.json` và build bundle thành công. Dockerfile dùng npm ci cho cả root và Activity. Commit lockfile cùng mã nguồn. Bundle `activity/dist` được sinh lúc build, không chứa secrets và không commit. Sau khi checkout local phải cài/build Activity trước khi chạy.

3. Đặt `CINEMA_MEDIA_ORIGIN=https://<media-host>`: origin HTTPS, không path, không credentials. Kho video có thể đặt phim theo đường dẫn con, phải trả Content-Type phù hợp và hỗ trợ byte Range để tua. Tránh redirect sang host khác.
4. Trong Discord Developer Portal, bật Activities cho cùng app và cấu hình URL mappings, với domain HTTPS thật của dashboard:

   | Prefix | Target |
   | --- | --- |
   | `/` | `<dashboard-host>/activity` |
   | `/activity` | `<dashboard-host>/activity` |
   | `/cinema-api` | `<dashboard-host>/cinema-api` |
   | `/media` | `<media-host>` |

   Root mapping mở HTML Activity; mapping riêng cho assets/API tránh rơi vào dashboard. Frontend dùng đường dẫn `/.proxy/...` qua proxy Discord. Không map media tới host tùy ý do người xem gửi. Xác minh các path target trong Developer Portal và network tab trước khi mở rộng cho thành viên.
5. Giữ redirect dashboard `<DASHBOARD_URL>/auth/callback`. OAuth qua Embedded App SDK dùng authorize/authenticate và đổi code server-side; không đưa redirect dashboard vào exchange Activity. Discord yêu cầu app có redirect URI cấu hình.
6. Sau khi build và Portal sẵn sàng, đặt `CINEMA_ENABLED=true`. Lần đăng ký lệnh tiếp theo sẽ thêm entry point type 4/handler 2 để Discord tự mở Activity; các slash command cũ được giữ trong cùng danh sách. Chỉ bật sau khi app có Activities, nếu không Discord có thể từ chối bulk command registration. Đây là thay đổi deploy thật; chưa chạy trong phiên kiểm thử.
7. Admin đăng nhập dashboard → chọn guild → Premium → VNL Cinema → cấu hình quyền xem và suất chiếu → lưu. Trong Discord mở App Launcher → ứng dụng → Cinema. Các Activity chưa phân phối có thể chỉ mở được bởi developer/team; kiểm tra thiết lập phân phối của app.
8. Giữ một replica (session in-memory và SQLite hiện có). Không chạy bản bot thứ hai với token production để test.

## Checklist kiểm tra thật trước deploy

- Build bundle thành công, tải `/activity/`, `/activity/main.js`, `/activity/style.css` qua Discord proxy; dashboard không bị nhúng iframe.
- Admin vào Premium; thành viên thường/Manage Server bị 403 khi gọi GET/POST và URL trực tiếp. Bỏ quyền admin khi session đang mở cũng bị chặn.
- Hai tài khoản vào cùng suất: thời điểm khớp; đổi role/đá khỏi server/tắt Cinema thì player dừng ở lần refresh tiếp theo. Viewer bearer không dùng được API admin.
- Video có âm thanh sau thao tác người dùng, tua theo lịch hoạt động; thử desktop, web và mobile. Kiểm tra lịch qua múi giờ, hết suất, refresh và restart.
- Chạy smoke test level/ticket/voice/role sau deploy. Không coi kiểm thử mock là xác nhận hoạt động Discord thực tế.

## Nguồn kỹ thuật

- [Discord: Building an Activity](https://docs.discord.com/developers/activities/building-an-activity)
- [Embedded App SDK](https://github.com/discord/embedded-app-sdk)
- [Entry Point commands](https://docs.discord.com/developers/interactions/application-commands#entry-point-commands)
