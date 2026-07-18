const express = require('express');
const router = express.Router();
const { prisma, getConfigNumber, calcAccruedCoins, isSessionExpired } = require('../src/lib');
const { requireAuth } = require('../src/auth');

// Trạng thái hiện tại: đang đào hay không, đã tích lũy bao nhiêu, còn bao lâu hết phiên
router.get('/status', requireAuth, async (req, res) => {
  const user = req.user;
  const now = new Date();
  const expired = isSessionExpired(user, now);
  const rate = await getConfigNumber('MINING_RATE_PER_SECOND', 0.1);
  const accrued = calcAccruedCoins(user, now, rate);

  res.json({
    miningActive: user.miningActive && !expired,
    coinBalance: user.coinBalance,
    accruedThisSession: accrued,
    miningRate: rate,
    miningStartedAt: user.miningStartedAt,
    miningExpiresAt: user.miningExpiresAt,
    sessionExpired: expired,
  });
});

// Bấm nút "Bắt đầu đào" — bắt buộc user chủ động bấm mới chạy, đúng yêu cầu
router.post('/start', requireAuth, async (req, res) => {
  const user = req.user;

  if (user.miningActive && !isSessionExpired(user)) {
    return res.status(400).json({ error: 'Phiên đào đang chạy rồi' });
  }

  const hours = await getConfigNumber('MINING_SESSION_HOURS', 8);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      miningActive: true,
      miningStartedAt: now,
      miningExpiresAt: expiresAt,
    },
  });

  res.json({ ok: true, miningStartedAt: updated.miningStartedAt, miningExpiresAt: updated.miningExpiresAt });
});

// Thu hoạch coin đã đào được, cộng vào số dư, kết thúc phiên
router.post('/claim', requireAuth, async (req, res) => {
  const user = req.user;
  const now = new Date();
  const rate = await getConfigNumber('MINING_RATE_PER_SECOND', 0.1);
  const accrued = calcAccruedCoins(user, now, rate);

  if (accrued <= 0) {
    return res.status(400).json({ error: 'Chưa có coin nào để thu hoạch' });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      coinBalance: { increment: accrued },
      totalEarned: { increment: accrued },
      miningActive: false,
      miningStartedAt: null,
      miningExpiresAt: null,
      lastClaimAt: now,
      lastClaimAmount: accrued,
      lastClaimBonusUsed: false, // mở quyền x2 cho lần thu hoạch này
    },
  });

  res.json({ ok: true, claimed: accrued, newBalance: updated.coinBalance });
});

// Thưởng thêm (opt-in, sau khi user tự nguyện xem quảng cáo): x2 số coin của LẦN THU HOẠCH GẦN NHẤT.
// Chỉ dùng được 1 lần/lần thu hoạch, và số tiền lấy từ DB (không tin số "amount" client gửi lên)
// để tránh user sửa giá trị gửi lên nhằm x2 khống số coin lớn hơn thực tế.
router.post('/bonus-double', requireAuth, async (req, res) => {
  const user = req.user;

  if (user.lastClaimBonusUsed || !user.lastClaimAmount || user.lastClaimAmount <= 0) {
    return res.status(400).json({ error: 'Không còn lượt thưởng x2 cho lần thu hoạch này' });
  }

  const bonus = user.lastClaimAmount; // x2 nghĩa là cộng thêm đúng bằng số đã nhận
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      coinBalance: { increment: bonus },
      totalEarned: { increment: bonus },
      lastClaimBonusUsed: true,
    },
  });

  res.json({ ok: true, bonus, newBalance: updated.coinBalance });
});

module.exports = router;
