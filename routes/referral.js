const express = require('express');
const router = express.Router();
const { prisma } = require('../src/lib');
const { requireAuth } = require('../src/auth');
require('dotenv').config();

router.get('/', requireAuth, async (req, res) => {
  const referrals = await prisma.user.findMany({
    where: { referredById: req.user.id },
    select: { username: true, firstName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    referralCode: req.user.referralCode,
    inviteLink: `https://t.me/${process.env.BOT_USERNAME || 'your_bot'}?start=${req.user.referralCode}`,
    totalReferrals: referrals.length,
    referrals,
  });
});

module.exports = router;
