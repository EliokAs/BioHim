/**
 * BioХим — Telegram Notification Bot
 * ====================================
 * Ученик пишет /start → получает свой chat_id → вводит его в платформу.
 * Платформа вызывает POST /send → бот отправляет сообщение.
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

// ─── КОНФИГ ────────────────────────────────────────────────
const BOT_TOKEN  = process.env.BOT_TOKEN  || '8716217176:AAHEOk5AiddkptiWRyT6y67k1KGv8hSXfdk';
const PORT       = process.env.PORT       || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'biohim_secret_2025';
// ──────────────────────────────────────────────────────────

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// In-memory store: username → chat_id  (для /start по username)
const userMap = new Map(); // { '@username' : chat_id }

// ─── Telegram API helpers ─────────────────────────────────
function tgRequest(method, params){
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ ok: false, error: e.message }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendMessage(chatId, text) {
  return tgRequest('sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  });
}

// ─── Handle incoming Telegram update ─────────────────────
function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId   = msg.chat.id;
  const username = msg.from.username ? '@' + msg.from.username : null;
  const text     = (msg.text || '').trim();
  const firstName = msg.from.first_name || 'Ученик';

  // Save mapping username → chatId
  if (username) userMap.set(username.toLowerCase(), chatId);

  console.log(`[TG] ${username || chatId}: ${text}`);

  if (text === '/start' || text.startsWith('/start ')) {
    sendMessage(chatId,
      `👋 Привет, <b>${firstName}</b>!\n\n` +
      `Это бот платформы <b>BioХим</b>.\n\n` +
      `Чтобы получать уведомления, скопируй свой Chat ID и вставь его в настройки платформы:\n\n` +
      `<code>${chatId}</code>\n\n` +
      `📱 <i>Нажми на число выше чтобы скопировать</i>`
    );
    return;
  }

  if (text === '/id') {
    sendMessage(chatId, `Твой Chat ID: <code>${chatId}</code>`);
    return;
  }

  if (text === '/help') {
    sendMessage(chatId,
      `ℹ️ <b>Команды бота BioХим:</b>\n\n` +
      `/start — показать твой Chat ID\n` +
      `/id — повторно показать Chat ID\n` +
      `/help — эта справка\n\n` +
      `Вставь Chat ID в <b>настройки → уведомления</b> на платформе.`
    );
    return;
  }

  // Default reply
  sendMessage(chatId,
    `Используй /start чтобы получить свой Chat ID для платформы BioХим.`
  );
}

// ─── HTTP Server ──────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname  = parsedUrl.pathname;

  // CORS headers (чтобы браузер мог делать fetch)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── POST /telegram-webhook — принимаем апдейты от Telegram ──
  if (req.method === 'POST' && pathname === '/telegram-webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        handleUpdate(update);
        res.writeHead(200);
        res.end('ok');
      } catch(e) {
        console.error('Webhook parse error:', e);
        res.writeHead(400);
        res.end('bad request');
      }
    });
    return;
  }

  // ── POST /send — отправить сообщение ученику ──
  if (req.method === 'POST' && pathname === '/send') {
    // Проверяем секрет
    const secret = req.headers['x-secret'] || parsedUrl.query.secret;
    if (secret !== WEBHOOK_SECRET) {
      res.writeHead(403);
      res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chat_id, text } = JSON.parse(body);
        if (!chat_id || !text) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'chat_id and text required' }));
          return;
        }
        const result = await sendMessage(chat_id, text);
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── GET /ping — проверка что сервер живой ──
  if (pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bot: BOT_TOKEN.split(':')[0], uptime: process.uptime() }));
    return;
  }

  // ── GET /set-webhook — установить webhook (запустить один раз) ──
  if (pathname === '/set-webhook') {
    const webhookUrl = parsedUrl.query.url;
    if (!webhookUrl) {
      res.writeHead(400);
      res.end('?url=https://your-server.com required');
      return;
    }
    tgRequest('setWebhook', { url: webhookUrl + '/telegram-webhook' })
      .then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
    return;
  }

  // ── GET /delete-webhook — убрать webhook (для polling) ──
  if (pathname === '/delete-webhook') {
    tgRequest('deleteWebhook', {})
      .then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ─── Polling mode (если нет webhook) ─────────────────────
let pollingOffset = 0;
async function startPolling() {
  console.log('🤖 Starting polling mode...');
  while (true) {
    try {
      const result = await tgRequest('getUpdates', {
        offset: pollingOffset,
        timeout: 25,
        allowed_updates: ['message']
      });
      if (result.ok && result.result && result.result.length) {
        for (const update of result.result) {
          handleUpdate(update);
          pollingOffset = update.update_id + 1;
        }
      }
    } catch(e) {
      console.error('Polling error:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ─── Start ────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n✅ BioХим Telegram Bot сервер запущен на порту ${PORT}`);
  console.log(`   BOT_TOKEN: ${BOT_TOKEN.substring(0,10)}...`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /ping`);
  console.log(`     POST /send         (с заголовком X-Secret: ${WEBHOOK_SECRET})`);
  console.log(`     GET  /set-webhook?url=https://your-server.com`);
  console.log('');

  // Если нет переменной WEBHOOK_URL — используем polling
  if (!process.env.WEBHOOK_URL) {
    console.log('   Режим: POLLING (обновления каждые 25с)');
    console.log('   Для webhook: установи WEBHOOK_URL=https://твой-сервер.com\n');
    startPolling();
  } else {
    console.log(`   Режим: WEBHOOK (${process.env.WEBHOOK_URL})\n`);
  }
});
