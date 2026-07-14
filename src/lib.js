const { PrismaClient } = require('@prisma/client');
const { nanoid } = require('nanoid');
const prisma = new PrismaClient();

// Đọc config từ DB, có fallback nếu chưa seed
async function getConfig(key, fallback) {
  const row = await prisma.config.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

async function getConfigNumber(key, fallback) {
  const v = await getConfig(key, String(fallback));
  return parseFloat(v);
}

// Tính số coin đã tích lũy trong phiên đào hiện tại (chưa claim)
// Coin được tính theo thời gian trôi qua từ lúc start tới hiện tại, hoặc tới lúc hết hạn phiên (miningExpiresAt)
// rate: coin/giây — LẤY TỪ CONFIG (đổi được trong trang admin), không dùng user.miningRate cũ nữa
function calcAccruedCoins(user, now = new Date(), rate) {
  if (!user.miningActive || !user.miningStartedAt) return 0;

  const expiresAt = user.miningExpiresAt || user.miningStartedAt;
  const effectiveNow = now < expiresAt ? now : expiresAt;
  const elapsedSeconds = Math.max(0, (effectiveNow.getTime() - user.miningStartedAt.getTime()) / 1000);

  return +(elapsedSeconds * rate).toFixed(4);
}

function isSessionExpired(user, now = new Date()) {
  if (!user.miningActive || !user.miningExpiresAt) return false;
  return now >= user.miningExpiresAt;
}

async function generateReferralCode() {
  let code;
  let exists = true;
  while (exists) {
    code = nanoid(8);
    exists = await prisma.user.findUnique({ where: { referralCode: code } });
  }
  return code;
}

// Tìm hoặc tạo user mới theo telegramId. Nếu có referralCode của người mời -> gắn quan hệ + thưởng
async function findOrCreateUser({ telegramId, username, firstName, refCode }) {
  let user = await prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
  if (user) return user;

  const referralCode = await generateReferralCode();
  let referredById = null;

  if (refCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: refCode } });
    if (referrer && referrer.telegramId !== String(telegramId)) {
      referredById = referrer.id;
    }
  }

  user = await prisma.user.create({
    data: {
      telegramId: String(telegramId),
      username,
      firstName,
      referralCode,
      referredById,
    },
  });

  // Thưởng người mời khi có thành viên mới tham gia (số coin cấu hình được, ở đây hardcode nhẹ - có thể chuyển vào Config)
  if (referredById) {
    const REFERRAL_BONUS = await getConfigNumber('REFERRAL_JOIN_BONUS', 1000);
    await prisma.user.update({
      where: { id: referredById },
      data: { coinBalance: { increment: REFERRAL_BONUS }, totalEarned: { increment: REFERRAL_BONUS } },
    });
  }

  return user;
}

module.exports = {
  prisma,
  getConfig,
  getConfigNumber,
  calcAccruedCoins,
  isSessionExpired,
  findOrCreateUser,
};
