// ═══════════════════════════════════════════════════════════════
// ГЕЙМИФИКАЦИЯ — Streak, Значки, Прогресс-бар
// Подключить: <script src="gamification.js"></script> после script.js
// ═══════════════════════════════════════════════════════════════

const GM_KEY = 'biohim_gamification'; // { streak, lastDate, xp, badges:[], level }

// ── XP за действия ──
const GM_XP = {
  test:    30,
  hw:      25,
  trial:   60,
  content: 10,
  streak:  15,   // бонус за streak
};

// ── Уровни ──
const GM_LEVELS = [
  { level: 1, title: 'Новичок',      xpMin: 0   },
  { level: 2, title: 'Ученик',       xpMin: 50  },
  { level: 3, title: 'Исследователь',xpMin: 150 },
  { level: 4, title: 'Знаток',       xpMin: 300 },
  { level: 5, title: 'Эксперт',      xpMin: 500 },
  { level: 6, title: 'Мастер',       xpMin: 750 },
  { level: 7, title: 'Чемпион ЕГЭ',  xpMin: 1100},
];

// ── Значки ──
const GM_BADGES = [
  { id: 'first_test',    icon: '📝', title: 'Первый тест',      desc: 'Прошёл первый тест',            check: s => s.tests >= 1 },
  { id: 'first_hw',      icon: '✏️', title: 'Первое ДЗ',        desc: 'Сдал первое домашнее задание',  check: s => s.hw >= 1 },
  { id: 'first_trial',   icon: '🧪', title: 'Пробный бой',      desc: 'Прошёл первый пробник',         check: s => s.trials >= 1 },
  { id: 'streak3',       icon: '🔥', title: '3 дня подряд',     desc: 'Заходил 3 дня подряд',          check: s => s.streak >= 3 },
  { id: 'streak7',       icon: '⚡', title: 'Неделя!',          desc: 'Заходил 7 дней подряд',         check: s => s.streak >= 7 },
  { id: 'streak30',      icon: '🏆', title: 'Месяц!',           desc: 'Заходил 30 дней подряд',        check: s => s.streak >= 30 },
  { id: 'tests5',        icon: '🎯', title: 'Тест-марафон',     desc: 'Прошёл 5 тестов',               check: s => s.tests >= 5 },
  { id: 'hw5',           icon: '📚', title: 'Домашний герой',   desc: 'Сдал 5 домашних заданий',       check: s => s.hw >= 5 },
  { id: 'trials3',       icon: '🥇', title: 'Три пробника',     desc: 'Прошёл 3 пробника',             check: s => s.trials >= 3 },
  { id: 'xp500',         icon: '💎', title: 'Полпути',          desc: 'Набрал 500 XP',                 check: s => s.xp >= 500 },
];

// ══════════════════════════════════════════
// Ядро
// ══════════════════════════════════════════

function gmLoad(userId) {
  try {
    const raw = localStorage.getItem(GM_KEY + '_' + userId);
    return raw ? JSON.parse(raw) : gmDefault();
  } catch { return gmDefault(); }
}

function gmSave(userId, data) {
  localStorage.setItem(GM_KEY + '_' + userId, JSON.stringify(data));
}

function gmDefault() {
  return { streak: 0, lastDate: null, xp: 0, badges: [], tests: 0, hw: 0, trials: 0, content: 0 };
}

function gmTodayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Вызывать при каждом входе ученика на страницу
function gmCheckIn(userId) {
  if (!userId) return;
  const d = gmLoad(userId);
  const today = gmTodayStr();
  if (d.lastDate === today) return; // уже отмечено сегодня

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d.lastDate === yesterday) {
    d.streak = (d.streak || 0) + 1;
    d.xp = (d.xp || 0) + GM_XP.streak;
  } else if (d.lastDate !== today) {
    d.streak = 1; // сброс
  }
  d.lastDate = today;

  const newBadges = gmCheckBadges(d);
  gmSave(userId, d);

  if (newBadges.length) {
    setTimeout(() => gmShowBadgePopup(newBadges), 800);
  }
}

// Вызывать после сдачи теста/ДЗ/пробника/прочтения материала
function gmAddActivity(userId, type) {
  if (!userId || !GM_XP[type]) return;
  const d = gmLoad(userId);
  d.xp = (d.xp || 0) + GM_XP[type];
  if (type === 'test')    d.tests   = (d.tests   || 0) + 1;
  if (type === 'hw')      d.hw      = (d.hw      || 0) + 1;
  if (type === 'trial')   d.trials  = (d.trials  || 0) + 1;
  if (type === 'content') d.content = (d.content || 0) + 1;

  const newBadges = gmCheckBadges(d);
  gmSave(userId, d);

  gmUpdateWidget(userId);
  if (newBadges.length) setTimeout(() => gmShowBadgePopup(newBadges), 400);
}

function gmCheckBadges(d) {
  const stats = { streak: d.streak, tests: d.tests || 0, hw: d.hw || 0, trials: d.trials || 0, xp: d.xp || 0 };
  const earned = d.badges || [];
  const newOnes = [];
  GM_BADGES.forEach(b => {
    if (!earned.includes(b.id) && b.check(stats)) {
      earned.push(b.id);
      newOnes.push(b);
    }
  });
  d.badges = earned;
  return newOnes;
}

function gmGetLevel(xp) {
  let cur = GM_LEVELS[0];
  for (const l of GM_LEVELS) { if (xp >= l.xpMin) cur = l; }
  return cur;
}

function gmGetNextLevel(xp) {
  for (const l of GM_LEVELS) { if (xp < l.xpMin) return l; }
  return null;
}

// ══════════════════════════════════════════
// UI — виджет в дашборде ученика
// ══════════════════════════════════════════

function gmRenderWidget(userId) {
  const d = gmLoad(userId);
  const level = gmGetLevel(d.xp || 0);
  const next  = gmGetNextLevel(d.xp || 0);
  const progressPct = next
    ? Math.round(((d.xp - level.xpMin) / (next.xpMin - level.xpMin)) * 100)
    : 100;

  const badgesHtml = GM_BADGES.map(b => {
    const owned = (d.badges || []).includes(b.id);
    return `<div title="${b.title}: ${b.desc}" style="
      display:inline-flex;align-items:center;justify-content:center;
      width:38px;height:38px;border-radius:50%;font-size:1.3rem;
      background:${owned ? 'var(--green-xpale)' : 'var(--bg2)'};
      border:2px solid ${owned ? 'var(--green-light)' : 'var(--green-pale)'};
      opacity:${owned ? '1' : '0.35'};cursor:default;transition:.2s;
    ">${b.icon}</div>`;
  }).join('');

  return `
  <div id="gm-widget" style="
    background:var(--white);border-radius:var(--radius);
    border:1.5px solid var(--green-pale);padding:18px 20px;
    box-shadow:var(--shadow);margin-bottom:16px;
  ">
    <!-- Заголовок -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="font-size:1.5rem">🎮</div>
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--accent)">
          Прогресс
        </div>
        <div style="font-size:0.78rem;color:var(--text3)">${level.title} · ${d.xp || 0} XP</div>
      </div>
      <!-- Streak -->
      <div style="margin-left:auto;text-align:center;background:${(d.streak||0)>=3?'#fff3cd':'var(--bg)'};
        border-radius:12px;padding:6px 14px;border:1.5px solid ${(d.streak||0)>=3?'#f0c040':'var(--green-pale)'}">
        <div style="font-size:1.4rem;line-height:1">${(d.streak||0)>=3?'🔥':'📅'}</div>
        <div style="font-size:1rem;font-weight:800;color:${(d.streak||0)>=3?'#d4880c':'var(--green-deep)'};line-height:1.2">
          ${d.streak || 0}
        </div>
        <div style="font-size:0.68rem;color:var(--text3)">дней подряд</div>
      </div>
    </div>

    <!-- Прогресс-бар -->
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text3);margin-bottom:5px">
        <span>${level.title} (ур. ${level.level})</span>
        ${next ? `<span>${next.title} — ещё ${next.xpMin - (d.xp||0)} XP</span>` : '<span>Максимальный уровень!</span>'}
      </div>
      <div style="background:var(--green-xpale);border-radius:20px;height:10px;overflow:hidden">
        <div style="
          height:100%;width:${progressPct}%;
          background:linear-gradient(90deg,var(--green-mid),var(--green-light));
          border-radius:20px;transition:width .6s ease;
        "></div>
      </div>
    </div>

    <!-- Значки -->
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">
      Достижения
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${badgesHtml}</div>
  </div>`;
}

function gmUpdateWidget(userId) {
  const el = document.getElementById('gm-widget');
  if (!el) return;
  el.outerHTML = gmRenderWidget(userId);
}

// ══════════════════════════════════════════
// UI — всплывашка нового значка
// ══════════════════════════════════════════

function gmShowBadgePopup(badges) {
  badges.forEach((b, i) => {
    setTimeout(() => {
      const pop = document.createElement('div');
      pop.style.cssText = `
        position:fixed;bottom:${80 + i*80}px;right:20px;z-index:9999;
        background:linear-gradient(135deg,var(--accent),var(--green-mid));
        color:#fff;border-radius:16px;padding:14px 20px;
        box-shadow:0 8px 32px rgba(27,67,50,.35);
        display:flex;align-items:center;gap:12px;
        animation:gmSlideIn .4s ease;min-width:240px;
        font-family:Nunito,sans-serif;
      `;
      pop.innerHTML = `
        <div style="font-size:2rem">${b.icon}</div>
        <div>
          <div style="font-size:0.7rem;opacity:.75;text-transform:uppercase;letter-spacing:.08em">Новый значок!</div>
          <div style="font-weight:800;font-size:1rem;line-height:1.2">${b.title}</div>
          <div style="font-size:0.78rem;opacity:.8">${b.desc}</div>
        </div>
      `;
      document.body.appendChild(pop);
      setTimeout(() => { pop.style.opacity = '0'; pop.style.transition = 'opacity .5s'; }, 3500);
      setTimeout(() => pop.remove(), 4100);
    }, i * 600);
  });
}

// ══════════════════════════════════════════
// CSS-анимация (инжектируется один раз)
// ══════════════════════════════════════════

(function injectGmStyles() {
  if (document.getElementById('gm-styles')) return;
  const s = document.createElement('style');
  s.id = 'gm-styles';
  s.textContent = `
    @keyframes gmSlideIn {
      from { transform: translateX(60px); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════
// Хуки — патчим существующие функции
// ══════════════════════════════════════════

// Патчить нужно после загрузки DOM и script.js
window.addEventListener('load', () => {

  // ── Тест сдан ──
  if (typeof submitTest === 'function') {
    const _origSubmitTest = submitTest;
    window.submitTest = function(...args) {
      const result = _origSubmitTest.apply(this, args);
      if (typeof currentUser !== 'undefined' && currentUser?.role === 'student') {
        gmAddActivity(currentUser.id, 'test');
      }
      return result;
    };
  }

  // ── ДЗ сдано ──
  if (typeof submitHW === 'function') {
    const _origSubmitHW = submitHW;
    window.submitHW = function(...args) {
      const result = _origSubmitHW.apply(this, args);
      if (typeof currentUser !== 'undefined' && currentUser?.role === 'student') {
        gmAddActivity(currentUser.id, 'hw');
      }
      return result;
    };
  }

  // ── Пробник сдан ──
  if (typeof submitTrial === 'function') {
    const _origSubmitTrial = submitTrial;
    window.submitTrial = function(...args) {
      const result = _origSubmitTrial.apply(this, args);
      if (typeof currentUser !== 'undefined' && currentUser?.role === 'student') {
        gmAddActivity(currentUser.id, 'trial');
      }
      return result;
    };
  }

  // ── Материал открыт ──
  if (typeof openContentModal === 'function') {
    const _origContent = openContentModal;
    window.openContentModal = function(...args) {
      const result = _origContent.apply(this, args);
      if (typeof currentUser !== 'undefined' && currentUser?.role === 'student') {
        gmAddActivity(currentUser.id, 'content');
      }
      return result;
    };
  }
});

// ══════════════════════════════════════════
// Встройка виджета в дашборд ученика
// Вызывать внутри renderStudentDashboard / аналога
// Используй: document.getElementById('gm-mount').innerHTML = gmRenderWidget(currentUser.id)
// ══════════════════════════════════════════

// Авто-встройка: ищем якорь #gm-mount (добавь в HTML) или вставляем после первой .card на странице
function gmAutoMount(userId) {
  // Только для учеников
  if (typeof currentUser === 'undefined' || currentUser?.role !== 'student') return;

  gmCheckIn(userId);

  // Не монтировать повторно
  if (document.getElementById('gm-widget')) {
    gmUpdateWidget(userId);
    return;
  }

  // Явный якорь
  const mount = document.getElementById('gm-mount');
  if (mount) {
    mount.innerHTML = gmRenderWidget(userId);
    return;
  }

  // Вставить перед первой .card на активной странице
  const page = document.getElementById('page-student-dashboard') || document.getElementById('page-dashboard') || document.querySelector('.page.active');
  if (page) {
    if (page.querySelector('#gm-widget')) return;
    const firstCard = page.querySelector('.card');
    if (firstCard) {
      const div = document.createElement('div');
      div.innerHTML = gmRenderWidget(userId);
      firstCard.parentNode.insertBefore(div.firstElementChild, firstCard);
    }
    return;
  }

  // Если страница ещё не отрисована — ждём
  const observer = new MutationObserver(() => {
    const pg = document.getElementById('page-student-dashboard') || document.querySelector('.page.active');
    if (!pg) return;
    if (pg.querySelector('#gm-widget')) { observer.disconnect(); return; }
    const firstCard = pg.querySelector('.card');
    if (firstCard) {
      const div = document.createElement('div');
      div.innerHTML = gmRenderWidget(userId);
      firstCard.parentNode.insertBefore(div.firstElementChild, firstCard);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ══════════════════════════════════════════
// Публичное API
// ══════════════════════════════════════════
window.GM = { gmCheckIn, gmAddActivity, gmRenderWidget, gmUpdateWidget, gmAutoMount };
