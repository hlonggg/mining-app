const express = require('express');
require('express-async-errors'); // phải require ngay sau express, trước khi định nghĩa route
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { bot, WEBHOOK_PATH, registerWebhook } = require('./bot');
const miningRoutes = require('../routes/mining');
const taskRoutes = require('../routes/tasks');
const referralRoutes = require('../routes/referral');
const adsRoutes = require('../routes/ads');
const userRoutes = require('../routes/user');
const adminRoutes = require('../routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

// Route nhận tin nhắn Telegram gửi tới qua webhook — phải đăng ký TRƯỚC express.json()
// mặc định vì Telegraf tự parse body riêng, nhưng vì middleware webhookCallback của
// Telegraf tự xử lý parsing nên đặt trước static/json đều được, chỉ cần đặt trước khi app.listen.
app.use(bot.webhookCallback(WEBHOOK_PATH));

app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    // Không cache HTML — Telegram WebView hay giữ bản cũ, gây khó debug/update.
    // JS/CSS nếu tách file riêng có thể cache bình thường, nhưng ở đây gộp chung trong .html nên tắt hết cho chắc.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  },
}));

app.use('/api/mining', miningRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

// Bắt lỗi từ mọi route API (vd DATABASE_URL thiếu, lỗi Prisma...) — trả về JSON lỗi
// thay vì làm sập cả server. Phải đặt SAU tất cả app.use route.
app.use((err, req, res, next) => {
  console.error('Lỗi API:', err.message);
  res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau' });
});

// Lưới an toàn cuối cùng: nếu có lỗi bất ngờ nào lọt qua hết các lớp trên,
// chỉ log lại chứ không để tiến trình Node thoát đột ngột (tránh vòng lặp restart trên Railway).
process.on('unhandledRejection', (reason) => {
  console.error('Lỗi Promise chưa xử lý:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Lỗi chưa bắt được:', err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
  try {
    await registerWebhook();
  } catch (e) {
    console.error('Lỗi đăng ký webhook:', e.message);
  }
});
  
