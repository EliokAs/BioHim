// ═══════════════════════════════════════════════════════════════
//  WEEKLY REPORT — BioХим
//  Автоматическое формирование и отправка недельного итога в Telegram.
//  Подключить: <script src="weekly-report.js"></script> после script.js
// ═══════════════════════════════════════════════════════════════

// ── Утилиты дат ─────────────────────────────────────────────────

/** Возвращает {start, end} — границы недели (пн–вс) для произвольной даты */
function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=вс … 6=сб
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d); mon.setDate(d.getDate() + diffToMon); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return { start: mon, end: sun };
}

/** Парсит строку вида "19.05.2025" → Date (формат toLocaleDateString('ru')) */
function parseRuDate(str) {
  if (!str) return null;
  const [d, m, y] = str.split('.');
  if (!d || !m || !y) return null;
  return new Date(+y, +m - 1, +d);
}

/** true, если ruDateStr попадает в диапазон [start, end] */
function isInWeek(ruDateStr, start, end) {
  const d = parseRuDate(ruDateStr);
  return d && d >= start && d <= end;
}

// ── Сбор данных ученика за неделю ────────────────────────────────

/**
 * Собирает статистику конкретного ученика за указанный недельный диапазон.
 * @param {string} sid  — studentId
 * @param {{start:Date, end:Date}} bounds
 * @returns {{completed:number, avgPct:number|null, graded:number}}
 */
function collectStudentWeekStats(sid, bounds) {
  const { start, end } = bounds;
  const allItems = [];

  // Тесты
  (load('tests') || []).filter(t => t.studentId === sid && !t.isLibrary).forEach(t => {
    const attempts = t.attempts || [];
    if (attempts.length) {
      attempts.forEach(a => {
        if (isInWeek(a.date, start, end)) allItems.push({ pct: a.pct, grade: a.grade });
      });
    } else if (t.submitted && isInWeek(t.date, start, end)) {
      const pct = t.autoTotal ? Math.round((t.autoScore || 0) / t.autoTotal * 100) : null;
      allItems.push({ pct, grade: t.autoGrade });
    }
  });

  // ДЗ
  (load('hw') || []).filter(h => h.studentId === sid && !h.isLibrary).forEach(h => {
    const attempts = h.attempts || [];
    if (attempts.length) {
      attempts.forEach(a => {
        if (isInWeek(a.date, start, end)) allItems.push({ pct: a.pct, grade: a.grade });
      });
    } else if (h.submitted && isInWeek(h.date, start, end)) {
      allItems.push({ pct: null, grade: null });
    }
  });

  // Пробники
  (load('trials') || []).filter(t => t.studentId === sid && !t.isLibrary).forEach(t => {
    if (t.submitted && isInWeek(t.date, start, end)) {
      const pct = t.autoTotal ? Math.round((t.autoScore || 0) / t.autoTotal * 100) : null;
      allItems.push({ pct, grade: t.autoGrade });
    }
  });

  const completed = allItems.length;
  const withPct   = allItems.filter(i => i.pct != null);
  const avgPct    = withPct.length ? Math.round(withPct.reduce((s, i) => s + i.pct, 0) / withPct.length) : null;
  const graded    = allItems.filter(i => i.grade).length;

  return { completed, avgPct, graded };
}

// ── Рейтинг ─────────────────────────────────────────────────────

/**
 * Возвращает место ученика среди всех активных учеников.
 * Критерий: avgPct (null → хуже любого числа).
 * @param {string} sid
 * @param {{start:Date, end:Date}} bounds
 * @returns {{rank:number, total:number}}
 */
function calcWeekRank(sid, bounds) {
  const students = getStudents().filter(s => s.active !== false);
  const scores = students.map(s => ({
    id: s.id,
    avg: collectStudentWeekStats(s.id, bounds).avgPct
  }));
  scores.sort((a, b) => {
    if (a.avg === null && b.avg === null) return 0;
    if (a.avg === null) return 1;
    if (b.avg === null) return -1;
    return b.avg - a.avg;
  });
  const rank = scores.findIndex(s => s.id === sid) + 1;
  return { rank, total: students.length };
}

// ── Форматирование сообщений ─────────────────────────────────────

/** Строка вида "19–25 мая" */
function formatWeekLabel(start, end) {
  const opts = { day: 'numeric', month: 'long' };
  const s = start.toLocaleDateString('ru', opts).replace(' г.', '');
  const e = end.toLocaleDateString('ru', opts).replace(' г.', '');
  // Если месяц одинаковый — убираем из первой даты
  const sDay  = start.getDate();
  const sMonth = start.toLocaleDateString('ru', { month: 'long' });
  const eMonth = end.toLocaleDateString('ru', { month: 'long' });
  return sMonth === eMonth ? `${sDay}–${e}` : `${s} – ${e}`;
}

/** Сообщение ученику */
function buildStudentMessage(name, stats, rankInfo, weekLabel) {
  const { completed, avgPct } = stats;
  const { rank, total } = rankInfo;

  const avgStr  = avgPct != null ? `${avgPct}%` : 'нет оценок';
  const rankStr = rank ? `${rank} из ${total}` : '—';

  return (
    `📅 *Итоги недели ${weekLabel}*\n\n` +
    `Привет, ${name}! Вот твой результат:\n\n` +
    `✅ Выполнено заданий: *${completed}*\n` +
    `📊 Средний балл: *${avgStr}*\n` +
    `🏆 Рейтинг среди учеников: *${rankStr}*\n\n` +
    (completed === 0
      ? '😴 На этой неделе заданий не было. Не пропускай!\n\n'
      : '') +
    `Продолжай в том же духе! 💪`
  );
}

/** Сообщение преподавателю — сводка по всем */
function buildAdminMessage(rows, weekLabel) {
  const lines = rows.map(r => {
    const avg = r.avgPct != null ? `${r.avgPct}%` : '—';
    return `• *${r.name}*: ${r.completed} зад., avg ${avg}`;
  });

  const active  = rows.filter(r => r.completed > 0).length;
  const overall = rows.filter(r => r.avgPct != null);
  const totalAvg = overall.length
    ? Math.round(overall.reduce((s, r) => s + r.avgPct, 0) / overall.length)
    : null;

  return (
    `📋 *Сводка за неделю ${weekLabel}*\n\n` +
    `👥 Активных учеников: ${active} из ${rows.length}\n` +
    (totalAvg != null ? `📊 Средний балл по группе: *${totalAvg}%*\n` : '') +
    `\n` +
    lines.join('\n')
  );
}

// ── Отправка ────────────────────────────────────────────────────

/**
 * Отправляет недельный итог ученику.
 * Использует tgApiCall из script.js.
 */
async function sendWeeklyReportToStudent(sid, bounds) {
  const settings = loadNotifSettings(sid);
  if (!settings.tgChatId) return { skipped: true, reason: 'no_chat_id' };

  const student = getStudents().find(s => s.id === sid);
  if (!student) return { skipped: true, reason: 'not_found' };

  const weekLabel = formatWeekLabel(bounds.start, bounds.end);
  const stats     = collectStudentWeekStats(sid, bounds);
  const rankInfo  = calcWeekRank(sid, bounds);
  const text      = buildStudentMessage(student.name, stats, rankInfo, weekLabel);

  try {
    await tgApiCall('sendMessage', {
      chat_id: settings.tgChatId,
      text,
      parse_mode: 'Markdown'
    });
    return { ok: true, name: student.name };
  } catch (e) {
    console.warn('[WeeklyReport] TG error for', student.name, e);
    return { ok: false, name: student.name, error: e };
  }
}

/**
 * Отправляет сводку по всем ученикам преподавателю.
 * adminChatId берётся из localStorage по ключу 'tg_admin_chat_id'.
 */
async function sendWeeklyReportToAdmin(bounds) {
  const adminChatId = localStorage.getItem('tg_admin_chat_id');
  if (!adminChatId) {
    console.warn('[WeeklyReport] admin chat_id не задан');
    return { skipped: true };
  }

  const students = getStudents().filter(s => s.active !== false);
  const rows = students.map(s => {
    const stats = collectStudentWeekStats(s.id, bounds);
    return { name: s.name, ...stats };
  });
  rows.sort((a, b) => {
    if (a.avgPct === null && b.avgPct === null) return 0;
    if (a.avgPct === null) return 1;
    if (b.avgPct === null) return -1;
    return b.avgPct - a.avgPct;
  });

  const weekLabel = formatWeekLabel(bounds.start, bounds.end);
  const text = buildAdminMessage(rows, weekLabel);

  try {
    await tgApiCall('sendMessage', {
      chat_id: adminChatId,
      text,
      parse_mode: 'Markdown'
    });
    return { ok: true };
  } catch (e) {
    console.warn('[WeeklyReport] TG admin error', e);
    return { ok: false, error: e };
  }
}

// ── Главная точка входа ──────────────────────────────────────────

/**
 * Запустить рассылку итогов за прошедшую (или текущую) неделю.
 * @param {'last'|'current'} [which='last']  — 'last' = прошедшая неделя (пн–вс)
 * @param {boolean} [notifyAdmin=true]        — отправить сводку преподавателю
 * @param {boolean} [notifyStudents=true]     — отправить итог каждому ученику
 */
async function sendWeeklyReports({ which = 'last', notifyAdmin = true, notifyStudents = true } = {}) {
  const base   = which === 'last' ? new Date(Date.now() - 7 * 86400_000) : new Date();
  const bounds = getWeekBounds(base);

  const results = { students: [], admin: null };

  if (notifyStudents) {
    const students = getStudents().filter(s => s.active !== false);
    for (const s of students) {
      const r = await sendWeeklyReportToStudent(s.id, bounds);
      results.students.push(r);
    }
  }

  if (notifyAdmin) {
    results.admin = await sendWeeklyReportToAdmin(bounds);
  }

  const sent    = results.students.filter(r => r.ok).length;
  const skipped = results.students.filter(r => r.skipped).length;
  console.info(`[WeeklyReport] ✅ отправлено: ${sent}, пропущено (нет TG): ${skipped}`);
  showNotif(`📨 Недельные итоги отправлены: ${sent} уч. в Telegram`);
  return results;
}

// ── Планировщик (автозапуск каждое воскресенье в 20:00) ──────────

(function initWeeklyScheduler() {
  const STORAGE_KEY = 'weekly_report_last_sent';

  function shouldSendThisWeek() {
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return true;
    const lastDate = new Date(+last);
    const now = new Date();
    // Не отправлять повторно в рамках той же воскресной недели
    return now - lastDate > 6 * 24 * 60 * 60 * 1000;
  }

  function tick() {
    const now = new Date();
    const isSunday = now.getDay() === 0;
    const isTime   = now.getHours() === 20 && now.getMinutes() < 2; // 20:00–20:01

    if (isSunday && isTime && shouldSendThisWeek()) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      sendWeeklyReports({ which: 'current' });
    }
  }

  // Проверяем раз в минуту
  setInterval(tick, 60_000);
  console.info('[WeeklyReport] Планировщик запущен (вс 20:00)');
})();

// ── UI-функции для страницы настроек ────────────────────────────

/**
 * Рендерит панель управления недельными отчётами.
 * Вставьте вызов в нужный раздел настроек:
 *   renderWeeklyReportSettings(document.getElementById('weekly-report-container'));
 */
function renderWeeklyReportSettings(container) {
  if (!container) return;

  const adminChatId = localStorage.getItem('tg_admin_chat_id') || '';

  container.innerHTML = `
    <div class="card" style="margin-top:16px">
      <div class="card-title"><span class="dot"></span>📊 Недельные отчёты в Telegram</div>

      <div style="font-size:0.85rem;color:var(--text2);margin-bottom:14px;line-height:1.6">
        Каждое воскресенье в 20:00 ученики получают личный итог недели,
        а вы — сводку по всем. Кнопка ниже отправляет отчёт немедленно.
      </div>

      <div class="form-group" style="margin-bottom:14px">
        <label style="font-size:0.82rem;color:var(--text3);display:block;margin-bottom:6px">
          Ваш Telegram Chat ID (для получения сводки)
        </label>
        <div style="display:flex;gap:8px">
          <input id="wr-admin-chatid" type="text" placeholder="123456789"
            value="${adminChatId}"
            style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);
                   background:var(--bg);font-family:Nunito,sans-serif;font-size:0.9rem;color:var(--text)">
          <button class="btn btn-outline btn-sm" onclick="saveAdminChatId()">Сохранить</button>
        </div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:4px">
          Получите ID у бота <b>@userinfobot</b> или <b>@getmyid_bot</b>
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-green btn-sm" onclick="sendWeeklyReports({which:'current'})">
          📤 Отправить за эту неделю
        </button>
        <button class="btn btn-outline btn-sm" onclick="sendWeeklyReports({which:'last'})">
          📤 Отправить за прошлую неделю
        </button>
        <button class="btn btn-outline btn-sm" onclick="sendWeeklyReports({notifyStudents:false})">
          👤 Только мне (сводка)
        </button>
      </div>
    </div>
  `;
}

function saveAdminChatId() {
  const val = (document.getElementById('wr-admin-chatid') || {}).value?.trim();
  if (!val) { showNotif('Введите Chat ID'); return; }
  if (!/^\d+$/.test(val)) { showNotif('Chat ID — только цифры'); return; }
  localStorage.setItem('tg_admin_chat_id', val);
  showNotif('✅ Chat ID преподавателя сохранён');
}
