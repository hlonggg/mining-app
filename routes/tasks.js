const express = require('express');
const router = express.Router();
const { prisma } = require('../src/lib');
const { requireAuth } = require('../src/auth');

// Danh sách nhiệm vụ + trạng thái đã làm hay chưa của user hiện tại
router.get('/', requireAuth, async (req, res) => {
  const tasks = await prisma.task.findMany({ where: { active: true } });
  const userTasks = await prisma.userTask.findMany({ where: { userId: req.user.id } });
  const doneIds = new Set(userTasks.filter(t => t.status === 'completed').map(t => t.taskId));

  res.json(tasks.map(t => ({ ...t, completed: doneIds.has(t.id) })));
});

// Đánh dấu hoàn thành nhiệm vụ + cộng coin
// Lưu ý: với task "join_channel"/"follow", nên xác minh thật (vd check membership qua Bot API)
// trước khi cộng coin ở production, tránh user bấm khống. Ở đây để hook verify riêng.
router.post('/:id/complete', requireAuth, async (req, res) => {
  const taskId = parseInt(req.params.id);
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !task.active) return res.status(404).json({ error: 'Nhiệm vụ không tồn tại' });

  const existing = await prisma.userTask.findUnique({
    where: { userId_taskId: { userId: req.user.id, taskId } },
  });
  if (existing?.status === 'completed') {
    return res.status(400).json({ error: 'Nhiệm vụ đã hoàn thành rồi' });
  }

  // TODO: chèn hàm verify thật theo task.type ở đây (vd bot.telegram.getChatMember cho join_channel)

  await prisma.userTask.upsert({
    where: { userId_taskId: { userId: req.user.id, taskId } },
    update: { status: 'completed', completedAt: new Date() },
    create: { userId: req.user.id, taskId, status: 'completed', completedAt: new Date() },
  });

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { coinBalance: { increment: task.rewardCoins }, totalEarned: { increment: task.rewardCoins } },
  });

  res.json({ ok: true, reward: task.rewardCoins, newBalance: updated.coinBalance });
});

module.exports = router;
