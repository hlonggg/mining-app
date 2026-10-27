const express = require('express');
const { PrismaClient } = require('@prisma/client');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const prisma = new PrismaClient();

// ==========================================
// CẤU HÌNH TELEGRAM BOT
// ==========================================
const token = process.env.BOT_TOKEN; 
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

// Chống crash bot khi mất mạng
bot.on('polling_error', (error) => {
  console.error('Lỗi polling bot:', error.code);
});

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Hàm lấy Config (Map chính xác Key của Admin sang dạng Frontend)
async function getConfigs() {
  const configs = await prisma.config.findMany();
  const map = Object.fromEntries(configs.map(c => [c.key, c.value]));
  return {
    coinRate: parseFloat(map['COIN_TO_VND'] || '0.23'),
    miningSpeed: parseFloat(map['MINING_RATE_PER_SECOND'] || '0.5'),
    minWithdraw: parseFloat(map['MIN_WITHDRAW_COIN'] || '21700'),
    adBonusMinutes: parseInt(map['AD_EXTEND_MINUTES'] || '30'),
    monetagScript: map['MONETAG_SCRIPT_TAG'] || '',
    adexiumInterstitialId: map['ADEXIUM_INTERSTITIAL_ID'] || '',
    adexiumPushlikeId: map['ADEXIUM_PUSHLIKE_ID'] || '',
    adBlockIds: map['AD_BLOCK_IDS'] ? JSON.parse(map['AD_BLOCK_IDS']) : []
  };
}

// Hàm lấy Telegram ID
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
// API DÀNH CHO NGƯỜI DÙNG (INDEX.HTML)
// ==========================================

app.get('/api/config', async (req, res) => {
  try {
    res.json(await getConfigs());
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
    const config = await getConfigs();
    const startTime = new Date();
    const expireTime = new Date(startTime.getTime() + 12 * 3600 * 1000);
    
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
      data: { miningExpiresAt: new Date(newEnd), miningActive: true }
    });

    await prisma.adWatch.create({
      data: { userId: user.id, rewardType: 'extend_time', rewardAmount: config.adBonusMinutes }
    });

    res.json({ success: true, addedMinutes: config.adBonusMinutes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/user/wallet', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
  await prisma.user.update({ where: { telegramId }, data: { walletInfo: req.body.walletInfo } });
  res.json({ success: true });
});

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
      prisma.user.update({ where: { id: user.id }, data: { coinBalance: 0 } }),
      prisma.withdrawRequest.create({
        data: { userId: user.id, coinAmount: user.coinBalance, vndAmount, walletInfo: user.walletInfo, status: 'pending' }
      })
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/withdraw/history', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const history = await prisma.withdrawRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    res.json(history.map(w => ({ vndAmount: w.vndAmount, status: w.status })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tasks', (req, res) => res.json([]));
app.get('/api/referral', async (req, res) => {
  const telegramId = getTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { telegramId } });
  res.json({ referralCode: user?.referralCode || 'DEMO', totalReferrals: 0, referrals: [], inviteLink: '' });
});

// ==========================================
// API NHẬN POSTBACK TỪ MONETAG (Cộng giờ tự động)
// ==========================================
app.get('/api/postback/monetag', async (req, res) => {
  const { telegram_id, reward_event_type, secret } = req.query;

  if (secret !== 'thanhcong') {
    return res.status(401).send('Unauthorized');
  }

  if (reward_event_type !== 'valued') {
    return res.status(200).send('OK');
  }

  try {
    const user = await prisma.user.findUnique({ where: { telegramId: String(telegram_id) } });
    if (!user) return res.status(200).send('User not found');

    const config = await getConfigs();
    let newEnd = user.miningExpiresAt ? new Date(user.miningExpiresAt).getTime() : Date.now();
    newEnd += config.adBonusMinutes * 60 * 1000;

    await prisma.user.update({
      where: { telegramId: String(telegram_id) },
      data: { miningExpiresAt: new Date(newEnd), miningActive: true }
    });

    await prisma.adWatch.create({
      data: { userId: user.id, rewardType: 'extend_time', rewardAmount: config.adBonusMinutes }
    });

    console.log(`[POSTBACK] Đã cộng ${config.adBonusMinutes} phút cho user ${telegram_id}`);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Lỗi Postback:', error);
    res.status(500).send('Server Error');
  }
});

// ==========================================
// API DÀNH CHO ADMIN (KHỚP VỚI ADMIN.HTML)
// ==========================================
const checkAdmin = (req, res, next) => {
  const pass = req.headers['x-admin-password'];
  if (pass !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Sai mật khẩu' });
  next();
};

app.get('/api/admin/config', checkAdmin, async (req, res) => {
  try {
    const configs = await prisma.config.findMany();
    const map = Object.fromEntries(configs.map(c => [c.key, c.value]));
    res.json(map);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/config', checkAdmin, async (req, res) => {
  try {
    const data = req.body;
    for (const [key, value] of Object.entries(data)) {
      await prisma.config.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/withdrawals', checkAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const list = await prisma.withdrawRequest.findMany({
      where: { status },
      include: { user: true }
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/withdrawals/:id/decide', checkAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { action } = req.body;
  
  let status = 'pending';
  if (action === 'approve') status = 'approved';
  if (action === 'paid') status = 'paid';
  if (action === 'reject') status = 'rejected';

  try {
    await prisma.withdrawRequest.update({
      where: { id },
      data: { status, processedAt: new Date() }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Khởi động server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
