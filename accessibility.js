// ═══════════════════════════════════════════════
// accessibility.js — доступность платформы Осмос
// Focus-trap в модалах/drawer'ах, закрытие по Escape,
// ARIA live-регион для уведомлений, keyboard nav
// ═══════════════════════════════════════════════

// ── Селекторы фокусируемых элементов ──
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// ── Стек открытых диалогов (для вложенных модалов) ──
const _modalStack = [];

/**
 * Активировать focus-trap внутри элемента.
 * Возвращает функцию для деактивации.
 */
function trapFocus(el) {
  const focusable = () => Array.from(el.querySelectorAll(FOCUSABLE)).filter(
    e => !e.closest('[hidden]') && e.offsetParent !== null
  );

  // Сохраняем элемент, который был в фокусе до открытия
  const previouslyFocused = document.activeElement;

  // Фокус на первый доступный элемент внутри диалога
  requestAnimationFrame(() => {
    const first = focusable()[0];
    if (first) first.focus();
  });

  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) { e.preventDefault(); return; }

    const first = items[0];
    const last  = items[items.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  el.addEventListener('keydown', onKeyDown);

  return function release() {
    el.removeEventListener('keydown', onKeyDown);
    // Возвращаем фокус туда, откуда открыли диалог
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  };
}

// ── Глобальный обработчик Escape ──
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (_modalStack.length === 0) return;

  e.preventDefault();
  const top = _modalStack[_modalStack.length - 1];
  if (top && typeof top.close === 'function') top.close();
});

// ── Патч openModal / closeModal ──
// Ждём загрузки script.js, затем оборачиваем оригинальные функции
window.addEventListener('load', function() {
  const origOpen  = window.openModal;
  const origClose = window.closeModal;

  if (typeof origOpen === 'function') {
    window.openModal = function(id, ...args) {
      origOpen(id, ...args);

      const el = document.getElementById(id);
      if (!el) return;

      // ARIA
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('role', 'dialog');
      if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
        const titleEl = el.querySelector('.drawer-title, .modal-title');
        if (titleEl) {
          if (!titleEl.id) titleEl.id = id + '-title';
          el.setAttribute('aria-labelledby', titleEl.id);
        }
      }

      const release = trapFocus(el);
      _modalStack.push({ id, close: () => window.closeModal(id), release });
    };
  }

  if (typeof origClose === 'function') {
    window.closeModal = function(id, ...args) {
      origClose(id, ...args);

      const idx = _modalStack.findLastIndex(m => m.id === id);
      if (idx !== -1) {
        const entry = _modalStack.splice(idx, 1)[0];
        if (entry.release) entry.release();
      }
    };
  }
});

// ── ARIA live-регион для showNotif ──
// Создаём скрытый live-регион, чтобы screen readers озвучивали уведомления
(function() {
  const liveRegion = document.createElement('div');
  liveRegion.id = 'aria-live-notif';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  Object.assign(liveRegion.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
  document.body.appendChild(liveRegion);

  // Патч showNotif после загрузки
  window.addEventListener('load', function() {
    const origShowNotif = window.showNotif;
    if (typeof origShowNotif === 'function') {
      window.showNotif = function(msg, ...args) {
        origShowNotif(msg, ...args);
        // Сбрасываем и снова ставим текст — это гарантирует повторное озвучивание
        liveRegion.textContent = '';
        requestAnimationFrame(() => {
          // Убираем эмодзи для screen readers (они читаются плохо)
          liveRegion.textContent = (msg || '').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
        });
      };
    }
  });
})();

// ── Keyboard navigation для nav-item в sidebar ──
// Позволяет перемещаться стрелками вверх/вниз по меню
document.addEventListener('keydown', function(e) {
  if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const focused = document.activeElement;
  if (!focused || !focused.classList.contains('nav-item')) return;

  e.preventDefault();
  const items = Array.from(document.querySelectorAll('.nav-item'));
  const idx = items.indexOf(focused);
  if (idx === -1) return;

  const next = e.key === 'ArrowDown'
    ? items[idx + 1]
    : items[idx - 1];
  if (next) next.focus();
});

// ── Автоматически добавляем aria-label кнопкам закрытия модалов ──
// Охватывает все drawer-close и modal-close, добавленные динамически
const _closeObserver = new MutationObserver(() => {
  document.querySelectorAll('.drawer-close:not([aria-label]), .modal-close:not([aria-label])').forEach(btn => {
    btn.setAttribute('aria-label', 'Закрыть');
  });
  // drawer-bg без role — добавляем
  document.querySelectorAll('.drawer-bg:not([role])').forEach(el => {
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const titleEl = el.querySelector('.drawer-title');
    if (titleEl) {
      if (!titleEl.id) titleEl.id = (el.id || 'drawer') + '-title';
      el.setAttribute('aria-labelledby', titleEl.id);
    }
  });
  // modal-bg без role
  document.querySelectorAll('.modal-bg:not([role])').forEach(el => {
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const titleEl = el.querySelector('.modal-title');
    if (titleEl) {
      if (!titleEl.id) titleEl.id = (el.id || 'modal') + '-title';
      el.setAttribute('aria-labelledby', titleEl.id);
    }
  });
});
_closeObserver.observe(document.body, { childList: true, subtree: true });

// Первый запуск для уже существующих элементов
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.drawer-close:not([aria-label]), .modal-close:not([aria-label])').forEach(btn => {
    btn.setAttribute('aria-label', 'Закрыть');
  });
});
