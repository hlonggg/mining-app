const express = require('express');
const { PrismaClient } = require('@prisma/client');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const prisma = new PrismaClient();

// ==========================================
// CẤU HÌNH TELEGRAM BOT
// ==========================================
// Sửa TELEGRAM_BOT_TOKEN thành BOT_TOKEN (cho khớp với Railway của bạn)
const token = process.env.BOT_TOKEN; 
// Sửa WEBAPP_URL thành MINI_APP_URL (cho khớp với Railway của bạn)
const WEBAPP_URL = process.env.MINI_APP_URL || 'https://miningapp.up.railway.app';
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'bạn';
  
  bot.setChatMenuButton({
    chat_id: chatId,
    menu_button: { type: 'web_app', text: 'Mở App Đào Coin', web_app: { url: WEBAPP_URL } }
  }).catch(console.error);

  bot.sendMessage(chatId, `Chào ${firstName}! Bấm vào nút bên dưới để mở App và bắt đầu đào coin.`, {
    reply_markup: {
      inline_keyboard: [[{ text: '🚀 Mở App Đào Coin', web_app: { url: WEBAPP_URL } }]]
    }
  });
});

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Hàm lấy Config từ dạng Key-Value
async function getConfigs() {
  const configs = await prisma.config.findMany();
  const map = Object.fromEntries(configs.map(c => [c.key, c.value]));
  return {
    coinRate: parseFloat(map['coinRate'] || '0.23'),
    miningSpeed: parseFloat(map['miningSpeed'] || '0.5'),
    minWithdraw: parseFloat(map['minWithdraw'] || '21700'),
    adBonusMinutes: parseInt(map['adBonusMinutes'] || '30'),
    monetagScript: map['monetagScript'] || ''
  };
}

// FIX: Hàm lấy Telegram ID thật từ Header (initData)
function getTelegramId(req) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return req.body.userId || req.query.userId || null;
  try {
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (userStr) return JSON.parse(userStr).id.toString();
  } catch (e) { return null; }
  return null;
}

// ==========================================
// CÁC API CHO FRONTEND
// ==========================================

app.get('/api/config', async (req, res) => {
  try {
    const config = await getConfigs();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/me', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: { 
          telegramId, 
          firstName: 'User',
          referralCode: 'REF' + telegramId + Math.floor(Math.random() * 1000)
        }
      });
    }
    const config = await getConfigs();
    res.json({
      coinBalance: user.coinBalance,
      estimatedVnd: user.coinBalance * config.coinRate,
      walletInfo: user.walletInfo || '',
      minWithdrawCoin: config.minWithdraw,
      coinToVndRate: config.coinRate,
      firstName: user.firstName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/mining/status', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const now = new Date();
    const isMining = user.miningActive && user.miningExpiresAt && new Date(user.miningExpiresAt) > now;
    let accrued = 0;

    if (isMining) {
      const diffSeconds = (now.getTime() - new Date(user.miningStartedAt).getTime()) / 1000;
      accrued = diffSeconds * user.miningRate;
    }

    res.json({
      miningActive: isMining,
      accruedThisSession: accrued,
      miningRate: user.miningRate,
      miningExpiresAt: user.miningExpiresAt,
      sessionExpired: !isMining && user.miningActive
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mining/start', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const startTime = new Date();
    const expireTime = new Date(startTime.getTime() + 12 * 3600 * 1000);
    
    await prisma.user.update({
      where: { telegramId },
      data: { 
        miningActive: true,
        miningStartedAt: startTime,
        miningExpiresAt: expireTime
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mining/claim', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user || !user.miningActive) return res.status(400).json({ error: 'Không có phiên đào' });

    const now = new Date();
    const diffSeconds = (now.getTime() - new Date(user.miningStartedAt).getTime()) / 1000;
    const mined = diffSeconds * user.miningRate;

    await prisma.user.update({
      where: { telegramId },
      data: {
        coinBalance: { increment: mined },
        totalEarned: { increment: mined },
        miningActive: false,
        lastClaimAt: now,
        lastClaimAmount: mined,
        lastClaimBonusUsed: false
      }
    });

    res.json({ claimed: mined });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mining/bonus-double', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user || user.lastClaimBonusUsed) return res.status(400).json({ error: 'Không thể x2 lúc này' });

    await prisma.user.update({
      where: { telegramId },
      data: {
        coinBalance: { increment: user.lastClaimAmount },
        totalEarned: { increment: user.lastClaimAmount },
        lastClaimBonusUsed: true
      }
    });
    res.json({ bonus: user.lastClaimAmount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads/watch', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const config = await getConfigs();
    if (!user) return res.status(404).json({ success: false, error: 'User không tồn tại' });

    let newEnd = user.miningExpiresAt ? new Date(user.miningExpiresAt).getTime() : Date.now();
    newEnd += config.adBonusMinutes * 60 * 1000;

    await prisma.user.update({
      where: { telegramId },
      data: { 
        miningExpiresAt: new Date(newEnd),
        miningActive: true
      }
    });

    await prisma.adWatch.create({
      data: { userId: user.id, rewardType: 'extend_time', rewardAmount: config.adBonusMinutes }
    });

    res.json({ success: true, addedMinutes: config.adBonusMinutes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/config', async (req, res) => {
  const { password, coinRate, miningSpeed, minWithdraw, adBonusMinutes, monetagScript } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ success: false, error: 'Sai mật khẩu' });

  try {
    const updates = [
      { key: 'coinRate', value: String(coinRate) },
      { key: 'miningSpeed', value: String(miningSpeed) },
      { key: 'minWithdraw', value: String(minWithdraw) },
      { key: 'adBonusMinutes', value: String(adBonusMinutes) },
      { key: 'monetagScript', value: monetagScript || '' }
    ];

    for (const item of updates) {
      await prisma.config.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: { key: item.key, value: item.value }
      });
    }
    res.json({ success: true, message: 'Đã lưu cấu hình!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Các API rỗng cho giao diện
app.get('/api/tasks', (req, res) => res.json([]));
app.get('/api/referral', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { telegramId } });
  res.json({ referralCode: user?.referralCode || 'DEMO', totalReferrals: 0, referrals: [], inviteLink: '' });
});
app.get('/api/user/withdraw/history', (req, res) => res.json([]));
app.post('/api/user/wallet', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
  await prisma.user.update({ where: { telegramId }, data: { walletInfo: req.body.walletInfo } });
  res.json({ success: true });
});
app.post('/api/user/withdraw', (req, res) => res.json({ success: true }));

// Khởi động server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
