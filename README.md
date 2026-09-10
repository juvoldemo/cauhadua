# Hải sản Cầu Hà Dừa

Web app dành cho màn hình điện thoại: gọi món theo bàn, ghi chú từng món, in bill và xác nhận thanh toán. Trang `/admin` quản lý bàn, thực đơn, ảnh và báo cáo doanh thu. Khởi tạo với 12 bàn và 55 món từ file TXT.

## Chạy app

Yêu cầu Node.js 24.x.

```sh
npm install
npm start
```

Mở http://localhost:3000. Trên điện thoại cùng Wi-Fi, mở `http://<IP-máy-chủ>:3000`. Cho phép Node.js qua firewall trong mạng riêng nếu cần. Máy chủ cần chạy liên tục. Đơn hàng giữa các điện thoại được cập nhật mỗi 4 giây. Dữ liệu lưu trong `data/orders.json`; giỏ chưa gửi lưu trong trình duyệt. Sao lưu tệp dữ liệu để giữ lịch sử.

## Deploy lên Vercel

Repo phải chứa mã nguồn, không chỉ README. Đứng tại thư mục có `package.json` và chạy:

```sh
git add .
git commit -m "Add mobile admin and restaurant reports"
git push origin main
```

`data/orders.json`, `data/images/`, `.env` và `node_modules` được bỏ qua để không đưa đơn local, ảnh tải lên hoặc thông tin kết nối lên Git.

Trong Vercel, chọn project **cauhadua**:

1. **Settings → Build and Deployment**: Root Directory là thư mục chứa `package.json` (để mặc định nếu file nằm ngay gốc repo). Framework Preset là **Express**. Tắt các override Build Command và Output Directory cũ; không đặt `public` làm Root Directory. `vercel.json` khai báo framework và đường dẫn trang chủ.
2. Kết nối database PostgreSQL, ví dụ Neon qua Marketplace/Storage. Trong **Settings → Environment Variables**, đặt `DATABASE_URL` bằng chuỗi kết nối pooled có SSL do nhà cung cấp cấp. Chọn môi trường **Production**; nếu dùng Preview, cấu hình một database thử riêng cho Preview. App cũng nhận biến `POSTGRES_URL`.
3. Thêm biến **ADMIN_PASSWORD**, chọn mật khẩu riêng không để trống (độ dài tùy chọn) cho trang quản trị. **Deployments → Redeploy** bản commit mới sau khi thêm biến môi trường. Không chạy `npm start` làm Build Command.
4. Mở `/` để xem app, `/admin` để đăng nhập quản trị và `/api/menu` để kiểm tra menu hiện tại. `/api/orders` trả về JSON đơn chưa thanh toán; nếu báo 503 kèm `DATABASE_URL` thì database chưa được cấu hình.

App tự tạo bảng `chd_order_state`, bảng `chd_images` và thêm cột `catalog` khi nâng cấp; tài khoản database cần quyền tạo/sửa bảng. Các thay đổi đơn và thực đơn chạy trong transaction để tránh mất cập nhật đồng thời. Dữ liệu đơn cũ được giữ nguyên khi nâng cấp. Local không cấu hình database vẫn dùng file JSON. Đơn cũ trong file local không tự chuyển lên database. Khi chạy trên Vercel, app không lưu đơn vào ổ đĩa tạm hoặc bộ nhớ tiến trình.

Nguồn: [Express trên Vercel](https://vercel.com/docs/frameworks/backend/express). Tệp `public/` được Vercel phục vụ trực tiếp, API chạy dưới dạng Function. Đồng bộ đơn hàng dùng các yêu cầu ngắn mỗi 4 giây.

Kiểm tra trước khi deploy: `npm run check` và `npm test`. Bộ kiểm tra bao gồm quyền quản trị, CRUD menu/bàn, ảnh, giá đơn cũ, báo cáo ngày/tuần/tháng, nâng cấp dữ liệu cũ, gửi đồng thời, chống gửi trùng và thanh toán. Chạy kiểm tra trình duyệt mobile bằng `npm run test:browser` sau `npx playwright install chromium`; hoặc đặt `CHROME_PATH` trỏ tới Chrome có sẵn. Kiểm tra PostgreSQL thực tế cần thực hiện sau khi có `DATABASE_URL`.

## Trang quản trị /admin

Trên local, sao chép `.env.example` thành `.env`, đặt `ADMIN_PASSWORD` bằng mật khẩu riêng không để trống (độ dài tùy chọn) rồi chạy lại `npm start`. `.env` được nạp tự động. Nếu chỉ dùng file local, để `DATABASE_URL` trống. Trên Vercel, đặt hai biến này trong Settings → Environment Variables rồi redeploy. Không có mật khẩu mặc định. Mật khẩu chỉ giữ trong bộ nhớ tab trình duyệt; tải lại trang cần đăng nhập lại, đăng xuất sẽ xóa khỏi bộ nhớ tab.

- **Doanh thu:** chọn Ngày / Tuần / Tháng và chọn một ngày thuộc kỳ muốn xem. Tuần bắt đầu thứ Hai, tháng là tháng lịch; múi giờ Việt Nam (UTC+7). Chạm cột biểu đồ để xem số tiền. Bấm ↻ để cập nhật.
- Doanh thu chỉ cộng đơn **đã xác nhận thanh toán**, ghi nhận theo thời điểm thanh toán. Chỉ in bill chưa tạo doanh thu. Các phiếu trong cùng lần thanh toán được tính là một lượt; đơn cũ chưa có mã thanh toán được tính theo từng phiếu. Chưa tính lợi nhuận, chi phí, thuế, giảm giá hoặc hoàn tiền.
- **Món bán chạy:** 10 món có số lượng đã thanh toán cao nhất trong **ngày được chọn**, kể cả khi đang xem biểu đồ tuần/tháng. Giữ tên/giá tại thời điểm gọi món để bảo toàn dữ liệu lịch sử.
- **Thực đơn:** thêm món, nhóm món mới, giá bằng đồng, đơn vị và mô tả. Chọn ảnh JPEG/PNG/WebP từ điện thoại (tối đa 10 MB); trình duyệt thu nhỏ tối đa 640 px và nén trước khi lưu. Ảnh lưu trong PostgreSQL trên Vercel, hoặc `data/images/` trên local. Không cần dịch vụ ảnh khác. Ảnh cũ được giữ lại khi thay/xóa để không làm hỏng các trang đang mở.
- **Xóa món:** ẩn khỏi thực đơn gọi món; lịch sử đơn và doanh thu giữ nguyên. Giá sửa chỉ áp dụng cho đơn mới. Giỏ chưa lưu được cập nhật kèm thông báo; nếu giá thay đổi ngay lúc gửi, máy chủ yêu cầu kiểm tra lại.
- **Bàn ăn:** thêm số bàn từ 1 đến 999 (tối đa 200 bàn), xóa bàn không còn đơn chưa thanh toán; luôn giữ ít nhất một bàn. Các điện thoại gọi món cập nhật menu và bàn mỗi 4 giây khi đang mở app.

Khi sao lưu local, lưu cả `data/orders.json` và thư mục `data/images/`. Sau lần sửa đầu tiên, JSON local được nâng cấp từ mảng đơn cũ sang đối tượng chứa `orders` và `catalog`.

## In bill trên điện thoại

Chọn bàn trong **Hóa đơn**, bấm **In bill** để mở hộp thoại in hệ thống. Mẫu in dùng giấy cuộn **80 mm**, vùng chữ **72 mm**, lề 4 mm mỗi bên. Bill có bảng STT, tên món, số lượng, đơn giá, thành tiền và tổng tiền; chiều dài trang được tính từ nội dung từng bill để tránh khoảng trắng dài như A4. Không in các nút và giao diện app.

Trong hộp thoại in, chọn đúng **máy in bill** đã kết nối Wi-Fi/Bluetooth, chọn khổ **80 mm / Receipt / Roll** trong tùy chọn của driver, tỷ lệ **100%**, tắt **đầu trang và chân trang** (URL, số trang). Không chọn A4. Nếu driver không hỗ trợ khổ tùy chỉnh do web gửi, cần chọn hoặc tạo khổ giấy 80 mm trong cấu hình máy in; chiều dài giấy/cắt giấy phụ thuộc driver và máy in. CSS không thể ép một máy in A4 thành máy in nhiệt.

Web dùng hộp thoại in trình duyệt, chưa có chế độ in thẳng không cần xác nhận. Máy Wi-Fi/Bluetooth phải được hệ điều hành hoặc dịch vụ in trên điện thoại hỗ trợ; để tích hợp in trực tiếp ESC/POS cần biết model máy và giao thức kết nối cụ thể. In không tự đánh dấu thanh toán. Nhấn **Xác nhận đã thanh toán** sau khi thu tiền. Mã đơn trên bill lấy từ phiếu gọi món đầu tiên; app không tự ghi tiền nhận/tiền thừa khi chưa có dữ liệu đó.

## Phạm vi

Giao diện mobile rộng tối đa 480 px. Với combo có lựa chọn lẩu, ghi lựa chọn vào ô ghi chú. Đơn đã lưu không chỉnh sửa; gọi bổ sung bằng đơn mới. Admin và API quản trị yêu cầu mật khẩu; trang gọi món/thanh toán của nhân viên vẫn dùng cơ chế truy cập bằng link như trước, chưa có tài khoản nhân viên riêng. Font Google có fallback sans-serif khi mất mạng.
# cauhadua
