require('dotenv').config();
const prisma = require('../src/prisma');
async function main() {
  const services = [
    'Наращивание ресниц','Маникюр / педикюр','Косметолог','Массаж',
    'Визажист','Бровист','Парикмахер','Барбер','Ламинирование ресниц/бровей','Эпиляция / шугаринг'
  ];
  for (const name of services) {
    await prisma.service.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log('Seed complete');
}
main().then(()=>process.exit(0)).catch(e=>{ console.error(e); process.exit(1); });
