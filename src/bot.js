const { Telegraf, Markup } = require('telegraf');
const { findOrCreateUser } = require('./lib');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const MINI_APP_URL = process.env.MINI_APP_URL;

// /start hoặc /start REFCODE (deep link mời bạn: t.me/YourBot?start=REFCODE)
bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || null;
  const firstName = ctx.from.first_name || null;
  const refCode = ctx.startPayload || null; // phần sau /start là mã giới thiệu

  const user = await findOrCreateUser({ telegramId, username, firstName, refCode });

  await ctx.reply(
    `Chào ${firstName || 'bạn'}! 👋\n\n` +
    `Bấm nút bên dưới để mở app và bắt đầu đào coin thụ động.\n` +
    `Mã mời của bạn: \`${user.referralCode}\`\n` +
    `Link mời bạn bè: https://t.me/${ctx.botInfo.username}?start=${user.referralCode}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.webApp('⛏️ Mở App Đào Coin', MINI_APP_URL),
      ]),
    }
  );
});

// Nút menu dưới thanh gõ chữ (giống mô tả trong yêu cầu)
bot.telegram.setChatMenuButton({
  menu_button: {
    type: 'web_app',
    text: 'Đào Coin',
    web_app: { url: MINI_APP_URL },
  },
}).catch((e) => console.error('Không set được menu button:', e.message));

module.exports = bot;
