const express = require('express');
const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const { Database, Resource } = require('@adminjs/prisma');
const prisma = require('./prisma');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');

AdminJS.registerAdapter({ Database, Resource });

async function buildServer() {
  const app = express();
  app.use(morgan('dev'));
  app.use(cors());
  app.use(bodyParser.json());

  const admin = new AdminJS({
    rootPath: '/admin',
    branding: { companyName: 'Beauty NL — Admin', softwareBrothers: false },
    resources: [
      { resource: { model: prisma.user, client: prisma }, options: {
        properties: {
          telegramId: { isTitle: true },
          phone: { type: 'string' },
          languages: { type: 'string' },
          uiLocale: { availableValues: [
            { value: 'ru', label: 'Русский' },
            { value: 'nl', label: 'Nederlands' }
          ]}
        }
      }},
      { resource: { model: prisma.service, client: prisma } },
      { resource: { model: prisma.masterService, client: prisma }, options: {
        listProperties: ['id','masterId','serviceId','rating','topUntil'],
        editProperties: ['masterId','serviceId','priceFrom','priceTo','description','photos','rating','topUntil','topNote'],
        showProperties: ['id','masterId','serviceId','priceFrom','priceTo','description','photos','rating','topUntil','topNote'],
        properties: {
          photos: { type: 'string', props: { placeholder: 'https://...jpg, https://...png' } },
          description: { type: 'textarea' },
          rating: { type: 'number', props: { min: 1, max: 5, step: 1 } },
          topUntil: { type: 'datetime' },
          topNote: { type: 'string' }
        }
      }},
      { resource: { model: prisma.lead, client: prisma }, options: {
        listProperties: ['id','createdAt','status','city','budget','masterId','serviceId','clientPhone','clientUsername']
      }},
      { resource: { model: prisma.subscription, client: prisma } }
    ],
    dashboard: {
      component: false,
      handler: async () => {
        const leads = await prisma.lead.count();
        const masters = await prisma.user.count({ where: { role: 'MASTER' }});
        const subs = await prisma.subscription.count({ where: { status: 'ACTIVE' } });
        return { text: `Мастеров: ${masters}, лидов: ${leads}, активных подписок: ${subs}` };
      },
    },
  });

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';

  const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email, password) => (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) ? { email } : null,
      cookieName: 'beauty-nl-admin',
      cookiePassword: SESSION_SECRET,
    }
  );

  app.use(admin.options.rootPath, adminRouter);
  app.get('/', (req, res) => res.send('<h1>Beauty NL</h1><p>Админка: <a href="/admin">/admin</a></p>'));
  app.get('/health', (_, res) => res.json({ ok: true }));
  return app;
}
module.exports = { buildServer };
