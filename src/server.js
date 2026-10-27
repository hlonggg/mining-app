const express = require('express');
const { PrismaClient } = require('@prisma/client');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const prisma = new PrismaClient();

// ==========================================
// CẤU HÌNH TELEGRAM BOT
// ==========================================
const token = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://miningapp.up.railway.app';
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'bạn';
  
  // Cài đặt Menu Button
  bot.setChatMenuButton({
    chat_id: chatId,
    menu_button: { type: 'web_app', text: 'Mở App Đào Coin', web_app: { url: WEBAPP_URL } }
  }).catch(console.error);

  // Gửi tin nhắn chào mừng
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

// Hàm bóc tách Telegram ID từ initData
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

// Hàm lấy toàn bộ Config từ Database (Key-Value) và chuyển thành Object
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

// ==========================================
// CÁC API CHO FRONTEND
// ==========================================

// 1. API Config (Dành cho load script Ads)
app.get('/api/config', async (req, res) => {
  try {
    res.json(await getConfigs());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. API Lấy thông tin User
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
      firstName: user.firstName,
      username: user.username
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. API Trạng thái Đào Coin
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

// 4. API Bắt đầu Đào
app.post('/api/mining/start', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const config = await getConfigs();
    const startTime = new Date();
    const expireTime = new Date(startTime.getTime() + 12 * 3600 * 1000); // 12 tiếng
    
    await prisma.user.update({
      where: { telegramId },
      data: { 
        miningActive: true,
        miningStartedAt: startTime,
        miningExpiresAt: expireTime,
        miningRate: config.miningSpeed
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. API Thu hoạch Coin
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
        lastClaimBonusUsed: false // Mở khóa quyền x2
      }
    });

    res.json({ claimed: mined });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. API X2 Thưởng
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

// 7. API Xem Quảng Cáo (Cộng thêm thời gian)
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

// 8. API Nhiệm vụ
app.get('/api/tasks', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const tasks = await prisma.task.findMany({ where: { active: true } });
    const userTasks = await prisma.userTask.findMany({ where: { userId: user.id } });

    const result = tasks.map(t => ({
      id: t.id,
      title: t.title,
      rewardCoins: t.rewardCoins,
      link: t.link,
      completed: userTasks.some(ut => ut.taskId === t.id && ut.status === 'completed')
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. API Hoàn thành Nhiệm vụ
app.post('/api/tasks/:id/complete', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
  const taskId = parseInt(req.params.id);

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    
    if (!task || !task.active) return res.status(400).json({ error: 'Nhiệm vụ không hợp lệ' });

    const existing = await prisma.userTask.findUnique({
      where: { userId_taskId: { userId: user.id, taskId } }
    });

    if (existing && existing.status === 'completed') {
      return res.status(400).json({ error: 'Đã hoàn thành nhiệm vụ này' });
    }

    await prisma.userTask.upsert({
      where: { userId_taskId: { userId: user.id, taskId } },
      update: { status: 'completed', completedAt: new Date() },
      create: { userId: user.id, taskId, status: 'completed', completedAt: new Date() }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { coinBalance: { increment: task.rewardCoins }, totalEarned: { increment: task.rewardCoins } }
    });

    res.json({ success: true, reward: task.rewardCoins });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. API Mời bạn bè
app.get('/api/referral', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ 
      where: { telegramId },
      include: { referrals: true }
    });
    
    res.json({
      referralCode: user.referralCode,
      totalReferrals: user.referrals.length,
      referrals: user.referrals.map(r => ({ firstName: r.firstName, username: r.username, createdAt: r.createdAt })),
      inviteLink: `https://t.me/YourBotUsername?start=${user.referralCode}` // Thay YourBotUsername
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. API Lịch sử rút tiền
app.get('/api/user/withdraw/history', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const history = await prisma.withdrawRequest.findMany({ 
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(history.map(w => ({ vndAmount: w.vndAmount, status: w.status })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. API Lưu ví
app.post('/api/user/wallet', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await prisma.user.update({
      where: { telegramId },
      data: { walletInfo: req.body.walletInfo }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 13. API Yêu cầu rút tiền
app.post('/api/user/withdraw', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const config = await getConfigs();

    if (user.coinBalance < config.minWithdraw) {
      return res.status(400).json({ error: `Cần tối thiểu ${config.minWithdraw} coin để rút` });
    }
    if (!user.walletInfo) {
      return res.status(400).json({ error: 'Vui lòng nhập thông tin nhận tiền' });
    }

    const vndAmount = user.coinBalance * config.coinRate;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { coinBalance: 0 }
      }),
      prisma.withdrawRequest.create({
        data: {
          userId: user.id,
          coinAmount: user.coinBalance,
          vndAmount,
          walletInfo: user.walletInfo,
          status: 'pending'
        }
      })
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 14. API Lưu Cấu Hình Từ Admin (Lưu Key-Value)
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

// Khởi động server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
