// language: JavaScript, file: src/server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================
// API LẤY CẤU HÌNH (Cho Frontend tự load script)
// ==========================================
app.get('/api/config', async (req, res) => {
  try {
    let config = await prisma.config.findFirst();
    if (!config) {
      // Tạo config mặc định nếu database trống
      config = await prisma.config.create({
        data: { 
          coinRate: 0.23, 
          miningSpeed: 0.5, 
          minWithdraw: 21700, 
          adBonusMinutes: 30,
          monetagScript: ''
        }
      });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// API XỬ LÝ USER & ĐÀO COIN
// ==========================================
app.post('/api/auth', async (req, res) => {
  const { telegramId, username } = req.body;
  if (!telegramId) return res.status(400).json({ error: 'Thiếu telegramId' });

  try {
    let user = await prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
    if (!user) {
      user = await prisma.user.create({
        data: { telegramId: String(telegramId), username: username || 'User', balance: 0 }
      });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cập nhật số dư khi user claim coin đã đào
app.post('/api/mine/claim', async (req, res) => {
  const { telegramId, minedAmount } = req.body;
  try {
    const user = await prisma.user.update({
      where: { telegramId: String(telegramId) },
      data: { balance: { increment: minedAmount } }
    });
    res.json({ success: true, newBalance: user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// API XEM ADS (Cộng thêm thời gian)
// ==========================================
app.post('/api/ads/watch', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'Thiếu userId' });

  try {
    const config = await prisma.config.findFirst();
    const bonusMinutes = config ? config.adBonusMinutes : 30;

    const user = await prisma.user.findUnique({ where: { telegramId: String(userId) } });
    if (!user) return res.status(404).json({ success: false, error: 'User không tồn tại' });

    // Cộng thêm thời gian (Giả sử bạn có trường adBonusCount hoặc lưu vào một biến)
    // Ở đây lưu đơn giản là cộng dồn số phút được thưởng
    await prisma.user.update({
      where: { telegramId: String(userId) },
      data: { adBonusMinutes: { increment: bonusMinutes } } // Cần thêm trường này vào Schema
    });

    res.json({ success: true, message: `Đã cộng ${bonusMinutes} phút đào!` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// API LƯU CẤU HÌNH TỪ ADMIN
// ==========================================
app.post('/api/admin/config', async (req, res) => {
  const { password, coinRate, miningSpeed, minWithdraw, adBonusMinutes, monetagScript } = req.body;
  
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Sai mật khẩu admin' });
  }

  try {
    let config = await prisma.config.findFirst();
    if (config) {
      config = await prisma.config.update({
        where: { id: config.id },
        data: { coinRate, miningSpeed, minWithdraw, adBonusMinutes, monetagScript }
      });
    } else {
      config = await prisma.config.create({
        data: { coinRate, miningSpeed, minWithdraw, adBonusMinutes, monetagScript }
      });
    }
    res.json({ success: true, message: 'Đã lưu cấu hình!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Khởi động server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
