const express = require('express');
const router = express.Router();
const { prisma, getConfigNumber } = require('../src/lib');
const { requireAuth } = require('../src/auth');

router.get('/me', requireAuth, async (req, res) => {
  const minWithdraw = await getConfigNumber('MIN_WITHDRAW_COIN', 5000);
  const rate = await getConfigNumber('COIN_TO_VND', 10);

  res.json({
    telegramId: req.user.telegramId,
    username: req.user.username,
    firstName: req.user.firstName,
    coinBalance: req.user.coinBalance,
    totalEarned: req.user.totalEarned,
    walletInfo: req.user.walletInfo,
    coinToVndRate: rate,
    minWithdrawCoin: minWithdraw,
    estimatedVnd: +(req.user.coinBalance * rate).toFixed(0),
  });
});

router.post('/wallet', requireAuth, async (req, res) => {
  const { walletInfo } = req.body;
  if (!walletInfo || walletInfo.length < 5) {
    return res.status(400).json({ error: 'Thông tin ví/số tài khoản không hợp lệ' });
  }
  await prisma.user.update({ where: { id: req.user.id }, data: { walletInfo } });
  res.json({ ok: true });
});

// Tạo yêu cầu rút tiền — KHÔNG tự động chuyển tiền, chỉ tạo request "pending"
// để admin duyệt thủ công dựa trên doanh thu quảng cáo thực tế đã thu được.
router.post('/withdraw', requireAuth, async (req, res) => {
  const user = req.user;
  const minWithdraw = await getConfigNumber('MIN_WITHDRAW_COIN', 5000);
  const rate = await getConfigNumber('COIN_TO_VND', 10);

  if (!user.walletInfo) {
    return res.status(400).json({ error: 'Vui lòng cập nhật thông tin ví/tài khoản trước khi rút' });
  }
  if (user.coinBalance < minWithdraw) {
    return res.status(400).json({ error: `Số dư tối thiểu để rút là ${minWithdraw} coin` });
  }

  const vndAmount = +(user.coinBalance * rate).toFixed(0);

  const request = await prisma.$transaction(async (tx) => {
    const wr = await tx.withdrawRequest.create({
      data: {
        userId: user.id,
        coinAmount: user.coinBalance,
        vndAmount,
        walletInfo: user.walletInfo,
        status: 'pending',
      },
    });
    // Trừ ngay số dư để tránh user rút trùng lặp trong lúc chờ duyệt
    await tx.user.update({ where: { id: user.id }, data: { coinBalance: 0 } });
    return wr;
  });

  res.json({ ok: true, request });
});

router.get('/withdraw/history', requireAuth, async (req, res) => {
  const list = await prisma.withdrawRequest.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(list);
});

module.exports = router;
