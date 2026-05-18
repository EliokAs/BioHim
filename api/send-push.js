// api/send-push.js — Vercel Serverless Function
// Отправляет Web Push уведомление одному подписчику
// Использует Web Crypto (встроен в Node 18+, Edge Runtime) — без npm-зависимостей

export const config = { runtime: 'edge' };

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const PUSH_SECRET       = process.env.PUSH_SECRET;   // Секрет для защиты endpoint

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64uDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - s.length % 4);
  return Uint8Array.from(atob(s + pad), c => c.charCodeAt(0));
}

function b64uEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(b64u) {
  return crypto.subtle.importKey(
    'pkcs8', b64uDecode(b64u),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
}

async function makeVapidHeader(audience) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64uEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64uEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience, exp: now + 43200, sub: VAPID_SUBJECT
  })));
  const signing = new TextEncoder().encode(`${header}.${payload}`);
  const key = await importPrivateKey(VAPID_PRIVATE_KEY);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signing);
  const jwt = `${header}.${payload}.${b64uEncode(sig)}`;
  return `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;
}

// ── Encrypt payload (RFC 8291 / aes128gcm) ───────────────────────────────────

async function encryptPayload(subscription, payload) {
  const userPublicKey = b64uDecode(subscription.keys.p256dh);
  const userAuth      = b64uDecode(subscription.keys.auth);
  const payloadBytes  = new TextEncoder().encode(payload);

  // Server ephemeral key pair
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
  );
  const serverPublicRaw = await crypto.subtle.exportKey('raw', serverKeys.publicKey);

  // Import user's public key
  const userKey = await crypto.subtle.importKey(
    'raw', userPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: userKey }, serverKeys.privateKey, 256
  );

  // HKDF PRK = HMAC-SHA256(auth, sharedSecret)
  const authHmacKey = await crypto.subtle.importKey(
    'raw', userAuth, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const prk = await crypto.subtle.sign('HMAC', authHmacKey, sharedBits);

  // IKM
  const prkKey = await crypto.subtle.importKey(
    'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const keyInfoBuf = concat(
    new TextEncoder().encode('Content-Encoding: aes128gcm\x00'),
    new Uint8Array(1)  // empty context
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive content encryption key (16 bytes) and nonce (12 bytes)
  const cekInfo   = concat(new TextEncoder().encode('Content-Encoding: aes128gcm\x00'), new Uint8Array(1));
  const nonceInfo = concat(new TextEncoder().encode('Content-Encoding: nonce\x00'), new Uint8Array(1));

  // Full HKDF expand
  async function hkdfExpand(prkK, info, len) {
    const t = await crypto.subtle.sign('HMAC', prkK,
      concat(info, new Uint8Array([1]))
    );
    return new Uint8Array(t).slice(0, len);
  }

  // Build info with context per RFC 8291
  function buildInfo(type) {
    return concat(
      new TextEncoder().encode(`Content-Encoding: ${type}\x00`),
      new Uint8Array(1)
    );
  }

  const saltHmacKey = await crypto.subtle.importKey(
    'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const context = concat(
    new TextEncoder().encode('WebPush: info\x00'),
    userPublicKey,
    new Uint8Array(serverPublicRaw)
  );
  const prkFull = new Uint8Array(await crypto.subtle.sign('HMAC', saltHmacKey, sharedBits));
  const prkFullKey = await crypto.subtle.importKey(
    'raw', prkFull, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  const cek   = await hkdfExpand(prkFullKey, buildInfo('aes128gcm'), 16);
  const nonce = await hkdfExpand(prkFullKey, buildInfo('nonce'), 12);

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey(
    'raw', cek, { name: 'AES-GCM' }, false, ['encrypt']
  );
  // Padding: 2-byte length + record
  const padded = concat(payloadBytes, new Uint8Array([2])); // delimiter byte
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, padded
  );

  // Header: salt(16) + rs(4) + keylen(1) + serverPublicKey(65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const keylen = new Uint8Array([65]);
  const body = concat(salt, rs, keylen, new Uint8Array(serverPublicRaw), new Uint8Array(ciphertext));
  return body;
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(new Uint8Array(a.buffer || a), offset); offset += a.byteLength; }
  return out;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Auth: простой секрет в заголовке
  if (PUSH_SECRET) {
    const auth = req.headers.get('x-push-secret');
    if (auth !== PUSH_SECRET) return new Response('Unauthorized', { status: 401 });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response('Bad JSON', { status: 400 }); }

  const { subscription, payload } = body;
  if (!subscription?.endpoint || !subscription?.keys)
    return new Response('Missing subscription', { status: 400 });

  try {
    const endpoint = subscription.endpoint;
    const audience = new URL(endpoint).origin;
    const authorization = await makeVapidHeader(audience);

    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const encrypted  = await encryptPayload(subscription, payloadStr);

    const pushRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization':    authorization,
        'Content-Type':     'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL':              '86400',
        'Content-Length':   encrypted.byteLength,
      },
      body: encrypted,
    });

    if (!pushRes.ok) {
      const text = await pushRes.text();
      return new Response(JSON.stringify({ ok: false, status: pushRes.status, detail: text }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
