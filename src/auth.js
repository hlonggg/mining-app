const crypto = require('crypto');
const { prisma } = require('./lib');
require('dotenv').config();

// Xác thực chữ ký initData do Telegram WebApp gửi lên, đảm bảo request thật sự
// đến từ Telegram chứ không phải giả mạo telegramId để cộng coin khống.
// Xem: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function verifyInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userJson = params.get('user');
  return userJson ? JSON.parse(userJson) : null;
}

// Middleware: đọc header X-Telegram-Init-Data, xác thực, gắn req.user (bản ghi DB)
async function requireAuth(req, res, next) {
  const initData = req.header('X-Telegram-Init-Data');
  if (!initData) return res.status(401).json({ error: 'Thiếu dữ liệu xác thực Telegram' });

  const tgUser = verifyInitData(initData);
  if (!tgUser) return res.status(401).json({ error: 'Chữ ký không hợp lệ' });

  const user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
  if (!user) return res.status(404).json({ error: 'User chưa tồn tại, hãy /start bot trước' });

  req.user = user;
  next();
}

module.exports = { verifyInitData, requireAuth };
                                        
