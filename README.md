# Telegram Mining Mini App

App mini bot Telegram: đào coin thụ động + nhiệm vụ + mời bạn bè + ví/rút tiền.

## Cấu trúc

```
mining-app/
├── prisma/schema.prisma   # DB schema (SQLite)
├── prisma/seed.js         # dữ liệu mặc định (tỷ giá, task mẫu)
├── src/bot.js             # bot Telegram, xử lý /start
├── src/server.js          # Express server chính
├── src/auth.js            # xác thực chữ ký Telegram WebApp
├── src/lib.js             # helper tính coin, config
├── routes/                # API: mining, tasks, referral, ads, user, admin
└── public/
    ├── index.html          # mini app cho user (4 menu)
    └── admin.html          # trang admin (đổi tỷ giá, duyệt rút tiền)
```

## Deploy trên Railway (khuyên dùng, không cần Termux)

### 1. Đẩy code lên GitHub
- Tạo repo mới trên GitHub (private hoặc public đều được)
- Upload toàn bộ thư mục `mining-app` này lên repo đó
  (kéo-thả trên web GitHub cũng được, không cần dùng git command line)

### 2. Tạo project trên Railway
1. Vào [railway.app](https://railway.app) → đăng nhập bằng GitHub
2. **New Project** → **Deploy from GitHub repo** → chọn repo vừa tạo
3. Railway tự nhận diện Node.js và chạy `npm install` (script `postinstall`
   sẽ tự generate Prisma client, không cần làm gì thêm)

### 3. Thêm PostgreSQL
1. Trong project vừa tạo, bấm **New** → **Database** → **Add PostgreSQL**
2. Railway tự tạo biến `DATABASE_URL` — vào service code của bạn →
   tab **Variables** → **Reference** → chọn `DATABASE_URL` từ Postgres service
   (không cần copy tay)

### 4. Điền biến môi trường
Trong tab **Variables** của service code, thêm:
```
BOT_TOKEN=...          # lấy từ @BotFather
BOT_USERNAME=...       # username bot, không có @
MINI_APP_URL=...       # điền tạm, quay lại sửa ở bước 6
ADMIN_PASSWORD=...     # mật khẩu tự đặt cho trang admin
```

### 5. Khởi tạo database + dữ liệu mẫu
Railway có nút **Shell** ngay trong service (không cần SSH riêng):
```bash
npx prisma db push
npm run seed
```

### 6. Lấy URL public và gắn vào bot
1. Vào service code → tab **Settings** → **Networking** → **Generate Domain**
   → Railway cho bạn 1 domain HTTPS miễn phí dạng `xxx.up.railway.app`
2. Copy domain đó vào biến `MINI_APP_URL` (dạng đầy đủ `https://xxx.up.railway.app`)
3. Redeploy service (Railway tự làm khi bạn đổi biến môi trường)
4. Vào Telegram, chat với @BotFather → `/mybots` → chọn bot → **Bot Settings**
   → **Menu Button** → dán URL → app đã sẵn sàng

### Lựa chọn khác nếu không dùng Railway
- **Render**: tương tự Railway, có free Postgres, nhưng free web service
  bị "ngủ" sau ~15 phút không có traffic (lần gọi đầu sau khi ngủ sẽ chậm ~30s)
- **Fly.io**: mạnh hơn, không ngủ, nhưng cần cài CLI trên máy tính để deploy

## Chạy thử (local hoặc trong Railway Shell)

```bash
npm install
npm run dev
```

Vào Telegram, gõ `/start` với bot của bạn (hoặc `/start MÃGIỚITHIỆU` để test referral).

## Trang admin

Mở `<MINI_APP_URL>/admin.html`, nhập mật khẩu trong `ADMIN_PASSWORD`.
Tại đây bạn:
- Đổi tỷ giá `1 coin = ? VND` dựa trên doanh thu quảng cáo thực tế đã thu được
- Duyệt / từ chối / đánh dấu đã trả các yêu cầu rút tiền

## Những việc CẦN LÀM trước khi cho user thật vào

1. **Gắn SDK quảng cáo thật** (Adsgram, Monetag...) vào `public/index.html`,
   hàm `btnWatchAd` — hiện tại đang gọi thẳng API, cần đợi SDK xác nhận
   "đã xem xong" rồi mới gọi `/api/ads/watch`, nếu không user có thể spam
   farm coin khống.
2. **Xác minh task thật**: trong `routes/tasks.js` có để sẵn `TODO` — với
   nhiệm vụ "tham gia kênh", nên gọi `bot.telegram.getChatMember()` để kiểm
   tra user đã tham gia thật trước khi cộng coin, tránh user bấm khống.
3. **Đặt tỷ giá coin→VND dựa trên doanh thu ads thật** bạn nhận được từ
   network quảng cáo, để không trả nhiều hơn số tiền bạn thực sự thu vào.
   Công thức gợi ý: `tỷ giá = (tổng doanh thu ads tháng / tổng coin phát ra tháng) × hệ số an toàn (vd 0.7)`.
4. **Thay xác thực admin** bằng session/JWT thật thay vì mật khẩu tĩnh
   trước khi public trang admin.
5. Cân nhắc thêm rate-limit cho API để chống bot spam request.
