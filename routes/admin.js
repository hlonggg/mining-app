const express = require('express');
const router = express.Router();
const { prisma } = require('../src/lib');
require('dotenv').config();

// Xác thực admin đơn giản bằng mật khẩu trong .env — thay bằng login thật (JWT/session) trước khi lên production
function requireAdmin(req, res, next) {
  const pass = req.header('X-Admin-Password');
  if (pass !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Sai mật khẩu admin' });
  next();
}

router.get('/config', requireAdmin, async (req, res) => {
  const rows = await prisma.config.findMany();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

router.post('/config', requireAdmin, async (req, res) => {
  const updates = req.body; // { COIN_TO_VND: "12", MIN_WITHDRAW_COIN: "6000", ... }
  for (const [key, value] of Object.entries(updates)) {
    await prisma.config.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
  res.json({ ok: true });
});

router.get('/withdrawals', requireAdmin, async (req, res) => {
  const status = req.query.status || 'pending';
  const list = await prisma.withdrawRequest.findMany({
    where: { status },
    include: { user: { select: { telegramId: true, username: true, firstName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(list);
});

router.post('/withdrawals/:id/decide', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { action, note } = req.body; // action: "approve" | "reject" | "paid"

  const statusMap = { approve: 'approved', reject: 'rejected', paid: 'paid' };
  const newStatus = statusMap[action];
  if (!newStatus) return res.status(400).json({ error: 'action không hợp lệ' });

  const request = await prisma.withdrawRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });

  // Nếu từ chối, hoàn lại coin cho user
  if (action === 'reject') {
    await prisma.user.update({
      where: { id: request.userId },
      data: { coinBalance: { increment: request.coinAmount } },
    });
  }

  const updated = await prisma.withdrawRequest.update({
    where: { id },
    data: { status: newStatus, processedAt: new Date(), note },
  });

  res.json({ ok: true, updated });
});

module.exports = router;

