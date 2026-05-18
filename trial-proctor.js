// ═══════════════════════════════════════════════════════════════
// TRIAL PROCTOR — Fullscreen + блокировка вкладок + лог уходов
// Подключить: <script src="trial-proctor.js"></script>
// ПОСЛЕ script.js и gamification.js
// ═══════════════════════════════════════════════════════════════

const TP = (() => {

  // ── Лог уходов (хранится в объекте пробника) ──────────────────
  let _leaveLog = [];   // [{at, seconds_left, type}]
  let _active   = false;

  // ─────────────────────────────────────────────────────────────
  // Fullscreen
  // ─────────────────────────────────────────────────────────────
  function _enterFullscreen() {
    const el = document.getElementById('modal-take-trial') || document.documentElement;
    try {
      if      (el.requestFullscreen)       el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
    } catch(e) {}
  }

  function _exitFullscreen() {
    try {
      if      (document.exitFullscreen)       document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.mozCancelFullScreen)  document.mozCancelFullScreen();
    } catch(e) {}
  }

  // Если ученик вышел из фулскрина вручную — предупреждение и возврат
  function _onFullscreenChange() {
    if (!_active) return;
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    if (!isFS) {
      _recordLeave('fullscreen_exit');
      _showWarning('⚠️ Пожалуйста, вернитесь в полноэкранный режим', () => _enterFullscreen());
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Блокировка смены вкладки / сворачивания
  // ─────────────────────────────────────────────────────────────
  function _onVisibilityChange() {
    if (!_active) return;
    if (document.hidden) {
      _recordLeave('tab_switch');
      // Уведомление покажем когда вернутся
    } else {
      // Вернулись — показываем предупреждение
      const count = _leaveLog.filter(l => l.type === 'tab_switch').length;
      _showWarning(`⚠️ Переключение вкладок зафиксировано (${count} раз)`, null);
    }
  }

  // beforeunload — попытка уйти со страницы
  function _onBeforeUnload(e) {
    if (!_active) return;
    _recordLeave('page_unload');
    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  // ─────────────────────────────────────────────────────────────
  // Лог
  // ─────────────────────────────────────────────────────────────
  function _recordLeave(type) {
    _leaveLog.push({
      at: new Date().toLocaleTimeString('ru'),
      secondsLeft: typeof _trialSecondsLeft !== 'undefined' ? _trialSecondsLeft : null,
      type
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Предупреждение-баннер (не modal, чтобы не конфликтовать)
  // ─────────────────────────────────────────────────────────────
  function _showWarning(text, onClose) {
    const existing = document.getElementById('tp-warning');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'tp-warning';
    div.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:99999;
      background:linear-gradient(90deg,#c0392b,#e74c3c);
      color:#fff;padding:14px 20px;
      display:flex;align-items:center;gap:14px;
      font-family:Nunito,sans-serif;font-size:0.95rem;font-weight:700;
      box-shadow:0 4px 20px rgba(0,0,0,.4);
      animation:tpSlideDown .3s ease;
    `;
    div.innerHTML = `
      <span style="font-size:1.4rem">🚨</span>
      <span style="flex:1">${text}</span>
      ${onClose ? `<button onclick="this.parentNode.remove();(${onClose.toString()})()"
        style="background:#fff2;border:none;color:#fff;padding:6px 16px;border-radius:8px;
               cursor:pointer;font-weight:700;font-size:0.9rem">Вернуться</button>` :
        `<button onclick="this.parentNode.remove()"
        style="background:#fff2;border:none;color:#fff;padding:6px 16px;border-radius:8px;
               cursor:pointer;font-weight:700;font-size:0.9rem">OK</button>`}
    `;
    document.body.prepend(div);
    if (!onClose) setTimeout(() => div?.remove(), 4000);
  }

  // ─────────────────────────────────────────────────────────────
  // Публичные методы
  // ─────────────────────────────────────────────────────────────
  function start() {
    _leaveLog = [];
    _active   = true;
    _enterFullscreen();
    document.addEventListener('fullscreenchange',       _onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', _onFullscreenChange);
    document.addEventListener('mozfullscreenchange',    _onFullscreenChange);
    document.addEventListener('visibilitychange',       _onVisibilityChange);
    window.addEventListener('beforeunload',             _onBeforeUnload);
    _injectStyles();
  }

  function stop() {
    _active = false;
    _exitFullscreen();
    document.removeEventListener('fullscreenchange',       _onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', _onFullscreenChange);
    document.removeEventListener('mozfullscreenchange',    _onFullscreenChange);
    document.removeEventListener('visibilitychange',       _onVisibilityChange);
    window.removeEventListener('beforeunload',             _onBeforeUnload);
    document.getElementById('tp-warning')?.remove();
  }

  function getLog() { return [..._leaveLog]; }

  // ─────────────────────────────────────────────────────────────
  // CSS-анимация
  // ─────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('tp-styles')) return;
    const s = document.createElement('style');
    s.id = 'tp-styles';
    s.textContent = `
      @keyframes tpSlideDown {
        from { transform:translateY(-100%); opacity:0; }
        to   { transform:translateY(0);     opacity:1; }
      }
    `;
    document.head.appendChild(s);
  }

  return { start, stop, getLog };
})();

// ═══════════════════════════════════════════════════════════════
// Патчим startTrial / submitTrial после загрузки script.js
// ═══════════════════════════════════════════════════════════════

window.addEventListener('load', () => {

  // ── Патч startTrial ──
  if (typeof startTrial === 'function') {
    const _origStart = startTrial;
    window.startTrial = function(...args) {
      const result = _origStart.apply(this, args);
      TP.start();
      return result;
    };
  }

  // ── Патч submitTrial ──
  if (typeof submitTrial === 'function') {
    const _origSubmit = submitTrial;
    window.submitTrial = function(...args) {
      // Сохраняем лог в объект пробника перед сдачей
      const log = TP.getLog();
      if (log.length && typeof _activeTrial !== 'undefined' && _activeTrial) {
        const trials = load('trials') || [];
        const t = trials.find(t => t.id === _activeTrial.id);
        if (t) {
          t.proctorLog = log;
          t.leaveCount = log.length;
          save('trials', trials);
        }
      }
      TP.stop();
      return _origSubmit.apply(this, args);
    };
  }
});
