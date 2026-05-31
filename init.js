// ═══════════════════════════════════════════════
// init.js — инициализация приложения
// Вынесен из index.html для устранения unsafe-inline в CSP
// ═══════════════════════════════════════════════

// ── Скрыть search bar при прокрутке вниз, показать при прокрутке вверх ──
(function () {
  let lastY = 0;
  window.addEventListener('scroll', function () {
    const bar = document.querySelector('.global-search-bar');
    if (!bar) return;
    const y = window.scrollY;
    if (y > lastY && y > 60) {
      bar.classList.add('hidden');
    } else {
      bar.classList.remove('hidden');
    }
    lastY = y;
  }, { passive: true });
})();

// ── PWA: регистрация Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              if (typeof showNotif === 'function') {
                showNotif('🔄 Доступно обновление приложения. Обновите страницу.');
              }
            }
          });
        });
      })
      .catch(err => console.warn('SW registration failed:', err));
  });
}
