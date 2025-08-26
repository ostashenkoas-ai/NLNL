require('dotenv').config();
const { buildBot } = require('./bot');
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
(async () => {
  if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN is missing'); process.exit(1); }
  const bot = buildBot(TOKEN);
  await bot.launch();
  console.log('🤖 Bot launched (worker).');
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
})();
