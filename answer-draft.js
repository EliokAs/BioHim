// ═══════════════════════════════════════════════════════════════
// ANSWER DRAFT — автосохранение ответов каждые 30 сек.
// Подключить: <script src="answer-draft.js"></script> после script.js
// ═══════════════════════════════════════════════════════════════

const DRAFT = (() => {

  const PREFIX = 'biohim_draft_';
  let _interval = null;

  // ── Ключ черновика: тип + id задания + id ученика ─────────────
  function _key(type, itemId) {
    const uid = (typeof currentUser !== 'undefined' && currentUser?.id) || 'anon';
    return `${PREFIX}${type}_${itemId}_${uid}`;
  }

  // ── Сохранить ─────────────────────────────────────────────────
  function save(type, itemId, answers) {
    try {
      localStorage.setItem(_key(type, itemId), JSON.stringify({
        answers,
        savedAt: Date.now()
      }));
    } catch(e) {}
  }

  // ── Загрузить ─────────────────────────────────────────────────
  function load(type, itemId) {
    try {
      const raw = localStorage.getItem(_key(type, itemId));
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // ── Удалить после сдачи ───────────────────────────────────────
  function clear(type, itemId) {
    try {
      localStorage.removeItem(_key(type, itemId));
    } catch(e) {}
  }

  // ── Запустить автосохранение ──────────────────────────────────
  // getAnswers — функция, возвращающая текущий объект ответов
  function startAutoSave(type, itemId, getAnswers) {
    stopAutoSave();
    _interval = setInterval(() => {
      const ans = getAnswers();
      if (ans && Object.keys(ans).length) save(type, itemId, ans);
    }, 30_000);
  }

  function stopAutoSave() {
    if (_interval) { clearInterval(_interval); _interval = null; }
  }

  // ── Баннер восстановления ─────────────────────────────────────
  function offerRestore(type, itemId, onRestore) {
    const draft = load(type, itemId);
    if (!draft || !Object.keys(draft.answers || {}).length) return;

    const ago = Math.round((Date.now() - draft.savedAt) / 60000);
    const agoText = ago < 1 ? 'только что' : `${ago} мин. назад`;
    const count = Object.keys(draft.answers).length;

    const banner = document.createElement('div');
    banner.id = 'draft-banner';
    banner.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      z-index:99998;background:var(--white,#fff);
      border:2px solid var(--green-light,#52b788);
      border-radius:14px;padding:14px 20px;
      box-shadow:0 8px 32px rgba(27,67,50,.18);
      display:flex;align-items:center;gap:14px;
      font-family:Nunito,sans-serif;font-size:0.9rem;
      animation:draftPop .3s ease;min-width:300px;max-width:90vw;
    `;
    banner.innerHTML = `
      <div style="font-size:1.5rem">💾</div>
      <div style="flex:1">
        <div style="font-weight:800;color:var(--accent,#1b4332)">Найден черновик</div>
        <div style="color:var(--text3,#888);font-size:0.8rem">${count} ответов · сохранён ${agoText}</div>
      </div>
      <button id="draft-btn-restore" style="
        background:var(--green-mid,#40916c);color:#fff;border:none;
        padding:8px 16px;border-radius:9px;cursor:pointer;
        font-weight:700;font-family:Nunito,sans-serif;font-size:0.88rem">
        Восстановить
      </button>
      <button id="draft-btn-discard" style="
        background:none;border:1.5px solid var(--green-pale,#b7e4c7);
        color:var(--text3,#888);padding:8px 12px;border-radius:9px;
        cursor:pointer;font-family:Nunito,sans-serif;font-size:0.88rem">
        Начать заново
      </button>
    `;
    document.body.appendChild(banner);

    banner.querySelector('#draft-btn-restore').onclick = () => {
      onRestore(draft.answers);
      banner.remove();
    };
    banner.querySelector('#draft-btn-discard').onclick = () => {
      clear(type, itemId);
      banner.remove();
    };
  }

  // ── CSS ───────────────────────────────────────────────────────
  (function injectStyles() {
    if (document.getElementById('draft-styles')) return;
    const s = document.createElement('style');
    s.id = 'draft-styles';
    s.textContent = `
      @keyframes draftPop {
        from { transform:translateX(-50%) translateY(20px); opacity:0; }
        to   { transform:translateX(-50%) translateY(0);    opacity:1; }
      }
    `;
    document.head.appendChild(s);
  })();

  return { save, load, clear, startAutoSave, stopAutoSave, offerRestore };
})();


// ═══════════════════════════════════════════════════════════════
// Патчи — навешиваем после загрузки script.js
// ═══════════════════════════════════════════════════════════════

window.addEventListener('load', () => {

  // ────────────────────────────────────────────────────────────
  // ТЕСТ
  // ────────────────────────────────────────────────────────────
  if (typeof takeTest === 'function') {
    const _orig = takeTest;
    window.takeTest = function(id, ...rest) {
      const result = _orig.call(this, id, ...rest);
      // Предлагаем восстановить черновик
      DRAFT.offerRestore('test', id, (saved) => {
        Object.assign(_testAnswers, saved);
        if (typeof renderTakeTestBody === 'function') renderTakeTestBody();
      });
      // Запускаем автосохранение
      DRAFT.startAutoSave('test', id, () => ({ ..._testAnswers }));
      return result;
    };
  }

  if (typeof submitTest === 'function') {
    const _orig = submitTest;
    window.submitTest = function(...args) {
      const id = typeof _takingTest !== 'undefined' && _takingTest?.id;
      const result = _orig.apply(this, args);
      if (id) DRAFT.clear('test', id);
      DRAFT.stopAutoSave();
      return result;
    };
  }

  // ────────────────────────────────────────────────────────────
  // ДЗ
  // ────────────────────────────────────────────────────────────
  if (typeof doHW === 'function') {
    const _orig = doHW;
    window.doHW = function(id, ...rest) {
      const result = _orig.call(this, id, ...rest);
      DRAFT.offerRestore('hw', id, (saved) => {
        Object.assign(_hwAnswers, saved);
        // Восстанавливаем textarea-ответы в DOM
        Object.entries(saved).forEach(([qId, val]) => {
          const el = document.querySelector(`[onchange*="${qId}"]`);
          if (el && el.tagName === 'TEXTAREA') el.value = val;
          // Опции
          if (typeof val === 'string') {
            document.querySelectorAll(`.option-list .option-item`).forEach(opt => {
              if (opt.textContent.trim() === val) opt.classList.add('selected');
            });
          }
        });
      });
      DRAFT.startAutoSave('hw', id, () => ({ ..._hwAnswers }));
      return result;
    };
  }

  if (typeof submitHW === 'function') {
    const _orig = submitHW;
    window.submitHW = function(...args) {
      const id = typeof _doingHW !== 'undefined' && _doingHW?.id;
      const result = _orig.apply(this, args);
      if (id) DRAFT.clear('hw', id);
      DRAFT.stopAutoSave();
      return result;
    };
  }

  // ────────────────────────────────────────────────────────────
  // ПРОБНИК
  // ────────────────────────────────────────────────────────────
  if (typeof startTrial === 'function') {
    const _orig = startTrial;
    window.startTrial = function(id, ...rest) {
      const result = _orig.call(this, id, ...rest);
      DRAFT.offerRestore('trial', id, (saved) => {
        Object.assign(_trialAnswers, saved);
        if (typeof renderTrialTakeBody === 'function') renderTrialTakeBody();
      });
      DRAFT.startAutoSave('trial', id, () => ({ ..._trialAnswers }));
      return result;
    };
  }

  if (typeof submitTrial === 'function') {
    const _orig = submitTrial;
    window.submitTrial = function(...args) {
      const id = typeof _activeTrial !== 'undefined' && _activeTrial?.id;
      const result = _orig.apply(this, args);
      if (id) DRAFT.clear('trial', id);
      DRAFT.stopAutoSave();
      return result;
    };
  }

});
