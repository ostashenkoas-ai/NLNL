require('dotenv').config();
const { buildServer } = require('./server');
const PORT = process.env.PORT || 3000;
(async () => {
  const app = await buildServer();
  app.listen(PORT, () => console.log(`🛠 Admin panel: http://localhost:${PORT}/admin`));
})();
