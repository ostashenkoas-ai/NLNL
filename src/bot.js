const { Telegraf, Markup } = require('telegraf');
const prisma = require('./prisma');

const TEXTS = {
  ru: {
    chooseLang: '🌐 Выберите язык / Kies taal',
    langRu: 'Русский', langNl: 'Nederlands',
    hello: '👋 Привет! Выберите:',
    iMaster: 'Я мастер', findMaster: 'Найти мастера',
    cityAsk: '🧭 В каком вы городе?', cityFindAsk: '🧭 В каком городе ищете мастера?',
    serviceAsk: '💇 Выберите услугу:', serviceFindAsk: '💇 Какую услугу ищете?',
    budgetAsk: '💶 Укажите бюджет (EUR) или /skip',
    minPriceAsk: '💰 Введите минимальную цену (EUR):', maxPriceAsk: 'Максимальная цена (или /skip):',
    shortDescAsk: 'Коротко опишите услуги (или /skip):', phoneAsk: 'Телефон (или /skip):',
    langsAsk: 'На каких языках работаете? (через запятую, или /skip)',
    regDone: '✅ Регистрация мастера завершена. Используйте /mystats для статистики.',
    sharePhone: 'Поделитесь номером телефона:',
    listFound: (n)=>`Найдено мастеров: ${n} (показываю до 10)`,
    noneFound: 'Мастера не найдены. Попробуйте другой город или услугу.',
    notEnough: 'Недостаточно данных. Введите /find.',
    cmds: 'Команды: /register — регистрация мастера, /find — поиск мастера',
    newLeadForMasterLimited: (s)=>`📩 Новый лид (${s})\nℹ️ Оформите подписку или оплатите лид, чтобы получить контакт клиента.`,
    newLeadForMasterFull: (s, city, budget, clientName, clientUsername, clientPhone) =>
      `📩 Новый лид: ${s}\n📍 Город: ${city||'—'}\n💶 Бюджет: ${budget?budget+'€':'—'}\n👤 Клиент: ${clientName}${clientUsername?' (@'+clientUsername+')':''}\n📞 Телефон: ${clientPhone||'—'}`
  },
  nl: {
    chooseLang: '🌐 Kies je taal / Выберите язык',
    langRu: 'Русский', langNl: 'Nederlands',
    hello: '👋 Hoi! Kies een optie:',
    iMaster: 'Ik ben een master', findMaster: 'Zoek een master',
    cityAsk: '🧭 In welke stad bent u?', cityFindAsk: '🧭 In welke stad zoekt u een master?',
    serviceAsk: '💇 Kies uw dienst:', serviceFindAsk: '💇 Welke dienst zoekt u?',
    budgetAsk: '💶 Voer budget in (EUR) of /skip',
    minPriceAsk: '💰 Voer minimumprijs in (EUR):', maxPriceAsk: 'Maximale prijs (of /skip):',
    shortDescAsk: 'Korte beschrijving (of /skip):', phoneAsk: 'Telefoon (of /skip):',
    langsAsk: 'Welke talen? (komma-gescheiden, of /skip)',
    regDone: '✅ Registratie voltooid. Gebruik /mystats voor statistiek.',
    sharePhone: 'Deel uw telefoonnummer:',
    listFound: (n)=>`Gevonden masters: ${n} (max 10 getoond)`,
    noneFound: 'Geen masters gevonden. Probeer een andere stad of dienst.',
    notEnough: 'Onvoldoende data. Gebruik /find.',
    cmds: 'Commando’s: /register — registratie, /find — zoeken',
    newLeadForMasterLimited: (s)=>`📩 Nieuwe lead (${s})\nℹ️ Neem een abonnement of betaal de lead om contactgegevens te ontvangen.`,
    newLeadForMasterFull: (s, city, budget, clientName, clientUsername, clientPhone) =>
      `📩 Nieuwe lead: ${s}\n📍 Stad: ${city||'—'}\n💶 Budget: ${budget?budget+'€':'—'}\n👤 Klant: ${clientName}${clientUsername?' (@'+clientUsername+')':''}\n📞 Telefoon: ${clientPhone||'—'}`
  }
};
function t(loc, key, ...args) {
  const dict = TEXTS[loc] || TEXTS.ru;
  const val = dict[key]; return typeof val === 'function' ? val(...args) : val;
}
async function getLocale(ctx) {
  const u = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
  return (u?.uiLocale) || 'ru';
}
function fmtUser(u){ const name=[u.firstName,u.lastName].filter(Boolean).join(' ')||'Без имени'; return `${name}${u.username?' (@'+u.username+')':''}`; }
const state=new Map(); const getState=id=>state.get(id)||{}; const setState=(id,p)=>state.set(id,{...(state.get(id)||{}),...p}); const clearState=id=>state.delete(id);
async function ensureUser(ctx, roleDefault='CLIENT'){
  const tgId=String(ctx.from.id);
  let user=await prisma.user.findUnique({ where:{ telegramId: tgId }});
  if(!user){ user=await prisma.user.create({ data:{ telegramId: tgId, role: roleDefault, username: ctx.from.username||null, firstName: ctx.from.first_name||null, lastName: ctx.from.last_name||null }}); }
  return user;
}
async function askService(ctx, prompt){
  const services=await prisma.service.findMany({ orderBy:{ name:'asc' }, take:12 });
  if(!services.length){ await ctx.reply('Список услуг пуст. Добавьте услуги в админ-панели.'); return; }
  const rows=services.map(s=>[Markup.button.callback(s.name,`srv_${s.id}`)]);
  await ctx.reply(prompt, Markup.inlineKeyboard(rows));
}
async function finalizeMaster(ctx){
  const s=(getState(ctx.chat.id).data)||{}; const tgId=String(ctx.from.id);
  const user=await prisma.user.upsert({
    where:{ telegramId: tgId },
    create:{ telegramId: tgId, role:'MASTER', username: ctx.from.username||null, firstName: ctx.from.first_name||null, lastName: ctx.from.last_name||null, city: s.city||null, phone: s.phone||null, languages: s.languages||null },
    update:{ role:'MASTER', city: s.city||null, phone: s.phone||null, languages: s.languages||null }
  });
  if(s.serviceId){
    const ex=await prisma.masterService.findUnique({ where:{ masterId_serviceId:{ masterId: user.id, serviceId: s.serviceId } }});
    if(ex){ await prisma.masterService.update({ where:{ id: ex.id }, data:{ priceFrom: s.priceFrom||null, priceTo: s.priceTo||null, description: s.description||null }}); }
    else { await prisma.masterService.create({ data:{ masterId: user.id, serviceId: s.serviceId, priceFrom: s.priceFrom||null, priceTo: s.priceTo||null, description: s.description||null }}); }
  }
  const L=await getLocale(ctx); await ctx.reply(t(L,'regDone')); clearState(ctx.chat.id);
}
async function hasActiveSubscription(masterId){
  const now=new Date(); const sub=await prisma.subscription.findFirst({ where:{ masterId, status:'ACTIVE', periodEnd:{ gt: now }}, orderBy:{ periodEnd:'desc' }});
  return !!sub;
}
function buildBot(token){
  const bot=new Telegraf(token);

  bot.start(async (ctx)=>{
    await ensureUser(ctx,'CLIENT');
    await ctx.reply(t('ru','chooseLang'), Markup.inlineKeyboard([[Markup.button.callback(TEXTS.ru.langRu,'lang_ru'), Markup.button.callback(TEXTS.ru.langNl,'lang_nl')]]));
  });
  bot.action('lang_ru', async ctx=>{
    await prisma.user.upsert({ where:{ telegramId: String(ctx.from.id) }, update:{ uiLocale:'ru' }, create:{ telegramId: String(ctx.from.id), role:'CLIENT', uiLocale:'ru' }});
    await ctx.answerCbQuery('Русский ✔️');
    await ctx.reply(t('ru','hello'), Markup.inlineKeyboard([[Markup.button.callback(t('ru','iMaster'),'role_master'), Markup.button.callback(t('ru','findMaster'),'find_master')]]));
  });
  bot.action('lang_nl', async ctx=>{
    await prisma.user.upsert({ where:{ telegramId: String(ctx.from.id) }, update:{ uiLocale:'nl' }, create:{ telegramId: String(ctx.from.id), role:'CLIENT', uiLocale:'nl' }});
    await ctx.answerCbQuery('Nederlands ✔️');
    await ctx.reply(t('nl','hello'), Markup.inlineKeyboard([[Markup.button.callback(t('nl','iMaster'),'role_master'), Markup.button.callback(t('nl','findMaster'),'find_master')]]));
  });

  bot.command('register', async ctx=>{ const L=await getLocale(ctx); setState(ctx.chat.id,{ step:'reg_city', data:{ role:'MASTER' }}); await ctx.reply(t(L,'cityAsk')); });
  bot.command('find', async ctx=>{ const L=await getLocale(ctx); setState(ctx.chat.id,{ step:'find_city', data:{} }); await ctx.reply(t(L,'cityFindAsk')); });
  bot.action('role_master', async ctx=>{ const L=await getLocale(ctx); await ctx.answerCbQuery(); setState(ctx.chat.id,{ step:'reg_city', data:{ role:'MASTER' }}); await ctx.reply(t(L,'cityAsk')); });
  bot.action('find_master', async ctx=>{ const L=await getLocale(ctx); await ctx.answerCbQuery(); setState(ctx.chat.id,{ step:'find_city', data:{} }); await ctx.reply(t(L,'cityFindAsk')); });

  bot.action(/srv_\d+/, async ctx=>{
    const id=Number(ctx.callbackQuery.data.split('_')[1]); const s=getState(ctx.chat.id); const L=await getLocale(ctx);
    if(s.step==='reg_service'){ setState(ctx.chat.id,{ data:{ ...(s.data||{}), serviceId:id }, step:'reg_price_from' }); await ctx.answerCbQuery(); await ctx.reply(t(L,'minPriceAsk')); }
    else if(s.step==='find_service'){ setState(ctx.chat.id,{ data:{ ...(s.data||{}), serviceId:id }, step:'find_budget' }); await ctx.answerCbQuery(); await ctx.reply(t(L,'budgetAsk')); }
    else { await ctx.answerCbQuery(); }
  });

  bot.on('contact', async ctx=>{
    const s=getState(ctx.chat.id); if(s.step!=='share_contact' || !s.data?.pendingLead) return;
    const contact=ctx.message.contact; const pending=s.data.pendingLead; const client=await ensureUser(ctx,'CLIENT');
    await prisma.user.update({ where:{ id: client.id }, data:{ phone: contact.phone_number||null }});
    const master=await prisma.user.findUnique({ where:{ id: pending.masterId }}); const service=await prisma.service.findUnique({ where:{ id: pending.serviceId }});
    const lead=await prisma.lead.create({ data:{
      status:'NEW', clientTelegramId:String(ctx.from.id), clientUsername:ctx.from.username||null,
      clientName:[contact.first_name,contact.last_name].filter(Boolean).join(' ')||(ctx.from.first_name||null),
      clientPhone:contact.phone_number||null, city:s.data.city||null, budget:s.data.budget||null, note:s.data.note||null,
      masterId: pending.masterId, serviceId: pending.serviceId
    }, include:{ service:true }});
    const LmUser=await prisma.user.findUnique({ where:{ id: master.id }}); const Lm=(LmUser?.uiLocale)||'ru';
    const hasSub=await hasActiveSubscription(master.id);
    if(hasSub){
      const text=TEXTS[Lm].newLeadForMasterFull(service.name, lead.city, lead.budget, lead.clientName, lead.clientUsername, lead.clientPhone);
      try{ await ctx.telegram.sendMessage(Number(master.telegramId), text);}catch(e){}
      await prisma.lead.update({ where:{ id: lead.id }, data:{ status:'SENT' }});
    } else {
      const text=TEXTS[Lm].newLeadForMasterLimited(service.name);
      try{ await ctx.telegram.sendMessage(Number(master.telegramId), text);}catch(e){}
      // lead остаётся NEW (пока у нас всё бесплатно без оплат)
    }
    const L=await getLocale(ctx);
    await ctx.reply(L==='nl' ? '✅ Contact is verzonden naar de master. Zij nemen contact met u op.' : '✅ Контакт передан мастеру. Он свяжется с вами.');
    clearState(ctx.chat.id);
  });

  bot.on('text', async ctx=>{
    const s=getState(ctx.chat.id); const text=(ctx.message.text||'').trim(); const L=await getLocale(ctx);
    if(text==='/skip'){
      if(s.step==='find_budget'){ setState(ctx.chat.id,{ step:'show_masters' }); await showMastersList(ctx,L); return; }
      if(s.step?.startsWith('reg_')){
        if(s.step==='reg_price_from'){ setState(ctx.chat.id,{ step:'reg_price_to' }); await ctx.reply(t(L,'maxPriceAsk')); return; }
        if(s.step==='reg_price_to'){ setState(ctx.chat.id,{ step:'reg_description' }); await ctx.reply(t(L,'shortDescAsk')); return; }
        if(s.step==='reg_description'){ setState(ctx.chat.id,{ step:'reg_phone' }); await ctx.reply(t(L,'phoneAsk')); return; }
        if(s.step==='reg_phone'){ setState(ctx.chat.id,{ step:'reg_languages' }); await ctx.reply(t(L,'langsAsk')); return; }
      }
    }
    switch(s.step){
      case 'reg_city':
        setState(ctx.chat.id,{ data:{ ...(s.data||{}), city:text }, step:'reg_service' }); await askService(ctx, t(L,'serviceAsk')); break;
      case 'reg_price_from': {
        const val=parseInt(text,10); if(Number.isNaN(val)){ await ctx.reply(L==='nl'?'Voer een getal in, bijv. 50':'Введите число, например: 50'); return; }
        setState(ctx.chat.id,{ data:{ ...(s.data||{}), priceFrom:val }, step:'reg_price_to' }); await ctx.reply(t(L,'maxPriceAsk')); break;
      }
      case 'reg_price_to': {
        if(text!=='/skip'){ const val=parseInt(text,10); if(Number.isNaN(val)){ await ctx.reply(L==='nl'?'Voer een getal in of /skip':'Введите число или /skip'); return; }
          setState(ctx.chat.id,{ data:{ ...(s.data||{}), priceTo:val }, step:'reg_description' }); }
        else setState(ctx.chat.id,{ step:'reg_description' });
        await ctx.reply(t(L,'shortDescAsk')); break;
      }
      case 'reg_description':
        if(text!=='/skip') setState(ctx.chat.id,{ data:{ ...(s.data||{}), description:text }, step:'reg_phone' }); else setState(ctx.chat.id,{ step:'reg_phone' });
        await ctx.reply(t(L,'phoneAsk')); break;
      case 'reg_phone':
        if(text!=='/skip') setState(ctx.chat.id,{ data:{ ...(s.data||{}), phone:text }, step:'reg_languages' }); else setState(ctx.chat.id,{ step:'reg_languages' });
        await ctx.reply(t(L,'langsAsk')); break;
      case 'reg_languages':
        if(text!=='/skip') setState(ctx.chat.id,{ data:{ ...(s.data||{}), languages:text }, step:'reg_finish' }); else setState(ctx.chat.id,{ step:'reg_finish' });
        await finalizeMaster(ctx); break;
      case 'find_city':
        setState(ctx.chat.id,{ data:{ ...(s.data||{}), city:text }, step:'find_service' }); await askService(ctx, t(L,'serviceFindAsk')); break;
      case 'find_budget': {
        if(text!=='/skip'){ const val=parseInt(text,10); if(Number.isNaN(val)){ await ctx.reply(L==='nl'?'Voer een getal in of /skip':'Введите число или /skip'); return; }
          setState(ctx.chat.id,{ data:{ ...(s.data||{}), budget:val }, step:'show_masters' }); }
        else setState(ctx.chat.id,{ step:'show_masters' });
        await showMastersList(ctx,L); break;
      }
      default: await ctx.reply(t(L,'cmds'));
    }
  });

  async function showMastersList(ctx,L){
    const s=getState(ctx.chat.id); const dat=s.data||{};
    if(!dat.city || !dat.serviceId){ await ctx.reply(t(L,'notEnough')); clearState(ctx.chat.id); return; }
    const results=await prisma.masterService.findMany({
      where:{ serviceId: dat.serviceId, master:{ isBanned:false, city:{ contains: dat.city, mode:'insensitive' }, role:'MASTER' }},
      include:{ master:true, service:true }, take:20
    });
    if(!results.length){ await ctx.reply(t(L,'noneFound')); clearState(ctx.chat.id); return; }
    await ctx.reply(t(L,'listFound', Math.min(10, results.length)));
    let shown=0;
    for(const ms of results){
      if(typeof dat.budget==='number'){ const from=ms.priceFrom ?? 0; const to=ms.priceTo ?? 999999; if(!(dat.budget>=from && dat.budget<=to)) continue; }
      const price=(ms.priceFrom||ms.priceTo)?`${ms.priceFrom||'?'}–${ms.priceTo||'?'}€`:'по запросу';
      const desc=ms.description ? (ms.description.length>200?ms.description.slice(0,200)+'…':ms.description) : '—';
      const card=[`👤 ${fmtUser(ms.master)}`, `💇 ${ms.service.name}`, `📍 ${ms.master.city||'—'}`, `💰 ${price}`, `📝 ${desc}`].join('\n');
      await ctx.reply(card, Markup.inlineKeyboard([[Markup.button.callback(L==='nl'?'Verstuur aanvraag':'Отправить заявку', `lead_${ms.serviceId}_to_${ms.masterId}`)]]));
      if(++shown>=10) break;
    }
    setState(ctx.chat.id,{ step:'await_lead', data: dat });
  }

  bot.action(/lead_(\\d+)_to_(\\d+)/, async ctx=>{
    await ctx.answerCbQuery();
    const serviceId=Number(ctx.match[1]); const masterId=Number(ctx.match[2]);
    const dat=getState(ctx.chat.id).data||{};
    setState(ctx.chat.id,{ step:'share_contact', data:{ ...dat, pendingLead:{ serviceId, masterId }}});
    const L=await getLocale(ctx);
    await ctx.reply(t(L,'sharePhone'),
      Markup.keyboard([Markup.button.contactRequest('📞 ' + (L==='nl'?'Deel telefoonnummer':'Поделиться контактом'))]).oneTime().resize()
    );
  });

  bot.command('mystats', async ctx=>{
    const dbUser=await prisma.user.findUnique({ where:{ telegramId: String(ctx.from.id) }});
    if(!dbUser || dbUser.role!=='MASTER'){ await ctx.reply('Доступно только мастерам. /register'); return; }
    const total=await prisma.lead.count({ where:{ masterId: dbUser.id }});
    const won=await prisma.lead.count({ where:{ masterId: dbUser.id, status:'WON' }});
    const contacted=await prisma.lead.count({ where:{ masterId: dbUser.id, status:'CONTACTED' }});
    await ctx.reply(`📊 Лиды:\nВсего: ${total}\nСвязался: ${contacted}\nСделка: ${won}`);
  });

  return bot;
}
module.exports = { buildBot };
