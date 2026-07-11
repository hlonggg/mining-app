const { Telegraf, Markup } = require('telegraf');
const { findOrCreateUser } = require('./lib');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const MINI_APP_URL = process.env.MINI_APP_URL;

// /start hoặc /start REFCODE (deep link mời bạn: t.me/YourBot?start=REFCODE)
bot.start(async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || null;
    const firstName = ctx.from.first_name || null;
    const refCode = ctx.startPayload || null; // phần sau /start là mã giới thiệu

    const user = await findOrCreateUser({ telegramId, username, firstName, refCode });

    await ctx.reply(
      `Chào ${firstName || 'bạn'}!\n\n` +
      `Bấm nút bên dưới để mở app và bắt đầu đào coin thụ động.\n\n` +
      `Mã mời của bạn: ${user.referralCode}\n` +
      `Link mời bạn bè: https://t.me/${ctx.botInfo.username}?start=${user.referralCode}`,
      Markup.inlineKeyboard([
        Markup.button.webApp('⛏️ Mở App Đào Coin', MINI_APP_URL),
      ])
    );
  } catch (err) {
    // Không để lỗi ở đây làm crash cả container — chỉ log lại và báo user thử lại.
    // Lỗi thường gặp nhất ở đây là DATABASE_URL chưa được cấu hình đúng trên Railway.
    console.error('Lỗi xử lý /start:', err.message);
    await ctx.reply('Có lỗi xảy ra, vui lòng thử lại sau ít phút.').catch(() => {});
  }
});

// Bắt mọi lỗi chưa được xử lý ở các handler khác (phòng hờ) — tránh Telegraf
// làm crash toàn bộ tiến trình Node khi có exception bất ngờ.
bot.catch((err, ctx) => {
  console.error(`Lỗi chưa xử lý khi xử lý update ${ctx.updateType}:`, err.message);
});

// Nút menu dưới thanh gõ chữ (giống mô tả trong yêu cầu)
bot.telegram.setChatMenuButton({
  menu_button: {
    type: 'web_app',
    text: 'Đào Coin',
    web_app: { url: MINI_APP_URL },
  },
}).catch((e) => console.error('Không set được menu button:', e.message));

// Đường dẫn bí mật nhận webhook từ Telegram — dùng BOT_TOKEN làm phần bí mật
// để không ai đoán được URL này và giả gửi tin nhắn giả vào bot.
const WEBHOOK_PATH = `/webhook/${process.env.BOT_TOKEN}`;

// Gọi hàm này 1 lần lúc server khởi động để báo Telegram gửi tin nhắn tới URL này
// thay vì bot phải liên tục hỏi (polling) — tránh lỗi 409 khi có nhiều bản deploy chồng nhau.
async function registerWebhook() {
  const fullUrl = `${MINI_APP_URL}${WEBHOOK_PATH}`;
  await bot.telegram.setWebhook(fullUrl);
  console.log('Đã đăng ký webhook:', fullUrl);
}

module.exports = { bot, WEBHOOK_PATH, registerWebhook };
      
