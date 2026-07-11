const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const bot = require('./bot');
const miningRoutes = require('../routes/mining');
const taskRoutes = require('../routes/tasks');
const referralRoutes = require('../routes/referral');
const adsRoutes = require('../routes/ads');
const userRoutes = require('../routes/user');
const adminRoutes = require('../routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/mining', miningRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});

bot.launch();
console.log('Bot Telegram đã khởi động.');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
