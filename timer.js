// ═══════════════════════════════════════════════════════════════
// TIMER MODULE — BioХим Platform
// ═══════════════════════════════════════════════════════════════

// ─── Утилиты ──────────────────────────────────────────────────
function _fmtTime(sec) {
  const s = Math.max(0, sec);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ═══════════════════════════════════════════════════════════════
// ТЕСТ
// ═══════════════════════════════════════════════════════════════

let _testInterval     = null;
let _testSecsLeft     = 0;
let _testSecsTotal    = 0;
let _testWarned5      = false;
let _testWarned1      = false;
let _testTimerRunning = false; // защита от двойного запуска

function _startTestTimer(minutes, onExpire) {
  // Если таймер уже идёт — не запускать второй
  if (_testTimerRunning) return;
  _clearTestTimer();
  _testWarned5 = false;
  _testWarned1 = false;

  const wrap    = document.getElementById('test-timer-wrap');
  const barWrap = document.getElementById('test-timer-bar-wrap');

  if (!minutes || minutes <= 0) {
    if (wrap)    wrap.style.display    = 'none';
    if (barWrap) barWrap.style.display = 'none';
    return;
  }

  _testSecsLeft     = minutes * 60;
  _testSecsTotal    = minutes * 60;
  _testTimerRunning = true;

  if (wrap)    wrap.style.display    = 'flex';
  if (barWrap) barWrap.style.display = 'block';

  // Сразу рисуем UI без декремента, потом тикаем каждую секунду
  _renderTestTimerUI();
  _testInterval = setInterval(function() { _tickTest(onExpire); }, 1000);
}

function _tickTest(onExpire) {
  _testSecsLeft = Math.max(0, _testSecsLeft - 1);
  _renderTestTimerUI();

  if (!_testWarned5 && _testSecsLeft <= 300 && _testSecsLeft > 0) {
    _testWarned5 = true;
    if (typeof showNotif === 'function') showNotif('⚠️ До конца теста осталось 5 минут!');
  }
  if (!_testWarned1 && _testSecsLeft <= 60 && _testSecsLeft > 0) {
    _testWarned1 = true;
    if (typeof showNotif === 'function') showNotif('🔴 Осталась 1 минута!');
  }

  if (_testSecsLeft <= 0) {
    _clearTestTimer();
    if (typeof onExpire === 'function') onExpire();
  }
}

function _clearTestTimer() {
  if (_testInterval) { clearInterval(_testInterval); _testInterval = null; }
  _testTimerRunning = false;
}

function _renderTestTimerUI() {
  const display = document.getElementById('test-timer-display');
  const bar     = document.getElementById('test-timer-bar');
  if (!display) return;

  display.textContent = _fmtTime(_testSecsLeft);

  const pct        = _testSecsTotal > 0 ? (_testSecsLeft / _testSecsTotal * 100) : 100;
  const isCritical = _testSecsLeft <= 60;
  const isWarning  = _testSecsLeft <= 300;

  if (isCritical) {
    display.style.cssText = 'font-family:\'Playfair Display\',serif;font-size:1.3rem;font-weight:800;padding:6px 16px;border-radius:12px;background:var(--red);color:#fff;letter-spacing:0.06em;min-width:80px;text-align:center';
    display.classList.add('timer-warning');
    if (bar) bar.style.background = 'var(--red)';
  } else if (isWarning) {
    display.style.cssText = 'font-family:\'Playfair Display\',serif;font-size:1.3rem;font-weight:800;padding:6px 16px;border-radius:12px;background:#fff3cd;color:#856404;letter-spacing:0.06em;min-width:80px;text-align:center';
    display.classList.remove('timer-warning');
    if (bar) bar.style.background = 'linear-gradient(90deg,#f59e0b,#fbbf24)';
  } else {
    display.style.cssText = 'font-family:\'Playfair Display\',serif;font-size:1.3rem;font-weight:800;padding:6px 16px;border-radius:12px;background:var(--green-xpale);color:var(--green-deep);letter-spacing:0.06em;min-width:80px;text-align:center';
    display.classList.remove('timer-warning');
    if (bar) bar.style.background = 'linear-gradient(90deg,var(--green-mid),var(--green-light))';
  }

  if (bar) bar.style.width = Math.round(pct) + '%';
}

// ─── Перехват открытия / закрытия теста ───────────────────────
(function patchTestModal() {
  window.addEventListener('load', function () {

    // Переопределяем _startTestTimer из script.js нашей версией.
    // script.js вызывает _startTestTimer(t.timeLimit) при открытии теста.
    // Делаем это ДО перехвата openModal, чтобы openModal уже не вызывал старт второй раз.
    window._startTestTimer = function (minutes) {
      _startTestTimer(minutes, function () {
        if (typeof showNotif === 'function') showNotif('⏰ Время вышло! Тест сдан автоматически.');
        if (typeof submitTest === 'function') submitTest(true);
        else if (typeof closeModal === 'function') closeModal('modal-take-test');
      });
    };

    // openModal — перехватываем только для пробника (тест запускается через _startTestTimer выше)
    const _origOpen = window.openModal;
    if (typeof _origOpen === 'function') {
      window.openModal = function (id) {
        _origOpen.apply(this, arguments);
        if (id === 'modal-take-trial') {
          setTimeout(_startTrialWarningWatcher, 100);
        }
        // modal-take-test НЕ запускаем таймер здесь — script.js сам вызовет _startTestTimer
      };
    }

    // closeModal
    const _origClose = window.closeModal;
    if (typeof _origClose === 'function') {
      window.closeModal = function (id) {
        if (id === 'modal-take-test')  { _clearTestTimer(); }
        if (id === 'modal-take-trial') { _clearTrialWatcher(); }
        _origClose.apply(this, arguments);
      };
    }

    // submitTest — остановить таймер при ручной сдаче
    const _origSubmit = window.submitTest;
    if (typeof _origSubmit === 'function') {
      window.submitTest = function () {
        _clearTestTimer();
        return _origSubmit.apply(this, arguments);
      };
    }

    // submitTrial
    const _origSubmitTrial = window.submitTrial;
    if (typeof _origSubmitTrial === 'function') {
      window.submitTrial = function () {
        _clearTrialWatcher();
        return _origSubmitTrial.apply(this, arguments);
      };
    }

    window._stopTrialTimer = function () { _clearTrialWatcher(); };
  });
})();

// ═══════════════════════════════════════════════════════════════
// ПРОБНИК — визуальные предупреждения
// ═══════════════════════════════════════════════════════════════

let _trialWatchInterval = null;
let _trialWarned5       = false;
let _trialWarned1       = false;

function _startTrialWarningWatcher() {
  _clearTrialWatcher();
  _trialWarned5 = false;
  _trialWarned1 = false;
  _trialWatchInterval = setInterval(_checkTrialWarnings, 1000);
}

function _clearTrialWatcher() {
  if (_trialWatchInterval) { clearInterval(_trialWatchInterval); _trialWatchInterval = null; }
  const el = document.getElementById('trial-timer-display');
  if (el) {
    el.classList.remove('timer-warning');
    if (el.parentElement) el.parentElement.style.background = 'rgba(255,255,255,0.18)';
  }
}

function _checkTrialWarnings() {
  const sLeft = (typeof window._trialSecondsLeft === 'number')
    ? window._trialSecondsLeft
    : _parseDisplayTime();

  if (sLeft < 0) return;

  const el = document.getElementById('trial-timer-display');
  if (!el) return;

  const isCritical = sLeft <= 60;
  const isWarning  = sLeft <= 300;

  if (isCritical) {
    el.classList.add('timer-warning');
    if (el.parentElement) el.parentElement.style.background = 'rgba(192,57,43,0.45)';
  } else if (isWarning) {
    el.classList.remove('timer-warning');
    if (el.parentElement) el.parentElement.style.background = 'rgba(220,150,0,0.35)';
  } else {
    el.classList.remove('timer-warning');
    if (el.parentElement) el.parentElement.style.background = 'rgba(255,255,255,0.18)';
  }

  if (!_trialWarned5 && sLeft <= 300 && sLeft > 0) {
    _trialWarned5 = true;
    if (typeof showNotif === 'function') showNotif('⚠️ До конца пробника осталось 5 минут!');
  }
  if (!_trialWarned1 && sLeft <= 60 && sLeft > 0) {
    _trialWarned1 = true;
    if (typeof showNotif === 'function') showNotif('🔴 До конца пробника осталась 1 минута!');
  }

  if (sLeft <= 0) {
    _clearTrialWatcher();
    if (typeof submitTrial === 'function') {
      setTimeout(function() { submitTrial(true); }, 300);
    }
  }
}

function _parseDisplayTime() {
  const el = document.getElementById('trial-timer-display');
  if (!el) return -1;
  const parts = el.textContent.split(':');
  if (parts.length !== 2) return -1;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  return isNaN(m) || isNaN(s) ? -1 : m * 60 + s;
}

// ═══════════════════════════════════════════════════════════════
// Публичный API
// ═══════════════════════════════════════════════════════════════
window.TimerModule = {
  startTestTimer: function (minutes, onExpire) { _startTestTimer(minutes, onExpire); },
  stopTestTimer:  function () { _clearTestTimer(); },
};
