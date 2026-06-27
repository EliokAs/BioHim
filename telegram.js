// api/telegram.js  — Vercel Serverless Function
// Telegram Bot Token хранится в переменной окружения TELEGRAM_BOT_TOKEN
// Установить: Vercel Dashboard → Project → Settings → Environment Variables

export default async function handler(req, res) {
  // CORS: разрешить только с вашего домена (замените на свой)
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { method, payload, token: bodyToken } = req.body || {};
  const token = process.env.TELEGRAM_BOT_TOKEN || bodyToken;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'Bot token not configured' });
  }

  // Белый список разрешённых методов Telegram API
  const ALLOWED_METHODS = ['sendMessage', 'getMe'];
  if (!ALLOWED_METHODS.includes(method)) {
    return res.status(400).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}
