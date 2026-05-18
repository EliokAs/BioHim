// ═══════════════════════════════════════════════
// BioХим Service Worker v3 — кэш + Web Push
// ═══════════════════════════════════════════════

const CACHE = 'biohim-v3';
const ASSETS = ['./', './index-5.html', './script-5.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('api.telegram.org') ||
      e.request.url.includes('/api/send-push')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ══════════════════════════════════════════════
// PUSH — получение уведомления
// ══════════════════════════════════════════════

const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E%3Crect width='180' height='180' rx='40' fill='%232d6a4f'/%3E%3Ctext x='90' y='130' text-anchor='middle' font-family='Georgia,serif' font-size='96' font-weight='700' fill='white'%3EB%3C/text%3E%3C/svg%3E";

self.addEventListener('push', e => {
  let data = { title: 'BioХим', body: 'Новое уведомление', nav: '' };
  if (e.data) {
    try { Object.assign(data, e.data.json()); }
    catch { data.body = e.data.text(); }
  }
  e.waitUntil(self.registration.showNotification(data.title, {
    body:      data.body,
    icon:      ICON,
    badge:     ICON,
    tag:       data.nav || 'biohim',
    renotify:  true,
    data:      { nav: data.nav || '' },
    vibrate:   [200, 100, 200],
  }));
});

// ── Клик: фокусируем вкладку или открываем ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const nav = e.notification.data?.nav || '';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const win = list.find(c => c.url.includes('index') || c.url.endsWith('/'));
      if (win) { win.focus(); if (nav) win.postMessage({ type: 'navigate', nav }); }
      else clients.openWindow(self.location.origin + (nav ? `#${nav}` : ''));
    })
  );
});
