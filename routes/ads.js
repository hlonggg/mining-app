const express = require('express');
const router = express.Router();
const { prisma, getConfigNumber, isSessionExpired } = require('../src/lib');
const { requireAuth } = require('../src/auth');

// Gọi endpoint này SAU KHI SDK quảng cáo (Adsgram/Monetag...) xác nhận user đã xem xong.
// Không cộng thưởng chỉ vì user bấm nút — phải có callback "ad completed" thật từ SDK
// ở phía frontend trước khi gọi API này, nếu không user có thể spam gọi API để farm coin khống.
router.post('/watch', requireAuth, async (req, res) => {
  const user = req.user;

  if (!user.miningActive || isSessionExpired(user)) {
    return res.status(400).json({ error: 'Chỉ có thể cộng thêm giờ khi đang trong phiên đào' });
  }

  const extendMinutes = await getConfigNumber('AD_EXTEND_MINUTES', 30);
  const maxExtendHours = await getConfigNumber('MAX_EXTEND_HOURS', 4);
  const sessionHours = await getConfigNumber('MINING_SESSION_HOURS', 8);

  const baseExpiry = new Date(user.miningStartedAt.getTime() + sessionHours * 3600 * 1000);
  const maxExpiry = new Date(baseExpiry.getTime() + maxExtendHours * 3600 * 1000);
  const newExpiry = new Date(user.miningExpiresAt.getTime() + extendMinutes * 60 * 1000);

  if (newExpiry > maxExpiry) {
    return res.status(400).json({ error: 'Đã đạt giới hạn cộng thêm giờ cho phiên này' });
  }

  await prisma.adWatch.create({
    data: { userId: user.id, rewardType: 'extend_time', rewardAmount: extendMinutes },
  });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { miningExpiresAt: newExpiry },
  });

  res.json({ ok: true, addedMinutes: extendMinutes, newExpiresAt: updated.miningExpiresAt });
});

module.exports = router;
