// ═══════════════════════════════════════════════
// УТИЛИТЫ ПРОИЗВОДИТЕЛЬНОСТИ
// ═══════════════════════════════════════════════

/** Дебаунс: откладывает вызов fn на delay мс после последнего вызова */
function debounce(fn, delay) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

/**
 * VirtualList — рендерит только видимые строки большого списка.
 * Работает с любым контейнером (div, tbody и т.д.).
 * @param {HTMLElement} container  — прокручиваемый контейнер
 * @param {number}      itemHeight — высота одного элемента в px
 * @param {Function}    renderItem — (item) => HTML-строка
 * @param {number}      [buffer=5] — запас строк выше/ниже viewport
 */
class VirtualList {
  constructor(container, itemHeight, renderItem, buffer = 5) {
    this.container  = container;
    this.itemHeight = itemHeight;
    this.renderItem = renderItem;
    this.buffer     = buffer;
    this.items      = [];
    this._onScroll  = debounce(() => this._render(), 16);
    this.container.addEventListener('scroll', this._onScroll);
  }

  setItems(items) {
    this.items = items;
    const totalH = items.length * this.itemHeight;
    this.container.style.overflowY = 'auto';
    this.container.style.position  = 'relative';
    // Максимальная высота контейнера — 600px или меньше если строк мало
    this.container.style.maxHeight = '600px';
    this._totalH = totalH;
    this._render();
  }

  _render() {
    const scrollTop  = this.container.scrollTop;
    const viewH      = this.container.clientHeight || 600;
    const startIdx   = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.buffer);
    const endIdx     = Math.min(this.items.length, Math.ceil((scrollTop + viewH) / this.itemHeight) + this.buffer);
    const padTop     = startIdx * this.itemHeight;
    const padBot     = Math.max(0, this._totalH - endIdx * this.itemHeight);

    // ВАЖНО: renderItem должен экранировать пользовательские данные через esc() перед вставкой в innerHTML
    this.container.innerHTML =
      `<div style="height:${padTop}px;pointer-events:none"></div>` +
      this.items.slice(startIdx, endIdx).map(this.renderItem).join('') +
      `<div style="height:${padBot}px;pointer-events:none"></div>`;
  }

  destroy() {
    this.container.removeEventListener('scroll', this._onScroll);
  }
}

// ═══════════════════════════════════════════════
// ТЁМНАЯ ТЕМА
// ═══════════════════════════════════════════════

const _DARK_KEY = 'biohim_dark_theme';

function initDarkTheme() {
  const isDark = localStorage.getItem(_DARK_KEY) === '1';
  if (isDark) _applyDark(true);
}

function toggleDarkTheme() {
  const isDark = document.body.classList.toggle('dark-theme');
  localStorage.setItem(_DARK_KEY, isDark ? '1' : '0');
  _updateDarkBtn(isDark);
}

function _applyDark(isDark) {
  document.body.classList.toggle('dark-theme', isDark);
  _updateDarkBtn(isDark);
}

function _updateDarkBtn(isDark) {
  const btn = document.getElementById('btn-dark-theme');
  if (btn) btn.textContent = isDark ? '☀️ Светлая тема' : '🌙 Тёмная тема';
}

// ═══════════════════════════════════════════════
// ГЛОБАЛЬНЫЙ ПОИСК
// ═══════════════════════════════════════════════

// Дебаунс для живого поиска при вводе (300мс)
const performGlobalSearchDebounced = debounce(q => performGlobalSearch(q), 300);

// Страница, с которой запустили поиск — чтобы вернуться
let _searchPrePage = '';

/** Вызывается при каждом вводе символа в строку поиска */
function onSearchInput(val) {
  const btn = document.getElementById('search-clear-btn');
  if (btn) btn.classList.toggle('visible', val.length > 0);
  if (val.length >= 2) performGlobalSearchDebounced(val);
  if (val.length === 0) clearSearch();
}

/** Очистить поиск и вернуться на последнюю активную страницу */
function clearSearch() {
  const inp = document.getElementById('global-search-input');
  if (inp) inp.value = '';
  const btn = document.getElementById('search-clear-btn');
  if (btn) btn.classList.remove('visible');
  const old = document.getElementById('page-search-results');
  if (old) old.remove();
  if (_searchPrePage) {
    navigateTo(_searchPrePage);
    _searchPrePage = '';
  } else {
    // Fallback: показать первую активную страницу из sidebar
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const nav = document.querySelector('.nav-item.active');
    if (nav) {
      const id = nav.id.replace('nav-', '');
      const el = document.getElementById('page-' + id);
      if (el) el.classList.add('active');
    }
  }
  if (inp) inp.focus();
}

function performGlobalSearch(query) {
  if (!query || query.length < 2) {
    showNotif('⚠️ Введите минимум 2 символа для поиска');
    return;
  }
  
  const q = query.toLowerCase();
  const results = {
    students: [],  // ученики — по имени, логину, предмету
    materials: [], // материалы (бывший ключ 'content', переименован во избежание путаницы с коллекцией)
    tests: [],
    hw: [],
    trials: []
  };

  // Поиск по ученикам (только для администратора)
  if (currentUser && currentUser.role === 'admin') {
    (load('users') || []).filter(u => u.role === 'student').forEach(u => {
      const name    = (u.name    || '').toLowerCase();
      const login   = (u.login   || '').toLowerCase();
      const subject = (u.subject || '').toLowerCase();
      if (name.includes(q) || login.includes(q) || subject.includes(q)) {
        results.students.push(u);
      }
    });
  }

  // Поиск в материалах
  (load('content') || []).forEach(item => {
    const title = (item.title || '').toLowerCase();
    const body  = (item.body  || '').toLowerCase();
    if (title.includes(q) || body.includes(q)) {
      results.materials.push(item);
    }
  });
  
  // Поиск в тестах
  (load('tests') || []).forEach(item => {
    const title = (item.title || '').toLowerCase();
    const questionsText = (item.questions || []).map(qq => (qq.text || '').toLowerCase()).join(' ');
    if (title.includes(q) || questionsText.includes(q)) {
      results.tests.push(item);
    }
  });
  
  // Поиск в ДЗ
  (load('hw') || []).forEach(item => {
    const title = (item.title || '').toLowerCase();
    const questionsText = (item.questions || []).map(qq => (qq.text || '').toLowerCase()).join(' ');
    if (title.includes(q) || questionsText.includes(q)) {
      results.hw.push(item);
    }
  });
  
  // Поиск в пробниках
  (load('trials') || []).forEach(item => {
    const title = (item.title || '').toLowerCase();
    const sectionsText = (item.sections || []).map(s => 
      (s.questions || []).map(qq => (qq.text || '').toLowerCase()).join(' ')
    ).join(' ');
    if (title.includes(q) || sectionsText.includes(q)) {
      results.trials.push(item);
    }
  });
  
  showSearchResults(query, results);
}

function showSearchResults(query, results) {
  const total = results.students.length + results.materials.length + results.tests.length + results.hw.length + results.trials.length;
  
  if (total === 0) {
    showNotif(`🔍 По запросу "${query}" ничего не найдено`);
    return;
  }

  // Запомнить страницу, с которой открыли поиск (только если это не сами результаты)
  if (curPage !== 'search-results') _searchPrePage = curPage;

  let html = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <button onclick="clearSearch()"
        style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;
               border:1.5px solid var(--green-pale);background:var(--card);color:var(--green-deep);
               font-family:'Nunito',sans-serif;font-size:0.85rem;font-weight:700;cursor:pointer;
               transition:background .15s,border-color .15s;white-space:nowrap"
        onmouseover="this.style.background='var(--green-xpale)';this.style.borderColor='var(--green-mid)'"
        onmouseout="this.style.background='var(--card)';this.style.borderColor='var(--green-pale)'">
        ← Назад
      </button>
      <div>
        <h3 style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--accent);margin-bottom:2px">
          🔍 Результаты: «${esc(query)}»
        </h3>
        <div style="font-size:0.85rem;color:var(--text3)">Найдено: ${total} элементов</div>
      </div>
    </div>
  `;

  if (results.students.length) {
    html += `<div class="card">
      <div class="card-title">👥 Ученики (${results.students.length})</div>
      ${results.students.map(u => `
        <div style="padding:10px 0;border-bottom:1px solid var(--green-xpale);cursor:pointer"
             onclick="navigateTo('students')">
          <div style="font-weight:700;color:var(--green-deep)">${esc(u.name || u.login)}</div>
          <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">
            ${esc(u.login)}${u.subject ? ' · ' + esc(u.subject) : ''}
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  if (results.materials.length) {
    html += `<div class="card">
      <div class="card-title">📚 Материалы (${results.materials.length})</div>
      ${results.materials.map(c => `
        <div style="padding:10px 0;border-bottom:1px solid var(--green-xpale);cursor:pointer" 
             onclick="navigateTo('content-admin');setTimeout(()=>openContentModal('${escAttr(c.id)}'),100)">
          <div style="font-weight:700;color:var(--green-deep)">${esc(c.title)}</div>
          <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">
            ${c.studentId ? 'Для: ' + getUserName(c.studentId) : 'Общий'}
          </div>
        </div>
      `).join('')}
    </div>`;
  }
  
  if (results.tests.length) {
    html += `<div class="card">
      <div class="card-title">📝 Тесты (${results.tests.length})</div>
      ${results.tests.map(t => `
        <div style="padding:10px 0;border-bottom:1px solid var(--green-xpale);cursor:pointer"
             onclick="navigateTo('tests');setTimeout(()=>openTestModal('${escAttr(t.id)}'),100)">
          <div style="font-weight:700;color:var(--green-deep)">${esc(t.title)}</div>
          <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">
            ${t.studentId ? 'Для: ' + getUserName(t.studentId) : 'Общий'} · ${(t.questions||[]).length} вопросов
          </div>
        </div>
      `).join('')}
    </div>`;
  }
  
  if (results.hw.length) {
    html += `<div class="card">
      <div class="card-title">✏️ Домашние задания (${results.hw.length})</div>
      ${results.hw.map(h => `
        <div style="padding:10px 0;border-bottom:1px solid var(--green-xpale);cursor:pointer"
             onclick="navigateTo('hw');setTimeout(()=>openHWModal('${escAttr(h.id)}'),100)">
          <div style="font-weight:700;color:var(--green-deep)">${esc(h.title)}</div>
          <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">
            ${h.studentId ? 'Для: ' + getUserName(h.studentId) : 'Общий'} · ${(h.questions||[]).length} вопросов
          </div>
        </div>
      `).join('')}
    </div>`;
  }
  
  if (results.trials.length) {
    html += `<div class="card">
      <div class="card-title">🧪 Пробники (${results.trials.length})</div>
      ${results.trials.map(t => `
        <div style="padding:10px 0;border-bottom:1px solid var(--green-xpale);cursor:pointer"
             onclick="navigateTo('trials');setTimeout(()=>openTrialModal('${escAttr(t.id)}'),100)">
          <div style="font-weight:700;color:var(--green-deep)">${esc(t.title)}</div>
          <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">
            ${t.studentId ? 'Для: ' + getUserName(t.studentId) : 'Общий'}
          </div>
        </div>
      `).join('')}
    </div>`;
  }
  
  // Убираем активность со всех страниц
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Удаляем старую страницу результатов если есть (до создания новой!)
  const oldSearch = document.getElementById('page-search-results');
  if (oldSearch) oldSearch.remove();

  // Создаем временную страницу для результатов
  const searchPage = document.createElement('div');
  searchPage.className = 'page active';
  searchPage.id = 'page-search-results';
  searchPage.innerHTML = html;

  // Добавляем новую
  document.querySelector('.main').appendChild(searchPage);
}

function getUserName(userId) {
  const users = load('users') || [];
  const user = users.find(u => u.id === userId);
  return user ? user.name : 'Неизвестно';
}

// ═══════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// ОНЛАЙН-ЗАНЯТИЕ — полнофункциональный урок
// ══════════════════════════════════════════════════════

let _lessonTimer   = null;
let _lessonStart   = 0;
let _lessonActive  = false;
let _lessonCode    = '';
let _lessonRoom    = '';
let _lsChatPoll    = null;

// ── Урок: данные хранятся в Firebase для синхронизации между устройствами ──
// Firebase пути:
//   live_lesson/<code>  — { code, room, topic, studentId, slotId, price, startedAt }
//   live_lesson_note/<code>  — строка конспекта
// Для обратной совместимости храним активный code в sessionStorage (только на этом устройстве)

let _lessonDataCache = null;  // локальный кэш, обновляется подпиской

function _lessonFbRef(code){ return _fbInit().ref('live_lesson/' + code); }
function _lessonNoteFbRef(code){ return _fbInit().ref('live_lesson_note/' + code); }

/** Сохранить данные урока в Firebase */
function saveLessonData(d){
  _lessonDataCache = d;
  if(d && d.code){
    sessionStorage.setItem('biohim_active_lesson_code', d.code);
    _lessonFbRef(d.code).set(d).catch(e => console.error('[Firebase] lesson save error', e));
  }
}

/** Удалить данные урока из Firebase (завершение) */
function _deleteLessonData(code){
  _lessonDataCache = null;
  sessionStorage.removeItem('biohim_active_lesson_code');
  if(code) _lessonFbRef(code).remove().catch(()=>{});
}

/** Синхронный геттер — возвращает кэш; для первого чтения используйте loadLessonDataAsync */
function getLessonData(){ return _lessonDataCache; }

/** Загрузить данные урока из Firebase по коду (однократно) */
async function loadLessonDataAsync(code){
  const snap = await _lessonFbRef(code).get();
  _lessonDataCache = snap.val() || null;
  return _lessonDataCache;
}

/** Подписаться на изменения урока в реальном времени */
function _subscribeLessonData(code, onUpdate){
  _lessonFbRef(code).on('value', snap => {
    _lessonDataCache = snap.val() || null;
    if(typeof onUpdate === 'function') onUpdate(_lessonDataCache);
  });
}
function _unsubscribeLessonData(code){
  if(code) _lessonFbRef(code).off('value');
}

// Lesson chat: хранится в Firebase по пути lesson_chats/<code>
const _lsChatCache = {}; // { code: [{who,name,text,ts}] }
function _lsChatFbRef(code){ return _fbInit().ref('lesson_chats/' + code); }

function getLessonChat(code){ return _lsChatCache[code] || []; }
function saveLessonChat(code, arr){
  _lsChatCache[code] = arr;
  _lsChatFbRef(code).set(arr).catch(e => console.error('[Firebase] lesson_chat save error', code, e));
}
function _subscribeLessonChat(code, viewer){
  _lsChatFbRef(code).on('value', snap => {
    const val = snap.val();
    _lsChatCache[code] = Array.isArray(val) ? val : val ? Object.values(val) : [];
    _renderChatNow(code, viewer);
  });
}

// Конспект урока: кэш + Firebase
const _lessonNoteCache = {};  // { code: string }

function getLessonNote(code){ return _lessonNoteCache[code] || ''; }
function saveLessonNote(code, text){
  _lessonNoteCache[code] = text;
  _lessonNoteFbRef(code).set(text).catch(e => console.error('[Firebase] lesson_note save error', e));
}
/** Подписаться на конспект урока — ученик видит правки преподавателя в реальном времени */
function _subscribeLessonNote(code){
  _lessonNoteFbRef(code).on('value', snap => {
    const text = snap.val() || '';
    _lessonNoteCache[code] = text;
    const noteEl = document.getElementById('ls-student-note');
    if(noteEl){
      if(text){
        noteEl.textContent = text;
      } else {
        noteEl.innerHTML = '<span style="color:var(--text3)">Преподаватель ещё не написал конспект...</span>';
      }
    }
    // Также обновляем поле ввода у преподавателя (если открыто)
    const adminNoteEl = document.getElementById('ls-note-ta');
    if(adminNoteEl && document.activeElement !== adminNoteEl){
      adminNoteEl.value = text;
    }
  });
}
function _unsubscribeLessonNote(code){
  if(code) _lessonNoteFbRef(code).off('value');
}

// ═══════════════════════════════════════
// FEATURE TOGGLES
// ═══════════════════════════════════════
const LS_FEATURES = 'biohim_features';
function loadFeatures(){
  try{ return JSON.parse(localStorage.getItem(LS_FEATURES)||'{}'); }catch(e){ return {}; }
}
function getFeatureToggle(key){
  const f = loadFeatures();
  // online_lesson defaults to ON if never set
  if(!(key in f)) return true;
  return !!f[key];
}
function saveFeatureToggle(key, value){
  const f = loadFeatures();
  f[key] = value;
  localStorage.setItem(LS_FEATURES, JSON.stringify(f));
  buildNav(); // rebuild sidebar immediately
  showNotif(value ? '✅ Раздел включён' : '🔕 Раздел скрыт из меню');
}

// ═══════════════════════════════════════
// ADMIN — страница занятия
// ═══════════════════════════════════════
function renderLesson(role){
  if(role==='admin') renderAdminLesson();
  else               renderStudentLesson();
}

function renderAdminLesson(){
  const el = document.getElementById('lesson-admin-ui');
  if(!el) return;
  const live = getLessonData();
  const students = (load('users')||[]).filter(u=>u.role==='student'&&u.active!==false);

  if(!live || !_lessonActive){
    // ── Стартовый экран преподавателя ──
    const slots   = (load('slots')||[]).filter(s=>s.bookedBy||s.groupId);
    const courses  = load('courses')||[];
    const allUsers = load('users')||[];

    // Build slot options with student name, time, course
    const slotOptions = slots.map(s=>{
      const u = s.bookedBy ? allUsers.find(u=>u.id===s.bookedBy) : null;
      const g = s.groupId  ? getGroups().find(x=>x.id===s.groupId) : null;
      const c = s.courseId ? courses.find(c=>c.id===s.courseId) : null;
      const who  = g ? g.name : (u ? u.name : '?');
      const subj = c ? ` · ${c.title} · ${c.price}₽` : '';
      return `<option value="${s.id}" data-student="${s.bookedBy||''}" data-group="${s.groupId||''}" data-price="${c?c.price:''}" data-coursename="${c?c.title:''}" data-day="${s.day}" data-time="${s.time}">${s.day} ${s.time} — ${who}${subj}</option>`;
    }).join('');

    el.innerHTML = `
    <div class="lesson-grid">
      <div>
        <div class="lesson-panel" style="margin-bottom:16px">
          <div class="lesson-panel-title">🎥 Новое занятие</div>

          ${slots.length ? `
          <div class="form-group" style="margin-bottom:14px">
            <label>📅 Слот из расписания <span style="font-weight:400;color:var(--text3)">(необязательно — заполнит данные автоматически)</span></label>
            <select id="ls-slot-sel" onchange="lsOnSlotChange()"
              style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;background:var(--white)">
              <option value="">— Без слота (ручной ввод) —</option>
              ${slotOptions}
            </select>
            <div id="ls-slot-info" style="margin-top:8px;display:none;background:var(--green-xpale);border-radius:10px;padding:10px 14px;font-size:0.83rem;color:var(--green-deep);line-height:1.7"></div>
          </div>
          <div style="border-top:1px solid var(--green-xpale);margin:12px 0"></div>
          ` : `<div style="font-size:0.82rem;color:var(--text3);margin-bottom:12px;padding:8px 12px;background:var(--bg);border-radius:8px">💡 Добавьте слоты в <b>Расписание</b>, чтобы связывать занятия с оплатой автоматически</div>`}

          <div class="form-group" style="margin-bottom:12px">
            <label>Тема занятия</label>
            <input id="ls-topic" placeholder="Например: Клеточное дыхание, Задания ЕГЭ часть 2..."
              style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;box-sizing:border-box">
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label>Ученик</label>
            <select id="ls-student-sel" style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem">
              <option value="">— Выберите ученика —</option>
              ${students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:16px">
            <label>💰 Стоимость занятия (₽) <span style="font-weight:400;color:var(--text3)">— заполняется из курса</span></label>
            <input id="ls-price" type="number" min="0" placeholder="Оставьте 0 чтобы не списывать"
              style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;box-sizing:border-box" value="0">
          </div>
          <div class="lesson-btn-row">
            <button class="btn btn-green" onclick="lsAdminCreate()" style="font-size:0.95rem;padding:12px 24px">🔗 Начать занятие</button>
          </div>
        </div>
        <div class="lesson-panel" style="background:var(--bg)">
          <div class="lesson-panel-title">ℹ️ Как работает</div>
          <div style="font-size:0.84rem;color:var(--text2);line-height:1.9">
            1. Выберите слот из расписания — тема, ученик и цена заполнятся автоматически<br>
            2. Нажмите «Начать занятие» — откроется видеоконференция прямо на странице<br>
            3. Ученик получит уведомление и 6-значный код<br>
            4. Во время урока: чат, конспект и быстрая отправка материалов<br>
            5. По окончании нажмите «Завершить» — урок и оплата запишутся автоматически
          </div>
        </div>
      </div>
      <div>
        <div class="lesson-panel">
          <div class="lesson-panel-title">📋 Последние занятия</div>
          ${_renderRecentLessons()}
        </div>
      </div>
    </div>`;
  } else {
    // ── Активное занятие ──
    _renderActiveLessonAdmin(el, live);
  }
}

function _renderRecentLessons(){
  const att = (load('attendance')||[]);
  const recent = att.slice(-10).reverse();
  if(!recent.length) return '<div style="color:var(--text3);font-size:0.83rem">Занятий пока нет</div>';
  const students = load('users')||[];
  const slots    = load('slots')||[];
  const courses  = load('courses')||[];
  return recent.map(a=>{
    const s    = students.find(u=>u.id===a.studentId);
    const slot = a.slotId ? slots.find(sl=>sl.id===a.slotId) : null;
    const crs  = slot?.courseId ? courses.find(c=>c.id===slot.courseId) : null;
    const slotLabel = slot ? `🗓 ${slot.day} ${slot.time}` : '';
    const crsLabel  = crs  ? crs.title : '';
    const priceLabel = a.costPerStudent ? `💰 ${a.costPerStudent}₽` : '';
    const meta = [s?s.name:'—', a.date, a.duration?a.duration+' мин':'', slotLabel, crsLabel, priceLabel].filter(Boolean).join(' · ');
    return `<div style="padding:8px 0;border-bottom:1px solid var(--green-xpale);font-size:0.83rem">
      <div style="font-weight:600">${escHtml(a.topic||'Без темы')}</div>
      <div style="color:var(--text3)">${meta}</div>
    </div>`;
  }).join('');
}

function _renderActiveLessonAdmin(el, live){
  const students = load('users')||[];
  const student  = students.find(u=>u.id===live.studentId);
  const elapsed  = _lessonActive ? Math.floor((Date.now()-_lessonStart)/1000) : 0;
  const mins     = String(Math.floor(elapsed/60)).padStart(2,'0');
  const secs     = String(elapsed%60).padStart(2,'0');
  const note     = getLessonNote(live.code);
  const chat     = getLessonChat(live.code);

  // Quick-send items
  const tests    = (load('tests')||[]).filter(t=>!t.isLibrary&&!t.studentId).slice(0,5);
  const hws      = (load('hw')||[]).filter(h=>!h.isLibrary&&!h.studentId).slice(0,5);
  const allTests = (load('tests')||[]).filter(t=>t.isLibrary);
  const allHWs   = (load('hw')||[]).filter(h=>h.isLibrary);

  el.innerHTML = `
  <div class="lesson-wrap">
    <!-- Top bar -->
    <div class="lesson-topbar">
      <span class="lesson-status-dot live"></span>
      <span style="font-weight:700;font-size:0.95rem">${live.topic||'Занятие'}</span>
      ${student?`<span style="font-size:0.82rem;color:var(--text3)">· ${esc(student.name)}</span>`:''}
      ${(()=>{
        if(!live.slotId) return '';
        const slot = (load('slots')||[]).find(s=>s.id===live.slotId);
        const course = slot?.courseId ? (load('courses')||[]).find(c=>c.id===slot.courseId) : null;
        const parts = [slot?`🗓 ${slot.day} ${slot.time}`:'', course?course.title:'', live.price?`💰 ${live.price}₽`:''].filter(Boolean);
        return parts.length ? `<span style="font-size:0.78rem;background:var(--green-xpale);color:var(--green-deep);border-radius:8px;padding:3px 10px">${parts.join(' · ')}</span>` : '';
      })()}
      <span style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;color:var(--green-deep);letter-spacing:.05em;margin-left:4px" id="ls-timer">${mins}:${secs}</span>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="background:var(--green-xpale);border-radius:8px;padding:4px 12px;font-size:0.82rem;display:flex;align-items:center;gap:8px">
          Код: <b style="letter-spacing:.14em;font-size:0.98rem;color:var(--green-deep)">${live.code}</b>
          <span style="cursor:pointer;opacity:.65;font-size:0.75rem" onclick="lsCopyCode()">📋</span>
        </div>
        <button class="btn btn-red btn-sm" onclick="lsEndLesson()">⏹ Завершить</button>
      </div>
    </div>

    <!-- Video + right sidebar -->
    <div class="lesson-main-grid">
      <!-- LEFT: Jitsi + tools -->
      <div style="display:flex;flex-direction:column;gap:12px">
        <!-- Jitsi iframe -->
        <div class="jitsi-wrap" id="ls-jitsi-wrap">
          <div class="jitsi-loading">
            <div class="j-icon">📹</div>
            <div style="font-weight:700;font-size:1rem;color:#fff">Видеоконференция готова</div>
            <p>Нажми кнопку — видео откроется в новой вкладке</p>
            <div style="width:28px;height:28px;border:3px solid rgba(255,255,255,.2);border-top-color:#52b788;border-radius:50%;animation:spin .8s linear infinite;margin-top:4px"></div>
          </div>
        </div>
        ${(allTests.length||allHWs.length)?`
        <div class="lesson-panel" style="padding:12px 14px">
          <div class="lesson-panel-title" style="margin-bottom:8px">📤 Быстрая отправка</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${allTests.map(t=>`<div class="quick-send-item" onclick="lsQuickSend('test','${t.id}','${(t.title||'').replace(/'/g,"\\'")}')" title="Тест">📝 ${(t.title||'').substring(0,20)}</div>`).join('')}
            ${allHWs.map(hw=>`<div class="quick-send-item" onclick="lsQuickSend('hw','${hw.id}','${(hw.title||'').replace(/'/g,"\\'")}')" title="ДЗ">✏️ ${(hw.title||'').substring(0,20)}</div>`).join('')}
          </div>
        </div>`:''}

        <!-- Note + end -->
        <div class="lesson-panel" style="padding:12px 14px">
          <div class="lesson-panel-title" style="margin-bottom:6px">📝 Конспект <span style="font-weight:400;font-size:0.7rem;color:var(--text3)">(ученик видит в реальном времени)</span></div>
          <textarea class="lesson-note" id="ls-note-ta" rows="3" placeholder="Тезисы, схемы, формулы…" oninput="lsSaveNote(this.value)">${note}</textarea>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">
            <textarea id="ls-summary" rows="2" placeholder="Итоги занятия…"
              style="flex:1;min-width:160px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.84rem;resize:none;box-sizing:border-box"></textarea>
            <button class="btn btn-red" onclick="lsEndLesson()" style="padding:9px 14px;white-space:nowrap">⏹ Завершить</button>
          </div>
        </div>
      </div>

      <!-- RIGHT: Chat -->
      <div class="lesson-panel" style="padding:12px 14px;display:flex;flex-direction:column">
        <div class="lesson-panel-title" style="margin-bottom:8px">💬 Чат занятия</div>
        <div class="lesson-chat-wrap" style="height:100%;min-height:320px">
          <div class="lesson-chat-msgs" id="ls-chat-msgs">
            ${_renderLessonChatMsgs(chat, 'admin')}
          </div>
          <div class="lesson-chat-inp">
            <input id="ls-chat-inp" placeholder="Сообщение…" onkeydown="if(event.key==='Enter')lsSendMsg('admin')">
            <button onclick="lsSendMsg('admin')">➤</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  _startLessonTimer();
  _startChatPoll(live.code, 'admin');
  _embedJitsi(live.room, currentUser?.name||'Преподаватель');
}

// ═══════════════════════════════════════
// STUDENT — страница занятия
// ═══════════════════════════════════════
function renderStudentLesson(){
  const el = document.getElementById('lesson-student-ui');
  if(!el) return;
  const live = getLessonData();
  const isActive = live && live.code && (Date.now()-live.startedAt < 4*60*60*1000);

  if(!isActive){
    el.innerHTML = `
    <div class="lesson-panel" style="margin-bottom:16px;text-align:center;padding:32px 20px">
      <div style="font-size:2.4rem;margin-bottom:8px">🎥</div>
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:6px">Занятие ещё не началось</div>
      <div style="color:var(--text3);font-size:0.87rem;margin-bottom:20px">Когда преподаватель начнёт урок — здесь появится кнопка подключения и конспект</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <div style="background:var(--bg);border-radius:10px;padding:10px 16px;font-size:0.83rem;color:var(--text2)">
          Или введи код вручную:<br>
          <div style="display:flex;gap:8px;margin-top:8px;justify-content:center">
            <input id="ls-code-input" placeholder="6 цифр" maxlength="6" inputmode="numeric"
              style="padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:1.1rem;width:130px;letter-spacing:.18em;text-align:center">
            <button class="btn btn-green" onclick="lsStudentJoin()">▶ Войти</button>
          </div>
        </div>
      </div>
    </div>`;
    return;
  }

  // Активное занятие — показываем студенту
  const note = getLessonNote(live.code);
  const chat = getLessonChat(live.code);
  el.innerHTML = `
  <div class="lesson-wrap">
    <div class="lesson-topbar">
      <span class="lesson-status-dot live"></span>
      <span style="font-weight:700;font-size:0.95rem">${live.topic||'Занятие'}</span>
      <span style="font-size:0.8rem;color:var(--text3)">· идёт сейчас</span>
    </div>

    <div class="lesson-main-grid">
      <!-- LEFT: Jitsi + note -->
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="jitsi-wrap" id="ls-jitsi-wrap">
          <div class="jitsi-loading">
            <div class="j-icon">📹</div>
            <div style="font-weight:700;font-size:1rem;color:#fff">Видеоконференция готова</div>
            <p>Нажми кнопку — видео откроется в новой вкладке</p>
            <div style="width:28px;height:28px;border:3px solid rgba(255,255,255,.2);border-top-color:#52b788;border-radius:50%;animation:spin .8s linear infinite;margin-top:4px"></div>
          </div>
        </div>
        <div class="lesson-panel" style="padding:12px 14px">
          <div class="lesson-panel-title" style="margin-bottom:6px">📝 Конспект <span style="font-weight:400;font-size:0.7rem;color:var(--text3)">(обновляется)</span></div>
          <div id="ls-student-note" style="background:var(--bg);border-radius:8px;padding:10px 12px;font-size:0.88rem;line-height:1.7;min-height:60px;white-space:pre-wrap">${note||'<span style="color:var(--text3)">Ждём конспект от преподавателя…</span>'}</div>
        </div>
      </div>

      <!-- RIGHT: Chat -->
      <div class="lesson-panel" style="padding:12px 14px;display:flex;flex-direction:column">
        <div class="lesson-panel-title" style="margin-bottom:8px">💬 Чат с преподавателем</div>
        <div class="lesson-chat-wrap" style="height:100%;min-height:320px">
          <div class="lesson-chat-msgs" id="ls-chat-msgs">
            ${_renderLessonChatMsgs(chat, 'student')}
          </div>
          <div class="lesson-chat-inp">
            <input id="ls-chat-inp" placeholder="Вопрос…" onkeydown="if(event.key==='Enter')lsSendMsg('student')">
            <button onclick="lsSendMsg('student')">➤</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  _startChatPoll(live.code, 'student');
  _embedJitsi(live.room, currentUser?.name||'Ученик');
}

function _renderLessonChatMsgs(chat, viewer){
  if(!chat.length) return '<div style="color:var(--text3);font-size:0.8rem;text-align:center;padding:20px 0">Сообщений пока нет</div>';
  return chat.map(m=>{
    const isMe = (viewer==='admin' && m.who==='admin') || (viewer==='student' && m.who==='student');
    const time = new Date(m.ts).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
    return `<div class="lmsg ${isMe?'mine':''}">
      <div class="lmsg-row">
        <div class="lmsg-bubble">${escHtml(m.text)}</div>
      </div>
      <div class="lmsg-meta" style="${isMe?'text-align:right':''}">${isMe?'Вы':esc(m.name)} · ${esc(time)}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════
function lsOnSlotChange(){
  const sel = document.getElementById('ls-slot-sel');
  if(!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const infoEl = document.getElementById('ls-slot-info');

  if(!sel.value){
    if(infoEl) infoEl.style.display='none';
    return;
  }

  const studentId  = opt.dataset.student||'';
  const groupId    = opt.dataset.group||'';
  const price      = opt.dataset.price||'0';
  const courseName = opt.dataset.coursename||'';
  const day        = opt.dataset.day||'';
  const time       = opt.dataset.time||'';

  // Auto-fill student select
  const stuSel = document.getElementById('ls-student-sel');
  if(stuSel && studentId) stuSel.value = studentId;

  // Auto-fill price
  const priceEl = document.getElementById('ls-price');
  if(priceEl) priceEl.value = price||'0';

  // Auto-fill topic if course name available
  const topicEl = document.getElementById('ls-topic');
  if(topicEl && courseName && !topicEl.value) topicEl.value = courseName;

  // Show info panel
  if(infoEl){
    const allUsers = load('users')||[];
    let whoText = '';
    if(groupId){
      const g = getGroups().find(x=>x.id===groupId);
      whoText = g ? `👥 Группа: ${esc(g.name)}` : '';
    } else if(studentId){
      const u = allUsers.find(u=>u.id===studentId);
      whoText = u ? `👤 Ученик: ${esc(u.name)}` : '';
    }
    infoEl.style.display = '';
    infoEl.innerHTML = [
      `🗓 <b>${day} ${time}</b>`,
      courseName ? `📚 Курс: <b>${courseName}</b>` : '',
      whoText,
      price ? `💰 Стоимость: <b>${price}₽</b> — будет предложено списать после занятия` : '💰 Стоимость не указана'
    ].filter(Boolean).join('<br>');
  }
}

function lsAdminCreate(){
  const topic     = (document.getElementById('ls-topic')||{}).value||'';
  const studentId = (document.getElementById('ls-student-sel')||{}).value||'';
  const slotId    = (document.getElementById('ls-slot-sel')||{}).value||'';
  const price     = parseInt((document.getElementById('ls-price')||{}).value||'0')||0;
  const code  = String(Math.floor(100000+Math.random()*900000));
  const room  = 'biohim-lesson-'+code;

  const lessonData = { code, room, topic, studentId, slotId, price, startedAt: Date.now() };
  saveLessonData(lessonData);
  _lessonCode   = code;
  _lessonRoom   = room;
  _lessonStart  = Date.now();
  _lessonActive = true;

  // Подписываемся на реалтайм — преподаватель видит актуальные данные
  _subscribeLessonData(code, () => { /* данные уже в _lessonDataCache */ });
  _subscribeLessonNote(code);
  _subscribeLessonChat(code, 'admin');

  // Уведомление ученику
  if(studentId){
    addNotif(studentId,{
      type:'lesson',
      text:`🎥 Занятие началось! Тема: ${topic||'Онлайн-урок'}. Код: ${code}`,
      nav:'student-lesson'
    });
  }

  showNotif('✅ Занятие начато! Код: '+code);
  renderAdminLesson();
  // Jitsi will be embedded after render via _renderActiveLessonAdmin
}

function lsOpenJitsi(){
  const live = getLessonData();
  if(!live) return;
  const url = _jitsiRoomUrl(live.room, currentUser?.name||'Преподаватель');
  window.open(url, '_blank', 'noopener');
}

let _jitsiAPI = null;
let _jitsiRoom = null;
let _jitsiWindow = null;

function _embedJitsi(room, displayName){
  _jitsiRoom = room;
  const wrap = document.getElementById('ls-jitsi-wrap');
  if(!wrap) return;

  // Set a good height for the video container
  wrap.style.height = '520px';
  wrap.style.minHeight = '520px';

  // Show loading state first
  wrap.innerHTML = `<div class="jitsi-loading" id="jitsi-loader">
    <div class="j-icon">📹</div>
    <div style="font-weight:700;font-size:1rem;color:#fff">Подключение к видеоконференции…</div>
    <p>Пожалуйста, подождите. Видео загружается прямо здесь.</p>
  </div>`;

  // Build Jitsi URL with all needed config to remove limits / branding
  const configParams = [
    'config.prejoinPageEnabled=false',
    'config.startWithAudioMuted=false',
    'config.startWithVideoMuted=false',
    'config.disableDeepLinking=true',
    'config.enableWelcomePage=false',
    'config.requireDisplayName=false',
    'config.enableLobbyChat=false',
    'config.enableLobby=false',
    'config.disableInviteFunctions=false',
    'config.toolbarButtons=["microphone","camera","desktop","fullscreen","fodeviceselection","hangup","chat","recording","livestreaming","etherpad","sharedvideo","settings","raisehand","videoquality","filmstrip","feedback","tileview","select-background","download","help","mute-everyone","security"]',
    'interfaceConfig.SHOW_JITSI_WATERMARK=false',
    'interfaceConfig.SHOW_BRAND_WATERMARK=false',
    'interfaceConfig.SHOW_CHROME_EXTENSION_BANNER=false',
    'interfaceConfig.SHOW_POWERED_BY=false',
    'interfaceConfig.DEFAULT_REMOTE_DISPLAY_NAME=Участник',
    'interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","desktop","fullscreen","hangup","chat","tileview","settings","raisehand","videoquality","filmstrip"]',
  ].join('&');

  const iframeSrc = `https://meet.jit.si/${encodeURIComponent(room)}#userInfo.displayName="${encodeURIComponent(displayName)}"&${configParams}`;

  // Create iframe and inject into wrap
  const iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.allow = 'camera; microphone; fullscreen; display-capture; autoplay; clipboard-read; clipboard-write';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;border-radius:16px;';
  iframe.id = 'jitsi-iframe';
  iframe.onload = () => {
    const loader = document.getElementById('jitsi-loader');
    if(loader) loader.style.display = 'none';
  };

  // Clear and inject
  wrap.innerHTML = '';
  wrap.style.position = 'relative';
  wrap.appendChild(iframe);

  // Add fullscreen toggle button overlay
  const fsBtn = document.createElement('button');
  fsBtn.title = 'Полноэкранный режим';
  fsBtn.innerHTML = '⛶';
  fsBtn.style.cssText = 'position:absolute;top:10px;right:10px;z-index:10;background:rgba(0,0,0,0.45);color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:1.1rem;cursor:pointer;backdrop-filter:blur(4px);';
  fsBtn.onclick = () => {
    if(!document.fullscreenElement){ wrap.requestFullscreen && wrap.requestFullscreen(); }
    else { document.exitFullscreen && document.exitFullscreen(); }
  };
  wrap.appendChild(fsBtn);
}

function _jitsiMarkOpen(el){
  setTimeout(()=>{
    el.textContent = '🔄 Переоткрыть видео';
    el.style.background = 'linear-gradient(135deg,#40916c,#2d6a4f)';
  }, 500);
}

function _jitsiRoomUrl(room, displayName){
  const params = [
    'config.prejoinPageEnabled=false',
    'config.startWithAudioMuted=false',
    'config.startWithVideoMuted=false',
    'config.disableDeepLinking=true',
    'config.enableWelcomePage=false',
    'config.requireDisplayName=false',
    'config.enableLobby=false',
  ].join('&');
  return `https://meet.jit.si/${room}#${params}`;
}

function _initJitsiAPI(room, displayName){ _embedJitsi(room, displayName); }
function _jitsiFallbackIframe(room){ _embedJitsi(room, ''); }

function lsCopyCode(){
  const live = getLessonData();
  const code = live ? live.code : '';
  if(!code){ showNotif('Сначала создайте занятие'); return; }
  navigator.clipboard.writeText(code)
    .then(()=>showNotif('✅ Код '+code+' скопирован!'))
    .catch(()=>showNotif('Код: '+code));
}

function lsSaveNote(text){
  const live = getLessonData();
  if(!live) return;
  saveLessonNote(live.code, text);
  // Firebase-подписка доставит обновление ученику в реальном времени
}

const _CHAT_MAX_MSG_LEN = 2000;  // символов на сообщение
const _CHAT_MAX_HISTORY = 500;   // сообщений на комнату

function lsSendMsg(who){
  const live = getLessonData();
  if(!live) return;
  const inp = document.getElementById('ls-chat-inp');
  if(!inp||!inp.value.trim()) return;
  let text = inp.value.trim();
  if(text.length > _CHAT_MAX_MSG_LEN){
    text = text.slice(0, _CHAT_MAX_MSG_LEN);
    showNotif(`⚠️ Сообщение обрезано до ${_CHAT_MAX_MSG_LEN} символов`);
  }
  inp.value = '';
  const name = who==='admin' ? 'Преподаватель' : (currentUser?.name||'Ученик');
  let chat = getLessonChat(live.code);
  chat.push({ who, name, text, ts: Date.now() });
  // Не даём истории разрастись до бесконечности
  if(chat.length > _CHAT_MAX_HISTORY) chat = chat.slice(-_CHAT_MAX_HISTORY);
  saveLessonChat(live.code, chat);
  _renderChatNow(live.code, who);
}

function _renderChatNow(code, viewer){
  const el = document.getElementById('ls-chat-msgs');
  if(!el) return;
  const chat = getLessonChat(code);
  el.innerHTML = _renderLessonChatMsgs(chat, viewer);
  el.scrollTop = el.scrollHeight;
}

function _startChatPoll(code, viewer){
  // Все обновления теперь через Firebase-подписки:
  //   _subscribeLessonChat    — чат
  //   _subscribeLessonNote    — конспект
  //   _subscribeLessonData    — завершение урока
  // setInterval не нужен
  if(_lsChatPoll) clearInterval(_lsChatPoll);
  _subscribeLessonChat(code, viewer);
}

function _startLessonTimer(){
  if(_lessonTimer) clearInterval(_lessonTimer);
  _lessonTimer = setInterval(()=>{
    const el = document.getElementById('ls-timer');
    if(!el){ clearInterval(_lessonTimer); return; }
    const elapsed = Math.floor((Date.now()-_lessonStart)/1000);
    const mins = String(Math.floor(elapsed/60)).padStart(2,'0');
    const secs = String(elapsed%60).padStart(2,'0');
    el.textContent = mins+':'+secs;
  }, 1000);
}

function lsQuickSend(type, itemId, title){
  const live = getLessonData();
  if(!live || !live.studentId){ showNotif('Выберите ученика при создании занятия'); return; }
  const sid = live.studentId;
  if(type==='test'){
    const tests = load('tests')||[];
    const orig  = tests.find(t=>t.id===itemId);
    if(!orig){ showNotif('Тест не найден'); return; }
    tests.push({...orig, id:'t'+Date.now()+'_'+sid, studentId:sid, isLibrary:false, submitted:false, answers:{}, autoScore:0});
    save('tests', tests);
    addNotif(sid,{type:'test', text:`📝 Новый тест во время урока: ${title}`, nav:'tests'});
  } else {
    const hws  = load('hw')||[];
    const orig = hws.find(h=>h.id===itemId);
    if(!orig){ showNotif('ДЗ не найдено'); return; }
    hws.push({...orig, id:'hw'+Date.now()+'_'+sid, studentId:sid, isLibrary:false, submitted:false, answers:{}});
    save('hw', hws);
    addNotif(sid,{type:'hw', text:`✏️ Новое ДЗ во время урока: ${title}`, nav:'hw'});
  }
  showNotif(`✅ Отправлено ученику: ${title}`);
}

function lsEndLesson(){
  if(!confirm('Завершить занятие и записать в журнал?')) return;
  const live    = getLessonData();
  if(!live) return;
  const summary = (document.getElementById('ls-summary')||{}).value||'';
  const dur     = Math.round((Date.now()-_lessonStart)/60000);
  const price   = live.price||0;
  const slotId  = live.slotId||'';

  // Resolve slot info for attendance record
  const slot   = slotId ? (load('slots')||[]).find(s=>s.id===slotId) : null;
  const course  = slot?.courseId ? (load('courses')||[]).find(c=>c.id===slot.courseId) : null;
  const lessonId = 'ls_'+Date.now();

  // Записываем в журнал посещаемости
  const att = load('attendance')||[];
  att.push({
    lessonId,
    studentId:       live.studentId||'',
    date:            new Date().toLocaleDateString('ru'),
    time:            new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}),
    topic:           live.topic||'Занятие',
    summary,
    note:            getLessonNote(live.code),
    duration:        dur,
    present:         true,
    slotId,
    costPerStudent:  price,
    paid:            false
  });
  save('attendance', att);

  // Автоматически создать запись об оплате если цена указана
  if(price > 0 && live.studentId){
    const payments = load('payments')||[];
    const dateStr  = new Date().toLocaleDateString('ru');
    const slotLabel = slot ? ` · ${slot.day} ${slot.time}` : '';
    const courseLabel = course ? ` · ${course.title}` : '';
    payments.push({
      id:        'p'+Date.now(),
      studentId: live.studentId,
      period:    dateStr,
      amount:    price,
      status:    'unpaid',
      note:      `Занятие: ${live.topic||'Урок'}${slotLabel}${courseLabel}`,
      date:      dateStr,
      lessonId,
      slotId
    });
    save('payments', payments);
  }

  // Уведомление ученику
  if(live.studentId){
    addNotif(live.studentId,{
      type:'lesson',
      text:`✅ Занятие завершено! Тема: ${live.topic||'Урок'} · ${dur} мин${price?` · ${price}₽`:''}`,
      nav:'student-lesson'
    });
  }
  // Очистка — удаляем из Firebase (ученик получит событие и увидит экран завершения)
  const endCode = live.code;
  _deleteLessonData(endCode);
  _unsubscribeLessonNote(endCode);
  _unsubscribeLessonData(endCode);
  _lessonNoteFbRef(endCode).remove().catch(()=>{});
  _lessonActive = false;
  clearInterval(_lessonTimer);
  clearInterval(_lsChatPoll);
  if(typeof _jitsiAPI!=='undefined'&&_jitsiAPI){ try{_jitsiAPI.dispose();}catch(e){} _jitsiAPI=null; }
  if(_jitsiWindow && !_jitsiWindow.closed){ try{_jitsiWindow.close();}catch(e){} }
  showNotif(`✅ Занятие завершено! Длительность: ${dur} мин${price?` · Оплата ${price}₽ добавлена`:''}`);
  renderAdminLesson();
}

async function lsStudentJoin(){
  const input = document.getElementById('ls-code-input');
  if(!input||!input.value.trim()){ showNotif('Введите код занятия'); return; }
  const code = input.value.trim().replace(/\D/g,'');
  if(code.length!==6){ showNotif('Код — 6 цифр'); return; }

  showNotif('⏳ Подключение...');
  const data = await loadLessonDataAsync(code);
  if(!data || !data.code){
    showNotif('❌ Занятие не найдено. Проверьте код.');
    return;
  }

  // Подписываемся на реалтайм — ученик видит данные преподавателя
  _subscribeLessonData(code, live => {
    if(!live) {
      // Преподаватель завершил урок
      clearInterval(_lsChatPoll);
      _unsubscribeLessonNote(code);
      _unsubscribeLessonData(code);
      _lessonDataCache = null;
      renderStudentLesson();
    }
  });
  _subscribeLessonNote(code);
  _subscribeLessonChat(code, 'student');

  sessionStorage.setItem('biohim_active_lesson_code', code);
  renderLesson('student');
}

function lsStudentOpenVideo(code){
  const room = 'biohim-lesson-'+code;
  const url = _jitsiRoomUrl(room, currentUser?.name||'Ученик');
  const wrap = document.getElementById('ls-jitsi-wrap');
  if(wrap){ _embedJitsi(room, currentUser?.name||'Ученик'); }
  window.open(url, '_blank', 'noopener');
}



// ═══════════════════════════════════════════════════════
// MAIN APPLICATION CODE
// ═══════════════════════════════════════════════════════
// ══════════════════════════════════════════
// ══════════════════════════════════════════
// FIREBASE REALTIME DATABASE
// ══════════════════════════════════════════
const COLLECTIONS = ['users','content','tests','hw','payments','courses','slots','bookings','notifs','trials','groups','attendance','taskbank','flashcard_decks'];

const _fbConfig = {
  apiKey: "AIzaSyAh_g-_X0bMd23YEh5r5dO3xLu4Awpb1ns",
  authDomain: "biohim-a36ce.firebaseapp.com",
  databaseURL: "https://biohim-a36ce-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "biohim-a36ce",
  storageBucket: "biohim-a36ce.firebasestorage.app",
  messagingSenderId: "797458613466",
  appId: "1:797458613466:web:f2e734a65e4e84b7ce51e3"
};

// Firebase SDK (compat version — работает без сборщика)
let _fbApp, _fbDB;
function _fbInit(){
  if(_fbDB) return _fbDB;
  if(!firebase.apps.length) _fbApp = firebase.initializeApp(_fbConfig);
  else _fbApp = firebase.apps[0];
  _fbDB = firebase.database();
  return _fbDB;
}
function _fbRef(k){ return _fbInit().ref('db/' + k); }

// Синхронный кэш — заполняется при preloadCache
const _cache = {};
// Сообщение об ошибке preloadCache (null = всё ок); показывается после входа
let _preloadWarning = null;

// ── Сворачиваемые карточки ──
function toggleCollapse(id, btn){
  const body = document.getElementById('cb-' + id);
  const title = btn || body?.previousElementSibling;
  if(!body) return;
  const collapsed = body.classList.toggle('collapsed');
  if(title) title.classList.toggle('collapsed', collapsed);
}
function toggleNotifExpand(btn, extraCount){
  const list = btn.closest('#student-notifs-list') || btn.parentElement;
  const hidden = list.querySelectorAll('[data-notif-idx]');
  const isExpanded = btn.dataset.expanded === '1';
  hidden.forEach(el=>{
    const idx = +el.dataset.notifIdx;
    if(idx >= 5) el.style.display = isExpanded ? 'none' : '';
  });
  btn.dataset.expanded = isExpanded ? '0' : '1';
  btn.textContent = isExpanded ? `▼ Ещё ${extraCount} уведомлений` : '▲ Свернуть';
}

function load(k){
  return (k in _cache) ? _cache[k] : null;
}

// Дебаунсированные рендеры: ключ = "pageId|fn", ждём 0мс (следующий тик)
const _renderNowQueue = {};
function renderNow(k) {
  if (!currentUser || !window._REALTIME_PAGE_MAP) return;
  const entry = window._REALTIME_PAGE_MAP[k];
  if (!entry) return;
  const m = entry[currentUser.role] || entry['admin'];
  if (!m) return;
  if (curPage !== m.pageId) return;
  const key = m.pageId + '|' + m.fn;
  if (_renderNowQueue[key]) return; // уже запланирован
  _renderNowQueue[key] = true;
  setTimeout(() => {
    delete _renderNowQueue[key];
    if (currentUser && curPage === m.pageId && typeof window[m.fn] === 'function') {
      window[m.fn]();
    }
  }, 0);
}

function save(k, v){
  _cache[k] = v;
  console.log('[SAVE] Сохранение данных:', k, 'записей:', Array.isArray(v) ? v.length : typeof v);
  
  // Немедленно перерисовываем текущую страницу — без ожидания Firebase echo
  renderNow(k);
  
  // Асинхронно пишем в Firebase (не блокируем UI)
  const fbRef = _fbRef(k);
  if (!fbRef) {
    console.error('[Firebase] ОШИБКА: fbRef не инициализирован для ключа', k);
    showNotif('⚠️ Ошибка соединения с сервером. Данные могут не сохраниться.');
    return;
  }
  
  fbRef.set(v === null ? null : v)
    .then(() => {
      console.log('[Firebase] ✅ Данные успешно сохранены:', k);
    })
    .catch(e => {
      console.error('[Firebase] ❌ ОШИБКА сохранения', k, e);
      console.error('[Firebase] Детали ошибки:', e.message, e.code);
      showNotif('⚠️ Ошибка сохранения данных: ' + (e.message || 'Проверьте подключение к интернету'));
    });
}

/**
 * Вызывается напрямую из save-функций для принудительного рендера
 * конкретного компонента (например renderPaymentAdmin внутри renderStudents).
 * Используйте когда коллекция и страница не совпадают с PAGE_MAP.
 */
function renderComponent(fn) {
  if (typeof window[fn] === 'function') window[fn]();
}

async function preloadCache(){
  const TIMEOUT_MS = 10000;
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error('Firebase timeout — проверьте соединение или правила базы данных')), TIMEOUT_MS)
  );
  const db = _fbInit();
  console.log('[preloadCache] Начало загрузки данных из Firebase...');
  
  try {
    const snap = await Promise.race([db.ref('db').get(), timeout]);
    const data = snap.val() || {};
    console.log('[preloadCache] Данные получены из Firebase:', Object.keys(data));
    
    const ARRAY_COLLECTIONS = ['attendance','payments','content','tests','hw','trials','slots','bookings','groups','notifs','taskbank','flashcard_decks','courses'];
    COLLECTIONS.forEach(k => { 
      const raw = data[k] !== undefined ? data[k] : null;
      // Firebase хранит массивы как объекты — конвертируем
      if (raw !== null && !Array.isArray(raw) && typeof raw === 'object' && ARRAY_COLLECTIONS.includes(k)) {
        _cache[k] = Object.values(raw);
      } else {
        _cache[k] = raw;
      }
      const count = Array.isArray(_cache[k]) ? _cache[k].length : (_cache[k] ? 'объект' : 'null');
      console.log('[preloadCache] Загружена коллекция:', k, '- записей:', count);
    });
    
    console.log('[preloadCache] ✅ Все данные успешно загружены');
  } catch(e) {
    // При таймауте или сетевой ошибке — инициализируем пустым кешем и продолжаем.
    // Реальтайм-подписки (subscribeRealtime) заполнят кеш после восстановления соединения.
    console.error('[Firebase] ❌ КРИТИЧЕСКАЯ ОШИБКА preloadCache:', e.message);
    console.warn('[Firebase] preloadCache failed, continuing with empty cache:', e.message);
    COLLECTIONS.forEach(k => { if (!(k in _cache)) _cache[k] = null; });
    // Показываем ненавязчивое предупреждение — не блокируем вход
    _preloadWarning = e.message;
  }
}

// ═══════════════════════════════════════════════════════════════
// VIEWED CACHE — просмотренные материалы (db/viewed/{sid})
// ═══════════════════════════════════════════════════════════════
const _viewedCache = {};

function _getViewedCache(sid) {
  return _viewedCache[sid] || {};
}
function _saveViewed(sid, map) {
  _viewedCache[sid] = map;
  _fbInit().ref('db/viewed/' + sid).set(map)
    .catch(e => console.error('[Firebase] viewed save', e));
}

// ═══════════════════════════════════════════════════════════════
// PRELOAD USER DATA — вызывать после preloadCache() при входе
// Загружает данные текущего пользователя из Firebase в кэши памяти
// ═══════════════════════════════════════════════════════════════
async function preloadUserData(user) {
  if (!user || !user.id) return;
  const sid = user.id;
  const db = _fbInit();
  try {
    const [
      walletSnap, srSnap, viewedSnap, videoSnap,
      goalsSnap, notifSnap, dailyLogSnap, dailyAnsSnap
    ] = await Promise.all([
      db.ref('db/wallet/'         + sid).get(),
      db.ref('db/sr/'             + sid).get(),
      db.ref('db/viewed/'         + sid).get(),
      db.ref('db/video_progress/' + sid).get(),
      db.ref('db/goals/'          + sid).get(),
      db.ref('db/notif_settings/' + sid).get(),
      db.ref('db/daily_task_log/' + sid).get(),
      db.ref('db/daily_answers/'  + sid).get(),
    ]);
    if (walletSnap.val())    _walletCache[sid]         = walletSnap.val();
    if (srSnap.val())        _srCache[sid]             = srSnap.val();
    if (viewedSnap.val())    _viewedCache[sid]         = viewedSnap.val();
    if (notifSnap.val())     _notifSettingsCache[sid]  = notifSnap.val();
    if (goalsSnap.val())     _goalsCache[sid]          = goalsSnap.val();
    if (dailyLogSnap.val())  _dailyTaskLogCache[sid]   = dailyLogSnap.val();
    if (dailyAnsSnap.val())  _dailyAnswersCache[sid]   = dailyAnsSnap.val();
    // video_progress хранится как {vidId: pct} — разворачиваем в плоский кэш
    if (videoSnap.val()) {
      const vmap = videoSnap.val();
      Object.keys(vmap).forEach(vidId => {
        _videoProgressCache[sid + '_' + vidId] = vmap[vidId];
      });
    }
    console.log('[preloadUserData] Данные пользователя загружены', sid);
  } catch(e) {
    console.warn('[preloadUserData] Ошибка загрузки, продолжаем с пустыми кэшами:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// ОДНОРАЗОВАЯ МИГРАЦИЯ localStorage → Firebase
// Запускается при первом входе, затем помечается флагом и не повторяется
// ═══════════════════════════════════════════════════════════════
async function runLocalStorageMigration(user) {
  if (!user || !user.id) return;
  const sid = user.id;
  try {
    const flagRef = _fbInit().ref('migrations/ls_v1/' + sid);
    const flagSnap = await flagRef.get();
    if (flagSnap.val() === true) return; // уже мигрировано

    console.log('[Migration] Старт для', sid);
    const db = _fbInit();

    async function migrateKey(lsKey, fbPath) {
      const raw = localStorage.getItem(lsKey);
      if (raw === null) return false;
      let parsed; try { parsed = JSON.parse(raw); } catch(e) { parsed = raw; }
      const existing = await db.ref(fbPath).get();
      if (existing.val() === null) await db.ref(fbPath).set(parsed);
      localStorage.removeItem(lsKey);
      return true;
    }

    await Promise.allSettled([
      migrateKey('biohim_wallet_'         + sid, 'db/wallet/'         + sid),
      migrateKey('biohim_sr_'             + sid, 'db/sr/'             + sid),
      migrateKey('biohim_viewed_'         + sid, 'db/viewed/'         + sid),
      migrateKey('biohim_goals_'          + sid, 'db/goals/'          + sid),
      migrateKey('biohim_notif_settings_' + sid, 'db/notif_settings/' + sid),
      migrateKey('biohim_daily_task_log',        'db/daily_task_log_legacy/' + sid),
      migrateKey('biohim_daily_answers',         'db/daily_answers_legacy/'  + sid),
      migrateKey('biohim_video_progress',        'db/video_progress/'        + sid),
    ]);

    await flagRef.set(true);
    console.log('[Migration] Завершена для', sid);

    // Перезагружаем кэши из Firebase после миграции
    await preloadUserData(user);
  } catch(e) {
    console.error('[Migration] Ошибка (вход продолжается):', e);
  }
}

// ══════════════════════════════════════════════════════
// SECURITY CORE
// ══════════════════════════════════════════════════════

// 1. XSS-защита: экранирование HTML
function esc(str){
  return String(str==null?'':str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ИСПРАВЛЕНО: отдельный эскейп для значений в атрибутах (onclick и пр.)
// Экранирует одиночные кавычки и обратный слеш, чтобы нельзя было вырваться из onclick='...'
function escAttr(str){
  return String(str==null?'':str)
    .replace(/\\/g,'\\\\')
    .replace(/'/g,"\\'")
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}



// ИСПРАВЛЕНО: блокируем все data: URI кроме изображений (было data(?!:image) — добавляем полный список)
function safeUrl(url){
  if(!url) return '#';
  const s = String(url).trim();
  // Блокируем javascript:, vbscript:, data: (кроме data:image и data:application/pdf)
  if(/^(javascript|vbscript|data(?!:image\/|:application\/pdf))/i.test(s)) return '#';
  if(/^data:/i.test(s) && !/^data:image\//i.test(s) && !/^data:application\/pdf/i.test(s)) return '#';
  return s;
}

// 3. Защита от брутфорса — счётчик дублируется в localStorage (переживает закрытие вкладки)
// и в sessionStorage (быстрый доступ в текущей сессии).
const _BF_SS_KEY = 'biohim_bf';
const _BF_LS_KEY = 'biohim_bf_persist';

function _bfLoad(){
  try {
    // localStorage — источник истины (переживает перезагрузку и закрытие вкладки)
    const ls = JSON.parse(localStorage.getItem(_BF_LS_KEY) || '{}');
    return ls;
  } catch(e) { return {}; }
}
function _bfSave(d){
  try {
    const s = JSON.stringify(d);
    localStorage.setItem(_BF_LS_KEY, s);
    sessionStorage.setItem(_BF_SS_KEY, s); // зеркало для быстрого доступа
  } catch(e) {}
}

function checkBruteForce(login){
  const now = Date.now();
  const data = _bfLoad();
  if(!data[login]) data[login]={count:0,blockedUntil:0};
  const rec = data[login];
  if(rec.blockedUntil > now){
    const secs = Math.ceil((rec.blockedUntil-now)/1000);
    document.getElementById('login-err').textContent=`Слишком много попыток. Подождите ${secs} сек.`;
    return false;
  }
  // Блокировка истекла — сбрасываем запись, чтобы localStorage не копил мусор
  if(rec.blockedUntil && rec.blockedUntil <= now){
    delete data[login];
    _bfSave(data);
  }
  return true;
}
function recordFailedLogin(login){
  const data = _bfLoad();
  if(!data[login]) data[login]={count:0,blockedUntil:0};
  const rec = data[login];
  rec.count++;
  if(rec.count >= 5){
    rec.blockedUntil = Date.now() + 60000; // 1 минута
    rec.count = 0;
  }
  _bfSave(data);
}
function resetLoginAttempts(login){
  const data = _bfLoad();
  delete data[login];
  _bfSave(data);
}

// 4. Проверка прав доступа
const ADMIN_PAGES = ['students','tests-admin','hw-admin','content-admin',
  'payments','schedule-admin','courses','analytics','settings',
  'reports-admin','taskbank-admin','flashcards-admin','notif-settings-admin','finance-admin',
  'zoom-settings','attend-pay-admin','admin-lesson','dashboard','grades-admin','challenges-admin'];
const ADMIN_FNS = ['deleteTest','deleteHW','deleteContent','deleteTrial',
  'deleteStudent','saveTest','saveHW','addTheory','saveTrial',
  'saveSlot','deleteSlot','saveEditTest','saveEditHW','saveEditTrial',
  'importMaterial','importTest','importHW','importTrial',
  'resetAllData'];

function requireAdmin(fnName){
  if(!currentUser || currentUser.role !== 'admin'){
    showNotif('⛔ Нет доступа');
    console.warn('Unauthorized call:', fnName, 'by', currentUser?.role);
    throw new Error('Unauthorized: ' + fnName);
  }
}

// 5. Безопасный доступ к объекту вместо eval()
const _answerStores = {};
function getAnswerStore(name){
  if(name==='_testAnswers')  return _testAnswers;
  if(name==='_trialAnswers') return _trialAnswers;
  return null;
}
function getAnswer(storeName, qId){
  const store = getAnswerStore(storeName);
  return store ? (store[qId]||'') : '';
}
function setAnswer(storeName, qId, val){
  const store = getAnswerStore(storeName);
  if(store) store[qId] = val;
}



function subscribeRealtime(){
  const db = _fbInit();
  console.log('[subscribeRealtime] Подписка на realtime обновления...');

  // Страницы, которые нужно перерисовать при изменении конкретной коллекции.
  // Ключ — имя коллекции; значение — { pageId, fn } для студента и для админа.
  const PAGE_MAP = {
    content:        { student: { pageId: 'student-library',  fn: 'renderStudentLibrary' },
                      admin:   { pageId: 'content-admin',    fn: 'renderContentAdmin'   } },
    tests:          { student: { pageId: 'student-works',    fn: 'renderStudentWorks'   },
                      admin:   { pageId: 'tests-admin',      fn: 'renderTestsAdmin'     } },
    hw:             { student: { pageId: 'student-works',    fn: 'renderStudentWorks'   },
                      admin:   { pageId: 'hw-admin',         fn: 'renderHWAdmin'        } },
    trials:         { student: { pageId: 'student-works',    fn: 'renderStudentWorks'   },
                      admin:   { pageId: 'trial-admin',      fn: 'renderTrialAdmin'     } },
    users:          { admin:   { pageId: 'students',         fn: 'renderStudents'       } },
    payments:       { admin:   { pageId: 'students',         fn: 'renderStudents'       },
                      student: { pageId: 'student-payment',  fn: 'renderStudentPayment' } },
    slots:          { admin:   { pageId: 'schedule-admin',   fn: 'renderScheduleAdmin'  },
                      student: { pageId: 'student-schedule', fn: 'renderStudentSchedule'} },
    bookings:       { admin:   { pageId: 'schedule-admin',   fn: 'renderScheduleAdmin'  },
                      student: { pageId: 'student-schedule', fn: 'renderStudentSchedule'} },
    attendance:     { admin:   { pageId: 'attend-pay-admin', fn: 'renderAtpAttendance'  },
                      student: { pageId: 'student-payment',  fn: 'renderStudentPayment' } },
    groups:         { admin:   { pageId: 'students',         fn: 'renderStudents'       },
                      student: { pageId: 'student-schedule', fn: 'renderStudentSchedule'} },
    taskbank:       { admin:   { pageId: 'taskbank-admin',   fn: 'renderTaskBankAdmin'  } },
    flashcard_decks:{ student: { pageId: 'student-library',  fn: 'renderStudentLibrary' },
                      admin:   { pageId: 'content-admin',    fn: 'renderContentAdmin'   } },
    courses:        { admin:   { pageId: 'schedule-admin',   fn: 'renderScheduleAdmin'  },
                      student: { pageId: 'student-schedule', fn: 'renderStudentSchedule'} },
  };

  // Дедупликация рендеров: одна отложенная задача на (роль, pageId, fn).
  // Ключ вида "admin|students|renderStudents" гарантирует, что payments и users,
  // изменившиеся одновременно, вызовут renderStudents лишь раз.
  const _pendingRenders = {};
  const _flushRender = debounce(() => {
    const tasks = Object.values(_pendingRenders);
    for (const k in _pendingRenders) delete _pendingRenders[k];
    tasks.forEach(({ pageId, fn }) => {
      if (!currentUser) return;
      if (curPage !== pageId) return;
      if (typeof window[fn] === 'function') window[fn]();
    });
  }, 300);

  function _scheduleRender(pageId, fn) {
    const key = pageId + '|' + fn;
    _pendingRenders[key] = { pageId, fn };
    _flushRender();
  }

  // Сохраняем PAGE_MAP глобально — используется в renderNow()
  window._REALTIME_PAGE_MAP = PAGE_MAP;

  // Подписки на все коллекции: кеш обновляется немедленно,
  // рендер — дебаунсированно через _scheduleRender.
  COLLECTIONS.forEach(k => {
    db.ref('db/' + k).on('value', snap => {
      const val = snap.val();
      const oldVal = _cache[k];
      // Firebase возвращает объект вместо массива — конвертируем обратно
      const ARRAY_COLLECTIONS = ['attendance','payments','content','tests','hw','trials','slots','bookings','groups','notifs','taskbank','flashcard_decks','courses'];
      if (val !== null && val !== undefined && !Array.isArray(val) && typeof val === 'object' && ARRAY_COLLECTIONS.includes(k)) {
        _cache[k] = Object.values(val);
      } else {
        _cache[k] = val !== undefined ? val : null;
      }
      
      // Логируем только если данные изменились
      const oldCount = Array.isArray(oldVal) ? oldVal.length : (oldVal ? 'объект' : 'null');
      const newCount = Array.isArray(val) ? val.length : (val ? 'объект' : 'null');
      if (JSON.stringify(oldVal) !== JSON.stringify(val)) {
        console.log('[Realtime] Обновление коллекции:', k, 'было:', oldCount, 'стало:', newCount);
      }

      if (!currentUser) return;
      const entry = PAGE_MAP[k];
      if (!entry) return;
      const m = entry[currentUser.role] || entry['admin'];
      if (m) _scheduleRender(m.pageId, m.fn);
    });
  });

  console.log('[subscribeRealtime] ✅ Подписки активированы для', COLLECTIONS.length, 'коллекций');

  // notifs — дебаунсированный badge + список
  const _flushNotifs = debounce(() => {
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
    if (currentUser && currentUser.role === 'student') {
      const el = document.getElementById('student-notifs-list');
      if (el && typeof renderStudentNotifs === 'function') renderStudentNotifs();
    }
  }, 300);
  db.ref('db/notifs').on('value', _flushNotifs);

  // admin_notifs — дебаунсированный badge + список
  const _flushAdminNotifs = debounce(() => {
    updateChatBadge();
    if (currentUser && currentUser.role === 'admin' && typeof renderAdminNotifsList === 'function') {
      renderAdminNotifsList();
    }
  }, 300);
  db.ref('admin_notifs').on('value', snap => {
    const val = snap.val();
    _adminNotifsCache = val ? (Array.isArray(val) ? val : Object.values(val)) : [];
    _flushAdminNotifs();
  });
}

// ══════════════════════════════════════════
// ХЕШИРОВАНИЕ ПАРОЛЕЙ (Web Crypto API)
// ══════════════════════════════════════════
// ИСПРАВЛЕНО: используем HMAC-SHA256 с солью вместо чистого SHA-256
// Замените _SITE_SALT уникальным секретом при развёртывании
const _SITE_SALT = 'biohim_s@lt_2024_CHANGE_ME_IN_PRODUCTION';
async function hashPassword(plain){
  const enc = new TextEncoder();
  const key  = await crypto.subtle.importKey('raw', enc.encode(_SITE_SALT), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const sig  = await crypto.subtle.sign('HMAC', key, enc.encode(plain));
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ══════════════════════════════════════════
// DEFAULT DATA (записываются один раз)
// ══════════════════════════════════════════
async function initData(){
  try {
    // Миграция plain-text паролей → SHA-256
    const existingUsers = load('users')||[];
    const needsMigration = existingUsers.some(u => u.password && !u.passwordHash);
    if(needsMigration){
      const migrated = await Promise.all(existingUsers.map(async u => {
        if(u.password && !u.passwordHash){
          u.passwordHash = await hashPassword(u.password);
          delete u.password;
        }
        return u;
      }));
      save('users', migrated);
    }
    const users = load('users') || [];
    const admin = users.find(u => u.login === 'admin');
    if (admin) {
      // ИСПРАВЛЕНО: убрана автоматическая перезапись хеша пароля администратора
      // (это было уязвимостью типа "backdoor" — сбрасывало пароль при каждом запуске)
      // Если нужно сбросить пароль — делайте это явно через интерфейс администратора.
    }
  } catch(e){ console.warn('password migration error', e); }

  if(!(load('users')||[]).length){
    const adminHash = await hashPassword('admin123');
    const stuHash   = await hashPassword('1234');
    save('users',[
      {id:'admin', login:'admin', passwordHash: adminHash, name:'Преподаватель', role:'admin', mustChangePassword: true},
      {id:'anna',  login:'anna',  passwordHash: stuHash,   name:'Анна Петрова',  role:'student', subject:'Биология', active:true, mustChangePassword: true},
      {id:'dima',  login:'dima',  passwordHash: stuHash,   name:'Дмитрий Козлов',role:'student', subject:'Химия',    active:true, mustChangePassword: true}
    ]);
  }
  if(!(load('courses')||[]).length){
    save('courses',[
      {id:'c1',title:'Биология ЕГЭ',subject:'Биология',format:'individual',price:1800,desc:'Подготовка к ЕГЭ по биологии. Теория + практика.'},
      {id:'c2',title:'Химия ОГЭ',subject:'Химия',format:'individual',price:1600,desc:'Подготовка к ОГЭ по химии. Разбор заданий.'},
      {id:'c3',title:'Общий курс: Клетка',subject:'Биология + Химия',format:'group',price:900,desc:'Групповые занятия по теме "Клетка".'},
    ]);
  }
  if(!(load('slots')||[]).length){
    save('slots',[
      {id:'s1',day:'Понедельник',time:'10:00',dur:60,bookedBy:null},
      {id:'s2',day:'Понедельник',time:'12:00',dur:60,bookedBy:null},
      {id:'s3',day:'Среда',time:'11:00',dur:90,bookedBy:'anna'},
      {id:'s4',day:'Пятница',time:'14:00',dur:60,bookedBy:null},
      {id:'s5',day:'Суббота',time:'10:00',dur:60,bookedBy:'dima'},
    ]);
  }
  if(!load('payments')) save('payments',[]);
  if(!load('attendance')) save('attendance',[]);
  if(!load('tests'))    save('tests',[]);
  if(!load('hw'))       save('hw',[]);
  if(!load('content'))  save('content',[]);
  if(!load('bookings')) save('bookings',[]);
  if(!load('notifs'))   save('notifs',[]);
  if(!load('groups'))   save('groups',[]);
}

// ══════════════════════════════════════════
// RESET (admin only)
// ══════════════════════════════════════════
async function resetAllData(){
  requireAdmin('resetAllData');
  if(!confirm('Удалить ВСЕ данные платформы? Ученики, материалы, тесты, ДЗ — всё будет удалено безвозвратно.')) return;
  await _fbInit().ref('db').remove();
  COLLECTIONS.forEach(k => { _cache[k] = null; });
  localStorage.removeItem('biohim_session');
  _adminNotifsRef().set([]).catch(()=>{}); _adminNotifsCache=[];
  location.reload();
}

let currentUser = null;

async function doLogin(){
  const uname = document.getElementById('login-username').value.trim();
  const upass  = document.getElementById('login-password').value;
  const errEl  = document.getElementById('login-err');

  if(!checkBruteForce(uname)) return;

  const users = load('users')||[];
  if(!users.length){
    errEl.textContent = 'Ошибка: пользователи не загружены. Обновите страницу.';
    return;
  }

  const found = users.find(u=>u.login===uname);
  if(!found){
    errEl.textContent = 'Пользователь не найден.';
    recordFailedLogin(uname);
    return;
  }

  // Поддержка обоих форматов: только хеш (plain-text больше не принимается)
  let ok = false;
  if(found.passwordHash){
    const inputHash = await hashPassword(upass);
    ok = found.passwordHash === inputHash;
  }

  if(!ok){
    recordFailedLogin(uname);
    errEl.textContent = 'Неверный пароль.';
    return;
  }
  resetLoginAttempts(uname);
  errEl.textContent = '';
  // ИСПРАВЛЕНО: проверяем флаг обязательной смены пароля
  if(found.mustChangePassword){
    errEl.textContent = '⚠️ Пожалуйста, смените временный пароль в настройках профиля.';
    errEl.style.color = 'var(--gold)';
  }
  _startSession(found);
}
async function _startSession(user){
  currentUser = user;
  // Сессия БЕЗ пароля, с временем истечения
  const sessionData = {
    id: user.id, role: user.role, name: user.name,
    login: user.login, subject: user.subject||'',
    loginAt: Date.now(),
    expiresAt: Date.now() + 12*60*60*1000 // 12 часов
  };
  localStorage.setItem('biohim_session', JSON.stringify(sessionData));
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  const resetBtn = document.getElementById('btn-reset-data');
  if(resetBtn) resetBtn.style.display = user.role==='admin' ? 'block' : 'none';
  initDarkTheme();
  buildNav();
  subscribeRealtime();
  // Загружаем пользовательские данные из Firebase в кэш + одноразовая миграция из localStorage
  await runLocalStorageMigration(user);
  await preloadUserData(user);
  const defaultPage = user.role==='admin' ? 'dashboard' : user.role==='parent' ? 'parent-dashboard' : 'student-dashboard';
  let lastPage = localStorage.getItem('biohim_last_page_'+user.id) || defaultPage;
  // Redirect legacy student page IDs to new combined pages
  const _legacyPageMap = {
    'student-materials':'student-library','student-repeat':'student-library',
    'student-tests':'student-works','student-hw':'student-works',
    'student-trial':'student-works','student-mistakes':'student-library',
    'student-grades':'student-progress','student-goals':'student-progress',
    'student-analytics':'student-progress','student-challenges':'student-progress',
    'student-flashcards':'student-library',
    'student-notif-settings':'student-settings',
  };
  if(_legacyPageMap[lastPage]) lastPage = _legacyPageMap[lastPage];
  navigateTo(lastPage);
}
function doLogout(){
  _lessonActive=false;
  if(_lessonTimer) clearInterval(_lessonTimer);
  if(_lsChatPoll)  clearInterval(_lsChatPoll);
  if(currentUser) localStorage.removeItem('biohim_last_page_'+currentUser.id);
  currentUser=null;
  localStorage.removeItem('biohim_session');
  document.getElementById('app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('login-err').textContent='';
  document.getElementById('login-username').value='';
  document.getElementById('login-password').value='';
  sessionStorage.removeItem('bf_login_attempts');
}

// ══════════════════════════════════════════
// NAV
// ══════════════════════════════════════════
const adminNav=[
  {section:'Главное'},
  {id:'dashboard',icon:'🏠',label:'Дашборд'},
  {id:'students', icon:'👥',label:'Ученики'},
  {section:'Контент'},
  {id:'content-admin',icon:'📚',label:'Материалы'},
  {id:'tests-admin',  icon:'📋',label:'Тесты'},
  {id:'hw-admin',     icon:'✏️', label:'Домашние задания'},
  {id:'trial-admin',  icon:'🎯', label:'Пробник'},
  {id:'taskbank-admin',icon:'🎲',label:'База заданий'},
  {id:'flashcards-admin',icon:'🃏',label:'Флешкарты'},
  {id:'grades-admin', icon:'🏅', label:'Оценки учеников'},
  {id:'challenges-admin', icon:'🏆', label:'Челленджи и рейтинг'},
  {section:'Управление'},
  {id:'chat-admin',       icon:'💬', label:'Чат с учениками'},
  {id:'zoom-settings',    icon:'⚙️', label:'Настройки платформы'},
  {id:'attend-pay-admin', icon:'📅', label:'Посещение и оплата'},
  {id:'schedule-admin',   icon:'🗓', label:'Расписание'},
  {id:'finance-admin',    icon:'💰', label:'Финансы'},
  {id:'reports-admin',    icon:'📊', label:'Отчёты по ученикам'},
  {id:'notif-settings-admin', icon:'🔔', label:'Интеграции уведомлений'},
  {section:'Занятие'},
  {id:'admin-lesson', icon:'🎥', label:'Онлайн-занятие'},
];
const studentNav=[
  {section:'Учёба'},
  {id:'student-dashboard',  icon:'🏠', label:'Главная'},
  {id:'student-library',    icon:'📚', label:'Материалы и повторение'},
  {id:'student-works',      icon:'📋', label:'Проверочные работы'},
  {id:'student-taskbank',   icon:'🎲', label:'Банк заданий'},
  {section:'Прогресс'},
  {id:'student-progress',   icon:'📊', label:'Мой прогресс'},
  {section:'Общение'},
  {id:'student-chat',       icon:'💬', label:'Чат'},
  {id:'student-schedule',   icon:'🗓', label:'Запись на занятия'},
  {id:'student-payment',    icon:'💰', label:'Оплата'},
  {section:'Занятие'},
  {id:'student-lesson',     icon:'🎥', label:'Онлайн-занятие'},
  {section:'Аккаунт'},
  {id:'student-settings',   icon:'⚙️', label:'Настройки'},
];


const parentNav=[
  {section:'Кабинет'},
  {id:'parent-dashboard', icon:'👨‍👩‍👧', label:'Дашборд'},
  {id:'parent-settings',  icon:'⚙️',  label:'Настройки'},
];
function buildNav(){
  const nav = currentUser.role==='admin'?adminNav:currentUser.role==='parent'?parentNav:studentNav;
  const el  = document.getElementById('sidebar-nav');
  const lessonOn = getFeatureToggle('online_lesson');
  el.innerHTML='';
  let skipSection = false;
  nav.forEach((n, i)=>{
    if(n.section){
      // Check if this section only contains lesson items (all hidden)
      const sectionItems = [];
      for(let j=i+1; j<nav.length; j++){
        if(nav[j].section) break;
        sectionItems.push(nav[j]);
      }
      const allHidden = sectionItems.length > 0 && sectionItems.every(item =>
        !lessonOn && (item.id==='admin-lesson' || item.id==='student-lesson')
      );
      skipSection = allHidden;
      if(!allHidden) el.innerHTML+=`<div class="nav-section">${n.section}</div>`;
      return;
    }
    // Hide lesson pages if feature is disabled
    if(!lessonOn && (n.id==='admin-lesson' || n.id==='student-lesson')) return;
    el.innerHTML+=`<div class="nav-item" id="nav-${n.id}" onclick="navigateTo('${n.id}')"><span class="icon">${n.icon}</span>${n.label}</div>`;
  });
  document.getElementById('sidebar-name').textContent=currentUser.name;
  document.getElementById('sidebar-role').textContent=currentUser.role==='admin'?'Преподаватель':currentUser.role==='parent'?'Родитель':'Ученик';
  setTimeout(()=>{ updateChatBadge(); updateAdminBadge(); updateMistakesBadge(); }, 50);
  buildMobileTaskbar();
}

function openAdminChatById(sid){
  navigateTo('chat-admin');
  setTimeout(()=>openAdminChat(sid), 80);
}

let curPage='';
function buildMobileTaskbar(){
  const el = document.getElementById('mobile-taskbar');
  if(!el) return;
  const lessonOn = getFeatureToggle('online_lesson');
  let nav;
  if(currentUser.role==='admin')        nav = adminNav;
  else if(currentUser.role==='student') nav = studentNav;
  else                                   nav = parentNav;
  // Filter: skip section headers, skip lesson if disabled
  const items = nav.filter(n =>
    n.id &&
    !((!lessonOn) && (n.id==='admin-lesson' || n.id==='student-lesson'))
  );
  el.innerHTML = items.map(n=>`
    <button class="tb-item" id="tb-${n.id}" onclick="navigateTo('${n.id}')">
      <span class="tb-icon">${n.icon}</span>
      <span>${n.label}</span>
    </button>`).join('');
}

function updateMobileTaskbar(activeId){
  document.querySelectorAll('#mobile-taskbar .tb-item').forEach(el=>{
    el.classList.toggle('active', el.id==='tb-'+activeId);
  });
}

function navigateTo(page){
  // Защита маршрутов — ученик не может зайти на страницы администратора
  if(ADMIN_PAGES.includes(page) && currentUser && currentUser.role !== 'admin'){
    showNotif('⛔ Нет доступа к этой странице');
    console.warn('Route guard blocked:', page, 'for role:', currentUser.role);
    return;
  }
  // Admin cannot navigate to student-only pages
  const STUDENT_ONLY_PAGES = ['student-dashboard','student-materials','student-tests',
    'student-hw','student-trial','student-chat','student-grades','student-mistakes','student-taskbank',
    'student-payment','student-schedule','student-repeat','student-lesson',
    'student-notif-settings','student-goals','student-challenges','student-library','student-works','student-progress','student-settings'];
  if(STUDENT_ONLY_PAGES.includes(page) && currentUser && currentUser.role === 'admin'){
    console.warn('Admin blocked from student page:', page);
    return;
  }
  // Parent role: block all pages except parent-dashboard and parent-settings
  if(currentUser && currentUser.role === 'parent' && page !== 'parent-dashboard' && page !== 'parent-settings'){
    showNotif('⛔ Нет доступа');
    return;
  }
  // Защита выключенных функций
  if((page==='admin-lesson'||page==='student-lesson') && !getFeatureToggle('online_lesson')){
    showNotif('Раздел «Онлайн-занятие» отключён в настройках');
    return;
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const el=document.getElementById('page-'+page);
  if(el) el.classList.add('active');
  const nav=document.getElementById('nav-'+page);
  if(nav) nav.classList.add('active');
  curPage=page;
  updateMobileTaskbar(page);
  if(currentUser) localStorage.setItem('biohim_last_page_'+currentUser.id, page);
  renderPage(page);
}

// ══════════════════════════════════════════
// RENDER PAGES
// ══════════════════════════════════════════
let _selectedStudent = null;

function renderPage(p){
  if(p==='dashboard') renderDashboard();
  else if(p==='students') renderStudents();
  else if(p==='content-admin'){ buildStudentSelector('content-student-selector', ()=>renderContentAdmin()); renderContentAdmin(); }
  else if(p==='tests-admin'){ renderTestsAdmin(); renderOpenAnswers(); }
  else if(p==='hw-admin'){ renderHWAdmin(); renderHWOpenAnswers(); }
  else if(p==='trial-admin'){ renderTrialAdmin(); }
  else if(p==='taskbank-admin'){ renderTaskBankAdmin(); }
  else if(p==='flashcards-admin'){ renderFlashcardsAdmin(); }
  else if(p==='student-trial'){ if(currentUser&&currentUser.role==='student') renderStudentTrial(); }
  else if(p==='chat-admin'){ renderChatAdmin(); }
  else if(p==='student-chat'){ renderStudentChat(); }
  else if(p==='attend-pay-admin'){ buildStudentSelector('atp-student-selector', ()=>renderAtpPage()); renderAtpPage(); }
  else if(p==='payment-admin'){ buildStudentSelector('atp-student-selector', ()=>renderAtpPage()); renderAtpPage(); } // legacy redirect
  else if(p==='schedule-admin') renderScheduleAdmin();
  else if(p==='finance-admin') renderFinanceDashboard();
  else if(p==='reports-admin') renderReportsAdmin();
  else if(p==='student-dashboard') renderStudentDashboard();
  else if(p==='student-materials'){ if(currentUser&&currentUser.role==='student') renderStudentMaterials(); }
  else if(p==='student-repeat') renderRepeatPage();
  else if(p==='student-tests'){ if(currentUser&&currentUser.role==='student') renderStudentTests(); }
  else if(p==='student-hw'){ if(currentUser&&currentUser.role==='student') renderStudentHW(); }
  else if(p==='student-grades') renderStudentGrades();
  else if(p==='student-mistakes') renderStudentMistakes();
  else if(p==='student-goals') renderStudentGoals();
  else if(p==='student-analytics') renderStudentAnalytics();
  else if(p==='grades-admin') renderGradesAdmin();
  else if(p==='student-taskbank') renderStudentTaskBank();
  else if(p==='student-challenges'){ if(typeof renderStudentChallenges === 'function') renderStudentChallenges(); }
  else if(p==='student-library') renderStudentLibrary();
  else if(p==='student-works') renderStudentWorks();
  else if(p==='student-progress') renderStudentProgress();
  else if(p==='student-settings') renderStudentSettings();
  else if(p==='challenges-admin'){ if(typeof renderChallengesAdmin === 'function') renderChallengesAdmin(); }
  else if(p==='student-payment') renderStudentPayment();
  else if(p==='notif-settings-admin'){ renderNotifSettingsAdmin(); }
  else if(p==='student-notif-settings'){ renderNotifSettingsStudent(); }
  else if(p==='student-schedule') renderStudentSchedule();
  else if(p==='zoom-settings'){ renderZoomSettings(); }
  else if(p==='parent-dashboard') renderParentDashboard();
  else if(p==='parent-settings') renderParentSettings();
  else if(p==='student-lesson') renderLesson('student');
  else if(p==='admin-lesson'){ const _ld=getLessonData(); if(_ld&&!_lessonActive){ _lessonActive=true; _lessonStart=_ld.startedAt||Date.now(); _lessonCode=_ld.code; } renderLesson('admin'); }
}

function getStudents(){ return (load('users')||[]).filter(u=>u.role==='student'); }
function getSelectedStudent(){ return _selectedStudent || (getStudents()[0]||{}).id; }

function buildStudentSelector(containerId, onChange){
  const students=getStudents();
  if(!_selectedStudent && students.length) _selectedStudent=students[0].id;
  const el=document.getElementById(containerId);
  if(!el) return;
  // Store callback on the element to avoid serialization issues
  el._selectorOnChange = onChange;
  el.innerHTML=students.map(s=>`
    <div class="student-chip ${_selectedStudent===s.id?'active':''}" onclick="selectStudent('${s.id}','${containerId}')">
      ${esc(s.name)}
    </div>`).join('');
}
function selectStudent(id, containerId){
  _selectedStudent=id;
  // Сбрасываем кэш кошелька выбранного ученика — чтобы при переключении
  // admin видел свежие данные из Firebase, а не пустой кэш
  if(_walletCache[id] !== undefined) {
    // Уже загружен — принудительно обновляем в фоне
    _fbInit().ref('db/wallet/'+id).get().then(snap=>{
      _walletCache[id] = snap.val() || {balance:0, txns:[]};
    }).catch(()=>{});
  } else {
    // Ещё не загружен — пометим как undefined чтобы renderAtpWallet загрузил
    delete _walletCache[id];
  }
  const el=document.getElementById(containerId);
  const onChange = el ? el._selectorOnChange : null;
  buildStudentSelector(containerId, onChange||function(){});
  if(typeof onChange==='function') onChange();
}

// ─── DASHBOARD ───
function renderDashboard(){
  document.getElementById('wb-title').textContent=`Здравствуйте, ${currentUser.name}! 👋`;
  const students=getStudents();
  const tests=(load('tests')||[]);
  const hw=(load('hw')||[]);
  const grid=document.getElementById('stats-grid');
  grid.innerHTML=`
    <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-num">${students.length}</div><div class="stat-label">Учеников</div></div>
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-num">${tests.length}</div><div class="stat-label">Тестов создано</div></div>
    <div class="stat-card"><div class="stat-icon">✏️</div><div class="stat-num">${hw.length}</div><div class="stat-label">ДЗ назначено</div></div>
  `;
  const notifs=load('notifs')||[];
  const adminNotifs = loadAdminNotifs();
  const allAdminNotifs = [
    ...notifs.map(n=>({...n, _student:true})),
    ...adminNotifs
  ].sort((a,b)=> (b.id||'').localeCompare(a.id||''));
  const nl=document.getElementById('recent-notifs-list');
  nl.innerHTML=allAdminNotifs.slice(0,8).map(n=>{
    const isChat    = n.type==='chat';
    const isComment = n.type==='comment';
    const isSubmit  = n.type==='submit';
    const clickable = isChat||isComment||isSubmit;
    const extraClass= isChat?'notif-chat': isComment?'notif-comment':'';
    return `<div class="hw-item ${extraClass}" style="cursor:${clickable?'pointer':'default'};${extraClass?'border-radius:10px;padding:10px;margin-bottom:4px;':''}"
      onclick="${isChat?`openAdminChatById('${n.studentId}')`: isComment||isSubmit?`openAdminChatById('${n.studentId}')`:'' }">
      <div class="hw-status-dot ${isChat||isComment?'new':isSubmit?'done':'new'}"></div>
      <div style="flex:1"><div class="content-name" style="font-size:0.83rem">${esc(n.text)}</div><div class="content-meta">${n.date||''}</div></div>
      ${clickable?`<span style="font-size:0.72rem;color:var(--green-mid);white-space:nowrap">→ Перейти</span>`:''}
    </div>`;
  }).join('') || '<div class="empty-state"><p>Нет уведомлений</p></div>';
  // mark admin notifs as read after showing
  adminNotifs.forEach(n=>n.read=true);
  _adminNotifsRef().set(_adminNotifsCache).catch(e => console.error('[Firebase] admin_notifs', e));
  updateAdminBadge();
  const slots=load('slots')||[];
  const ul=document.getElementById('upcoming-list');
  ul.innerHTML=slots.filter(s=>s.bookedBy).map(s=>{
    const u=(load('users')||[]).find(u=>u.id===s.bookedBy);
    return `<div class="hw-item"><div class="hw-status-dot done"></div><div><div class="content-name" style="font-size:0.83rem">${esc(s.day)} ${esc(s.time)}</div><div class="content-meta">${u?esc(u.name):esc(s.bookedBy)} · ${esc(String(s.dur))} мин</div></div></div>`;
  }).join('') || '<div class="empty-state"><p>Нет записей</p></div>';
  // Calendar & Todo
  renderCalendar();
  renderTodoList('day');


  // ── Сравнение учеников ──
  const cmpEl = document.getElementById('dashboard-compare');
  if(cmpEl) cmpEl.innerHTML = renderCompareTable();

  // ── Слабые темы по ученикам ──
  const weakEl = document.getElementById('dashboard-weak-topics');
  if(weakEl){
    const activeStudents = getStudents().filter(s=>s.active!==false);
    if(!activeStudents.length){
      weakEl.innerHTML='<div class="empty-state"><p>Нет учеников</p></div>';
    } else {
      weakEl.innerHTML = activeStudents.map(s=>{
        const topics = computeWeakTopics(s.id);
        if(!topics.length) return '';
        return `<div style="margin-bottom:14px">
          <div style="font-weight:700;font-size:0.88rem;color:var(--accent);margin-bottom:6px;display:flex;align-items:center;gap:6px">
            <span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--green-mid));color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;flex-shrink:0">${s.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase()}</span>
            <span>${esc(s.name)}</span>
          </div>
          ${renderWeakTopicsHTML(s.id, true)}
        </div>`;
      }).filter(Boolean).join('') || '<div class="empty-state"><p>Нет данных — назначьте тесты с тегами</p></div>';
    }
  }
}

// ─── STUDENTS ───
function renderStudents(){
  const students=getStudents();
  const courses=load('courses')||[];

  // Индекс платежей: O(n) один раз вместо O(n) на каждого студента
  const payByStudent = new Map();
  (load('payments')||[]).forEach(p => {
    // Перезаписываем — в итоге остаётся последний платёж каждого студента
    payByStudent.set(p.studentId, p);
  });
  const _payBadge = sid => {
    const p = payByStudent.get(sid);
    if (!p) return '<span class="badge badge-red">Нет данных</span>';
    const cls = {paid:'badge-green',unpaid:'badge-red',partial:'badge-gold'}[p.status] || 'badge-red';
    const lbl = {paid:'Оплачено',unpaid:'Не оплачено',partial:'Частично'}[p.status] || p.status;
    return `<span class="badge ${cls}">${lbl}</span>`;
  };

  // Индекс курсов: O(m) один раз
  const courseMap = new Map(courses.map(c => [c.id, c]));

  const tb=document.getElementById('students-table');
  tb.innerHTML=students.map(s=>{
    const enrolled=(s.enrolledCourses||[]).map(id=>courseMap.get(id)).filter(Boolean);
    const coursesBadges = enrolled.length
      ? enrolled.map(c=>`<span class="badge badge-green" style="font-size:0.68rem;margin-right:2px">${c.subject==='Биология'?'🌿':c.subject==='Химия'?'⚗️':'🧬'} ${esc(c.title)}</span>`).join('')
      : s.subject
        ? `<span class="badge badge-blue" style="font-size:0.68rem">${esc(s.subject)}</span>`
        : '<span style="color:var(--text3);font-size:0.8rem">Не назначен</span>';
    return `
    <tr>
      <td>
        <b>${esc(s.name)}</b>
        ${s.grade?`<div style="font-size:0.74rem;color:var(--text3)">${s.grade}</div>`:''}
      </td>
      <td>
        ${s.phone?`<div style="font-size:0.82rem">📞 ${s.phone}</div>`:''}
        ${s.email?`<div style="font-size:0.78rem;color:var(--text3)">${s.email}</div>`:''}
      </td>
      <td style="max-width:180px">
        <div style="display:flex;flex-wrap:wrap;gap:3px">${coursesBadges}</div>
        ${s.format?`<div style="font-size:0.74rem;color:var(--text3);margin-top:2px">${s.format}</div>`:''}
      </td>
      <td>
        <span class="badge ${s.active?'badge-green':'badge-red'}">${s.active?'Активен':'Неактивен'}</span>
        <div style="font-size:0.7rem;margin-top:3px">
          ${s.signedPrivacy&&s.signedRules
            ?`<span style="color:var(--green-mid)">📄 Все документы ✅</span>`
            :s.signedPrivacy||s.signedRules
              ?`<span style="color:#b8860b">📄 Частично ⚠️</span>`
              :`<span style="color:var(--red)">📄 Не подписано ❌</span>`}
        </div>
      </td>
      <td>${_payBadge(s.id)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openStudentProfileModal('${s.id}')">👤 Профиль</button>
        <button class="btn btn-outline btn-sm" onclick="openEditStudent('${s.id}')">✏️ Изменить</button>
        <button class="btn btn-red btn-sm" onclick="deleteStudent('${s.id}')">🗑</button>
        ${s.parentLogin?`<span style="font-size:0.72rem;color:var(--green-mid);display:block;margin-top:4px">👨‍👩‍👧 ${esc(s.parentLogin)}</span>`:`<button class="btn btn-outline btn-sm" style="margin-top:4px;font-size:0.72rem;padding:4px 10px" onclick="openEditStudent('${s.id}')">＋ Родитель</button>`}
      </td>
    </tr>`}).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text3)">Нет учеников</td></tr>`;
  renderGroups();
}
function getPaymentStatusBadge(sid){
  const payments=(load('payments')||[]).filter(p=>p.studentId===sid);
  if(!payments.length) return '<span class="badge badge-red">Нет данных</span>';
  const last=payments[payments.length-1];
  const cls={paid:'badge-green',unpaid:'badge-red',partial:'badge-gold'}[last.status]||'badge-red';
  const lbl={paid:'Оплачено',unpaid:'Не оплачено',partial:'Частично'}[last.status]||last.status;
  return `<span class="badge ${cls}">${lbl}</span>`;
}
async function addStudent(){
  const name=document.getElementById('ns-name').value.trim();
  const login=document.getElementById('ns-login').value.trim();
  const pass=document.getElementById('ns-pass').value;
  if(!name||!login||!pass){ showNotif('Заполните все поля'); return; }
  if(!document.getElementById('ns-oferta').checked){ showNotif('⚠️ Необходимо принять договор оферты'); return; }
  const users=load('users')||[];
  if(users.find(u=>u.login===login)){ showNotif('Логин уже занят'); return; }
  // Валидация логина
  if(!/^[a-zA-Z0-9_]{2,32}$/.test(login)){ showNotif('Логин: только буквы, цифры, _ (2–32 символа)'); return; }
  const passwordHash = await hashPassword(pass);
  // Collect enrolled courses
  const enrolledCourses = [...document.querySelectorAll('#ns-courses-list input[type=checkbox]:checked')].map(cb=>cb.value);
  // Derive subject from enrolled courses for backward compat
  const courses = load('courses')||[];
  const enrolledCourseObjs = enrolledCourses.map(id=>courses.find(c=>c.id===id)).filter(Boolean);
  const subjects = [...new Set(enrolledCourseObjs.map(c=>c.subject))];
  const subject = subjects.length===1 ? subjects[0] : subjects.length>1 ? subjects.join(' + ') : '';
  users.push({
    id:'s_'+Date.now(), login, passwordHash, name, role:'student', subject, enrolledCourses, active:true,
    birth:  document.getElementById('ns-birth').value||'',
    phone:  document.getElementById('ns-phone').value.trim(),
    email:  document.getElementById('ns-email').value.trim(),
    parent: document.getElementById('ns-parent').value.trim(),
    parentPhone: document.getElementById('ns-parent-phone').value.trim(),
    parentEmail: document.getElementById('ns-parent-email').value.trim(),
    grade:  document.getElementById('ns-grade').value.trim(),
    format: document.getElementById('ns-format').value,
    notes:  document.getElementById('ns-notes').value.trim(),
    ofertaSigned: true,
    ofertaDate: new Date().toLocaleDateString('ru'),
  });
  save('users',users);
  closeModal('modal-add-student');
  renderStudents();
  showNotif(`✅ Ученик ${name} добавлен`);
}
function deleteStudent(id){
  requireAdmin('deleteStudent');
  if(!confirm('Удалить ученика?')) return;
  save('users',(load('users')||[]).filter(u=>u.id!==id));
  renderStudents();
  showNotif('🗑 Ученик удалён');
}

// ─── CONTENT ADMIN ───
function renderContentAdmin(){
  buildStudentSelector('content-student-selector', ()=>renderContentAdmin());
  const sid=getSelectedStudent();
  const allContent=load('content')||[];
  const content=allContent.filter(c=>c.studentId===sid && c.type==='theory');
  const library=allContent.filter(c=>c.isLibrary && c.type==='theory');
  const el=document.getElementById('list-theory-accordion');
  if(!el) return;
  let out='';
  if(content.length) out+=content.map(c=>theoryAccordionHTML(c,true)).join('');
  else if(!library.length){ el.innerHTML=emptyHTML(); return; }
  if(library.length) out+=libSection('📚 Библиотека — не отправлено ученику',library.length,library.map(c=>theoryAccordionHTML(c,true)).join(''));
  el.innerHTML=out;
}

function theoryAccordionHTML(c, isAdmin, viewed){
  // c.videoUrl is the canonical field; c.files is the canonical files array
  // (legacyAsTheory already normalises old items before calling us)
  const videoUrl = c.videoUrl || '';
  const files    = c.files || (c.attachmentUrl ? [{type:'pdf', name:'Прикреплённый файл', url:c.attachmentUrl}] : []);

  const hasVideo = !!(videoUrl && getVideoEmbedUrl(videoUrl));
  const hasText  = !!(c.body && c.body.trim()) || !!(c.blocks && c.blocks.length);
  const hasPdf   = files.some(f=>f.type==='pdf');
  const hasWord  = files.some(f=>f.type==='word');

  // Watch progress badge for video content (student only)
  let watchBadge = '';
  if (!isAdmin && hasVideo) {
    const vId = 'vid_' + btoa(videoUrl.substring(0,40)).replace(/[^a-z0-9]/gi,'').substring(0,16);
    const pct = _getVideoProgress(vId);
    if (pct >= 90) watchBadge = '<span class="accordion-badge" style="background:#e8f8f0;color:#27ae60">🎬 Просмотрено</span>';
    else if (pct > 0) watchBadge = `<span class="accordion-badge" style="background:#eff6ff;color:#1565c0">🎬 ${pct}%</span>`;
  }

  const badges   = [
    hasVideo ? '<span class="accordion-badge has-video">🎬 Видео</span>' : '',
    hasText  ? '<span class="accordion-badge has-text">📖 Текст</span>' : '',
    hasPdf   ? '<span class="accordion-badge has-pdf">📄 PDF</span>' : '',
    hasWord  ? '<span class="accordion-badge has-word">📋 Word</span>' : '',
  ].filter(Boolean).join('');

  // Viewed badge (only for student view)
  const viewedBadge = (!isAdmin)
    ? (viewed
        ? '<span class="accordion-badge" style="background:#e8f8f0;color:#27ae60">✅ Просмотрено</span>'
        : '<span class="accordion-badge" style="background:#eff6ff;color:#1565c0">🔵 Новое</span>')
    : '';

  const adminActions = isAdmin ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--green-xpale)">
      <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openAssignStudents('content','${c.id}')">👤 Добавить ученика</button>
      <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openEditAvail('content','${c.id}')" title="Доступность">⏰ Доступность</button>
      <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openEditContent('${c.id}')">✏️ Редактировать</button>
      <button class="btn btn-red btn-sm" onclick="event.stopPropagation();deleteContent('${c.id}')">🗑 Удалить</button>
    </div>` : '';
  const _availBadgeHtml = isAdmin ? availBadge(c) : '';
  const _availLockHtml  = (!isAdmin && availStatus(c)) ? availLockBanner(c) : '';
  // video player — только для legacy (без c.blocks), иначе видео уже внутри nbRenderView
  let videoBlock='';
  if(videoUrl && !(c.blocks && c.blocks.length)){
    const embedUrl=getVideoEmbedUrl(videoUrl);
    if(embedUrl){
      const timestamps = c.videoTimestamps || [];
      const vidId = 'vid_' + btoa(videoUrl.substring(0,40)).replace(/[^a-z0-9]/gi,'').substring(0,16);
      const progressId = 'vp_' + vidId;
      const watchPct = _getVideoProgress(vidId);
      const tsHtml = timestamps.filter(t=>t.time&&t.label).map(t=>{
        const secs = _tsToSeconds(t.time);
        return `<button onclick="videoJumpTo(this,${secs})" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;border:1.5px solid var(--green-pale);background:var(--white);font-family:Nunito,sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--green-deep);transition:background 0.15s" onmouseover="this.style.background='var(--green-xpale)'" onmouseout="this.style.background='var(--white)'">
          <span style="color:var(--chem);font-size:0.75rem;font-family:monospace;font-weight:700">${esc(t.time)}</span>
          <span>${esc(t.label)}</span>
        </button>`;
      }).join('');
      const tsBlock = timestamps.filter(t=>t.time&&t.label).length ? `
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
          <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);align-self:center;margin-right:2px">⏱ Темы:</span>
          ${tsHtml}
        </div>` : '';
      videoBlock=`<div style="margin-bottom:18px" data-video-id="${vidId}">
        <div style="font-weight:700;color:var(--accent);margin-bottom:10px;font-size:0.9rem;display:flex;align-items:center;gap:8px">
          🎬 Видео
          ${watchPct>=90?'<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:10px;background:#e8f8f0;color:#27ae60">✅ Просмотрено</span>':watchPct>0?`<span style="font-size:0.72rem;color:var(--text3)">${watchPct}% просмотрено</span>`:''}
        </div>
        <div style="border-radius:12px;overflow:hidden;background:#000;position:relative;width:100%;height:300px">
          <iframe id="iframe_${vidId}" src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen"></iframe>
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:10px">
          <div style="flex:1;height:6px;background:var(--green-xpale);border-radius:100px;overflow:hidden">
            <div id="${progressId}" style="height:100%;background:linear-gradient(90deg,var(--green-mid),var(--green-light));border-radius:100px;transition:width 0.5s ease;width:${watchPct}%"></div>
          </div>
          <span id="${progressId}_txt" style="font-size:0.72rem;color:var(--text3);white-space:nowrap;min-width:36px;text-align:right">${watchPct}%</span>
        </div>
        ${tsBlock}
      </div>`;
    }
  }
  // text block — render using block-based content (new editor)
  // ── Рендер содержимого: если есть блоки — показываем всё через nbRenderView
  //    (сохраняет порядок: текст, картинки, видео, файлы — как в предпросмотре)
  let textBlock='';
  let imgsBlock='';
  let filesBlock='';

  if(c.blocks && c.blocks.length){
    // Новый редактор: рендерим все блоки через nbRenderView — один общий блок
    textBlock=`<div style="margin-bottom:18px">${nbRenderView(c.blocks)}</div>`;
    // Файлы из блоков типа 'file' уже внутри nbRenderView; legacy files (c.files) не дублируем
  } else {
    // Legacy: текст из c.body
    if(c.body && c.body.trim()){
      textBlock=`<div style="margin-bottom:18px">
        <div style="font-weight:700;color:var(--accent);margin-bottom:8px;font-size:0.9rem">📖 Текст урока</div>
        <div style="line-height:1.8;color:var(--text2);font-size:0.92rem;background:var(--bg);padding:16px;border-radius:10px;border:1px solid var(--green-xpale)">${esc(c.body).replace(/\n/g,'<br>')}</div>
      </div>`;
    }
    // Legacy: картинки из c.images
    if(c.images && c.images.filter(Boolean).length){
      imgsBlock=`<div style="margin-bottom:18px;display:flex;flex-wrap:wrap;gap:10px">`;
      c.images.filter(Boolean).forEach(img=>{
        imgsBlock+=`<img src="${safeUrl(img)}" alt="" style="max-width:100%;border-radius:10px;border:1px solid var(--green-pale);max-height:260px;object-fit:contain">`;
      });
      imgsBlock+=`</div>`;
    }
    // Legacy: файлы из c.files
    if(files.length){
      filesBlock=`<div style="margin-bottom:18px">
        <div style="font-weight:700;color:var(--accent);margin-bottom:8px;font-size:0.9rem">📎 Файлы</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${files.map(f=>`
            <a href="${safeUrl(f.url)}" target="_blank" rel="noopener noreferrer" class="content-item" style="text-decoration:none;color:inherit">
              <div class="content-icon">${f.type==='pdf'?'📄':'📋'}</div>
              <div class="content-info">
                <div class="content-name">${esc(f.name||'Файл')}</div>
                <div class="content-meta">${f.type==='pdf'?'PDF-документ':'Word-документ'}</div>
              </div>
              <div style="color:var(--green-mid);font-size:0.85rem">⬇ Открыть</div>
            </a>`).join('')}
        </div>
      </div>`;
    }
  }

  return `<div class="accordion-item" id="acc-${c.id}" data-content-id="${c.id}">
    ${_availLockHtml}
    <div class="accordion-header" onclick="toggleAccordion(this)">
      <div style="font-size:1.4rem">📖</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.97rem;color:var(--accent);margin-bottom:4px">${esc(c.title)}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${badges||'<span style="font-size:0.75rem;color:var(--text3)">Пустой урок</span>'}${watchBadge?'&nbsp;'+watchBadge:''}${viewedBadge?'&nbsp;'+viewedBadge:''}${_availBadgeHtml?'&nbsp;'+_availBadgeHtml:''}</div>
      </div>
      <div class="accordion-arrow">▼</div>
    </div>
    <div class="accordion-body">
      <div style="padding-top:16px">
        ${videoBlock}${textBlock}${imgsBlock}${filesBlock}
        ${(!videoBlock&&!textBlock&&!imgsBlock&&!filesBlock)?'<div class="empty-state"><p>Содержимое не добавлено</p></div>':''}
        ${adminActions}
      </div>
    </div>
  </div>`;
}

function toggleAccordion(el){
  const item = el.closest ? el.closest('.accordion-item') : el.parentElement;
  if(!item) return;
  const wasOpen = item.classList.contains('open');
  item.classList.toggle('open');
  // Mark material as viewed when opened (student only)
  if(!wasOpen && currentUser && currentUser.role==='student'){
    const cid = item.getAttribute('data-content-id');
    if(cid){
      const key = 'biohim_viewed_'+currentUser.id;
      const viewed = _getViewedCache(currentUser.id);
      if(!viewed[cid]){
        viewed[cid] = true;
        _saveViewed(currentUser.id, viewed);
        // Update badge in place without full re-render
        const badgeEl = item.querySelector('.accordion-header .accordion-badge[style*="1565c0"]');
        if(badgeEl) badgeEl.outerHTML = '<span class="accordion-badge" style="background:#e8f8f0;color:#27ae60">✅ Просмотрено</span>';
      }
    }
    // Initialize YouTube iframe API for video tracking
    setTimeout(()=>{
      item.querySelectorAll('iframe[id^="iframe_"]').forEach(iframe=>{
        const src = iframe.src || '';
        if(src.includes('youtube')||src.includes('youtu')){
          try {
            iframe.contentWindow.postMessage(JSON.stringify({
              event:'listening', id:1
            }),'*');
          } catch(ex){}
        }
        if(src.includes('vimeo')){
          try {
            iframe.contentWindow.postMessage(JSON.stringify({
              method:'addEventListener', value:'timeupdate'
            }),'*');
          } catch(ex){}
        }
      });
    }, 1500);
  }
}
function contentItemHTML(c, isAdmin){
  const icons={video:'🎬',theory:'📖',article:'📝',pdf:'📄',word:'📋'};
  if(!isAdmin && c.type==='video'){
    const embedUrl=getVideoEmbedUrl(c.url||'');
    const playerHtml=embedUrl
      ? `<div style="margin-top:10px;border-radius:10px;overflow:hidden;background:#000;position:relative;width:100%;height:260px"><iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen"></iframe></div>`
      : `<a href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="margin-top:8px">⬇ Открыть</a>`;
    return `<div class="content-item" style="flex-direction:column;align-items:flex-start">
      <div style="display:flex;align-items:center;gap:14px;width:100%">
        <div class="content-icon">${icons[c.type]||'📎'}</div>
        <div class="content-info">
          <div class="content-name">${esc(c.title)}</div>
          <div class="content-meta">${esc(c.desc||"")}</div>
        </div>
      </div>
      ${playerHtml}
    </div>`;
  }
  const actions = isAdmin
    ? `<div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="openEditContent('${c.id}')">✏️</button><button class="btn btn-red btn-sm" onclick="deleteContent('${c.id}')">🗑</button></div>`
    : (c.type==='theory'||c.type==='article'
        ? `<button class="btn btn-outline btn-sm" onclick="viewTheory('${c.id}')">👁 Читать</button>`
        : `<a href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">⬇ Открыть</a>`);
  return `<div class="content-item">
    <div class="content-icon">${icons[c.type]||'📎'}</div>
    <div class="content-info">
      <div class="content-name">${esc(c.title)}</div>
      <div class="content-meta">${esc(c.desc||c.url||'')}</div>
      ${c.images&&c.images.length?`<div class="content-meta">🖼 ${c.images.length} изображ.</div>`:''}
      ${c.attachmentUrl?`<div class="content-meta">📎 Файл прикреплён</div>`:''}
    </div>
    <div class="content-actions">${actions}</div>
  </div>`;
}
function emptyHTML(){ return '<div class="empty-state"><div class="big">📭</div><p>Нет материалов</p></div>'; }

function openModal(id, extra){
  if(id==='modal-add-student'){
    // Reset fields
    ['ns-name','ns-login','ns-pass','ns-phone','ns-email','ns-parent','ns-parent-phone','ns-parent-email','ns-grade','ns-notes'].forEach(f=>{
      const el=document.getElementById(f); if(el) el.value='';
    });
    document.getElementById('ns-birth').value='';
    document.getElementById('ns-format').value='';
    document.getElementById('ns-oferta').checked=false;
    // Populate courses
    const courses = load('courses')||[];
    const el = document.getElementById('ns-courses-list');
    if(el){
      if(!courses.length){
        el.innerHTML='<span style="font-size:0.82rem;color:var(--text3)">Нет курсов — создайте курс в разделе Расписание</span>';
      } else {
        el.innerHTML = courses.map(c=>`
          <label class="chip-label">
            <input type="checkbox" value="${c.id}" onchange="this.closest('label').style.borderColor=this.checked?'var(--green-mid)':'var(--green-pale)'">
            <span>${c.subject==='Биология'?'🌿':c.subject==='Химия'?'⚗️':'🧬'} ${esc(c.title)}</span>
          </label>`).join('');
      }
    }
  }
  if(id==='modal-add-task'){
    if(!extra){ // new task
      document.getElementById('ntask-edit-id').value='';
      document.getElementById('ntask-subject').value='';
      document.getElementById('ntask-text').value='';
      document.getElementById('ntask-imgurl').value='';
      document.getElementById('ntask-answer').value='';
      document.getElementById('ntask-options').value='';
      document.getElementById('ntask-correct-choice').value='';
      document.getElementById('ntask-explanation-choice').value='';
      document.getElementById('ntask-correct-short').value='';
      document.getElementById('ntask-explanation-short').value='';
      document.querySelector('input[name="ntask-type"][value="open"]').checked=true;
      updateTaskTypeUI();
      document.getElementById('ntask-points').value='1';
      document.getElementById('ntask-img-preview').style.display='none';
      document.getElementById('ntask-img-preview').src='';
      document.querySelector('#modal-add-task .modal-title').textContent='🎲 Новое задание';
    }
  }
  if(id==='modal-add-attendance'){
    const today=new Date();
    document.getElementById('att-date').value=today.toISOString().slice(0,10);
    document.getElementById('att-topic').value='';
    document.getElementById('att-group').value='';
    document.getElementById('att-cost').value='';
    document.getElementById('att-slot-id').value='';
    const container=document.getElementById('att-student-checks');
    container.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;overflow:visible;width:100%';
    container.innerHTML=getStudents().map(s=>`
      <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;border:1.5px solid var(--green-pale);background:var(--white);cursor:pointer;font-size:0.82rem;font-weight:600;white-space:nowrap;flex-shrink:0;min-width:0;max-width:100%">
        <input type="checkbox" value="${s.id}" checked style="accent-color:var(--green-deep);flex-shrink:0;width:15px;height:15px"> <span style="white-space:nowrap">${esc(s.name)}</span>
      </label>`).join('');
    setTimeout(prefillAttendanceFromSlot, 50);
  }
  const _openEl = document.getElementById(id);
  if(_openEl){
    if(_openEl.classList.contains('drawer-bg')){
      const _drawer = _openEl.querySelector('.drawer');
      if(_drawer) _drawer.style.transform = ''; // reset for animation
    }
    _openEl.classList.add('open');
  }
  // Populate student checkboxes inside modal if present
  const containerId = {
    'modal-add-theory':'modal-theory-students',
    'modal-create-trial':'modal-trial-students',
    'modal-create-test':'modal-test-students',
    'modal-create-hw':'modal-hw-students'
  }[id];
  if(containerId) populateModalStudents(containerId);
}
function populateModalStudents(containerId){
  const el=document.getElementById(containerId);
  if(!el) return;
  const students=(load('users')||[]).filter(u=>u.role==='student'&&u.active!==false);
  if(!students.length){ el.innerHTML='<span style="font-size:0.82rem;color:var(--text3)">Нет учеников</span>'; return; }
  // Если выбран конкретный ученик — отмечаем его, иначе отмечаем всех
  const cur=_selectedStudent;
  el.innerHTML=students.map(s=>`
    <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;border:1.5px solid var(--green-pale);background:var(--white);cursor:pointer;font-size:0.82rem;font-weight:600;white-space:nowrap;flex-shrink:0">
      <input type="checkbox" value="${s.id}" ${(!cur||s.id===cur)?'checked':''} style="accent-color:var(--green-deep);flex-shrink:0;width:15px;height:15px"><span style="white-space:nowrap">${esc(s.name)}</span>
    </label>`).join('');
}
function getCheckedModalStudents(containerId){
  const el=document.getElementById(containerId);
  if(!el) return [];
  return [...el.querySelectorAll('input[type=checkbox]:checked')].map(cb=>cb.value);
}

/** Открыть любой overlay (modal-bg или drawer-bg) по id */
function openModalEl(id){
  const el = document.getElementById(id);
  if(!el) return;
  if(el.classList.contains('drawer-bg')){
    const drawer = el.querySelector('.drawer');
    if(drawer) drawer.style.transform = '';
  }
  el.classList.add('open');
}
function closeModal(id, force){
  // Редакторы — через guard с подтверждением
  if (_DIRTY_MODALS && _DIRTY_MODALS.includes(id)) {
    _safeClose(id, force);
    return;
  }
  const el=document.getElementById(id);
  if(el){
    // Для drawer-bg — убираем open с анимацией
    if(el.classList.contains('drawer-bg')){
      const drawer = el.querySelector('.drawer');
      if(drawer){
        drawer.style.transform = 'translateX(100%)';
        setTimeout(() => el.classList.remove('open'), 280);
      } else {
        el.classList.remove('open');
      }
    } else {
      el.classList.remove('open');
    }
  }
  if(id==='modal-take-test'){
    _clearTestTimer();
  }
  if(id==='modal-add-theory'){
    _theoryFiles=[];
  }
}
function getVideoEmbedUrl(url){
  if(!url) return null;
  url = url.trim();

  // ── YouTube ──
  let m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if(m) return 'https://www.youtube.com/embed/'+m[1]+'?enablejsapi=1';
  m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if(m) return 'https://www.youtube.com/embed/'+m[1]+'?enablejsapi=1';
  if(url.includes('youtube.com/embed/')) return url.includes('enablejsapi') ? url : url + (url.includes('?') ? '&' : '?') + 'enablejsapi=1';

  // ── Vimeo ──
  m = url.match(/vimeo\.com\/(\d+)/);
  if(m) return 'https://player.vimeo.com/video/'+m[1]+'?api=1';
  if(url.includes('player.vimeo.com/video/')) return url.includes('api=1') ? url : url + (url.includes('?') ? '&' : '?') + 'api=1';

  // ── VK Видео (vk.com/video и vkvideo.ru) ──
  // vk.com/video-123456_789 or vk.com/video123456_789
  m = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if(m) return 'https://vk.com/video_ext.php?oid='+m[1]+'&id='+m[2]+'&hd=2';
  // vkvideo.ru/video-123456_789
  m = url.match(/vkvideo\.ru\/video(-?\d+)_(\d+)/);
  if(m) return 'https://vk.com/video_ext.php?oid='+m[1]+'&id='+m[2]+'&hd=2';
  // already an embed url
  if(url.includes('vk.com/video_ext')) return url;

  // ── Google Drive ──
  // Share link: drive.google.com/file/d/FILE_ID/view
  m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return 'https://drive.google.com/file/d/'+m[1]+'/preview';
  // Open link: drive.google.com/open?id=FILE_ID
  m = url.match(/drive\.google\.com\/open\?(?:.*&)?id=([a-zA-Z0-9_-]+)/);
  if(m) return 'https://drive.google.com/file/d/'+m[1]+'/preview';
  // uc?id= link
  m = url.match(/drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/);
  if(m) return 'https://drive.google.com/file/d/'+m[1]+'/preview';
  // already a preview embed
  if(url.includes('drive.google.com') && url.includes('/preview')) return url;

  return null;
}
// ── New theory block editor state ──
let _nbBlocksNew = [];

function nbAddBlockNew(type){
  if(!_nbBlocksNew.length) _nbBlocksNew = [nbDefaultBlock('p')];
  nbAddBlockToCanvas(type, '_nbBlocksNew', 'nb-canvas-new');
}
function nbAddBlockToCanvas(type, stateVar, canvasId){
  const arr = stateVar==='_nbBlocksNew' ? _nbBlocksNew : _nbBlocks;
  arr.push(nbDefaultBlock(type));
  nbRenderCanvas(arr, stateVar, canvasId);
  setTimeout(()=>{
    const canvas=document.getElementById(canvasId);
    if(!canvas) return;
    const els=canvas.querySelectorAll('[contenteditable]');
    if(els.length) els[els.length-1].focus();
  },20);
}

function nbRenderCanvas(arr, stateVar, canvasId){
  const canvas=document.getElementById(canvasId);
  if(!canvas) return;
  canvas.innerHTML='';
  arr.forEach((blk,idx)=>canvas.appendChild(nbBlockElFor(blk,idx,arr,stateVar,canvasId)));
}

function nbBlockElFor(blk, idx, arr, stateVar, canvasId){
  const wrap=document.createElement('div');
  wrap.className='nb-block';
  wrap.dataset.idx=idx;
  wrap.draggable=true;
  wrap.addEventListener('dragstart',()=>{ _nbDragIdx=idx; wrap.style.opacity='0.4'; });
  wrap.addEventListener('dragend',()=>{ wrap.style.opacity=''; });
  wrap.addEventListener('dragover',e=>{ e.preventDefault(); wrap.style.background='var(--green-xpale)'; });
  wrap.addEventListener('dragleave',()=>{ wrap.style.background=''; });
  wrap.addEventListener('drop',e=>{ e.preventDefault(); wrap.style.background='';
    if(_nbDragIdx===null||_nbDragIdx===idx) return;
    const [b]=arr.splice(_nbDragIdx,1); arr.splice(idx,0,b);
    nbRenderCanvas(arr,stateVar,canvasId); });

  const handle=document.createElement('div');
  handle.className='nb-handle'; handle.textContent='⠿'; handle.title='Перетащить';
  wrap.appendChild(handle);

  const content=document.createElement('div');
  content.className='nb-content';

  if(blk.type==='divider'){
    content.innerHTML='<hr class="nb-divider">';
  } else if(blk.type==='image'){
    content.innerHTML=`<div class="nb-img-block" style="padding:10px">
      ${blk.url?`<img src="${safeUrl(blk.url)}" alt="" style="max-width:100%;border-radius:8px;max-height:300px;object-fit:contain" onerror="this.style.display='none'">` : ''}
      <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на изображение..."
        style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none;margin-top:8px;box-sizing:border-box"
        oninput="${stateVar}[${idx}].url=this.value" onblur="nbRenderCanvas(${stateVar},'${stateVar}','${canvasId}')">
      <div contenteditable="true" class="nb-img-caption" data-ph="Подпись..."
        oninput="${stateVar}[${idx}].caption=this.innerText">${blk.caption||''}</div>
    </div>`;
  } else if(blk.type==='image-upload'){
    content.innerHTML=`<div class="nb-img-block" style="padding:10px">
      ${blk.url?`<img src="${safeUrl(blk.url)}" alt="" style="max-width:100%;border-radius:8px;max-height:300px;object-fit:contain">` : ''}
      <input type="file" accept="image/*" style="font-size:0.83rem;width:100%;margin-top:8px"
        onchange="nbHandleUploadFor(this,${idx},'${stateVar}','${canvasId}')">
      <div contenteditable="true" class="nb-img-caption" data-ph="Подпись..."
        oninput="${stateVar}[${idx}].caption=this.innerText">${blk.caption||''}</div>
    </div>`;
  } else if(blk.type==='video'){
    const embed=blk.url?getVideoEmbedUrl(blk.url):'';
    const tsArr2 = blk.timestamps || [];
    const tsHtml2 = tsArr2.map((ts,ti)=>`
      <div style="display:flex;gap:6px;margin-bottom:4px;align-items:center">
        <input value="${(ts.time||'').replace(/"/g,'&quot;')}" placeholder="0:00" style="width:60px;padding:5px 8px;border-radius:6px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.8rem;background:var(--white);outline:none"
          oninput="${stateVar}[${idx}].timestamps[${ti}].time=this.value">
        <input value="${(ts.label||'').replace(/"/g,'&quot;')}" placeholder="Название темы..." style="flex:1;padding:5px 8px;border-radius:6px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.8rem;background:var(--white);outline:none"
          oninput="${stateVar}[${idx}].timestamps[${ti}].label=this.value">
        <button onclick="${stateVar}[${idx}].timestamps.splice(${ti},1);nbRenderCanvas(${stateVar},'${stateVar}','${canvasId}')" style="width:24px;height:24px;border-radius:6px;border:1px solid var(--green-pale);background:var(--bg);cursor:pointer;font-size:0.8rem;padding:0;color:var(--red)">✕</button>
      </div>`).join('');
    content.innerHTML=`<div style="padding:10px;background:var(--bg);border-radius:10px;border:1.5px dashed var(--green-pale)">
      ${embed?`<div class="nb-video-block"><iframe src="${embed}" allowfullscreen></iframe></div>`:''}
      <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на видео (YouTube, Vimeo, VK, Google Drive)..."
        style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none;margin-top:${embed?'10':'0'}px;box-sizing:border-box"
        oninput="${stateVar}[${idx}].url=this.value" onblur="nbRenderCanvas(${stateVar},'${stateVar}','${canvasId}')">
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--green-xpale)">
        <div style="font-size:0.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:7px">⏱ Временные метки</div>
        <div>${tsHtml2}</div>
        <button onclick="${stateVar}[${idx}].timestamps=${stateVar}[${idx}].timestamps||[];${stateVar}[${idx}].timestamps.push({time:'',label:''});nbRenderCanvas(${stateVar},'${stateVar}','${canvasId}')" style="margin-top:6px;padding:5px 12px;border-radius:7px;border:1.5px solid var(--green-pale);background:var(--bg);font-family:Nunito,sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;color:var(--green-deep)">＋ Добавить метку</button>
      </div>
    </div>`;
  } else if(blk.type==='file'){
    content.innerHTML=`<div style="padding:10px;background:var(--bg);border-radius:10px;border:1.5px dashed var(--green-pale);display:flex;flex-direction:column;gap:6px">
      <input value="${(blk.name||'').replace(/"/g,'&quot;')}" placeholder="Название файла..."
        style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none;box-sizing:border-box"
        oninput="${stateVar}[${idx}].name=this.value">
      <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на файл..."
        style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none;box-sizing:border-box"
        oninput="${stateVar}[${idx}].url=this.value">
      <select style="padding:6px 8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.8rem;background:var(--white)"
        onchange="${stateVar}[${idx}].content=this.value">
        <option value="pdf" ${blk.content==='pdf'?'selected':''}>📄 PDF</option>
        <option value="word" ${blk.content==='word'?'selected':''}>📋 Word</option>
        <option value="link" ${blk.content==='link'?'selected':''}>🔗 Ссылка</option>
      </select>
    </div>`;
  } else {
    const classMap={p:'nb-p',h1:'nb-h1',h2:'nb-h2',h3:'nb-h3',quote:'nb-quote',callout:'nb-callout',code:'nb-code'};
    const phMap={p:'Начните писать...',h1:'Заголовок 1',h2:'Заголовок 2',h3:'Заголовок 3',quote:'Цитата...',callout:'💡 Выноска...',code:'Код...'};
    const el=document.createElement('div');
    el.contentEditable='true';
    el.className=classMap[blk.type]||'nb-p';
    el.dataset.ph=phMap[blk.type]||'';
    el.innerText=blk.content||'';
    el.addEventListener('input',()=>{ arr[idx].content=el.innerText; });
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey&&blk.type!=='code'){
        e.preventDefault();
        arr.splice(idx+1,0,nbDefaultBlock('p'));
        nbRenderCanvas(arr,stateVar,canvasId);
        setTimeout(()=>{
          const c2=document.getElementById(canvasId);
          const ne=c2&&c2.querySelectorAll('[contenteditable]')[idx+1];
          if(ne) ne.focus();
        },10);
      }
      if(e.key==='Backspace'&&el.innerText===''&&arr.length>1){
        e.preventDefault();
        arr.splice(idx,1);
        nbRenderCanvas(arr,stateVar,canvasId);
        setTimeout(()=>{
          const c2=document.getElementById(canvasId);
          const pr=c2&&c2.querySelectorAll('[contenteditable]')[Math.max(0,idx-1)];
          if(pr){pr.focus();const r=document.createRange(),s=window.getSelection();r.selectNodeContents(pr);r.collapse(false);s.removeAllRanges();s.addRange(r);}
        },10);
      }
    });
    content.appendChild(el);
  }
  wrap.appendChild(content);

  const del=document.createElement('button');
  del.className='nb-del-btn'; del.textContent='✕';
  del.onclick=()=>{ arr.splice(idx,1); if(!arr.length) arr.push(nbDefaultBlock('p')); nbRenderCanvas(arr,stateVar,canvasId); };
  wrap.appendChild(del);
  return wrap;
}

function nbHandleUploadFor(input, idx, stateVar, canvasId){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const arr=stateVar==='_nbBlocksNew'?_nbBlocksNew:_nbBlocks;
    arr[idx].url=e.target.result; arr[idx].type='image';
    nbRenderCanvas(arr,stateVar,canvasId);
  };
  reader.readAsDataURL(file);
}

function nbPreviewNew(){
  const body=document.getElementById('nb-preview-body');
  if(body) body.innerHTML=nbRenderView(_nbBlocksNew);
  openModal('modal-nb-preview');
}

// Patch existing nbRender and nbAddBlock to use new generic functions
function nbRender(){ nbRenderCanvas(_nbBlocks,'_nbBlocks','nb-canvas'); }
function nbAddBlock(type){ nbAddBlockToCanvas(type,'_nbBlocks','nb-canvas'); }
function nbHandleImageUpload(input,idx){ nbHandleUploadFor(input,idx,'_nbBlocks','nb-canvas'); }

// Reset new canvas on modal open
function nbResetNew(){
  _nbBlocksNew=[nbDefaultBlock('p')];
  nbRenderCanvas(_nbBlocksNew,'_nbBlocksNew','nb-canvas-new');
}

function addTheory(){
  requireAdmin('addTheory');
  const title=document.getElementById('nth-title').value.trim();
  if(!title){ showNotif('Введите заголовок урока'); return; }
  const openAt=document.getElementById('nth-open-at')?.value||'';
  const closeAt=document.getElementById('nth-close-at')?.value||'';
  const sids=getCheckedModalStudents('modal-theory-students');
  const legacy=nbToLegacy(_nbBlocksNew);
  const content=load('content')||[];
  const newItems=[];
  const base={type:'theory',title,...legacy,attachmentUrl:'',date:new Date().toLocaleDateString('ru'),openAt,closeAt};
  if(sids.length){
    sids.forEach(sid=>{ const item={...base,id:'ct_'+Date.now()+'_'+sid,studentId:sid}; content.push(item); newItems.push(item); });
  } else {
    const item={...base,id:'ct_'+Date.now()+'_lib',studentId:null,isLibrary:true}; content.push(item); newItems.push(item);
  }
  save('content',content);
  newItems.filter(i=>i.studentId).forEach(item=>{ try{srScheduleItem(item.studentId,item.id);}catch{} });
  _nbBlocksNew=[];
  document.getElementById('nth-title').value='';
  ['nth-open-at','nth-close-at'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  closeModal('modal-add-theory');
  if(sids.length) _selectedStudent=sids[0];
  renderContentAdmin();
  showNotif(sids.length?`✅ Урок отправлен ${sids.length>1?sids.length+' ученикам':'1 ученику'}`:' Урок сохранён в библиотеку');
}

// Stubs
function addTheoryImage(){}
function previewTheoryVideo(){}
function addTheoryFile(){}
let _theoryImages=[];
let _theoryFiles=[];

function viewTheory(id){
  const c=(load('content')||[]).find(c=>c.id===id);
  if(!c) return;
  document.getElementById('view-article-title').textContent=c.title;
  const viewBlocks = (c.blocks && c.blocks.length) ? c.blocks : nbFromLegacy(c);
  document.getElementById('view-article-body').innerHTML = nbRenderView(viewBlocks);
  openModal('modal-view-article');
}
function deleteContent(id){
  requireAdmin('deleteContent');
  save('content',(load('content')||[]).filter(c=>c.id!==id));
  renderContentAdmin();
}

// ─── TESTS ADMIN ───
let _tempQuestions=[];
let _testMaxPtsManual = false;
let _testsSelectedSid = 'all';
function renderTestsAdmin(){
  const students = (load('users')||[]).filter(u=>u.role==='student');
  const allTests = (load('tests')||[]).slice().reverse(); // новые сверху

  // Build chip bar
  const chipsEl = document.getElementById('tests-student-chips');
  if(chipsEl){
    chipsEl.innerHTML = [
      `<div class="student-chip ${_testsSelectedSid==='all'?'active':''}" onclick="_testsSelectedSid='all';renderTestsAdmin()">👥 Все ученики</div>`,
      ...students.map(s=>`<div class="student-chip ${_testsSelectedSid===s.id?'active':''}" onclick="_testsSelectedSid='${s.id}';renderTestsAdmin()">${esc(s.name)}</div>`)
    ].join('');
  }

  const el = document.getElementById('tests-admin-list');
  if(!el) return;

  if(_testsSelectedSid === 'all'){
    let html='';
    students.forEach(s=>{
      const stTests = allTests.filter(t=>t.studentId===s.id);
      html+=`<div class="card" style="margin-bottom:14px">
        <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${esc(s.name)}
          <span style="font-weight:400;font-size:0.8rem;color:var(--text3);margin-left:8px">${stTests.length} тестов · ${stTests.filter(t=>t.submitted).length} сдано</span>
        </div>
        ${stTests.length ? stTests.map(t=>testItemHTML(t)).join('') : '<div style="color:var(--text3);font-size:0.83rem;padding:4px 0">Нет тестов</div>'}
      </div>`;
    });
    el.innerHTML = html || emptyHTML();
  } else {
    const tests = allTests.filter(t=>t.studentId===_testsSelectedSid);
    const s = students.find(s=>s.id===_testsSelectedSid);
    el.innerHTML = `<div class="card">
      <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?esc(s.name):'Ученик'}</div>
      ${tests.length ? tests.map(t=>testItemHTML(t)).join('') : emptyHTML()}
    </div>`;
  }

  // Update open answers for selected student (use first student if "all")
  _selectedStudent = _testsSelectedSid === 'all' ? (students[0]||{}).id : _testsSelectedSid;
  renderOpenAnswers();
  renderPendingReviewBanner('test', 'tests-pending-banner');
  // Inject admin comment threads for submitted tests
  (load('tests')||[]).filter(t=>t.submitted).forEach(t=>{
    const el2 = document.getElementById(`adm-cmt-test-${t.id}`);
    if(el2 && !el2.innerHTML.trim()) renderCommentThread('test', t.id, el2);
  });
  // Library
  const _libTests=(load('tests')||[]).filter(t=>t.isLibrary);
  if(_libTests.length){
    const _lEl=document.getElementById('tests-admin-list');
    if(_lEl) _lEl.insertAdjacentHTML('beforeend',libSection('📚 Библиотека — не отправлено',_libTests.length,_libTests.map(t=>testItemHTML(t)).join('')));
  }
}
function testItemHTML(t){
  const pct = t.autoTotal ? Math.round((t.autoScore||0)/t.autoTotal*100) : 0;
  const hasOpen=(t.questions||[]).some(q=>q.type==='open');
  const openUnchecked = t.submitted
    ? (t.questions||[]).filter(q=>q.type==='open' && t.answers && t.answers[q.id] && !q.checked)
    : [];
  const needsReview = t.submitted && !t.openChecked && openUnchecked.length > 0;
  const fullyChecked = t.submitted && (!hasOpen || t.openChecked || openUnchecked.length === 0);
  const statusBadge = !t.submitted
    ? `<span class="badge badge-gold">⏳ Не сдан</span>`
    : fullyChecked
      ? `<span class="badge badge-green">✅ Проверено · ${t.autoScore||0}/${t.autoTotal||0} б.${t.autoTotal?' · '+pct+'%':''}</span>`
      : `<span class="badge" style="background:#fde8e6;color:#c0392b;border-color:#f5c6c1">🔴 На проверке (${openUnchecked.length} отв.)</span>`;
  return `<div class="content-item" style="flex-direction:column;align-items:stretch${needsReview?';border-left:3px solid #ef4444':''}">
    <div style="display:flex;align-items:center;gap:14px">
      <div class="content-icon">📋</div>
      <div class="content-info">
        <div class="content-name">${esc(t.title)}</div>
        <div class="content-meta">📋 ${t.questions.length} вопр. · ⭐ ${t.maxPts||t.autoTotal||0} б. · ${t.date}${t.timeLimit?` · ⏱ ${t.timeLimit} мин`:''}</div>
        <div style="margin-top:4px">${statusBadge}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
        ${needsReview ? `<button class="btn btn-green btn-sm" onclick="openTestReviewPanel('${t.id}')" style="font-weight:700">✅ Проверить</button>` : ''}
        ${t.submitted?`<button class="btn btn-gold btn-sm" onclick="openItemOverallReview('${t.id}','test')" title="Итоговая оценка и отзыв">🎓 Оценка</button>`:''}
        <button class="btn btn-outline btn-sm" onclick="openAssignStudents('test','${t.id}')" title="Отправить ученикам">👤</button>
        <button class="btn btn-outline btn-sm" onclick="openEditAvail('test','${t.id}')" title="Доступность">⏰</button>
        <button class="btn btn-outline btn-sm" onclick="openEditTest('${t.id}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="deleteTest('${t.id}')">🗑</button>
      </div>
    </div>
    ${t.autoGrade?`<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="grade-result-badge grade-${t.autoGrade}">🎓 Оценка: ${t.autoGrade}</span>
      ${t.autoPct!=null?`<span class="badge badge-green">${t.autoScore||0}/${t.autoTotal||0} б. · ${t.autoPct}%</span>`:''}
      ${t.teacherFeedback?`<span style="font-size:0.8rem;color:var(--text2)">💬 ${esc(t.teacherFeedback.substring(0,60))}${t.teacherFeedback.length>60?'…':''}</span>`:''}
    </div>`:''}
    <div style="margin-top:2px">${availBadge(t)}</div>
    ${needsReview ? `<div id="test-review-panel-${t.id}" style="display:none;margin-top:10px;padding:12px;background:var(--bg2);border-radius:10px;border:1px solid #f5c6c1">
      <div style="font-weight:700;font-size:0.85rem;color:var(--accent);margin-bottom:8px">📋 Ответы на открытые вопросы</div>
      ${openUnchecked.map(q=>`
        <div style="background:var(--white);border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid var(--green-xpale)">
          <div style="font-size:0.83rem;font-weight:700;color:var(--accent);margin-bottom:4px">${escHtml(q.text)}</div>
          <div style="font-size:0.85rem;background:var(--bg);border-radius:6px;padding:8px;margin-bottom:8px;color:var(--text2)">${t.answers[q.id]||'—'}</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="number" id="pts-test-${t.id}-${q.id}" min="0" max="${+q.points||1}" step="0.5" value="${q.earnedPts!=null?q.earnedPts:0}"
              style="width:70px;padding:5px 8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;text-align:center;font-size:0.85rem">
            <label style="font-size:0.8rem;color:var(--text3)">/ ${+q.points||1} б.</label>
            <button class="btn btn-green btn-sm" onclick="checkTestOpenAnswerInline('${t.id}','${q.id}')">✅ Зачесть</button>
          </div>
        </div>`).join('')}
      <div style="margin-top:10px;border-top:1px solid var(--green-xpale);padding-top:10px">
        <button class="btn btn-gold btn-sm" onclick="openItemOverallReview('${t.id}','test')">🎓 Поставить итоговую оценку и отзыв</button>
      </div>
    </div>` : ''}
    ${t.submitted ? `<div id="adm-cmt-test-${t.id}" style="margin-top:4px"></div>` : ''}
  </div>`;
}
function renderOpenAnswers(){
  const students = (load('users')||[]).filter(u=>u.role==='student');
  const sids = _testsSelectedSid === 'all' ? students.map(s=>s.id) : [_testsSelectedSid];
  const allTests = load('tests')||[];
  const tests = allTests.filter(t=>sids.includes(t.studentId) && t.submitted);
  const el=document.getElementById('open-answers-list');
  let html='';
  tests.forEach(t=>{
    const openQs=t.questions.filter(q=>q.type==='open' && t.answers && t.answers[q.id] && !q.checked);
    openQs.forEach(q=>{
      html+=`<div class="question-block">
        <div class="question-num">Тест: ${esc(t.title)}</div>
        <div class="question-text">${escHtml(q.text)}</div>
        <div class="feedback-box"><strong>Ответ ученика:</strong> ${t.answers[q.id]||'—'}</div>
        <div class="inline-actions">
          <button class="btn btn-green btn-sm" onclick="checkOpenAnswer('${t.id}','${q.id}')">✅ Проверить</button>
        </div>
      </div>`;
    });
  });
  el.innerHTML=html||'<div class="empty-state"><p>Нет ответов для проверки</p></div>';
}
function checkOpenAnswer(testId,qId){
  const tests=load('tests')||[];
  const t=tests.find(t=>t.id===testId);
  const q=t.questions.find(q=>q.id===qId);
  const body=document.getElementById('check-answer-body');
  body.innerHTML=`
    <div class="form-group"><label>Вопрос</label><div class="feedback-box">${escHtml(q.text)}</div></div>
    <div class="form-group"><label>Ответ ученика</label><div class="feedback-box">${t.answers[q.id]||'—'}</div></div>
    <div class="form-group"><label>Ваш комментарий</label><textarea id="ca-comment" rows="3" placeholder="Обратная связь..."></textarea></div>
    <div class="form-group"><label>Оценка</label>
      <select id="ca-grade"><option value="5">5 — Отлично</option><option value="4">4 — Хорошо</option><option value="3">3 — Удовлетворительно</option><option value="2">2 — Неудовлетворительно</option></select></div>
    <button class="btn btn-green" onclick="submitCheck('${testId}','${qId}','test')">Сохранить проверку</button>
  `;
  openModal('modal-check-answer');
}
function submitCheck(itemId,qId,itemType){
  const comment=document.getElementById('ca-comment').value;
  const grade=document.getElementById('ca-grade').value;
  const pointsEl=document.getElementById('ca-open-pts');
  const openPts=pointsEl?+(pointsEl.value)||0:null;
  const examGradeEl=document.getElementById('ca-exam-grade');
  const examGrade=examGradeEl?examGradeEl.value:'';
  const storeKey=itemType==='test'?'tests':'hw';
  const items=load(storeKey)||[];
  const item=items.find(t=>t.id===itemId);
  const q=item.questions.find(q=>q.id===qId);
  q.checked=true; q.grade=grade; q.comment=comment;
  if(openPts!==null){ q.earnedPts=openPts; }
  if(examGrade!=='') q.examGrade=examGrade;
  const allQ=item.questions||[];
  const allOpenChecked=allQ.filter(q=>q.type==='open').every(q=>q.checked);
  item.openChecked=allOpenChecked;
  // Recalculate overall score/grade if all open questions are now checked
  if(allOpenChecked && item.autoTotal){
    const base=item.autoScoreBase!=null?item.autoScoreBase:(item.autoScore||0);
    const openScore=allQ.filter(q=>q.type==='open'&&q.checked).reduce((s,q)=>s+(+q.earnedPts||0),0);
    const total=base+openScore;
    item.autoScore=total;
    const pct=Math.round(total/item.autoTotal*100);
    item.autoPct=pct;
    // НЕ ставим autoGrade — итоговую оценку преподаватель поставит отдельно
  }
  save(storeKey,items);
  const notifs=load('notifs')||[];
  notifs.push({id:'n'+Date.now(),studentId:item.studentId,text:`📬 Проверен ответ в «${item.title}». Оценка за вопрос: ${grade}`,date:new Date().toLocaleDateString('ru'),read:false});
  save('notifs',notifs);
  closeModal('modal-check-answer');
  renderOpenAnswers(); renderHWOpenAnswers();
  showNotif('✅ Ответ проверен');
}

// ── OVERALL REVIEW for test / hw / trial ──
function openItemOverallReview(itemId, itemType){
  requireAdmin('openItemOverallReview');
  const storeKey=itemType==='test'?'tests':itemType==='hw'?'hw':'trials';
  const items=load(storeKey)||[];
  const item=items.find(t=>t.id===itemId); if(!item) return;
  const pct=item.autoTotal?Math.round((item.autoScore||0)/item.autoTotal*100):0;
  const grade=item.autoGrade||calcGrade(pct,item.gradeConfig)||'';
  const labels={test:'теста',hw:'ДЗ',trial:'пробника'};
  const body=document.getElementById('check-answer-body');
  body.innerHTML=`
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:0.88rem;color:var(--text2)">
      <b>${esc(item.title)}</b><br>
      Автоматически: ${item.autoScore||0}/${item.autoTotal||0} б. (${pct}%)
    </div>
    <div class="form-group">
      <label>Итоговый балл <span style="font-weight:400;color:var(--text3)">(можно скорректировать вручную)</span></label>
      <div style="display:flex;align-items:center;gap:8px">
        <input type="number" id="ca-total-score" value="${item.autoScore||0}" min="0" max="${item.autoTotal||100}"
          style="width:90px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;text-align:center;font-size:1rem">
        <span style="color:var(--text3);font-size:0.88rem">/ ${item.autoTotal||'—'} б.</span>
      </div>
    </div>
    <div class="form-group">
      <label>📝 Отзыв для ученика <span style="font-weight:400;color:var(--text3)">(необязательно)</span></label>
      <textarea id="ca-final-feedback" rows="4" placeholder="Общий комментарий по работе..."
        style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;resize:vertical;outline:none;box-sizing:border-box">${item.teacherFeedback||''}</textarea>
    </div>
    <button class="btn btn-green" onclick="saveItemOverallReview('${itemId}','${itemType}')">💾 Сохранить отзыв</button>
  `;
  document.getElementById('modal-check-answer').querySelector('.modal-title').textContent=`📊 Итоговая оценка ${labels[itemType]||''}`;
  openModal('modal-check-answer');
}
function saveItemOverallReview(itemId, itemType){
  const storeKey=itemType==='test'?'tests':itemType==='hw'?'hw':'trials';
  const items=load(storeKey)||[];
  const item=items.find(t=>t.id===itemId); if(!item) return;
  const score=+(document.getElementById('ca-total-score').value)||0;
  const feedback=document.getElementById('ca-final-feedback').value.trim();
  item.autoScore=score;
  if(item.autoTotal){ item.autoPct=Math.round(score/item.autoTotal*100); }
  const grade=calcGrade(item.autoTotal?Math.round(score/item.autoTotal*100):0,item.gradeConfig)||'';
  item.autoGrade=grade;
  item.finalGrade=grade;   // итоговая оценка — ставится автоматически по %
  item.teacherFeedback=feedback;
  item.openChecked=true;
  save(storeKey,items);
  const navMap={test:'student-tests',hw:'student-hw',trial:'student-trial'};
  const labelMap={test:'Тест',hw:'ДЗ',trial:'Пробник'};
  const pctStr=item.autoTotal?` · ${score}/${item.autoTotal} б. (${item.autoPct}%)`:'';
  const notifs=load('notifs')||[];
  notifs.push({id:'n'+Date.now(),studentId:item.studentId,
    text:`🎓 ${labelMap[itemType]||''} «${item.title}» проверен. Итоговая оценка: ${grade}${pctStr}${feedback?' · Есть отзыв преподавателя':''}`,
    date:new Date().toLocaleDateString('ru'),read:false,nav:navMap[itemType]||''});
  save('notifs',notifs);
  closeModal('modal-check-answer');
  if(itemType==='test'){ if(typeof renderOpenAnswers==='function') renderOpenAnswers(); if(typeof renderTestsAdmin==='function') renderTestsAdmin(); }
  else if(itemType==='hw'){ if(typeof renderHWOpenAnswers==='function') renderHWOpenAnswers(); if(typeof renderHWAdmin==='function') renderHWAdmin(); }
  else if(itemType==='trial'){ if(typeof renderTrialAdmin==='function') renderTrialAdmin(); }
  showNotif(`✅ Оценка ${grade} сохранена`);
}
function addTestQuestion(type){
  const id='q'+Date.now();
  _tempQuestions.push(initQuestion(id,type));
  renderTestBuilder();
}
function renderTestBuilder(){
  const el=document.getElementById('nt-questions-list');
  const totalPts = _tempQuestions.reduce((s,q)=>s+(+q.points||1),0);
  el.innerHTML=_tempQuestions.map((q,i)=>buildQuestionHTML(q,i,'test')).join('');
  const hint = document.getElementById('nt-total-pts');
  if(hint) hint.textContent = 'Итого: '+totalPts+' '+ptWord(totalPts);
  // Sync maxpts field if not manual
  if(!_testMaxPtsManual){
    const maxEl = document.getElementById('nt-maxpts');
    if(maxEl) maxEl.value = totalPts || 0;
  }
}
function ptWord(n){ return n===1?'балл':n<5?'балла':'баллов'; }

// ── MaxPts toggle (Тест — создание) ──
function toggleTestMaxPts(){
  _testMaxPtsManual = !_testMaxPtsManual;
  const input = document.getElementById('nt-maxpts');
  const btn   = document.getElementById('nt-maxpts-btn');
  const hint  = document.getElementById('nt-maxpts-hint');
  if(!input) return;
  if(_testMaxPtsManual){
    input.removeAttribute('readonly');
    input.style.background='var(--white)'; input.style.color='var(--accent)';
    input.focus(); input.select();
    if(btn)  btn.textContent='🔄 Авто';
    if(hint) hint.textContent='(задан вручную)';
  } else {
    input.setAttribute('readonly','');
    input.style.background='var(--bg)'; input.style.color='var(--text3)';
    if(btn)  btn.textContent='✏️ Изменить';
    if(hint) hint.textContent='(считается автоматически из вопросов)';
    renderTestBuilder();
  }
}

// ── MaxPts toggle (ДЗ — создание) ──
function toggleHWMaxPts(){
  _hwMaxPtsManual = !_hwMaxPtsManual;
  const input = document.getElementById('nhw-maxpts');
  const btn   = document.getElementById('nhw-maxpts-btn');
  const hint  = document.getElementById('nhw-maxpts-hint');
  if(!input) return;
  if(_hwMaxPtsManual){
    input.removeAttribute('readonly');
    input.style.background='var(--white)'; input.style.color='var(--accent)';
    input.focus(); input.select();
    if(btn)  btn.textContent='🔄 Авто';
    if(hint) hint.textContent='(задан вручную)';
  } else {
    input.setAttribute('readonly','');
    input.style.background='var(--bg)'; input.style.color='var(--text3)';
    if(btn)  btn.textContent='✏️ Изменить';
    if(hint) hint.textContent='(считается автоматически из вопросов)';
    renderHWBuilder();
  }
}

// ── MaxPts toggle (Тест — редактирование) ──
function toggleEditTestMaxPts(){
  _editTestMaxPtsManual = !_editTestMaxPtsManual;
  const input = document.getElementById('et-maxpts');
  const btn   = document.getElementById('et-maxpts-btn');
  const hint  = document.getElementById('et-maxpts-hint');
  if(!input) return;
  if(_editTestMaxPtsManual){
    input.removeAttribute('readonly');
    input.style.background='var(--white)'; input.style.color='var(--accent)';
    input.focus(); input.select();
    if(btn)  btn.textContent='🔄 Авто';
    if(hint) hint.textContent='(задан вручную)';
  } else {
    input.setAttribute('readonly','');
    input.style.background='var(--bg)'; input.style.color='var(--text3)';
    if(btn)  btn.textContent='✏️ Изменить';
    if(hint) hint.textContent='(считается автоматически из вопросов)';
    renderEditTestBuilder();
  }
}

// ── MaxPts toggle (ДЗ — редактирование) ──
function toggleEditHWMaxPts(){
  _editHWMaxPtsManual = !_editHWMaxPtsManual;
  const input = document.getElementById('ehw-maxpts');
  const btn   = document.getElementById('ehw-maxpts-btn');
  const hint  = document.getElementById('ehw-maxpts-hint');
  if(!input) return;
  if(_editHWMaxPtsManual){
    input.removeAttribute('readonly');
    input.style.background='var(--white)'; input.style.color='var(--accent)';
    input.focus(); input.select();
    if(btn)  btn.textContent='🔄 Авто';
    if(hint) hint.textContent='(задан вручную)';
  } else {
    input.setAttribute('readonly','');
    input.style.background='var(--bg)'; input.style.color='var(--text3)';
    if(btn)  btn.textContent='✏️ Изменить';
    if(hint) hint.textContent='(считается автоматически из вопросов)';
    renderEditHWBuilder();
  }
}

function buildQuestionHTML(q,i,ctx){
  const pfx = ctx==='test'?'_tempQuestions':'_tempHWQuestions';
  const removeFn = ctx==='test'?`removeQ(${i})`:`removeHWQ(${i})`;
  const rebuildFn = ctx==='test'?'renderTestBuilder()':'renderHWBuilder()';
  const imgTabId  = `img-tab-${ctx}-${i}`;
  const imgPreId  = `img-pre-${ctx}-${i}`;
  const imgPreview = q.imageUrl
    ? `<img id="${imgPreId}" class="q-img-preview" src="${safeUrl(q.imageUrl)}" alt="">`
    : `<img id="${imgPreId}" class="q-img-preview" style="display:none" src="" alt="">`;
  const typeLabels={auto:'⚡ Один правильный',multi:'☑️ Несколько правильных',open:'📝 Открытый',fill:'🔤 Вставка слова',match:'🔗 Соответствие',pairs:'🧩 Найти пары',order:'📊 По порядку'};
  const IS = s => (q.type===s);

  // ── type-specific editor ──
  let typeEditor='';
  if(IS('auto')){
    typeEditor=`
      <input class="q-input" placeholder="Варианты через запятую: А,Б,В,Г" value="${(q.options||[]).join(',').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].options=this.value.split(',').map(s=>s.trim())">
      <input class="q-input" placeholder="Правильный ответ (точно как в вариантах)" value="${(q.correct||'').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].correct=this.value">`;
  } else if(IS('multi')){
    typeEditor=`
      <input class="q-input" placeholder="Варианты через запятую: А,Б,В,Г" value="${(q.options||[]).join(',').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].options=this.value.split(',').map(s=>s.trim())">
      <input class="q-input" placeholder="Правильные через запятую: А,В" value="${(q.correct||'').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].correct=this.value">
      <div style="font-size:0.76rem;color:var(--text3)">💡 Укажи все правильные ответы через запятую</div>`;
  } else if(IS('fill')){
    typeEditor=`
      <div style="font-size:0.76rem;color:var(--text3);margin-bottom:4px">💡 Напиши текст с пропуском через <b>___</b>: "Клетка состоит из ___ и ___"</div>
      <input class="q-input" placeholder="Ответы через запятую (по порядку пропусков): цитоплазмы,ядра" value="${(q.correct||'').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].correct=this.value">`;
  } else if(IS('match')){
    typeEditor=`
      <div style="font-size:0.76rem;color:var(--text3);margin-bottom:4px">💡 Левый столбец | Правый столбец — каждая пара на новой строке через <b>|</b></div>
      <textarea class="q-input" rows="4" placeholder="Митохондрия|Синтез АТФ&#10;Рибосома|Синтез белка&#10;Ядро|Хранение ДНК" oninput="${pfx}[${i}].pairs=this.value.split('\\n').map(l=>l.split('|').map(s=>s.trim())).filter(p=>p.length===2&&p[0])">${(q.pairs||[]).map(p=>p.join('|')).join('\n')}</textarea>`;
  } else if(IS('pairs')){
    typeEditor=`
      <div style="font-size:0.76rem;color:var(--text3);margin-bottom:4px">💡 Пары слов — каждая пара на новой строке через <b>|</b></div>
      <textarea class="q-input" rows="4" placeholder="Гликолиз|Цитоплазма&#10;Цикл Кребса|Митохондрия&#10;Фотосинтез|Хлоропласт" oninput="${pfx}[${i}].pairs=this.value.split('\\n').map(l=>l.split('|').map(s=>s.trim())).filter(p=>p.length===2&&p[0])">${(q.pairs||[]).map(p=>p.join('|')).join('\n')}</textarea>`;
  } else if(IS('order')){
    typeEditor=`
      <div style="font-size:0.76rem;color:var(--text3);margin-bottom:4px">💡 Напиши элементы через запятую в правильном порядке</div>
      <input class="q-input" placeholder="Интерфаза,Профаза,Метафаза,Анафаза,Телофаза" value="${(q.correct||'').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].correct=this.value;${pfx}[${i}].options=this.value.split(',').map(s=>s.trim())">`;
  }

  return `<div class="question-block" style="margin-bottom:10px;border-left:3px solid var(--green-mid)" id="qblock-${ctx}-${i}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="question-num">${typeLabels[q.type]||q.type} · #${i+1}</div>
      <button class="btn btn-red btn-sm" onclick="${removeFn}">✕</button>
    </div>
    <div class="q-points-row">
      <span class="q-points-label">⭐ Баллов:</span>
      <input type="number" class="q-points-input" min="0" max="100" value="${q.points||1}" oninput="${pfx}[${i}].points=+this.value||1;${rebuildFn}">
    </div>
    ${!IS('fill')?`<input class="q-input" placeholder="Текст вопроса..." value="${(q.text||'').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].text=this.value">`:'<input class="q-input" placeholder="Текст с пропуском: Клетка состоит из ___ и ___" value="'+((q.text||'').replace(/"/g,'&quot;'))+'" oninput="'+pfx+'['+i+'].text=this.value">'}
    ${typeEditor}
    <div class="q-img-row" style="margin-top:8px">
      <label style="font-size:0.75rem;color:var(--text3)">🖼 Картинка к вопросу (необязательно)</label>
      <div class="q-img-tabs">
        <div class="q-img-tab ${!(q.imageUrl||'').startsWith('data:')?'active':''}" onclick="switchImgTab('${imgTabId}','url')">Ссылка</div>
        <div class="q-img-tab ${(q.imageUrl||'').startsWith('data:')?'active':''}" onclick="switchImgTab('${imgTabId}','file')">Загрузить</div>
      </div>
      <div id="${imgTabId}-url" style="${(q.imageUrl||'').startsWith('data:')?'display:none':''}">
        <input class="q-input" placeholder="https://example.com/image.jpg"
          value="${(q.imageUrl||'').startsWith('data:')?'':q.imageUrl||''}"
          oninput="${pfx}[${i}].imageUrl=this.value;updateQImgPreview('${imgPreId}',this.value)">
      </div>
      <div id="${imgTabId}-file" style="${(q.imageUrl||'').startsWith('data:')?'':'display:none'}">
        <input type="file" accept="image/*" style="width:100%;font-size:0.83rem;padding:6px"
          onchange="handleQImgUpload(this,${i},'${pfx==='_tempQuestions'?'_tempQuestions':'_tempHWQuestions'}','${imgPreId}')">
      </div>
      ${imgPreview}
    </div>
    <div style="margin-top:8px">
      <label style="font-size:0.75rem;color:var(--text3);display:block;margin-bottom:4px">💡 Подсказка для ученика (необязательно)</label>
      <input class="q-input" placeholder="Подсказка появится по кнопке — не раскрывает ответ..." value="${(q.hint||'').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].hint=this.value">
    </div>
    <div style="margin-top:8px">
      <label style="font-size:0.75rem;color:var(--text3);display:block;margin-bottom:4px">🏷 Темы / теги (через запятую)</label>
      <input class="q-input" placeholder="Например: Фотосинтез, ЕГЭ задание 2, Клетка..." value="${(q.tags||'').replace(/"/g,'&quot;')}" oninput="${pfx}[${i}].tags=this.value">
    </div>
  </div>`;
}

function switchImgTab(tabId, tab){
  document.getElementById(tabId+'-url').style.display  = tab==='url'  ? '' : 'none';
  document.getElementById(tabId+'-file').style.display = tab==='file' ? '' : 'none';
  document.querySelectorAll(`[id^="${tabId}"]`).forEach(()=>{});
  // Update tab active state
  const urlTab  = document.querySelector(`[onclick="switchImgTab('${tabId}','url')"]`);
  const fileTab = document.querySelector(`[onclick="switchImgTab('${tabId}','file')"]`);
  if(urlTab)  urlTab.className  = 'q-img-tab' + (tab==='url' ?' active':'');
  if(fileTab) fileTab.className = 'q-img-tab' + (tab==='file'?' active':'');
}

function updateQImgPreview(previewId, url){
  const el = document.getElementById(previewId);
  if(!el) return;
  if(url){ el.src=url; el.style.display='block'; }
  else   { el.style.display='none'; }
}

function handleQImgUpload(input, idx, arr, previewId){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const dataUrl = e.target.result;
    // Безопасный доступ вместо eval
    if(arr==="_tempQuestions") _tempQuestions[idx].imageUrl=dataUrl;
    else if(arr==="_tempHWQuestions") _tempHWQuestions[idx].imageUrl=dataUrl;
    updateQImgPreview(previewId, dataUrl);
  };
  reader.readAsDataURL(file);
}

function removeQ(i){ _tempQuestions.splice(i,1); renderTestBuilder(); }
function saveTest(){
  requireAdmin('saveTest');
  const title=document.getElementById('nt-title').value.trim();
  if(!title){ showNotif('Введите название теста'); return; }
  if(!_tempQuestions.length){ showNotif('Добавьте хотя бы один вопрос'); return; }
  const openAt=document.getElementById('nt-open-at')?.value||'';
  const closeAt=document.getElementById('nt-close-at')?.value||'';
  const sids=getCheckedModalStudents('modal-test-students');
  const gradeConfig={5:+(document.getElementById('nt-g5').value)||90,4:+(document.getElementById('nt-g4').value)||75,3:+(document.getElementById('nt-g3').value)||55,2:0};
  const maxAttempts=+(document.getElementById('nt-max-attempts')?.value)||0;
  const gradeMode=document.getElementById('nt-grade-mode')?.value||'best';
  const timeLimit=+(document.getElementById('nt-time-limit')?.value)||0;
  const autoTotal=_tempQuestions.filter(q=>q.type==='auto').reduce((s,q)=>s+(+q.points||1),0);
  const allTotal=_tempQuestions.reduce((s,q)=>s+(+q.points||1),0);
  const maxPtsInput = +(document.getElementById('nt-maxpts')?.value)||0;
  const maxPts = _testMaxPtsManual && maxPtsInput > 0 ? maxPtsInput : allTotal || autoTotal;
  const tests=load('tests')||[];
  if(sids.length){
    sids.forEach(sid=>tests.push({id:'t'+Date.now()+'_'+sid,studentId:sid,title,questions:[..._tempQuestions],date:new Date().toLocaleDateString('ru'),submitted:false,answers:{},autoScore:0,autoTotal:maxPts,maxPts,gradeConfig,openAt,closeAt,maxAttempts,gradeMode,timeLimit,attempts:[]}));
  } else {
    tests.push({id:'t'+Date.now()+'_lib',studentId:null,title,questions:[..._tempQuestions],date:new Date().toLocaleDateString('ru'),submitted:false,answers:{},autoScore:0,autoTotal:maxPts,maxPts,gradeConfig,isLibrary:true,openAt,closeAt,maxAttempts,gradeMode,timeLimit,attempts:[]});
  }
  save('tests',tests);
  if(sids.length) sids.forEach(sid=>addNotif(sid,{type:'test',text:`📝 Новый тест: ${title}`,nav:'student-tests'}));
  _tempQuestions=[];
  _testMaxPtsManual=false;
  ['nt-questions-list'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
  ['nt-title','nt-open-at','nt-close-at'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const ntMaxPts=document.getElementById('nt-maxpts'); if(ntMaxPts){ ntMaxPts.value='0'; ntMaxPts.setAttribute('readonly',''); ntMaxPts.style.background='var(--bg)'; ntMaxPts.style.color='var(--text3)'; }
  const ntMaxPtsBtn=document.getElementById('nt-maxpts-btn'); if(ntMaxPtsBtn) ntMaxPtsBtn.textContent='✏️ Изменить';
  const ntMaxPtsHint=document.getElementById('nt-maxpts-hint'); if(ntMaxPtsHint) ntMaxPtsHint.textContent='(считается автоматически из вопросов)';
  const ntMaxAttempts=document.getElementById('nt-max-attempts'); if(ntMaxAttempts) ntMaxAttempts.value='0';
  const ntGradeMode=document.getElementById('nt-grade-mode'); if(ntGradeMode) ntGradeMode.value='best';
  const hint=document.getElementById('nt-total-pts'); if(hint) hint.textContent='';
  closeModal('modal-create-test');
  if(sids.length) _selectedStudent=sids[0];
  renderTestsAdmin();
  showNotif(sids.length?`✅ Тест отправлен ${sids.length>1?sids.length+' ученикам':'1 ученику'}`:' Тест сохранён в библиотеку');
}
function deleteTest(id){ requireAdmin('deleteTest'); save('tests',(load('tests')||[]).filter(t=>t.id!==id)); renderTestsAdmin(); }

// ─── ASSIGN STUDENTS TO EXISTING ITEM ───
let _assignType=null, _assignId=null;
function openAssignStudents(type, id){
  requireAdmin('openAssignStudents');
  _assignType=type; _assignId=id;
  const students=(load('users')||[]).filter(u=>u.role==='student');
  // Find which students already have this item
  let existingStudentIds=[];
  if(type==='content'){
    const item=(load('content')||[]).find(c=>c.id===id);
    if(item) existingStudentIds=[item.studentId];
  } else if(type==='test'){
    const item=(load('tests')||[]).find(t=>t.id===id);
    if(item) existingStudentIds=[item.studentId];
  } else if(type==='hw'){
    const item=(load('hw')||[]).find(h=>h.id===id);
    if(item) existingStudentIds=[item.studentId];
  } else if(type==='trial'){
    const sent=(load('trials')||[]).filter(t=>!t.isLibrary);
    const orig=(load('trials')||[]).find(t=>t.id===id);
    if(orig) existingStudentIds=sent.filter(t=>t.title===orig.title && t.studentId).map(t=>t.studentId);
  }
  const el=document.getElementById('assign-students-list');
  el.innerHTML=students.map(s=>`
    <label class="chip-label" style="border-color:${existingStudentIds.includes(s.id)?'var(--green-mid)':'var(--green-pale)'};background:${existingStudentIds.includes(s.id)?'var(--green-xpale)':'var(--white)'}">
      <input type="checkbox" value="${s.id}" style="accent-color:var(--green-deep);width:14px;height:14px;flex-shrink:0"
        ${existingStudentIds.includes(s.id)?'disabled checked':''}>
      <span style="overflow:hidden;text-overflow:ellipsis">${esc(s.name)}${existingStudentIds.includes(s.id)?'<span style="font-size:0.7rem;color:var(--green-mid)"> ✓</span>':''}</span>
    </label>`).join('');
  openModal('modal-assign-students');
}
function confirmAssignStudents(){
  const checked=[...document.querySelectorAll('#assign-students-list input[type=checkbox]:checked:not(:disabled)')].map(cb=>cb.value);
  if(!checked.length){ showNotif('Выберите хотя бы одного ученика'); return; }
  if(_assignType==='content'){
    const content=load('content')||[];
    const original=content.find(c=>c.id===_assignId);
    if(!original){ showNotif('Материал не найден'); return; }
    checked.forEach(sid=>{
      // Don't duplicate
      if(content.some(c=>c.title===original.title && c.studentId===sid && c.type===original.type)) return;
      content.push({...original, id:'ct_'+Date.now()+'_'+sid, studentId:sid, isLibrary:false});
    });
    save('content',content);
    renderContentAdmin();
  } else if(_assignType==='test'){
    const tests=load('tests')||[];
    const original=tests.find(t=>t.id===_assignId);
    if(!original){ showNotif('Тест не найден'); return; }
    checked.forEach(sid=>{
      if(tests.some(t=>t.title===original.title && t.studentId===sid)) return;
      tests.push({...original, id:'t'+Date.now()+'_'+sid, studentId:sid, isLibrary:false, submitted:false, answers:{}, autoScore:0});
    });
    save('tests',tests);
    renderTestsAdmin();
  } else if(_assignType==='hw'){
    const hws=load('hw')||[];
    const original=hws.find(h=>h.id===_assignId);
    if(!original){ showNotif('ДЗ не найдено'); return; }
    checked.forEach(sid=>{
      if(hws.some(h=>h.title===original.title && h.studentId===sid)) return;
      hws.push({...original, id:'hw'+Date.now()+'_'+sid, studentId:sid, isLibrary:false, submitted:false, answers:{}});
    });
    save('hw',hws);
    renderHWAdmin();
  } else if(_assignType==='trial'){
    const trials=load('trials')||[];
    const original=trials.find(t=>t.id===_assignId);
    if(!original){ showNotif('Пробник не найден'); return; }
    checked.forEach(sid=>{
      if(trials.some(t=>t.title===original.title && t.studentId===sid)) return;
      const newSections=JSON.parse(JSON.stringify(original.sections||[]));
      newSections.forEach(s=>(s.questions||[]).forEach(q=>{ q.checked=false; delete q.earnedPts; delete q.grade; }));
      trials.push({...original, id:'tr_'+Date.now()+'_'+sid, studentId:sid, isLibrary:false,
        submitted:false, answers:{}, autoScore:0, openChecked:false, sections:newSections});
      addNotif(sid,{type:'trial',text:`🧪 Новый пробник: ${original.title}`,nav:'student-trial'});
    });
    save('trials',trials);
    renderTrialAdmin();
  }
  closeModal('modal-assign-students');
  showNotif(`✅ Отправлено ${checked.length} ученикам`);
}

// ─── PENDING REVIEW BANNER ───
function renderPendingReviewBanner(type, containerId){
  const el = document.getElementById(containerId);
  if(!el) return;
  let items = [];
  if(type==='hw'){
    items = (load('hw')||[]).filter(h=>h.studentId && h.submitted && !h.openChecked &&
      (h.questions||[]).some(q=>q.type==='open' && h.answers && h.answers[q.id] && !q.checked));
  } else if(type==='test'){
    items = (load('tests')||[]).filter(t=>t.studentId && t.submitted && !t.openChecked &&
      (t.questions||[]).some(q=>q.type==='open' && t.answers && t.answers[q.id] && !q.checked));
  } else if(type==='trial'){
    items = (load('trials')||[]).filter(t=>t.studentId && t.submitted && !t.openChecked &&
      (t.sections||[]).flatMap(s=>s.questions).some(q=>q.type==='open' && t.answers && t.answers[q.id] && !q.checked));
  }
  const users = load('users')||[];
  if(!items.length){ el.innerHTML=''; el.style.display='none'; return; }
  el.style.display='block';
  const typeLabel = {hw:'ДЗ',test:'тест',trial:'пробник'};
  el.innerHTML=`<div style="background:linear-gradient(135deg,#fde8e6,#fff5f5);border:1.5px solid #f5c6c1;border-radius:14px;padding:16px 20px;margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div style="font-size:1.4rem">🔴</div>
      <div style="font-weight:700;font-size:0.95rem;color:#c0392b">На проверке: ${items.length} ${typeLabel[type]||'работ'}</div>
    </div>
    ${items.map(item=>{
      const u = users.find(u=>u.id===item.studentId);
      const uname = u ? u.name : '—';
      const allQ = type==='trial' ? (item.sections||[]).flatMap(s=>s.questions) : (item.questions||[]);
      const openCount = allQ.filter(q=>q.type==='open' && item.answers && item.answers[q.id] && !q.checked).length;
      const panelId = `${type}-review-panel-${item.id}`;
      return `<div style="background:var(--white);border-radius:10px;padding:10px 14px;margin-bottom:8px;border:1px solid #f5c6c1;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="font-size:1rem">✏️</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.9rem;color:var(--accent)">${esc(item.title)}</div>
          <div style="font-size:0.78rem;color:var(--text3)">👤 ${uname} · ${openCount} открытых ответа</div>
        </div>
        <button class="btn btn-green btn-sm" onclick="toggleReviewPanelFromBanner('${type}','${item.id}')" style="font-weight:700;white-space:nowrap">✅ Проверить</button>
      </div>`;
    }).join('')}
  </div>`;
}

function toggleReviewPanelFromBanner(type, itemId){
  // Scroll to item and open its review panel
  const panelId = `${type}-review-panel-${itemId}`;
  let panel = document.getElementById(panelId);
  if(!panel){
    // Item might be in collapsed view - find and open it
    if(type==='hw') { renderHWAdmin(); }
    else if(type==='test') { renderTestsAdmin(); }
    else if(type==='trial') { renderTrialAdmin(); }
    panel = document.getElementById(panelId);
  }
  if(panel){
    panel.style.display='block';
    setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'center'}),100);
  }
}

// ─── HW ADMIN ───
let _tempHWQuestions=[];
let _hwMaxPtsManual = false;
let _hwSelectedSid = 'all';
function renderHWAdmin(){
  const students = (load('users')||[]).filter(u=>u.role==='student');
  const allHWs = (load('hw')||[]).slice().reverse(); // новые сверху

  // Build chip bar
  const chipsEl = document.getElementById('hw-student-chips');
  if(chipsEl){
    chipsEl.innerHTML = [
      `<div class="student-chip ${_hwSelectedSid==='all'?'active':''}" onclick="_hwSelectedSid='all';renderHWAdmin()">👥 Все ученики</div>`,
      ...students.map(s=>`<div class="student-chip ${_hwSelectedSid===s.id?'active':''}" onclick="_hwSelectedSid='${s.id}';renderHWAdmin()">${esc(s.name)}</div>`)
    ].join('');
  }

  const el = document.getElementById('hw-admin-list');
  if(!el) return;

  if(_hwSelectedSid === 'all'){
    let html='';
    students.forEach(s=>{
      const stHWs = allHWs.filter(h=>h.studentId===s.id);
      html+=`<div class="card" style="margin-bottom:14px">
        <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${esc(s.name)}
          <span style="font-weight:400;font-size:0.8rem;color:var(--text3);margin-left:8px">${stHWs.length} ДЗ · ${stHWs.filter(h=>h.submitted).length} сдано</span>
        </div>
        ${stHWs.length ? stHWs.map(h=>hwItemHTML(h)).join('') : '<div style="color:var(--text3);font-size:0.83rem;padding:4px 0">Нет ДЗ</div>'}
      </div>`;
    });
    el.innerHTML = html || emptyHTML();
  } else {
    const hws = allHWs.filter(h=>h.studentId===_hwSelectedSid);
    const s = students.find(s=>s.id===_hwSelectedSid);
    el.innerHTML = `<div class="card">
      <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?esc(s.name):'Ученик'}</div>
      ${hws.length ? hws.map(h=>hwItemHTML(h)).join('') : emptyHTML()}
    </div>`;
  }

  _selectedStudent = _hwSelectedSid === 'all' ? (students[0]||{}).id : _hwSelectedSid;
  renderHWOpenAnswers();
  renderPendingReviewBanner('hw', 'hw-pending-banner');
  // Inject admin comment threads for submitted HW
  (load('hw')||[]).filter(h=>h.submitted).forEach(h=>{
    const el2 = document.getElementById(`adm-cmt-hw-${h.id}`);
    if(el2 && !el2.innerHTML.trim()) renderCommentThread('hw', h.id, el2);
  });
  // Library
  const _libHWs=(load('hw')||[]).filter(h=>h.isLibrary);
  if(_libHWs.length){
    const _lEl=document.getElementById('hw-admin-list');
    if(_lEl) _lEl.insertAdjacentHTML('beforeend',libSection('📚 Библиотека — не отправлено',_libHWs.length,_libHWs.map(h=>hwItemHTML(h)).join('')));
  }
}
function hwItemHTML(h){
  const pct = h.autoTotal ? Math.round((h.autoScore||0)/h.autoTotal*100) : 0;
  const hasOpen=(h.questions||[]).some(q=>q.type==='open');
  const openUnchecked = h.submitted
    ? (h.questions||[]).filter(q=>q.type==='open' && h.answers && h.answers[q.id] && !q.checked)
    : [];
  const needsReview = h.submitted && !h.openChecked && openUnchecked.length > 0;
  const fullyChecked = h.submitted && (!hasOpen || h.openChecked || openUnchecked.length === 0);
  const statusBadge = !h.submitted
    ? `<span class="badge badge-gold">⏳ Ожидается</span>`
    : fullyChecked
      ? `<span class="badge badge-green">✅ Проверено · ${h.autoScore||0}/${h.autoTotal||0} б.${h.autoTotal?' · '+pct+'%':''}</span>`
      : `<span class="badge" style="background:#fde8e6;color:#c0392b;border-color:#f5c6c1">🔴 На проверке (${openUnchecked.length} отв.)</span>`;
  return `<div class="content-item" style="flex-direction:column;align-items:stretch${needsReview?';border-left:3px solid #ef4444':''}">
    <div style="display:flex;align-items:center;gap:14px">
      <div class="content-icon">✏️</div>
      <div class="content-info">
        <div class="content-name">${esc(h.title)}</div>
        <div class="content-meta">✏️ ${h.questions.length} вопр. · ⭐ ${h.maxPts||h.autoTotal||0} б. · ${h.date}${h.due?` · 📅 ${h.due}`:''}</div>
        <div style="margin-top:4px">${statusBadge}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
        ${needsReview ? `<button class="btn btn-green btn-sm" onclick="openHWReviewPanel('${h.id}')" style="font-weight:700">✅ Проверить</button>` : ''}
        ${h.submitted?`<button class="btn btn-gold btn-sm" onclick="openItemOverallReview('${h.id}','hw')" title="Итоговая оценка и отзыв">🎓 Оценка</button>`:''}
        <button class="btn btn-outline btn-sm" onclick="openAssignStudents('hw','${h.id}')" title="Отправить ученикам">👤</button>
        <button class="btn btn-outline btn-sm" onclick="openEditAvail('hw','${h.id}')" title="Доступность">⏰</button>
        <button class="btn btn-outline btn-sm" onclick="openEditHW('${h.id}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="deleteHW('${h.id}')">🗑</button>
      </div>
    </div>
    ${h.autoGrade?`<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="grade-result-badge grade-${h.autoGrade}">🎓 Оценка: ${h.autoGrade}</span>
      ${h.autoPct!=null?`<span class="badge badge-green">${h.autoScore||0}/${h.autoTotal||0} б. · ${h.autoPct}%</span>`:''}
      ${h.teacherFeedback?`<span style="font-size:0.8rem;color:var(--text2)">💬 ${esc(h.teacherFeedback.substring(0,60))}${h.teacherFeedback.length>60?'…':''}</span>`:''}
    </div>`:''}
    <div style="margin-top:2px">${availBadge(h)}</div>
    ${needsReview ? `<div id="hw-review-panel-${h.id}" style="display:none;margin-top:10px;padding:12px;background:var(--bg2);border-radius:10px;border:1px solid #f5c6c1">
      <div style="font-weight:700;font-size:0.85rem;color:var(--accent);margin-bottom:8px">📋 Ответы на открытые вопросы</div>
      ${openUnchecked.map(q=>`
        <div style="background:var(--white);border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid var(--green-xpale)">
          <div style="font-size:0.83rem;font-weight:700;color:var(--accent);margin-bottom:4px">${escHtml(q.text)}</div>
          <div style="font-size:0.85rem;background:var(--bg);border-radius:6px;padding:8px;margin-bottom:8px;color:var(--text2)">${h.answers[q.id]||'—'}</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="number" id="pts-hw-${h.id}-${q.id}" min="0" max="${+q.points||1}" step="0.5" value="${q.earnedPts!=null?q.earnedPts:0}"
              style="width:70px;padding:5px 8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;text-align:center;font-size:0.85rem">
            <label style="font-size:0.8rem;color:var(--text3)">/ ${+q.points||1} б.</label>
            <button class="btn btn-green btn-sm" onclick="checkHWOpenAnswerInline('${h.id}','${q.id}')">✅ Зачесть</button>
          </div>
        </div>`).join('')}
      <div style="margin-top:10px;border-top:1px solid var(--green-xpale);padding-top:10px">
        <button class="btn btn-gold btn-sm" onclick="openItemOverallReview('${h.id}','hw')">🎓 Поставить итоговую оценку и отзыв</button>
      </div>
    </div>` : ''}
    ${h.submitted ? `<div id="adm-cmt-hw-${h.id}" style="margin-top:4px"></div>` : ''}
  </div>`;
}

function openHWReviewPanel(hwId){
  const panel = document.getElementById(`hw-review-panel-${hwId}`);
  if(panel) panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}
function openTestReviewPanel(testId){
  const panel = document.getElementById(`test-review-panel-${testId}`);
  if(panel) panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}
function openTrialReviewPanel(trialId){
  const panel = document.getElementById(`trial-review-panel-${trialId}`);
  if(panel) panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}
function renderHWOpenAnswers(){
  const students = (load('users')||[]).filter(u=>u.role==='student');
  const sids = _hwSelectedSid === 'all' ? students.map(s=>s.id) : [_hwSelectedSid];
  const hws=(load('hw')||[]).filter(h=>sids.includes(h.studentId) && h.submitted);
  const el=document.getElementById('hw-open-answers-list');
  let html='';
  hws.forEach(h=>{
    (h.questions||[]).filter(q=>q.type==='open' && h.answers && h.answers[q.id] && !q.checked).forEach(q=>{
      html+=`<div class="question-block">
        <div class="question-num">ДЗ: ${esc(h.title)}</div>
        <div class="question-text">${escHtml(q.text)}</div>
        <div class="feedback-box"><strong>Ответ:</strong> ${h.answers[q.id]||'—'}</div>
        <button class="btn btn-green btn-sm" style="margin-top:8px" onclick="checkHWOpenAnswer('${h.id}','${q.id}')">✅ Проверить</button>
      </div>`;
    });
  });
  el.innerHTML=html||'<div class="empty-state"><p>Нет ответов для проверки</p></div>';
}
function checkHWOpenAnswer(hwId,qId){
  const hws=load('hw')||[];
  const h=hws.find(h=>h.id===hwId);
  const q=h.questions.find(q=>q.id===qId);
  const body=document.getElementById('check-answer-body');
  body.innerHTML=`
    <div class="form-group"><label>Вопрос</label><div class="feedback-box">${escHtml(q.text)}</div></div>
    <div class="form-group"><label>Ответ ученика</label><div class="feedback-box">${h.answers[q.id]||'—'}</div></div>
    <div class="form-group"><label>Ваш комментарий</label><textarea id="ca-comment" rows="3" placeholder="Обратная связь..."></textarea></div>
    <div class="form-group"><label>Оценка (5-балльная)</label>
      <select id="ca-grade"><option value="5">5 — Отлично</option><option value="4">4 — Хорошо</option><option value="3">3 — Удовлетворительно</option><option value="2">2 — Неудовлетворительно</option></select></div>
    <div class="form-group"><label>Экзаменационная оценка (0–3 балла)</label>
      <select id="ca-exam-grade">
        <option value="">— не указывать —</option>
        <option value="0">0 — Не выполнено</option>
        <option value="1">1 — Частично (слабо)</option>
        <option value="2">2 — Частично (хорошо)</option>
        <option value="3">3 — Полностью верно</option>
      </select></div>
    <button class="btn btn-green" onclick="submitCheck('${hwId}','${qId}','hw')">Сохранить</button>
  `;
  openModal('modal-check-answer');
}
function addHWQuestion(type){
  const id='q'+Date.now();
  _tempHWQuestions.push(initQuestion(id,type));
  renderHWBuilder();
}
function renderHWBuilder(){
  const el=document.getElementById('nhw-questions-list');
  const totalPts = _tempHWQuestions.reduce((s,q)=>s+(+q.points||1),0);
  el.innerHTML=_tempHWQuestions.map((q,i)=>buildQuestionHTML(q,i,'hw')).join('');
  const hint = document.getElementById('nhw-total-pts');
  if(hint) hint.textContent = totalPts ? 'Итого: '+totalPts+' '+ptWord(totalPts) : '';
  // Sync maxpts field if not manual
  if(!_hwMaxPtsManual){
    const maxEl = document.getElementById('nhw-maxpts');
    if(maxEl) maxEl.value = totalPts || 0;
  }
}
function removeHWQ(i){ _tempHWQuestions.splice(i,1); renderHWBuilder(); }
function saveHW(){
  requireAdmin('saveHW');
  const title=document.getElementById('nhw-title').value.trim();
  const desc=document.getElementById('nhw-desc').value.trim();
  const due=document.getElementById('nhw-due').value;
  const fileUrl=document.getElementById('nhw-fileurl').value.trim();
  if(!title){ showNotif('Введите тему ДЗ'); return; }
  const openAt=document.getElementById('nhw-open-at')?.value||'';
  const closeAt=document.getElementById('nhw-close-at')?.value||'';
  const maxAttempts=+(document.getElementById('nhw-max-attempts')?.value)||0;
  const gradeMode=document.getElementById('nhw-grade-mode')?.value||'best';
  const sids=getCheckedModalStudents('modal-hw-students');
  const hws=load('hw')||[];
  const hwAutoTotal=_tempHWQuestions.filter(q=>q.type==='auto').reduce((s,q)=>s+(+q.points||1),0);
  const hwAllTotal=_tempHWQuestions.reduce((s,q)=>s+(+q.points||1),0);
  const hwMaxPtsInput=+(document.getElementById('nhw-maxpts')?.value)||0;
  const hwMaxPts = _hwMaxPtsManual && hwMaxPtsInput > 0 ? hwMaxPtsInput : hwAllTotal || hwAutoTotal;
  if(sids.length){
    sids.forEach(sid=>hws.push({id:'hw'+Date.now()+'_'+sid,studentId:sid,title,desc,due,fileUrl,questions:[..._tempHWQuestions],submitted:false,answers:{},autoScore:0,autoTotal:hwMaxPts,maxPts:hwMaxPts,date:new Date().toLocaleDateString('ru'),openAt,closeAt,maxAttempts,gradeMode,attempts:[]}));
  } else {
    hws.push({id:'hw'+Date.now()+'_lib',studentId:null,title,desc,due,fileUrl,questions:[..._tempHWQuestions],submitted:false,answers:{},autoScore:0,autoTotal:hwMaxPts,maxPts:hwMaxPts,date:new Date().toLocaleDateString('ru'),isLibrary:true,openAt,closeAt,maxAttempts,gradeMode,attempts:[]});
  }
  save('hw',hws);
  if(sids.length) sids.forEach(sid=>addNotif(sid,{type:'hw',text:`✏️ Новое домашнее задание: ${title}`,nav:'student-hw'}));
  _tempHWQuestions=[];
  _hwMaxPtsManual=false;
  ['nhw-questions-list'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
  ['nhw-title','nhw-desc','nhw-fileurl','nhw-open-at','nhw-close-at'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const nhwMaxPts=document.getElementById('nhw-maxpts'); if(nhwMaxPts){ nhwMaxPts.value='0'; nhwMaxPts.setAttribute('readonly',''); nhwMaxPts.style.background='var(--bg)'; nhwMaxPts.style.color='var(--text3)'; }
  const nhwMaxPtsBtn=document.getElementById('nhw-maxpts-btn'); if(nhwMaxPtsBtn) nhwMaxPtsBtn.textContent='✏️ Изменить';
  const nhwMaxPtsHint=document.getElementById('nhw-maxpts-hint'); if(nhwMaxPtsHint) nhwMaxPtsHint.textContent='(считается автоматически из вопросов)';
  const nhwMaxAttempts=document.getElementById('nhw-max-attempts'); if(nhwMaxAttempts) nhwMaxAttempts.value='0';
  const nhwGradeMode=document.getElementById('nhw-grade-mode'); if(nhwGradeMode) nhwGradeMode.value='best';
  closeModal('modal-create-hw');
  if(sids.length) _selectedStudent=sids[0];
  renderHWAdmin();
  showNotif(sids.length?`✅ ДЗ отправлено ${sids.length>1?sids.length+' ученикам':'1 ученику'}`:' ДЗ сохранено в библиотеку');
}
function deleteHW(id){ requireAdmin('deleteHW'); save('hw',(load('hw')||[]).filter(h=>h.id!==id)); renderHWAdmin(); }

// ─── PAYMENT ADMIN ───
function renderPaymentAdmin(){
  const sid=getSelectedStudent();
  const payments=(load('payments')||[]).filter(p=>p.studentId===sid);
  const el=document.getElementById('payment-admin-list');
  el.innerHTML=payments.map(p=>{
    const cls={paid:'paid',unpaid:'unpaid',partial:'partial'}[p.status];
    const icon={paid:'✅',unpaid:'❌',partial:'⚠️'}[p.status];
    // Show slot/lesson info if linked
    let linkInfo = '';
    if(p.slotId){
      const slot = (load('slots')||[]).find(s=>s.id===p.slotId);
      const course = slot?.courseId ? (load('courses')||[]).find(c=>c.id===slot.courseId) : null;
      if(slot) linkInfo = `<span style="font-size:0.74rem;background:#e8f4fd;color:#1565c0;border-radius:6px;padding:2px 7px;margin-left:6px">🗓 ${slot.day} ${slot.time}${course?' · '+course.title:''}</span>`;
    }
    return `<div class="payment-status ${cls}">
      <div><b>${p.period}</b>${linkInfo} <span style="font-size:0.8rem;color:var(--text3)">${p.note||''}</span></div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-weight:700;font-size:1.05rem">${p.amount}₽</span>
        <span class="badge ${cls==='paid'?'badge-green':cls==='unpaid'?'badge-red':'badge-gold'}">${icon} ${p.status==='paid'?'Оплачено':p.status==='unpaid'?'Не оплачено':'Частично'}</span>
        <button class="btn btn-outline btn-sm" onclick="openEditPayment('${p.id}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="deletePayment('${p.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') || emptyHTML();
}
function savePayment(){
  const sid=getSelectedStudent();
  const period=document.getElementById('np-period').value;
  const amount=document.getElementById('np-amount').value;
  const status=document.getElementById('np-status').value;
  const note=document.getElementById('np-note').value;
  if(!period||!amount){ showNotif('Заполните период и сумму'); return; }
  const payments=load('payments')||[];
  payments.push({id:'p'+Date.now(),studentId:sid,period,amount,status,note,date:new Date().toLocaleDateString('ru')});
  save('payments',payments);
  closeModal('modal-add-payment');
  renderPaymentAdmin();
  showNotif('✅ Запись сохранена');
}
function deletePayment(id){ save('payments',(load('payments')||[]).filter(p=>p.id!==id)); renderPaymentAdmin(); }

// ─── EDIT FUNCTIONS ───
function openEditStudent(id){
  const u=(load('users')||[]).find(u=>u.id===id);
  if(!u) return;
  document.getElementById('es-id').value=u.id;
  document.getElementById('es-name').value=u.name||'';
  document.getElementById('es-login').value=u.login||'';
  document.getElementById('es-pass').value='';
  document.getElementById('es-birth').value=u.birth||'';
  document.getElementById('es-phone').value=u.phone||'';
  document.getElementById('es-email').value=u.email||'';
  document.getElementById('es-parent').value=u.parent||'';
  document.getElementById('es-parent-phone').value=u.parentPhone||'';
  document.getElementById('es-parent-email').value=u.parentEmail||'';
  document.getElementById('es-grade').value=u.grade||'';
  document.getElementById('es-format').value=u.format||'';
  document.getElementById('es-notes').value=u.notes||'';
  document.getElementById('es-active').value=String(u.active!==false);
  document.getElementById('es-oferta').value=String(!!u.ofertaSigned);
  // Populate courses checkboxes
  const courses = load('courses')||[];
  const enrolled = u.enrolledCourses||[];
  const el = document.getElementById('es-courses-list');
  if(el){
    if(!courses.length){
      el.innerHTML='<span style="font-size:0.82rem;color:var(--text3)">Нет курсов — создайте курс в разделе Расписание</span>';
    } else {
      el.innerHTML = courses.map(c=>`
        <label class="chip-label" style="border-color:${enrolled.includes(c.id)?'var(--green-mid)':'var(--green-pale)'}">
          <input type="checkbox" value="${c.id}" ${enrolled.includes(c.id)?'checked':''} onchange="this.closest('label').style.borderColor=this.checked?'var(--green-mid)':'var(--green-pale)'">
          <span>${c.subject==='Биология'?'🌿':c.subject==='Химия'?'⚗️':'🧬'} ${esc(c.title)}</span>
        </label>`).join('');
    }
  }
  // Parent account fields
  const ep = document.getElementById('es-parent-login');
  const epv = document.getElementById('es-parent-login-val');
  if(ep) ep.value = u.parentLogin||'';
  if(epv) epv.textContent = u.parentLogin ? `Логин: ${u.parentLogin}` : 'Нет аккаунта';
  openModalEl('modal-edit-student');
}
async function saveEditStudent(){
  const id=document.getElementById('es-id').value;
  const name=document.getElementById('es-name').value.trim();
  const pass=document.getElementById('es-pass').value;
  const active=document.getElementById('es-active').value==='true';
  if(!name){ showNotif('Введите имя'); return; }
  const users=load('users')||[];
  const u=users.find(u=>u.id===id);
  if(!u) return;
  // Collect enrolled courses
  const enrolledCourses = [...document.querySelectorAll('#es-courses-list input[type=checkbox]:checked')].map(cb=>cb.value);
  // Derive subject from enrolled courses for backward compat
  const courses = load('courses')||[];
  const enrolledCourseObjs = enrolledCourses.map(cid=>courses.find(c=>c.id===cid)).filter(Boolean);
  const subjects = [...new Set(enrolledCourseObjs.map(c=>c.subject))];
  const subject = subjects.length===1 ? subjects[0] : subjects.length>1 ? subjects.join(' + ') : (u.subject||'');
  u.name=name; u.subject=subject; u.enrolledCourses=enrolledCourses; u.active=active;
  u.birth=document.getElementById('es-birth').value||'';
  u.phone=document.getElementById('es-phone').value.trim();
  u.email=document.getElementById('es-email').value.trim();
  u.parent=document.getElementById('es-parent').value.trim();
  u.parentPhone=document.getElementById('es-parent-phone').value.trim();
  u.parentEmail=document.getElementById('es-parent-email').value.trim();
  u.grade=document.getElementById('es-grade').value.trim();
  u.format=document.getElementById('es-format').value;
  u.notes=document.getElementById('es-notes').value.trim();
  u.ofertaSigned=document.getElementById('es-oferta').value==='true';
  if(pass){
    u.passwordHash = await hashPassword(pass);
    delete u.password; // убираем plain-text если был
  }
  // ── Родительский аккаунт ──
  const pLogin = (document.getElementById('es-parent-login')||{}).value?.trim();
  const pPass  = (document.getElementById('es-parent-pass')||{}).value;
  if(pLogin){
    const existParent = users.find(x=>x.login===pLogin && x.role==='parent');
    if(existParent){
      // update link
      existParent.linkedStudentId = id;
      if(pPass){ existParent.passwordHash = await hashPassword(pPass); delete existParent.password; }
      u.parentLogin = pLogin;
    } else if(pPass){
      // create new parent user
      const pH = await hashPassword(pPass);
      users.push({
        id: 'p_'+id, login: pLogin, passwordHash: pH,
        name: u.parent || (u.name+' (родитель)'),
        role: 'parent', linkedStudentId: id, active: true
      });
      u.parentLogin = pLogin;
    }
  }
  save('users',users);
  closeModal('modal-edit-student');
  renderStudents();
  showNotif('✅ Данные ученика обновлены');
}


// ══════════════════════════════════════════════════
// NOTION-STYLE BLOCK EDITOR
// ══════════════════════════════════════════════════
let _nbBlocks = [];
let _nbDragIdx = null;

function nbBlockId(){ return 'nb_' + Math.random().toString(36).substring(2,9); }

function nbDefaultBlock(type){
  return { id: nbBlockId(), type, content:'', caption:'', url:'', name:'', timestamps:[] };
}

// Конвертация старого формата → блоки
function nbFromLegacy(c){
  const blocks = [];
  if(c.body && c.body.trim()){
    // Split body by double newlines into paragraphs
    c.body.split(/\n\n+/).forEach(para=>{
      para = para.trim();
      if(!para) return;
      if(para.startsWith('# ')) blocks.push({...nbDefaultBlock('h1'), content: para.slice(2)});
      else if(para.startsWith('## ')) blocks.push({...nbDefaultBlock('h2'), content: para.slice(3)});
      else if(para.startsWith('### ')) blocks.push({...nbDefaultBlock('h3'), content: para.slice(4)});
      else if(para.startsWith('> ')) blocks.push({...nbDefaultBlock('quote'), content: para.slice(2)});
      else blocks.push({...nbDefaultBlock('p'), content: para});
    });
  }
  (c.images||[]).filter(Boolean).forEach(url=>{
    blocks.push({...nbDefaultBlock('image'), url});
  });
  if(c.videoUrl) blocks.push({...nbDefaultBlock('video'), url: c.videoUrl, timestamps: c.videoTimestamps||[]});
  (c.files||[]).filter(f=>f.url||f.name).forEach(f=>{
    blocks.push({...nbDefaultBlock('file'), url:f.url||'', name:f.name||'', content:f.type||'pdf'});
  });
  if(!blocks.length) blocks.push(nbDefaultBlock('p'));
  return blocks;
}

// Конвертация блоков → совместимый формат для сохранения
function nbToLegacy(blocks){
  const textBlocks = blocks.filter(b=>['p','h1','h2','h3','quote','callout','code','divider'].includes(b.type));
  const imgBlocks  = blocks.filter(b=>b.type==='image');
  const vidBlocks  = blocks.filter(b=>b.type==='video');
  const fileBlocks = blocks.filter(b=>b.type==='file');

  const bodyParts = textBlocks.map(b=>{
    if(b.type==='h1') return '# '+b.content;
    if(b.type==='h2') return '## '+b.content;
    if(b.type==='h3') return '### '+b.content;
    if(b.type==='quote') return '> '+b.content;
    if(b.type==='divider') return '---';
    return b.content;
  });

  return {
    body:    bodyParts.join('\n\n'),
    images:  imgBlocks.map(b=>b.url).filter(Boolean),
    videoUrl: vidBlocks.length ? vidBlocks[0].url : '',
    videoTimestamps: vidBlocks.length ? (vidBlocks[0].timestamps||[]) : [],
    files:   fileBlocks.map(b=>({type:b.content||'pdf', name:b.name||'', url:b.url||''})).filter(f=>f.url||f.name),
    blocks:  blocks // save full blocks array for round-trip
  };
}

// Render canvas
function nbRender(){
  const canvas = document.getElementById('nb-canvas');
  if(!canvas) return;
  canvas.innerHTML = '';
  _nbBlocks.forEach((blk, idx) => {
    canvas.appendChild(nbBlockEl(blk, idx));
  });
}

function nbBlockEl(blk, idx){
  const wrap = document.createElement('div');
  wrap.className = 'nb-block';
  wrap.dataset.idx = idx;
  wrap.draggable = true;
  wrap.addEventListener('dragstart', ()=>{ _nbDragIdx=idx; wrap.style.opacity='0.4'; });
  wrap.addEventListener('dragend', ()=>{ wrap.style.opacity=''; });
  wrap.addEventListener('dragover', e=>{ e.preventDefault(); wrap.style.background='var(--green-xpale)'; });
  wrap.addEventListener('dragleave', ()=>{ wrap.style.background=''; });
  wrap.addEventListener('drop', e=>{ e.preventDefault(); wrap.style.background=''; nbMoveBlock(_nbDragIdx, idx); });

  // Handle
  const handle = document.createElement('div');
  handle.className = 'nb-handle';
  handle.textContent = '⠿';
  handle.title = 'Перетащить';
  wrap.appendChild(handle);

  // Content area
  const content = document.createElement('div');
  content.className = 'nb-content';

  if(blk.type === 'divider'){
    content.innerHTML = '<hr class="nb-divider">';
  } else if(blk.type === 'image'){
    content.innerHTML = `
      <div class="nb-img-block" style="padding:10px">
        ${blk.url ? `<img src="${safeUrl(blk.url)}" alt="" onerror="this.style.display='none'">` : ''}
        <div style="display:flex;gap:6px;margin-top:8px">
          <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на изображение (URL)..."
            style="flex:1;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none"
            oninput="_nbBlocks[${idx}].url=this.value;document.querySelector('[data-idx=&quot;${idx}&quot;] img')?document.querySelector('[data-idx=&quot;${idx}&quot;] img').src=this.value:nbRender()">
        </div>
        <div contenteditable="true" class="nb-img-caption" data-ph="Подпись..."
          oninput="_nbBlocks[${idx}].caption=this.innerText">${blk.caption||''}</div>
      </div>`;
  } else if(blk.type === 'image-upload'){
    content.innerHTML = `
      <div class="nb-img-block" style="padding:10px">
        ${blk.url ? `<img src="${safeUrl(blk.url)}" alt="">` : ''}
        <div style="margin-top:8px">
          <label style="font-size:0.8rem;color:var(--text3);display:block;margin-bottom:4px">Загрузить изображение:</label>
          <input type="file" accept="image/*" style="font-size:0.83rem;width:100%"
            onchange="nbHandleImageUpload(this,${idx})">
        </div>
        <div contenteditable="true" class="nb-img-caption" data-ph="Подпись..."
          oninput="_nbBlocks[${idx}].caption=this.innerText">${blk.caption||''}</div>
      </div>`;
  } else if(blk.type === 'video'){
    const embed = blk.url ? getVideoEmbedUrl(blk.url) : '';
    const tsArr = blk.timestamps || [];
    const tsHtml = tsArr.map((ts,ti)=>`
      <div style="display:flex;gap:6px;margin-bottom:4px;align-items:center">
        <input value="${(ts.time||'').replace(/"/g,'&quot;')}" placeholder="0:00" style="width:60px;padding:5px 8px;border-radius:6px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.8rem;background:var(--white);outline:none"
          oninput="_nbBlocks[${idx}].timestamps[${ti}].time=this.value">
        <input value="${(ts.label||'').replace(/"/g,'&quot;')}" placeholder="Название темы..." style="flex:1;padding:5px 8px;border-radius:6px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.8rem;background:var(--white);outline:none"
          oninput="_nbBlocks[${idx}].timestamps[${ti}].label=this.value">
        <button onclick="_nbBlocks[${idx}].timestamps.splice(${ti},1);nbRender()" style="width:24px;height:24px;border-radius:6px;border:1px solid var(--green-pale);background:var(--bg);cursor:pointer;font-size:0.8rem;padding:0;color:var(--red)">✕</button>
      </div>`).join('');
    content.innerHTML = `
      <div style="padding:10px;background:var(--bg);border-radius:10px;border:1.5px dashed var(--green-pale)">
        ${embed ? `<div class="nb-video-block"><iframe src="${embed}" allowfullscreen></iframe></div>` : ''}
        <div style="display:flex;gap:6px;margin-top:${embed?'10':'0'}px">
          <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на видео (YouTube, Vimeo, VK, Google Drive)..."
            style="flex:1;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none"
            oninput="_nbBlocks[${idx}].url=this.value" onblur="nbRender()">
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--green-xpale)">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:7px">⏱ Временные метки</div>
          <div id="ts-list-${idx}">${tsHtml}</div>
          <button onclick="_nbBlocks[${idx}].timestamps=_nbBlocks[${idx}].timestamps||[];_nbBlocks[${idx}].timestamps.push({time:'',label:''});nbRender()" style="margin-top:6px;padding:5px 12px;border-radius:7px;border:1.5px solid var(--green-pale);background:var(--bg);font-family:Nunito,sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;color:var(--green-deep)">＋ Добавить метку</button>
        </div>
      </div>`;
  } else if(blk.type === 'file'){
    content.innerHTML = `
      <div style="padding:10px;background:var(--bg);border-radius:10px;border:1.5px dashed var(--green-pale);display:flex;flex-direction:column;gap:6px">
        <input value="${(blk.name||'').replace(/"/g,'&quot;')}" placeholder="Название файла (PDF, Word...)"
          style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none"
          oninput="_nbBlocks[${idx}].name=this.value">
        <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на файл..."
          style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none"
          oninput="_nbBlocks[${idx}].url=this.value">
        <select style="padding:6px 8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.8rem;background:var(--white)"
          onchange="_nbBlocks[${idx}].content=this.value">
          <option value="pdf" ${blk.content==='pdf'?'selected':''}>📄 PDF</option>
          <option value="word" ${blk.content==='word'?'selected':''}>📋 Word</option>
          <option value="link" ${blk.content==='link'?'selected':''}>🔗 Ссылка</option>
        </select>
      </div>`;
  } else {
    // Text blocks
    const tagMap = {p:'div',h1:'div',h2:'div',h3:'div',quote:'div',callout:'div',code:'div'};
    const classMap = {p:'nb-p',h1:'nb-h1',h2:'nb-h2',h3:'nb-h3',quote:'nb-quote',callout:'nb-callout',code:'nb-code'};
    const phMap = {p:'Начните писать...',h1:'Заголовок 1',h2:'Заголовок 2',h3:'Заголовок 3',quote:'Цитата...',callout:'💡 Выноска...',code:'Код...'};
    const el = document.createElement(tagMap[blk.type]||'div');
    el.contentEditable = 'true';
    el.className = classMap[blk.type]||'nb-p';
    el.dataset.ph = phMap[blk.type]||'';
    el.innerText = blk.content || '';
    el.addEventListener('input', ()=>{ _nbBlocks[idx].content = el.innerText; });
    el.addEventListener('keydown', e=>{
      if(e.key==='Enter' && !e.shiftKey && blk.type!=='code'){
        e.preventDefault();
        _nbBlocks.splice(idx+1, 0, nbDefaultBlock('p'));
        nbRender();
        setTimeout(()=>{
          const canvas=document.getElementById('nb-canvas');
          const newEl = canvas.querySelectorAll('[contenteditable]')[idx+1];
          if(newEl) newEl.focus();
        },10);
      }
      if(e.key==='Backspace' && el.innerText==='' && _nbBlocks.length>1){
        e.preventDefault();
        _nbBlocks.splice(idx,1);
        nbRender();
        setTimeout(()=>{
          const canvas=document.getElementById('nb-canvas');
          const prev = canvas.querySelectorAll('[contenteditable]')[Math.max(0,idx-1)];
          if(prev){ prev.focus(); const r=document.createRange(),s=window.getSelection(); r.selectNodeContents(prev); r.collapse(false); s.removeAllRanges(); s.addRange(r); }
        },10);
      }
    });
    content.appendChild(el);
  }
  wrap.appendChild(content);

  // Delete button
  const del = document.createElement('button');
  del.className = 'nb-del-btn';
  del.textContent = '✕';
  del.onclick = ()=>{ _nbBlocks.splice(idx,1); if(!_nbBlocks.length) _nbBlocks.push(nbDefaultBlock('p')); nbRender(); };
  wrap.appendChild(del);

  return wrap;
}

function nbMoveBlock(from, to){
  if(from===null || from===to) return;
  const [b] = _nbBlocks.splice(from, 1);
  _nbBlocks.splice(to, 0, b);
  nbRender();
}

function nbAddBlock(type, afterIdx){
  const idx = afterIdx !== undefined ? afterIdx : _nbBlocks.length - 1;
  _nbBlocks.splice(idx+1, 0, nbDefaultBlock(type));
  nbRender();
  setTimeout(()=>{
    const canvas=document.getElementById('nb-canvas');
    const els = canvas.querySelectorAll('[contenteditable]');
    if(els[idx+1]) els[idx+1].focus();
  },20);
}

function nbHandleImageUpload(input, idx){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{ _nbBlocks[idx].url = e.target.result; _nbBlocks[idx].type='image'; nbRender(); };
  reader.readAsDataURL(file);
}

// Render блоков для просмотра (ученик + предпросмотр)
function nbRenderView(blocks){
  return blocks.map(b=>{
    if(b.type==='p') return `<p style="margin:0 0 10px;line-height:1.75;color:var(--text2)">${esc(b.content).replace(/\n/g,'<br>')}</p>`;
    if(b.type==='h1') return `<h2 style="font-family:'Playfair Display',serif;font-size:1.6rem;color:var(--accent);margin:20px 0 10px">${esc(b.content)}</h2>`;
    if(b.type==='h2') return `<h3 style="font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--green-deep);margin:16px 0 8px">${esc(b.content)}</h3>`;
    if(b.type==='h3') return `<h4 style="font-size:1rem;font-weight:700;color:var(--text);margin:12px 0 6px">${esc(b.content)}</h4>`;
    if(b.type==='quote') return `<blockquote style="border-left:3px solid var(--green-mid);padding:8px 16px;background:var(--bg2);border-radius:0 8px 8px 0;font-style:italic;color:var(--text2);margin:12px 0">${esc(b.content)}</blockquote>`;
    if(b.type==='callout') return `<div style="background:#fffbeb;border:1px solid #fce98a;border-radius:10px;padding:12px 16px;color:#856404;margin:12px 0">💡 ${esc(b.content)}</div>`;
    if(b.type==='code') return `<pre style="background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:14px 18px;overflow-x:auto;font-size:0.85rem;margin:12px 0"><code>${esc(b.content)}</code></pre>`;
    if(b.type==='divider') return `<hr style="border:none;border-top:2px solid var(--green-xpale);margin:16px 0">`;
    if(b.type==='image'||b.type==='image-upload') return b.url ? `<figure style="margin:16px 0;text-align:center"><img src="${safeUrl(b.url)}" style="max-width:100%;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.1)" alt="${esc(b.caption||'')}"><figcaption style="font-size:0.78rem;color:var(--text3);margin-top:6px">${esc(b.caption||'')}</figcaption></figure>` : '';
    if(b.type==='video'){
      const embed=getVideoEmbedUrl(b.url||'');
      if(!embed) return '';
      const ts = b.timestamps || [];
      const vid = b.url || '';
      const isYT = vid.includes('youtube') || vid.includes('youtu.be');
      const isVimeo = vid.includes('vimeo');
      // Extract video ID for progress key
      let vidId = 'vid_' + btoa(vid.substring(0,40)).replace(/[^a-z0-9]/gi,'').substring(0,16);
      const tsHtml = ts.filter(t=>t.time&&t.label).map(t=>{
        const secs = _tsToSeconds(t.time);
        return `<button onclick="videoJumpTo(this,${secs})" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;border:1.5px solid var(--green-pale);background:var(--white);font-family:Nunito,sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--green-deep);transition:background 0.15s" onmouseover="this.style.background='var(--green-xpale)'" onmouseout="this.style.background='var(--white)'">
          <span style="color:var(--chem);font-size:0.75rem;font-family:monospace;font-weight:700">${esc(t.time)}</span>
          <span>${esc(t.label)}</span>
        </button>`;
      }).join('');
      const tsBlock = ts.filter(t=>t.time&&t.label).length ? `
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
          <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);align-self:center;margin-right:2px">⏱</span>
          ${tsHtml}
        </div>` : '';
      const progressId = 'vp_' + vidId;
      return `<div style="margin:16px 0" data-video-id="${esc(vidId)}">
        <div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000">
          <iframe id="iframe_${esc(vidId)}" src="${embed}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen"></iframe>
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:10px">
          <div style="flex:1;height:6px;background:var(--green-xpale);border-radius:100px;overflow:hidden">
            <div id="${esc(progressId)}" style="height:100%;background:linear-gradient(90deg,var(--green-mid),var(--green-light));border-radius:100px;transition:width 0.5s ease;width:${_getVideoProgress(vidId)}%"></div>
          </div>
          <span id="${esc(progressId)}_txt" style="font-size:0.72rem;color:var(--text3);white-space:nowrap;min-width:36px;text-align:right">${_getVideoProgress(vidId)}%</span>
        </div>
        ${tsBlock}
      </div>`;
    }
    if(b.type==='file') return b.url ? `<a href="${safeUrl(b.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;text-decoration:none;color:var(--text);font-size:0.88rem;margin:8px 0">${b.content==='pdf'?'📄':b.content==='word'?'📋':'🔗'} ${esc(b.name||b.url)}</a>` : '';
    return '';
  }).join('');
}

function nbPreview(){
  const body = document.getElementById('nb-preview-body');
  if(body) body.innerHTML = nbRenderView(_nbBlocks);
  openModal('modal-nb-preview');
}

// ══════ openEditContent / saveEditContent (перезаписываем) ══════
function openEditContent(id){
  const cont=(load('content')||[]).find(c=>c.id===id);
  if(!cont) return;
  document.getElementById('ec-id').value=cont.id;
  document.getElementById('ec-type').value=cont.type;
  document.getElementById('edit-content-title').textContent='✏️ Редактировать урок';
  document.getElementById('ec-title').value=cont.title||'';
  document.getElementById('ec-theory-fields').style.display='block';
  // Load blocks: prefer saved blocks, fall back to legacy
  _nbBlocks = cont.blocks && cont.blocks.length ? JSON.parse(JSON.stringify(cont.blocks)) : nbFromLegacy(cont);
  nbRender();
  openModalEl('modal-edit-content');
}
function saveEditContent(){
  const id=document.getElementById('ec-id').value;
  const title=document.getElementById('ec-title').value.trim();
  if(!title){ showNotif('Введите название'); return; }
  const content=load('content')||[];
  const cont=content.find(c=>c.id===id);
  if(!cont) return;
  cont.title=title;
  const legacy = nbToLegacy(_nbBlocks);
  Object.assign(cont, legacy);
  save('content',content);
  closeModal('modal-edit-content');
  renderContentAdmin();
  showNotif('✅ Урок обновлён');
}

// Stubs for old functions that may be called elsewhere
function previewEditVideo(){}
function addEditTheoryImage(){}
function renderEditTheoryImages(){}
function addEditTheoryFile(){}
function renderEditTheoryFiles(){}
let _editTheoryImages=[];
let _editTheoryFiles=[];


// ─── TEST EDITOR ───
let _editTestId='';
let _editTestQuestions=[];
let _editTestMaxPtsManual = false;

// ── Защита от потери несохранённых изменений ──
const _DIRTY_MODALS = ['modal-edit-test', 'modal-edit-hw', 'modal-edit-trial'];
let _editorDirty = false;

function _setDirty(val) {
  _editorDirty = !!val;
}

function _safeClose(id, force) {
  if (!force && _DIRTY_MODALS.includes(id) && _editorDirty) {
    if (!confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return;
  }
  _editorDirty = false;
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  if (id === 'modal-add-theory') { _theoryFiles = []; }
}
// ── EDIT TEST ──
function openEditTest(id){
  const t=(load('tests')||[]).find(t=>t.id===id);
  if(!t) return;
  _editTestId=id;
  _editTestQuestions=JSON.parse(JSON.stringify(t.questions||[]));
  _editTestMaxPtsManual=false;
  document.getElementById('et-id').value=id;
  document.getElementById('et-title').value=t.title||'';
  document.getElementById('et-desc').value=t.desc||'';
  document.getElementById('et-due').value=t.due||'';
  document.getElementById('et-pass').value=t.passThresh||'';
  const gc=t.gradeConfig||{};
  document.getElementById('et-g5').value=gc[5]??85;
  document.getElementById('et-g4').value=gc[4]??67;
  document.getElementById('et-g3').value=gc[3]??45;
  document.getElementById('et-max-attempts').value=t.maxAttempts??0;
  document.getElementById('et-grade-mode').value=t.gradeMode||'best';
  // Reset maxpts UI to auto mode
  const maxEl=document.getElementById('et-maxpts');
  const maxBtn=document.getElementById('et-maxpts-btn');
  const maxHint=document.getElementById('et-maxpts-hint');
  if(maxEl){ maxEl.setAttribute('readonly',''); maxEl.style.background='var(--bg)'; maxEl.style.color='var(--text3)'; }
  if(maxBtn) maxBtn.textContent='✏️ Изменить';
  if(maxHint) maxHint.textContent='(считается автоматически из вопросов)';
  renderEditTestBuilder();
  _setDirty(false);
  openModalEl('modal-edit-test');
}
function qTypeLabel(type){
  return {auto:'⚡ Выбор ответа',multi:'☑️ Несколько ответов',open:'📝 Открытый',fillin:'✏️ Вставить слово',match:'🔗 Соответствие',order:'🔢 Порядок'}[type]||type;
}
function isAutoScored(type){ return ['auto','multi','fillin','match','order'].includes(type); }

function editQTypeBody(q, store, idx, reRender){
  // store: JS expression like '_editTestQuestions' or '_editHWQuestions'
  // idx: question index (number)
  // For trials use editTrialQuestionHTML which has its own inline version
  const s = store, i = idx, rr = reRender;
  if(q.type==='auto') return `
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:4px">Варианты (через запятую):</div>
    <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;margin-bottom:6px;background:var(--white)"
      placeholder="А,Б,В,Г" value="${(q.options||[]).join(',').replace(/"/g,'&quot;')}"
      oninput="${s}[${i}].options=this.value.split(',').map(x=>x.trim())">
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:4px">Правильный ответ:</div>
    <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;background:var(--white)"
      placeholder="А" value="${(q.correct||'').replace(/"/g,'&quot;')}"
      oninput="${s}[${i}].correct=this.value">`;
  if(q.type==='multi') return `
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:4px">Варианты (через запятую):</div>
    <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;margin-bottom:6px;background:var(--white)"
      placeholder="А,Б,В,Г,Д" value="${(q.options||[]).join(',').replace(/"/g,'&quot;')}"
      oninput="${s}[${i}].options=this.value.split(',').map(x=>x.trim())">
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:4px">Правильные ответы (через запятую):</div>
    <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;background:var(--white)"
      placeholder="А,В" value="${(Array.isArray(q.correct)?q.correct.join(','):q.correct||'').replace(/"/g,'&quot;')}"
      oninput="${s}[${i}].correct=this.value.split(',').map(x=>x.trim())">`;
  if(q.type==='fillin') return `
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:4px">Текст с пропуском (используйте ___):</div>
    <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;margin-bottom:6px;background:var(--white)"
      placeholder="Основная единица живого — это ___" value="${(q.text||'').replace(/"/g,'&quot;')}"
      oninput="${s}[${i}].text=this.value">
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:4px">Правильное слово/фраза:</div>
    <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;background:var(--white)"
      placeholder="клетка" value="${(q.correct||'').replace(/"/g,'&quot;')}"
      oninput="${s}[${i}].correct=this.value">`;
  if(q.type==='match') return `
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:4px">Пары (левое → правое, каждая с новой строки):</div>
    <textarea style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;min-height:90px;resize:vertical;background:var(--white)"
      placeholder="Митохондрия → Энергия&#10;Рибосома → Белок&#10;Ядро → ДНК"
      oninput="${s}[${i}].pairs=this.value.split('\\n').filter(l=>l.includes('→')).map(l=>{const[a,b]=l.split('→');return{left:(a||'').trim(),right:(b||'').trim()}})"
    >${(q.pairs||[]).map(p=>p.left+' → '+p.right).join('\n').replace(/</g,'&lt;')}</textarea>`;
  if(q.type==='order') return `
    <div style="font-size:0.78rem;color:var(--text3);margin-bottom:4px">Элементы в правильном порядке (каждый с новой строки):</div>
    <textarea style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;min-height:90px;resize:vertical;background:var(--white)"
      placeholder="Интерфаза&#10;Профаза&#10;Метафаза&#10;Анафаза&#10;Телофаза"
      oninput="${s}[${i}].items=this.value.split('\\n').map(x=>x.trim()).filter(Boolean)"
    >${(q.items||[]).join('\n').replace(/</g,'&lt;')}</textarea>`;
  return ''; // open — no extra fields
}
function renderEditTestBuilder(){
  const el=document.getElementById('et-questions-list');
  const totalPts=_editTestQuestions.reduce((s,q)=>s+(+q.points||1),0);
  const hint=document.getElementById('et-total-hint');
  if(hint) hint.textContent=_editTestQuestions.length?`· ${_editTestQuestions.length} вопросов · итого ${totalPts} б.`:'';
  // Sync maxpts if not manual
  if(!_editTestMaxPtsManual){
    const maxEl=document.getElementById('et-maxpts');
    if(maxEl) maxEl.value=totalPts||0;
  }
  el.innerHTML=_editTestQuestions.map((q,i)=>{
    const typeBody = editQTypeBody(q,'_editTestQuestions',i,'renderEditTestBuilder()');
    const showText = q.type!=='fillin';
    return `<div class="question-block" style="margin-bottom:10px;border-left:3px solid var(--green-light)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div class="question-num">${qTypeLabel(q.type)} #${i+1}
          <span style="font-size:0.7rem;font-weight:600;margin-left:6px;color:${isAutoScored(q.type)?'var(--green-mid)':'var(--gold)'}">
            ${isAutoScored(q.type)?'✅ Авто':'👁 Вручную'}</span></div>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:0.75rem;color:var(--text3)">Баллов:</label>
          <input type="number" min="0.5" step="0.5" value="${+q.points||1}"
            style="width:65px;padding:5px 8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;text-align:center;font-size:0.85rem"
            oninput="_editTestQuestions[${i}].points=+this.value||1;renderEditTestBuilder()">
          <button class="btn btn-red btn-sm" onclick="removeEditQ(${i})">✕</button>
        </div>
      </div>
      ${showText?`<input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;margin-bottom:8px;background:var(--white)"
        placeholder="Текст вопроса..." oninput="_editTestQuestions[${i}].text=this.value" value="${(q.text||'').replace(/"/g,'&quot;')}">`:''}
      ${typeBody}
      <div style="margin-top:8px">
        <label style="font-size:0.75rem;color:var(--text3);display:block;margin-bottom:4px">🖼 Картинка к вопросу (необязательно)</label>
        <div class="q-img-tabs">
          <div class="q-img-tab ${!(q.imageUrl||'').startsWith('data:')?'active':''}" onclick="switchImgTab('etq-${i}','url')">Ссылка</div>
          <div class="q-img-tab ${(q.imageUrl||'').startsWith('data:')?'active':''}" onclick="switchImgTab('etq-${i}','file')">Загрузить</div>
        </div>
        <div id="etq-${i}-url" style="${(q.imageUrl||'').startsWith('data:')?'display:none':''}">
          <input class="q-input" placeholder="https://example.com/image.jpg"
            value="${(q.imageUrl||'').startsWith('data:')?'':q.imageUrl||''}"
            oninput="_editTestQuestions[${i}].imageUrl=this.value;updateQImgPreview('etq-pre-${i}',this.value)">
        </div>
        <div id="etq-${i}-file" style="${(q.imageUrl||'').startsWith('data:')?'':'display:none'}">
          <input type="file" accept="image/*" style="width:100%;font-size:0.83rem;padding:6px"
            onchange="handleEditQImgUpload(this,'_editTestQuestions',${i},'etq-pre-${i}')">
        </div>
        <img id="etq-pre-${i}" class="q-img-preview" src="${safeUrl(q.imageUrl||'')} "style="${q.imageUrl?'':'display:none'}" alt="">
      </div>
      <div style="margin-top:8px">
        <label style="font-size:0.75rem;color:var(--text3);display:block;margin-bottom:4px">💡 Подсказка (необязательно)</label>
        <input style="width:100%;padding:7px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.84rem;background:var(--white)"
          placeholder="Подсказка для ученика — не раскрывает ответ..."
          oninput="_editTestQuestions[${i}].hint=this.value"
          value="${(q.hint||'').replace(/"/g,'&quot;')}">
      </div>
    </div>`;
  }).join('');
}
function handleEditQImgUpload(input, store, idx, previewId){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    if(store==='_editTestQuestions') _editTestQuestions[idx].imageUrl=e.target.result;
    else if(store==='_editHWQuestions') _editHWQuestions[idx].imageUrl=e.target.result;
    updateQImgPreview(previewId, e.target.result);
  };
  reader.readAsDataURL(file);
}
function addEditTestQuestion(type){
  _editTestQuestions.push({id:'q'+Date.now(),type,text:'',options:[],correct:'',points:1,pairs:[],items:[],hint:''});
  _setDirty(true);
  renderEditTestBuilder();
}
function removeEditQ(i){ _editTestQuestions.splice(i,1); _setDirty(true); renderEditTestBuilder(); }
function saveEditTest(){
  requireAdmin('saveEditTest');
  const title=document.getElementById('et-title').value.trim();
  if(!title){ showNotif('Введите название теста'); return; }
  if(!_editTestQuestions.length){ showNotif('Добавьте хотя бы один вопрос'); return; }
  const tests=load('tests')||[];
  const t=tests.find(t=>t.id===_editTestId);
  if(!t) return;
  t.title=title;
  t.desc=document.getElementById('et-desc').value.trim();
  t.due=document.getElementById('et-due').value;
  t.passThresh=+document.getElementById('et-pass').value||55;
  t.gradeConfig={5:+document.getElementById('et-g5').value||85, 4:+document.getElementById('et-g4').value||67, 3:+document.getElementById('et-g3').value||45, 2:0};
  t.maxAttempts=+document.getElementById('et-max-attempts').value||0;
  t.gradeMode=document.getElementById('et-grade-mode').value||'best';
  t.questions=_editTestQuestions;
  const etAllTotal=_editTestQuestions.reduce((s,q)=>s+(+q.points||1),0);
  const etMaxPtsInput=+(document.getElementById('et-maxpts')?.value)||0;
  const etMaxPts = _editTestMaxPtsManual && etMaxPtsInput > 0 ? etMaxPtsInput : etAllTotal;
  t.maxPts = etMaxPts;
  t.autoTotal = etMaxPts;
  _editTestMaxPtsManual=false;
  save('tests',tests);
  _setDirty(false);
  closeModal('modal-edit-test', true);
  renderTestsAdmin();
  showNotif('✅ Тест обновлён');
}

// ── EDIT HW ──
let _editHWQuestions=[];
let _editHWMaxPtsManual = false;
function openEditHW(id){
  const h=(load('hw')||[]).find(h=>h.id===id);
  if(!h) return;
  _editHWQuestions=JSON.parse(JSON.stringify(h.questions||[]));
  _editHWMaxPtsManual=false;
  document.getElementById('ehw-id').value=h.id;
  document.getElementById('ehw-title').value=h.title||'';
  document.getElementById('ehw-desc').value=h.desc||'';
  document.getElementById('ehw-due').value=h.due||'';
  document.getElementById('ehw-fileurl').value=h.fileUrl||'';
  const gc=h.gradeConfig||{};
  document.getElementById('ehw-g5').value=gc[5]??85;
  document.getElementById('ehw-g4').value=gc[4]??67;
  document.getElementById('ehw-g3').value=gc[3]??45;
  document.getElementById('ehw-max-attempts').value=h.maxAttempts??0;
  document.getElementById('ehw-grade-mode').value=h.gradeMode||'best';
  // Reset maxpts UI to auto mode
  const maxEl=document.getElementById('ehw-maxpts');
  const maxBtn=document.getElementById('ehw-maxpts-btn');
  const maxHint=document.getElementById('ehw-maxpts-hint');
  if(maxEl){ maxEl.setAttribute('readonly',''); maxEl.style.background='var(--bg)'; maxEl.style.color='var(--text3)'; }
  if(maxBtn) maxBtn.textContent='✏️ Изменить';
  if(maxHint) maxHint.textContent='(считается автоматически из вопросов)';
  renderEditHWBuilder();
  _setDirty(false);
  openModalEl('modal-edit-hw');
}
function renderEditHWBuilder(){
  const el=document.getElementById('ehw-questions-list');
  if(!el) return;
  const totalPts=_editHWQuestions.reduce((s,q)=>s+(+q.points||1),0);
  const hint=document.getElementById('ehw-total-hint');
  if(hint) hint.textContent=_editHWQuestions.length?`· ${_editHWQuestions.length} вопросов · итого ${totalPts} б.`:'';
  // Sync maxpts if not manual
  if(!_editHWMaxPtsManual){
    const maxEl=document.getElementById('ehw-maxpts');
    if(maxEl) maxEl.value=totalPts||0;
  }
  el.innerHTML=_editHWQuestions.map((q,i)=>{
    const typeBody = editQTypeBody(q,'_editHWQuestions',i,'renderEditHWBuilder()');
    const showText = q.type!=='fillin';
    return `<div class="question-block" style="margin-bottom:10px;border-left:3px solid var(--green-light)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div class="question-num">${qTypeLabel(q.type)} #${i+1}
          <span style="font-size:0.7rem;font-weight:600;margin-left:6px;color:${isAutoScored(q.type)?'var(--green-mid)':'var(--gold)'}">
            ${isAutoScored(q.type)?'✅ Авто':'👁 Вручную'}</span></div>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:0.75rem;color:var(--text3)">Баллов:</label>
          <input type="number" min="0.5" step="0.5" value="${+q.points||1}"
            style="width:65px;padding:5px 8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;text-align:center;font-size:0.85rem"
            oninput="_editHWQuestions[${i}].points=+this.value||1;renderEditHWBuilder()">
          <button class="btn btn-red btn-sm" onclick="removeEditHWQ(${i})">✕</button>
        </div>
      </div>
      ${showText?`<input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;margin-bottom:8px;background:var(--white)"
        placeholder="Текст вопроса..." oninput="_editHWQuestions[${i}].text=this.value" value="${(q.text||'').replace(/"/g,'&quot;')}">`:''}
      ${typeBody}
      <div style="margin-top:8px">
        <label style="font-size:0.75rem;color:var(--text3);display:block;margin-bottom:4px">🖼 Картинка к вопросу (необязательно)</label>
        <div class="q-img-tabs">
          <div class="q-img-tab ${!(q.imageUrl||'').startsWith('data:')?'active':''}" onclick="switchImgTab('ehwq-${i}','url')">Ссылка</div>
          <div class="q-img-tab ${(q.imageUrl||'').startsWith('data:')?'active':''}" onclick="switchImgTab('ehwq-${i}','file')">Загрузить</div>
        </div>
        <div id="ehwq-${i}-url" style="${(q.imageUrl||'').startsWith('data:')?'display:none':''}">
          <input class="q-input" placeholder="https://example.com/image.jpg"
            value="${(q.imageUrl||'').startsWith('data:')?'':q.imageUrl||''}"
            oninput="_editHWQuestions[${i}].imageUrl=this.value;updateQImgPreview('ehwq-pre-${i}',this.value)">
        </div>
        <div id="ehwq-${i}-file" style="${(q.imageUrl||'').startsWith('data:')?'':'display:none'}">
          <input type="file" accept="image/*" style="width:100%;font-size:0.83rem;padding:6px"
            onchange="handleEditQImgUpload(this,'_editHWQuestions',${i},'ehwq-pre-${i}')">
        </div>
        <img id="ehwq-pre-${i}" class="q-img-preview" src="${safeUrl(q.imageUrl||'')} "style="${q.imageUrl?'':'display:none'}" alt="">
      </div>
      <div style="margin-top:8px">
        <label style="font-size:0.75rem;color:var(--text3);display:block;margin-bottom:4px">💡 Подсказка (необязательно)</label>
        <input style="width:100%;padding:7px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.84rem;background:var(--white)"
          placeholder="Подсказка для ученика — не раскрывает ответ..."
          oninput="_editHWQuestions[${i}].hint=this.value"
          value="${(q.hint||'').replace(/"/g,'&quot;')}">
      </div>
    </div>`;
  }).join('');
}
function addEditHWQuestion(type){
  _setDirty(true);
  _editHWQuestions.push({id:'q'+Date.now(),type,text:'',options:[],correct:'',points:1,pairs:[],items:[],hint:''});
  renderEditHWBuilder();
}
function removeEditHWQ(i){ _editHWQuestions.splice(i,1); _setDirty(true); renderEditHWBuilder(); }

// ═══════════════════════════════════════
// 📄 DOCX → AI → Questions Import
// ═══════════════════════════════════════

async function extractTextFromDocx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
        resolve(result.value);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function callClaudeForQuestions(docText, mode, count, isHW) {
  const modeDescriptions = {
    mixed: 'смешанные типы: тесты с вариантами (auto), открытые вопросы (open), и вставить-слово (fillin)',
    auto:  'только тесты с одним правильным вариантом ответа (auto)',
    open:  'только открытые вопросы с развёрнутым ответом (open)',
    fillin:'только вопросы типа «вставить слово» (fillin) — текст с пропуском ___ и правильный ответ',
  };
  const kind = isHW ? 'домашнего задания' : 'теста';
  const prompt = `Ты — преподаватель биологии и химии. На основе следующего учебного текста составь РОВНО ${count} вопросов для ${kind}.

Типы вопросов: ${modeDescriptions[mode]}.

СТРУКТУРА JSON (верни ТОЛЬКО массив JSON, без markdown, без пояснений):
[
  {
    "type": "auto",
    "text": "Текст вопроса?",
    "options": ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"],
    "correct": "Вариант А",
    "points": 1,
    "hint": ""
  },
  {
    "type": "open",
    "text": "Текст открытого вопроса?",
    "options": [],
    "correct": "",
    "points": 2,
    "hint": "Необязательная подсказка"
  },
  {
    "type": "fillin",
    "text": "Предложение с ___ для вставки слова",
    "options": [],
    "correct": "правильное слово",
    "points": 1,
    "hint": ""
  }
]

Правила:
- Для "auto": options — массив из 4 вариантов, correct — один из вариантов
- Для "fillin": text содержит ___ там где пропуск, correct — слово/фраза для вставки
- Для "open": correct оставь пустым ""
- Все вопросы строго по тексту, на русском языке
- Верни ТОЛЬКО JSON массив

ТЕКСТ ДОКУМЕНТА:
${docText.slice(0, 8000)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  const text = data.content.map(c => c.text || '').join('');
  // strip possible markdown fences
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function setDocxStatus(elId, msg, isError) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = msg ? 'block' : 'none';
  el.style.color = isError ? 'var(--red)' : 'var(--green-deep)';
  el.textContent = msg;
}

async function importDocxToTest(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const mode = document.getElementById('et-docx-mode').value;
  const count = parseInt(document.getElementById('et-docx-count').value) || 10;
  const statusEl = 'et-docx-status';

  setDocxStatus(statusEl, '📄 Читаю документ…');
  try {
    const text = await extractTextFromDocx(file);
    if (!text.trim()) { setDocxStatus(statusEl, 'Документ пустой или не читается', true); return; }

    setDocxStatus(statusEl, `🤖 ИИ генерирует ${count} вопросов… (~15 сек)`);
    const questions = await callClaudeForQuestions(text, mode, count, false);

    const newQs = questions.map(q => ({
      id: 'q' + Date.now() + Math.random().toString(36).slice(2),
      type: q.type || 'open',
      text: q.text || '',
      options: q.options || [],
      correct: q.correct || '',
      points: q.points || 1,
      pairs: [],
      items: q.type === 'order' ? (q.items || []) : [],
      hint: q.hint || ''
    }));

    _editTestQuestions.push(...newQs);
    renderEditTestBuilder();
    setDocxStatus(statusEl, `✅ Добавлено ${newQs.length} вопросов из «${file.name}»`);
  } catch(e) {
    console.error(e);
    setDocxStatus(statusEl, '❌ Ошибка: ' + (e.message || 'не удалось обработать файл'), true);
  }
}

async function importDocxToHW(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const mode = document.getElementById('ehw-docx-mode').value;
  const count = parseInt(document.getElementById('ehw-docx-count').value) || 10;
  const statusEl = 'ehw-docx-status';

  setDocxStatus(statusEl, '📄 Читаю документ…');
  try {
    const text = await extractTextFromDocx(file);
    if (!text.trim()) { setDocxStatus(statusEl, 'Документ пустой или не читается', true); return; }

    setDocxStatus(statusEl, `🤖 ИИ генерирует ${count} заданий… (~15 сек)`);
    const questions = await callClaudeForQuestions(text, mode, count, true);

    const newQs = questions.map(q => ({
      id: 'q' + Date.now() + Math.random().toString(36).slice(2),
      type: q.type || 'open',
      text: q.text || '',
      options: q.options || [],
      correct: q.correct || '',
      points: q.points || 1,
      pairs: [],
      items: q.type === 'order' ? (q.items || []) : [],
      hint: q.hint || ''
    }));

    _editHWQuestions.push(...newQs);
    renderEditHWBuilder();
    setDocxStatus(statusEl, `✅ Добавлено ${newQs.length} заданий из «${file.name}»`);
  } catch(e) {
    console.error(e);
    setDocxStatus(statusEl, '❌ Ошибка: ' + (e.message || 'не удалось обработать файл'), true);
  }
}
function saveEditHW(){
  requireAdmin('saveEditHW');
  const id=document.getElementById('ehw-id').value;
  const title=document.getElementById('ehw-title').value.trim();
  if(!title){ showNotif('Введите тему'); return; }
  const hws=load('hw')||[];
  const h=hws.find(h=>h.id===id);
  if(!h) return;
  h.title=title;
  h.desc=document.getElementById('ehw-desc').value.trim();
  h.due=document.getElementById('ehw-due').value;
  h.fileUrl=document.getElementById('ehw-fileurl').value.trim();
  h.gradeConfig={5:+document.getElementById('ehw-g5').value||85, 4:+document.getElementById('ehw-g4').value||67, 3:+document.getElementById('ehw-g3').value||45, 2:0};
  h.maxAttempts=+document.getElementById('ehw-max-attempts').value||0;
  h.gradeMode=document.getElementById('ehw-grade-mode').value||'best';
  h.questions=_editHWQuestions;
  const ehwAllTotal=_editHWQuestions.reduce((s,q)=>s+(+q.points||1),0);
  const ehwMaxPtsInput=+(document.getElementById('ehw-maxpts')?.value)||0;
  const ehwMaxPts = _editHWMaxPtsManual && ehwMaxPtsInput > 0 ? ehwMaxPtsInput : ehwAllTotal;
  h.maxPts = ehwMaxPts;
  h.autoTotal = ehwMaxPts;
  _editHWMaxPtsManual=false;
  save('hw',hws);
  _setDirty(false);
  closeModal('modal-edit-hw', true);
  renderHWAdmin();
  showNotif('✅ ДЗ обновлено');
}

function openEditPayment(id){
  const p=(load('payments')||[]).find(p=>p.id===id);
  if(!p) return;
  document.getElementById('ep-id').value=p.id;
  document.getElementById('ep-period').value=p.period||'';
  document.getElementById('ep-amount').value=p.amount||'';
  document.getElementById('ep-status').value=p.status||'paid';
  document.getElementById('ep-note').value=p.note||'';
  document.getElementById('modal-edit-payment').classList.add('open');
}
function saveEditPayment(){
  const id=document.getElementById('ep-id').value;
  const period=document.getElementById('ep-period').value;
  const amount=document.getElementById('ep-amount').value;
  const status=document.getElementById('ep-status').value;
  const note=document.getElementById('ep-note').value;
  if(!period||!amount){ showNotif('Заполните период и сумму'); return; }
  const payments=load('payments')||[];
  const p=payments.find(p=>p.id===id);
  if(!p) return;
  p.period=period; p.amount=amount; p.status=status; p.note=note;
  save('payments',payments);
  closeModal('modal-edit-payment');
  renderPaymentAdmin();
  showNotif('✅ Оплата обновлена');
}

// ─── SCHEDULE ADMIN ───
function renderScheduleAdmin(){
  const courses=load('courses')||[];
  const slots=load('slots')||[];
  const bookings=load('bookings')||[];
  const users=load('users')||[];
  document.getElementById('courses-admin-list').innerHTML=courses.map(c=>`
    <div class="content-item">
      <div class="content-icon">${c.subject==='Биология'?'🌿':c.subject==='Химия'?'⚗️':'🧬'}</div>
      <div class="content-info">
        <div class="content-name">${esc(c.title)}</div>
        <div class="content-meta">${c.subject} · ${{individual:'Индивидуальный',group:'Групповой',pair:'Парный'}[c.format]} · ${c.price}₽</div>
      </div>
      <button class="btn btn-red btn-sm" onclick="deleteCourse('${c.id}')">🗑</button>
    </div>`).join('') || emptyHTML();
  document.getElementById('slots-admin-list').innerHTML=slots.map(s=>{
    const u=s.bookedBy?users.find(u=>u.id===s.bookedBy):null;
    const g=s.groupId?getGroups().find(x=>x.id===s.groupId):null;
    const whoLabel = g ? `<b>👥 ${esc(g.name)}</b>` : (u?`<b>${esc(u.name)}</b>`:'<span style="color:var(--text3)">Свободно</span>');
    const courseLabel = s.courseId ? (load('courses')||[]).find(c=>c.id===s.courseId)?.title : null;
    return `<div class="content-item">
      <div class="content-icon">🕐</div>
      <div class="content-info">
        <div class="content-name">${s.day} ${s.time}${courseLabel?` · <span style="color:var(--chem);font-size:0.8rem">${courseLabel}</span>`:''}</div>
        <div class="content-meta">${s.dur} мин · ${whoLabel}</div>
      </div>
      <button class="btn btn-red btn-sm" onclick="deleteSlot('${s.id}')">🗑</button>
    </div>`;
  }).join('') || emptyHTML();
  document.getElementById('booking-requests-list').innerHTML=bookings.filter(b=>b.status==='pending').map(b=>{
    const u=users.find(u=>u.id===b.studentId);
    const s=slots.find(s=>s.id===b.slotId);
    const c=courses.find(c=>c.id===b.courseId);
    return `<div class="content-item">
      <div class="content-icon">📬</div>
      <div class="content-info">
        <div class="content-name">${u?u.name:'—'} → ${c?c.title:'—'}</div>
        <div class="content-meta">${s?s.day+' '+s.time:'—'}</div>
      </div>
      <div class="content-actions">
        <button class="btn btn-green btn-sm" onclick="approveBooking('${b.id}')">✅ Принять</button>
        <button class="btn btn-red btn-sm" onclick="rejectBooking('${b.id}')">❌ Отклонить</button>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state"><p>Нет заявок</p></div>';
}
function saveCourse(){
  const title=document.getElementById('nc-title').value;
  const subject=document.getElementById('nc-subject').value;
  const format=document.getElementById('nc-format').value;
  const price=document.getElementById('nc-price').value;
  const desc=document.getElementById('nc-desc').value;
  if(!title){ showNotif('Введите название'); return; }
  const courses=load('courses')||[];
  courses.push({id:'c'+Date.now(),title,subject,format,price,desc});
  save('courses',courses);
  closeModal('modal-add-course');
  renderScheduleAdmin();
  showNotif('✅ Курс добавлен');
}
function deleteCourse(id){ save('courses',(load('courses')||[]).filter(c=>c.id!==id)); renderScheduleAdmin(); }
function saveSlot(){
  const day=document.getElementById('nsl-day').value;
  const time=document.getElementById('nsl-time').value;
  const dur=document.getElementById('nsl-dur').value;
  const courseId=document.getElementById('nsl-course')?.value||null;
  const assignType=document.getElementById('nsl-assigntype')?.value||'';
  let bookedBy=null, groupId=null;
  if(assignType==='student'){
    bookedBy=document.getElementById('nsl-student').value||null;
  } else if(assignType==='group'){
    groupId=document.getElementById('nsl-group').value||null;
    const g=getGroups().find(x=>x.id===groupId);
    if(g&&g.memberIds&&g.memberIds.length) bookedBy=g.memberIds[0];
  }
  const slots=load('slots')||[];
  slots.push({id:'s'+Date.now(),day,time,dur:parseInt(dur),bookedBy,groupId:groupId||null,courseId:courseId||null});
  save('slots',slots);
  // Notify assigned student(s)
  if(bookedBy) addNotif(bookedBy,{type:'schedule',text:`🗓 Вас записали: ${day} ${time}`,nav:'schedule'});
  if(groupId){
    const g=getGroups().find(x=>x.id===groupId);
    if(g) (g.memberIds||[]).forEach(sid=>addNotif(sid,{type:'schedule',text:`🗓 Группа записана: ${day} ${time}`,nav:'schedule'}));
  }
  closeModal('modal-add-slot');
  renderScheduleAdmin();
  showNotif('✅ Слот добавлен');
}
function deleteSlot(id){ requireAdmin('deleteSlot'); save('slots',(load('slots')||[]).filter(s=>s.id!==id)); renderScheduleAdmin(); }
function approveBooking(id){
  const bookings=load('bookings')||[];
  const b=bookings.find(b=>b.id===id);
  if(!b){ showNotif('Заявка не найдена'); return; }
  b.status='approved';
  const slots=load('slots')||[];
  const s=slots.find(s=>s.id===b.slotId);
  if(s) s.bookedBy=b.studentId;
  save('bookings',bookings); save('slots',slots);
  addNotif(b.studentId,{type:'schedule',text:`🎉 Ваша запись подтверждена! ${s?s.day+' '+s.time:''}`,nav:'student-schedule'});
  renderScheduleAdmin();
  showNotif('✅ Запись подтверждена');
}
function rejectBooking(id){
  const bookings=load('bookings')||[];
  const b=bookings.find(b=>b.id===id);
  if(!b){ showNotif('Заявка не найдена'); return; }
  b.status='rejected';
  save('bookings',bookings);
  renderScheduleAdmin();
  showNotif('❌ Запись отклонена');
}

// ═══════════════════════════════════════════
// STUDENT PAGES
// ═══════════════════════════════════════════
// ══════════════════════════════════════════
// УМНОЕ ПОВТОРЕНИЕ (SM-2)
// ══════════════════════════════════════════

// intervals in days by rating: 1=tomorrow, 2=3d, 4=7d, 5=14d
const SR_INTERVALS = {1:1, 2:3, 3:5, 4:7, 5:14};

function srKey(sid){ return 'sr_'+sid; }

// SR-данные — Firebase (путь db/sr/{sid})
const _srCache = {};
function getSRData(sid){
  return _srCache[sid] !== undefined ? _srCache[sid] : {};
}
async function loadSRDataAsync(sid){
  const snap = await _fbInit().ref('db/sr/'+sid).get();
  _srCache[sid] = snap.val() || {};
  return _srCache[sid];
}
function saveSRData(sid, data){
  _srCache[sid] = data;
  _fbInit().ref('db/sr/'+sid).set(data)
    .catch(e => console.error('[Firebase] sr save', e));
}

// Returns today as YYYY-MM-DD string
function todayStr(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// Schedule a content item for spaced repetition (called when new theory is saved)
function srScheduleItem(sid, contentId){
  const data = getSRData(sid);
  if(!data[contentId]){
    // First time: due tomorrow
    const due = new Date(); due.setDate(due.getDate()+1);
    data[contentId] = {
      nextDue: due.toISOString().slice(0,10),
      interval: 1,
      repetitions: 0,
      ef: 2.5 // easiness factor
    };
    saveSRData(sid, data);
    // Create notification
    addSRNotification(sid, contentId, due);
  }
}

function addSRNotification(sid, contentId, dueDate){
  const content=(load('content')||[]).find(c=>c.id===contentId);
  const title = content ? content.title : 'материал';
  const dateStr = dueDate.toLocaleDateString('ru');
  const notifs = load('notifs')||[];
  notifs.push({
    id:'sr_'+Date.now()+'_'+contentId,
    studentId:sid,
    type:'repeat',
    contentId,
    text:`🧠 Пора повторить: «${title}» — ${dateStr}`,
    date: dateStr,
    read:false
  });
  save('notifs', notifs);
}

// After rating a card, compute next due date (simplified SM-2)
function srRateItem(sid, contentId, rating){
  const data = getSRData(sid);
  const item = data[contentId] || {interval:1, repetitions:0, ef:2.5};
  const interval = SR_INTERVALS[rating] || 1;
  item.repetitions = (item.repetitions||0)+1;
  item.interval = interval;
  const due = new Date();
  due.setDate(due.getDate()+interval);
  item.nextDue = due.toISOString().slice(0,10);
  item.lastRated = todayStr();
  item.ratedToday = true;
  data[contentId] = item;
  saveSRData(sid, data);
  // Schedule next notification
  if(rating >= 3) addSRNotification(sid, contentId, due);
}

function getDueItems(sid){
  const data = getSRData(sid);
  const today = todayStr();
  const content = (load('content')||[]).filter(c=>c.studentId===sid && c.type==='theory');
  // Items due today or overdue
  return content.filter(c=>{
    const item = data[c.id];
    if(!item) return false; // not scheduled yet
    return item.nextDue <= today;
  });
}

function getDoneTodayItems(sid){
  const data = getSRData(sid);
  const today = todayStr();
  return Object.values(data).filter(v=>v.lastRated===today).length;
}

// Session state
let _repQueue = [];
let _repIndex = 0;

function renderRepeatPage(){
  const sid = currentUser.id;
  const data = getSRData(sid);
  const today = todayStr();
  const allContent = (load('content')||[]).filter(c=>c.studentId===sid && c.type==='theory');

  // Auto-schedule items that were never scheduled
  let changed = false;
  allContent.forEach(c=>{
    if(!data[c.id]){
      data[c.id] = {nextDue: today, interval:1, repetitions:0, ef:2.5};
      changed = true;
    }
  });
  if(changed) saveSRData(sid, data);

  const dueItems = getDueItems(sid);
  const doneToday = getDoneTodayItems(sid);

  document.getElementById('rep-due-count').textContent = dueItems.length;
  document.getElementById('rep-done-count').textContent = doneToday;
  document.getElementById('rep-total-count').textContent = allContent.length;

  // Update nav badge
  updateRepeatBadge(dueItems.length);

  // Banner
  const banner = document.getElementById('repeat-due-banner');
  if(dueItems.length > 0){
    banner.style.display='block';
    banner.innerHTML=`<div style="background:linear-gradient(135deg,#fff3cd,#ffe08a);border:1.5px solid #d4a017;border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px">
      <div style="font-size:2rem">🔥</div>
      <div>
        <div style="font-weight:700;color:#7d5a00">Есть ${dueItems.length} ${dueItems.length===1?'урок':'урока'} для повторения!</div>
        <div style="font-size:0.85rem;color:#9a7200;margin-top:3px">Нажмите кнопку ниже, чтобы начать сессию</div>
      </div>
      <button class="btn btn-green" style="margin-left:auto;white-space:nowrap" onclick="startRepeatSession()">▶ Начать</button>
    </div>`;
  } else {
    banner.style.display='none';
  }

  // All list
  const listEl = document.getElementById('repeat-all-list');
  if(!allContent.length){
    listEl.innerHTML=emptyHTML();
  } else {
    listEl.innerHTML = allContent.map(c=>{
      const sr = data[c.id]||{};
      const isDue = sr.nextDue && sr.nextDue <= today;
      const nextDate = sr.nextDue ? new Date(sr.nextDue).toLocaleDateString('ru') : '—';
      const reps = sr.repetitions||0;
      return `<div class="hw-item" style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="font-size:1.3rem">${isDue?'🔥':'📖'}</div>
        <div style="flex:1">
          <div class="content-name">${esc(c.title)}</div>
          <div class="content-meta">Повторений: ${reps} · Следующее: ${nextDate}</div>
        </div>
        ${isDue?`<span class="accordion-badge has-video" style="background:#fff3cd;color:#b8860b">Нужно повторить</span>`
                :`<span class="accordion-badge has-text">✓ Готово</span>`}
      </div>`;
    }).join('');
  }

  // Show/hide session
  document.getElementById('repeat-session').style.display='none';
  document.getElementById('repeat-all-done').style.display='none';
}

function startRepeatSession(){
  const sid = currentUser.id;
  _repQueue = getDueItems(sid);
  _repIndex = 0;
  if(!_repQueue.length){
    document.getElementById('repeat-session').style.display='none';
    document.getElementById('repeat-all-done').style.display='block';
    return;
  }
  document.getElementById('repeat-due-banner').style.display='none';
  showRepeatCard();
}

function showRepeatCard(){
  if(_repIndex >= _repQueue.length){
    document.getElementById('repeat-session').style.display='none';
    document.getElementById('repeat-all-done').style.display='block';
    renderRepeatPage();
    return;
  }
  const c = _repQueue[_repIndex];
  document.getElementById('repeat-session').style.display='block';
  document.getElementById('repeat-all-done').style.display='none';
  document.getElementById('repeat-progress-label').textContent=`Карточка ${_repIndex+1} из ${_repQueue.length}`;
  document.getElementById('repeat-card-title').textContent=c.title;
  // Body
  const bodyEl=document.getElementById('repeat-card-body');
  bodyEl.style.display=c.body?'block':'none';
  bodyEl.textContent=c.body||'';
  // Video
  const videoUrl=c.videoUrl||'';
  const embedUrl=videoUrl?getVideoEmbedUrl(videoUrl):'';
  const videoWrap=document.getElementById('repeat-card-video');
  if(embedUrl){
    document.getElementById('repeat-iframe').src=embedUrl;
    videoWrap.style.display='block';
  } else {
    document.getElementById('repeat-iframe').src='';
    videoWrap.style.display='none';
  }
  // Files
  const filesEl=document.getElementById('repeat-card-files');
  const files=c.files||[];
  filesEl.innerHTML=files.length?`<div style="display:flex;flex-direction:column;gap:6px">${files.map(f=>`
    <a href="${safeUrl(f.url)}" target="_blank" rel="noopener noreferrer" class="content-item" style="text-decoration:none;color:inherit">
      <div class="content-icon">${f.type==='pdf'?'📄':'📋'}</div>
      <div class="content-info"><div class="content-name">${esc(f.name||'Файл')}</div></div>
      <div style="color:var(--green-mid);font-size:0.85rem">⬇ Открыть</div>
    </a>`).join('')}</div>`:'';
}

function rateCard(rating){
  if(_repIndex >= _repQueue.length) return;
  const c = _repQueue[_repIndex];
  srRateItem(currentUser.id, c.id, rating);
  _repIndex++;
  showRepeatCard();
}

function updateRepeatBadge(count){
  document.querySelectorAll('#nav-student-repeat').forEach(el=>{
    const existing = el.querySelector('.rep-badge');
    if(existing) existing.remove();
    if(count>0){
      el.insertAdjacentHTML('beforeend',`<span class="rep-badge">${count}</span>`);
    }
  });
}


// ══════════════════════════════════════════════
// ПРОБНИК (TRIAL EXAM)
// ══════════════════════════════════════════════

// ── BUILDER STATE ──
let _trialSections = []; // [{id, title, questions:[]}]

function addTrialSection(){
  const id = 'ts_'+Date.now();
  _trialSections.push({id, title:'Часть 1', questions:[]});
  renderTrialBuilder();
}
function removeTrialSection(idx){
  _trialSections.splice(idx,1);
  renderTrialBuilder();
}
function addTrialQuestion(sIdx, type){
  _trialSections[sIdx].questions.push(initQuestion('tq_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), type));
  renderTrialBuilder();
}
function removeTrialQuestion(sIdx, qIdx){
  _trialSections[sIdx].questions.splice(qIdx,1);
  renderTrialBuilder();
}
function renderTrialBuilder(){
  const el = document.getElementById('ntr-sections-list');
  if(!el) return;
  let totalPts = 0;
  _trialSections.forEach(s=>s.questions.forEach(q=>totalPts+=(+q.points||1)));
  const maxEl = document.getElementById('ntr-maxpts');
  if(maxEl) maxEl.value = totalPts || 100;

  el.innerHTML = _trialSections.map((sec,si)=>{
    const secPts = sec.questions.reduce((a,q)=>a+(+q.points||1),0);
    return `<div class="trial-section-builder">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <input style="flex:1;min-width:160px;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-weight:700;font-size:0.9rem;background:var(--white)"
          placeholder="Название раздела (напр. Часть 1)" value="${(sec.title||'').replace(/"/g,'&quot;')}"
          oninput="_trialSections[${si}].title=this.value">
        <span class="trial-pts-badge">⭐ ${secPts} б.</span>
        <button class="btn btn-red btn-sm" onclick="removeTrialSection(${si})">🗑</button>
      </div>
      <div id="trial-sec-qs-${si}">
        ${sec.questions.map((q,qi)=>trialQuestionBuilderHTML(si,qi,q)).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <select onchange="if(this.value){addTrialQuestion(${si},this.value);this.value=''}" style="padding:6px 10px;border-radius:8px;border:1.5px solid var(--green-mid);font-family:Nunito,sans-serif;font-size:0.81rem;background:var(--white);color:var(--green-deep);font-weight:700;cursor:pointer">
          <option value="">➕ Добавить вопрос...</option>
          <option value="auto">⚡ Один правильный (авто)</option>
          <option value="multi">☑️ Несколько правильных</option>
          <option value="open">📝 Открытый (текст)</option>
          <option value="fill">🔤 Вставка слова</option>
          <option value="match">🔗 Соответствие</option>
          <option value="pairs">🧩 Найти пары</option>
          <option value="order">📊 По порядку</option>
        </select>
      </div>
    </div>`;
  }).join('');
}
function trialQuestionBuilderHTML(si, qi, q){
  const imgTabId  = `tr-img-${si}-${qi}`;
  const imgUrlId  = `${imgTabId}-url-input`;
  const imgFileId = `${imgTabId}-file-input`;
  const imgPreId  = `${imgTabId}-preview`;
  const isDataUrl = q.imageUrl && q.imageUrl.startsWith('data:');

  const imgUrlBlock = `<input id="${imgUrlId}"
    style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;background:var(--white)"
    placeholder="https://example.com/image.jpg"
    value="${isDataUrl ? '' : (q.imageUrl||'').replace(/"/g,'&quot;')}"
    oninput="_trialSections[${si}].questions[${qi}].imageUrl=this.value;updateQImgPreview('${imgPreId}',this.value)">`;

  const imgFileBlock = `<input type="file" id="${imgFileId}" accept="image/*"
    style="width:100%;font-size:0.83rem;padding:6px"
    onchange="handleTrialQImgUpload(this,${si},${qi},'${imgPreId}')">`;

  const imgPreview = q.imageUrl
    ? `<img id="${imgPreId}" class="q-img-preview" src="${safeUrl(q.imageUrl)}" alt="">`
    : `<img id="${imgPreId}" class="q-img-preview" style="display:none" src="" alt="">`;

  return `<div style="background:var(--white);border:1px solid var(--green-xpale);border-radius:10px;padding:12px;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <span style="font-size:0.75rem;font-weight:700;color:var(--text3);text-transform:uppercase">${{auto:'⚡ Авто',multi:'☑️ Несколько',open:'📝 Открытый',fill:'🔤 Вставка',match:'🔗 Соответствие',pairs:'🧩 Пары',order:'📊 Порядок'}[q.type]||q.type}</span>
      <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
        <label style="font-size:0.75rem;color:var(--text3)">Баллов:</label>
        <input class="trial-q-pts" type="number" min="0.5" step="0.5" value="${+q.points||1}"
          oninput="_trialSections[${si}].questions[${qi}].points=+this.value||1;renderTrialBuilder()">
        <button class="btn btn-red btn-sm" onclick="removeTrialQuestion(${si},${qi})">✕</button>
      </div>
    </div>
    <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;margin-bottom:6px;background:var(--bg)"
      placeholder="Текст вопроса..." value="${(q.text||'').replace(/"/g,'&quot;')}"
      oninput="_trialSections[${si}].questions[${qi}].text=this.value">
    ${q.type==='auto'?`
      <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;margin-bottom:6px;background:var(--bg)"
        placeholder="Варианты через запятую: А,Б,В,Г" value="${(q.options||[]).join(',').replace(/"/g,'&quot;')}"
        oninput="_trialSections[${si}].questions[${qi}].options=this.value.split(',').map(s=>s.trim())">
      <input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;margin-bottom:6px;background:var(--bg)"
        placeholder="Правильный ответ" value="${(q.correct||'').replace(/"/g,'&quot;')}"
        oninput="_trialSections[${si}].questions[${qi}].correct=this.value">
    `:''}
    <div class="q-img-row">
      <label>🖼 Картинка к вопросу (необязательно)</label>
      <div class="q-img-tabs">
        <div class="q-img-tab ${!isDataUrl?'active':''}" onclick="switchImgTab('${imgTabId}','url')">Ссылка</div>
        <div class="q-img-tab ${isDataUrl?'active':''}" onclick="switchImgTab('${imgTabId}','file')">Загрузить</div>
      </div>
      <div id="${imgTabId}-url" style="${isDataUrl?'display:none':''}">${imgUrlBlock}</div>
      <div id="${imgTabId}-file" style="${isDataUrl?'':'display:none'}">${imgFileBlock}</div>
      ${imgPreview}
    </div>
  </div>`;
}

function handleTrialQImgUpload(input, si, qi, previewId){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _trialSections[si].questions[qi].imageUrl = e.target.result;
    updateQImgPreview(previewId, e.target.result);
  };
  reader.readAsDataURL(file);
}

function saveTrial(){
  try{ requireAdmin('saveTrial'); } catch(e){ return; }
  const title = document.getElementById('ntr-title').value.trim();
  const subject = document.getElementById('ntr-subject').value.trim();
  const timeMins = +(document.getElementById('ntr-time').value)||180;
  const passThresh = +(document.getElementById('ntr-pass').value)||55;
  const instruction = document.getElementById('ntr-instruction').value.trim();
  if(!title){ showNotif('Введите название пробника'); return; }
  if(!_trialSections.length || !_trialSections.some(s=>s.questions.length)){
    showNotif('Добавьте хотя бы один раздел с вопросами'); return;
  }
  const openAt=document.getElementById('ntr-open-at')?.value||'';
  const closeAt=document.getElementById('ntr-close-at')?.value||'';
  const sids=getCheckedModalStudents('modal-trial-students');
  const gradeConfig={5:+(document.getElementById('ntr-g5').value)||85,4:+(document.getElementById('ntr-g4').value)||67,3:+(document.getElementById('ntr-g3').value)||45,2:0};
  const allQ=_trialSections.flatMap(s=>s.questions);
  const maxPts=allQ.reduce((a,q)=>a+(+q.points||1),0);
  const trials=load('trials')||[];
  const tBase={title,subject,timeMins,passThresh,instruction,sections:[..._trialSections.map(s=>({...s,questions:[...s.questions]}))],maxPts,gradeConfig,date:new Date().toLocaleDateString('ru'),submitted:false,answers:{},autoScore:0,autoTotal:maxPts,openAt,closeAt};
  if(sids.length){
    sids.forEach(sid=>trials.push({...tBase,id:'tr_'+Date.now()+'_'+sid,studentId:sid,isLibrary:false}));
  } else {
    trials.push({...tBase,id:'tr_'+Date.now()+'_lib',studentId:null,isLibrary:true});
  }
  save('trials',trials);
  if(sids.length) sids.forEach(sid=>addNotif(sid,{type:'trial',text:`🧪 Новый пробник: ${title}`,nav:'student-trial'}));
  _trialSections=[];
  ['ntr-sections-list'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
  ['ntr-title','ntr-subject','ntr-instruction','ntr-open-at','ntr-close-at'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  closeModal('modal-create-trial');
  renderTrialAdmin();
  showNotif(sids.length?`✅ Пробник отправлен ${sids.length>1?sids.length+' ученикам':'1 ученику'}`:' Пробник сохранён в библиотеку');
}

// ── ADMIN RENDER ──
let _trialSelectedSid='all';
function renderTrialAdmin(){
  const students=(load('users')||[]).filter(u=>u.role==='student');
  const allTrials=(load('trials')||[]).slice().reverse();
  const chipsEl=document.getElementById('trial-student-chips');
  if(chipsEl){
    chipsEl.innerHTML=[
      `<div class="student-chip ${_trialSelectedSid==='all'?'active':''}" onclick="_trialSelectedSid='all';renderTrialAdmin()">👥 Все ученики</div>`,
      ...students.map(s=>`<div class="student-chip ${_trialSelectedSid===s.id?'active':''}" onclick="_trialSelectedSid='${s.id}';renderTrialAdmin()">${esc(s.name)}</div>`)
    ].join('');
  }
  const el=document.getElementById('trial-admin-list');
  if(!el) return;
  const sids = _trialSelectedSid==='all' ? students.map(s=>s.id) : [_trialSelectedSid];
  if(_trialSelectedSid==='all'){
    let html='';
    students.forEach(s=>{
      const st=allTrials.filter(t=>t.studentId===s.id);
      html+=`<div class="card" style="margin-bottom:14px">
        <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${esc(s.name)}
          <span style="font-weight:400;font-size:0.8rem;color:var(--text3);margin-left:8px">${st.length} пробников · ${st.filter(t=>t.submitted).length} пройдено</span>
        </div>
        ${st.length?st.map(t=>trialAdminItemHTML(t)).join(''):'<div style="color:var(--text3);font-size:0.83rem">Нет пробников</div>'}
      </div>`;
    });
    el.innerHTML=html||emptyHTML();
  } else {
    const st=allTrials.filter(t=>t.studentId===_trialSelectedSid);
    const s=students.find(s=>s.id===_trialSelectedSid);
    el.innerHTML=`<div class="card"><div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?esc(s.name):'Ученик'}</div>
      ${st.length?st.map(t=>trialAdminItemHTML(t)).join(''):emptyHTML()}</div>`;
  }
  renderTrialOpenAnswers();
  renderPendingReviewBanner('trial', 'trial-pending-banner');
  // Library
  const _libTrials=(load('trials')||[]).filter(t=>t.isLibrary);
  if(_libTrials.length){
    const _lEl=document.getElementById('trial-admin-list');
    if(_lEl) _lEl.insertAdjacentHTML('beforeend',libSection('📚 Библиотека — не отправлено',_libTrials.length,_libTrials.map(t=>trialAdminItemHTML(t)).join('')));
  }
}
function trialAdminItemHTML(t){
  const pct = t.autoTotal ? Math.round(t.autoScore/t.autoTotal*100) : 0;
  const allQ = (t.sections||[]).flatMap(s=>s.questions);
  const hasOpen = allQ.some(q=>q.type==='open');
  const openUnchecked = t.submitted
    ? allQ.filter(q=>q.type==='open' && t.answers && t.answers[q.id] && !q.checked)
    : [];
  const needsReview = t.submitted && !t.openChecked && openUnchecked.length > 0;
  const fullyChecked = t.submitted && (!hasOpen || t.openChecked || openUnchecked.length === 0);
  const statusBadge = !t.submitted
    ? `<span class="badge badge-gold">⏳ Не пройден</span>`
    : fullyChecked
      ? `<span class="badge badge-green">✅ Проверено · ${t.autoScore||0}/${t.autoTotal||0} б.${t.autoTotal?' · '+pct+'%':''}</span>`
      : `<span class="badge" style="background:#fde8e6;color:#c0392b;border-color:#f5c6c1">🔴 На проверке (${openUnchecked.length} отв.)</span>`;
  return `<div class="content-item" style="flex-direction:column;align-items:stretch${needsReview?';border-left:3px solid #ef4444':''}">
    <div style="display:flex;align-items:center;gap:14px">
      <div class="content-icon">🎯</div>
      <div class="content-info">
        <div class="content-name">${esc(t.title)}</div>
        <div class="content-meta">${t.subject||''} · ⏱ ${t.timeMins} мин · ⭐ ${t.maxPts} б. · ${t.date}</div>
        <div style="margin-top:4px">${statusBadge}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
        ${needsReview ? `<button class="btn btn-green btn-sm" onclick="openTrialReviewPanel('${t.id}')" style="font-weight:700">✅ Проверить</button>` : ''}
        ${t.submitted?`<button class="btn btn-gold btn-sm" onclick="openItemOverallReview('${t.id}','trial')" title="Итоговая оценка и отзыв">🎓 Оценка</button>`:''}
        ${t.submitted?`<button class="btn btn-outline btn-sm" onclick="viewTrialResult('${t.id}')">📊</button>`:''}
        <button class="btn btn-outline btn-sm" onclick="openAssignStudents('trial','${t.id}')" title="Отправить ученикам">👤</button>
        <button class="btn btn-outline btn-sm" onclick="openEditAvail('trial','${t.id}')" title="Доступность">⏰</button>
        <button class="btn btn-outline btn-sm" onclick="openEditTrial('${t.id}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="deleteTrial('${t.id}')">🗑</button>
      </div>
    </div>
    ${t.autoGrade?`<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="grade-result-badge grade-${t.autoGrade}">🎓 Оценка: ${t.autoGrade}</span>
      ${t.autoPct!=null?`<span class="badge badge-green">${t.autoScore||0}/${t.autoTotal||0} б. · ${t.autoPct}%</span>`:''}
      ${t.teacherFeedback?`<span style="font-size:0.8rem;color:var(--text2)">💬 ${esc(t.teacherFeedback.substring(0,60))}${t.teacherFeedback.length>60?'…':''}</span>`:''}
    </div>`:''}
    <div style="margin-top:2px">${availBadge(t)}</div>
    ${needsReview ? `<div id="trial-review-panel-${t.id}" style="display:none;margin-top:10px;padding:12px;background:var(--bg2);border-radius:10px;border:1px solid #f5c6c1">
      <div style="font-weight:700;font-size:0.85rem;color:var(--accent);margin-bottom:8px">📋 Ответы на открытые вопросы</div>
      ${openUnchecked.map(q=>`
        <div style="background:var(--white);border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid var(--green-xpale)">
          <div style="font-size:0.83rem;font-weight:700;color:var(--accent);margin-bottom:4px">${escHtml(q.text)}</div>
          <div style="font-size:0.85rem;background:var(--bg);border-radius:6px;padding:8px;margin-bottom:8px;color:var(--text2)">${t.answers[q.id]||'—'}</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="number" id="pts-tr-${t.id}-${q.id}" min="0" max="${+q.points||1}" step="0.5" value="0"
              style="width:70px;padding:5px 8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;text-align:center;font-size:0.85rem">
            <label style="font-size:0.8rem;color:var(--text3)">/ ${+q.points||1} б.</label>
            <button class="btn btn-green btn-sm" onclick="checkTrialOpenAnswer('${t.id}','${q.id}')">✅ Зачесть</button>
          </div>
        </div>`).join('')}
      <div style="margin-top:10px;border-top:1px solid var(--green-xpale);padding-top:10px">
        <button class="btn btn-gold btn-sm" onclick="openItemOverallReview('${t.id}','trial')">🎓 Поставить итоговую оценку и отзыв</button>
      </div>
    </div>` : ''}

  </div>`;
}
function deleteTrial(id){
  requireAdmin('deleteTrial'); save('trials',(load('trials')||[]).filter(t=>t.id!==id)); renderTrialAdmin(); }

// ── EDIT TRIAL ──
let _editTrialSections = [];
let _editTrialId = null;
let _editTrialMaxPtsManual = false;

function openEditTrial(id){
  const t=(load('trials')||[]).find(t=>t.id===id);
  if(!t) return;
  _editTrialId = id;
  _editTrialMaxPtsManual = false;
  _editTrialSections = JSON.parse(JSON.stringify(t.sections||[]));

  document.getElementById('etr-id').value = id;
  document.getElementById('etr-title').value = t.title||'';
  document.getElementById('etr-subject').value = t.subject||'';
  document.getElementById('etr-time').value = t.timeMins||180;
  document.getElementById('etr-pass').value = t.passThresh||55;
  document.getElementById('etr-instruction').value = t.instruction||'';
  const gc = t.gradeConfig||{};
  document.getElementById('etr-g5').value = gc[5]??85;
  document.getElementById('etr-g4').value = gc[4]??67;
  document.getElementById('etr-g3').value = gc[3]??45;
  document.getElementById('etr-max-attempts').value = t.maxAttempts??0;
  document.getElementById('etr-grade-mode').value = t.gradeMode||'best';

  // Reset maxpts to readonly auto mode
  const maxEl = document.getElementById('etr-maxpts');
  const btn   = document.getElementById('etr-maxpts-btn');
  const hint  = document.getElementById('etr-maxpts-hint');
  maxEl.setAttribute('readonly','');
  maxEl.style.background='var(--bg)'; maxEl.style.color='var(--text3)';
  if(btn)  btn.textContent='✏️ Изменить';
  if(hint) hint.textContent='(считается автоматически из вопросов)';

  renderEditTrialBuilder();
  _setDirty(false);
  document.getElementById('modal-edit-trial').classList.add('open');
}

function toggleEditTrialMaxPts(){
  _editTrialMaxPtsManual = !_editTrialMaxPtsManual;
  const input = document.getElementById('etr-maxpts');
  const btn   = document.getElementById('etr-maxpts-btn');
  const hint  = document.getElementById('etr-maxpts-hint');
  if(_editTrialMaxPtsManual){
    input.removeAttribute('readonly');
    input.style.background='var(--white)'; input.style.color='var(--accent)';
    input.focus();
    btn.textContent='🔄 Авто';
    hint.textContent='(задан вручную)';
  } else {
    input.setAttribute('readonly','');
    input.style.background='var(--bg)'; input.style.color='var(--text3)';
    btn.textContent='✏️ Изменить';
    hint.textContent='(считается автоматически из вопросов)';
    renderEditTrialBuilder();
  }
}

function addEditTrialSection(){
  _setDirty(true);
  _editTrialSections.push({id:'ts_'+Date.now(), title:'Часть '+(+_editTrialSections.length+1), questions:[]});
  renderEditTrialBuilder();
}
function removeEditTrialSection(idx){
  _setDirty(true);
  _editTrialSections.splice(idx,1);
  renderEditTrialBuilder();
}
function addEditTrialQuestion(sIdx, type){
  _setDirty(true);
  _editTrialSections[sIdx].questions.push(initQuestion('tq_'+Date.now(), type));
  renderEditTrialBuilder();
}
function removeEditTrialQuestion(sIdx, qIdx){
  _setDirty(true);
  _editTrialSections[sIdx].questions.splice(qIdx,1);
  renderEditTrialBuilder();
}

function renderEditTrialBuilder(){
  const el = document.getElementById('etr-sections-list');
  if(!el) return;
  let totalPts = 0;
  _editTrialSections.forEach(s=>s.questions.forEach(q=>totalPts+=(+q.points||1)));
  if(!_editTrialMaxPtsManual){
    const maxEl = document.getElementById('etr-maxpts');
    if(maxEl) maxEl.value = totalPts||0;
  }
  el.innerHTML = _editTrialSections.map((sec,si)=>{
    const secPts = sec.questions.reduce((a,q)=>a+(+q.points||1),0);
    return `<div class="trial-section-builder">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <input style="flex:1;min-width:160px;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-weight:700;font-size:0.9rem;background:var(--white)"
          placeholder="Название раздела" value="${(sec.title||'').replace(/"/g,'&quot;')}"
          oninput="_editTrialSections[${si}].title=this.value">
        <span class="trial-pts-badge">⭐ ${secPts} б.</span>
        <button class="btn btn-red btn-sm" onclick="removeEditTrialSection(${si})">🗑</button>
      </div>
      ${sec.questions.map((q,qi)=>editTrialQuestionHTML(si,qi,q)).join('')}
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-outline btn-sm" onclick="addEditTrialQuestion(${si},'auto')">⚡ Выбор</button>
        <button class="btn btn-outline btn-sm" onclick="addEditTrialQuestion(${si},'multi')">☑️ Несколько</button>
        <button class="btn btn-outline btn-sm" onclick="addEditTrialQuestion(${si},'open')">📝 Открытый</button>
        <button class="btn btn-outline btn-sm" onclick="addEditTrialQuestion(${si},'fillin')">✏️ Вставить слово</button>
        <button class="btn btn-outline btn-sm" onclick="addEditTrialQuestion(${si},'match')">🔗 Соответствие</button>
        <button class="btn btn-outline btn-sm" onclick="addEditTrialQuestion(${si},'order')">🔢 Порядок</button>
      </div>
    </div>`;
  }).join('');
}

function editTrialQuestionHTML(si, qi, q){
  const imgTabId = `etr-img-${si}-${qi}`;
  const imgPreId = `${imgTabId}-preview`;
  const isDataUrl = q.imageUrl && q.imageUrl.startsWith('data:');

  let typeBody = '';
  if(q.type==='auto') typeBody = `
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:3px">Варианты (через запятую):</div>
    <input style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;margin-bottom:5px;background:var(--bg)"
      placeholder="А,Б,В,Г" value="${(q.options||[]).join(',').replace(/"/g,'&quot;')}"
      oninput="_editTrialSections[${si}].questions[${qi}].options=this.value.split(',').map(x=>x.trim())">
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:3px">Правильный ответ:</div>
    <input style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;background:var(--bg)"
      placeholder="А" value="${(q.correct||'').replace(/"/g,'&quot;')}"
      oninput="_editTrialSections[${si}].questions[${qi}].correct=this.value">`;
  else if(q.type==='multi') typeBody = `
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:3px">Варианты (через запятую):</div>
    <input style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;margin-bottom:5px;background:var(--bg)"
      placeholder="А,Б,В,Г,Д" value="${(q.options||[]).join(',').replace(/"/g,'&quot;')}"
      oninput="_editTrialSections[${si}].questions[${qi}].options=this.value.split(',').map(x=>x.trim())">
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:3px">Правильные ответы (через запятую):</div>
    <input style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;background:var(--bg)"
      placeholder="А,В" value="${(Array.isArray(q.correct)?q.correct.join(','):q.correct||'').replace(/"/g,'&quot;')}"
      oninput="_editTrialSections[${si}].questions[${qi}].correct=this.value.split(',').map(x=>x.trim())">`;
  else if(q.type==='fillin') typeBody = `
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:3px">Текст с пропуском (___):</div>
    <input style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;margin-bottom:5px;background:var(--bg)"
      placeholder="В состав АТФ входят: ___, рибоза, аденин" value="${(q.text||'').replace(/"/g,'&quot;')}"
      oninput="_editTrialSections[${si}].questions[${qi}].text=this.value">
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:3px">Правильное слово:</div>
    <input style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;background:var(--bg)"
      placeholder="фосфат" value="${(q.correct||'').replace(/"/g,'&quot;')}"
      oninput="_editTrialSections[${si}].questions[${qi}].correct=this.value">`;
  else if(q.type==='match') typeBody = `
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:3px">Пары (левое → правое, каждая строка):</div>
    <textarea style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;min-height:80px;resize:vertical;background:var(--bg)"
      placeholder="Митохондрия → Энергия&#10;Рибосома → Белок"
      oninput="_editTrialSections[${si}].questions[${qi}].pairs=this.value.split('\\n').filter(l=>l.includes('→')).map(l=>{const[a,b]=l.split('→');return{left:(a||'').trim(),right:(b||'').trim()}})"
    >${(q.pairs||[]).map(p=>p.left+' → '+p.right).join('\n').replace(/</g,'&lt;')}</textarea>`;
  else if(q.type==='order') typeBody = `
    <div style="font-size:0.75rem;color:var(--text3);margin-bottom:3px">Элементы в правильном порядке (каждый с новой строки):</div>
    <textarea style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;min-height:80px;resize:vertical;background:var(--bg)"
      placeholder="Интерфаза&#10;Профаза&#10;Метафаза&#10;Анафаза&#10;Телофаза"
      oninput="_editTrialSections[${si}].questions[${qi}].items=this.value.split('\\n').map(x=>x.trim()).filter(Boolean)"
    >${(q.items||[]).join('\n').replace(/</g,'&lt;')}</textarea>`;

  const showText = q.type !== 'fillin';

  return `<div style="background:var(--white);border:1px solid var(--green-xpale);border-radius:10px;padding:12px;margin-bottom:8px;border-left:3px solid var(--green-light)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <span style="font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase">${qTypeLabel(q.type)}</span>
      <span style="font-size:0.68rem;font-weight:700;color:${isAutoScored(q.type)?'var(--green-mid)':'var(--gold)'}">
        ${isAutoScored(q.type)?'✅ Авто':'👁 Вручную'}</span>
      <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
        <label style="font-size:0.72rem;color:var(--text3)">Б:</label>
        <input class="trial-q-pts" type="number" min="0.5" step="0.5" value="${+q.points||1}"
          oninput="_editTrialSections[${si}].questions[${qi}].points=+this.value||1;renderEditTrialBuilder()">
        <button class="btn btn-red btn-sm" onclick="removeEditTrialQuestion(${si},${qi})">✕</button>
      </div>
    </div>
    ${showText?`<input style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem;margin-bottom:6px;background:var(--bg)"
      placeholder="Текст вопроса..." value="${(q.text||'').replace(/"/g,'&quot;')}"
      oninput="_editTrialSections[${si}].questions[${qi}].text=this.value">`:''}
    ${typeBody}
    <div class="q-img-row" style="margin-top:8px">
      <label style="font-size:0.72rem;color:var(--text3)">🖼 Картинка (необязательно)</label>
      <div class="q-img-tabs">
        <div class="q-img-tab ${!isDataUrl?'active':''}" onclick="switchImgTab('${imgTabId}','url')">Ссылка</div>
        <div class="q-img-tab ${isDataUrl?'active':''}" onclick="switchImgTab('${imgTabId}','file')">Загрузить</div>
      </div>
      <div id="${imgTabId}-url" style="${isDataUrl?'display:none':''}">
        <input id="${imgTabId}-url-input" style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.82rem;background:var(--white)"
          placeholder="https://..." value="${isDataUrl?'':(q.imageUrl||'').replace(/"/g,'&quot;')}"
          oninput="_editTrialSections[${si}].questions[${qi}].imageUrl=this.value;updateQImgPreview('${imgPreId}',this.value)">
      </div>
      <div id="${imgTabId}-file" style="${isDataUrl?'':'display:none'}">
        <input type="file" id="${imgTabId}-file-input" accept="image/*" style="width:100%;font-size:0.8rem"
          onchange="handleEditTrialQImgUpload(this,${si},${qi},'${imgPreId}')">
      </div>
      ${q.imageUrl?`<img id="${imgPreId}" class="q-img-preview" src="${safeUrl(q.imageUrl)}" alt="">`:`<img id="${imgPreId}" class="q-img-preview" style="display:none" src="" alt="">`}
    </div>
  </div>`;
}

function handleEditTrialQImgUpload(input, si, qi, previewId){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{ _editTrialSections[si].questions[qi].imageUrl=e.target.result; updateQImgPreview(previewId,e.target.result); };
  reader.readAsDataURL(file);
}

function saveEditTrial(){
  try{ requireAdmin('saveEditTrial'); } catch(e){ return; }
  const title=document.getElementById('etr-title').value.trim();
  if(!title){ showNotif('Введите название'); return; }
  if(!_editTrialSections.some(s=>s.questions.length)){ showNotif('Добавьте хотя бы один вопрос'); return; }
  const trials=load('trials')||[];
  const t=trials.find(t=>t.id===_editTrialId);
  if(!t) return;
  t.title=title;
  t.subject=document.getElementById('etr-subject').value.trim();
  t.timeMins=+(document.getElementById('etr-time').value)||180;
  t.passThresh=+(document.getElementById('etr-pass').value)||55;
  t.instruction=document.getElementById('etr-instruction').value.trim();
  t.gradeConfig={5:+(document.getElementById('etr-g5').value)||85, 4:+(document.getElementById('etr-g4').value)||67, 3:+(document.getElementById('etr-g3').value)||45, 2:0};
  t.maxAttempts=+(document.getElementById('etr-max-attempts').value)||0;
  t.gradeMode=document.getElementById('etr-grade-mode').value||'best';
  t.sections=JSON.parse(JSON.stringify(_editTrialSections));
  const allQ=_editTrialSections.flatMap(s=>s.questions);
  const autoPts=_editTrialMaxPtsManual
    ? +(document.getElementById('etr-maxpts').value)||t.maxPts
    : allQ.reduce((a,q)=>a+(+q.points||1),0);
  t.maxPts=autoPts;
  t.autoTotal=allQ.filter(q=>q.type==='auto').reduce((a,q)=>a+(+q.points||1),0)||autoPts;
  save('trials',trials);
  _setDirty(false);
  closeModal('modal-edit-trial', true);
  renderTrialAdmin();
  showNotif('✅ Пробник обновлён');
}

function renderTrialOpenAnswers(){
  const students=(load('users')||[]).filter(u=>u.role==='student');
  const sids=_trialSelectedSid==='all'?students.map(s=>s.id):[_trialSelectedSid];
  const trials=(load('trials')||[]).filter(t=>sids.includes(t.studentId)&&t.submitted);
  const el=document.getElementById('trial-open-answers-list');
  let html='';
  trials.forEach(t=>{
    const allQ=(t.sections||[]).flatMap(s=>s.questions);
    allQ.filter(q=>q.type==='open'&&t.answers&&t.answers[q.id]&&!q.checked).forEach(q=>{
      html+=`<div class="question-block">
        <div class="question-num">Пробник: ${esc(t.title)}</div>
        <div class="question-text">${escHtml(q.text)}</div>
        <div class="feedback-box"><strong>Ответ:</strong> ${t.answers[q.id]||'—'}</div>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
          <input type="number" id="pts-tr-${t.id}-${q.id}" min="0" max="${+q.points||1}" step="0.5" value="0"
            style="width:80px;padding:6px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;text-align:center">
          <label style="font-size:0.8rem;color:var(--text3)">/ ${+q.points||1} б.</label>
          <button class="btn btn-green btn-sm" onclick="checkTrialOpenAnswer('${t.id}','${q.id}')">✅ Зачесть</button>
        </div>
      </div>`;
    });
  });
  el.innerHTML=html||'<div class="empty-state"><p>Нет ответов для проверки</p></div>';
}
function checkTrialOpenAnswer(tid,qid){
  const trials=load('trials')||[];
  const t=trials.find(t=>t.id===tid); if(!t) return;
  const pts=+(document.getElementById(`pts-tr-${tid}-${qid}`)?.value)||0;
  const allQ=(t.sections||[]).flatMap(s=>s.questions);
  // Mark this question checked
  allQ.forEach(q=>{ if(q.id===qid){ q.checked=true; q.earnedPts=pts; q.grade=pts; } });
  const openDone=allQ.filter(q=>q.type==='open').every(q=>q.checked);
  t.openChecked=openDone;
  // Recalculate total score from scratch: auto + all checked open
  const autoBaseScore=allQ.filter(q=>q.type!=='open').reduce((a,q)=>a+(+q.earnedPts||0),0);
  const openScore=allQ.filter(q=>q.type==='open'&&q.checked).reduce((a,q)=>a+(q.earnedPts||0),0);
  // t.autoScore was set at submit time for auto questions — keep it, just add open
  // Recompute: store openScore separately to avoid double-adding
  t.openScore=openScore;
  const totalScore=(t.autoScoreBase||t.autoScore||0)+openScore;
  t.autoScore=totalScore;
  if(t.autoTotal){ const pct=Math.round(totalScore/t.autoTotal*100); t.autoPct=pct; }
  // НЕ ставим autoGrade — итоговую оценку преподаватель поставит отдельно через «Итоговая оценка»
  save('trials',trials);
  renderTrialAdmin();
  showNotif(`✅ Ответ засчитан: +${pts} б.${t.openChecked?' · Все открытые проверены — не забудьте поставить итоговую оценку!':''}`);}

function checkTestOpenAnswerInline(tid,qid){
  const tests=load('tests')||[];
  const t=tests.find(t=>t.id===tid); if(!t) return;
  const pts=+(document.getElementById(`pts-test-${tid}-${qid}`)?.value)||0;
  const allQ=t.questions||[];
  allQ.forEach(q=>{ if(q.id===qid){ q.checked=true; q.earnedPts=pts; q.grade=pts; } });
  const openDone=allQ.filter(q=>q.type==='open').every(q=>q.checked);
  t.openChecked=openDone;
  const openScore=allQ.filter(q=>q.type==='open'&&q.checked).reduce((s,q)=>s+(+q.earnedPts||0),0);
  t.openScore=openScore;
  const base=t.autoScoreBase!=null?t.autoScoreBase:(t.autoScore||0);
  const totalScore=base+openScore;
  t.autoScore=totalScore;
  if(t.autoTotal){ t.autoPct=Math.round(totalScore/t.autoTotal*100); }
  save('tests',tests);
  renderTestsAdmin();
  showNotif(`✅ Ответ засчитан: +${pts} б.${t.openChecked?' · Все открытые проверены — не забудьте поставить итоговую оценку!':''}`);}

function checkHWOpenAnswerInline(hwid,qid){
  const hws=load('hw')||[];
  const h=hws.find(h=>h.id===hwid); if(!h) return;
  const pts=+(document.getElementById(`pts-hw-${hwid}-${qid}`)?.value)||0;
  const allQ=h.questions||[];
  allQ.forEach(q=>{ if(q.id===qid){ q.checked=true; q.earnedPts=pts; q.grade=pts; } });
  const openDone=allQ.filter(q=>q.type==='open').every(q=>q.checked);
  h.openChecked=openDone;
  const openScore=allQ.filter(q=>q.type==='open'&&q.checked).reduce((s,q)=>s+(+q.earnedPts||0),0);
  h.openScore=openScore;
  const base=h.autoScoreBase!=null?h.autoScoreBase:(h.autoScore||0);
  const totalScore=base+openScore;
  h.autoScore=totalScore;
  if(h.autoTotal){ h.autoPct=Math.round(totalScore/h.autoTotal*100); }
  save('hw',hws);
  renderHWAdmin();
  showNotif(`✅ Ответ засчитан: +${pts} б.${h.openChecked?' · Все открытые проверены — не забудьте поставить итоговую оценку!':''}`);}

// ── OVERALL TRIAL REVIEW (grade + feedback for whole trial) ──
function openTrialOverallReview(tid){
  const trials=load('trials')||[];
  const t=trials.find(t=>t.id===tid); if(!t) return;
  const pct=t.autoTotal?Math.round((t.autoScore||0)/t.autoTotal*100):0;
  const grade=t.autoGrade||calcGrade(pct,t.gradeConfig)||'';
  const body=document.getElementById('check-answer-body');
  body.innerHTML=`
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:0.88rem;color:var(--text2)">
      <b>${esc(t.title)}</b><br>
      Автоматически: ${t.autoScore||0}/${t.autoTotal||0} б. (${pct}%)
    </div>
    <div class="form-group">
      <label>Итоговый балл <span style="font-weight:400;color:var(--text3)">(можно скорректировать вручную)</span></label>
      <div style="display:flex;align-items:center;gap:8px">
        <input type="number" id="ca-total-score" value="${t.autoScore||0}" min="0" max="${t.autoTotal||100}"
          style="width:90px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;text-align:center;font-size:1rem">
        <span style="color:var(--text3);font-size:0.88rem">/ ${t.autoTotal||'—'} б.</span>
      </div>
    </div>
    <div class="form-group">
      <label>📝 Отзыв для ученика <span style="font-weight:400;color:var(--text3)">(необязательно)</span></label>
      <textarea id="ca-final-feedback" rows="4" placeholder="Напишите общий комментарий, что получилось хорошо, что нужно доработать..."
        style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;resize:vertical;outline:none;box-sizing:border-box">${t.teacherFeedback||''}</textarea>
    </div>
    <button class="btn btn-green" onclick="saveTrialOverallReview('${tid}')">💾 Сохранить отзыв</button>
  `;
  document.getElementById('modal-check-answer').querySelector('.modal-title').textContent='📊 Итоговая оценка пробника';
  openModal('modal-check-answer');
}
function saveTrialOverallReview(tid){
  const trials=load('trials')||[];
  const t=trials.find(t=>t.id===tid); if(!t) return;
  const score=+(document.getElementById('ca-total-score').value)||0;
  const feedback=document.getElementById('ca-final-feedback').value.trim();
  t.autoScore=score;
  if(t.autoTotal){ t.autoPct=Math.round(score/t.autoTotal*100); }
  const grade=calcGrade(t.autoTotal?Math.round(score/t.autoTotal*100):0,t.gradeConfig)||'';
  t.autoGrade=grade;
  t.finalGrade=grade;   // итоговая оценка — ставится автоматически по %
  t.teacherFeedback=feedback;
  t.openChecked=true;
  save('trials',trials);
  const pctStr=t.autoTotal?` · ${score}/${t.autoTotal} б. (${t.autoPct}%)`:'';
  const notifs=load('notifs')||[];
  notifs.push({id:'n'+Date.now(),studentId:t.studentId,text:`🎓 Пробник «${t.title}» проверен. Итоговая оценка: ${grade}${pctStr}${feedback?' · Есть отзыв преподавателя':''}`,date:new Date().toLocaleDateString('ru'),read:false,nav:'student-trial'});
  save('notifs',notifs);
  closeModal('modal-check-answer');
  renderTrialAdmin();
  showNotif(`✅ Оценка ${grade} сохранена`);
}
// ── STUDENT RENDER ──
let _trialFilter='all';
function setTrialFilter(f,el){
  _trialFilter=f;
  document.querySelectorAll('.filter-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  renderStudentTrial();
}
function renderStudentTrial(){
  const sid=currentUser.id;
  let trials=(load('trials')||[]).filter(t=>t.studentId===sid).slice().reverse();
  if(_trialFilter==='pending') trials=trials.filter(t=>!t.submitted);
  if(_trialFilter==='done')    trials=trials.filter(t=>t.submitted);
  const el=document.getElementById('student-trial-list');
  if(!trials.length){ el.innerHTML=emptyHTML(); return; }
  el.innerHTML=trials.map(t=>{
    const pct=t.autoTotal?Math.round(t.autoScore/t.autoTotal*100):0;
    const allQ=(t.sections||[]).flatMap(s=>s.questions);
    const hasOpen=allQ.some(q=>q.type==='open');
    const fullyChecked=t.submitted&&(!hasOpen||t.openChecked);
    const statusIcon=!t.submitted?'⏳':fullyChecked?'✅':'🔍';
    const statusBadge=!t.submitted
      ?`<span class="badge badge-gold">⏳ Не пройден</span>`
      :fullyChecked
        ?`<span class="badge badge-green">✅ Проверено · ${t.autoScore||0}/${t.autoTotal||0} б. · ${pct}%${t.finalGrade?' · Оценка '+t.finalGrade:''}</span>`
        :`<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке · авто: ${t.autoScore||0}/${t.autoTotal||0} б.</span>`;
    const grade=t.finalGrade||null;   // показываем только оценку от преподавателя
    return `<div class="card collapsible-card" data-item-id="${t.id}">
      <div class="card-title collapsible collapsed" onclick="toggleCollapse('tr_${t.id}',this)">
        <span class="dot"></span>${statusIcon} ${esc(t.title)}
        ${grade&&t.submitted?`<span class="grade-result-badge grade-${grade}" style="font-size:0.7rem;padding:2px 8px;margin-left:4px">${grade}</span>`:''}
        <span class="collapse-arrow">▼</span>
      </div>
      <div class="card-collapse-body collapsed" id="cb-tr_${t.id}">
        <div style="font-size:0.85rem;color:var(--text3);margin-bottom:10px">
          ${t.subject?`📚 ${t.subject} · `:''}⏱ ${t.timeMins} мин · ⭐ ${t.maxPts} б.
          ${t.passThresh?` · Порог: ${t.passThresh}%`:''}
        </div>
        <div style="margin-bottom:12px">${statusBadge}</div>
        ${!t.submitted ? availGate(t,'startTrial') : viewTrialResultHTML(t)}
        <div id="cmt-trial-${t.id}"></div>
      </div>
    </div>`;
  }).join('');
  // Inject comment threads
  trials.filter(t=>t.submitted).forEach(t=>{
    const el2 = document.getElementById(`cmt-trial-${t.id}`);
    if(el2) renderCommentThread('trial', t.id, el2);
  });
}
// ── TAKING A TRIAL ──
let _activeTrial=null, _trialAnswers={}, _trialTimerInterval=null, _trialSecondsLeft=0;

function startTrial(id){
  const t=(load('trials')||[]).find(t=>t.id===id);
  if(!t) return;
  if(currentUser && currentUser.role==='student' && t.studentId && t.studentId!==currentUser.id){
    showNotif('⛔ Нет доступа к этому пробнику'); console.warn('IDOR attempt startTrial',id); return;
  }
  _activeTrial=t;
  _trialAnswers={};
  _trialSecondsLeft=t.timeMins*60;
  document.getElementById('trial-take-title').textContent=t.title;
  // Instruction
  const instrBar=document.getElementById('trial-instruction-bar');
  if(t.instruction){ instrBar.textContent='📋 '+t.instruction; instrBar.style.display='block'; }
  else instrBar.style.display='none';
  renderTrialTakeBody();
  updateTrialTimer();
  clearInterval(_trialTimerInterval);
  _trialTimerInterval=setInterval(()=>{
    _trialSecondsLeft--;
    updateTrialTimer();
    if(_trialSecondsLeft<=0){ clearInterval(_trialTimerInterval); submitTrial(true); }
  },1000);
  document.getElementById('modal-take-trial').classList.add('open');
}
function updateTrialTimer(){
  const m=Math.floor(_trialSecondsLeft/60), s=_trialSecondsLeft%60;
  const display=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const el=document.getElementById('trial-timer-display');
  if(el){ el.textContent=display; el.parentElement.className=_trialSecondsLeft<300?'timer-warning':''; }
}
function renderTrialTakeBody(){
  const allQ=(_activeTrial.sections||[]).flatMap(s=>s.questions);
  const answered=allQ.filter(q=>_trialAnswers[q.id]).length;
  document.getElementById('trial-progress-label').textContent=`${answered}/${allQ.length} ответов`;
  document.getElementById('trial-footer-stats').textContent=`Отвечено: ${answered} из ${allQ.length} · Итого: ${_activeTrial.maxPts} б.`;
  const body=document.getElementById('trial-take-body');
  body.innerHTML=(_activeTrial.sections||[]).map((sec,si)=>{
    const secPts=sec.questions.reduce((a,q)=>a+(+q.points||1),0);
    return `<div class="trial-section-header">📌 ${sec.title||'Раздел '+(si+1)}<span class="section-pts">⭐ ${secPts} б.</span></div>`+
    sec.questions.map((q,qi)=>{
      const globalIdx=(_activeTrial.sections||[]).slice(0,si).reduce((a,s)=>a+s.questions.length,0)+qi;
      return renderStudentQuestion(q,globalIdx,'_trialAnswers','selectTrialOpt');
    }).join('');
  }).join('');
}
function selectTrialOption(qId,opt){
  _trialAnswers[qId]=opt;
  renderTrialTakeBody();
}
function selectTrialOpt(qId,val,isMulti){
  if(isMulti){
    const cur=(_trialAnswers[qId]||'').split(',').map(s=>s.trim()).filter(Boolean);
    const idx=cur.indexOf(val);
    if(idx>=0) cur.splice(idx,1); else cur.push(val);
    _trialAnswers[qId]=cur.join(',');
  } else {
    _trialAnswers[qId]=val;
  }
  renderTrialTakeBody();
}
function submitTrial(timeout=false){
  clearInterval(_trialTimerInterval);
  const trials=load('trials')||[];
  const t=trials.find(t=>t.id===_activeTrial.id);
  if(!t){ showNotif('Ошибка: пробник не найден'); return; }
  t.submitted=true; t.answers={..._trialAnswers};
  let score=0, total=0;
  (t.sections||[]).forEach(s=>s.questions.forEach(q=>{
    const pts=+q.points||1;
    const ans=_trialAnswers[q.id]||'';
    if(q.type!=='open'){ total+=pts; if(scoreQuestion(q,ans)) score+=pts; }
  }));
  t.autoScore=score;
  t.autoTotal=t.maxPts||total; // maxPts = full trial max (auto+open), used as denominator
  t.autoScoreBase=score; // store auto-only score for later open question addition
  const pct=t.autoTotal?Math.round(score/t.autoTotal*100):0;
  // НЕ сохраняем autoGrade — итоговая оценка ставится только преподавателем
  t.autoPct=pct;
  save('trials',trials);
  _collectAndSaveWrongAnswersTrial(t, _trialAnswers);
  document.getElementById('modal-take-trial').classList.remove('open');
  renderStudentTrial();
  updateMistakesBadge();
  showNotif(timeout?`⏰ Время вышло! Авто: ${score}/${t.autoTotal} б.`:`✅ Пробник сдан! Авто: ${score}/${t.autoTotal} б. (${pct}%)`);
  // notify admin
_addAdminNotif({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'submit', text:`🧪 ${currentUser.name} сдал(а) пробник «${esc(t.title)}»${timeout?' (время вышло)':''}`, date:new Date().toLocaleDateString('ru'), read:false});
  updateAdminBadge();
}
function viewTrialResultHTML(t){
  const allQ=(t.sections||[]).flatMap(s=>s.questions);
  const pct=t.autoTotal?Math.round((t.autoScore||0)/t.autoTotal*100):0;
  return `<div style="margin-top:4px">
    <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="badge badge-blue">⭐ Авто-баллы: ${t.autoScore||0}/${t.autoTotal||0} б. (${pct}%)</span>
      ${t.finalGrade
        ?`<span class="grade-result-badge grade-${t.finalGrade}">🎓 Итоговая оценка: ${t.finalGrade}</span>`
        :`<span class="badge badge-gold">⏳ Итоговая оценка ожидает преподавателя</span>`}
    </div>
    ${t.teacherFeedback?`<div class="feedback-box" style="margin-bottom:10px"><strong>💬 Отзыв преподавателя:</strong><br>${esc(t.teacherFeedback)}</div>`:''}
    ${allQ.map(q=>renderReviewQuestion(q,t.answers||{})).join('')}
  </div>`;
}
function viewTrialResult(id){
  const t=(load('trials')||[]).find(t=>t.id===id);
  if(!t||!t.submitted) return;
  showNotif(`Пробник: ${t.autoScore}/${t.autoTotal} б. · ${t.autoPct||0}% · Оценка ${t.autoGrade||'—'}`);
}

// ══════════════════════════════════════════════
// БАЗА ЗАДАНИЙ (TASK BANK)
// ══════════════════════════════════════════════

function renderTaskBankAdmin(){
  const tasks = load('taskbank')||[];
  const el = document.getElementById('taskbank-list');
  const label = document.getElementById('taskbank-count-label');
  if(label) label.textContent = `${tasks.length} заданий в базе`;
  if(!el) return;
  if(!tasks.length){ el.innerHTML=`<div class="card">${emptyHTML()}</div>`; return; }
  const typeLabel = {open:'📝 Открытый', choice:'⚡ Выбор', short:'🔤 Точный ответ'};
  el.innerHTML = tasks.map((t,i)=>`
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0;margin-top:2px">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            ${t.subject?`<span style="font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">${t.subject}</span>`:''}
            ${t.part?`<span style="font-size:0.7rem;font-weight:600;color:var(--green-mid);background:var(--green-xpale);padding:2px 8px;border-radius:6px">${t.part}</span>`:''}
            <span class="badge" style="background:var(--green-xpale);color:var(--green-deep);border:none;font-size:0.7rem">${typeLabel[t.answerType||'open']||'📝 Открытый'}</span>
            <span class="badge" style="background:#fef3cd;color:#856404;border:none;font-size:0.7rem">⭐ ${t.points||1} ${(t.points||1)===1?'балл':(t.points||1)<5?'балла':'баллов'}</span>
          </div>
          <div style="font-size:0.92rem;font-weight:600;color:var(--accent);margin-bottom:6px;line-height:1.5">${escHtml(t.text)}</div>
          ${t.imageUrl?`<img src="${safeUrl(t.imageUrl)}" style="max-width:200px;border-radius:8px;border:1px solid var(--green-xpale);margin-bottom:6px" alt="">`:''}
          ${t.answerType==='choice'&&t.options?.length?`
            <div style="font-size:0.8rem;color:var(--text3);margin-bottom:4px">Варианты: ${t.options.join(' · ')}</div>
            <div style="font-size:0.8rem;background:var(--bg);padding:6px 10px;border-radius:8px;border-left:3px solid var(--green-mid)">✅ Правильно: <b>${t.correctOption}</b>${t.explanation?` — ${t.explanation}`:''}</div>
          `:''}
          ${t.answerType==='short'?`
            <div style="font-size:0.8rem;background:var(--bg);padding:6px 10px;border-radius:8px;border-left:3px solid var(--green-mid)">✅ Правильно: <b>${t.correctShort}</b>${t.explanation?` — ${t.explanation}`:''}</div>
          `:''}
          ${t.answerType==='open'&&t.answer?`<div style="font-size:0.8rem;color:var(--text3);background:var(--bg);padding:8px 12px;border-radius:8px;border-left:3px solid var(--green-mid)">💡 ${escHtml(t.answer)}</div>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-outline btn-sm" onclick="openEditTask('${t.id}')">✏️</button>
          <button class="btn btn-red btn-sm" onclick="deleteTask('${t.id}')">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

function updateTaskTypeUI(){
  const type = document.querySelector('input[name="ntask-type"]:checked')?.value||'open';
  document.getElementById('ntask-ui-open').style.display   = type==='open'   ?'block':'none';
  document.getElementById('ntask-ui-choice').style.display = type==='choice' ?'block':'none';
  document.getElementById('ntask-ui-short').style.display  = type==='short'  ?'block':'none';
}

let _ntaskImgData = '';
function handleTaskImgUpload(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{ _ntaskImgData=e.target.result; updateQImgPreview('ntask-img-preview',e.target.result); };
  reader.readAsDataURL(file);
}

function saveTask(){
  const text=document.getElementById('ntask-text').value.trim();
  if(!text){ showNotif('Введите текст задания'); return; }
  const type    = document.querySelector('input[name="ntask-type"]:checked')?.value||'open';
  const subject = document.getElementById('ntask-subject').value;
  const part = document.getElementById('ntask-part').value;
  const imgUrl  = document.getElementById('ntask-imgurl').value.trim()||_ntaskImgData;
  const editId  = document.getElementById('ntask-edit-id').value;

  let taskData = { text, subject, part, imageUrl:imgUrl, answerType:type, points:Math.max(1,+document.getElementById('ntask-points').value||1) };
  if(type==='open'){
    taskData.answer = document.getElementById('ntask-answer').value.trim();
  } else if(type==='choice'){
    const opts = document.getElementById('ntask-options').value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(!opts.length){ showNotif('Добавьте варианты ответов'); return; }
    const correct = document.getElementById('ntask-correct-choice').value.trim();
    if(!correct){ showNotif('Укажите правильный вариант'); return; }
    taskData.options = opts;
    taskData.correctOption = correct;
    taskData.explanation = document.getElementById('ntask-explanation-choice').value.trim();
  } else if(type==='short'){
    const correct = document.getElementById('ntask-correct-short').value.trim();
    if(!correct){ showNotif('Укажите правильный ответ'); return; }
    taskData.correctShort = correct;
    taskData.explanation = document.getElementById('ntask-explanation-short').value.trim();
  }

  const tasks = load('taskbank')||[];
  if(editId){
    const idx = tasks.findIndex(t=>t.id===editId);
    if(idx!==-1) tasks[idx] = { ...tasks[idx], ...taskData };
  } else {
    tasks.push({ id:'task_'+Date.now(), ...taskData, createdAt:todayStr() });
  }
  save('taskbank',tasks);
  _ntaskImgData='';
  closeModal('modal-add-task');
  renderTaskBankAdmin();
  showNotif(editId?'✅ Задание обновлено':'✅ Задание добавлено в базу');
}

function openEditTask(id){
  const t=(load('taskbank')||[]).find(t=>t.id===id);
  if(!t) return;
  document.getElementById('ntask-edit-id').value=t.id;
  document.getElementById('ntask-subject').value=t.subject||'';
  document.getElementById('ntask-part').value=t.part||'';
  document.getElementById('ntask-text').value=t.text||'';
  document.getElementById('ntask-imgurl').value=t.imageUrl&&!t.imageUrl.startsWith('data:')?t.imageUrl:'';
  document.getElementById('ntask-answer').value=t.answer||'';
  document.getElementById('ntask-options').value=(t.options||[]).join('\n');
  document.getElementById('ntask-correct-choice').value=t.correctOption||'';
  document.getElementById('ntask-explanation-choice').value=t.explanation||'';
  document.getElementById('ntask-correct-short').value=t.correctShort||'';
  document.getElementById('ntask-explanation-short').value=t.explanation||'';
  // Set radio
  const type = t.answerType||'open';
  document.querySelectorAll('input[name="ntask-type"]').forEach(r=>r.checked=(r.value===type));
  updateTaskTypeUI();
  document.getElementById('ntask-points').value = t.points||1;
  const prev=document.getElementById('ntask-img-preview');
  if(t.imageUrl){prev.src=t.imageUrl;prev.style.display='block';}else{prev.style.display='none';}
  document.querySelector('#modal-add-task .modal-title').textContent='✏️ Редактировать задание';
  openModalEl('modal-add-task');
}

function deleteTask(id){
  if(!confirm('Удалить задание?')) return;
  save('taskbank',(load('taskbank')||[]).filter(t=>t.id!==id));
  renderTaskBankAdmin();
}

// ══════════════════════════════════════════════════════════
// БАНК ЗАДАНИЙ — страница ученика
// ══════════════════════════════════════════════════════════

let _tbSubject = 'all';
let _tbPart    = 'all';
let _tbType    = 'all';
let _tbQueue   = [];
let _tbIdx     = 0;
let _tbCorrect = 0;
let _tbWrong   = 0;
let _tbAnswer  = '';
let _tbAnswered = false;

function renderStudentTaskBank(){
  const sid = currentUser.id;
  const subjectFilter = getStudentSubjectFilter(sid);

  // Only show allowed subjects in pills
  const allSubjects = ['Химия ЕГЭ', 'Химия ОГЭ', 'Биология ЕГЭ', 'Биология ОГЭ'];
  const availableSubjects = subjectFilter
    ? allSubjects.filter(s=>subjectFilter.has(s))
    : allSubjects;

  const subjects = ['all', ...availableSubjects];
  const subjectPills = document.getElementById('tb-subject-pills');
  if(subjectPills){
    subjectPills.innerHTML = subjects.map(s =>
      `<div class="filter-pill ${_tbSubject===s?'active':''}" onclick="tbSetSubject('${esc(s)}',this)">${s==='all'?'📚 Все предметы':s}</div>`
    ).join('');
  }

  // Show info banner if filtered by courses
  const bannerEl = document.getElementById('tb-course-banner');
  if(bannerEl){
    if(subjectFilter && subjectFilter.size>0){
      const users=load('users')||[];
      const student=users.find(u=>u.id===sid);
      const courses=load('courses')||[];
      const enrolled=(student?.enrolledCourses||[]).map(id=>courses.find(c=>c.id===id)).filter(Boolean);
      bannerEl.style.display='block';
      bannerEl.innerHTML=`<span style="font-size:0.85rem;color:var(--green-deep)">📚 Ваши курсы: ${enrolled.map(c=>`<b>${esc(c.title)}</b>`).join(', ')} — задания только по этим предметам</span>`;
    } else {
      bannerEl.style.display='none';
    }
  }

  const parts = ['all', 'Часть 1', 'Часть 2'];
  const partPills = document.getElementById('tb-part-pills');
  if(partPills){
    partPills.innerHTML = parts.map(p =>
      `<div class="filter-pill ${_tbPart===p?'active':''}" onclick="tbSetPart('${esc(p)}',this)">${p==='all'?'📋 Все части':p}</div>`
    ).join('');
  }

  const typeLabels = {all:'🗂 Все типы', open:'📝 Открытый', choice:'⚡ Выбор', short:'🔤 Точный ответ'};
  const typePills = document.getElementById('tb-type-pills');
  if(typePills){
    typePills.innerHTML = Object.keys(typeLabels).map(t =>
      `<div class="filter-pill ${_tbType===t?'active':''}" onclick="tbSetType('${t}',this)">${typeLabels[t]}</div>`
    ).join('');
  }

  _tbRenderList();
}

function _tbGetFiltered(){
  const sid = currentUser && currentUser.role==='student' ? currentUser.id : null;
  const subjectFilter = sid ? getStudentSubjectFilter(sid) : null;
  return (load('taskbank')||[]).filter(t => {
    // Student course filter: only show tasks for enrolled subjects
    if(subjectFilter && t.subject && !subjectFilter.has(t.subject)) return false;
    const subjOk = _tbSubject==='all' || (t.subject||'')===_tbSubject;
    const partOk = _tbPart==='all' || (t.part||'')===_tbPart;
    const typeOk = _tbType==='all' || (t.answerType||'open')===_tbType;
    return subjOk && partOk && typeOk;
  });
}

function _tbRenderList(){
  const filtered = _tbGetFiltered();
  const label = document.getElementById('tb-count-label');
  if(label) label.textContent = `Найдено заданий: ${filtered.length}`;

  const listEl  = document.getElementById('tb-task-list');
  const emptyEl = document.getElementById('tb-empty-state');
  if(!listEl||!emptyEl) return;

  if(!filtered.length){
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  const typeLabel = {open:'📝 Открытый', choice:'⚡ Выбор', short:'🔤 Точный ответ'};
  listEl.innerHTML = filtered.map((t,i)=>`
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--green-xpale);color:var(--green-deep);display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:700;flex-shrink:0">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            ${t.subject?`<span class="badge badge-green">${esc(t.subject)}</span>`:''}
            ${t.part?`<span class="badge" style="background:var(--green-xpale);color:var(--green-mid);border:1px solid var(--green-pale)">${esc(t.part)}</span>`:''}
            <span class="badge badge-blue">${typeLabel[t.answerType||'open']||'📝'}</span>
            <span class="badge badge-gold">⭐ ${t.points||1} б.</span>
          </div>
          <div style="font-size:0.95rem;font-weight:600;color:var(--accent);line-height:1.5">${esc(t.text)}</div>
          ${t.imageUrl?`<img src="${safeUrl(t.imageUrl)}" style="max-width:180px;border-radius:8px;margin-top:8px;border:1px solid var(--green-xpale)" alt="">`:''}
        </div>
        <button class="btn btn-green btn-sm" style="flex-shrink:0" onclick="tbSolveSingle('${t.id}')">▶ Решить</button>
      </div>
      <div id="tb-single-${t.id}" style="display:none;margin-top:14px;border-top:1px solid var(--green-xpale);padding-top:14px"></div>
    </div>`).join('');
}

function tbSetSubject(subject, el){
  _tbSubject = subject;
  document.querySelectorAll('#tb-subject-pills .filter-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  _tbRenderList();
}

function tbSetPart(part, el){
  _tbPart = part;
  document.querySelectorAll('#tb-part-pills .filter-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  _tbRenderList();
}

function tbSetType(type, el){
  _tbType = type;
  document.querySelectorAll('#tb-type-pills .filter-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  _tbRenderList();
}

function tbShuffleQueue(){
  const filtered = _tbGetFiltered();
  _tbQueue = [...filtered].sort(()=>Math.random()-0.5);
  showNotif(`🔀 ${_tbQueue.length} заданий перемешано`);
}

function tbStartPractice(){
  const filtered = _tbGetFiltered();
  if(!filtered.length){ showNotif('Нет заданий по выбранным фильтрам'); return; }
  if(!_tbQueue.length) _tbQueue = [...filtered].sort(()=>Math.random()-0.5);
  _tbIdx = 0; _tbCorrect = 0; _tbWrong = 0;
  document.getElementById('tb-list-wrap').style.display    = 'none';
  document.getElementById('tb-practice-wrap').style.display = 'block';
  _tbRenderCurrentQuestion();
}

function tbStopPractice(){
  document.getElementById('tb-practice-wrap').style.display = 'none';
  document.getElementById('tb-list-wrap').style.display     = '';
  _tbQueue = [];
  _tbRenderList();
  showNotif(`Практика завершена · ✅ ${_tbCorrect} верно · ❌ ${_tbWrong} неверно`);
}

function _tbRenderCurrentQuestion(){
  if(_tbIdx >= _tbQueue.length){ _tbShowFinish(); return; }
  const q = _tbQueue[_tbIdx];
  _tbAnswer = ''; _tbAnswered = false;

  const pct = Math.round(_tbIdx / _tbQueue.length * 100);
  document.getElementById('tb-progress-label').textContent = `Вопрос ${_tbIdx+1} из ${_tbQueue.length}`;
  document.getElementById('tb-progress-bar').style.width   = pct+'%';
  document.getElementById('tb-correct-count').textContent  = _tbCorrect;
  document.getElementById('tb-wrong-count').textContent    = _tbWrong;

  const typeLabel = {open:'📝 Открытый', choice:'⚡ Выбор', short:'🔤 Точный ответ'};
  document.getElementById('tb-question-card').innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      ${q.subject?`<span class="badge badge-green">${esc(q.subject)}</span>`:''}
      ${q.part?`<span class="badge" style="background:var(--green-xpale);color:var(--green-mid);border:1px solid var(--green-pale)">${esc(q.part)}</span>`:''}
      <span class="badge badge-blue">${typeLabel[q.answerType||'open']||''}</span>
      <span class="badge badge-gold">⭐ ${q.points||1} б.</span>
    </div>
    <div style="font-size:1.05rem;font-weight:600;color:var(--accent);line-height:1.6">${esc(q.text)}</div>
    ${q.imageUrl?`<img src="${safeUrl(q.imageUrl)}" style="max-width:100%;max-height:220px;border-radius:10px;margin-top:10px;border:1px solid var(--green-xpale);object-fit:contain" alt="">` : ''}`;

  const ansEl = document.getElementById('tb-answer-area');
  const type = q.answerType||'open';
  const qJson = JSON.stringify(q).replace(/"/g,'&quot;');
  if(type==='choice' && q.options?.length){
    ansEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px" id="tb-choice-opts">
      ${q.options.map(o=>`
        <div class="option-item" id="tbopt-${esc(o).replace(/\W/g,'_')}"
          onclick="tbSelectChoice(this,'${o.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}','${(q.correctOption||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
          style="cursor:pointer;padding:12px 16px;border-radius:10px;border:1.5px solid var(--green-pale);background:var(--white);font-size:0.92rem;transition:all 0.15s">
          ${esc(o)}
        </div>`).join('')}
    </div>`;
  } else if(type==='short'){
    ansEl.innerHTML = `
      <input id="tb-short-inp" placeholder="Введите краткий ответ..."
        style="width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.93rem;outline:none;background:var(--white);box-sizing:border-box"
        onkeydown="if(event.key==='Enter')tbSubmitCurrent()">
      <button class="btn btn-green" style="margin-top:10px" onclick="tbSubmitCurrent()">📤 Проверить</button>`;
  } else {
    ansEl.innerHTML = `
      <textarea id="tb-open-inp" rows="3" placeholder="Введите ваш ответ..."
        style="width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.93rem;resize:vertical;outline:none;background:var(--white);box-sizing:border-box"></textarea>
      <button class="btn btn-green" style="margin-top:10px" onclick="tbSubmitCurrent()">📤 Отправить</button>`;
  }
  document.getElementById('tb-result-area').style.display = 'none';
  document.getElementById('tb-result-area').innerHTML     = '';
  document.getElementById('tb-nav-buttons').innerHTML     = '';
}

function tbSelectChoice(el, val, correctOption){
  if(_tbAnswered) return;
  _tbAnswer = val;
  _tbAnswered = true;

  const isCorrect = val===correctOption;
  if(isCorrect) _tbCorrect++; else _tbWrong++;
  document.getElementById('tb-correct-count').textContent = _tbCorrect;
  document.getElementById('tb-wrong-count').textContent   = _tbWrong;

  const q = _tbQueue[_tbIdx];
  (q.options||[]).forEach(o=>{
    const optEl = document.getElementById('tbopt-'+esc(o).replace(/\W/g,'_'));
    if(!optEl) return;
    optEl.style.cursor='default'; optEl.onclick=null;
    if(o===correctOption){ optEl.style.background='#e8f8f0'; optEl.style.borderColor='#27ae60'; }
    else if(o===val){ optEl.style.background='#fdecea'; optEl.style.borderColor='var(--red)'; }
  });

  _tbShowResult(isCorrect, correctOption, q);
}

function tbSubmitCurrent(){
  if(_tbAnswered) return;
  const q = _tbQueue[_tbIdx];
  const type = q.answerType||'open';
  if(type==='short'){
    _tbAnswer = (document.getElementById('tb-short-inp')||{}).value?.trim()||'';
    if(!_tbAnswer){ showNotif('Введите ответ'); return; }
  } else {
    _tbAnswer = (document.getElementById('tb-open-inp')||{}).value?.trim()||'';
    if(!_tbAnswer){ showNotif('Введите ответ'); return; }
  }
  _tbAnswered = true;

  let isCorrect = null;
  if(type==='short') isCorrect = _tbAnswer.toLowerCase()===(q.correctShort||'').trim().toLowerCase();

  if(isCorrect===true) _tbCorrect++;
  if(isCorrect===false) _tbWrong++;
  document.getElementById('tb-correct-count').textContent = _tbCorrect;
  document.getElementById('tb-wrong-count').textContent   = _tbWrong;

  _tbShowResult(isCorrect, type==='short'?q.correctShort:null, q);
}

function _tbShowResult(isCorrect, correctAnswer, q){
  const resultEl = document.getElementById('tb-result-area');
  resultEl.style.display = 'block';
  if(isCorrect===true){
    resultEl.innerHTML = `<div style="background:#e8f8f0;border-radius:12px;padding:14px 16px;border-left:4px solid #27ae60">
      <div style="font-weight:700;color:#27ae60;font-size:1rem;margin-bottom:4px">✅ Верно! +${q.points||1} б.</div>
      ${q.explanation?`<div style="font-size:0.85rem;color:var(--text2);margin-top:4px">💡 ${esc(q.explanation)}</div>`:''}
    </div>`;
  } else if(isCorrect===false){
    resultEl.innerHTML = `<div style="background:#fdecea;border-radius:12px;padding:14px 16px;border-left:4px solid var(--red)">
      <div style="font-weight:700;color:var(--red);font-size:1rem;margin-bottom:6px">❌ Неверно</div>
      <div style="font-size:0.88rem;color:var(--text2)">Ваш ответ: <b>${esc(_tbAnswer||'—')}</b></div>
      <div style="font-size:0.88rem;color:var(--green-deep);margin-top:4px">Правильно: <b>${esc(correctAnswer||'')}</b></div>
      ${q.explanation?`<div style="font-size:0.85rem;color:var(--text3);margin-top:6px">💡 ${esc(q.explanation)}</div>`:''}
    </div>`;
  } else {
    resultEl.innerHTML = `<div style="background:#e8f4fd;border-radius:12px;padding:14px 16px;border-left:4px solid #1565c0">
      <div style="font-weight:700;color:#1565c0;font-size:0.9rem;margin-bottom:4px">📝 Ответ записан</div>
      <div style="font-size:0.85rem;color:var(--text2);margin-bottom:6px">Ваш ответ: <i>${esc(_tbAnswer)}</i></div>
      ${q.answer?`<div style="font-size:0.85rem;background:var(--bg);border-radius:8px;padding:8px 12px;border-left:3px solid var(--green-mid);color:var(--text2)">💡 Образцовый ответ: ${esc(q.answer)}</div>`:''}
    </div>`;
  }
  const hasNext = _tbIdx + 1 < _tbQueue.length;
  document.getElementById('tb-nav-buttons').innerHTML = `
    ${hasNext?`<button class="btn btn-green" onclick="tbNextQuestion()">Следующее ➜</button>`:`<button class="btn btn-green" onclick="_tbShowFinish()">🎉 Завершить</button>`}
    <button class="btn btn-outline" onclick="tbStopPractice()">✕ Выйти</button>`;
}

function tbNextQuestion(){ _tbIdx++; _tbRenderCurrentQuestion(); }

function _tbShowFinish(){
  const total = _tbQueue.length;
  const pct   = total ? Math.round(_tbCorrect/total*100) : 0;
  document.getElementById('tb-question-card').innerHTML = `
    <div style="text-align:center;padding:20px 0">
      <div style="font-size:3rem;margin-bottom:12px">${pct>=70?'🎉':pct>=50?'👍':'📚'}</div>
      <div style="font-size:1.5rem;font-weight:900;color:var(--green-deep);font-family:'Playfair Display',serif;margin-bottom:8px">Практика завершена!</div>
      <div style="font-size:1rem;color:var(--text2);margin-bottom:16px">Вы решили <b>${total}</b> заданий</div>
      <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap">
        <div style="text-align:center"><div style="font-size:2rem;font-weight:900;color:#27ae60">${_tbCorrect}</div><div style="font-size:0.78rem;color:var(--text3);text-transform:uppercase">Верно</div></div>
        <div style="text-align:center"><div style="font-size:2rem;font-weight:900;color:var(--red)">${_tbWrong}</div><div style="font-size:0.78rem;color:var(--text3);text-transform:uppercase">Неверно</div></div>
        <div style="text-align:center"><div style="font-size:2rem;font-weight:900;color:var(--green-deep)">${pct}%</div><div style="font-size:0.78rem;color:var(--text3);text-transform:uppercase">Результат</div></div>
      </div>
    </div>`;
  document.getElementById('tb-answer-area').innerHTML = '';
  document.getElementById('tb-result-area').style.display = 'none';
  document.getElementById('tb-nav-buttons').innerHTML = `
    <button class="btn btn-green" onclick="tbStartPractice()">🔄 Ещё раз</button>
    <button class="btn btn-outline" onclick="tbStopPractice()">← К списку</button>`;
  document.getElementById('tb-progress-label').textContent = `Завершено: ${total} заданий`;
  document.getElementById('tb-progress-bar').style.width = '100%';
}

function tbSolveSingle(id){
  const t = (load('taskbank')||[]).find(t=>t.id===id);
  if(!t) return;
  const wrap = document.getElementById('tb-single-'+id);
  if(!wrap) return;
  if(wrap.style.display !== 'none'){ wrap.style.display='none'; return; }
  wrap.style.display = 'block';
  const type = t.answerType||'open';
  let answerHTML = '';
  if(type==='choice' && t.options?.length){
    answerHTML = `<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px" id="tbsl-opts-${id}">
      ${t.options.map(o=>`
        <div class="option-item" id="tbslopt-${id}-${esc(o).replace(/\W/g,'_')}"
          onclick="tbSingleSelectChoice('${id}','${o.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}','${(t.correctOption||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
          style="cursor:pointer;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);background:var(--white);font-size:0.9rem;transition:all 0.15s">
          ${esc(o)}
        </div>`).join('')}
    </div>`;
  } else if(type==='short'){
    answerHTML = `
      <input id="tbsl-short-${id}" placeholder="Краткий ответ..."
        style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;outline:none;background:var(--white);box-sizing:border-box;margin-bottom:10px"
        onkeydown="if(event.key==='Enter')tbSingleSubmit('${id}')">
      <button class="btn btn-green btn-sm" onclick="tbSingleSubmit('${id}')">Проверить</button>`;
  } else {
    answerHTML = `
      <textarea id="tbsl-open-${id}" rows="3" placeholder="Ваш ответ..."
        style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;resize:vertical;outline:none;background:var(--white);box-sizing:border-box;margin-bottom:10px"></textarea>
      <button class="btn btn-green btn-sm" onclick="tbSingleSubmit('${id}')">Отправить</button>`;
  }
  wrap.innerHTML = `${answerHTML}<div id="tbsl-result-${id}" style="display:none;margin-top:10px"></div>`;
}

function tbSingleSelectChoice(taskId, val, correctOption){
  const t = (load('taskbank')||[]).find(t=>t.id===taskId);
  if(!t) return;
  (t.options||[]).forEach(o=>{
    const el = document.getElementById(`tbslopt-${taskId}-${esc(o).replace(/\W/g,'_')}`);
    if(!el) return;
    el.style.cursor='default'; el.onclick=null;
    if(o===correctOption){ el.style.background='#e8f8f0'; el.style.borderColor='#27ae60'; }
    else if(o===val && o!==correctOption){ el.style.background='#fdecea'; el.style.borderColor='var(--red)'; }
  });
  const ok = val===correctOption;
  const resultEl = document.getElementById('tbsl-result-'+taskId);
  resultEl.style.display='block';
  resultEl.innerHTML = ok
    ? `<div style="background:#e8f8f0;border-radius:10px;padding:10px 14px;border-left:3px solid #27ae60;font-size:0.85rem">✅ <b>Верно!</b>${t.explanation?' — '+esc(t.explanation):''}</div>`
    : `<div style="background:#fdecea;border-radius:10px;padding:10px 14px;border-left:3px solid var(--red);font-size:0.85rem">❌ <b>Неверно.</b> Правильно: <b>${esc(correctOption)}</b>${t.explanation?' — '+esc(t.explanation):''}</div>`;
}

function tbSingleSubmit(taskId){
  const t = (load('taskbank')||[]).find(t=>t.id===taskId);
  if(!t) return;
  const type = t.answerType||'open';
  const resultEl = document.getElementById('tbsl-result-'+taskId);
  let userAns = '';
  if(type==='short'){
    userAns = (document.getElementById('tbsl-short-'+taskId)||{}).value?.trim()||'';
    if(!userAns){ showNotif('Введите ответ'); return; }
    const ok = userAns.toLowerCase()===(t.correctShort||'').trim().toLowerCase();
    resultEl.style.display='block';
    resultEl.innerHTML = ok
      ? `<div style="background:#e8f8f0;border-radius:10px;padding:10px 14px;border-left:3px solid #27ae60;font-size:0.85rem">✅ <b>Верно!</b>${t.explanation?' — '+esc(t.explanation):''}</div>`
      : `<div style="background:#fdecea;border-radius:10px;padding:10px 14px;border-left:3px solid var(--red);font-size:0.85rem">❌ <b>Неверно.</b> Правильно: <b>${esc(t.correctShort)}</b>${t.explanation?' — '+esc(t.explanation):''}</div>`;
  } else {
    userAns = (document.getElementById('tbsl-open-'+taskId)||{}).value?.trim()||'';
    if(!userAns){ showNotif('Введите ответ'); return; }
    resultEl.style.display='block';
    resultEl.innerHTML = `<div style="background:#e8f4fd;border-radius:10px;padding:10px 14px;border-left:3px solid #1565c0;font-size:0.85rem">
      <b>Ответ записан.</b>
      ${t.answer?`<div style="margin-top:6px;background:var(--bg);border-radius:8px;padding:8px 12px">💡 Образцовый ответ: ${esc(t.answer)}</div>`:''}
    </div>`;
  }
}

// ── DAILY TASK for student ──
function getStudentSubjectFilter(sid){
  const users=load('users')||[];
  const student=users.find(u=>u.id===sid);
  if(!student) return null; // no filter
  const enrolled=student.enrolledCourses||[];
  if(!enrolled.length) return null; // no courses enrolled → no filter (show all)
  const courses=load('courses')||[];
  const subjects=[...new Set(enrolled.map(id=>courses.find(c=>c.id===id)).filter(Boolean).map(c=>c.subject))];
  if(!subjects.length) return null;
  // Build list of allowed subject prefixes from tasks: 'Биология ЕГЭ','Биология ОГЭ','Химия ЕГЭ','Химия ОГЭ'
  const allowed=new Set();
  subjects.forEach(s=>{
    if(s==='Биология'){ allowed.add('Биология ЕГЭ'); allowed.add('Биология ОГЭ'); }
    else if(s==='Химия'){ allowed.add('Химия ЕГЭ'); allowed.add('Химия ОГЭ'); }
    else if(s==='Биология + Химия'){ allowed.add('Биология ЕГЭ'); allowed.add('Биология ОГЭ'); allowed.add('Химия ЕГЭ'); allowed.add('Химия ОГЭ'); }
    else allowed.add(s); // exact match
  });
  return allowed;
}

// daily_task_log — Firebase (путь db/daily_task_log/{sid})
const _dailyTaskLogCache = {};
async function _loadDailyTaskLog(sid){
  if(_dailyTaskLogCache[sid] !== undefined) return _dailyTaskLogCache[sid];
  const snap = await _fbInit().ref('db/daily_task_log/'+sid).get();
  _dailyTaskLogCache[sid] = snap.val() || [];
  return _dailyTaskLogCache[sid];
}
function _saveDailyTaskLog(sid, arr){
  _dailyTaskLogCache[sid] = arr;
  _fbInit().ref('db/daily_task_log/'+sid).set(arr)
    .catch(e => console.error('[Firebase] daily_task_log save', e));
}

async function getDailyTask(sid){
  let tasks=load('taskbank')||[];
  if(!tasks.length) return null;
  const subjectFilter=getStudentSubjectFilter(sid);
  if(subjectFilter) tasks=tasks.filter(t=>!t.subject||subjectFilter.has(t.subject));
  if(!tasks.length) return null;
  const today=todayStr();
  const sidLog = await _loadDailyTaskLog(sid);
  const todayEntry=sidLog.find(e=>e.date===today);
  if(todayEntry){ return {task:tasks.find(t=>t.id===todayEntry.taskId)||null,isNew:false}; }
  const usedIds=new Set(sidLog.map(e=>e.taskId));
  const available=tasks.filter(t=>!usedIds.has(t.id));
  const pool=available.length?available:tasks;
  const task=pool[Math.floor(seededRandom(sid+today)*pool.length)];
  if(!task) return null;
  const newLog=[...sidLog,{date:today,taskId:task.id}].slice(-365);
  _saveDailyTaskLog(sid, newLog);
  return {task,isNew:true};
}
function seededRandom(seed){
  let h=0; for(let i=0;i<seed.length;i++) h=(Math.imul(31,h)+seed.charCodeAt(i))|0;
  return Math.abs(h)/2147483647;
}
// daily_answers — Firebase (путь db/daily_answers/{sid}/{date})
const _dailyAnswersCache = {};
async function getDailyAnswer(sid){
  if(_dailyAnswersCache[sid] !== undefined) return (_dailyAnswersCache[sid]||{})[todayStr()]||null;
  const snap = await _fbInit().ref('db/daily_answers/'+sid).get();
  _dailyAnswersCache[sid] = snap.val() || {};
  return (_dailyAnswersCache[sid])[todayStr()]||null;
}
function saveDailyAnswer(sid,data){
  if(!_dailyAnswersCache[sid]) _dailyAnswersCache[sid]={};
  _dailyAnswersCache[sid][todayStr()]=data;
  _fbInit().ref('db/daily_answers/'+sid+'/'+todayStr()).set(data)
    .catch(e => console.error('[Firebase] daily_answers save', e));
}

function renderDailyTaskBlock(sid){
  const block=document.getElementById('daily-task-block');
  const result=getDailyTask(sid);
  if(!result||!result.task){block.style.display='none';return;}
  block.style.display='block';
  const {task}=result;
  document.getElementById('daily-task-subject').textContent=task.subject||'';
  document.getElementById('daily-task-text').textContent=task.text;
  const imgWrap=document.getElementById('daily-task-img-wrap');
  if(task.imageUrl){imgWrap.style.display='block';document.getElementById('daily-task-img').src=task.imageUrl;}
  else imgWrap.style.display='none';

  // Build answer UI
  const ansBlock=document.getElementById('daily-task-answer-block');
  const type=task.answerType||'open';
  if(type==='choice'&&task.options?.length){
    ansBlock.innerHTML=`
      <div id="daily-choice-opts" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
        ${task.options.map(o=>`
          <div class="option-item" id="daily-opt-${o.replace(/\W/g,'_')}" onclick="selectDailyChoice(this,'${o.replace(/'/g,"\\'")}')"
            style="cursor:pointer;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);background:var(--white);font-size:0.9rem;transition:all 0.15s">
            ${o}
          </div>`).join('')}
      </div>
      <button class="btn btn-green" style="width:100%" onclick="submitDailyTask()">📤 Отправить ответ</button>`;
    window._dailyChoiceSelected = '';
  } else if(type==='short'){
    ansBlock.innerHTML=`
      <input id="daily-short-input" placeholder="Введите краткий ответ..."
        style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;outline:none;background:var(--white);margin-bottom:10px">
      <button class="btn btn-green" style="width:100%" onclick="submitDailyTask()">📤 Отправить ответ</button>`;
  } else {
    ansBlock.innerHTML=`
      <textarea id="daily-task-answer" rows="3" placeholder="Введите ваш ответ..."
        style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;resize:vertical;outline:none;background:var(--white)"></textarea>
      <button class="btn btn-green" style="margin-top:10px;width:100%" onclick="submitDailyTask()">📤 Отправить ответ</button>`;
  }

  const existing=getDailyAnswer(sid);
  if(existing){
    ansBlock.style.display='none';
    document.getElementById('daily-task-result').style.display='block';
    document.getElementById('daily-task-badge').style.display='flex';
    showDailyTaskResult(task,existing);
  } else {
    ansBlock.style.display='block';
    document.getElementById('daily-task-result').style.display='none';
    document.getElementById('daily-task-badge').style.display='none';
  }
}

function selectDailyChoice(el, val){
  window._dailyChoiceSelected=val;
  document.querySelectorAll('#daily-choice-opts .option-item').forEach(o=>{
    o.style.background='var(--white)'; o.style.borderColor='var(--green-pale)'; o.style.fontWeight='';
  });
  el.style.background='var(--green-xpale)'; el.style.borderColor='var(--green-mid)'; el.style.fontWeight='700';
}

function submitDailyTask(){
  const sid=currentUser.id;
  const result=getDailyTask(sid);
  if(!result||!result.task) return;
  const task=result.task;
  const type=task.answerType||'open';
  let userAnswer='';
  if(type==='choice'){
    userAnswer=window._dailyChoiceSelected||'';
    if(!userAnswer){showNotif('Выберите вариант ответа');return;}
  } else if(type==='short'){
    userAnswer=document.getElementById('daily-short-input')?.value.trim()||'';
    if(!userAnswer){showNotif('Введите ответ');return;}
  } else {
    userAnswer=document.getElementById('daily-task-answer')?.value.trim()||'';
    if(!userAnswer){showNotif('Введите ответ');return;}
  }

  // For auto types — check correctness immediately
  let isCorrect=null;
  if(type==='choice') isCorrect = userAnswer===task.correctOption;
  if(type==='short')  isCorrect = userAnswer.trim().toLowerCase()===(task.correctShort||'').trim().toLowerCase();

  saveDailyAnswer(sid,{text:userAnswer, isCorrect, type});
  document.getElementById('daily-task-answer-block').style.display='none';
  document.getElementById('daily-task-badge').style.display='flex';
  // Update badge color
  const badge=document.getElementById('daily-task-badge');
  if(isCorrect===true)  { badge.style.background='#e8f8f0'; badge.style.color='#27ae60'; badge.textContent='✅ Верно!'; }
  else if(isCorrect===false){ badge.style.background='#fdecea'; badge.style.color='#c0392b'; badge.textContent='❌ Неверно'; }
  else                  { badge.style.background='#e8f8f0'; badge.style.color='#27ae60'; badge.textContent='✅ Отвечено'; }
  document.getElementById('daily-task-result').style.display='block';
  showDailyTaskResult(task,{text:userAnswer,isCorrect,type});
  showNotif(isCorrect===true?'🎉 Правильно!':isCorrect===false?'❌ Неверно, смотри правильный ответ':'✅ Ответ сохранён!');
}

function showDailyTaskResult(task, answerData){
  const resultEl=document.getElementById('daily-task-result');
  const type = typeof answerData==='object' ? answerData.type : 'open';
  const userText = typeof answerData==='object' ? answerData.text : answerData;
  const isCorrect = typeof answerData==='object' ? answerData.isCorrect : null;

  let correctBlock='';
  if(isCorrect===true){
    correctBlock=`<div style="background:#e8f8f0;border-radius:10px;padding:10px 14px;border-left:3px solid #27ae60;font-size:0.88rem;color:#1a7a4a;font-weight:600">🎉 Правильно!</div>`;
  } else if(isCorrect===false){
    const correct = type==='choice'?task.correctOption:task.correctShort;
    correctBlock=`
      <div style="background:#fdecea;border-radius:10px;padding:10px 14px;border-left:3px solid #c0392b;font-size:0.88rem;color:#c0392b;font-weight:600;margin-bottom:8px">❌ Неверно</div>
      <div style="background:var(--bg);border-radius:10px;padding:10px 14px;border-left:3px solid var(--green-mid);font-size:0.88rem">
        ✅ Правильный ответ: <b>${correct}</b>
        ${task.explanation?`<br><span style="color:var(--text3)">${task.explanation}</span>`:''}
      </div>`;
  } else if(task.answer){
    correctBlock=`<div style="background:var(--bg);border-radius:10px;padding:10px 14px;border-left:3px solid var(--green-mid);font-size:0.88rem">
      <div style="font-size:0.75rem;font-weight:700;color:var(--green-deep);text-transform:uppercase;margin-bottom:4px">💡 Эталонный ответ</div>
      <div style="color:var(--text1);line-height:1.6">${escHtml(task.answer)}</div>
    </div>`;
  }

  resultEl.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="background:var(--bg);border-radius:10px;padding:10px 14px;border:1px solid var(--green-xpale)">
        <div style="font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:4px">Ваш ответ</div>
        <div style="font-size:0.9rem;color:var(--accent)">${userText}</div>
      </div>
      ${correctBlock}
    </div>
    <div style="font-size:0.78rem;color:var(--text3);margin-top:8px;text-align:center">Следующее задание появится завтра 🌅</div>`;
}


// ══════════════════════════════════════════════
// ПОСЕЩАЕМОСТЬ (ATTENDANCE)
// ══════════════════════════════════════════════

let _attSelectedSid = 'all';

function renderAttendanceAdmin(){
  const students = getStudents();
  const allAtt = (()=>{const _r=load('attendance')||[];return Array.isArray(_r)?_r:Object.values(_r);})().slice().reverse();

  // Chip bar
  const chipsEl = document.getElementById('attendance-student-chips');
  if(chipsEl){
    chipsEl.innerHTML = [
      `<div class="student-chip ${_attSelectedSid==='all'?'active':''}" onclick="_attSelectedSid='all';renderAttendanceAdmin()">👥 Все</div>`,
      ...students.map(s=>`<div class="student-chip ${_attSelectedSid===s.id?'active':''}" onclick="_attSelectedSid='${s.id}';renderAttendanceAdmin()">${esc(s.name)}</div>`)
    ].join('');
  }

  const el = document.getElementById('attendance-admin-list');
  if(!el) return;

  // Group lessons by date desc
  const sids = _attSelectedSid==='all' ? students.map(s=>s.id) : [_attSelectedSid];
  const lessons = allAtt.filter(a=>sids.includes(a.studentId));

  if(!lessons.length){ el.innerHTML=`<div class="card">${emptyHTML()}</div>`; return; }

  // Group by lessonId (same lesson = multiple students)
  const byLesson = {};
  lessons.forEach(a=>{
    if(!byLesson[a.lessonId]) byLesson[a.lessonId]={
      lessonId:a.lessonId, date:a.date, time:a.time, topic:a.topic,
      group:a.group, costPerStudent:a.costPerStudent, entries:[]
    };
    byLesson[a.lessonId].entries.push(a);
  });

  const lessonGroups = Object.values(byLesson).sort((a,b)=>b.date.localeCompare(a.date));

  el.innerHTML = lessonGroups.map(lg=>{
    const dateLabel = lg.date ? new Date(lg.date).toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'}) : '—';
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;font-size:0.97rem;color:var(--accent)">📅 ${dateLabel}${lg.time?' · '+lg.time:''}</div>
          <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">
            ${lg.topic?`📖 ${escHtml(lg.topic)} · `:''}${lg.group?`👥 ${escHtml(lg.group)} · `:''}💰 ${+lg.costPerStudent||0}₽/чел.
          </div>
        </div>
        <button class="btn btn-red btn-sm" onclick="deleteLesson('${lg.lessonId}')">🗑 Занятие</button>
      </div>
      ${lg.entries.map(a=>{
        const s = students.find(s=>s.id===a.studentId);
        return `<div class="att-row att-${a.present?'present':'absent'}">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.88rem">${s?s.name:'—'}</div>
            ${a.group?`<div style="font-size:0.75rem;color:var(--text3)">${escHtml(a.group)}</div>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="att-badge-${a.present?'present':'absent'}">${a.present?'✅ Был':'❌ Не был'}</span>
            ${a.present?`<span class="att-cost-badge">−${a.costPerStudent}₽</span>`:''}
            ${a.present&&!a.paid?`<span class="att-unpaid-badge">💳 Не оплачено</span>`:''}
            ${a.present&&a.paid?`<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:8px">✅ Оплачено</span>`:''}
            <button class="btn btn-outline btn-sm" onclick="toggleAttPresence('${a.id}')">${a.present?'Отменить':'Был'}</button>
            ${a.present?`<button class="btn btn-outline btn-sm" onclick="toggleAttPaid('${a.id}')">${a.paid?'Снять оплату':'Оплачено'}</button>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

// toggleAttPresence replaced — используйте markAttPresent / markAttAbsentPaid
function toggleAttPresence(id){ markAttPresent(id); }
function deleteLesson(lessonId){
  if(!confirm('Удалить всё занятие?')) return;
  save('attendance',(()=>{const _r=load('attendance')||[];return Array.isArray(_r)?_r:Object.values(_r);})().filter(a=>a.lessonId!==lessonId));
  renderAtpAttendance();
}

function renderStudentAttendance(){
  const sid=currentUser.id;
  const att=(()=>{const _r=load('attendance')||[];return Array.isArray(_r)?_r:Object.values(_r);})().filter(a=>a.studentId===sid).slice().reverse();
  const el=document.getElementById('student-attendance-list');
  if(!el) return;
  if(!att.length){ el.innerHTML=`<div class="card">${emptyHTML()}</div>`; return; }

  // Stats
  const total=att.length, present=att.filter(a=>a.present).length;
  const totalCost=att.filter(a=>a.present).reduce((s,a)=>s+(+a.costPerStudent||0),0);
  const unpaidCost=att.filter(a=>a.present&&!a.paid).reduce((s,a)=>s+(+a.costPerStudent||0),0);

  el.innerHTML=`
    <div class="card" style="margin-bottom:14px">
      <div class="report-kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">
        <div class="report-kpi"><div class="kpi-icon">📅</div><div class="kpi-val">${total}</div><div class="kpi-label">Занятий</div></div>
        <div class="report-kpi"><div class="kpi-icon">✅</div><div class="kpi-val">${present}</div><div class="kpi-label">Посещено</div></div>
        <div class="report-kpi"><div class="kpi-icon">💰</div><div class="kpi-val">${totalCost}₽</div><div class="kpi-label">Начислено</div></div>
        <div class="report-kpi"><div class="kpi-icon" style="color:#c0392b">💳</div><div class="kpi-val" style="${unpaidCost>0?'color:#c0392b':''}">${unpaidCost}₽</div><div class="kpi-label">Не оплачено</div></div>
      </div>
    </div>
    <div class="card">
      ${att.map(a=>{
        const dateLabel=a.date?new Date(a.date).toLocaleDateString('ru',{day:'numeric',month:'long'}):a.date;
        return `<div class="att-row att-${a.present?'present':'absent'}">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.88rem">📅 ${dateLabel}${a.time?' · '+a.time:''}</div>
            <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">
              ${a.topic?`📖 ${esc(a.topic)}`:''}${a.group?' · 👥 '+esc(a.group):''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span class="att-badge-${a.present?'present':'absent'}">${a.present?'✅ Был':'❌ Не был'}</span>
            ${a.present?`<span class="att-cost-badge">−${a.costPerStudent}₽</span>`:''}
            ${a.present&&!a.paid?`<span class="att-unpaid-badge">💳 Не оплачено</span>`:''}
            ${a.present&&a.paid?`<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:8px">✅ Оплачено</span>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}



// ── ПРОФИЛЬ УЧЕНИКА ──
function openStudentProfileModal(id){
  const u=(load('users')||[]).find(u=>u.id===id);
  if(!u) {
    console.error('Ученик не найден:', id);
    showNotif('⚠️ Ученик не найден');
    return;
  }
  const bodyEl = document.getElementById('student-profile-body');
  const modalEl = document.getElementById('modal-student-profile');
  
  if(!bodyEl || !modalEl) {
    console.error('Элементы модального окна не найдены');
    showNotif('⚠️ Ошибка открытия профиля');
    return;
  }
  
  bodyEl.innerHTML = buildProfileHTML(u, true);
  modalEl.classList.add('open');
  console.log('Профиль открыт для ученика:', u.name);
}

function buildProfileHTML(u, isAdmin){
  const age = u.birth ? Math.floor((Date.now()-new Date(u.birth))/(365.25*24*3600*1000)) : null;
  const row=(label,val,icon='')=>val?`
    <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--green-xpale)">
      <span style="font-size:0.78rem;color:var(--text3);min-width:150px;flex-shrink:0">${icon} ${label}</span>
      <span style="font-size:0.88rem;color:var(--text);font-weight:500">${val}</span>
    </div>`:''  ;
  // Build enrolled courses badges
  const courses=load('courses')||[];
  const enrolled=(u.enrolledCourses||[]).map(id=>courses.find(c=>c.id===id)).filter(Boolean);
  const coursesBadgesHtml = enrolled.length
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">`+
        enrolled.map(c=>`<span class="badge badge-green">${c.subject==='Биология'?'🌿':c.subject==='Химия'?'⚗️':'🧬'} ${esc(c.title)}</span>`).join('')+
      `</div>`
    : (u.subject ? `<span class="badge badge-blue" style="margin-top:8px;display:inline-block">${esc(u.subject)}</span>` : '');
  return `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:linear-gradient(135deg,var(--green-xpale),var(--bg));border-radius:14px;margin-bottom:20px">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--green-mid));display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.4rem;font-weight:700;flex-shrink:0">
        ${u.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase()}
      </div>
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--accent);font-weight:700">${esc(u.name)}</div>
        <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">${u.format?u.format+'':''}${age?' · '+age+' лет':''}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'Активен':'Неактивен'}</span>
          <span class="badge ${u.ofertaSigned?'badge-green':'badge-red'}">📄 ${u.ofertaSigned?'Договор подписан':'Договор не подписан'}</span>
        </div>
        ${coursesBadgesHtml}
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:0.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Контакты ученика</div>
      ${row('Телефон', u.phone, '📞')}
      ${row('Email', u.email, '📧')}
      ${row('Класс', u.grade, '🎓')}
      ${row('Дата рождения', u.birth?new Date(u.birth).toLocaleDateString('ru'):'', '🎂')}
    </div>

    ${(u.parent||u.parentPhone||u.parentEmail)?`
    <div style="margin-bottom:16px">
      <div style="font-size:0.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Родитель / представитель</div>
      ${row('ФИО', u.parent, '👨‍👩‍👧')}
      ${row('Телефон', u.parentPhone, '📞')}
      ${row('Email', u.parentEmail, '📧')}
    </div>`:''}

    ${u.notes?`
    <div style="background:var(--bg);border-radius:10px;padding:12px;border-left:3px solid var(--green-mid);margin-bottom:16px">
      <div style="font-size:0.75rem;font-weight:700;color:var(--text3);margin-bottom:4px">📋 Заметки / цели</div>
      <div style="font-size:0.88rem;color:var(--text2);line-height:1.5">${u.notes}</div>
    </div>`:''}

    <div style="background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;padding:12px 16px;font-size:0.85rem;margin-bottom:8px">
      <div style="font-size:0.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">📄 Документы</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;gap:8px">
          ${u.signedPrivacy
            ? `<span style="background:#e8f8f0;color:#27ae60;font-size:0.78rem;font-weight:700;padding:3px 10px;border-radius:8px">✅ Договор о персональных данных · ${esc(u.signedPrivacyDate||'')}</span>`
            : `<span style="background:#fdecea;color:#c0392b;font-size:0.78rem;font-weight:700;padding:3px 10px;border-radius:8px">❌ Договор о персональных данных не подписан</span>`}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${u.signedRules
            ? `<span style="background:#e8f8f0;color:#27ae60;font-size:0.78rem;font-weight:700;padding:3px 10px;border-radius:8px">✅ Правила занятий · ${esc(u.signedRulesDate||'')}</span>`
            : `<span style="background:#fdecea;color:#c0392b;font-size:0.78rem;font-weight:700;padding:3px 10px;border-radius:8px">❌ Правила занятий не подписаны</span>`}
        </div>
      </div>
    </div>

    ${isAdmin?`
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--green-xpale)">
      <div style="font-size:0.75rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">⚠️ Слабые темы (топ-3)</div>
      ${renderWeakTopicsHTML(u.id, true)}
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-student-profile');openEditStudent('${u.id}')">✏️ Редактировать данные</button>
    </div>`:''}
  `;
}

function renderStudentProfileCard(){
  const card = document.getElementById('student-profile-card');
  if(!card || !currentUser) return;
  card.style.display='block';
  card.innerHTML = `<div class="card" style="border:1.5px solid var(--green-pale)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div class="card-title" style="margin:0"><span class="dot"></span>👤 Мои данные</div>
      <button class="btn btn-outline btn-sm" onclick="toggleProfileExpand()">📋 Показать / скрыть</button>
    </div>
    <div id="student-profile-expand" style="display:none">${buildProfileHTML(currentUser, false)}</div>
    <div id="student-profile-short" style="display:flex;gap:16px;flex-wrap:wrap">
      ${currentUser.phone?`<span style="font-size:0.85rem">📞 ${currentUser.phone}</span>`:''}
      ${currentUser.email?`<span style="font-size:0.85rem">📧 ${currentUser.email}</span>`:''}
      ${currentUser.grade?`<span style="font-size:0.85rem">🎓 ${currentUser.grade}</span>`:''}
      ${currentUser.subject?`<span style="font-size:0.85rem">📚 ${currentUser.subject}</span>`:''}
      <span class="badge ${currentUser.ofertaSigned?'badge-green':'badge-red'}" style="font-size:0.72rem">📄 ${currentUser.ofertaSigned?'Договор ✅':'Договор ❌'}</span>
    </div>
  </div>`;
}
function toggleProfileExpand(){
  const exp=document.getElementById('student-profile-expand');
  const shr=document.getElementById('student-profile-short');
  if(!exp) return;
  const show=exp.style.display==='none';
  exp.style.display=show?'block':'none';
  shr.style.display=show?'none':'flex';
}

// ── ZOOM LINK ──
function saveZoomLink(){
  const url  = (document.getElementById('admin-zoom-url')||{}).value?.trim();
  const desc = (document.getElementById('admin-zoom-desc')||{}).value?.trim();
  if(!url){ showNotif('Введите ссылку'); return; }
  localStorage.setItem('biohim_zoom_url',  url);
  localStorage.setItem('biohim_zoom_desc', desc||'');
  const st = document.getElementById('zoom-save-status');
  if(st){ st.textContent='✅ Ссылка опубликована — ученики видят её на главной'; st.style.color='var(--green-mid)'; }
  showNotif('✅ Ссылка на Zoom опубликована');
}
function clearZoomLink(){
  localStorage.removeItem('biohim_zoom_url');
  localStorage.removeItem('biohim_zoom_desc');
  const st = document.getElementById('zoom-save-status');
  if(st){ st.textContent='Ссылка убрана'; st.style.color='var(--text3)'; }
  showNotif('Ссылка убрана');
}


function renderContractEditor(){
  const el = document.getElementById('contract-editor-container');
  if(!el) return;
  const contracts = load('contracts') || {};
  const privacyText = contracts.privacy || '';
  const rulesText   = contracts.rules   || '';
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><span class="dot"></span>🔒 Договор о персональных данных</div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:10px">Текст, который видит ученик перед подписанием</div>
      <textarea id="contract-privacy-text" rows="10" style="width:100%;box-sizing:border-box;font-size:0.87rem;line-height:1.6;padding:12px;border:1px solid var(--green-xpale);border-radius:10px;background:var(--bg);color:var(--text1);resize:vertical;font-family:inherit">${esc(privacyText)}</textarea>
      <button class="btn btn-green" style="margin-top:10px" onclick="saveContractText('privacy')">💾 Сохранить договор</button>
      <span id="contract-privacy-status" style="font-size:0.82rem;color:var(--green-mid);margin-left:12px"></span>
    </div>
    <div class="card">
      <div class="card-title"><span class="dot"></span>📋 Правила занятий</div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:10px">Текст, который видит ученик перед принятием</div>
      <textarea id="contract-rules-text" rows="10" style="width:100%;box-sizing:border-box;font-size:0.87rem;line-height:1.6;padding:12px;border:1px solid var(--green-xpale);border-radius:10px;background:var(--bg);color:var(--text1);resize:vertical;font-family:inherit">${esc(rulesText)}</textarea>
      <button class="btn btn-green" style="margin-top:10px" onclick="saveContractText('rules')">💾 Сохранить правила</button>
      <span id="contract-rules-status" style="font-size:0.82rem;color:var(--green-mid);margin-left:12px"></span>
    </div>`;
}

function saveContractText(type){
  const elId = type === 'privacy' ? 'contract-privacy-text' : 'contract-rules-text';
  const statusId = type === 'privacy' ? 'contract-privacy-status' : 'contract-rules-status';
  const text = (document.getElementById(elId)||{}).value || '';
  const contracts = load('contracts') || {};
  contracts[type] = text;
  save('contracts', contracts);
  const st = document.getElementById(statusId);
  if(st){ st.textContent = '✅ Сохранено'; setTimeout(()=>{ if(st) st.textContent=''; }, 2500); }
}

function renderZoomSettings(){
  renderContractEditor();
  const url  = localStorage.getItem('biohim_zoom_url')||'';
  const desc = localStorage.getItem('biohim_zoom_desc')||'';
  const urlEl = document.getElementById('admin-zoom-url');
  const descEl= document.getElementById('admin-zoom-desc');
  if(urlEl)  urlEl.value  = url;
  if(descEl) descEl.value = desc;
  const st = document.getElementById('zoom-save-status');
  if(st) st.textContent = url ? `✅ Опубликовано: ${url}` : '';
}
function renderStudentZoomBlock(){
  const url  = localStorage.getItem('biohim_zoom_url')||'';
  const desc = localStorage.getItem('biohim_zoom_desc')||'';
  const block = document.getElementById('student-zoom-block');
  const btn   = document.getElementById('student-zoom-link-btn');
  const descEl= document.getElementById('student-zoom-desc');
  if(!block) return;
  if(url){
    block.style.display='block';
    if(btn){ btn.href=url; }
    if(descEl){ descEl.style.display=desc?'block':'none'; descEl.textContent=desc; }
  } else {
    block.style.display='none';
  }
}


  renderStudentProfileCard();
function renderStudentDashboard(){
  document.getElementById('student-wb-title').textContent=`Добро пожаловать, ${currentUser.name}! 👋`;
  const sid=currentUser.id;
  const tests=(load('tests')||[]).filter(t=>t.studentId===sid);
  const hw=(load('hw')||[]).filter(h=>h.studentId===sid);
  const content=(load('content')||[]).filter(c=>c.studentId===sid);

  // Auto-schedule all theory items for SR
  const srData = getSRData(sid);
  let srChanged=false;
  content.filter(c=>c.type==='theory').forEach(c=>{
    if(!srData[c.id]){ srData[c.id]={nextDue:todayStr(),interval:1,repetitions:0,ef:2.5}; srChanged=true; }
  });
  if(srChanged) saveSRData(sid, srData);

  const dueCount = getDueItems(sid).length;
  updateRepeatBadge(dueCount);

  document.getElementById('student-stats-grid').innerHTML=`
    <div class="stat-card"><div class="stat-icon">📚</div><div class="stat-num">${content.length}</div><div class="stat-label">Материалов</div></div>
    <div class="stat-card"><div class="stat-icon">🧠</div><div class="stat-num" style="${dueCount>0?'color:#c0392b':''}">${dueCount}</div><div class="stat-label">Нужно повторить</div></div>
    <div class="stat-card"><div class="stat-icon">✏️</div><div class="stat-num">${hw.filter(h=>!h.submitted).length}</div><div class="stat-label">ДЗ не отправлено</div></div>
  `;
  const notifs=(load('notifs')||[]).filter(n=>n.studentId===sid);
  const notifItems = notifs.slice().reverse();
  const NOTIF_PREVIEW = 5;
  const notifHTML = notifItems.map((n,idx)=>{
    const isRepeat  = n.type==='repeat';
    const isChat    = n.type==='chat';
    const isComment = n.type==='comment';
    const isWallet  = n.type==='wallet' || n.type==='charge';
    const nav = n.nav || (isRepeat?'student-repeat': isChat?'student-chat': isWallet?'student-payment': '');
    const clickable = !!nav;
    const dotClass  = isChat?'new': isComment?'done': isWallet?'new': isRepeat?'':'new';
    const arrow     = isChat?'→ Чат': isComment?'→ Перейти': isWallet?'→ Оплата': isRepeat?'→ Повторить':'';
    const extraClass= isChat?'notif-chat': isComment?'notif-comment': isWallet?'notif-comment':'';
    const hiddenStyle = idx >= NOTIF_PREVIEW ? 'display:none;' : '';
    return `<div class="hw-item ${extraClass}" data-notif-idx="${idx}" style="${hiddenStyle}cursor:${clickable?'pointer':'default'};${extraClass?'border-radius:10px;padding:10px;margin-bottom:4px;':''}" onclick="${clickable?`navigateTo('${nav}')`:''}" >
      <div class="hw-status-dot ${dotClass}"></div>
      <div><div class="content-name" style="font-size:0.85rem">${esc(n.text)}</div><div class="content-meta">${n.date}</div></div>
      ${clickable?`<span style="font-size:0.75rem;color:var(--green-mid);margin-left:auto;white-space:nowrap">${arrow}</span>`:''}
    </div>`;
  }).join('');
  const extraCount = notifItems.length - NOTIF_PREVIEW;
  const showMoreBtn = extraCount > 0
    ? `<button id="notif-expand-btn" onclick="toggleNotifExpand(this,${extraCount})" style="width:100%;margin-top:8px;padding:7px;border:1px solid var(--green-pale);background:var(--bg2);border-radius:8px;font-size:0.8rem;color:var(--text3);cursor:pointer;font-family:Nunito,sans-serif">▼ Ещё ${extraCount} уведомлений</button>`
    : '';
  document.getElementById('student-notifs-list').innerHTML = notifHTML
    ? notifHTML + showMoreBtn
    : '<div class="empty-state"><p>Нет уведомлений</p></div>';

  // Render student calendar & todo
  _sCalYear = new Date().getFullYear();
  _sCalMonth = new Date().getMonth();
  renderStudentCalendar();
  renderStudentTodoList('day');
  // Daily task
  renderStudentZoomBlock();
  renderDailyTaskBlock(sid);
  // Прогресс курсов
  _renderStudentCourseProgress(sid);
  // Геймификация — только для ученика
  if (typeof GM !== 'undefined' && GM.gmAutoMount) GM.gmAutoMount(currentUser.id);
}

// ─── ПРОГРЕСС-БАР КУРСОВ ───────────────────────────────
function _renderStudentCourseProgress(sid) {
  const el = document.getElementById('student-courses-progress');
  if (!el) return;

  const user     = (load('users') || []).find(u => u.id === sid);
  const courses  = load('courses') || [];
  const enrolled = (user?.enrolledCourses || []).map(id => courses.find(c => c.id === id)).filter(Boolean);
  if (!enrolled.length) { el.innerHTML = ''; return; }

  const allTests   = (load('tests')   || []).filter(t => t.studentId === sid && !t.isLibrary);
  const allHW      = (load('hw')      || []).filter(h => h.studentId === sid && !h.isLibrary);
  const allContent = (load('content') || []).filter(c => c.studentId === sid);

  const html = enrolled.map(course => {
    // Собираем элементы этого курса (ищем по courseId или по совпадению subject)
    const courseTests   = allTests.filter(t   => t.courseId === course.id || (!t.courseId && t.subject === course.subject));
    const courseHW      = allHW.filter(h      => h.courseId === course.id || (!h.courseId && h.subject === course.subject));
    const courseMats    = allContent.filter(c => c.courseId === course.id || (!c.courseId && c.subject === course.subject));

    const total    = courseTests.length + courseHW.length + courseMats.length;
    if (!total) return ''; // нет контента — не показываем

    const viewedKey = 'biohim_viewed_' + sid;
    const viewed    = _getViewedCache(sid);

    const doneMats  = courseMats.filter(c => viewed[c.id]).length;
    const doneTests = courseTests.filter(t => t.submitted).length;
    const doneHW    = courseHW.filter(h => h.submitted).length;
    const done      = doneMats + doneTests + doneHW;
    const pct       = Math.round(done / total * 100);

    const colorClass = pct >= 80 ? '#27ae60' : pct >= 40 ? 'var(--gold)' : 'var(--green-mid)';
    const icon = course.subject === 'Биология' ? '🌿' : course.subject === 'Химия' ? '⚗️' : '🧬';

    return `
    <div style="background:var(--card);border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);border:1px solid var(--green-xpale);margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:1.3rem">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.95rem;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(course.title)}</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:1px">${done} из ${total} заданий выполнено</div>
        </div>
        <div style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:800;color:${colorClass};white-space:nowrap">${pct}%</div>
      </div>
      <div style="height:8px;background:var(--green-xpale);border-radius:10px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${colorClass},${pct<40?'var(--green-light)':pct<80?'#fcd34d':'#52d68a'});border-radius:10px;transition:width 0.6s ease"></div>
      </div>
      <div style="display:flex;gap:14px;margin-top:8px;font-size:0.75rem;color:var(--text3)">
        ${courseMats.length  ? `<span>📚 ${doneMats}/${courseMats.length} прочитано</span>` : ''}
        ${courseTests.length ? `<span>📋 ${doneTests}/${courseTests.length} тестов</span>` : ''}
        ${courseHW.length    ? `<span>✏️ ${doneHW}/${courseHW.length} ДЗ</span>` : ''}
      </div>
    </div>`;
  }).filter(Boolean).join('');

  if (html) {
    el.innerHTML = `
      <div class="card-title" style="margin-bottom:12px"><span class="dot"></span>📊 Прогресс по курсам</div>
      ${html}`;
  } else {
    el.innerHTML = '';
  }
}


// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// РОДИТЕЛЬСКИЙ ПОРТАЛ — полная версия
// ═══════════════════════════════════════════════════════

let _parentTab = 'feed';          // 'feed' | 'chat' | 'grades' | 'payments' | 'lessons'


// ══════════════════════════════════════════════════════════
// PARENT SETTINGS
// ══════════════════════════════════════════════════════════
let _parentSettingsTab = 'tg';

function renderParentSettings(){
  const el = document.getElementById('page-parent-settings');
  if(!el) return;
  const tabs = [
    {id:'tg',   icon:'✈️',  label:'Уведомления'},
    {id:'docs', icon:'📄', label:'Документы'},
  ];
  const tabBar = tabs.map(t=>`
    <div class="tab ${_parentSettingsTab===t.id?'active':''}"
      onclick="_parentSettingsTab='${t.id}';renderParentSettings()">
      ${t.icon} ${t.label}
    </div>`).join('');
  el.innerHTML = `
    <div class="page-title">⚙️ Настройки</div>
    <div class="tabs" style="margin-bottom:20px">${tabBar}</div>
    <div id="parent-settings-body"></div>`;
  const body = document.getElementById('parent-settings-body');
  if(!body) return;
  if(_parentSettingsTab === 'tg'){
    _renderParentTgSettings(body);
  } else if(_parentSettingsTab === 'docs'){
    _renderParentDocs(body);
  }
}

function parentNotifKey(pid){ return 'biohim_parent_notif_'+pid; }
function loadParentNotifSettings(pid){
  const raw = localStorage.getItem(parentNotifKey(pid));
  const def = { tgChatId: '', types: { hw:true, test:true, chat:true, payment:true } };
  if(!raw) return def;
  try{ return Object.assign({}, def, JSON.parse(raw)); } catch(e){ return def; }
}
function saveParentNotifData(pid, s){ localStorage.setItem(parentNotifKey(pid), JSON.stringify(s)); }

async function sendParentTelegramNotif(pid, type, text){
  const settings = loadParentNotifSettings(pid);
  if(!settings.tgChatId) return;
  if(settings.types[type] === false) return;
  // Resolve student name
  const users = load('users')||[];
  const parent = users.find(u=>u.id===pid);
  const student = parent ? users.find(u=>u.id===parent.linkedStudentId) : null;
  const name = student ? student.name : 'Ученик';
  const msg = `👨‍👩‍👧 *BioХим* — ${name}\n\n${text}`;
  try{
    await tgApiCall('sendMessage', { chat_id: settings.tgChatId, text: msg, parse_mode:'Markdown' });
  } catch(e){ console.warn('Parent TG send error:', e); }
}

function _renderParentTgSettings(container){
  const pid = currentUser.id;
  const settings = loadParentNotifSettings(pid);
  const botName = localStorage.getItem(adminTgBotKey()) || '';
  const botLink = botName ? `<a href="https://t.me/${botName.replace('@','')}" target="_blank" style="color:#2AABEE;font-weight:700;text-decoration:none">${botName}</a>` : '(бот не настроен — обратитесь к преподавателю)';

  const types = [
    {key:'hw',      icon:'✏️', name:'Домашние задания',  desc:'Новые ДЗ и результаты проверки'},
    {key:'test',    icon:'📋', name:'Тесты и пробники',  desc:'Новые тесты и результаты'},
    {key:'payment', icon:'💰', name:'Оплата',            desc:'Пополнение, списания, задолженности'},
    {key:'chat',    icon:'💬', name:'Сообщения',         desc:'Новые сообщения от преподавателя'},
  ];
  const typesHtml = types.map(t=>`
    <div class="toggle-row">
      <div class="toggle-info">
        <div class="toggle-name">${t.icon} ${t.name}</div>
        <div class="toggle-desc">${esc(t.desc)}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="parent-notif-type-${t.key}" ${settings.types[t.key]!==false?'checked':''}>
        <span class="toggle-slider"></span>
      </label>
    </div>`).join('');

  container.innerHTML = `
    <div class="card" style="max-width:560px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        <div style="width:48px;height:48px;border-radius:14px;background:#2AABEE;display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0">✈️</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:1.05rem;color:var(--accent)">Telegram</div>
          <div style="font-size:0.78rem;color:var(--text3)">Уведомления о сданных работах ребёнка</div>
        </div>
        <div id="parent-tg-status-badge">
          ${settings.tgChatId
            ? '<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:10px">✅ Подключён</span>'
            : '<span style="background:var(--bg);color:var(--text3);font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:10px">Не подключён</span>'}
        </div>
      </div>
      ${settings.tgChatId ? `
        <div style="background:#e8f8f0;border-radius:12px;padding:14px 16px;margin-bottom:12px">
          <div style="font-weight:700;color:#27ae60;margin-bottom:4px">✅ Telegram подключён</div>
          <div style="font-size:0.82rem;color:var(--text2)">Chat ID: <b>${esc(settings.tgChatId)}</b></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-green btn-sm" onclick="testParentTgNotif()">🔔 Отправить тест</button>
          <button class="btn btn-red btn-sm" onclick="disconnectParentTelegram()">Отключить</button>
        </div>
      ` : `
        <div style="background:#e8f4fd;border-radius:12px;padding:14px 16px;margin-bottom:14px;font-size:0.88rem;color:#1565c0;line-height:1.9">
          <b>Как подключить:</b><br>
          1. Перейдите к боту: ${botLink}<br>
          2. Нажмите <b>Запустить</b> или отправьте <code style="background:#fff;padding:1px 7px;border-radius:5px">/start</code><br>
          3. Бот пришлёт вам <b>Chat ID</b> — вставьте его ниже
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Ваш Chat ID</label>
          <input id="parent-tg-chatid" placeholder="Например: 123456789" type="text" inputmode="numeric"
            style="padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.95rem;width:100%;box-sizing:border-box">
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px">Бот пришлёт числовой ID сразу после команды /start</div>
        </div>
        <button class="btn btn-green" style="width:100%" onclick="saveParentTgConnect()">✈️ Подключить Telegram</button>
      `}
    </div>
    <div class="card" style="max-width:560px">
      <div class="card-title"><span class="dot"></span>Какие уведомления получать</div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:12px">Уведомления о событиях ребёнка, которые будут приходить вам</div>
      ${typesHtml}
      <button class="btn btn-green" style="margin-top:16px;width:100%" onclick="saveParentNotifTypes()">💾 Сохранить</button>
    </div>`;
}

function saveParentTgConnect(){
  const pid = currentUser.id;
  const chatId = (document.getElementById('parent-tg-chatid')||{}).value?.trim();
  if(!chatId){ showNotif('Введите Chat ID из Telegram бота'); return; }
  if(!/^\d+$/.test(chatId)){ showNotif('Chat ID — только цифры, например: 123456789'); return; }
  const settings = loadParentNotifSettings(pid);
  settings.tgChatId = chatId;
  saveParentNotifData(pid, settings);
  sendParentTelegramNotif(pid, 'chat', '🎉 Telegram успешно подключён! Теперь вы будете получать уведомления об успехах вашего ребёнка.');
  showNotif('✅ Telegram подключён!');
  renderParentSettings();
}

function disconnectParentTelegram(){
  const pid = currentUser.id;
  const settings = loadParentNotifSettings(pid);
  settings.tgChatId = '';
  saveParentNotifData(pid, settings);
  showNotif('Telegram отключён');
  renderParentSettings();
}

function testParentTgNotif(){
  const pid = currentUser.id;
  const users = load('users')||[];
  const parent = users.find(u=>u.id===pid);
  const student = parent ? users.find(u=>u.id===parent.linkedStudentId) : null;
  const name = student ? student.name : 'Ученик';
  sendParentTelegramNotif(pid, 'chat', `👋 Это тестовое уведомление. Ваш ребёнок (${name}) на связи!`);
  showNotif('📨 Тестовое сообщение отправлено');
}

function saveParentNotifTypes(){
  const pid = currentUser.id;
  const settings = loadParentNotifSettings(pid);
  ['hw','test','payment','chat'].forEach(key=>{
    const el = document.getElementById('parent-notif-type-'+key);
    if(el) settings.types[key] = el.checked;
  });
  saveParentNotifData(pid, settings);
  showNotif('✅ Настройки уведомлений сохранены');
}

function _renderParentDocs(container){
  const u = currentUser;
  const contracts = load('contracts') || {};
  const privacyText = contracts.privacy || 'Текст договора о персональных данных не заполнен преподавателем.';
  const rulesText   = contracts.rules   || 'Текст правил занятий не заполнен преподавателем.';
  const signedPrivacy = u.signedPrivacy || false;
  const signedRules   = u.signedRules   || false;

  container.innerHTML = `
    <div class="card" style="max-width:620px;margin-bottom:16px">
      <div class="card-title"><span class="dot"></span>🔒 Договор о персональных данных</div>
      ${signedPrivacy ? `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;background:#e8f8f0;border-radius:10px;font-size:0.88rem;font-weight:700;color:#27ae60">
          ✅ Подписан ${esc(u.signedPrivacyDate||'')}
        </div>` : ''}
      <div style="max-height:260px;overflow-y:auto;background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;padding:14px 16px;font-size:0.87rem;line-height:1.7;color:var(--text2);white-space:pre-wrap;margin-bottom:16px">${esc(privacyText)}</div>
      ${!signedPrivacy ? `
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--text1)">
          <input type="checkbox" id="parent-chk-privacy" style="margin-top:3px;width:18px;height:18px;accent-color:var(--green-mid);flex-shrink:0">
          <span>Я ознакомился(-ась) и согласен(-на) с договором о персональных данных</span>
        </label>
        <button class="btn btn-green" style="margin-top:14px" onclick="signParentContract('privacy')">✍️ Подписать договор</button>
      ` : ''}
    </div>

    <div class="card" style="max-width:620px">
      <div class="card-title"><span class="dot"></span>📋 Правила занятий</div>
      ${signedRules ? `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;background:#e8f8f0;border-radius:10px;font-size:0.88rem;font-weight:700;color:#27ae60">
          ✅ Подписаны ${esc(u.signedRulesDate||'')}
        </div>` : ''}
      <div style="max-height:260px;overflow-y:auto;background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;padding:14px 16px;font-size:0.87rem;line-height:1.7;color:var(--text2);white-space:pre-wrap;margin-bottom:16px">${esc(rulesText)}</div>
      ${!signedRules ? `
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--text1)">
          <input type="checkbox" id="parent-chk-rules" style="margin-top:3px;width:18px;height:18px;accent-color:var(--green-mid);flex-shrink:0">
          <span>Я ознакомился(-ась) и согласен(-на) с правилами занятий</span>
        </label>
        <button class="btn btn-green" style="margin-top:14px" onclick="signParentContract('rules')">✍️ Подписать правила</button>
      ` : ''}
    </div>`;
}

function signParentContract(type){
  const chkId = type === 'privacy' ? 'parent-chk-privacy' : 'parent-chk-rules';
  const chk = document.getElementById(chkId);
  if(!chk || !chk.checked){ showNotif('⚠️ Сначала поставьте галочку согласия'); return; }
  const users = load('users')||[];
  const idx = users.findIndex(u=>u.id===currentUser.id);
  if(idx===-1){ showNotif('⚠️ Ошибка пользователя'); return; }
  const dateStr = new Date().toLocaleDateString('ru');
  if(type==='privacy'){
    users[idx].signedPrivacy = true;
    users[idx].signedPrivacyDate = dateStr;
    currentUser.signedPrivacy = true;
    currentUser.signedPrivacyDate = dateStr;
  } else {
    users[idx].signedRules = true;
    users[idx].signedRulesDate = dateStr;
    currentUser.signedRules = true;
    currentUser.signedRulesDate = dateStr;
  }
  save('users', users);
  saveSession(currentUser);
  const label = type==='privacy' ? 'Договор о персональных данных' : 'Правила занятий';
  _addAdminNotif({
    id: 'an'+Date.now(),
    studentId: currentUser.id,
    studentName: currentUser.name + ' (родитель)',
    type: 'contract',
    text: `📄 ${currentUser.name} (родитель) подписал(-а): ${label}`,
    date: dateStr,
    read: false,
  });
  showNotif('✅ Документ подписан!');
  _parentSettingsTab = 'docs';
  renderParentSettings();
}

function renderParentDashboard(){
  const el = document.getElementById('page-parent-dashboard');
  if(!el) return;

  const sid = currentUser.linkedStudentId;
  const users = load('users')||[];
  const student = users.find(u=>u.id===sid && u.role==='student');

  if(!student){
    el.innerHTML = `<div class="page-title">👨‍👩‍👧 Дашборд родителя</div>
      <div class="card"><div class="empty-state"><div class="big">👤</div><p>Ученик не привязан к аккаунту. Обратитесь к преподавателю.</p></div></div>`;
    return;
  }

  const initials = student.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();

  el.innerHTML = `
    <div class="page-title">👨‍👩‍👧 Портал родителя</div>
    <div class="page-sub">Успехи и общение — всё в одном месте</div>

    <!-- Шапка ученика -->
    <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg,var(--green-xpale),var(--bg))">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--green-mid));display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.3rem;font-weight:700;flex-shrink:0">${initials}</div>
        <div style="flex:1">
          <div style="font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--accent);font-weight:700">${esc(student.name)}</div>
          <div style="font-size:0.8rem;color:var(--text3)">${student.grade||''} ${student.subject?'· '+student.subject:''} ${student.format?'· '+student.format:''}</div>
        </div>
        <div id="parent-chat-badge-wrap"></div>
      </div>
    </div>

    <!-- Вкладки -->
    <div class="tabs" style="margin-bottom:18px" id="parent-tabs">
      <div class="tab ${_parentTab==='feed'?'active':''}" onclick="switchParentTab('feed')">📰 Лента</div>
      <div class="tab ${_parentTab==='chat'?'active':''}" onclick="switchParentTab('chat')">💬 Чат <span id="parent-chat-badge"></span></div>
      <div class="tab ${_parentTab==='grades'?'active':''}" onclick="switchParentTab('grades')">🏅 Оценки</div>
      <div class="tab ${_parentTab==='payments'?'active':''}" onclick="switchParentTab('payments')">💰 Оплата</div>
      <div class="tab ${_parentTab==='lessons'?'active':''}" onclick="switchParentTab('lessons')">📅 Занятия</div>
    </div>

    <div id="parent-tab-body"></div>`;

  _renderParentTab(sid, student);
  _updateParentChatBadge(sid);

  // Подписка на чат родителя (реалтайм через общий Firebase чат ученика)
  subscribeChatSid(sid, (updSid) => {
    _updateParentChatBadge(updSid);
    if(_parentTab === 'chat') _renderParentChatTab(updSid);
  });
}

function switchParentTab(tab){
  _parentTab = tab;
  const sid = currentUser.linkedStudentId;
  const student = (load('users')||[]).find(u=>u.id===sid);
  if(!student) return;
  document.querySelectorAll('#parent-tabs .tab').forEach(t=>t.className='tab');
  const idx = ['feed','chat','grades','payments','lessons'].indexOf(tab);
  const tabs = document.querySelectorAll('#parent-tabs .tab');
  if(tabs[idx]) tabs[idx].className='tab active';
  _renderParentTab(sid, student);
}

function _renderParentTab(sid, student){
  const body = document.getElementById('parent-tab-body');
  if(!body) return;
  if(_parentTab==='feed')     { body.innerHTML = _buildParentFeed(sid, student); }
  if(_parentTab==='chat')     { _renderParentChatTab(sid); if(currentUser.role==='parent') markParentChatRead(sid); _updateParentChatBadge(sid); }
  if(_parentTab==='grades')   { body.innerHTML = _buildParentGrades(sid); }
  if(_parentTab==='payments') { body.innerHTML = _buildParentPayments(sid); }
  if(_parentTab==='lessons')  { body.innerHTML = _buildParentLessons(sid); }
}

// ── ЛЕНТА ────────────────────────────────────────────────────────
function _buildParentFeed(sid, student){
  const tests    = (load('tests')||[]).filter(t=>t.studentId===sid&&!t.isLibrary);
  const hws      = (load('hw')||[]).filter(h=>h.studentId===sid&&!h.isLibrary);
  const trials   = (load('trials')||[]).filter(t=>t.studentId===sid&&!t.isLibrary);
  const att      = (()=>{const _r=load('attendance')||[];return Array.isArray(_r)?_r:Object.values(_r);})().filter(a=>a.studentId===sid);

  const events = [];

  // Новые задания (не сданные)
  tests.filter(t=>!t.submitted).forEach(t=>events.push({
    date: t.date, icon:'📝', color:'#e8f4fd', border:'#90caf9',
    title: `Новый тест: «${t.title}»`,
    sub: t.due ? `📅 Срок: ${t.due}` : 'Срок не указан',
    badge: '<span style="background:#fff3cd;color:#856404;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">⏳ Ожидает сдачи</span>'
  }));
  hws.filter(h=>!h.submitted).forEach(h=>{
    const overdue = h.due && new Date(h.due.split('.').reverse().join('-')) < new Date();
    events.push({
      date: h.date, icon:'✏️', color: overdue?'#fff0f0':'#fff8e1', border: overdue?'#f48fb1':'#ffe082',
      title: `Домашнее задание: «${h.title}»`,
      sub: h.due ? `📅 Срок: ${h.due}` : 'Срок не указан',
      badge: overdue
        ? '<span style="background:#ffebee;color:#c0392b;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">🚨 Просрочено</span>'
        : '<span style="background:#fff3cd;color:#856404;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">⏳ Не сдано</span>'
    });
  });
  trials.filter(t=>!t.submitted).forEach(t=>events.push({
    date: t.date, icon:'🧪', color:'#f3e5f5', border:'#ce93d8',
    title: `Пробный экзамен: «${t.title}»`,
    sub: t.subject||'',
    badge: '<span style="background:#fff3cd;color:#856404;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">⏳ Ожидает</span>'
  }));

  // Сданные работы
  tests.filter(t=>t.submitted).forEach(t=>{
    const pct = t.autoTotal ? Math.round((t.autoScore||0)/t.autoTotal*100) : null;
    const grade = t.autoGrade || (pct!=null?calcGrade(pct,t.gradeConfig):null);
    events.push({
      date: t.date, icon:'📋', color:'#e8f8f0', border:'#81c784',
      title: `Тест сдан: «${t.title}»`,
      sub: pct!=null ? `Результат: ${pct}%` : 'Ожидает проверки',
      badge: grade ? `<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">Оценка: ${grade}</span>` : ''
    });
  });
  hws.filter(h=>h.submitted).forEach(h=>events.push({
    date: h.date, icon:'✅', color:'#e8f8f0', border:'#81c784',
    title: `ДЗ сдано: «${h.title}»`,
    sub: 'Домашняя работа',
    badge: '<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">✅ Сдано</span>'
  }));
  trials.filter(t=>t.submitted).forEach(t=>{
    const pct = t.autoTotal ? Math.round((t.autoScore||0)/t.autoTotal*100) : null;
    events.push({
      date: t.date, icon:'🎯', color:'#e8f8f0', border:'#81c784',
      title: `Пробник пройден: «${t.title}»`,
      sub: pct!=null ? `Результат: ${pct}%` : 'Ожидает проверки',
      badge: pct!=null ? `<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">${pct}%</span>` : ''
    });
  });

  // Занятия
  att.forEach(a=>events.push({
    date: a.date, icon: a.present?'📅':'🚫', color: a.present?'#f0f7ff':'#fff0f0', border: a.present?'#90caf9':'#f48fb1',
    title: a.present ? `Занятие — ${a.topic||'тема не указана'}` : `Пропуск занятия`,
    sub: a.time||'',
    badge: a.present
      ? '<span style="background:#e8f4fd;color:#1565c0;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">✅ Присутствовал</span>'
      : '<span style="background:#ffebee;color:#c0392b;font-size:0.72rem;padding:2px 8px;border-radius:8px;font-weight:700">❌ Отсутствовал</span>'
  }));

  if(!events.length) return `<div class="card"><div class="empty-state"><div class="big">📭</div><p>Активности пока нет</p></div></div>`;

  // Сортировка: свежие — сверху (строки дд.мм.гггг → сравниваем как даты)
  events.sort((a,b)=>{
    const da = a.date ? a.date.split('.').reverse().join('-') : '0000-00-00';
    const db = b.date ? b.date.split('.').reverse().join('-') : '0000-00-00';
    return da < db ? 1 : da > db ? -1 : 0;
  });

  return `<div class="card">
    <div class="card-title"><span class="dot"></span>📰 Лента активности</div>
    ${events.map(e=>`
      <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--green-xpale);align-items:flex-start">
        <div style="width:38px;height:38px;border-radius:10px;background:${e.color};border:1.5px solid ${e.border};display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${e.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.88rem;color:var(--accent)">${esc(e.title)}</div>
          ${e.sub?`<div style="font-size:0.78rem;color:var(--text3);margin-top:2px">${esc(e.sub)}</div>`:''}
          <div style="margin-top:5px;display:flex;align-items:center;gap:8px">
            ${e.badge}
            ${e.date?`<span style="font-size:0.7rem;color:var(--text3)">${e.date}</span>`:''}
          </div>
        </div>
      </div>`).join('')}
  </div>`;
}

// ── ЧАТ РОДИТЕЛЬ ↔ ПРЕПОДАВАТЕЛЬ ────────────────────────────────
// Родитель пишет в тот же чат что и ученик, но с пометкой from:'parent'
// Преподаватель видит сообщения родителя в обычном чат-окне ученика

function _renderParentChatTab(sid){
  const body = document.getElementById('parent-tab-body');
  if(!body) return;

  body.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid var(--green-xpale);background:var(--bg2)">
        <div style="font-weight:700;color:var(--accent);font-size:0.95rem">💬 Сообщения преподавателю</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">Преподаватель видит ваши сообщения в разделе «Чат»</div>
      </div>
      <div id="parent-chat-messages" style="height:380px;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:4px"></div>
      <div style="padding:12px 16px;border-top:1px solid var(--green-xpale);display:flex;gap:8px;background:var(--card)">
        <textarea id="parent-chat-input" placeholder="Написать преподавателю…" rows="2"
          style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.9rem;resize:none;outline:none;transition:border .2s"
          onfocus="this.style.borderColor='var(--green-mid)'" onblur="this.style.borderColor='var(--green-pale)'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendParentMsg()}"></textarea>
        <button class="btn-main" style="width:auto;padding:10px 20px;align-self:flex-end" onclick="sendParentMsg()">➤</button>
      </div>
    </div>`;

  _renderParentChatMessages(sid);
  markParentChatRead(sid);
  _updateParentChatBadge(sid);
}

function _renderParentChatMessages(sid){
  const el = document.getElementById('parent-chat-messages');
  if(!el) return;
  const msgs = loadChat(sid);
  if(!msgs.length){
    el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px 0;font-size:0.9rem">👋 Напишите преподавателю — ответим в ближайшее время</div>';
    return;
  }
  let lastDate = '';
  el.innerHTML = msgs.map(m=>{
    const isParent = m.from === 'parent';
    const isAdmin  = m.from === 'admin';
    const mine = isParent; // родитель видит свои сообщения справа
    let html = '';
    if(m.date !== lastDate){
      html += `<div style="text-align:center;font-size:0.72rem;color:var(--text3);padding:6px 0">${escHtml(m.date)}</div>`;
      lastDate = m.date;
    }
    const label = isAdmin ? '👩‍🏫 Преподаватель' : isParent ? '👨‍👩‍👧 Вы' : '🎓 Ученик';
    const bg = mine ? 'var(--green-deep)' : (isAdmin ? 'var(--green-xpale)' : '#f0f0f0');
    const color = mine ? '#fff' : 'var(--text)';
    html += `<div style="display:flex;flex-direction:column;align-items:${mine?'flex-end':'flex-start'};margin-bottom:6px">
      <div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">${label}</div>
      <div style="max-width:78%;padding:10px 14px;border-radius:${mine?'16px 16px 4px 16px':'16px 16px 16px 4px'};background:${bg};color:${color};font-size:0.88rem;line-height:1.5;word-break:break-word">${escHtml(m.text)}</div>
      <div style="font-size:0.68rem;color:var(--text3);margin-top:2px">${escHtml(m.time||"")}</div>
    </div>`;
    return html;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function sendParentMsg(){
  const inp = document.getElementById('parent-chat-input');
  const text = inp ? inp.value.trim() : '';
  if(!text) return;
  const sid = currentUser.linkedStudentId;
  const msgs = loadChat(sid);
  msgs.push({
    id: 'm'+Date.now(), from: 'parent', text,
    time: new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}),
    date: new Date().toLocaleDateString('ru'), read: false
  });
  saveChat(sid, msgs);
  if(inp) inp.value = '';
  _renderParentChatMessages(sid);
  // Уведомить преподавателя
  const parentName = currentUser.name || 'Родитель';
  const studentName = (load('users')||[]).find(u=>u.id===sid)?.name || '';
  _addAdminNotif({
    id:'an'+Date.now(), studentId: sid,
    studentName: `${parentName} (родитель ${studentName})`,
    type:'chat', text:`👨‍👩‍👧 ${parentName}: ${text.substring(0,80)}`,
    time: new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}),
    date: new Date().toLocaleDateString('ru'), read: false
  });
}

function markParentChatRead(sid){
  const msgs = loadChat(sid);
  let changed = false;
  msgs.forEach(m=>{ if(m.from==='admin' && !m.read){ m.read=true; changed=true; } });
  if(changed) saveChat(sid, msgs);
}

function _updateParentChatBadge(sid){
  const msgs = loadChat(sid);
  const unread = msgs.filter(m=>m.from==='admin' && !m.read).length;
  const badge = document.getElementById('parent-chat-badge');
  if(badge) badge.innerHTML = unread > 0 ? `<span style="background:var(--red);color:#fff;border-radius:10px;padding:1px 6px;font-size:0.68rem;font-weight:700;margin-left:4px">${unread}</span>` : '';
}

// ── ОЦЕНКИ ───────────────────────────────────────────────────────
function _buildParentGrades(sid){
  const tests  = (load('tests')||[]).filter(t=>t.studentId===sid&&!t.isLibrary);
  const hws    = (load('hw')||[]).filter(h=>h.studentId===sid&&!h.isLibrary);
  const trials = (load('trials')||[]).filter(t=>t.studentId===sid&&!t.isLibrary);

  const items = [];
  tests.forEach(t=>{
    const attempts = t.attempts||[];
    if(attempts.length) attempts.forEach(a=>items.push({icon:'📋',title:t.title,date:a.date,pct:a.pct,grade:a.grade}));
    else if(t.submitted){ const pct=t.autoTotal?Math.round((t.autoScore||0)/t.autoTotal*100):null; items.push({icon:'📋',title:t.title,date:t.date,pct,grade:t.autoGrade}); }
  });
  hws.forEach(h=>{
    const attempts = h.attempts||[];
    if(attempts.length) attempts.forEach(a=>items.push({icon:'✏️',title:h.title,date:a.date,pct:a.pct,grade:a.grade}));
    else if(h.submitted){ const _hcp=h.openChecked||!(h.questions||[]).some(q=>q.type==='open'); const _hpp=h.autoTotal?Math.round((h.autoScore||0)/h.autoTotal*100):(h.autoPct||null); items.push({icon:'✏️',title:h.title,date:h.date,pct:_hcp?_hpp:null,grade:_hcp?(h.finalGrade||h.autoGrade||null):null,pending:!_hcp}); }
  });
  trials.forEach(t=>{
    if(t.submitted){ const pct=t.autoTotal?Math.round((t.autoScore||0)/t.autoTotal*100):null; items.push({icon:'🎯',title:t.title,date:t.date,pct,grade:t.autoGrade||(pct!=null?calcGrade(pct,t.gradeConfig):null)}); }
  });

  const graded = items.filter(i=>i.grade);
  const avgPct = graded.length ? Math.round(graded.reduce((s,i)=>s+(i.pct||0),0)/graded.length) : null;

  items.sort((a,b)=>{
    const da=a.date?a.date.split('.').reverse().join('-'):'0000-00-00';
    const db=b.date?b.date.split('.').reverse().join('-'):'0000-00-00';
    return da<db?1:da>db?-1:0;
  });

  if(!items.length) return `<div class="card"><div class="empty-state"><div class="big">🏅</div><p>Работ пока нет</p></div></div>`;

  const gradeColor = {5:'#27ae60',4:'#2196f3',3:'#ff9800',2:'#c0392b'};

  return `
    ${avgPct!=null?`<div class="card" style="margin-bottom:12px;background:linear-gradient(135deg,var(--green-xpale),var(--bg))">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="font-size:2rem;font-weight:700;color:var(--green-deep)">${avgPct}%</div>
        <div><div style="font-weight:600;color:var(--accent)">Средний балл</div><div style="font-size:0.8rem;color:var(--text3)">По ${graded.length} оценённым работам</div></div>
      </div>
    </div>`:''}
    <div class="card">
      <div class="card-title"><span class="dot"></span>🏅 История оценок</div>
      ${items.map(i=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--green-xpale)">
          <span style="font-size:1.2rem">${i.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:0.88rem">${esc(i.title)}</div>
            <div style="font-size:0.75rem;color:var(--text3)">${i.date||''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${i.grade?`<div style="font-size:1.3rem;font-weight:800;color:${gradeColor[i.grade]||'var(--text)'}">${i.grade}</div>`:''}
            ${i.pct!=null?`<div style="font-size:0.75rem;color:var(--text3)">${i.pct}%</div>`:''}
            ${i.pending?`<span style="font-size:0.72rem;color:#856404">⏳ На проверке</span>`:''}
          </div>
        </div>`).join('')}
    </div>`;
}

// ── ОПЛАТА ───────────────────────────────────────────────────────
function _buildParentPayments(sid){
  const payments = (load('payments')||[]).filter(p=>p.studentId===sid);
  if(!payments.length) return `<div class="card"><div class="empty-state"><div class="big">💰</div><p>Записей об оплате нет</p></div></div>`;
  const statusMeta = {
    paid:    {cls:'badge-green', icon:'✅', lbl:'Оплачено'},
    unpaid:  {cls:'badge-red',   icon:'❌', lbl:'Не оплачено'},
    partial: {cls:'badge-gold',  icon:'⚠️', lbl:'Частично'}
  };
  const total = payments.filter(p=>p.status==='paid').reduce((s,p)=>s+(+p.amount||0),0);
  const debt  = payments.filter(p=>p.status==='unpaid'||p.status==='partial').reduce((s,p)=>s+(+p.amount||0),0);
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-num">${total}₽</div><div class="stat-label">Оплачено</div></div>
      <div class="stat-card" style="${debt>0?'background:#fff0f0':''}"><div class="stat-icon">❌</div><div class="stat-num" style="${debt>0?'color:#c0392b':''}">${debt}₽</div><div class="stat-label">К оплате</div></div>
    </div>
    <div class="card">
      <div class="card-title"><span class="dot"></span>💰 История оплат</div>
      ${payments.slice().reverse().map(p=>{
        const m = statusMeta[p.status]||statusMeta.unpaid;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--green-xpale)">
          <div>
            <div style="font-weight:600;font-size:0.88rem">${esc(p.period)}</div>
            ${p.note?`<div style="font-size:0.78rem;color:var(--text3)">${esc(p.note)}</div>`:''}
            <div style="font-size:0.73rem;color:var(--text3)">${p.date||''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
            <span style="font-weight:700">${p.amount}₽</span>
            <span class="badge ${m.cls}">${m.icon} ${m.lbl}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ── ЗАНЯТИЯ ──────────────────────────────────────────────────────
function _buildParentLessons(sid){
  const att = (()=>{const _r=load('attendance')||[];return Array.isArray(_r)?_r:Object.values(_r);})().filter(a=>a.studentId===sid);
  if(!att.length) return `<div class="card"><div class="empty-state"><div class="big">📅</div><p>Занятий пока нет</p></div></div>`;
  const present = att.filter(a=>a.present).length;
  const absent  = att.filter(a=>!a.present).length;
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
      <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-num">${att.length}</div><div class="stat-label">Всего занятий</div></div>
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-num">${present}</div><div class="stat-label">Посещено</div></div>
      <div class="stat-card" style="${absent>0?'background:#fff0f0':''}"><div class="stat-icon">🚫</div><div class="stat-num" style="${absent>0?'color:#c0392b':''}">${absent}</div><div class="stat-label">Пропущено</div></div>
    </div>
    <div class="card">
      <div class="card-title"><span class="dot"></span>📅 История занятий</div>
      ${att.slice().reverse().map(a=>`
        <div style="padding:10px 0;border-bottom:1px solid var(--green-xpale)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:600;font-size:0.88rem">📅 ${esc(a.date)}${a.time?' · '+esc(a.time):''}</div>
              ${a.topic?`<div style="font-size:0.8rem;color:var(--text2);margin-top:2px">📖 ${esc(a.topic)}</div>`:''}
              ${a.duration?`<div style="font-size:0.75rem;color:var(--text3)">${a.duration} мин</div>`:''}
            </div>
            <span class="badge ${a.present?'badge-green':'badge-red'}" style="flex-shrink:0">${a.present?'✅ Был':'❌ Отсутствовал'}</span>
          </div>
          ${a.present&&a.costPerStudent?`<div style="font-size:0.73rem;color:var(--text3);margin-top:4px">💰 ${a.costPerStudent}₽ · ${a.paid?'✅ Оплачено':'❌ Не оплачено'}</div>`:''}
        </div>`).join('')}
    </div>`;
}

// ══════════════════════════════════════════════════════════
// STUDENT LIBRARY — объединённая страница «Материалы и повторение»
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
// STUDENT PROGRESS — объединённая страница «Мой прогресс»
// Оценки + Цели ЕГЭ + Челленджи на одной странице
// ══════════════════════════════════════════════════════════
let _progressTab = 'grades';
function renderStudentProgress(){
  const el = document.getElementById('page-student-progress');
  if(!el) return;
  const tabs = [
    {id:'grades',     icon:'🏅', label:'Оценки'},
    {id:'goals',      icon:'🎯', label:'Цели ЕГЭ'},
    {id:'challenges', icon:'🏆', label:'Челленджи'},
  ];
  const tabBar = tabs.map(t => `
    <div class="tab ${_progressTab===t.id?'active':''}"
      onclick="_progressTab='${t.id}';renderStudentProgress()">
      ${t.icon} ${t.label}
    </div>`).join('');

  el.innerHTML = `
    <div class="page-title">📊 Мой прогресс</div>
    <div class="tabs" style="margin-bottom:20px">${tabBar}</div>
    <div id="progress-tab-content"></div>`;

  const body = document.getElementById('progress-tab-content');
  if(!body) return;

  if(_progressTab === 'grades'){
    body.innerHTML = `<div id="progress-grades-content"></div>`;
    if(typeof renderStudentGrades === 'function') renderStudentGrades(document.getElementById('progress-grades-content'));
  } else if(_progressTab === 'goals'){
    body.innerHTML = `<div id="goals-progress-container"></div>`;
    if(typeof renderStudentGoals === 'function') renderStudentGoals('goals-progress-container');
  } else if(_progressTab === 'challenges'){
    body.innerHTML = `<div id="page-student-challenges"></div>`;
    if(typeof renderStudentChallenges === 'function') renderStudentChallenges();
  }
}

// ══════════════════════════════════════════════════════════
// STUDENT SETTINGS — Настройки: профиль + пароль + уведомления
// ══════════════════════════════════════════════════════════
let _settingsTab = 'profile';
function renderStudentSettings(){
  const el = document.getElementById('page-student-settings');
  if(!el) return;
  const tabs = [
    {id:'profile',  icon:'👤', label:'Профиль'},
    {id:'notifs',   icon:'🔔', label:'Уведомления'},
    {id:'docs',     icon:'📄', label:'Документы'},
  ];
  const tabBar = tabs.map(t => `
    <div class="tab ${_settingsTab===t.id?'active':''}"
      onclick="_settingsTab='${t.id}';renderStudentSettings()">
      ${t.icon} ${t.label}
    </div>`).join('');

  el.innerHTML = `
    <div class="page-title">⚙️ Настройки</div>
    <div class="tabs" style="margin-bottom:20px">${tabBar}</div>
    <div id="settings-tab-content"></div>`;

  const body = document.getElementById('settings-tab-content');
  if(!body) return;

  if(_settingsTab === 'profile'){
    _renderStudentProfileEdit(body);
  } else if(_settingsTab === 'notifs'){
    _renderStudentNotifInline(body);
    if(typeof renderNotifSettingsStudent === 'function') renderNotifSettingsStudent();
  } else if(_settingsTab === 'docs'){
    _renderStudentDocs(body);
  }
}

function _renderStudentProfileEdit(container){
  const u = currentUser;
  if(!u){ container.innerHTML = '<div class="empty-state">Нет данных</div>'; return; }
  container.innerHTML = `
    <div class="card" style="max-width:520px">
      <div class="card-title"><span class="dot"></span>👤 Личные данные</div>
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:22px">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--green-mid));
          display:flex;align-items:center;justify-content:center;font-size:1.8rem;color:#fff;font-weight:800;flex-shrink:0">
          ${esc((u.name||'?')[0].toUpperCase())}
        </div>
        <div>
          <div style="font-weight:800;font-size:1.05rem;color:var(--accent)">${esc(u.name||'')}</div>
          <div style="font-size:0.82rem;color:var(--text3)">${esc(u.login||'')} · ученик</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group" style="margin:0"><label>Имя</label>
          <input id="sp-name" value="${esc(u.name||'')}" placeholder="Ваше имя"></div>
        <div class="form-group" style="margin:0"><label>Дата рождения</label>
          <input id="sp-birth" type="date" value="${esc(u.birth||'')}"></div>
        <div class="form-group" style="margin:0"><label>Телефон</label>
          <input id="sp-phone" value="${esc(u.phone||'')}" placeholder="+7 900 000-00-00"></div>
        <div class="form-group" style="margin:0"><label>Email</label>
          <input id="sp-email" type="email" value="${esc(u.email||'')}" placeholder="email@mail.ru"></div>
      </div>
      <button class="btn btn-green" style="margin-top:16px" onclick="saveStudentProfile()">💾 Сохранить данные</button>
    </div>

    <div class="card" style="max-width:520px;margin-top:16px">
      <div class="card-title"><span class="dot"></span>🔐 Изменить пароль</div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:14px">Для безопасности введите текущий пароль перед сменой</div>
      <div class="form-group"><label>Текущий пароль</label>
        <input id="sp-old-pass" type="password" placeholder="Текущий пароль"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group" style="margin:0"><label>Новый пароль</label>
          <input id="sp-new-pass" type="password" placeholder="Новый пароль"></div>
        <div class="form-group" style="margin:0"><label>Повторите пароль</label>
          <input id="sp-new-pass2" type="password" placeholder="Повторите пароль"></div>
      </div>
      <div id="sp-pass-msg" style="font-size:0.82rem;margin-top:8px;display:none"></div>
      <button class="btn btn-outline" style="margin-top:14px" onclick="saveStudentPassword()">🔐 Сменить пароль</button>
    </div>`;
}

function saveStudentProfile(){
  const name  = (document.getElementById('sp-name')  || {}).value?.trim();
  const birth = (document.getElementById('sp-birth') || {}).value;
  const phone = (document.getElementById('sp-phone') || {}).value?.trim();
  const email = (document.getElementById('sp-email') || {}).value?.trim();
  if(!name){ showNotif('⚠️ Введите имя'); return; }

  const users = load('users') || [];
  const idx = users.findIndex(u => u.id === currentUser.id);
  if(idx === -1){ showNotif('⚠️ Ошибка — пользователь не найден'); return; }

  users[idx].name  = name;
  users[idx].birth = birth;
  users[idx].phone = phone;
  users[idx].email = email;
  save('users', users);

  // Update currentUser in session
  currentUser.name  = name;
  currentUser.birth = birth;
  currentUser.phone = phone;
  currentUser.email = email;
  saveSession(currentUser);

  showNotif('✅ Данные профиля сохранены!');
  renderStudentSettings();
}

async function saveStudentPassword(){
  const oldPass  = (document.getElementById('sp-old-pass')  || {}).value;
  const newPass  = (document.getElementById('sp-new-pass')  || {}).value;
  const newPass2 = (document.getElementById('sp-new-pass2') || {}).value;
  const msgEl    = document.getElementById('sp-pass-msg');

  const showMsg = (text, color) => {
    if(msgEl){ msgEl.textContent = text; msgEl.style.color = color; msgEl.style.display = 'block'; }
  };

  if(!oldPass){ showMsg('⚠️ Введите текущий пароль', 'var(--red)'); return; }
  // ИСПРАВЛЕНО: минимальная длина пароля увеличена с 4 до 8 символов
  if(newPass.length < 8){ showMsg('⚠️ Новый пароль должен быть не менее 8 символов', 'var(--red)'); return; }
  if(newPass !== newPass2){ showMsg('⚠️ Пароли не совпадают', 'var(--red)'); return; }

  const users = load('users') || [];
  const idx = users.findIndex(u => u.id === currentUser.id);
  if(idx === -1){ showMsg('⚠️ Ошибка', 'var(--red)'); return; }

  // ИСПРАВЛЕНО: сравниваем через хеш (убрана проверка plain-text .password)
  const oldHash = await hashPassword(oldPass);
  if(users[idx].passwordHash !== oldHash){
    showMsg('❌ Неверный текущий пароль', 'var(--red)');
    return;
  }

  // ИСПРАВЛЕНО: сохраняем хеш нового пароля, не plain-text
  users[idx].passwordHash = await hashPassword(newPass);
  delete users[idx].password; // удаляем plain-text если остался
  users[idx].mustChangePassword = false;
  save('users', users);
  showMsg('✅ Пароль успешно изменён!', 'var(--green-deep)');
  // Clear fields
  ['sp-old-pass','sp-new-pass','sp-new-pass2'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
}

function _renderStudentDocs(container){
  const u = currentUser;
  const contracts = load('contracts') || {};
  const privacyText = contracts.privacy || 'Текст договора о персональных данных не заполнен преподавателем.';
  const rulesText   = contracts.rules   || 'Текст правил занятий не заполнен преподавателем.';

  const signedPrivacy = u.signedPrivacy || false;
  const signedRules   = u.signedRules   || false;

  container.innerHTML = `
    <div class="card" style="max-width:620px;margin-bottom:16px">
      <div class="card-title"><span class="dot"></span>🔒 Договор о персональных данных</div>
      ${signedPrivacy
        ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;background:#e8f8f0;border-radius:10px;font-size:0.88rem;font-weight:700;color:#27ae60">
             ✅ Подписан ${esc(u.signedPrivacyDate||'')}
           </div>`
        : ''}
      <div style="max-height:260px;overflow-y:auto;background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;padding:14px 16px;font-size:0.87rem;line-height:1.7;color:var(--text2);white-space:pre-wrap;margin-bottom:16px">${esc(privacyText)}</div>
      ${!signedPrivacy ? `
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--text1)">
          <input type="checkbox" id="chk-privacy" style="margin-top:3px;width:18px;height:18px;accent-color:var(--green-mid);flex-shrink:0">
          <span>Я ознакомился(-ась) и согласен(-на) с договором о персональных данных</span>
        </label>
        <button class="btn btn-green" style="margin-top:14px" onclick="signContract('privacy')">✍️ Подписать договор</button>
      ` : ''}
    </div>

    <div class="card" style="max-width:620px">
      <div class="card-title"><span class="dot"></span>📋 Правила занятий</div>
      ${signedRules
        ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;background:#e8f8f0;border-radius:10px;font-size:0.88rem;font-weight:700;color:#27ae60">
             ✅ Подписаны ${esc(u.signedRulesDate||'')}
           </div>`
        : ''}
      <div style="max-height:260px;overflow-y:auto;background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;padding:14px 16px;font-size:0.87rem;line-height:1.7;color:var(--text2);white-space:pre-wrap;margin-bottom:16px">${esc(rulesText)}</div>
      ${!signedRules ? `
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--text1)">
          <input type="checkbox" id="chk-rules" style="margin-top:3px;width:18px;height:18px;accent-color:var(--green-mid);flex-shrink:0">
          <span>Я ознакомился(-ась) и согласен(-на) с правилами занятий</span>
        </label>
        <button class="btn btn-green" style="margin-top:14px" onclick="signContract('rules')">✍️ Подписать правила</button>
      ` : ''}
    </div>`;
}

function signContract(type){
  const chkId = type === 'privacy' ? 'chk-privacy' : 'chk-rules';
  const chk = document.getElementById(chkId);
  if(!chk || !chk.checked){
    showNotif('⚠️ Сначала поставьте галочку согласия');
    return;
  }
  const users = load('users') || [];
  const idx = users.findIndex(u => u.id === currentUser.id);
  if(idx === -1){ showNotif('⚠️ Ошибка пользователя'); return; }
  const dateStr = new Date().toLocaleDateString('ru');
  if(type === 'privacy'){
    users[idx].signedPrivacy = true;
    users[idx].signedPrivacyDate = dateStr;
    currentUser.signedPrivacy = true;
    currentUser.signedPrivacyDate = dateStr;
  } else {
    users[idx].signedRules = true;
    users[idx].signedRulesDate = dateStr;
    currentUser.signedRules = true;
    currentUser.signedRulesDate = dateStr;
  }
  save('users', users);
  saveSession(currentUser);
  // Notify admin
  const label = type === 'privacy' ? 'Договор о персональных данных' : 'Правила занятий';
  _addAdminNotif({
    id: 'an' + Date.now(),
    studentId: currentUser.id,
    studentName: currentUser.name,
    type: 'contract',
    text: `📄 ${currentUser.name} подписал(-а): ${label}`,
    date: dateStr,
    read: false,
  });
  showNotif('✅ Документ подписан!');
  _settingsTab = 'docs';
  renderStudentSettings();
}



function _renderStudentNotifInline(container){
  const botName = localStorage.getItem(adminTgBotKey()) || '';
  const botLink = botName ? `<a href="https://t.me/${botName.replace('@','')}" target="_blank" style="color:#2AABEE;font-weight:700;text-decoration:none">${botName}</a>` : '(бот не настроен — обратитесь к преподавателю)';
  container.innerHTML = `
    <!-- Telegram connect -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        <div style="width:48px;height:48px;border-radius:14px;background:#2AABEE;display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0">✈️</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:1.05rem;color:var(--accent)">Telegram</div>
          <div style="font-size:0.78rem;color:var(--text3)">Мгновенные уведомления прямо в мессенджере</div>
        </div>
        <div id="tg-status-badge"></div>
      </div>
      <div id="tg-connect-block">
        <div style="background:#e8f4fd;border-radius:12px;padding:14px 16px;margin-bottom:14px;font-size:0.88rem;color:#1565c0;line-height:1.9">
          <b>Как подключить:</b><br>
          1. Перейдите к боту: ${botLink}<br>
          2. Нажмите <b>Запустить</b> или отправьте <code style="background:#fff;padding:1px 7px;border-radius:5px">/start</code><br>
          3. Бот пришлёт вам <b>Chat ID</b> — вставьте ниже
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Ваш Chat ID</label>
          <input id="student-tg-chatid" placeholder="Например: 123456789" type="text" inputmode="numeric"
            style="padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.95rem;width:100%;box-sizing:border-box">
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px">Бот пришлёт числовой ID сразу после /start</div>
        </div>
        <button class="btn btn-green" style="width:100%" onclick="saveTgConnect()">✈️ Подключить Telegram</button>
      </div>
      <div id="tg-connected-block" style="display:none">
        <div style="background:#e8f8f0;border-radius:12px;padding:14px 16px;margin-bottom:12px">
          <div style="font-weight:700;color:#27ae60;margin-bottom:4px">✅ Telegram подключён</div>
          <div style="font-size:0.82rem;color:var(--text2)">Chat ID: <b id="tg-connected-name"></b></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-green btn-sm" onclick="testNotifChannel()">🔔 Отправить тест</button>
          <button class="btn btn-red btn-sm" onclick="disconnectTelegram()">Отключить</button>
        </div>
      </div>
    </div>
    <!-- Web Push -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#2d6a4f,#52b788);display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0">🔔</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:1.05rem;color:var(--accent)">Web Push</div>
          <div style="font-size:0.78rem;color:var(--text3)">Уведомления на телефон — даже когда сайт закрыт</div>
        </div>
        <div id="wp-status-badge"></div>
      </div>
      <div id="wp-off-block">
        <div style="background:var(--green-xpale);border-radius:12px;padding:14px 16px;margin-bottom:14px;font-size:0.86rem;color:var(--text2);line-height:1.85">
          ✅ Не нужен Telegram · ✅ Работает в фоне · ✅ Android, iPhone, ПК
        </div>
        <button class="btn btn-green" style="width:100%" onclick="wpSubscribe()">🔔 Включить Web Push</button>
      </div>
      <div id="wp-on-block" style="display:none">
        <div style="background:#e8f8f0;border-radius:12px;padding:14px 16px;margin-bottom:12px">
          <div style="font-weight:700;color:#27ae60;margin-bottom:4px">✅ Web Push включён</div>
          <div style="font-size:0.82rem;color:var(--text2)">Уведомления придут даже когда сайт закрыт</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-green btn-sm" onclick="testWebPush()">🔔 Отправить тест</button>
          <button class="btn btn-red btn-sm" onclick="wpUnsubscribe()">Отключить</button>
        </div>
      </div>
    </div>
    <!-- Notif types -->
    <div class="card">
      <div class="card-title"><span class="dot"></span>Какие уведомления получать</div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:12px">Применяется к Telegram и Web Push</div>
      <div id="notif-types-toggles"></div>
      <button class="btn btn-green" style="margin-top:16px;width:100%" onclick="saveNotifTypes()">💾 Сохранить</button>
    </div>`;
}

let _libraryTab = 'materials';
function renderStudentLibrary(){
  const el = document.getElementById('page-student-library');
  if(!el) return;
  const tabs = [
    {id:'materials',   icon:'📚', label:'Материалы'},
    {id:'repeat',      icon:'🧠', label:'Умное повторение'},
    {id:'flashcards',  icon:'🃏', label:'Флешкарты'},
  ];
  const tabBar = tabs.map(t => `
    <div class="tab ${_libraryTab===t.id?'active':''}"
      onclick="_libraryTab='${t.id}';renderStudentLibrary()">
      ${t.icon} ${t.label}
    </div>`).join('');

  el.innerHTML = `
    <div class="page-title">📚 Материалы и повторение</div>
    <div class="tabs" style="margin-bottom:16px">${tabBar}</div>
    <div id="lib-tab-content"></div>`;

  const body = document.getElementById('lib-tab-content');
  if(!body) return;
  if(_libraryTab === 'materials'){
    body.innerHTML = `
      <div class="filter-bar">
        <div class="filter-pill active" onclick="setMaterialFilter('all',this)">📚 Все</div>
        <div class="filter-pill" onclick="setMaterialFilter('new',this)">🔵 Не просмотрено</div>
        <div class="filter-pill" onclick="setMaterialFilter('viewed',this)">✅ Просмотрено</div>
      </div>
      <div id="s-list-theory-accordion"></div>`;
    renderStudentMaterials();
  } else if(_libraryTab === 'repeat'){
    // Inject repeat page content
    body.innerHTML = `
      <div id="repeat-due-banner" style="display:none;margin-bottom:18px"></div>
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div class="stat-card" style="flex:1;min-width:120px"><div class="stat-icon">🔥</div><div class="stat-num" id="rep-due-count">0</div><div class="stat-label">Нужно повторить</div></div>
        <div class="stat-card" style="flex:1;min-width:120px"><div class="stat-icon">✅</div><div class="stat-num" id="rep-done-count">0</div><div class="stat-label">Повторено сегодня</div></div>
        <div class="stat-card" style="flex:1;min-width:120px"><div class="stat-icon">📚</div><div class="stat-num" id="rep-total-count">0</div><div class="stat-label">Всего уроков</div></div>
      </div>
      <div id="repeat-session" style="display:none">
        <div class="card" id="repeat-card-wrap" style="margin-bottom:18px">
          <div style="font-size:0.75rem;color:var(--text3);margin-bottom:10px" id="repeat-progress-label"></div>
          <div style="font-weight:700;font-size:1.1rem;color:var(--accent);margin-bottom:16px" id="repeat-card-title"></div>
          <div id="repeat-card-body" style="line-height:1.8;color:var(--text2);font-size:0.92rem;white-space:pre-wrap;background:var(--bg);padding:16px;border-radius:10px;border:1px solid var(--green-xpale);max-height:260px;overflow-y:auto"></div>
          <div id="repeat-card-video" style="display:none;margin-top:14px;border-radius:12px;overflow:hidden;background:#000;position:relative;width:100%;height:260px">
            <iframe id="repeat-iframe" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen"></iframe>
          </div>
          <div id="repeat-card-files" style="margin-top:12px"></div>
        </div>
        <div class="card" style="margin-bottom:18px">
          <div style="font-weight:600;margin-bottom:12px;color:var(--accent)">Как хорошо вы помните этот материал?</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn" style="flex:1;background:#fdecea;color:#c0392b;border:none;border-radius:12px;padding:12px;font-weight:700;font-size:0.9rem;cursor:pointer" onclick="rateCard(1)">😟 Плохо<br><span style="font-size:0.72rem;font-weight:400">повтор завтра</span></button>
            <button class="btn" style="flex:1;background:#fff8e1;color:#b8860b;border:none;border-radius:12px;padding:12px;font-weight:700;font-size:0.9rem;cursor:pointer" onclick="rateCard(2)">😐 Средне<br><span style="font-size:0.72rem;font-weight:400">через 3 дня</span></button>
            <button class="btn" style="flex:1;background:#e8f8f0;color:#27ae60;border:none;border-radius:12px;padding:12px;font-weight:700;font-size:0.9rem;cursor:pointer" onclick="rateCard(4)">😊 Хорошо<br><span style="font-size:0.72rem;font-weight:400">через 7 дней</span></button>
            <button class="btn" style="flex:1;background:#e8f4fd;color:#1565c0;border:none;border-radius:12px;padding:12px;font-weight:700;font-size:0.9rem;cursor:pointer" onclick="rateCard(5)">🤩 Отлично<br><span style="font-size:0.72rem;font-weight:400">через 14 дней</span></button>
          </div>
        </div>
      </div>
      <div id="repeat-all-done" style="display:none">
        <div class="empty-state" style="padding:48px 20px">
          <div style="font-size:3rem;margin-bottom:12px">🎉</div>
          <p style="font-weight:700;font-size:1.1rem;color:var(--accent)">Все повторения на сегодня выполнены</p>
          <p style="margin-top:8px;color:var(--text3)">Возвращайтесь завтра — система напомнит, что повторить</p>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><span class="dot"></span>📋 Все уроки для повторения</div>
        <div id="repeat-all-list" style="margin-top:12px"></div>
      </div>`;
    // trigger repeat page logic (reuse existing renderRepeatPage)
    if(typeof renderRepeatPage === 'function') renderRepeatPage();
  } else if(_libraryTab === 'flashcards'){
    body.innerHTML = `<div id="student-flashcards-ui"></div>`;
    if(typeof renderStudentFlashcards === 'function') renderStudentFlashcards();
  }
}

// ══════════════════════════════════════════════════════════
// STUDENT WORKS — объединённая страница «Проверочные работы»
// Тесты + ДЗ + Пробник на одной странице с вкладками
// ══════════════════════════════════════════════════════════
let _worksTab = 'tests';
function renderStudentWorks(){
  const el = document.getElementById('page-student-works');
  if(!el) return;
  const tabs = [
    {id:'tests',   icon:'📋', label:'Тесты'},
    {id:'hw',      icon:'✏️',  label:'Домашние задания'},
    {id:'trial',   icon:'🎯', label:'Пробник'},
  ];
  const tabBar = tabs.map(t => `
    <div class="tab ${_worksTab===t.id?'active':''}"
      onclick="_worksTab='${t.id}';renderStudentWorks()">
      ${t.icon} ${t.label}
    </div>`).join('');

  el.innerHTML = `
    <div class="page-title">📋 Проверочные работы</div>
    <div class="tabs" style="margin-bottom:16px">${tabBar}</div>
    <div id="works-tab-content"></div>`;

  const body = document.getElementById('works-tab-content');
  if(!body) return;

  if(_worksTab === 'tests'){
    body.innerHTML = `
      <div class="filter-bar">
        <div class="filter-pill active" onclick="setTestFilter('all',this)">📋 Все</div>
        <div class="filter-pill" onclick="setTestFilter('pending',this)">⏳ Не сдано</div>
        <div class="filter-pill" onclick="setTestFilter('done',this)">📝 На проверке</div>
        <div class="filter-pill" onclick="setTestFilter('checked',this)">✔️ Проверено</div>
      </div>
      <div id="student-tests-list"></div>`;
    if(currentUser && currentUser.role === 'student') renderStudentTests();
  } else if(_worksTab === 'hw'){
    body.innerHTML = `
      <div class="filter-bar">
        <div class="filter-pill active" onclick="setHWFilter('all',this)">📝 Все</div>
        <div class="filter-pill" onclick="setHWFilter('pending',this)">⏳ Не сдано</div>
        <div class="filter-pill" onclick="setHWFilter('done',this)">📝 На проверке</div>
        <div class="filter-pill" onclick="setHWFilter('checked',this)">✔️ Проверено</div>
      </div>
      <div id="student-hw-list"></div>`;
    if(currentUser && currentUser.role === 'student') renderStudentHW();
  } else if(_worksTab === 'trial'){
    body.innerHTML = `
      <div class="filter-bar">
        <div class="filter-pill active" onclick="setTrialFilter('all',this)">📋 Все</div>
        <div class="filter-pill" onclick="setTrialFilter('pending',this)">⏳ Не пройден</div>
        <div class="filter-pill" onclick="setTrialFilter('done',this)">✅ Пройден</div>
      </div>
      <div id="student-trial-list"></div>`;
    if(currentUser && currentUser.role === 'student') renderStudentTrial();
  }
}

let _materialFilter = 'all';
let _testFilter = 'all';
let _hwFilter = 'all';

function setMaterialFilter(f, el){
  _materialFilter = f;
  const scope = document.getElementById('lib-tab-content') || document.getElementById('page-student-materials');
  if(scope) scope.querySelectorAll('.filter-pill').forEach(p=>p.className='filter-pill');
  el.className = 'filter-pill ' + (f==='all'?'active': f==='viewed'?'active-done':'active-todo');
  renderStudentMaterials();
}
function setTestFilter(f, el){
  _testFilter = f;
  const scope = document.getElementById('works-tab-content') || document.getElementById('page-student-tests');
  if(scope) scope.querySelectorAll('.filter-pill').forEach(p=>p.className='filter-pill');
  const cls = {all:'active', done:'active-done', pending:'active-todo', waiting:'active-todo', checked:'active-done'}[f]||'active';
  el.className = 'filter-pill ' + cls;
  renderStudentTests();
}
function setHWFilter(f, el){
  _hwFilter = f;
  const scope = document.getElementById('works-tab-content') || document.getElementById('page-student-hw');
  if(scope) scope.querySelectorAll('.filter-pill').forEach(p=>p.className='filter-pill');
  const cls = {all:'active', done:'active-done', pending:'active-todo', waiting:'active-todo', checked:'active-done'}[f]||'active';
  el.className = 'filter-pill ' + cls;
  renderStudentHW();
}

function renderStudentMaterials(){
  const sid=currentUser.id;
  const content=(load('content')||[]).filter(c=>c.studentId===sid);
  const el=document.getElementById('s-list-theory-accordion');
  if(!el) return;
  if(!content.length){ el.innerHTML=emptyHTML(); return; }
  const theories = content.filter(c=>c.type==='theory');
  const legacy   = content.filter(c=>c.type!=='theory');
  const legacyAsTheory = legacy.map(c=>({
    ...c,
    type:'theory',
    videoUrl: c.type==='video' ? (c.url||'') : (c.videoUrl||''),
    files: c.type==='video' ? [] : (c.files || (c.attachmentUrl ? [{type:c.type==='word'?'word':'pdf', name:c.title, url:c.attachmentUrl||c.url||''}] : (c.url?[{type:c.type==='word'?'word':'pdf', name:c.title, url:c.url}]:[])))
  }));
  let all = [...theories, ...legacyAsTheory];

  // Apply filter — use c.viewed flag
  const viewed = _getViewedCache(sid);
  if(_materialFilter==='viewed') all = all.filter(c=>viewed[c.id]);
  if(_materialFilter==='new')    all = all.filter(c=>!viewed[c.id]);

  if(!all.length){
    const msgs = {viewed:'Просмотренных материалов пока нет', new:'Все материалы уже просмотрены!'};
    el.innerHTML = `<div class="empty-state"><div class="big">📭</div><p>${msgs[_materialFilter]||'Нет материалов'}</p></div>`;
    return;
  }
  el.innerHTML = all.map(c=>theoryAccordionHTML(c,false,viewed[c.id])).join('');
}

function viewArticle(id){ viewTheory(id); } // legacy alias

// STUDENT TESTS
function renderStudentTests(){
  const sid=currentUser.id;
  let tests=(load('tests')||[]).filter(t=>t.studentId===sid);
  const el=document.getElementById('student-tests-list');
  if(!tests.length){ el.innerHTML=emptyHTML(); return; }

  if(_testFilter==='pending') tests=tests.filter(t=>!t.submitted);
  if(_testFilter==='done')    tests=tests.filter(t=>t.submitted && !(t.openChecked || !(t.questions||[]).some(q=>q.type==='open')));
  if(_testFilter==='checked') tests=tests.filter(t=>t.submitted && (t.openChecked || !(t.questions||[]).some(q=>q.type==='open')));
  tests = tests.slice().reverse();

  if(!tests.length){
    const msgs={
      all:'Тестов пока нет',
      pending:'Все тесты уже сданы! 🎉',
      done:'Нет тестов на проверке',
      checked:'Нет проверенных тестов'
    };
    const icons={all:'📋',pending:'🎉',done:'📝',checked:'✔️'};
    el.innerHTML=`<div class="empty-state"><div class="big">${icons[_testFilter]||'📋'}</div><p>${msgs[_testFilter]||'Нет тестов'}</p></div>`;
    return;
  }
  el.innerHTML=tests.map(t=>{
    const pct = t.autoTotal ? Math.round((t.autoScore||0)/t.autoTotal*100) : 0;
    const hasOpen=(t.questions||[]).some(q=>q.type==='open');
    const fullyChecked=t.submitted&&(!hasOpen||t.openChecked);
    const statusIcon=!t.submitted?'⏳':fullyChecked?'✅':'🔍';
    const statusBadge=!t.submitted
      ?`<span class="badge badge-gold">⏳ Не сдан</span>`
      :fullyChecked
        ?`<span class="badge badge-green">✅ Проверено · ${t.autoScore||0}/${t.autoTotal||0} б. · ${pct}%${t.finalGrade?' · Оценка '+t.finalGrade:''}</span>`
        :`<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке · авто: ${t.autoScore||0}/${t.autoTotal||0} б.</span>`;
    const grade=t.finalGrade||null;
    return `<div class="card collapsible-card" data-item-id="${t.id}">
      <div class="card-title collapsible collapsed" onclick="toggleCollapse('t_${t.id}', this)">
        <span class="dot"></span>${statusIcon} ${esc(t.title)}
        ${grade&&t.submitted?`<span class="grade-result-badge grade-${grade}" style="font-size:0.7rem;padding:2px 8px;margin-left:4px">${grade}</span>`:''}
        <span class="collapse-arrow">▼</span>
      </div>
      <div class="card-collapse-body collapsed" id="cb-t_${t.id}">
        <div style="font-size:0.85rem;color:var(--text3);margin-bottom:10px">
          ⭐ ${t.maxPts||t.autoTotal||0} б.${t.timeLimit?` · ⏱ ${t.timeLimit} мин`:''}
        </div>
        <div style="margin-bottom:12px">${statusBadge}</div>
        ${t.submitted && t.teacherFeedback ? `<div class="feedback-box" style="margin-bottom:10px"><strong>💬 Отзыв преподавателя:</strong><br>${esc(t.teacherFeedback)}</div>` : ''}
        ${t.submitted ? renderTestResults(t) : availGate(t,'takeTest')}
        <div id="cmt-test-${t.id}"></div>
      </div>
    </div>`;
  }).join('');
  // Inject comment threads after render
  tests.filter(t=>t.submitted).forEach(t=>{
    const el2 = document.getElementById(`cmt-test-${t.id}`);
    if(el2) renderCommentThread('test', t.id, el2);
  });
}
function renderTestResults(t){
  const pct=t.autoTotal?Math.round((t.autoScore||0)/t.autoTotal*100):0;
  return `<div style="margin-top:4px">
    <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="badge badge-blue">⭐ Авто-баллы: ${t.autoScore||0}/${t.autoTotal||0} б. (${pct}%)</span>
      ${t.finalGrade
        ?`<span class="grade-result-badge grade-${t.finalGrade}">🎓 Итоговая оценка: ${t.finalGrade}</span>`
        :`<span class="badge badge-gold">⏳ Итоговая оценка ожидает преподавателя</span>`}
    </div>
    ${t.teacherFeedback?`<div class="feedback-box" style="margin-bottom:10px"><strong>💬 Отзыв преподавателя:</strong><br>${esc(t.teacherFeedback)}</div>`:''}
    ${(t.questions||[]).map(q=>renderReviewQuestion(q,t.answers||{})).join('')}
  </div>`;
}

let _takingTest=null; let _testAnswers={};
// ── Таймер теста ──
let _testTimerInterval = null;
let _testTimerSecsLeft = 0;
let _testTimerTotal    = 0;

function _startTestTimer(timeMins) {
  _clearTestTimer();
  if (!timeMins || timeMins <= 0) return;
  _testTimerSecsLeft = timeMins * 60;
  _testTimerTotal    = _testTimerSecsLeft;
  const wrap    = document.getElementById('test-timer-wrap');
  const barWrap = document.getElementById('test-timer-bar-wrap');
  if (wrap)    wrap.style.display    = 'flex';
  if (barWrap) barWrap.style.display = 'block';
  _renderTestTimer();
  _testTimerInterval = setInterval(() => {
    _testTimerSecsLeft--;
    _renderTestTimer();
    if (_testTimerSecsLeft <= 0) {
      _clearTestTimer();
      showNotif('⏰ Время вышло! Тест сдаётся автоматически.');
      submitTest(true);
    }
  }, 1000);
}

function _clearTestTimer() {
  if (_testTimerInterval) { clearInterval(_testTimerInterval); _testTimerInterval = null; }
  const wrap    = document.getElementById('test-timer-wrap');
  const barWrap = document.getElementById('test-timer-bar-wrap');
  if (wrap)    wrap.style.display    = 'none';
  if (barWrap) barWrap.style.display = 'none';
}

function _renderTestTimer() {
  const display = document.getElementById('test-timer-display');
  const bar     = document.getElementById('test-timer-bar');
  if (!display) return;
  const m = Math.floor(_testTimerSecsLeft / 60);
  const s = _testTimerSecsLeft % 60;
  display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const pct = _testTimerTotal > 0 ? (_testTimerSecsLeft / _testTimerTotal) * 100 : 100;
  if (bar) {
    bar.style.width = pct + '%';
    if (pct < 20) bar.style.background = 'linear-gradient(90deg,#ef4444,#f87171)';
    else if (pct < 40) bar.style.background = 'linear-gradient(90deg,var(--gold),#fcd34d)';
    else bar.style.background = 'linear-gradient(90deg,var(--green-mid),var(--green-light))';
  }
  if (display) {
    if (pct < 20) { display.style.background = '#fef2f2'; display.style.color = '#ef4444'; }
    else if (pct < 40) { display.style.background = '#fef9e7'; display.style.color = 'var(--gold)'; }
    else { display.style.background = 'var(--green-xpale)'; display.style.color = 'var(--green-deep)'; }
  }
}

function takeTest(id) {
  const tests=load('tests')||[];
  const t=tests.find(t=>t.id===id);
  if(!t){ showNotif('Тест не найден'); return; }
  if(currentUser && currentUser.role==='student' && t.studentId && t.studentId!==currentUser.id){
    showNotif('⛔ Нет доступа к этому тесту'); console.warn('IDOR attempt takeTest',id); return;
  }
  const maxAttempts=t.maxAttempts||0;
  const attemptsUsed=(t.attempts||[]).length;
  if(maxAttempts>0 && attemptsUsed>=maxAttempts){
    showNotif(`❌ Исчерпано попыток: ${attemptsUsed}/${maxAttempts}`); return;
  }
  _takingTest=t;
  _testAnswers={};
  document.getElementById('take-test-title').textContent=t.title;
  renderTakeTestBody();
  openModal('modal-take-test');
  // Запустить таймер если задан лимит времени
  _startTestTimer(t.timeLimit || t.timeMins || 0);
}
function renderTakeTestBody(){
  const el=document.getElementById('take-test-body');
  el.innerHTML=_takingTest.questions.map((q,i)=>renderStudentQuestion(q,i,'_testAnswers','selectTestOpt')).join('') +
  `<hr class="divider"><button class="btn btn-green" onclick="submitTest()">📤 Сдать тест</button>`;
}
function selectTestOpt(qId,val,isMulti){
  if(isMulti){
    const cur=(_testAnswers[qId]||'').split(',').map(s=>s.trim()).filter(Boolean);
    const idx=cur.indexOf(val);
    if(idx>=0) cur.splice(idx,1); else cur.push(val);
    _testAnswers[qId]=cur.join(',');
  } else {
    _testAnswers[qId]=val;
  }
  renderTakeTestBody();
}
function selectOption(qId,opt){
  _testAnswers[qId]=opt;
  renderTakeTestBody();
}
function calcGrade(pct, gradeConfig){
  const gc = gradeConfig || {5:90,4:75,3:55,2:0};
  if(pct >= (gc[5]||90)) return 5;
  if(pct >= (gc[4]||75)) return 4;
  if(pct >= (gc[3]||55)) return 3;
  return 2;
}

function submitTest(autoSubmit){
  const tests=load('tests')||[];
  const t=tests.find(t=>t.id===_takingTest.id);
  if(!t){ showNotif('Ошибка: тест не найден'); return; }
  _clearTestTimer();
  t.submitted=true; t.answers={..._testAnswers};
  let score=0, total=0;
  t.questions.forEach(q=>{
    const pts=+q.points||1;
    const ans=_testAnswers[q.id]||'';
    if(q.type!=='open'){ total+=pts; if(scoreQuestion(q,ans)) score+=pts; }
  });
  t.autoScore=score;
  t.autoTotal=t.maxPts||total; // maxPts = сумма всех вопросов включая открытые
  t.autoScoreBase=score;
  const pct=t.autoTotal?Math.round(score/t.autoTotal*100):0;
  t.autoPct=pct;
  save('tests',tests);
  _collectAndSaveWrongAnswers('test', t, _testAnswers);
  closeModal('modal-take-test');
  renderStudentTests();
  updateMistakesBadge();
  showNotif(`✅ Тест сдан! Авто: ${score}/${t.autoTotal} б. (${pct}%)`);
  _addAdminNotif({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'submit', text:`📋 ${currentUser.name} сдал(а) тест «${esc(t.title)}»`, date:new Date().toLocaleDateString('ru'), read:false});
  updateAdminBadge();
}

// STUDENT HW
function renderStudentHW(){
  const sid=currentUser.id;
  let hws=(load('hw')||[]).filter(h=>h.studentId===sid);
  const el=document.getElementById('student-hw-list');
  if(!hws.length){ el.innerHTML=emptyHTML(); return; }

  if(_hwFilter==='pending') hws=hws.filter(h=>!h.submitted);
  if(_hwFilter==='done')    hws=hws.filter(h=>h.submitted && !(h.openChecked || !(h.questions||[]).some(q=>q.type==='open')));
  if(_hwFilter==='checked') hws=hws.filter(h=>h.submitted && (h.openChecked || !(h.questions||[]).some(q=>q.type==='open')));
  hws = hws.slice().reverse(); // новые сверху

  if(!hws.length){
    const msgs={
      all:'ДЗ пока нет',
      pending:'Все ДЗ уже сданы! 🎉',
      done:'Нет ДЗ на проверке',
      checked:'Нет проверенных ДЗ'
    };
    const icons={all:'✏️',pending:'🎉',done:'📝',checked:'✔️'};
    el.innerHTML=`<div class="empty-state"><div class="big">${icons[_hwFilter]||'✏️'}</div><p>${msgs[_hwFilter]||'Нет ДЗ'}</p></div>`;
    return;
  }
  el.innerHTML=hws.map(h=>{
    const pct = h.autoTotal ? Math.round((h.autoScore||0)/h.autoTotal*100) : 0;
    const hasOpen=(h.questions||[]).some(q=>q.type==='open');
    const fullyChecked=h.submitted&&(!hasOpen||h.openChecked);
    const statusIcon=!h.submitted?'⏳':fullyChecked?'✅':'🔍';
    const statusBadge=!h.submitted
      ?`<span class="badge badge-gold">⏳ Не сдано</span>`
      :fullyChecked
        ?`<span class="badge badge-green">✅ Проверено · ${h.autoScore||0}/${h.autoTotal||0} б. · ${pct}%${h.finalGrade?' · Оценка '+h.finalGrade:''}</span>`
        :`<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке · авто: ${h.autoScore||0}/${h.autoTotal||0} б.</span>`;
    const grade=h.finalGrade||null;
    return `<div class="card collapsible-card" data-item-id="${h.id}">
      <div class="card-title collapsible collapsed" onclick="toggleCollapse('hw_${h.id}', this)">
        <span class="dot"></span>${statusIcon} ${esc(h.title)}
        ${grade&&h.submitted?`<span class="grade-result-badge grade-${grade}" style="font-size:0.7rem;padding:2px 8px;margin-left:4px">${grade}</span>`:''}
        ${h.due?`<span style="font-size:0.7rem;color:var(--text3);margin-left:4px">📅 ${h.due}</span>`:''}
        <span class="collapse-arrow">▼</span>
      </div>
      <div class="card-collapse-body collapsed" id="cb-hw_${h.id}">
        ${h.desc?`<div style="font-size:0.87rem;color:var(--text2);margin-bottom:10px">${esc(h.desc)}</div>`:''}
        ${h.due?`<div class="content-meta" style="margin-bottom:10px">📅 Срок: ${h.due}</div>`:''}
        <div style="font-size:0.85rem;color:var(--text3);margin-bottom:10px">
          ⭐ ${h.maxPts||h.autoTotal||0} б.
        </div>
        <div style="margin-bottom:12px">${statusBadge}</div>
        ${h.submitted && h.teacherFeedback ? `<div class="feedback-box" style="margin-bottom:10px"><strong>💬 Отзыв преподавателя:</strong><br>${esc(h.teacherFeedback)}</div>` : ''}
        ${h.submitted ? renderHWResults(h) : availGate(h,'doHW')}
        <div id="cmt-hw-${h.id}"></div>
      </div>
    </div>`;
  }).join('');
  // Inject comment threads
  hws.filter(h=>h.submitted).forEach(h=>{
    const el2 = document.getElementById(`cmt-hw-${h.id}`);
    if(el2) renderCommentThread('hw', h.id, el2);
  });
}
function renderHWResults(h){
  const pct=h.autoTotal?Math.round((h.autoScore||0)/h.autoTotal*100):0;
  return `<div style="margin-top:4px">
    <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="badge badge-blue">⭐ Авто-баллы: ${h.autoScore||0}/${h.autoTotal||0} б. (${pct}%)</span>
      ${h.finalGrade
        ?`<span class="grade-result-badge grade-${h.finalGrade}">🎓 Итоговая оценка: ${h.finalGrade}</span>`
        :`<span class="badge badge-gold">⏳ Итоговая оценка ожидает преподавателя</span>`}
    </div>
    ${h.teacherFeedback?`<div class="feedback-box" style="margin-bottom:10px"><strong>💬 Отзыв преподавателя:</strong><br>${esc(h.teacherFeedback)}</div>`:''}
    ${(h.questions||[]).map(q=>renderReviewQuestion(q,h.answers||{})).join('')}
  </div>`;
}
let _doingHW=null; let _hwAnswers={};
function doHW(id){
  const hws=load('hw')||[];
  const h=hws.find(h=>h.id===id);
  const maxAttempts=h.maxAttempts||0;
  const attemptsUsed=(h.attempts||[]).length;
  if(maxAttempts>0 && attemptsUsed>=maxAttempts){
    showNotif(`❌ Исчерпано попыток: ${attemptsUsed}/${maxAttempts}`); return;
  }
  _doingHW=h;
  _hwAnswers={};
  const body=document.getElementById('take-test-body');
  document.getElementById('take-test-title').textContent=_doingHW.title;
  if(!_doingHW.questions||!_doingHW.questions.length){
    body.innerHTML=`<div class="form-group"><label>Ваш ответ / комментарий</label><textarea id="hw-free-answer" rows="5" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif"></textarea></div>
      <button class="btn btn-green" onclick="submitHW()">📤 Сдать ДЗ</button>`;
  } else {
    body.innerHTML=_doingHW.questions.map((q,i)=>`
      <div class="question-block">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div class="question-num">Вопрос ${i+1}</div>
          <span style="font-size:0.78rem;color:var(--text3)">⭐ ${+q.points||1} ${ptWord(+q.points||1)}</span>
        </div>
        <div class="question-text">${escHtml(q.text)}</div>
        ${q.imageUrl?`<img src="${safeUrl(q.imageUrl)}" class="q-img-preview" style="margin-bottom:10px" alt="">`:''}
        ${q.type==='auto'?`<div class="option-list">${q.options.map(o=>`
          <div class="option-item" onclick="selectHWOption('${q.id}','${o.replace(/'/g,"\\'")}',this)">${o}</div>`).join('')}</div>`
        :`<textarea style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;min-height:80px" 
          onchange="_hwAnswers['${q.id}']=this.value" placeholder="Ваш ответ..."></textarea>`}
        ${q.hint?`<div style="margin-top:10px">
          <button onclick="toggleHint('hint-hw-${q.id}')" style="background:none;border:1.5px solid var(--green-pale);border-radius:8px;padding:5px 12px;cursor:pointer;font-family:Nunito,sans-serif;font-size:0.78rem;color:var(--text3);display:inline-flex;align-items:center;gap:5px">💡 Показать подсказку</button>
          <div id="hint-hw-${q.id}" style="display:none;margin-top:8px;background:linear-gradient(135deg,#fffbeb,#fef9e7);border:1.5px solid #fce98a;border-radius:10px;padding:10px 14px;font-size:0.84rem;color:#856404;line-height:1.6">
            <span style="font-weight:700;margin-right:6px">💡</span>${q.hint}
          </div>
        </div>`:''}
      </div>`).join('')+`<hr class="divider"><button class="btn btn-green" onclick="submitHW()">📤 Сдать ДЗ</button>`;
  }
  openModal('modal-take-test');
}
function selectHWOption(qId,opt,el){
  _hwAnswers[qId]=opt;
  el.closest('.option-list').querySelectorAll('.option-item').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
}
function submitHW(){
  const hws=load('hw')||[];
  const h=hws.find(h=>h.id===_doingHW.id);
  const freeEl=document.getElementById('hw-free-answer');
  const freeAnswer=freeEl?freeEl.value:'';
  h.submitted=true; h.answers={..._hwAnswers};
  if(freeAnswer) h.freeAnswer=freeAnswer;
  let score=0, total=0;
  (h.questions||[]).forEach(q=>{
    const pts=+q.points||1;
    const ans=_hwAnswers[q.id]||'';
    if(q.type!=='open'){ total+=pts; if(scoreQuestion(q,ans)) score+=pts; }
  });
  h.autoScore=score;
  h.autoTotal=h.maxPts||total; // maxPts = сумма всех вопросов включая открытые
  h.autoScoreBase=score;
  const pct=h.autoTotal?Math.round(score/h.autoTotal*100):0;
  h.autoPct=pct;
  save('hw',hws);
  _collectAndSaveWrongAnswers('hw', h, _hwAnswers);
  closeModal('modal-take-test');
  renderStudentHW();
  updateMistakesBadge();
  showNotif(`✅ ДЗ сдано! Авто: ${score}/${h.autoTotal} б. (${pct}%)`);
  _addAdminNotif({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'submit', text:`✏️ ${currentUser.name} сдал(а) ДЗ «${esc(h.title)}»`, date:new Date().toLocaleDateString('ru'), read:false});
  updateAdminBadge();
}

// ─── GRADES — STUDENT VIEW ───
function renderStudentGrades(el){
  const sid = currentUser.id;
  if(!el) el = document.getElementById('student-grades-content');
  if(!el) return;

  const tests   = (load('tests')||[]).filter(t=>t.studentId===sid && !t.isLibrary);
  const hws     = (load('hw')||[]).filter(h=>h.studentId===sid && !h.isLibrary);
  const trials  = (load('trials')||[]).filter(t=>t.studentId===sid && !t.isLibrary);

  // Build unified timeline of all submissions
  const items = [];
  tests.forEach(t=>{
    const attempts = t.attempts||[];
    if(attempts.length){
      attempts.forEach(a=>{
        items.push({type:'test', icon:'📋', title:t.title, date:a.date, time:a.time||'',
          score:a.score, total:a.total, pct:a.pct, grade:a.grade, attemptN:a.n, totalAttempts:attempts.length,
          isFinal: t.gradeMode==='last' ? a.n===attempts.length : a.pct===Math.max(...attempts.map(x=>x.pct))});
      });
    } else if(t.submitted){
      const pct = t.autoTotal ? Math.round((t.autoScore||0)/t.autoTotal*100) : null;
      items.push({type:'test', icon:'📋', title:t.title, date:t.date, time:'',
        score:t.autoScore, total:t.autoTotal, pct, grade:t.finalGrade||null, attemptN:1, totalAttempts:1, isFinal:true});
    }
  });
  hws.forEach(h=>{
    const attempts = h.attempts||[];
    if(attempts.length){
      attempts.forEach(a=>{
        items.push({type:'hw', icon:'✏️', title:h.title, date:a.date, time:a.time||'',
          score:a.score, total:a.total, pct:a.pct, grade:a.grade, attemptN:a.n, totalAttempts:attempts.length,
          isFinal: h.gradeMode==='last' ? a.n===attempts.length : a.pct===Math.max(...attempts.map(x=>x.pct))});
      });
    } else if(h.submitted){
      const _hc1 = h.openChecked || !(h.questions||[]).some(q=>q.type==='open');
      const _hp1 = h.autoTotal ? Math.round((h.autoScore||0)/h.autoTotal*100) : (h.autoPct||null);
      items.push({type:'hw', icon:'✏️', title:h.title, date:h.date, time:'',
        score: _hc1 ? (h.autoScore!=null ? h.autoScore : null) : null,
        total: _hc1 ? (h.autoTotal||null) : null,
        pct:   _hc1 ? _hp1 : null,
        grade: _hc1 ? (h.finalGrade||h.autoGrade||null) : null,
        attemptN:1, totalAttempts:1, isFinal:true,
        pending: !_hc1,
        teacherFeedback: h.teacherFeedback||null});
    }
  });
  trials.forEach(t=>{
    if(t.submitted){
      const pct = t.autoTotal ? Math.round((t.autoScore||0)/t.autoTotal*100) : null;
      items.push({type:'trial', icon:'🎯', title:t.title, date:t.date, time:'',
        score:t.autoScore, total:t.autoTotal, pct, grade:t.finalGrade||null, attemptN:1, totalAttempts:1, isFinal:true});
    }
  });

  if(!items.length){
    el.innerHTML=`<div class="empty-state"><div class="big">🏅</div><p>Ещё нет сданных работ</p></div>`;
    return;
  }

  // Summary stats
  const graded = items.filter(i=>i.grade && i.isFinal);
  const avgPct = graded.length ? Math.round(graded.reduce((s,i)=>s+(i.pct||0),0)/graded.length) : null;
  const gradeCounts = {5:0,4:0,3:0,2:0};
  graded.forEach(i=>{ if(i.grade) gradeCounts[i.grade]=(gradeCounts[i.grade]||0)+1; });

  const statsHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px">
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-num">${tests.filter(t=>t.submitted).length}</div><div class="stat-label">Тестов сдано</div></div>
    <div class="stat-card"><div class="stat-icon">✏️</div><div class="stat-num">${hws.filter(h=>h.submitted).length}</div><div class="stat-label">ДЗ выполнено</div></div>
    <div class="stat-card"><div class="stat-icon">🎯</div><div class="stat-num">${trials.filter(t=>t.submitted).length}</div><div class="stat-label">Пробников сдано</div></div>
    ${avgPct!==null?`<div class="stat-card"><div class="stat-icon">📊</div><div class="stat-num">${avgPct}%</div><div class="stat-label">Средний балл</div></div>`:''}
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
    ${[5,4,3,2].map(g=>`<div style="flex:1;min-width:80px;text-align:center;padding:12px;border-radius:12px;border:2px solid" class="grade-${g}">
      <div style="font-size:1.5rem;font-weight:800">${gradeCounts[g]||0}</div>
      <div style="font-size:0.75rem;margin-top:2px">Оценка «${g}»</div>
    </div>`).join('')}
  </div>`;

  // Group by type tabs
  const typeLabel = {test:'📋 Тесты', hw:'✏️ ДЗ', trial:'🎯 Пробники'};

  const renderItems = (filterType) => {
    const filtered = filterType==='all' ? items : items.filter(i=>i.type===filterType);
    if(!filtered.length) return `<div class="empty-state"><p>Нет данных</p></div>`;
    // Sort by date desc (approximate)
    return filtered.map(i=>{
      const gradeHTML = i.grade
        ? `<span class="grade-result-badge grade-${i.grade}" style="font-size:0.75rem;padding:4px 12px">🎓 Оценка: ${i.grade}</span>`
        : i.pending
          ? `<span class="badge" style="font-size:0.72rem;background:#fde8e6;color:#c0392b">🔴 На проверке</span>`
          : `<span class="badge badge-gold" style="font-size:0.72rem">⏳ Ожидает оценки</span>`;
      const feedbackHTML = i.teacherFeedback
        ? `<span class="badge" style="font-size:0.68rem;background:#e8f8f0;color:#27ae60">💬 Есть отзыв</span>`
        : '';
      const scoreHTML = (i.pct!=null)
        ? `<span class="badge badge-blue" style="font-size:0.72rem">⭐ ${i.score||0}/${i.total||0} б. (${i.pct}%)</span>`
        : '';
      const attemptBadge = i.totalAttempts>1
        ? `<span class="badge" style="font-size:0.68rem;background:#f0f4ff;color:#3b5bdb;border-color:#c5d0e6">Попытка ${i.attemptN}/${i.totalAttempts}</span>`
        : '';
      const finalBadge = i.totalAttempts>1 && i.isFinal
        ? `<span style="font-size:0.68rem;color:var(--green-mid);font-weight:700">✓ зачтено</span>`
        : '';
      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:${i.isFinal&&i.totalAttempts>1?'var(--green-xpale)':'var(--white)'};border:1.5px solid ${i.isFinal&&i.totalAttempts>1?'var(--green-pale)':'var(--green-xpale)'};margin-bottom:8px">
        <div style="font-size:1.4rem;flex-shrink:0">${i.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.9rem;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.title)}</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">${i.date}${i.time?' · '+i.time:''}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end">
          ${attemptBadge}${scoreHTML}${gradeHTML}${finalBadge}${feedbackHTML||''}
        </div>
      </div>`;
    }).join('');
  };

  el.innerHTML = statsHTML + `
  <div class="card">
    <div class="tabs" style="margin-bottom:14px" id="grades-tab-bar">
      <div class="tab active" onclick="switchGradesTab('all',this)">📑 Все</div>
      <div class="tab" onclick="switchGradesTab('test',this)">📋 Тесты</div>
      <div class="tab" onclick="switchGradesTab('hw',this)">✏️ ДЗ</div>
      <div class="tab" onclick="switchGradesTab('trial',this)">🎯 Пробники</div>
    </div>
    <div id="grades-items-list">${renderItems('all')}</div>
  </div>`;

  // Store items for tab switching
  window._gradesItems = items;
}

function switchGradesTab(type, el){
  document.querySelectorAll('#grades-tab-bar .tab').forEach(t=>t.className='tab');
  el.className='tab active';
  const items = window._gradesItems||[];
  const filtered = type==='all' ? items : items.filter(i=>i.type===type);
  const listEl = document.getElementById('grades-items-list');
  if(!listEl) return;
  if(!filtered.length){ listEl.innerHTML=`<div class="empty-state"><p>Нет данных</p></div>`; return; }
  listEl.innerHTML = filtered.map(i=>{
    const gradeHTML = i.grade
      ? `<span class="grade-result-badge grade-${i.grade}" style="font-size:0.75rem;padding:4px 12px">🎓 Оценка: ${i.grade}</span>`
      : `<span class="badge badge-gold" style="font-size:0.72rem">⏳ Ожидает оценки</span>`;
    const scoreHTML = (i.pct!=null)
      ? `<span class="badge badge-blue" style="font-size:0.72rem">⭐ ${i.score||0}/${i.total||0} б. (${i.pct}%)</span>`
      : '';
    const attemptBadge = i.totalAttempts>1
      ? `<span class="badge" style="font-size:0.68rem;background:#f0f4ff;color:#3b5bdb;border-color:#c5d0e6">Попытка ${i.attemptN}/${i.totalAttempts}</span>`
      : '';
    const finalBadge = i.totalAttempts>1 && i.isFinal
      ? `<span style="font-size:0.68rem;color:var(--green-mid);font-weight:700">✓ зачтено</span>`
      : '';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:${i.isFinal&&i.totalAttempts>1?'var(--green-xpale)':'var(--white)'};border:1.5px solid ${i.isFinal&&i.totalAttempts>1?'var(--green-pale)':'var(--green-xpale)'};margin-bottom:8px">
      <div style="font-size:1.4rem;flex-shrink:0">${i.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.9rem;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.title)}</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">${i.date}${i.time?' · '+i.time:''}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end">
        ${attemptBadge}${scoreHTML}${gradeHTML}${finalBadge}
      </div>
    </div>`;
  }).join('');
}

// ─── GRADES — ADMIN VIEW ───
let _gradesAdminSid = null;
function renderGradesAdmin(){
  const students = (load('users')||[]).filter(u=>u.role==='student');
  const chipsEl = document.getElementById('grades-admin-chips');
  const contentEl = document.getElementById('grades-admin-content');
  if(!chipsEl || !contentEl) return;

  if(!_gradesAdminSid && students.length) _gradesAdminSid = students[0].id;

  chipsEl.innerHTML = students.map(s=>
    `<div class="student-chip ${_gradesAdminSid===s.id?'active':''}" onclick="_gradesAdminSid='${s.id}';renderGradesAdmin()">${esc(s.name)}</div>`
  ).join('');

  if(!_gradesAdminSid){ contentEl.innerHTML=`<div class="empty-state"><p>Нет учеников</p></div>`; return; }

  const sid = _gradesAdminSid;
  const student = students.find(s=>s.id===sid);
  const tests   = (load('tests')||[]).filter(t=>t.studentId===sid && !t.isLibrary);
  const hws     = (load('hw')||[]).filter(h=>h.studentId===sid && !h.isLibrary);
  const trials  = (load('trials')||[]).filter(t=>t.studentId===sid && !t.isLibrary);

  const items = [];
  tests.forEach(t=>{
    const attempts = t.attempts||[];
    if(attempts.length){
      attempts.forEach(a=>{
        items.push({type:'test', icon:'📋', title:t.title, date:a.date, time:a.time||'',
          score:a.score, total:a.total, pct:a.pct, grade:a.grade, attemptN:a.n, totalAttempts:attempts.length,
          isFinal: t.gradeMode==='last' ? a.n===attempts.length : a.pct===Math.max(...attempts.map(x=>x.pct)),
          maxAttempts:t.maxAttempts||0, gradeMode:t.gradeMode||'best'});
      });
    } else if(t.submitted){
      const pct = t.autoTotal ? Math.round((t.autoScore||0)/t.autoTotal*100) : null;
      items.push({type:'test', icon:'📋', title:t.title, date:t.date, time:'',
        score:t.autoScore, total:t.autoTotal, pct, grade:t.finalGrade||null, attemptN:1, totalAttempts:1, isFinal:true, maxAttempts:0, gradeMode:'best'});
    }
  });
  hws.forEach(h=>{
    const attempts = h.attempts||[];
    if(attempts.length){
      attempts.forEach(a=>{
        items.push({type:'hw', icon:'✏️', title:h.title, date:a.date, time:a.time||'',
          score:a.score, total:a.total, pct:a.pct, grade:a.grade, attemptN:a.n, totalAttempts:attempts.length,
          isFinal: h.gradeMode==='last' ? a.n===attempts.length : a.pct===Math.max(...attempts.map(x=>x.pct)),
          maxAttempts:h.maxAttempts||0, gradeMode:h.gradeMode||'best'});
      });
    } else if(h.submitted){
      const _hc2 = h.openChecked || !(h.questions||[]).some(q=>q.type==='open');
      const _hp2 = h.autoTotal ? Math.round((h.autoScore||0)/h.autoTotal*100) : (h.autoPct||null);
      items.push({type:'hw', icon:'✏️', title:h.title, date:h.date, time:'',
        score: _hc2 ? (h.autoScore!=null ? h.autoScore : null) : null,
        total: _hc2 ? (h.autoTotal||null) : null,
        pct:   _hc2 ? _hp2 : null,
        grade: _hc2 ? (h.finalGrade||h.autoGrade||null) : null,
        attemptN:1, totalAttempts:1, isFinal:true, maxAttempts:0, gradeMode:'best',
        pending: !_hc2,
        teacherFeedback: h.teacherFeedback||null});
    }
  });
  trials.forEach(t=>{
    if(t.submitted){
      const pct = t.autoTotal ? Math.round((t.autoScore||0)/t.autoTotal*100) : null;
      items.push({type:'trial', icon:'🎯', title:t.title, date:t.date, time:'',
        score:t.autoScore, total:t.autoTotal, pct, grade:t.finalGrade||null, attemptN:1, totalAttempts:1, isFinal:true, maxAttempts:0, gradeMode:'best'});
    }
  });

  const graded = items.filter(i=>i.grade && i.isFinal);
  const avgPct = graded.length ? Math.round(graded.reduce((s,i)=>s+(i.pct||0),0)/graded.length) : null;
  const gradeCounts = {5:0,4:0,3:0,2:0};
  graded.forEach(i=>{ if(i.grade) gradeCounts[i.grade]=(gradeCounts[i.grade]||0)+1; });

  if(!items.length){
    contentEl.innerHTML=`<div class="card"><div class="empty-state"><div class="big">🏅</div><p>${esc(student?.name||'—')} ещё не сдавал(а) работ</p></div></div>`;
    return;
  }

  const statsHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:16px">
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-num">${tests.filter(t=>t.submitted).length}</div><div class="stat-label">Тестов</div></div>
    <div class="stat-card"><div class="stat-icon">✏️</div><div class="stat-num">${hws.filter(h=>h.submitted).length}</div><div class="stat-label">ДЗ</div></div>
    <div class="stat-card"><div class="stat-icon">🎯</div><div class="stat-num">${trials.filter(t=>t.submitted).length}</div><div class="stat-label">Пробников</div></div>
    ${avgPct!==null?`<div class="stat-card"><div class="stat-icon">📊</div><div class="stat-num">${avgPct}%</div><div class="stat-label">Средний %</div></div>`:''}
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
    ${[5,4,3,2].map(g=>`<div style="flex:1;min-width:80px;text-align:center;padding:12px;border-radius:12px;border:2px solid" class="grade-${g}">
      <div style="font-size:1.5rem;font-weight:800">${gradeCounts[g]||0}</div>
      <div style="font-size:0.75rem;margin-top:2px">Оценка «${g}»</div>
    </div>`).join('')}
  </div>`;

  const rowsHTML = items.map(i=>{
    const gradeHTML = i.grade
      ? `<span class="grade-result-badge grade-${i.grade}" style="font-size:0.75rem;padding:4px 12px">Оценка: ${i.grade}</span>`
      : (i.pending ? `<span class="badge badge-gold" style="font-size:0.72rem">⏳ На проверке</span>` : '');
    const scoreHTML = (i.pct!=null)
      ? `<span class="badge badge-blue" style="font-size:0.72rem">⭐ ${i.score||0}/${i.total||0} б. (${i.pct}%)</span>`
      : '';
    const attemptBadge = i.totalAttempts>1
      ? `<span class="badge" style="font-size:0.68rem;background:#f0f4ff;color:#3b5bdb;border-color:#c5d0e6">Попытка ${i.attemptN}/${i.totalAttempts}${i.maxAttempts>0?' (лим: '+i.maxAttempts+')':''}</span>`
      : '';
    const finalBadge = i.totalAttempts>1 && i.isFinal
      ? `<span style="font-size:0.68rem;color:var(--green-mid);font-weight:700">✓ ${i.gradeMode==='best'?'лучший':'последний'}</span>`
      : '';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:${i.isFinal&&i.totalAttempts>1?'var(--green-xpale)':'var(--white)'};border:1.5px solid ${i.isFinal&&i.totalAttempts>1?'var(--green-pale)':'var(--green-xpale)'};margin-bottom:8px">
      <div style="font-size:1.4rem;flex-shrink:0">${i.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.9rem;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.title)}</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">${i.date}${i.time?' · '+i.time:''}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end">
        ${attemptBadge}${scoreHTML}${gradeHTML}${finalBadge}
      </div>
    </div>`;
  }).join('');

  contentEl.innerHTML = statsHTML + `<div class="card">${rowsHTML}</div>`;
}

// STUDENT PAYMENT — history tab only (wallet/lessons are handled by new functions)
function renderStudentPaymentHistory(){
  const sid=currentUser.id;
  const payments=(load('payments')||[]).filter(p=>p.studentId===sid);
  const el=document.getElementById('student-payment-list');
  if(!el) return;
  if(!payments.length){ el.innerHTML=`<div class="card">${emptyHTML()}</div>`; return; }
  el.innerHTML=`<div class="card"><div class="card-title"><span class="dot"></span>История записей об оплате</div>`+
  payments.map(p=>{
    const cls={paid:'paid',unpaid:'unpaid',partial:'partial'}[p.status];
    const icon={paid:'✅',unpaid:'❌',partial:'⚠️'}[p.status];
    const label={paid:'Оплачено',unpaid:'Не оплачено',partial:'Частично оплачено'}[p.status];
    return `<div class="payment-status ${cls}">
      <div><b>${esc(p.period)}</b>${p.note?` <span style="font-size:0.8rem;opacity:0.7">${esc(p.note)}</span>`:''}</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-weight:700">${p.amount}₽</span>
        <span class="badge ${cls==='paid'?'badge-green':cls==='unpaid'?'badge-red':'badge-gold'}">${icon} ${label}</span>
      </div>
    </div>`;
  }).join('')+'</div>';
}

// STUDENT SCHEDULE
// ── Проверяет, относится ли слот к данному ученику (напрямую или через группу) ──
function isSlotForStudent(s, sid){
  if(s.bookedBy === sid) return true;
  if(s.groupId){
    const g = getGroups().find(x=>x.id===s.groupId);
    if(g && (g.memberIds||[]).includes(sid)) return true;
  }
  return false;
}

// ══════════════════════════════════════════════
// ICS / CALENDAR EXPORT
// ══════════════════════════════════════════════

/** Format a Date to iCalendar DTSTART;TZID format (local naive) */
function _icsDate(d, allDay) {
  const pad = n => String(n).padStart(2,'0');
  if (allDay) {
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  }
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

/** Get next occurrence of a weekday (0=Mon…6=Sun in Russian slot.day) from a base date */
function _nextWeekday(dayName, fromDate) {
  const RU_DOW = {'Понедельник':1,'Вторник':2,'Среда':3,'Четверг':4,'Пятница':5,'Суббота':6,'Воскресенье':0};
  const target = RU_DOW[dayName];
  if (target === undefined) return null;
  const d = new Date(fromDate);
  d.setHours(0,0,0,0);
  const cur = d.getDay(); // 0=Sun
  let diff = (target - cur + 7) % 7;
  if (diff === 0) diff = 0; // same day = today
  d.setDate(d.getDate() + diff);
  return d;
}

/** Map Russian weekday name to RRULE BYDAY value */
function _rruleDay(dayName) {
  const map = {'Понедельник':'MO','Вторник':'TU','Среда':'WE','Четверг':'TH','Пятница':'FR','Суббота':'SA','Воскресенье':'SU'};
  return map[dayName] || null;
}

/** Fold long iCalendar lines (RFC 5545: max 75 octets, continue with CRLF + SPACE) */
function _icsFold(line) {
  if (line.length <= 75) return line;
  let result = '';
  while (line.length > 75) {
    result += line.slice(0, 75) + '\r\n ';
    line = line.slice(75);
  }
  return result + line;
}

/** Escape text for iCalendar */
function _icsEsc(s) {
  return (s || '').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}

/**
 * Build ICS string for a student's schedule:
 *  - Recurring VEVENT for each booked/assigned slot (weekly RRULE, 1 year)
 *  - Single VEVENT for each past attendance record
 */
function buildStudentICS(sid) {
  const slots    = load('slots')    || [];
  const courses  = load('courses')  || [];
  const att      = load('attendance') || [];
  const users    = load('users')    || [];
  const student  = users.find(u => u.id === sid);
  const sName    = student ? student.name : 'Ученик';

  const now = new Date();
  const uid_base = `biohim-${sid}-`;
  const dtstamp  = _icsDate(now) + 'T' + now.toISOString().slice(11,13) + now.toISOString().slice(14,16) + '00Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BioХим//Репетитор//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:BioХим — ${_icsEsc(sName)}`,
    'X-WR-TIMEZONE:Europe/Moscow',
    'X-WR-CALDESC:Расписание занятий BioХим',
  ];

  // ── 1. Recurring weekly events from schedule slots
  const mySlots = slots.filter(s => isSlotForStudent(s, sid));
  mySlots.forEach(s => {
    const course  = s.courseId ? courses.find(c => c.id === s.courseId) : null;
    const title   = course ? course.title : 'Занятие';
    const rruleDay = _rruleDay(s.day);
    if (!rruleDay) return;

    const dtStart = _nextWeekday(s.day, now);
    if (!dtStart) return;

    // Parse time HH:MM
    const [hh, mm] = (s.time || '00:00').split(':').map(Number);
    dtStart.setHours(hh, mm, 0, 0);

    const dtEnd = new Date(dtStart);
    dtEnd.setMinutes(dtEnd.getMinutes() + (s.dur || 60));

    // Until: 1 year from now
    const until = new Date(now);
    until.setFullYear(until.getFullYear() + 1);

    const uid = `${uid_base}slot-${s.id}@biohim.app`;
    const desc = [
      course ? `Курс: ${course.title}` : '',
      course ? `Формат: ${{individual:'Индивидуальный',group:'Групповой',pair:'Парный'}[course.format] || course.format}` : '',
      course ? `Стоимость: ${course.price}₽/занятие` : '',
      s.dur ? `Продолжительность: ${s.dur} мин` : '',
    ].filter(Boolean).join('\\n');

    lines.push('BEGIN:VEVENT');
    lines.push(_icsFold(`UID:${uid}`));
    lines.push(`DTSTAMP:${dtstamp}Z`);
    lines.push(_icsFold(`DTSTART;TZID=Europe/Moscow:${_icsDate(dtStart)}`));
    lines.push(_icsFold(`DTEND;TZID=Europe/Moscow:${_icsDate(dtEnd)}`));
    lines.push(_icsFold(`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay};UNTIL=${_icsDate(until)}T235959Z`));
    lines.push(_icsFold(`SUMMARY:📚 ${_icsEsc(title)}`));
    lines.push(_icsFold(`DESCRIPTION:${desc}`));
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:OPAQUE');
    lines.push(`CATEGORIES:Занятие`);
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:Напоминание о занятии');
    lines.push('TRIGGER:-PT30M');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  });

  // ── 2. Past attendance records as single events
  const myAtt = att.filter(a => a.studentId === sid && a.present && a.date);
  myAtt.forEach(a => {
    // Parse date: DD.MM.YYYY or YYYY-MM-DD
    let dateObj;
    if (a.date.includes('-')) {
      dateObj = new Date(a.date);
    } else {
      const [d, m, y] = a.date.split('.').map(Number);
      dateObj = new Date(y, m - 1, d);
    }
    if (isNaN(dateObj)) return;

    const [hh, mm] = (a.time || '00:00').split(':').map(Number);
    dateObj.setHours(hh || 0, mm || 0, 0, 0);
    const endObj = new Date(dateObj);
    endObj.setMinutes(endObj.getMinutes() + (a.duration || 60));

    const uid = `${uid_base}att-${a.lessonId || a.id || Date.now()}@biohim.app`;
    const desc = [
      a.topic  ? `Тема: ${a.topic}` : '',
      a.summary ? `Итог: ${a.summary}` : '',
      a.duration ? `Длительность: ${a.duration} мин` : '',
      a.costPerStudent ? `Стоимость: ${a.costPerStudent}₽` : '',
    ].filter(Boolean).join('\\n');

    lines.push('BEGIN:VEVENT');
    lines.push(_icsFold(`UID:${uid}`));
    lines.push(`DTSTAMP:${dtstamp}Z`);
    lines.push(_icsFold(`DTSTART;TZID=Europe/Moscow:${_icsDate(dateObj)}`));
    lines.push(_icsFold(`DTEND;TZID=Europe/Moscow:${_icsDate(endObj)}`));
    lines.push(_icsFold(`SUMMARY:✅ ${_icsEsc(a.topic || 'Занятие')} (прошло)`));
    lines.push(_icsFold(`DESCRIPTION:${desc}`));
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Build ICS for the admin: ALL booked slots (all students)
 */
function buildAdminICS() {
  const slots   = load('slots')   || [];
  const courses = load('courses') || [];
  const users   = load('users')   || [];
  const att     = load('attendance') || [];
  const now     = new Date();
  const dtstamp = _icsDate(now) + 'T000000Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BioХим//Репетитор//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:BioХим — Расписание (все)',
    'X-WR-TIMEZONE:Europe/Moscow',
  ];

  // Recurring from slots
  slots.filter(s => s.bookedBy || s.groupId).forEach(s => {
    const student = s.bookedBy ? users.find(u => u.id === s.bookedBy) : null;
    const course  = s.courseId ? courses.find(c => c.id === s.courseId) : null;
    const whoName = student ? student.name : (s.groupId ? 'Группа' : '—');
    const rruleDay = _rruleDay(s.day);
    if (!rruleDay) return;

    const dtStart = _nextWeekday(s.day, now);
    if (!dtStart) return;
    const [hh, mm] = (s.time || '00:00').split(':').map(Number);
    dtStart.setHours(hh, mm, 0, 0);
    const dtEnd = new Date(dtStart);
    dtEnd.setMinutes(dtEnd.getMinutes() + (s.dur || 60));
    const until = new Date(now); until.setFullYear(until.getFullYear() + 1);

    lines.push('BEGIN:VEVENT');
    lines.push(_icsFold(`UID:biohim-admin-slot-${s.id}@biohim.app`));
    lines.push(`DTSTAMP:${dtstamp}Z`);
    lines.push(_icsFold(`DTSTART;TZID=Europe/Moscow:${_icsDate(dtStart)}`));
    lines.push(_icsFold(`DTEND;TZID=Europe/Moscow:${_icsDate(dtEnd)}`));
    lines.push(_icsFold(`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay};UNTIL=${_icsDate(until)}T235959Z`));
    lines.push(_icsFold(`SUMMARY:👤 ${_icsEsc(whoName)}${course?' — '+_icsEsc(course.title):''}`));
    lines.push(_icsFold(`DESCRIPTION:${_icsEsc(whoName)}\\n${s.day} ${s.time}\\n${s.dur||60} мин${course?'\\nКурс: '+course.title:''}`));
    lines.push('STATUS:CONFIRMED');
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:Занятие: ${_icsEsc(whoName)}`);
    lines.push('TRIGGER:-PT15M');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  });

  // Past attendance
  att.filter(a => a.present && a.date).forEach(a => {
    const student = users.find(u => u.id === a.studentId);
    let dateObj;
    if (a.date.includes('-')) dateObj = new Date(a.date);
    else { const [d,m,y]=a.date.split('.').map(Number); dateObj=new Date(y,m-1,d); }
    if (isNaN(dateObj)) return;
    const [hh, mm] = (a.time||'00:00').split(':').map(Number);
    dateObj.setHours(hh||0, mm||0, 0, 0);
    const endObj = new Date(dateObj);
    endObj.setMinutes(endObj.getMinutes() + (a.duration || 60));

    lines.push('BEGIN:VEVENT');
    lines.push(_icsFold(`UID:biohim-admin-att-${a.lessonId||a.id||Math.random().toString(36).slice(2)}@biohim.app`));
    lines.push(`DTSTAMP:${dtstamp}Z`);
    lines.push(_icsFold(`DTSTART;TZID=Europe/Moscow:${_icsDate(dateObj)}`));
    lines.push(_icsFold(`DTEND;TZID=Europe/Moscow:${_icsDate(endObj)}`));
    lines.push(_icsFold(`SUMMARY:✅ ${_icsEsc(student?student.name:'—')} — ${_icsEsc(a.topic||'Занятие')}`));
    lines.push(_icsFold(`DESCRIPTION:${_icsEsc(a.topic||'')}${a.duration?'\\n'+a.duration+' мин':''}`));
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Trigger download of .ics file */
function downloadICS(icsStr, filename) {
  const blob = new Blob([icsStr], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

/** Build a Google Calendar import URL for a single-event (not recurring) — for "Add to Google Calendar" */
function googleCalendarLink(title, startDate, endDate, description) {
  const fmt = d => d.toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    details: description || '',
    sf: 'true',
    output: 'xml'
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Student: render the calendar export tab */
function renderCalendarExport() {
  const sid = currentUser.id;
  const el  = document.getElementById('cal-export-content');
  if (!el) return;

  const slots   = load('slots')   || [];
  const courses = load('courses') || [];
  const mySlots = slots.filter(s => isSlotForStudent(s, sid));
  const att     = (load('attendance') || []).filter(a => a.studentId === sid && a.present);

  const slotCount = mySlots.length;
  const attCount  = att.length;

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><span class="dot"></span>📲 Добавить занятия в календарь</div>
      <div style="font-size:0.88rem;color:var(--text2);line-height:1.7;margin-bottom:16px">
        Скачайте файл <b>.ics</b> и откройте его — занятия появятся в вашем Google Calendar, Apple Calendar или любом другом приложении.<br>
        В файл входят: <b>${slotCount}</b> регулярных занятий из расписания и <b>${attCount}</b> прошедших занятий.
      </div>

      <!-- Main download -->
      <button class="btn btn-green" style="width:100%;padding:14px;font-size:1rem;margin-bottom:12px"
        onclick="downloadICS(buildStudentICS('${sid}'), 'biohim-schedule.ics')">
        ⬇️ Скачать файл .ics (все занятия)
      </button>

      <!-- Instructions grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <!-- Google Calendar -->
        <div style="border:1.5px solid var(--green-pale);border-radius:12px;padding:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#4285F4,#34A853);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">📅</div>
            <div>
              <div style="font-weight:700;font-size:0.92rem;color:var(--accent)">Google Calendar</div>
              <div style="font-size:0.72rem;color:var(--text3)">Android, Web</div>
            </div>
          </div>
          <ol style="font-size:0.78rem;color:var(--text2);line-height:2;padding-left:18px;margin:0">
            <li>Нажмите «Скачать .ics» выше</li>
            <li>Откройте <a href="https://calendar.google.com" target="_blank" style="color:var(--green-mid)">calendar.google.com</a></li>
            <li>Настройки → Импорт</li>
            <li>Выберите скачанный файл</li>
          </ol>
          <button class="btn btn-outline btn-sm" style="width:100%;margin-top:10px"
            onclick="downloadICS(buildStudentICS('${sid}'), 'biohim-schedule.ics');setTimeout(()=>window.open('https://calendar.google.com/calendar/r/settings/import','_blank'),800)">
            📥 Скачать и открыть Google Calendar
          </button>
        </div>

        <!-- Apple Calendar -->
        <div style="border:1.5px solid var(--green-pale);border-radius:12px;padding:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#ff6b6b,#ee5a24);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">🍎</div>
            <div>
              <div style="font-weight:700;font-size:0.92rem;color:var(--accent)">Apple Calendar</div>
              <div style="font-size:0.72rem;color:var(--text3)">iPhone, iPad, Mac</div>
            </div>
          </div>
          <ol style="font-size:0.78rem;color:var(--text2);line-height:2;padding-left:18px;margin:0">
            <li>Нажмите «Скачать .ics» выше</li>
            <li>На iPhone/iPad — откройте файл из Загрузок</li>
            <li>На Mac — дважды кликните по файлу</li>
            <li>Нажмите «Добавить все»</li>
          </ol>
          <button class="btn btn-outline btn-sm" style="width:100%;margin-top:10px"
            onclick="openAppleCalendar('${sid}')">
            🍎 Открыть напрямую (Safari/Mac)
          </button>
        </div>
      </div>

      <!-- Outlook -->
      <div style="border:1.5px solid var(--green-pale);border-radius:12px;padding:14px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#0078D4,#106EBE);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">📧</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:0.88rem;color:var(--accent)">Outlook / Яндекс Календарь / другие</div>
          <div style="font-size:0.75rem;color:var(--text3)">Скачайте .ics и импортируйте через меню «Файл → Импорт»</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="downloadICS(buildStudentICS('${sid}'), 'biohim-schedule.ics')">⬇️ Скачать .ics</button>
      </div>
    </div>

    <!-- Individual slots preview -->
    ${mySlots.length ? `
    <div class="card">
      <div class="card-title"><span class="dot"></span>📋 Занятия в экспорте (${slotCount})</div>
      ${mySlots.map(s => {
        const c = s.courseId ? courses.find(x => x.id === s.courseId) : null;
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--green-xpale)">
          <div>
            <div style="font-weight:600;font-size:0.88rem">${c ? esc(c.title) : 'Занятие'}</div>
            <div style="font-size:0.76rem;color:var(--text3)">Каждый ${esc(s.day)} в ${esc(s.time)} · ${s.dur||60} мин</div>
          </div>
          <span class="badge badge-green" style="font-size:0.72rem">🔁 Еженедельно</span>
        </div>`;
      }).join('')}
    </div>` : `<div class="card"><div style="text-align:center;padding:20px;color:var(--text3)">🗓 Нет назначенных слотов расписания</div></div>`}
  `;
}

/** Open .ics via data: URI for Apple Calendar / Safari direct open */
function openAppleCalendar(sid) {
  const ics = buildStudentICS(sid);
  const encoded = encodeURIComponent(ics);
  // Try opening as webcal data URI — works in Safari/macOS
  const a = document.createElement('a');
  a.href = 'data:text/calendar;charset=utf-8,' + encoded;
  a.download = 'biohim-schedule.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showNotif('📲 Файл скачан — откройте его для добавления в Apple Calendar');
}

/** Admin: open ICS export modal */
function openAdminCalExport() {
  const el = document.getElementById('ics-modal-body');
  if (!el) return;
  const slots    = load('slots')   || [];
  const courses  = load('courses') || [];
  const users    = load('users')   || [];
  const att      = load('attendance') || [];
  const bookedSlots = slots.filter(s => s.bookedBy || s.groupId);

  el.innerHTML = `
    <div style="font-size:0.88rem;color:var(--text2);line-height:1.7;margin-bottom:16px">
      Экспорт всего расписания: <b>${bookedSlots.length}</b> занятий и <b>${att.filter(a=>a.present).length}</b> прошедших уроков.
    </div>
    <button class="btn btn-green" style="width:100%;margin-bottom:14px"
      onclick="downloadICS(buildAdminICS(),'biohim-all-schedule.ics');showNotif('✅ Файл скачан!')">
      ⬇️ Скачать .ics (все ученики)
    </button>

    <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>По ученикам</div>
    ${getStudents().map(s => {
      const sSlots = slots.filter(sl => isSlotForStudent(sl, s.id));
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--green-xpale)">
        <div>
          <div style="font-weight:600;font-size:0.88rem">${esc(s.name)}</div>
          <div style="font-size:0.74rem;color:var(--text3)">${sSlots.length} слотов</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="downloadICS(buildStudentICS('${s.id}'),'biohim-${s.id}.ics');showNotif('✅ Скачан для ${esc(s.name)}')">⬇️ .ics</button>
      </div>`;
    }).join('')}
  `;
  document.getElementById('ics-modal-title').textContent = '📲 Экспорт расписания в .ics';
  openModal('modal-ics-export');
}

function renderStudentSchedule(){
  const courses=load('courses')||[];
  const slots=load('slots')||[];
  const bookings=load('bookings')||[];
  const sid=currentUser.id;
  const formatLabel={individual:'👤 Индивидуальный',group:'👥 Групповой',pair:'👫 Парный'};

  // Filter courses to only enrolled ones
  const student=(load('users')||[]).find(u=>u.id===sid);
  const enrolled=student?.enrolledCourses||[];
  const myCourses = enrolled.length
    ? courses.filter(c=>enrolled.includes(c.id))
    : courses; // fallback: show all if no courses assigned

  document.getElementById('courses-student-list').innerHTML=`<div class="grid-3">`+
  myCourses.map(c=>`
    <div class="course-card">
      <div class="course-header ${c.subject==='Биология'?'course-bio':c.subject==='Химия'?'course-chem':'course-combined'}">
        ${c.subject==='Биология'?'🌿':c.subject==='Химия'?'⚗️':'🧬'}
      </div>
      <div class="course-body">
        <div class="course-name">${esc(c.title)}</div>
        <div class="content-meta" style="margin-bottom:8px">${esc(c.desc)}</div>
        <div class="course-formats"><span class="badge badge-green">${formatLabel[c.format]||c.format}</span><span class="badge badge-blue">${c.subject}</span></div>
        <div class="course-price">${c.price}₽<span style="font-size:0.75rem;font-weight:400;color:var(--text3)">/занятие</span></div>
        <button class="btn btn-outline btn-sm" style="margin-top:10px;width:100%" onclick="showBookSlot('${c.id}')">📅 Записаться</button>
      </div>
    </div>`).join('')+'</div>' || emptyHTML();
  const free=slots.filter(s=>!s.bookedBy);
  document.getElementById('slots-student-list').innerHTML=free.map(s=>`
    <div class="time-slot free" style="display:inline-block;margin:6px">
      <div style="font-weight:700">${s.time}</div>
      <div style="font-size:0.7rem;color:var(--text3)">${s.day}</div>
      <div style="font-size:0.7rem">${s.dur} мин</div>
      <button class="btn btn-green btn-sm" style="margin-top:6px;width:100%;padding:4px 8px;font-size:0.7rem" onclick="bookSlot('${s.id}')">Занять</button>
    </div>`).join('') || '<div class="empty-state"><p>Нет свободных слотов</p></div>';
  // Заявки, которые ученик сам подавал
  const myBookings=bookings.filter(b=>b.studentId===sid);
  // Слоты, назначенные преподавателем напрямую или через группу
  const assignedSlots=slots.filter(s=>isSlotForStudent(s,sid));

  // Объединяем: сначала назначенные, потом заявки (без дублей по slotId)
  const assignedSlotIds=new Set(assignedSlots.map(s=>s.id));
  const bookingItems=myBookings.filter(b=>!assignedSlotIds.has(b.slotId));
  const assignedItems=assignedSlots.map(s=>{
    const g=s.groupId?getGroups().find(x=>x.id===s.groupId):null;
    const c=s.courseId?courses.find(c=>c.id===s.courseId):null;
    return `<div class="content-item">
      <div class="content-icon">📅</div>
      <div class="content-info">
        <div class="content-name" style="display:flex;align-items:center;gap:8px">
          ${c?c.title:'Занятие'}
          ${g?`<span class="badge badge-blue" style="font-size:0.7rem">👥 ${esc(g.name)}</span>`:''}
        </div>
        <div class="content-meta">${s.day} ${s.time} · ${s.dur} мин</div>
        <span class="badge badge-green" style="margin-top:4px">✅ Записан</span>
      </div>
    </div>`;
  });

  const bookingItemsHTML=bookingItems.map(b=>{
    const s=slots.find(s=>s.id===b.slotId);
    const c=courses.find(c=>c.id===b.courseId);
    const statusLabel={pending:'⏳ На рассмотрении',approved:'✅ Подтверждено',rejected:'❌ Отклонено'}[b.status];
    const cls={pending:'badge-gold',approved:'badge-green',rejected:'badge-red'}[b.status];
    return `<div class="content-item">
      <div class="content-icon">📅</div>
      <div class="content-info">
        <div class="content-name">${c?c.title:'—'}</div>
        <div class="content-meta">${s?s.day+' '+s.time:'—'}</div>
        <span class="badge ${cls}" style="margin-top:4px">${statusLabel}</span>
      </div>
    </div>`;
  });

  const allItems=[...assignedItems,...bookingItemsHTML];
  document.getElementById('my-bookings-list').innerHTML=allItems.join('') || '<div class="empty-state"><p>Нет записей</p></div>';
}
function showBookSlot(courseId){
  const slots=(load('slots')||[]).filter(s=>!s.bookedBy);
  const body=document.getElementById('book-slot-body');
  body.innerHTML=`<div class="form-group"><label>Выберите слот</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
    ${slots.map(s=>`<div class="time-slot free" style="cursor:pointer;padding:12px;min-width:100px" onclick="bookWithCourse('${courseId}','${s.id}')">
      <div style="font-weight:700">${s.time}</div><div style="font-size:0.7rem;color:var(--text3)">${s.day}</div><div style="font-size:0.7rem">${s.dur} мин</div>
    </div>`).join('')}
  </div></div>`;
  openModal('modal-book-slot');
}
function bookWithCourse(courseId,slotId){
  const bookings=load('bookings')||[];
  bookings.push({id:'b'+Date.now(),studentId:currentUser.id,courseId,slotId,status:'pending',date:new Date().toLocaleDateString('ru')});
  save('bookings',bookings);
  closeModal('modal-book-slot');
  renderStudentSchedule();
  showNotif('📬 Заявка отправлена! Ожидайте подтверждения.');
}
function bookSlot(slotId){
  const slots=load('slots')||[];
  const s=slots.find(s=>s.id===slotId);
  if(!s) return;
  s.bookedBy=currentUser.id;
  save('slots',slots);
  renderStudentSchedule();
  showNotif('✅ Слот занят!');
}

// ═══════════════════════════════════════════
// MULTI-SEND
// ═══════════════════════════════════════════
let _multiSendMode=false;
let _multiSendTestsMode=false;
let _multiSendHWMode=false;

function toggleMultiSend(on){
  _multiSendMode=on;
  const bar=document.getElementById('multi-send-bar');
  bar.style.display=on?'block':'none';
  if(on) buildMultiStudentCheckboxes('multi-student-checkboxes');
}
function toggleMultiSendTests(on){
  _multiSendTestsMode=on;
  const bar=document.getElementById('multi-send-bar-tests');
  bar.style.display=on?'block':'none';
  if(on) buildMultiStudentCheckboxes('multi-student-tests-checkboxes');
}
function toggleMultiSendHW(on){
  _multiSendHWMode=on;
  const bar=document.getElementById('multi-send-bar-hw');
  bar.style.display=on?'block':'none';
  if(on) buildMultiStudentCheckboxes('multi-student-hw-checkboxes');
}
function buildMultiStudentCheckboxes(containerId){
  const students=getStudents();
  const el=document.getElementById(containerId);
  if(!el) return;
  el.innerHTML=students.map(s=>`
    <label class="chip-label">
      <input type="checkbox" value="${s.id}" style="accent-color:var(--green-deep);flex-shrink:0;width:14px;height:14px"><span style="overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
    </label>`).join('');
}
function getCheckedStudents(containerId){
  return [...document.querySelectorAll(`#${containerId} input[type=checkbox]:checked`)].map(cb=>cb.value);
}
function sendToMultiple(){
  const ids=getCheckedStudents('multi-student-checkboxes');
  if(!ids.length){ showNotif('Выберите хотя бы одного ученика'); return; }
  // Copy all content of current selected student to chosen students
  const sid=getSelectedStudent();
  const content=load('content')||[];
  const toCopy=content.filter(c=>c.studentId===sid);
  if(!toCopy.length){ showNotif('Нет материалов для отправки'); return; }
  ids.forEach(targetId=>{
    if(targetId===sid) return;
    toCopy.forEach(c=>{
      content.push({...c, id:'ct_'+Date.now()+'_'+Math.random().toString(36).slice(2), studentId:targetId});
    });
  });
  save('content',content);
  toggleMultiSend(false);
  showNotif(`✅ Материалы отправлены ${ids.length} ученикам`);
}
function sendTestToMultiple(){
  const ids=getCheckedStudents('multi-student-tests-checkboxes');
  if(!ids.length){ showNotif('Выберите хотя бы одного ученика'); return; }
  const sid=getSelectedStudent();
  const tests=load('tests')||[];
  const toCopy=tests.filter(t=>t.studentId===sid);
  if(!toCopy.length){ showNotif('Нет тестов для отправки'); return; }
  ids.forEach(targetId=>{
    if(targetId===sid) return;
    toCopy.forEach(t=>{
      tests.push({...t, id:'t'+Date.now()+'_'+Math.random().toString(36).slice(2), studentId:targetId, submitted:false, answers:{}, autoScore:0});
    });
  });
  save('tests',tests);
  toggleMultiSendTests(false);
  showNotif(`✅ Тесты отправлены ${ids.length} ученикам`);
}
function sendHWToMultiple(){
  const ids=getCheckedStudents('multi-student-hw-checkboxes');
  if(!ids.length){ showNotif('Выберите хотя бы одного ученика'); return; }
  const sid=getSelectedStudent();
  const hws=load('hw')||[];
  const toCopy=hws.filter(h=>h.studentId===sid);
  if(!toCopy.length){ showNotif('Нет ДЗ для отправки'); return; }
  ids.forEach(targetId=>{
    if(targetId===sid) return;
    toCopy.forEach(h=>{
      hws.push({...h, id:'hw'+Date.now()+'_'+Math.random().toString(36).slice(2), studentId:targetId, submitted:false, answers:{}});
    });
  });
  save('hw',hws);
  toggleMultiSendHW(false);
  showNotif(`✅ ДЗ отправлены ${ids.length} ученикам`);
}

// ═══════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════
function setReportPeriod(period){
  const to = new Date();
  const from = new Date();
  if(period==='month')  from.setDate(1);
  else if(period==='3month') from.setMonth(from.getMonth()-3);
  else if(period==='year')   from.setMonth(0), from.setDate(1);
  else { // all
    document.getElementById('report-date-from').value='';
    document.getElementById('report-date-to').value='';
    generateReport(); return;
  }
  document.getElementById('report-date-from').value=from.toISOString().slice(0,10);
  document.getElementById('report-date-to').value=to.toISOString().slice(0,10);
  generateReport();
}

// ══════════════════════════════════════════════
// ФИНАНСОВЫЙ ДАШБОРД
// ══════════════════════════════════════════════

window._finChartMode = 'income'; // 'income' | 'lessons'
let _finBarChart = null;

function renderFinanceDashboard() {
  const students = getStudents();
  const payments  = load('payments')  || [];
  const att       = load('attendance')|| [];
  const slots     = load('slots')     || [];
  const courses   = load('courses')   || [];

  const now   = new Date();
  const curY  = now.getFullYear();
  const curM  = now.getMonth(); // 0-based

  // ── Year selector
  const yearSel = document.getElementById('fin-chart-year');
  if (yearSel && !yearSel.dataset.built) {
    yearSel.dataset.built = '1';
    const years = [];
    for (let y = curY - 2; y <= curY + 1; y++) years.push(y);
    yearSel.innerHTML = years.map(y => `<option value="${y}" ${y === curY ? 'selected' : ''}>${y}</option>`).join('');
  }
  const selectedYear = yearSel ? +yearSel.value : curY;

  // ── Helper: parse any Russian/ISO date → Date object
  function parseDate(s) {
    if (!s) return null;
    if (s.includes('-')) return new Date(s);
    const p = s.split('.');
    if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
    return null;
  }

  // ── Collect all paid income from attendance (present + paid) and payments
  // attendance.costPerStudent when present=true is the earned amount per student
  // payments.amount where status='paid' is additional recorded income

  function getAttIncome(year, month) {
    // month is 0-based
    // Считаем только фактически оплаченные занятия (present=true И paid=true)
    // чтобы долги не попадали одновременно и в доход, и в задолженность
    return att.filter(a => {
      if (!a.present || !a.paid) return false;
      const d = parseDate(a.date);
      if (!d) return false;
      return d.getFullYear() === year && d.getMonth() === month;
    }).reduce((s, a) => s + (+a.costPerStudent || 0), 0);
  }

  function getPaymentsIncome(year, month) {
    return payments.filter(p => {
      if (p.status !== 'paid') return false;
      const d = parseDate(p.date);
      if (!d) return false;
      return d.getFullYear() === year && d.getMonth() === month;
    }).reduce((s, p) => s + (+p.amount || 0), 0);
  }

  function getLessonCount(year, month) {
    const ids = new Set();
    att.filter(a => {
      if (!a.present) return false;
      const d = parseDate(a.date);
      return d && d.getFullYear() === year && d.getMonth() === month;
    }).forEach(a => ids.add(a.lessonId || a.id));
    return ids.size;
  }

  // ── KPI: this month
  const thisAttIncome  = getAttIncome(curY, curM);
  const thisPaidIncome = getPaymentsIncome(curY, curM);
  const thisIncome     = thisAttIncome + thisPaidIncome;
  const thisLessons    = getLessonCount(curY, curM);

  // ── Debts: три источника долга
  const debtByStudent = {};

  // 1. Занятия прошли, но деньги не списаны (present=true, paid=false)
  att.filter(a => a.present && !a.paid && (+a.costPerStudent || 0) > 0).forEach(a => {
    if (!debtByStudent[a.studentId]) debtByStudent[a.studentId] = 0;
    debtByStudent[a.studentId] += +a.costPerStudent;
  });

  // 2. Ручные записи об оплате со статусом "не оплачено"
  payments.filter(p => p.status === 'unpaid' && !p._fromWallet).forEach(p => {
    if (!debtByStudent[p.studentId]) debtByStudent[p.studentId] = 0;
    debtByStudent[p.studentId] += +p.amount || 0;
  });

  // 3. Отрицательный баланс кошелька = ученик занял у репетитора
  // (занятие списано walletDebit, но денег на счёте не было)
  students.forEach(s => {
    const w = loadWallet(s.id);
    if (w.balance < 0) {
      // Долг = абсолютное значение отрицательного баланса
      // Вычитаем уже учтённые долги из attendance/payments чтобы не задвоить
      const alreadyCounted = debtByStudent[s.id] || 0;
      const walletDebt = Math.abs(w.balance);
      // Берём максимум: кошелёк отражает суммарный реальный долг
      if (walletDebt > alreadyCounted) {
        debtByStudent[s.id] = walletDebt;
      }
    }
  });

  const totalDebt = Object.values(debtByStudent).reduce((s, v) => s + v, 0);
  const debtorCount = Object.keys(debtByStudent).length;

  // ── Forecast next month: booked slots × course price
  const nextM = (curM + 1) % 12;
  const nextY = curM === 11 ? curY + 1 : curY;
  // Map day names to next month's occurrences count
  const dayNames = ['вс','пн','вт','ср','чт','пт','сб']; // JS getDay() = 0=Sun
  const dayNamesRu = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота',
    'вс','пн','вт','ср','чт','пт','сб'];
  function countDayOccurrences(dayAbbr, year, month) {
    // slot.day is like "Понедельник", "Пн", "Пятница", etc.
    const norm = (dayAbbr || '').toLowerCase().trim();
    let targetDay = -1;
    const abbrs  = ['вс','пн','вт','ср','чт','пт','сб'];
    const fulls  = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
    targetDay = abbrs.indexOf(norm);
    if (targetDay === -1) {
      targetDay = fulls.findIndex(f => norm.startsWith(f.slice(0,3)));
    }
    if (targetDay === -1) return 4; // fallback: ~4 per month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month, d).getDay() === targetDay) count++;
    }
    return count;
  }

  let forecastTotal = 0;
  const forecastItems = [];
  slots.filter(s => s.bookedBy || s.groupId).forEach(s => {
    const course = s.courseId ? courses.find(c => c.id === s.courseId) : null;
    const price  = course ? +course.price || 0 : 0;
    if (!price) return;
    const occurrences = countDayOccurrences(s.day, nextY, nextM);
    const income = price * occurrences;
    forecastTotal += income;

    const who = s.bookedBy ? students.find(st => st.id === s.bookedBy) : null;
    const whoLabel = who ? who.name : (s.groupId ? '👥 Группа' : '—');
    forecastItems.push({ label: `${whoLabel} · ${s.day} ${s.time}`, course: course?.title || '—', price, occurrences, income });
  });

  // ── Last month income (for comparison)
  const prevM = curM === 0 ? 11 : curM - 1;
  const prevY = curM === 0 ? curY - 1 : curY;
  const prevIncome = getAttIncome(prevY, prevM) + getPaymentsIncome(prevY, prevM);

  // ── Render KPI cards
  const kpiEl = document.getElementById('fin-kpi-row');
  const trend = thisIncome > prevIncome ? '📈' : thisIncome < prevIncome ? '📉' : '➡️';
  const trendColor = thisIncome > prevIncome ? 'var(--green-mid)' : thisIncome < prevIncome ? 'var(--red)' : 'var(--text3)';
  const trendDiff = thisIncome - prevIncome;
  const trendLabel = trendDiff === 0 ? 'как в прошлом месяце' : (trendDiff > 0 ? `+${trendDiff.toLocaleString('ru')}₽` : `${trendDiff.toLocaleString('ru')}₽`);

  kpiEl.innerHTML = [
    { icon:'💰', label:'Доход этот месяц', value:`${thisIncome.toLocaleString('ru')} ₽`, sub:`${trend} ${trendLabel} vs прошлый месяц`, subColor: trendColor },
    { icon:'❌', label:'Общая задолженность', value:`${totalDebt.toLocaleString('ru')} ₽`, sub: totalDebt > 0 ? `${debtorCount} ${debtorCount===1?'должник':debtorCount>=2&&debtorCount<=4?'должника':'должников'}` : 'Задолженностей нет', subColor: totalDebt > 0 ? 'var(--red)' : 'var(--green-mid)' },
    { icon:'📅', label:'Прогноз след. месяц', value:`${forecastTotal.toLocaleString('ru')} ₽`, sub:'На основе расписания', subColor:'var(--text3)' },
    { icon:'🎓', label:'Занятий этот месяц', value:`${thisLessons}`, sub:`студентов: ${students.length}`, subColor:'var(--text3)' },
  ].map(k => `
    <div class="card" style="text-align:center;padding:18px 14px;border:none;box-shadow:var(--shadow)">
      <div style="font-size:1.7rem;margin-bottom:6px">${k.icon}</div>
      <div style="font-size:0.72rem;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${k.label}</div>
      <div style="font-size:1.6rem;font-weight:900;color:var(--accent);font-family:'Playfair Display',serif;line-height:1">${k.value}</div>
      <div style="font-size:0.74rem;margin-top:5px;color:${k.subColor};font-weight:600">${k.sub}</div>
    </div>`).join('');

  // ── Bar chart (12 months for selectedYear)
  const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const incomeData  = months.map((_, i) => getAttIncome(selectedYear, i) + getPaymentsIncome(selectedYear, i));
  const lessonsData = months.map((_, i) => getLessonCount(selectedYear, i));

  const mode = window._finChartMode || 'income';
  const chartData  = mode === 'income' ? incomeData : lessonsData;
  const chartLabel = mode === 'income' ? 'Доход (₽)' : 'Занятий';
  const chartColor = mode === 'income' ? '#40916c' : '#74c69d';

  const maxVal = Math.max(...chartData, 1);
  const chartWrap = document.getElementById('fin-chart-wrap');
  // SVG bar chart (no external library needed)
  const W = 700, H = 180, padL = 52, padB = 28, padT = 10, padR = 10;
  const plotW = W - padL - padR;
  const plotH = H - padB - padT;
  const barW  = Math.floor(plotW / 12 * 0.6);
  const gap   = Math.floor(plotW / 12);
  const curMonthIdx = (selectedYear === curY) ? curM : -1;

  let bars = '', labels = '', yAxis = '';
  // Y axis lines
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (i / 4) * plotH;
    const val = Math.round(maxVal * i / 4);
    yAxis += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e0ece5" stroke-width="1"/>`;
    yAxis += `<text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="#7a9b73">${mode==='income'?val.toLocaleString('ru'):val}</text>`;
  }

  chartData.forEach((val, i) => {
    const x = padL + i * gap + (gap - barW) / 2;
    const h = plotH * (val / maxVal) || 0;
    const y = padT + plotH - h;
    const isCur = i === curMonthIdx;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}"
      rx="4" fill="${isCur ? '#2d6a4f' : chartColor}" opacity="${isCur ? 1 : 0.72}"/>`;
    if (val > 0) {
      const label = mode === 'income' ? (val >= 1000 ? (val/1000).toFixed(1)+'k' : val) : val;
      bars += `<text x="${x + barW/2}" y="${y - 3}" text-anchor="middle" font-size="9" fill="${isCur?'#1b4332':'#4a6741'}" font-weight="700">${label}</text>`;
    }
    labels += `<text x="${x + barW/2}" y="${H - 4}" text-anchor="middle" font-size="9" fill="${isCur?'#1b4332':'#7a9b73'}" font-weight="${isCur?700:400}">${months[i]}</text>`;
  });

  chartWrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible">
    ${yAxis}${bars}${labels}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+plotH}" stroke="#b7e4c7" stroke-width="1.5"/>
    <line x1="${padL}" y1="${padT+plotH}" x2="${W-padR}" y2="${padT+plotH}" stroke="#b7e4c7" stroke-width="1.5"/>
  </svg>`;

  document.getElementById('fin-chart-legend').innerHTML =
    `<span>⬛ Тёмный = текущий месяц</span>
     <span style="cursor:pointer;color:var(--green-mid);font-weight:700" onclick="window._finChartMode=(window._finChartMode==='income'?'lessons':'income');renderFinanceDashboard()">
       Показать: ${mode==='income'?'количество занятий →':'доход в ₽ →'}</span>`;

  // ── Debts list
  const debtsEl = document.getElementById('fin-debts-list');
  const debtEntries = Object.entries(debtByStudent)
    .map(([sid, amt]) => ({ sid, amt, name: (students.find(s => s.id === sid)?.name || '—') }))
    .sort((a, b) => b.amt - a.amt);

  if (!debtEntries.length) {
    debtsEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--green-mid);font-weight:700">🎉 Задолженностей нет!</div>`;
  } else {
    debtsEl.innerHTML = debtEntries.map(d => {
      const w = loadWallet(d.sid);
      const isWalletDebt = w.balance < 0;
      const attDebt = (att.filter(a => a.studentId === d.sid && a.present && !a.paid).reduce((s,a)=>s+(+a.costPerStudent||0),0));
      const source = isWalletDebt && w.balance < 0
        ? `<span style="font-size:0.72rem;color:#c0392b;margin-top:2px;display:block">💳 Кошелёк: ${w.balance.toLocaleString('ru')} ₽${attDebt>0?' · Занятия: '+attDebt.toLocaleString('ru')+' ₽':''}</span>`
        : `<span style="font-size:0.72rem;color:#c0392b;margin-top:2px;display:block">📅 Неоплаченные занятия</span>`;
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--green-xpale);cursor:pointer"
           onclick="navigateTo('attend-pay-admin');setTimeout(()=>selectStudentById('${d.sid}'),80)">
        <div>
          <div style="font-weight:600;font-size:0.9rem">${esc(d.name)}</div>
          ${source}
        </div>
        <span style="background:#fdecea;color:var(--red);font-weight:800;font-size:0.88rem;padding:3px 12px;border-radius:8px;flex-shrink:0;margin-left:12px">${d.amt.toLocaleString('ru')} ₽</span>
      </div>`;
    }).join('') +
      `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:800;font-size:0.92rem">
        <span>Итого</span><span style="color:var(--red)">${totalDebt.toLocaleString('ru')} ₽</span>
      </div>`;
  }

  // ── Forecast list
  const forecastEl = document.getElementById('fin-forecast-list');
  const nextMonthName = months[nextM] + ' ' + nextY;
  if (!forecastItems.length) {
    forecastEl.innerHTML = `<div style="font-size:0.85rem;color:var(--text3);padding:16px 0">Нет расписания с курсами для прогноза</div>`;
  } else {
    forecastEl.innerHTML =
      `<div style="font-size:0.78rem;color:var(--text3);margin-bottom:10px">📅 ${nextMonthName}</div>` +
      forecastItems.map(f => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--green-xpale)">
          <div>
            <div style="font-weight:600;font-size:0.85rem">${esc(f.label)}</div>
            <div style="font-size:0.74rem;color:var(--text3)">${esc(f.course)} · ${f.price}₽ × ${f.occurrences}</div>
          </div>
          <span class="badge badge-green" style="font-size:0.78rem">${f.income.toLocaleString('ru')} ₽</span>
        </div>`).join('') +
      `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:800;font-size:0.92rem">
         <span>Прогноз</span><span style="color:var(--green-deep)">${forecastTotal.toLocaleString('ru')} ₽</span>
       </div>`;
  }

  // ── Per-student table
  const search = (document.getElementById('fin-student-search')?.value || '').toLowerCase();
  const tableEl = document.getElementById('fin-student-table');

  const rows = students
    .filter(s => !search || s.name.toLowerCase().includes(search))
    .map(s => {
      const sAtt   = att.filter(a => a.studentId === s.id && a.present && a.paid);
      const curAtt = sAtt.filter(a => { const d = parseDate(a.date); return d && d.getFullYear() === curY && d.getMonth() === curM; });
      const sIncome = curAtt.reduce((sum, a) => sum + (+a.costPerStudent || 0), 0)
        + payments.filter(p => p.studentId === s.id && p.status === 'paid' && (() => { const d = parseDate(p.date); return d && d.getFullYear() === curY && d.getMonth() === curM; })()).reduce((sum, p) => sum + (+p.amount || 0), 0);
      const sDebt  = debtByStudent[s.id] || 0;
      const sLessons = curAtt.length;
      const wallet = loadWallet(s.id);
      return { s, sIncome, sDebt, sLessons, walletBalance: wallet.balance };
    })
    .sort((a, b) => b.sIncome - a.sIncome);

  if (!rows.length) {
    tableEl.innerHTML = `<div style="color:var(--text3);font-size:0.85rem;padding:16px 0">Ученики не найдены</div>`;
    return;
  }

  tableEl.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:0;border-radius:10px;overflow:hidden;border:1px solid var(--green-xpale)">
      <div style="padding:8px 12px;background:var(--bg2);font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase">Ученик</div>
      <div style="padding:8px 12px;background:var(--bg2);font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;text-align:right">Занятий</div>
      <div style="padding:8px 12px;background:var(--bg2);font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;text-align:right">Доход мес.</div>
      <div style="padding:8px 12px;background:var(--bg2);font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;text-align:right">Долг</div>
      <div style="padding:8px 12px;background:var(--bg2);font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;text-align:right">Кошелёк</div>
      ${rows.map((r, idx) => `
        <div style="padding:10px 12px;background:${idx%2?'var(--bg)':'#fff'};font-weight:600;font-size:0.88rem;cursor:pointer;color:var(--green-deep)"
             onclick="navigateTo('attend-pay-admin');setTimeout(()=>selectStudentById('${r.s.id}'),80)">${esc(r.s.name)}</div>
        <div style="padding:10px 12px;background:${idx%2?'var(--bg)':'#fff'};text-align:right;font-size:0.88rem">${r.sLessons}</div>
        <div style="padding:10px 12px;background:${idx%2?'var(--bg)':'#fff'};text-align:right;font-weight:700;font-size:0.88rem;color:var(--green-mid)">${r.sIncome?r.sIncome.toLocaleString('ru')+' ₽':'—'}</div>
        <div style="padding:10px 12px;background:${idx%2?'var(--bg)':'#fff'};text-align:right;font-size:0.88rem;color:${r.sDebt?'var(--red)':'var(--text3)'};font-weight:${r.sDebt?700:400}">${r.sDebt?r.sDebt.toLocaleString('ru')+' ₽':'—'}</div>
        <div style="padding:10px 12px;background:${idx%2?'var(--bg)':'#fff'};text-align:right;font-size:0.88rem;color:${r.walletBalance<0?'var(--red)':r.walletBalance>0?'var(--green-mid)':'var(--text3)'};font-weight:600">${r.walletBalance.toLocaleString('ru')} ₽</div>
      `).join('')}
    </div>`;
}

function renderReportsAdmin(){
  const students=getStudents();
  const sel=document.getElementById('report-student-select');
  sel.innerHTML=students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  // Default period: this month
  if(!document.getElementById('report-date-from').value){
    const from=new Date(); from.setDate(1);
    document.getElementById('report-date-from').value=from.toISOString().slice(0,10);
    document.getElementById('report-date-to').value=new Date().toISOString().slice(0,10);
  }
  generateReport();
}

function generateReport(){
  const sid = document.getElementById('report-student-select').value;
  if(!sid) return;

  const dateFrom = document.getElementById('report-date-from').value;
  const dateTo   = document.getElementById('report-date-to').value;
  const filterDate = (dateStr) => {
    if(!dateStr) return true;
    if(!dateFrom && !dateTo) return true;
    // dateStr can be 'DD.MM.YYYY' or 'YYYY-MM-DD'
    let d;
    if(dateStr.includes('-')) d=new Date(dateStr);
    else { const p=dateStr.split('.'); d=new Date(+p[2],+p[1]-1,+p[0]); }
    if(isNaN(d)) return true;
    if(dateFrom && d < new Date(dateFrom)) return false;
    if(dateTo   && d > new Date(dateTo+'T23:59:59')) return false;
    return true;
  };

  const student  = getStudents().find(s=>s.id===sid);
  const content  = (load('content')||[]).filter(c=>c.studentId===sid);
  const allTests = (load('tests')||[]).filter(t=>t.studentId===sid);
  const allHws   = (load('hw')||[]).filter(h=>h.studentId===sid);
  const allTrials= (load('trials')||[]).filter(t=>t.studentId===sid);
  const allAtt   = (()=>{const _r=load('attendance')||[];return Array.isArray(_r)?_r:Object.values(_r);})().filter(a=>a.studentId===sid);
  const srData   = getSRData(sid);

  // Filter by period
  const tests  = allTests.filter(t=>filterDate(t.date||t.due));
  const hws    = allHws.filter(h=>filterDate(h.due||h.date));
  const trials = allTrials.filter(t=>filterDate(t.date));
  const att    = allAtt.filter(a=>filterDate(a.date));

  const periodLabel = dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString('ru',{day:'numeric',month:'short'})} — ${new Date(dateTo).toLocaleDateString('ru',{day:'numeric',month:'short',year:'numeric'})}`
    : 'Всё время';

  // ── Theory (not filtered by date — always full)
  const theoryAll    = content.filter(c=>c.type==='theory');
  const theoryTotal  = theoryAll.length;
  const theoryViewed = theoryAll.filter(c=>srData[c.id]&&(srData[c.id].repetitions||0)>0).length;
  const theoryPct    = theoryTotal ? Math.round(theoryViewed/theoryTotal*100) : 0;

  // ── Tests
  const testsTotal     = tests.length;
  const testsSubmitted = tests.filter(t=>t.submitted).length;
  const testsPct       = testsTotal ? Math.round(testsSubmitted/testsTotal*100) : 0;
  const checkedTests   = tests.filter(t=>t.submitted&&t.autoTotal);
  const totalPts       = checkedTests.reduce((s,t)=>s+(t.autoTotal||0),0);
  const correctPts     = checkedTests.reduce((s,t)=>s+(t.autoScore||0),0);
  const testAccuracy   = totalPts ? Math.round(correctPts/totalPts*100) : null;
  const gradeCount = {5:0,4:0,3:0,2:0};
  tests.filter(t=>t.submitted&&t.autoGrade).forEach(t=>{ if(gradeCount[t.autoGrade]!=null) gradeCount[t.autoGrade]++; });
  const testDynamics = tests.filter(t=>t.submitted&&t.autoTotal).slice(-5).map(t=>({
    title:t.title, pct:Math.round((t.autoScore||0)/t.autoTotal*100), grade:t.autoGrade||'—', date:t.date
  }));
  // Full sorted series for the chart (all submitted tests with a date)
  const testChartData = tests
    .filter(t=>t.submitted && t.autoTotal && t.date)
    .map(t=>({
      date: t.date.includes('-') ? t.date : t.date.split('.').reverse().join('-'),
      pct:  Math.round((t.autoScore||0)/t.autoTotal*100),
      title:t.title,
      grade:t.autoGrade||null
    }))
    .sort((a,b)=>a.date.localeCompare(b.date));

  // ── HW
  const hwTotal     = hws.length;
  const hwSubmitted = hws.filter(h=>h.submitted).length;
  const hwChecked   = hws.filter(h=>h.openChecked).length;
  const hwPct       = hwTotal ? Math.round(hwSubmitted/hwTotal*100) : 0;
  const hwOverdue   = hws.filter(h=>!h.submitted && h.due && new Date(h.due.split('.').reverse().join('-')) < new Date()).length;

  // ── Trials
  const trialsTotal  = trials.length;
  const trialsDone   = trials.filter(t=>t.submitted).length;
  const trialsPct    = trialsTotal ? Math.round(trialsDone/trialsTotal*100) : 0;
  const trialScores  = trials.filter(t=>t.submitted&&t.totalScore!=null).map(t=>t.totalScore);
  const avgTrial     = trialScores.length ? Math.round(trialScores.reduce((a,b)=>a+b,0)/trialScores.length) : null;

  // ── Attendance
  const attTotal    = att.length;
  const attPresent  = att.filter(a=>a.present).length;
  const attAbsent   = attTotal - attPresent;
  const attPct      = attTotal ? Math.round(attPresent/attTotal*100) : 0;
  const attTotalCost= att.filter(a=>a.present).reduce((s,a)=>s+(+a.costPerStudent||0),0);
  const attUnpaid   = att.filter(a=>a.present&&!a.paid).reduce((s,a)=>s+(+a.costPerStudent||0),0);

  // ── Spaced Repetition
  const srItems      = theoryAll.filter(c=>srData[c.id]);
  const srDone       = srItems.filter(c=>(srData[c.id].repetitions||0)>0).length;
  const srTotal      = theoryTotal;
  const srPct        = srTotal ? Math.round(srDone/srTotal*100) : 0;
  const srDueToday   = getDueItems(sid).length;
  const srRepetitions= srItems.reduce((s,c)=>s+(srData[c.id].repetitions||0),0);

  // ── Daily tasks
  const taskLog = _dailyTaskLogCache[sid] ? {[sid]: _dailyTaskLogCache[sid]} : {};
  const tasksDone = Object.values(taskLog[sid]||[]).filter(e=>!dateFrom||(e.date>=dateFrom&&e.date<=(dateTo||'9999'))).length;

  // ── Helpers
  const bar = (pct, color='var(--green-mid)', label='')=>`
    <div style="display:flex;align-items:center;gap:10px;margin-top:5px">
      <div style="flex:1;background:var(--green-xpale);border-radius:100px;height:11px;overflow:hidden">
        <div style="width:${Math.min(pct,100)}%;background:${color};height:100%;border-radius:100px;transition:width 0.6s"></div>
      </div>
      <div style="font-size:0.8rem;color:var(--text3);white-space:nowrap;min-width:38px;text-align:right">${label||pct+'%'}</div>
    </div>`;
  const trendColor = pct => pct>=80?'var(--green-mid)':pct>=60?'#e07b00':'#c0392b';
  const trendIcon  = pct => pct>=80?'📈':pct>=60?'➡️':'📉';
  const gradeColor = g => ({5:'#27ae60',4:'#2980b9',3:'#e07b00',2:'#c0392b'}[g]||'var(--text3)');
  const sectionTitle = (icon, title) =>
    `<div style="display:flex;align-items:center;gap:8px;margin:20px 0 12px;border-bottom:1.5px solid var(--green-xpale);padding-bottom:8px">
       <span style="font-size:1.2rem">${icon}</span>
       <span style="font-weight:800;font-size:1rem;color:var(--accent)">${title}</span>
     </div>`;
  const chip = (label, val, color='var(--green-deep)') =>
    `<div style="background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;padding:10px 14px;text-align:center">
       <div style="font-size:0.72rem;color:var(--text3);font-weight:700;margin-bottom:3px">${label}</div>
       <div style="font-size:1.05rem;font-weight:800;color:${color}">${val}</div>
     </div>`;

  document.getElementById('report-output').innerHTML=`
  <div class="card" style="padding:24px">

    <!-- HEADER -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
      <div>
        <div style="font-size:1.4rem;font-weight:900;color:var(--accent)">${esc(student.name)}</div>
        <div style="font-size:0.82rem;color:var(--text3);margin-top:3px">
          ${student.subject||''}${student.subject&&student.format?' · ':''}${student.format||''}
          &nbsp;·&nbsp; Период: <b>${periodLabel}</b>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="downloadReportPDF('${sid}')">🖨 Скачать PDF</button>
    </div>

    <!-- OVERVIEW CHIPS -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:4px">
      ${chip('📖 Теория',`${theoryViewed}/${theoryTotal}`, trendColor(theoryPct))}
      ${chip('📋 Тесты',`${testsSubmitted}/${testsTotal}`, trendColor(testsPct))}
      ${chip('✏️ ДЗ',`${hwSubmitted}/${hwTotal}`, trendColor(hwPct))}
      ${chip('🎯 Пробник',trialsTotal?`${trialsDone}/${trialsTotal}`:'—', trialsPct>=50?'var(--green-mid)':'#e07b00')}
      ${chip('🧠 Повторение',`${srDone}/${srTotal}`, trendColor(srPct))}
      ${attTotal?chip('📅 Занятий',`${attPresent}/${attTotal}`, trendColor(attPct)):''}
    </div>

    <!-- ── ATTENDANCE ── -->
    ${attTotal>0?`
    ${sectionTitle('📅','Посещаемость')}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:14px">
      ${chip('Занятий всего', attTotal, 'var(--accent)')}
      ${chip('Посещено', attPresent, trendColor(attPct))}
      ${chip('Пропущено', attAbsent, attAbsent>0?'#c0392b':'var(--green-mid)')}
      ${chip('Посещаемость', attPct+'%', trendColor(attPct))}
      ${chip('Начислено', attTotalCost+'₽', 'var(--accent)')}
      ${attUnpaid>0?chip('Не оплачено', attUnpaid+'₽', '#c0392b'):chip('Оплачено','✅','var(--green-mid)')}
    </div>
    <div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:2px">Посещаемость за период</div>
      ${bar(attPct, trendColor(attPct))}
    </div>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">
      ${att.slice().reverse().map(a=>{
        const dateLabel=a.date?new Date(a.date).toLocaleDateString('ru',{day:'numeric',month:'short'}):a.date;
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--green-xpale);border-left:3px solid ${a.present?'var(--green-mid)':'#ef4444'}">
          <div style="font-size:0.8rem;color:var(--text3);min-width:60px">${dateLabel}${a.time?' '+a.time:''}</div>
          <div style="flex:1;font-size:0.82rem;font-weight:600">${escHtml(a.topic||'Занятие')}${a.group?' · '+escHtml(a.group):''}</div>
          <span style="font-size:0.75rem;font-weight:700;color:${a.present?'var(--green-mid)':'#c0392b'}">${a.present?'✅ Был':'❌ Не был'}</span>
          ${a.present?`<span style="font-size:0.73rem;color:var(--text3)">${a.costPerStudent}₽</span>`:''}
          ${a.present&&!a.paid?`<span style="font-size:0.7rem;font-weight:700;color:#c0392b">не опл.</span>`:''}
        </div>`;
      }).join('')}
    </div>`:''}

    <!-- ── THEORY ── -->
    ${sectionTitle('📖','Теоретические уроки')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <div style="font-size:0.82rem;color:var(--text3);margin-bottom:2px">Пройдено уроков</div>
        ${bar(theoryPct, trendColor(theoryPct))}
        <div style="font-size:0.78rem;color:var(--text3);margin-top:3px">${theoryViewed} из ${theoryTotal} материалов изучено ${trendIcon(theoryPct)}</div>
      </div>
      <div>
        <div style="font-size:0.82rem;color:var(--text3);margin-bottom:2px">Умное повторение</div>
        ${bar(srPct, trendColor(srPct))}
        <div style="font-size:0.78rem;color:var(--text3);margin-top:3px">${srRepetitions} повторений · ${srDueToday>0?`<span style="color:#c0392b">⚠️ ${srDueToday} к повторению сегодня</span>`:'✅ всё повторено'}</div>
      </div>
    </div>
    ${theoryAll.length ? `<div style="display:flex;flex-direction:column;gap:4px">
      ${theoryAll.map(c=>{
        const sr = srData[c.id];
        const reps = sr ? (sr.repetitions||0) : 0;
        const studied = reps > 0;
        const nextDue = sr ? sr.nextDue : null;
        const isOverdue = nextDue && nextDue <= todayStr() && studied;
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--green-xpale)">
          <div style="width:8px;height:8px;border-radius:50%;background:${studied?'var(--green-mid)':'#ccc'};flex-shrink:0"></div>
          <div style="flex:1;font-size:0.83rem;color:var(--text);font-weight:${studied?600:400}">${esc(c.title)}</div>
          <div style="font-size:0.73rem;color:var(--text3);white-space:nowrap">${reps>0?`${reps} повт.`:'не изучено'}</div>
          ${isOverdue?`<span style="font-size:0.7rem;color:#c0392b;font-weight:700">просрочено</span>`:''}
        </div>`;
      }).join('')}
    </div>` : '<div style="color:var(--text3);font-size:0.85rem">Материалов нет</div>'}

    <!-- ── TESTS ── -->
    ${sectionTitle('📋','Тесты')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div>
        <div style="font-size:0.82rem;color:var(--text3);margin-bottom:2px">Сдача тестов</div>
        ${bar(testsPct, trendColor(testsPct))}
        <div style="font-size:0.78rem;color:var(--text3);margin-top:3px">${testsSubmitted} из ${testsTotal} сдано</div>
      </div>
      ${testAccuracy!==null?`<div>
        <div style="font-size:0.82rem;color:var(--text3);margin-bottom:2px">Точность ответов</div>
        ${bar(testAccuracy, trendColor(testAccuracy))}
        <div style="font-size:0.78rem;color:var(--text3);margin-top:3px">${correctPts} из ${totalPts} баллов ${trendIcon(testAccuracy)}</div>
      </div>`:'<div></div>'}
    </div>
    ${Object.values(gradeCount).some(v=>v>0)?`
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${[5,4,3,2].map(g=>gradeCount[g]?`<div style="background:${gradeColor(g)}18;border:1px solid ${gradeColor(g)}44;border-radius:8px;padding:6px 14px;font-size:0.82rem;font-weight:700;color:${gradeColor(g)}">Оценка ${g}: ${gradeCount[g]} раз(а)</div>`:'').join('')}
    </div>`:''}
    ${testDynamics.length?`
    <div style="margin-bottom:4px">
      <div style="font-size:0.8rem;color:var(--text3);font-weight:700;margin-bottom:8px">Динамика последних тестов:</div>
      ${testDynamics.map((t,i)=>`
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;padding:7px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--green-xpale)">
          <div style="font-size:0.75rem;color:var(--text3);min-width:18px">#${i+1}</div>
          <div style="flex:1;font-size:0.83rem;font-weight:600;color:var(--text)">${esc(t.title)}</div>
          <div style="min-width:80px">${bar(t.pct, trendColor(t.pct),'')}</div>
          <div style="font-size:0.78rem;font-weight:700;color:${trendColor(t.pct)};min-width:36px;text-align:right">${t.pct}%</div>
          ${t.grade!=='—'?`<div style="background:${gradeColor(t.grade)}18;color:${gradeColor(t.grade)};border-radius:6px;padding:2px 8px;font-size:0.72rem;font-weight:700">${t.grade}</div>`:''}
          <div style="font-size:0.72rem;color:var(--text3)">${t.date||''}</div>
        </div>`).join('')}
    </div>`:''}
    ${tests.filter(t=>!t.submitted).length?`<div style="font-size:0.8rem;color:#e07b00;margin-top:4px">⏳ ${tests.filter(t=>!t.submitted).length} тест(ов) ещё не сдано</div>`:''}

    <!-- ── PROGRESS CHART ── -->
    ${testChartData.length >= 2 ? `
    ${sectionTitle('📈','График прогресса')}
    <div style="background:var(--bg);border-radius:14px;padding:16px;margin-bottom:8px">
      <div style="position:relative;height:220px"><canvas id="progress-chart"></canvas></div>
    </div>
    ` : testChartData.length === 1 ? `
    ${sectionTitle('📈','График прогресса')}
    <div style="font-size:0.84rem;color:var(--text3);margin-bottom:16px">Нужно минимум 2 теста для отображения графика. Сейчас: 1 тест — ${testChartData[0].pct}%.</div>
    ` : ''}

    <!-- ── HW ── -->
    ${sectionTitle('✏️','Домашние задания')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <div style="font-size:0.82rem;color:var(--text3);margin-bottom:2px">Выполнение ДЗ</div>
        ${bar(hwPct, trendColor(hwPct))}
        <div style="font-size:0.78rem;color:var(--text3);margin-top:3px">${hwSubmitted} из ${hwTotal} сдано · ${hwChecked} проверено</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;gap:4px">
        ${hwOverdue?`<div style="font-size:0.82rem;color:#c0392b;font-weight:700">⚠️ ${hwOverdue} ДЗ просрочено</div>`:''}
        ${hwOverdue===0&&hwTotal>0?`<div style="font-size:0.82rem;color:var(--green-deep);font-weight:700">✅ Все ДЗ сданы вовремя</div>`:''}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${hws.map(h=>{
        const isOverdue = !h.submitted && h.due && new Date(h.due.split('.').reverse().join('-')) < new Date();
        const statusColor = h.openChecked?'var(--green-mid)':h.submitted?'#2980b9':isOverdue?'#c0392b':'#e07b00';
        const statusLabel = h.openChecked?'✅ Проверено':h.submitted?'📝 На проверке':isOverdue?'⚠️ Просрочено':'⏳ Не сдано';
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--green-xpale)">
          <div style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0"></div>
          <div style="flex:1;font-size:0.83rem;font-weight:600">${esc(h.title)}</div>
          <div style="font-size:0.73rem;color:var(--text3)">Срок: ${h.due||'—'}</div>
          <div style="font-size:0.73rem;font-weight:700;color:${statusColor};white-space:nowrap">${statusLabel}</div>
        </div>`;
      }).join('')||'<div style="color:var(--text3);font-size:0.85rem">Нет ДЗ</div>'}
    </div>

    <!-- ── TRIALS ── -->
    ${sectionTitle('🎯','Пробники')}
    ${trialsTotal===0?`<div style="color:var(--text3);font-size:0.85rem">Пробников нет</div>`:`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <div style="font-size:0.82rem;color:var(--text3);margin-bottom:2px">Прохождение</div>
        ${bar(trialsPct, trendColor(trialsPct))}
        <div style="font-size:0.78rem;color:var(--text3);margin-top:3px">${trialsDone} из ${trialsTotal} пройдено</div>
      </div>
      ${avgTrial!==null?`<div style="display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:0.82rem;color:var(--text3)">Средний балл</div>
        <div style="font-size:1.4rem;font-weight:900;color:${trendColor(avgTrial)}">${avgTrial}</div>
      </div>`:'<div></div>'}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${trials.map(t=>`
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--green-xpale)">
          <div style="width:8px;height:8px;border-radius:50%;background:${t.submitted?'var(--green-mid)':'#ccc'};flex-shrink:0"></div>
          <div style="flex:1;font-size:0.83rem;font-weight:600">${t.title||'Пробник'}</div>
          ${t.submitted&&t.totalScore!=null?`<div style="font-size:0.78rem;font-weight:700;color:${trendColor(t.totalScore)}">${t.totalScore} б.</div>`:''}
          <div style="font-size:0.73rem;font-weight:700;color:${t.submitted?'var(--green-mid)':'var(--text3)'}">${t.submitted?'✅ Сдан':'⏳ Не сдан'}</div>
        </div>`).join('')}
    </div>`}

    <!-- ── SMART REPEAT ── -->
    ${sectionTitle('🧠','Умное повторение')}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
      ${chip('Охват материала',`${srPct}%`, trendColor(srPct))}
      ${chip('Всего повторений', srRepetitions, 'var(--green-deep)')}
      ${chip('Ожидают сегодня', srDueToday, srDueToday>0?'#c0392b':'var(--green-mid)')}
    </div>
    ${srDueToday>0?`<div style="font-size:0.82rem;color:#c0392b;font-weight:700;margin-bottom:8px">⚠️ Ученик не выполнил повторение сегодня (${srDueToday} материалов)</div>`:
    srRepetitions>0?`<div style="font-size:0.82rem;color:var(--green-deep);font-weight:700;margin-bottom:8px">✅ Умное повторение ведётся активно</div>`:
    `<div style="font-size:0.82rem;color:var(--text3);margin-bottom:8px">Повторений пока не было</div>`}

    <!-- ── DAILY TASKS ── -->
    ${sectionTitle('📅','Задание дня')}
    ${tasksDone>0
      ?`<div style="font-size:0.88rem;color:var(--green-deep);font-weight:700">✅ Решено ${tasksDone} заданий дня за период</div>`
      :`<div style="font-size:0.85rem;color:var(--text3)">Заданий дня за период не было</div>`}

    <hr class="divider" style="margin-top:24px">
    <button class="btn btn-green" onclick="downloadReportPDF('${sid}')">🖨 Скачать PDF</button>
  </div>`;
  // Draw chart after DOM update
  if(testChartData.length >= 2) drawProgressChart(testChartData);
}

// Draw progress chart after DOM update
// ── График прогресса — Chart.js ──────────────────────────────────
// Заменяет ~130 строк сырого Canvas API.
// Требует: <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js">

let _progressChartInstance = null;   // держим ссылку для destroy()

function drawProgressChart(data) {
  const canvas = document.getElementById('progress-chart');
  if (!canvas || !data || data.length < 2) return;

  // Уничтожаем предыдущий экземпляр (переключение учеников)
  if (_progressChartInstance) { _progressChartInstance.destroy(); _progressChartInstance = null; }

  const labels = data.map(d => formatDueDisplay(d.date));
  const pcts   = data.map(d => d.pct);
  const colors = pcts.map(v => v >= 80 ? '#27ae60' : v >= 60 ? '#e07b00' : '#c0392b');

  _progressChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: pcts,
        borderColor: '#40916c',
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        backgroundColor: (ctx) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, 'rgba(64,145,108,0.28)');
          g.addColorStop(1, 'rgba(64,145,108,0.02)');
          return g;
        },
        pointBackgroundColor: colors,
        pointBorderColor: colors,
        pointBorderWidth: 2.5,
        pointRadius: 6,
        pointHoverRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: 'easeOutQuart' },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: {
            callback: v => v + '%',
            color: 'rgba(74,103,65,0.7)',
            font: { family: 'Nunito, sans-serif', size: 11 },
            stepSize: 25
          },
          grid: { color: 'rgba(45,106,79,0.10)' },
          border: { display: false }
        },
        x: {
          ticks: {
            color: 'rgba(74,103,65,0.7)',
            font: { family: 'Nunito, sans-serif', size: 11 },
            maxTicksLimit: 8,
            maxRotation: 30
          },
          grid: { display: false },
          border: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(27,67,50,0.92)',
          titleFont: { family: 'Nunito, sans-serif', size: 13, weight: 'bold' },
          bodyFont:  { family: 'Nunito, sans-serif', size: 11 },
          titleColor: '#fff',
          bodyColor:  'rgba(255,255,255,0.75)',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              const d = data[items[0].dataIndex];
              return d.pct + '%' + (d.grade ? ' · Оценка ' + d.grade : '');
            },
            label: (item) => {
              const d = data[item.dataIndex];
              const short = d.title.length > 28 ? d.title.slice(0, 27) + '…' : d.title;
              return [formatDueDisplay(d.date), short];
            }
          }
        }
      }
    }
  });
}


function downloadReport(sid){
  const student  = getStudents().find(s=>s.id===sid);
  const content  = (load('content')||[]).filter(c=>c.studentId===sid);
  const tests    = (load('tests')||[]).filter(t=>t.studentId===sid);
  const hws      = (load('hw')||[]).filter(h=>h.studentId===sid);
  const trials   = (load('trials')||[]).filter(t=>t.studentId===sid);
  const srData   = getSRData(sid);
  const theory   = content.filter(c=>c.type==='theory');
  const srDone   = theory.filter(c=>srData[c.id]&&(srData[c.id].repetitions||0)>0).length;
  const taskLog  = _dailyTaskLogCache[sid] ? {[sid]: _dailyTaskLogCache[sid]} : {};
  const tasksDone = (_dailyTaskLogCache[sid]||[]).length;

  const line = '─'.repeat(48);
  let txt = `ОТЧЁТ ПО УЧЕНИКУ\n${line}\n`;
  txt += `Ученик:  ${student.name}\n`;
  txt += `Предмет: ${student.subject||'—'}  Формат: ${student.format||'—'}\n`;
  txt += `Дата:    ${new Date().toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'})}\n\n`;

  txt += `📖 ТЕОРИЯ\n${line}\n`;
  txt += `Пройдено: ${srDone} из ${theory.length}\n`;
  theory.forEach(c=>{
    const sr=srData[c.id];
    txt += `  ${sr&&(sr.repetitions||0)>0?'✅':'○'} ${esc(c.title)}${sr?(` — ${sr.repetitions||0} повт.`):'  (не изучено)'}\n`;
  });

  txt += `\n🧠 УМНОЕ ПОВТОРЕНИЕ\n${line}\n`;
  const srReps = theory.reduce((s,c)=>s+(srData[c.id]?.repetitions||0),0);
  txt += `Всего повторений: ${srReps}\nОхват: ${srDone}/${theory.length}\n`;

  txt += `\n📋 ТЕСТЫ\n${line}\n`;
  txt += `Сдано: ${tests.filter(t=>t.submitted).length} из ${tests.length}\n`;
  tests.forEach(t=>{
    txt += `  ${t.submitted?'✅':'○'} ${esc(t.title)}`;
    if(t.submitted&&t.autoTotal) txt += ` — ${t.autoScore||0}/${t.autoTotal} б. (${Math.round((t.autoScore||0)/t.autoTotal*100)}%)${t.autoGrade?' оценка '+t.autoGrade:''}`;
    txt += `  ${t.date||''}\n`;
  });

  txt += `\n✏️ ДОМАШНИЕ ЗАДАНИЯ\n${line}\n`;
  txt += `Сдано: ${hws.filter(h=>h.submitted).length} из ${hws.length}\n`;
  hws.forEach(h=>{
    const isOverdue = !h.submitted&&h.due&&new Date(h.due.split('.').reverse().join('-'))<new Date();
    txt += `  ${h.openChecked?'✅':h.submitted?'📝':isOverdue?'⚠️':'○'} ${esc(h.title)}  Срок: ${h.due||'—'}  ${h.openChecked?'Проверено':h.submitted?'На проверке':isOverdue?'ПРОСРОЧЕНО':'Не сдано'}\n`;
  });

  txt += `\n🎯 ПРОБНИКИ\n${line}\n`;
  txt += `Пройдено: ${trials.filter(t=>t.submitted).length} из ${trials.length}\n`;
  trials.forEach(t=>{
    txt += `  ${t.submitted?'✅':'○'} ${t.title||'Пробник'}${t.submitted&&t.totalScore!=null?` — ${t.totalScore} б.`:''}\n`;
  });

  txt += `\n📅 ЗАДАНИЕ ДНЯ\n${line}\n`;
  txt += `Решено заданий: ${tasksDone}\n`;

  const blob = new Blob([txt],{type:'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Отчёт_${student.name.replace(/ /g,'_')}_${new Date().toLocaleDateString('ru').replace(/\./g,'-')}.txt`;
  a.click();
}
function downloadReportPDF(sid) {
  const reportEl = document.getElementById('report-output');
  if (!reportEl || !reportEl.innerHTML.trim()) { showNotif('⚠️ Сначала сформируйте отчёт'); return; }

  const student     = getStudents().find(s => s.id === sid);
  const dateFrom    = (document.getElementById('report-date-from') || {}).value;
  const dateTo      = (document.getElementById('report-date-to')   || {}).value;
  const periodLabel = dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString('ru', {day:'numeric',month:'short'})} — ${new Date(dateTo).toLocaleDateString('ru', {day:'numeric',month:'short',year:'numeric'})}`
    : 'Всё время';

  const fullHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Отчёт — ${student ? student.name : ''}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Nunito',sans-serif;font-size:13px;color:#1a2e1f;background:#fff;padding:28px 36px}
  h1{font-family:'Playfair Display',serif;font-size:22px;color:#1b4332;margin-bottom:4px}
  .sub{font-size:11px;color:#7a9b73;margin-bottom:20px}
  .section{margin:18px 0 8px;border-bottom:1.5px solid #d8f3dc;padding-bottom:5px;font-weight:800;font-size:13px;color:#1b4332;display:flex;align-items:center;gap:6px}
  .chips{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px}
  .chip{border:1px solid #d8f3dc;border-radius:8px;padding:8px 6px;text-align:center;page-break-inside:avoid}
  .chip-label{font-size:9px;color:#7a9b73;font-weight:700;margin-bottom:2px}
  .chip-val{font-size:14px;font-weight:800;color:#1b4332}
  .bar-row{display:flex;align-items:center;gap:8px;margin:5px 0}
  .bar-bg{flex:1;background:#d8f3dc;border-radius:99px;height:9px;overflow:hidden}
  .bar-fill{height:100%;border-radius:99px}
  .bar-pct{font-size:10px;color:#7a9b73;min-width:34px;text-align:right}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px;page-break-inside:avoid}
  th{background:#d8f3dc;color:#1b4332;font-weight:700;padding:5px 8px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #eaf3e2}
  tr:last-child td{border-bottom:none}
  .badge{display:inline-block;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700}
  .green{background:#d8f3dc;color:#1b4332}
  .red{background:#fde8e6;color:#c0392b}
  .yellow{background:#fef3cd;color:#8a6400}
  .meta{font-size:11px;color:#4a6741;margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap}
  .meta span{display:flex;align-items:center;gap:4px}
  /* ── Защита от разрывов страниц ── */
  .card, table, tr, .chip, .bar-row { page-break-inside: avoid; }
  h2, h3, .section { page-break-after: avoid; }
  thead { display: table-header-group; }
  @media print {
    body{padding:16px 24px}
    @page{margin:1.2cm;size:A4}
    .card{box-shadow:none!important;border:1px solid #d8f3dc!important}
  }
</style>
</head>
<body>
<h1>📊 Отчёт по ученику</h1>
<div class="sub">Сформирован: ${new Date().toLocaleDateString('ru', {day:'numeric',month:'long',year:'numeric'})}</div>
<div class="meta">
  <span>👤 <b>${student ? student.name : '—'}</b></span>
  ${student && student.subject ? `<span>📚 ${student.subject}</span>` : ''}
  ${student && student.format  ? `<span>🎓 ${student.format}</span>`  : ''}
  <span>📅 Период: <b>${periodLabel}</b></span>
</div>
${reportEl.innerHTML}
</body></html>`;

  // Пробуем jsPDF + html2canvas (если загружены), иначе — печать
  if (typeof window.jspdf !== 'undefined' && typeof html2canvas !== 'undefined') {
    _exportPdfViaJsPDF(fullHtml, student);
  } else {
    _exportPdfViaPrint(fullHtml, student);
  }
}

function _exportPdfViaPrint(html, student) {
  const old = document.getElementById('pdf-print-frame');
  if (old) old.remove();
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { showNotif('⚠️ Разрешите всплывающие окна в браузере'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 700);
}

function _exportPdfViaJsPDF(html, student) {
  // Рендерим во временный скрытый div, затем конвертируем через html2canvas → jsPDF
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;z-index:-1';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  showNotif('⏳ Генерируем PDF…');

  html2canvas(wrap, { scale: 2, useCORS: true, logging: false }).then(canvas => {
    document.body.removeChild(wrap);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pW  = pdf.internal.pageSize.getWidth();
    const pH  = pdf.internal.pageSize.getHeight();
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgH = (canvas.height * pW) / canvas.width;
    let y = 0;
    while (y < imgH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -y, pW, imgH);
      y += pH;
    }
    const name = student ? student.name.replace(/ /g, '_') : 'report';
    pdf.save(`Отчёт_${name}_${new Date().toLocaleDateString('ru').replace(/\./g, '-')}.pdf`);
    showNotif('✅ PDF сохранён');
  }).catch(e => {
    console.error('[PDF]', e);
    showNotif('⚠️ Ошибка генерации PDF, открываем печать');
    _exportPdfViaPrint(html, student);
  });
}


function switchTab(group, tabEl, targetId){
  const allTabs=tabEl.closest('.tabs').querySelectorAll('.tab');
  allTabs.forEach(t=>t.classList.remove('active'));
  tabEl.classList.add('active');
  const prefix={content:'ct-',smaterial:'sm-',sched:'sched-'}[group]||'';
  document.querySelectorAll('[id^="'+prefix+'"]').forEach(el=>el.style.display='none');
  document.getElementById(targetId).style.display='block';
}

// ═══════════════════════════════════════════
// NOTIFICATION
// ═══════════════════════════════════════════
function showNotif(msg){
  const el=document.getElementById('notif');
  el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}

// ═══════════════════════════════════════════
// STARTUP — restore lesson session if page was refreshed
(function _restoreLessonSession(){
  const code = sessionStorage.getItem('biohim_active_lesson_code');
  if(!code) return;
  // Восстановим кэш из Firebase при перезагрузке страницы
  loadLessonDataAsync(code).then(data => {
    if(!data) { sessionStorage.removeItem('biohim_active_lesson_code'); return; }
    _lessonCode = code;
    _lessonRoom = data.room || ('biohim-lesson-' + code);
    _lessonStart = data.startedAt || Date.now();
    _lessonActive = true;
  }).catch(()=>{});
})();

// STARTUP — load from Firebase then show login
// ═══════════════════════════════════════════
// Helpers to drive the HTML skeleton overlay (inserted in index.html)
function _loadingStep(text, pct){
  const s = document.getElementById('app-loading-step');
  const b = document.getElementById('app-loading-bar');
  if(s) s.textContent = text;
  if(b) b.style.width = pct + '%';
}
function _loadingDone(){
  const overlay = document.getElementById('app-loading-overlay');
  if(overlay){
    overlay.style.transition = 'opacity 0.3s ease';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 320);
  }
  // Reveal login screen
  const ls = document.getElementById('login-screen');
  if(ls) ls.style.visibility = 'visible';
}

(async () => {
  _loadingStep('Подключение к базе данных…', 10);

  try {
    _loadingStep('Загрузка данных…', 35);
    await preloadCache(); // при таймауте не бросает, ставит _preloadWarning
    _loadingStep('Инициализация…', 75);
    await initData();
    _loadingStep('Готово', 100);
  } catch(e) {
    console.error('Init error:', e);
    _loadingDone();
    // Show error inline on login form instead
    const errEl = document.getElementById('login-err');
    if(errEl) errEl.textContent = '⚠️ Ошибка загрузки: ' + (e.message||e) + ' — попробуйте обновить страницу';
    return;
  }

  _loadingDone();

  // Если preload прошёл с предупреждением — показываем на экране логина (не блокируем)
  if (_preloadWarning) {
    const errEl = document.getElementById('login-err');
    if (errEl) errEl.textContent = '⚠️ Нет связи с сервером — данные могут быть устаревшими. Попробуйте обновить страницу.';
  }

  // Автовход если сессия сохранена
  const savedSession = localStorage.getItem('biohim_session');
  if(savedSession){
    try{
      const savedUser = JSON.parse(savedSession);
      // Проверяем что пользователь ещё существует в базе
      const users = load('users')||[];
      const user  = users.find(u=>u.id===savedUser.id);
      // Проверяем срок сессии
      if(savedUser.expiresAt && Date.now() > savedUser.expiresAt){
        localStorage.removeItem('biohim_session');
        return;
      }
      if(user){
        // Проверяем что роль в сессии совпадает с ролью в базе (защита от ручного изменения)
        if(savedUser.role && savedUser.role !== user.role){
          console.warn('[Security] Session role mismatch — forced logout');
          localStorage.removeItem('biohim_session');
          return;
        }
        currentUser = user;
        document.getElementById('login-screen').style.display='none';
        document.getElementById('app').style.display='block';
        const resetBtn = document.getElementById('btn-reset-data');
        if(resetBtn) resetBtn.style.display = user.role==='admin' ? 'block' : 'none';
        // hide chat badge for parent
        if(user.role==='parent'){ const cb=document.getElementById('sidebar-chat-badge'); if(cb) cb.style.display='none'; }
        buildNav();
        subscribeRealtime();
        // Загружаем пользовательские данные из Firebase в кэш + одноразовая миграция из localStorage
        await runLocalStorageMigration(user);
        await preloadUserData(user);
        const defaultPage = user.role==='admin' ? 'dashboard' : user.role==='parent' ? 'parent-dashboard' : 'student-dashboard';
        const lastPage = localStorage.getItem('biohim_last_page_'+user.id) || defaultPage;
        navigateTo(lastPage);
      } else {
        localStorage.removeItem('biohim_session');
      }
    } catch(e){ localStorage.removeItem('biohim_session'); }
  }

  // Press Enter to login
  document.getElementById('login-password').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
  document.getElementById('login-username').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });

  // Close modal on bg click
  document.querySelectorAll('.modal-bg').forEach(bg=>{
    bg.addEventListener('click',e=>{ if(e.target===bg) bg.classList.remove('open'); });
  });
})();

// ══════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════
let _calYear = new Date().getFullYear();
let _calMonth = new Date().getMonth(); // 0-based
let _todoMode = 'day';

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const RU_DAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
// Day-of-week text → number (Mon=0)
const DAY_MAP = {'Понедельник':0,'Вторник':1,'Среда':2,'Четверг':3,'Пятница':4,'Суббота':5,'Воскресенье':6};

function calPrev(){ _calMonth--; if(_calMonth<0){_calMonth=11;_calYear--;} renderCalendar(); }
function calNext(){ _calMonth++; if(_calMonth>11){_calMonth=0;_calYear++;} renderCalendar(); }
function calToday(){ _calYear=new Date().getFullYear(); _calMonth=new Date().getMonth(); renderCalendar(); }

// Student calendar state
let _sCalYear = new Date().getFullYear();
let _sCalMonth = new Date().getMonth();
let _sTodoMode = 'day';

function sCalPrev(){ _sCalMonth--; if(_sCalMonth<0){_sCalMonth=11;_sCalYear--;} renderStudentCalendar(); }
function sCalNext(){ _sCalMonth++; if(_sCalMonth>11){_sCalMonth=0;_sCalYear++;} renderStudentCalendar(); }
function sCalToday(){ _sCalYear=new Date().getFullYear(); _sCalMonth=new Date().getMonth(); renderStudentCalendar(); }

// Returns array of {date:Date, type:'blue'|'red'|'yellow', label, who}
function getCalEvents(){
  const events = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const users = (load('users')||[]);

  // 🔵 BLUE — занятия (slots with bookedBy)
  const slots = load('slots')||[];
  slots.filter(s=>s.bookedBy).forEach(s=>{
    const dowIndex = DAY_MAP[s.day];
    if(dowIndex === undefined) return;
    const student = users.find(u=>u.id===s.bookedBy);
    // Generate occurrences for next 6 weeks from today
    for(let w=0; w<6; w++){
      const d = new Date(today);
      // Find next occurrence of this weekday
      let diff = (dowIndex - ((today.getDay()+6)%7) + 7*w) % 7;
      if(diff===0 && w>0) diff=7;
      d.setDate(today.getDate() + (7*w) + (w===0 ? (diff===0?0:diff) : 0));
      // Simpler: just find date of that weekday in current+next weeks
      const base = new Date(today);
      base.setDate(today.getDate() - ((today.getDay()+6)%7) + dowIndex + 7*w);
      base.setHours(0,0,0,0);
      if(base >= today || w===0){
        events.push({
          date: base,
          type: 'blue',
          label: `${s.time} — ${student?student.name:'ученик'}`,
          who: student?student.name:''
        });
      }
    }
  });

  // 🔴 RED — сроки сдачи ДЗ
  const hws = load('hw')||[];
  hws.filter(h=>h.due && !h.submitted).forEach(h=>{
    const d = new Date(h.due); d.setHours(0,0,0,0);
    const student = users.find(u=>u.id===h.studentId);
    events.push({date:d, type:'red', label:`ДЗ: ${esc(h.title)}`, who:student?student.name:''});
  });

  // 🟡 YELLOW — срок сдачи тестов (используем дату создания + 7 дней если нет due)
  const tests = load('tests')||[];
  tests.filter(t=>!t.submitted).forEach(t=>{
    let d;
    if(t.due){ d = new Date(t.due); d.setHours(0,0,0,0); }
    else {
      // Use creation date + 7 days as soft deadline
      const parts = (t.date||'').split('.');
      if(parts.length===3){ d = new Date(+parts[2],+parts[1]-1,+parts[0]); d.setDate(d.getDate()+7); d.setHours(0,0,0,0); }
    }
    if(!d || isNaN(d)) return;
    const student = users.find(u=>u.id===t.studentId);
    events.push({date:d, type:'yellow', label:`Тест: ${esc(t.title)}`, who:student?student.name:''});
  });

  return events;
}
function renderCalendar(){
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month-label');
  if(!grid || !label) return;

  label.textContent = `${RU_MONTHS[_calMonth]} ${_calYear}`;

  // Day-of-week headers (Mon first)
  let html = RU_DAYS_SHORT.map(d=>`<div class="cal-dow">${d}</div>`).join('');

  // First day of month (Mon=0 based)
  const firstDay = new Date(_calYear, _calMonth, 1);
  const startDow = (firstDay.getDay()+6)%7; // Mon=0
  const daysInMonth = new Date(_calYear, _calMonth+1, 0).getDate();
  const daysInPrev = new Date(_calYear, _calMonth, 0).getDate();

  const today = new Date(); today.setHours(0,0,0,0);
  const events = getCalEvents();

  // Build a map: "YYYY-MM-DD" → [{type, label, who}]
  const evMap = {};
  events.forEach(ev=>{
    if(isNaN(ev.date)) return;
    const key = ev.date.toISOString().slice(0,10);
    if(!evMap[key]) evMap[key]=[];
    evMap[key].push(ev);
  });

  // Prev month padding
  for(let i=0; i<startDow; i++){
    const d = daysInPrev - startDow + 1 + i;
    html += `<div class="cal-day other-month"><span>${d}</span></div>`;
  }
  // Current month days
  for(let d=1; d<=daysInMonth; d++){
    const date = new Date(_calYear, _calMonth, d);
    date.setHours(0,0,0,0);
    const isToday = date.getTime()===today.getTime();
    const key = date.toISOString().slice(0,10);
    const dayEvs = evMap[key] || [];
    // Unique types for dots
    const typeSet = new Set(dayEvs.map(e=>e.type));
    const dots = [...typeSet].map(t=>`<div class="cal-dot ${t}"></div>`).join('');
    const hasEv = dayEvs.length > 0;
    html += `<div class="cal-day ${isToday?'today':''} ${hasEv?'has-events':''}" ${hasEv?`onclick="openCalDay('${key}',${d})"`:''}>
      <span>${d}</span>
      ${dots?`<div class="cal-dots">${dots}</div>`:''}
    </div>`;
  }
  // Next month padding
  const total = startDow + daysInMonth;
  const remainder = total % 7 === 0 ? 0 : 7 - (total % 7);
  for(let i=1; i<=remainder; i++){
    html += `<div class="cal-day other-month"><span>${i}</span></div>`;
  }

  grid.innerHTML = html;
}

function openCalDay(key, dayNum){
  const events = getCalEvents();
  const dayEvs = events.filter(ev=>!isNaN(ev.date) && ev.date.toISOString().slice(0,10)===key);
  if(!dayEvs.length) return;

  const [y,m,d] = key.split('-').map(Number);
  const dateObj = new Date(y,m-1,d);
  const dateStr = dateObj.toLocaleDateString('ru',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('cal-popup-title').textContent = '📅 ' + dateStr.charAt(0).toUpperCase()+dateStr.slice(1);

  const typeLabels = {blue:'📅 Занятие', red:'📝 Сдача ДЗ', yellow:'📋 Тест'};
  const typePrio = {blue:0,yellow:1,red:2};
  dayEvs.sort((a,b)=>typePrio[a.type]-typePrio[b.type]);

  document.getElementById('cal-popup-body').innerHTML = dayEvs.map(ev=>`
    <div class="cal-popup-item ${ev.type}">
      <div class="todo-dot ${ev.type}" style="margin-top:3px"></div>
      <div>
        <div class="todo-title">${ev.label}</div>
        <div class="todo-meta">${typeLabels[ev.type]}${ev.who?' · '+ev.who:''}</div>
      </div>
    </div>`).join('');

  document.getElementById('cal-popup-bg').classList.add('open');
}

function closeCalPopup(){
  document.getElementById('cal-popup-bg').classList.remove('open');
}

// ── STUDENT CALENDAR ──
// Get events filtered for the current student
function navigateToEvent(nav, itemId){
  closeCalPopup();
  navigateTo(nav);
  if(itemId){
    // Highlight the target item after page renders
    setTimeout(()=>{
      // For tests: open the test directly
      if(nav==='student-tests'){
        const el = document.querySelector(`[data-item-id="${itemId}"]`);
        if(el){
          el.scrollIntoView({behavior:'smooth', block:'center'});
          el.style.transition='box-shadow 0.3s';
          el.style.boxShadow='0 0 0 3px var(--green-mid)';
          setTimeout(()=>el.style.boxShadow='', 2000);
        }
      }
      // For HW: same highlight
      if(nav==='student-hw'){
        const el = document.querySelector(`[data-item-id="${itemId}"]`);
        if(el){
          el.scrollIntoView({behavior:'smooth', block:'center'});
          el.style.transition='box-shadow 0.3s';
          el.style.boxShadow='0 0 0 3px #ef4444';
          setTimeout(()=>el.style.boxShadow='', 2000);
        }
      }
    }, 80);
  }
}

function getCalEventsForStudent(){
  const events = [];
  const sid = currentUser ? currentUser.id : null;
  if(!sid) return events;
  const today = new Date(); today.setHours(0,0,0,0);

  // BLUE — занятия этого ученика (напрямую или через группу)
  const slots = load('slots')||[];
  slots.filter(s=>isSlotForStudent(s,sid)).forEach(s=>{
    const dowIndex = DAY_MAP[s.day];
    if(dowIndex === undefined) return;
    for(let w=0; w<8; w++){
      const base = new Date(today);
      base.setDate(today.getDate() - ((today.getDay()+6)%7) + dowIndex + 7*w);
      base.setHours(0,0,0,0);
      if(base >= today || w===0){
        events.push({ date: base, type: 'blue', label: s.time + ' — занятие', who: '', itemId: s.id, nav: 'student-schedule' });
      }
    }
  });

  // RED — сроки ДЗ этого ученика
  const hws = load('hw')||[];
  hws.filter(h=>h.studentId===sid && h.due && !h.submitted).forEach(h=>{
    const d = new Date(h.due); d.setHours(0,0,0,0);
    events.push({ date: d, type: 'red', label: 'ДЗ: ' + h.title, who: '', itemId: h.id, nav: 'student-hw' });
  });

  // RED — неоплаченные занятия
  const att = load('attendance')||[];
  att.filter(a=>a.studentId===sid && a.present && !a.paid && a.date).forEach(a=>{
    const d = new Date(a.date); d.setHours(0,0,0,0);
    events.push({ date: d, type: 'red', label: `💳 Не оплачено: ${a.topic||'занятие'} (${a.costPerStudent}₽)`, who:'', itemId:a.id, nav:'student-schedule', unpaidLesson:true });
  });

  // YELLOW — срок тестов этого ученика
  const tests = load('tests')||[];
  tests.filter(t=>t.studentId===sid && !t.submitted).forEach(t=>{
    let d;
    if(t.due){ d = new Date(t.due); d.setHours(0,0,0,0); }
    else {
      const parts = (t.date||'').split('.');
      if(parts.length===3){ d = new Date(+parts[2],+parts[1]-1,+parts[0]); d.setDate(d.getDate()+7); d.setHours(0,0,0,0); }
    }
    if(!d || isNaN(d)) return;
    events.push({ date: d, type: 'yellow', label: 'Тест: ' + t.title, who: '', itemId: t.id, nav: 'student-tests' });
  });

  return events;
}

function renderStudentCalendar(){
  const grid = document.getElementById('s-cal-grid');
  const label = document.getElementById('s-cal-month-label');
  if(!grid || !label) return;

  label.textContent = RU_MONTHS[_sCalMonth] + ' ' + _sCalYear;
  let html = RU_DAYS_SHORT.map(d=>'<div class="cal-dow">'+d+'</div>').join('');

  const firstDay = new Date(_sCalYear, _sCalMonth, 1);
  const startDow = (firstDay.getDay()+6)%7;
  const daysInMonth = new Date(_sCalYear, _sCalMonth+1, 0).getDate();
  const daysInPrev = new Date(_sCalYear, _sCalMonth, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const events = getCalEventsForStudent();

  const evMap = {};
  events.forEach(ev=>{
    if(isNaN(ev.date)) return;
    const key = ev.date.toISOString().slice(0,10);
    if(!evMap[key]) evMap[key]=[];
    evMap[key].push(ev);
  });

  for(let i=0; i<startDow; i++){
    const d = daysInPrev - startDow + 1 + i;
    html += '<div class="cal-day other-month"><span>'+d+'</span></div>';
  }
  for(let d=1; d<=daysInMonth; d++){
    const date = new Date(_sCalYear, _sCalMonth, d);
    date.setHours(0,0,0,0);
    const isToday = date.getTime()===today.getTime();
    const key = date.toISOString().slice(0,10);
    const dayEvs = evMap[key] || [];
    const typeSet = new Set(dayEvs.map(e=>e.type));
    const dots = [...typeSet].map(t=>'<div class="cal-dot '+t+'"></div>').join('');
    const hasEv = dayEvs.length > 0;
    html += '<div class="cal-day '+(isToday?'today ':'')+( hasEv?'has-events':'')+'"'+(hasEv?' onclick="openSCalDay(\''+key+'\','+d+')"':'')+'>'+
      '<span>'+d+'</span>'+
      (dots ? '<div class="cal-dots">'+dots+'</div>' : '')+
      '</div>';
  }
  const total = startDow + daysInMonth;
  const remainder = total % 7 === 0 ? 0 : 7 - (total % 7);
  for(let i=1; i<=remainder; i++){
    html += '<div class="cal-day other-month"><span>'+i+'</span></div>';
  }
  grid.innerHTML = html;
}

function openSCalDay(key, dayNum){
  const events = getCalEventsForStudent();
  const dayEvs = events.filter(ev=>!isNaN(ev.date) && ev.date.toISOString().slice(0,10)===key);
  if(!dayEvs.length) return;
  const [y,m,d] = key.split('-').map(Number);
  const dateObj = new Date(y,m-1,d);
  const dateStr = dateObj.toLocaleDateString('ru',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('cal-popup-title').textContent = '\uD83D\uDCC5 ' + dateStr.charAt(0).toUpperCase()+dateStr.slice(1);
  const typeLabels = {blue:'📅 Занятие', red:'📝 Сдача ДЗ', yellow:'📋 Тест'};
  const typeArrow  = {yellow:'→ К тесту', red:'→ К ДЗ', blue:''};
  const typePrio = {blue:0,yellow:1,red:2};
  dayEvs.sort((a,b)=>typePrio[a.type]-typePrio[b.type]);
  document.getElementById('cal-popup-body').innerHTML = dayEvs.map(ev=>{
    const clickable = ev.nav && ev.nav !== 'student-schedule';
    return '<div class="cal-popup-item '+ev.type+(clickable?' clickable-todo':'')+'"'
      +(clickable?` onclick="navigateToEvent('${ev.nav}','${ev.itemId||''}')" style="cursor:pointer"`:'')+'>'
      +'<div class="todo-dot '+ev.type+'" style="margin-top:3px;flex-shrink:0"></div>'
      +'<div style="flex:1"><div class="todo-title">'+ev.label+'</div>'
      +'<div class="todo-meta">'+typeLabels[ev.type]+'</div></div>'
      +(clickable?'<span style="font-size:0.78rem;color:var(--green-mid);font-weight:600;white-space:nowrap">'+typeArrow[ev.type]+'</span>':'')
      +'</div>';
  }).join('');
  document.getElementById('cal-popup-bg').classList.add('open');
}

function switchSTodoTab(mode, el){
  _sTodoMode = mode;
  document.querySelectorAll('#page-student-dashboard .todo-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderStudentTodoList(mode);
}

function renderStudentTodoList(mode){
  const el = document.getElementById('s-todo-list');
  if(!el) return;
  const events = getCalEventsForStudent();
  const today = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate()+7);

  let filtered = events.filter(ev=>{
    if(isNaN(ev.date)) return false;
    if(mode==='day')  return ev.date.getTime()===today.getTime();
    if(mode==='week') return ev.date>=today && ev.date<=weekEnd;
    return ev.date>=today;
  });
  const typePrio = {blue:0, yellow:1, red:2};
  filtered.sort((a,b)=> a.date-b.date || typePrio[a.type]-typePrio[b.type]);

  if(!filtered.length){
    const msgs = {day:'Сегодня событий нет \uD83C\uDF89', week:'На этой неделе событий нет', all:'Нет предстоящих событий'};
    el.innerHTML = '<div class="todo-empty">'+msgs[mode]+'</div>';
    return;
  }

  const typeLabels = {blue:'📅 Занятие', red:'📝 Сдача ДЗ', yellow:'📋 Тест'};
  const typeArrow  = {blue:'', red:'→ К ДЗ', yellow:'→ К тесту'};

  if(mode==='day'){
    el.innerHTML = filtered.map(ev=>{
      const clickable = ev.nav && ev.nav !== 'student-schedule';
      return '<div class="todo-item '+ev.type+(clickable?' clickable-todo':'')+'"'
        +(clickable?` onclick="navigateToEvent('${ev.nav}','${ev.itemId||''}')" style="cursor:pointer"`:'')+'>'
        +'<div class="todo-dot '+ev.type+'"></div>'
        +'<div style="flex:1"><div class="todo-title">'+ev.label+'</div>'
        +'<div class="todo-meta">'+typeLabels[ev.type]+'</div></div>'
        +(clickable?'<span style="font-size:0.75rem;color:var(--green-mid);font-weight:600">'+typeArrow[ev.type]+'</span>':'')
        +'</div>';
    }).join('');
  } else {
    const groups = {};
    filtered.forEach(ev=>{
      const key = ev.date.toISOString().slice(0,10);
      if(!groups[key]) groups[key]={date:ev.date, items:[]};
      groups[key].items.push(ev);
    });
    let html = '';
    Object.values(groups).forEach(g=>{
      const isToday = g.date.getTime()===today.getTime();
      const isTomorrow = g.date.getTime()===(today.getTime()+86400000);
      let lbl = g.date.toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'short'});
      if(isToday) lbl = 'Сегодня';
      if(isTomorrow) lbl = 'Завтра';
      html += '<div class="todo-date-group">'+lbl+'</div>';
      html += g.items.map(ev=>{
        const clickable = ev.nav && ev.nav !== 'student-schedule';
        return '<div class="todo-item '+ev.type+(clickable?' clickable-todo':'')+'"'
          +(clickable?` onclick="navigateToEvent('${ev.nav}','${ev.itemId||''}')" style="cursor:pointer"`:'')+'>'
          +'<div class="todo-dot '+ev.type+'"></div>'
          +'<div style="flex:1"><div class="todo-title">'+ev.label+'</div>'
          +'<div class="todo-meta">'+typeLabels[ev.type]+'</div></div>'
          +(clickable?'<span style="font-size:0.75rem;color:var(--green-mid);font-weight:600">'+typeArrow[ev.type]+'</span>':'')
          +'</div>';
      }).join('');
    });
    el.innerHTML = html;
  }
}
function switchTodoTab(mode, el){
  _todoMode = mode;
  document.querySelectorAll('.todo-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderTodoList(mode);
}

function renderTodoList(mode){
  const el = document.getElementById('todo-list');
  if(!el) return;

  const events = getCalEvents();
  const today = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate()+7);

  let filtered = events.filter(ev=>{
    if(isNaN(ev.date)) return false;
    if(mode==='day')  return ev.date.getTime()===today.getTime();
    if(mode==='week') return ev.date>=today && ev.date<=weekEnd;
    return ev.date>=today;
  });

  // Sort by date then type priority (blue < yellow < red)
  const typePrio = {blue:0, yellow:1, red:2};
  filtered.sort((a,b)=> a.date-b.date || typePrio[a.type]-typePrio[b.type]);

  if(!filtered.length){
    const msgs = {day:'Сегодня событий нет 🎉', week:'На этой неделе событий нет', all:'Нет предстоящих событий'};
    el.innerHTML = `<div class="todo-empty">${msgs[mode]}</div>`;
    return;
  }

  const typeLabels = {blue:'📅 Занятие', red:'📝 Сдача ДЗ', yellow:'📋 Тест'};

  if(mode==='day'){
    // No date grouping needed
    el.innerHTML = filtered.map(ev=>`
      <div class="todo-item ${ev.type}">
        <div class="todo-dot ${ev.type}"></div>
        <div>
          <div class="todo-title">${ev.label}</div>
          <div class="todo-meta">${typeLabels[ev.type]}${ev.who?' · '+ev.who:''}</div>
        </div>
      </div>`).join('');
  } else {
    // Group by date
    const groups = {};
    filtered.forEach(ev=>{
      const key = ev.date.toISOString().slice(0,10);
      if(!groups[key]) groups[key]={date:ev.date, items:[]};
      groups[key].items.push(ev);
    });
    let html = '';
    Object.values(groups).forEach(g=>{
      const isToday = g.date.getTime()===today.getTime();
      const isTomorrow = g.date.getTime()===(today.getTime()+86400000);
      let label = g.date.toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'short'});
      if(isToday) label = 'Сегодня';
      if(isTomorrow) label = 'Завтра';
      html += `<div class="todo-date-group">${label}</div>`;
      html += g.items.map(ev=>`
        <div class="todo-item ${ev.type}">
          <div class="todo-dot ${ev.type}"></div>
          <div>
            <div class="todo-title">${ev.label}</div>
            <div class="todo-meta">${typeLabels[ev.type]}${ev.who?' · '+ev.who:''}</div>
          </div>
        </div>`).join('');
    });
    el.innerHTML = html;
  }
}
// ══════════════════════════════════════════
// ADMIN NOTIFS (Firebase — ранее localStorage)
// ══════════════════════════════════════════
let _adminNotifsCache = [];

function _adminNotifsRef(){ return _fbInit().ref('admin_notifs'); }

function loadAdminNotifs(){ return _adminNotifsCache; }

function _addAdminNotif(notif){
  _adminNotifsCache = [..._adminNotifsCache, notif];
  _adminNotifsRef().set(_adminNotifsCache).catch(e => console.error('[Firebase] admin_notifs error', e));
}

function _markAdminNotifsRead(){
  let changed = false;
  _adminNotifsCache = _adminNotifsCache.map(n => { if(!n.read){ changed=true; return {...n, read:true}; } return n; });
  if(changed) _adminNotifsRef().set(_adminNotifsCache).catch(e => console.error('[Firebase] admin_notifs error', e));
}

// ══════════════════════════════════════════
// CHAT
// ══════════════════════════════════════════
// ══ CHAT — Firebase Realtime DB ══
// Путь: chats/<sid>/messages  (массив сообщений)
// Путь: chats/<sid>/unread_<role>  (счётчик непрочитанных)

function _chatRef(sid){ return _fbInit().ref('chats/' + sid); }
function _chatMsgsRef(sid){ return _chatRef(sid).child('messages'); }

// Синхронный кэш чата: { [sid]: msg[] }
const _chatCache = {};
// Активные подписки: { [sid]: unsubscribe fn }
const _chatSubs = {};

/** Подписаться на обновления чата по sid (вызывается при открытии чата) */
function subscribeChatSid(sid, onUpdate){
  if(_chatSubs[sid]) return; // уже подписаны
  const ref = _chatMsgsRef(sid);
  const handler = ref.on('value', snap => {
    _chatCache[sid] = _fbMsgsToArray(snap.val());
    if(typeof onUpdate === 'function') onUpdate(sid);
    updateChatBadge();
  });
  _chatSubs[sid] = () => ref.off('value', handler);
}
function unsubscribeChatSid(sid){
  if(_chatSubs[sid]){ _chatSubs[sid](); delete _chatSubs[sid]; }
}

function _fbMsgsToArray(val){
  if(!val) return [];
  if(Array.isArray(val)) return val;
  // Firebase может вернуть объект {0:{...},1:{...}} если push не использовался
  return Object.values(val);
}

function loadChat(sid){
  return _chatCache[sid] || [];
}

function saveChat(sid, msgs){
  _chatCache[sid] = msgs;
  _chatMsgsRef(sid).set(msgs).catch(e => console.error('[Firebase] chat save error', sid, e));
}

function chatUnread(sid){
  const msgs = loadChat(sid);
  const role = currentUser ? currentUser.role : 'admin';
  return msgs.filter(m=> m.from !== role && !m.read).length;
}
function markChatRead(sid){
  const role = currentUser ? currentUser.role : 'admin';
  const msgs = loadChat(sid);
  let changed = false;
  msgs.forEach(m=>{ if(m.from!==role && !m.read){ m.read=true; changed=true; } });
  if(changed) saveChat(sid, msgs);
}

let _chatActiveSid = null;

// ─ ADMIN ─
function renderChatAdmin(){
  const students = getStudents();
  const el = document.getElementById('chat-admin-contacts');
  if(!el) return;
  el.innerHTML = students.map(s=>{
    const msgs = loadChat(s.id);
    const last = msgs[msgs.length-1];
    const unread = chatUnread(s.id);
    const initials = s.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    return `<div class="chat-contact ${_chatActiveSid===s.id?'active':''}" onclick="openAdminChat('${s.id}')">
      <div class="chat-avatar">${initials}</div>
      <div style="flex:1;min-width:0">
        <div class="chat-contact-name">${esc(s.name)}</div>
        <div class="chat-contact-last">${last?(last.from==='admin'?'Вы: ':'')+esc(last.text):'Нет сообщений'}</div>
      </div>
      ${unread?`<div class="chat-unread">${unread}</div>`:''}
    </div>`;
  }).join('') || '<div style="padding:16px;font-size:0.85rem;color:var(--text3)">Нет учеников</div>';
}

function openAdminChat(sid){
  _chatActiveSid = sid;
  markChatRead(sid);
  renderChatAdmin();
  const student = getStudents().find(s=>s.id===sid);
  const initials = student ? student.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase() : '?';
  const main = document.getElementById('chat-admin-main');
  main.innerHTML = `
    <div class="chat-header">
      <div class="chat-avatar">${initials}</div>
      <div><div class="chat-header-name">${student?student.name:'Ученик'}</div><div class="chat-header-sub">${student?student.subject||'':''}</div></div>
    </div>
    <div class="chat-messages" id="chat-admin-messages"></div>
    <div class="chat-input-bar">
      <textarea id="chat-admin-input" placeholder="Написать сообщение..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendAdminMsg()}"></textarea>
      <button class="chat-send-btn" onclick="sendAdminMsg()">➤</button>
    </div>`;
  // Подписываемся на реалтайм — новые сообщения появятся без F5
  subscribeChatSid(sid, (updSid) => {
    if(updSid === _chatActiveSid) renderChatMessages('chat-admin-messages', updSid, 'admin');
    renderChatAdmin();
  });
  renderChatMessages('chat-admin-messages', sid, 'admin');
}

function sendAdminMsg(){
  if(!_chatActiveSid) return;
  const inp = document.getElementById('chat-admin-input');
  const text = inp.value.trim();
  if(!text) return;
  const msgs = loadChat(_chatActiveSid);
  msgs.push({id:'m'+Date.now(), from:'admin', text, time: new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}), date: new Date().toLocaleDateString('ru'), read: false});
  saveChat(_chatActiveSid, msgs);
  inp.value = '';
  renderChatMessages('chat-admin-messages', _chatActiveSid, 'admin');
  renderChatAdmin();
  // notify student
  addNotif(_chatActiveSid, {type:'chat', text:`💬 Новое сообщение от преподавателя`, nav:'student-chat'});
  updateChatBadge();
}

function renderChatMessages(containerId, sid, myRole){
  const el = document.getElementById(containerId);
  if(!el) return;
  const msgs = loadChat(sid);
  if(!msgs.length){ el.innerHTML='<div class="chat-empty"><div style="font-size:2rem">👋</div><div>Начните диалог!</div></div>'; return; }
  let lastDate = '';
  el.innerHTML = msgs.map(m=>{
    const mine = m.from === myRole;
    let html = '';
    if(m.date !== lastDate){
      html += `<div class="chat-date-divider">${escHtml(m.date)}</div>`;
      lastDate = m.date;
    }
    const refBlock = m.ref ? `<div class="chat-bubble-ref">📎 ${escHtml(m.ref)}</div>` : '';
    const senderLabel = m.from==='parent' && myRole==='admin'
      ? `<div style="font-size:0.68rem;color:var(--text3);margin-bottom:2px">👨‍👩‍👧 Родитель</div>` : '';
    html += `<div class="chat-msg ${mine?'mine':'theirs'}">
      ${senderLabel}<div class="chat-bubble">${refBlock}${escHtml(m.text)}</div>
      <div class="chat-time">${escHtml(m.time||"")}</div>
    </div>`;
    return html;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ─ STUDENT ─
function renderStudentChat(){
  const sid = currentUser.id;
  markChatRead(sid);
  updateChatBadge();
  // Подписываемся на реалтайм — ученик видит ответы без F5
  subscribeChatSid(sid, (updSid) => {
    renderChatMessages('chat-student-messages', updSid, 'student');
    markChatRead(updSid);
    updateChatBadge();
  });
  renderChatMessages('chat-student-messages', sid, 'student');
  const inp = document.getElementById('chat-student-input');
  if(inp) inp.value = '';
}

function sendStudentMsg(){
  const inp = document.getElementById('chat-student-input');
  const text = inp ? inp.value.trim() : '';
  if(!text) return;
  const sid = currentUser.id;
  const msgs = loadChat(sid);
  msgs.push({id:'m'+Date.now(), from:'student', text, time: new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}), date: new Date().toLocaleDateString('ru'), read: false});
  saveChat(sid, msgs);
  if(inp) inp.value = '';
  // Firebase-подписка обновит UI сама; рендерим сразу для отзывчивости
  renderChatMessages('chat-student-messages', sid, 'student');
  // Уведомить администратора через Firebase admin_notifs
  _addAdminNotif({id:'an'+Date.now(), studentId:sid, studentName: currentUser.name, type:'chat', text:`💬 ${currentUser.name}: ${text.substring(0,60)}`, time: new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}), date: new Date().toLocaleDateString('ru'), read:false});
  updateChatBadge();
}

function updateChatBadge(){
  if(currentUser && currentUser.role==='parent'){
    const sid = currentUser.linkedStudentId;
    if(sid) _updateParentChatBadge(sid);
  }
  if(currentUser && currentUser.role==='student'){
    const count = chatUnread(currentUser.id);
    document.querySelectorAll('#nav-student-chat').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(count>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${count}</span>`);
    });
  }
  if(currentUser && currentUser.role==='admin'){
    const total = getStudents().reduce((s,st)=>s+chatUnread(st.id),0);
    const adminNotifCount = (_adminNotifsCache||[]).filter(n=>!n.read).length;
    const adminTotal = total + adminNotifCount;
    document.querySelectorAll('#nav-chat-admin').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(adminTotal>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${adminTotal}</span>`);
    });
  }
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>'); }

// Helper to send chat message from a work item context (with ref)
function sendChatWithRef(sid, refText){
  if(currentUser.role==='admin'){
    _chatActiveSid = sid;
    const msgs = loadChat(sid);
    msgs.push({id:'m'+Date.now(), from:'admin', text:'', ref: refText, time:'', date: new Date().toLocaleDateString('ru'), read:false, _draft:true});
    // Just open chat and prefill
    navigateTo('chat-admin');
    setTimeout(()=>{
      openAdminChat(sid);
      const inp = document.getElementById('chat-admin-input');
      if(inp){ inp.value = ''; inp.focus(); inp.setAttribute('data-ref', refText); }
      // patch send to include ref
    },100);
  }
}

// ══════════════════════════════════════════
// COMMENTS (on test/hw/trial items)
// ══════════════════════════════════════════
function commentsKey(type, itemId){ return `comments_${type}_${itemId}`; }

function loadComments(type, itemId){
  // First try: embedded in the item itself (syncs across devices)
  const items = load(type==='test'?'tests':type==='hw'?'hw':'trials') || [];
  const item = items.find(x=>x.id===itemId);
  if(item && item.comments) return item.comments;
  // Fallback: old separate key
  return load(commentsKey(type, itemId)) || [];
}

function saveComments(type, itemId, arr){
  // Save embedded in the item so it syncs with tests/hw/trials via save()
  const key = type==='test'?'tests':type==='hw'?'hw':'trials';
  const items = load(key) || [];
  const item = items.find(x=>x.id===itemId);
  if(item){
    item.comments = arr;
    save(key, items);
  } else {
    // Fallback: separate key
    save(commentsKey(type, itemId), arr);
  }
}

function renderCommentThread(type, itemId, containerEl){
  // Students cannot comment on trials
  if(currentUser.role === 'student' && type === 'trial') return;
  // Prevent duplicate threads
  if(containerEl.querySelector('.comment-thread')) return;

  const comments = loadComments(type, itemId);

  const commentsHTML = comments.length ? comments.map(c=>{
    const initials = c.author.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    return `<div class="comment-item">
      <div class="comment-avatar" style="${c.role==='admin'?'':'background:linear-gradient(135deg,#1565c0,#42a5f5)'}">${initials}</div>
      <div class="comment-body">
        <div class="comment-author">${c.author}${c.role==='admin'?' · Преподаватель':''}</div>
        <div class="comment-text">${escHtml(c.text)}</div>
        <div class="comment-time">${c.date} ${c.time}</div>
      </div>
    </div>`;
  }).join('') : '<div class="no-comments-msg" style="font-size:0.8rem;color:var(--text3);margin-bottom:8px">Комментариев пока нет</div>';

  const div = document.createElement('div');
  div.className = 'comment-thread';
  div.dataset.type = type;
  div.dataset.itemId = itemId;
  div.innerHTML = `
    <div style="font-size:0.78rem;font-weight:700;color:var(--text3);margin-bottom:8px">💬 Комментарии</div>
    <div class="comment-list">${commentsHTML}</div>
    <div class="comment-input-row">
      <input class="comment-input" placeholder="Написать комментарий..." />
      <button class="btn btn-green btn-sm comment-send-btn">Отправить</button>
    </div>`;

  // Bind events directly on DOM elements — no id, no onclick string
  const input = div.querySelector('.comment-input');
  const btn   = div.querySelector('.comment-send-btn');
  const sendFn = () => addComment(type, itemId, div);
  btn.addEventListener('click', sendFn);
  input.addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendFn(); }});

  containerEl.appendChild(div);
}

function addComment(type, itemId, threadEl){
  const input = threadEl.querySelector('.comment-input');
  if(!input) return;
  const text = input.value.trim();
  if(!text) return;

  const comments = loadComments(type, itemId);
  const now = new Date();
  const c = {
    id: 'c'+Date.now(),
    author: currentUser.name,
    role: currentUser.role,
    text,
    date: now.toLocaleDateString('ru'),
    time: now.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})
  };
  comments.push(c);
  saveComments(type, itemId, comments);
  input.value = '';

  // Notifications
  let item = null;
  if(type==='test') item = (load('tests')||[]).find(t=>t.id===itemId);
  else if(type==='hw') item = (load('hw')||[]).find(h=>h.id===itemId);
  else if(type==='trial') item = (load('trials')||[]).find(t=>t.id===itemId);

  const itemTitle = item ? item.title : type;
  const typeLabel = {test:'тест',hw:'ДЗ',trial:'пробник'}[type]||type;

  if(currentUser.role==='admin' && item){
    addNotif(item.studentId, {type:'comment', text:`💬 Преподаватель прокомментировал ${typeLabel} «${itemTitle}»`, nav: type==='hw'?'student-hw':type==='test'?'student-tests':'student-trial'});
  } else if(currentUser.role==='student' && item){
_addAdminNotif({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'comment', text:`💬 ${currentUser.name} прокомментировал(а) ${typeLabel} «${itemTitle}»`, date:now.toLocaleDateString('ru'), read:false});
  }

  // Append new comment into this thread's list
  const listEl = threadEl.querySelector('.comment-list');
  if(listEl){
    const noMsg = listEl.querySelector('.no-comments-msg');
    if(noMsg) noMsg.remove();
    const initials = c.author.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    const item2 = document.createElement('div');
    item2.className = 'comment-item';
    item2.innerHTML = `
      <div class="comment-avatar" style="${c.role==='admin'?'':'background:linear-gradient(135deg,#1565c0,#42a5f5)'}">${initials}</div>
      <div class="comment-body">
        <div class="comment-author">${c.author}${c.role==='admin'?' · Преподаватель':''}</div>
        <div class="comment-text">${escHtml(c.text)}</div>
        <div class="comment-time">${c.date} ${c.time}</div>
      </div>`;
    listEl.appendChild(item2);
  }
}


function updateAdminBadge(){
  if(currentUser && currentUser.role==='admin'){
    const total = getStudents().reduce((s,st)=>s+chatUnread(st.id),0)
      + (loadAdminNotifs().filter(n=>!n.read).length);
    document.querySelectorAll('#nav-chat-admin').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(total>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${total}</span>`);
    });
  }
}

function updateMistakesBadge(){
  if(!currentUser || currentUser.role!=='student') return;
  const count = (load('mistakes')||[]).filter(m=>m.studentId===currentUser.id && !m.resolved).length;
  const navEl = document.getElementById('nav-student-mistakes');
  if(!navEl) return;
  navEl.querySelectorAll('.mistakes-badge').forEach(b=>b.remove());
  if(count>0) navEl.insertAdjacentHTML('beforeend',`<span class="rep-badge mistakes-badge" style="background:var(--red)">${count}</span>`);
}

// ══════════════════════════════════════════
// GROUPS & PAIRS
// ══════════════════════════════════════════

function getGroups(){ return load('groups') || []; }

function renderGroups(){
  const groups = getGroups();
  const students = getStudents();
  const el = document.getElementById('groups-list');
  if(!el) return;
  if(!groups.length){
    el.innerHTML = '<div class="empty-state"><div class="big">👥</div><p>Групп пока нет. Создайте первую!</p></div>';
    return;
  }
  el.innerHTML = groups.map(g => {
    const members = (g.memberIds||[]).map(id => students.find(s=>s.id===id)).filter(Boolean);
    const icon = g.type === 'pair' ? '🤝' : '👥';
    const label = g.type === 'pair' ? 'Пара' : 'Группа';
    return `<div class="content-item" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="content-icon">${icon}</div>
        <div class="content-info" style="flex:1">
          <div class="content-name">${esc(g.name)}</div>
          <div class="content-meta">${label} · ${members.length} уч.: ${members.map(m=>m.name).join(', ')||'нет участников'}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-outline btn-sm" onclick="openSendGroupModal('${g.id}')" title="Отправить материал группе">📤 Отправить</button>
          <button class="btn btn-outline btn-sm" onclick="openEditGroup('${g.id}')">✏️</button>
          <button class="btn btn-red btn-sm" onclick="deleteGroup('${g.id}')">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openModal_createGroup(){
  const students = getStudents();
  const el = document.getElementById('ng-students-list');
  el.innerHTML = students.map(s => `
    <label class="chip-label">
      <input type="checkbox" value="${s.id}" style="accent-color:var(--green-deep);flex-shrink:0;width:14px;height:14px"><span style="overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
    </label>`).join('');
  document.getElementById('ng-name').value = '';
  openModal('modal-create-group');
}

function saveGroup(){
  const name = document.getElementById('ng-name').value.trim();
  const type = document.getElementById('ng-type').value;
  if(!name){ showNotif('Введите название группы'); return; }
  const memberIds = [...document.querySelectorAll('#ng-students-list input:checked')].map(cb=>cb.value);
  if(memberIds.length < 1){ showNotif('Добавьте хотя бы одного участника'); return; }
  const groups = getGroups();
  groups.push({ id: 'g'+Date.now(), name, type, memberIds });
  save('groups', groups);
  closeModal('modal-create-group');
  renderGroups();
  showNotif('✅ Группа создана');
}

let _editGroupId = null;
function openEditGroup(gid){
  _editGroupId = gid;
  const g = getGroups().find(x=>x.id===gid);
  if(!g) return;
  document.getElementById('eg-name').value = g.name;
  document.getElementById('eg-type').value = g.type || 'group';
  const students = getStudents();
  document.getElementById('eg-students-list').innerHTML = students.map(s => `
    <label class="chip-label">
      <input type="checkbox" value="${s.id}" style="accent-color:var(--green-deep);flex-shrink:0;width:14px;height:14px" ${(g.memberIds||[]).includes(s.id)?'checked':''}><span style="overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
    </label>`).join('');
  openModal('modal-edit-group');
}

function saveEditGroup(){
  const name = document.getElementById('eg-name').value.trim();
  const type = document.getElementById('eg-type').value;
  if(!name){ showNotif('Введите название'); return; }
  const memberIds = [...document.querySelectorAll('#eg-students-list input:checked')].map(cb=>cb.value);
  const groups = getGroups().map(g => g.id===_editGroupId ? {...g, name, type, memberIds} : g);
  save('groups', groups);
  closeModal('modal-edit-group');
  renderGroups();
  showNotif('✅ Группа обновлена');
}

function deleteGroup(gid){
  if(!confirm('Удалить группу?')) return;
  save('groups', getGroups().filter(g=>g.id!==gid));
  renderGroups();
  showNotif('🗑 Группа удалена');
}

// ── SEND TO GROUP ──
let _sendGroupId = null;
let _sendGroupType = 'content';

function openSendGroupModal(gid){
  _sendGroupId = gid;
  _sendGroupType = 'content';
  const g = getGroups().find(x=>x.id===gid);
  if(!g) return;
  const students = getStudents();
  const members = (g.memberIds||[]).map(id=>students.find(s=>s.id===id)).filter(Boolean);
  document.getElementById('sg-members-preview').textContent = members.map(m=>m.name).join(', ');
  document.getElementById('send-group-title').textContent = '📤 Отправить группе: ' + g.name;
  // Reset type buttons
  document.querySelectorAll('.sg-type-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.sg-type-btn[data-type="content"]').classList.add('active');
  loadSendGroupItems('content');
  openModal('modal-send-group');
}

function setSendGroupType(btn, type){
  _sendGroupType = type;
  document.querySelectorAll('.sg-type-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  loadSendGroupItems(type);
}

function loadSendGroupItems(type){
  const sel = document.getElementById('sg-item-select');
  let items = [];
  if(type==='content') items = (load('content')||[]).filter(c=>c.type==='theory');
  else if(type==='test') items = load('tests')||[];
  else if(type==='hw') items = load('hw')||[];
  else if(type==='trial'){
    // use first occurrence per title to avoid duplicates
    const seen = new Set();
    items = (load('trials')||[]).filter(t=>{ if(seen.has(t.title)) return false; seen.add(t.title); return true; });
  }
  else if(type==='slot') items = load('slots')||[];

  // De-duplicate by title for content/test/hw
  if(['content','test','hw'].includes(type)){
    const seen = new Set();
    items = items.filter(it=>{ if(seen.has(it.title)) return false; seen.add(it.title); return true; });
  }

  sel.innerHTML = items.length
    ? items.map(it => {
        let label = it.title || (it.day ? it.day+' '+it.time : it.id);
        return `<option value="${it.id}">${label}</option>`;
      }).join('')
    : '<option value="">— Нет доступных элементов —</option>';
}

function confirmSendToGroup(){
  const g = getGroups().find(x=>x.id===_sendGroupId);
  if(!g){ showNotif('Группа не найдена'); return; }
  const itemId = document.getElementById('sg-item-select').value;
  if(!itemId){ showNotif('Выберите элемент'); return; }
  const memberIds = g.memberIds || [];
  if(!memberIds.length){ showNotif('В группе нет участников'); return; }
  const type = _sendGroupType;
  let count = 0;

  if(type === 'content'){
    const content = load('content')||[];
    const original = content.find(c=>c.id===itemId);
    if(!original){ showNotif('Материал не найден'); return; }
    memberIds.forEach(sid=>{
      if(content.some(c=>c.title===original.title && c.studentId===sid)) return;
      content.push({...original, id:'ct_'+Date.now()+'_'+sid, studentId:sid});
      count++;
    });
    save('content', content);
    memberIds.forEach(sid => addNotif(sid,{type:'material',text:`📚 Новый материал: ${original.title}`,nav:'materials'}));
  } else if(type === 'test'){
    const tests = load('tests')||[];
    const original = tests.find(t=>t.id===itemId);
    if(!original){ showNotif('Тест не найден'); return; }
    memberIds.forEach(sid=>{
      if(tests.some(t=>t.title===original.title && t.studentId===sid)) return;
      tests.push({...original, id:'t'+Date.now()+'_'+sid, studentId:sid, submitted:false, answers:{}, autoScore:0});
      count++;
    });
    save('tests', tests);
    memberIds.forEach(sid => addNotif(sid,{type:'test',text:`📝 Новый тест: ${original.title}`,nav:'tests'}));
  } else if(type === 'hw'){
    const hws = load('hw')||[];
    const original = hws.find(h=>h.id===itemId);
    if(!original){ showNotif('ДЗ не найдено'); return; }
    memberIds.forEach(sid=>{
      if(hws.some(h=>h.title===original.title && h.studentId===sid)) return;
      hws.push({...original, id:'hw'+Date.now()+'_'+sid, studentId:sid, submitted:false, answers:{}});
      count++;
    });
    save('hw', hws);
    memberIds.forEach(sid => addNotif(sid,{type:'hw',text:`✏️ Новое ДЗ: ${original.title}`,nav:'hw'}));
  } else if(type === 'trial'){
    const trials = load('trials')||[];
    const original = trials.find(t=>t.id===itemId);
    if(!original){ showNotif('Пробник не найден'); return; }
    memberIds.forEach(sid=>{
      if(trials.some(t=>t.title===original.title && t.studentId===sid)) return;
      trials.push({...original, id:'tr'+Date.now()+'_'+sid, studentId:sid, isLibrary:false, submitted:false, answers:{}});
      count++;
    });
    save('trials', trials);
    memberIds.forEach(sid => addNotif(sid,{type:'trial',text:`🧪 Новый пробник: ${original.title}`,nav:'trials'}));
  } else if(type === 'slot'){
    const slots = load('slots')||[];
    const slot = slots.find(s=>s.id===itemId);
    if(!slot){ showNotif('Слот не найден'); return; }
    // Назначаем группу на слот — все участники увидят его через isSlotForStudent
    slot.groupId = _sendGroupId;
    slot.bookedBy = memberIds[0] || null; // первый участник как основной контакт
    save('slots', slots);
    // Уведомляем КАЖДОГО участника группы
    memberIds.forEach(sid => addNotif(sid,{
      type:'schedule',
      text:`🗓 Вас записали на занятие: ${slot.day} ${slot.time}`,
      nav:'student-schedule'
    }));
    count = memberIds.length;
  }

  closeModal('modal-send-group');
  showNotif(`✅ Отправлено ${count} участникам группы`);
}

// ══════════════════════════════════════════
// SLOT ASSIGN UI
// ══════════════════════════════════════════
function openModal_addSlot(){
  // Populate courses
  const courses = load('courses')||[];
  const cSel = document.getElementById('nsl-course');
  cSel.innerHTML = '<option value="">— Без курса —</option>' +
    courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');
  // Populate students
  const sSel = document.getElementById('nsl-student');
  sSel.innerHTML = '<option value="">— Выберите ученика —</option>' +
    getStudents().map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  // Populate groups
  const gSel = document.getElementById('nsl-group');
  gSel.innerHTML = '<option value="">— Выберите группу —</option>' +
    getGroups().map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  // Reset
  document.getElementById('nsl-assigntype').value = '';
  document.getElementById('nsl-student-wrap').style.display = 'none';
  document.getElementById('nsl-group-wrap').style.display = 'none';
  openModal('modal-add-slot');
}

function updateSlotAssignUI(){
  const v = document.getElementById('nsl-assigntype').value;
  document.getElementById('nsl-student-wrap').style.display = v==='student' ? '' : 'none';
  document.getElementById('nsl-group-wrap').style.display = v==='group' ? '' : 'none';
}

// ══════════════════════════════════════════════
// СИСТЕМА ВНЕШНИХ УВЕДОМЛЕНИЙ
// ══════════════════════════════════════════════

// Ключи хранилища
function notifSettingsKey(sid){ return 'biohim_notif_settings_'+sid; }
function adminTgBotKey(){ return 'biohim_admin_tg_bot'; }
function adminTgTokenKey(){ return 'biohim_admin_tg_token'; }

const _notifSettingsCache = {};
function loadNotifSettings(sid){
  const cached = _notifSettingsCache[sid];
  const def = {
    tgChatId: '',
    types: { lesson:true, hw:true, test:true, payment:true, chat:true, repeat:true }
  };
  if(!cached) return def;
  try{ return Object.assign({}, def, cached); } catch(e){ return def; }
}
function saveNotifSettingsData(sid, s){
  _notifSettingsCache[sid] = s;
  _fbInit().ref('db/notif_settings/'+sid).set(s)
    .catch(e => console.error('[Firebase] notif_settings save', e));
}

const NOTIF_TYPE_MAP = {
  schedule:'lesson', hw:'hw', test:'test', trial:'test',
  wallet:'payment', chat:'chat', repeat:'repeat',
  material:'lesson', comment:'chat', attendance:'lesson'
};

// ── Добавить уведомление + отправить в Telegram (ученику и родителю) ──
function addNotif(studentId, {type, text, nav}){
  const notifs = load('notifs')||[];
  notifs.push({id:'n'+Date.now(), studentId, type, text, nav,
    date:new Date().toLocaleDateString('ru'), read:false});
  save('notifs', notifs);
  sendTelegramNotif(studentId, type, text);
  // Also notify parent if connected
  const users = load('users')||[];
  const parent = users.find(u=>u.role==='parent' && u.linkedStudentId===studentId);
  if(parent) sendParentTelegramNotif(parent.id, type, text);
  // Web Push (встроено сюда чтобы избежать рекурсии через _origAddNotif)
  if (typeof wpIsEnabled === 'function' && wpIsEnabled(studentId)) {
    if (document.visibilityState === 'hidden') {
      wpShowDirect('BioХим', text, nav);
    }
    if (currentUser && currentUser.role === 'admin') {
      wpSendToStudent(studentId, 'BioХим', text, nav);
    }
  }
}

// ── Отправка через Telegram Bot API (через серверный прокси /api/telegram) ──
async function sendTelegramNotif(sid, type, text){
  const settings = loadNotifSettings(sid);
  if(!settings.tgChatId) return;
  const mappedType = NOTIF_TYPE_MAP[type] || type;
  if(settings.types[mappedType] === false) return;

  const student = getStudents().find(s=>s.id===sid);
  const name = student ? student.name : 'Ученик';
  const msg = `📚 *BioХим* — ${name}\n\n${text}`;

  try{
    await tgApiCall('sendMessage', { chat_id: settings.tgChatId, text: msg, parse_mode:'Markdown' });
  } catch(e){
    console.warn('TG send error:', e);
  }
}

// Единая точка вызова Telegram через серверный прокси (токен не покидает сервер)
async function tgApiCall(method, payload){
  const r = await fetch('/api/telegram', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ method, payload })
  });
  return r.json();
}

// ── Страница ученика ──
function renderNotifSettingsStudent(){
  const sid = currentUser.id;
  const settings = loadNotifSettings(sid);

  // Bot link
  const botName = localStorage.getItem(adminTgBotKey()) || '';
  const botLink = document.getElementById('tg-bot-link');
  if(botLink){
    if(botName){
      const clean = botName.replace('@','');
      botLink.href = `https://t.me/${clean}`;
      botLink.textContent = botName;
    } else {
      botLink.textContent = '(бот не настроен — обратитесь к преподавателю)';
    }
  }

  // Show/hide connect vs connected
  const connectBlock  = document.getElementById('tg-connect-block');
  const connectedBlock= document.getElementById('tg-connected-block');
  const statusBadge   = document.getElementById('tg-status-badge');
  const connectedName = document.getElementById('tg-connected-name');
  const chatIdInput   = document.getElementById('student-tg-chatid');

  if(settings.tgChatId){
    if(connectBlock)   connectBlock.style.display   = 'none';
    if(connectedBlock) connectedBlock.style.display  = 'block';
    if(statusBadge)    statusBadge.innerHTML = `<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:10px">✅ Подключён</span>`;
    if(connectedName)  connectedName.textContent = settings.tgChatId;
  } else {
    if(connectBlock)   connectBlock.style.display   = 'block';
    if(connectedBlock) connectedBlock.style.display  = 'none';
    if(statusBadge)    statusBadge.innerHTML = `<span style="background:var(--bg);color:var(--text3);font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:10px">Не подключён</span>`;
    if(chatIdInput)    chatIdInput.value = '';
  }

  // Web Push block
  const wpOn    = document.getElementById('wp-on-block');
  const wpOff   = document.getElementById('wp-off-block');
  const wpBadge = document.getElementById('wp-status-badge');
  if (wpOn && wpOff) {
    const enabled = wpIsEnabled(sid);
    wpOn.style.display  = enabled ? 'block' : 'none';
    wpOff.style.display = enabled ? 'none'  : 'block';
    if (wpBadge) wpBadge.innerHTML = enabled
      ? `<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:10px">✅ Включён</span>`
      : `<span style="background:var(--bg);color:var(--text3);font-size:0.72rem;font-weight:700;padding:3px 10px;border-radius:10px">Выкл.</span>`;
  }

  // Types toggles
  const typesEl = document.getElementById('notif-types-toggles');
  if(typesEl){
    const types = [
      {key:'lesson',  icon:'📅', name:'Занятия',          desc:'Напоминания о занятиях и изменениях в расписании'},
      {key:'hw',      icon:'✏️', name:'Домашние задания',  desc:'Новые ДЗ и приближение дедлайна'},
      {key:'test',    icon:'📋', name:'Тесты и пробники',  desc:'Новые тесты и результаты проверки'},
      {key:'payment', icon:'💰', name:'Оплата',            desc:'Пополнение кошелька, списания и задолженности'},
      {key:'chat',    icon:'💬', name:'Чат',               desc:'Новые сообщения от преподавателя'},
      {key:'repeat',  icon:'🧠', name:'Умное повторение',  desc:'Напоминания о запланированных повторениях'},
    ];
    typesEl.innerHTML = types.map(t=>`
      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-name">${t.icon} ${t.name}</div>
          <div class="toggle-desc">${esc(t.desc)}</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="notif-type-${t.key}" ${settings.types[t.key]!==false?'checked':''}>
          <span class="toggle-slider"></span>
        </label>
      </div>`).join('');
  }
}

function saveTgConnect(){
  const sid = currentUser.id;
  const chatId = (document.getElementById('student-tg-chatid')||{}).value?.trim();
  if(!chatId){ showNotif('Введите Chat ID из Telegram бота'); return; }
  if(!/^\d+$/.test(chatId)){ showNotif('Chat ID — только цифры, например: 123456789'); return; }
  const settings = loadNotifSettings(sid);
  settings.tgChatId = chatId;
  saveNotifSettingsData(sid, settings);
  renderNotifSettingsStudent();
  showNotif('✅ Telegram подключён!');
  // Send welcome message
  sendTelegramNotif(sid, 'chat', '🎉 Telegram успешно подключён! Теперь вы будете получать уведомления от преподавателя здесь.');
}

function disconnectTelegram(){
  const sid = currentUser.id;
  const settings = loadNotifSettings(sid);
  settings.tgChatId = '';
  saveNotifSettingsData(sid, settings);
  renderNotifSettingsStudent();
  showNotif('Telegram отключён');
}

function saveNotifTypes(){
  const sid = currentUser.id;
  const settings = loadNotifSettings(sid);
  ['lesson','hw','test','payment','chat','repeat'].forEach(k=>{
    const el = document.getElementById('notif-type-'+k);
    if(el) settings.types[k] = el.checked;
  });
  saveNotifSettingsData(sid, settings);
  showNotif('✅ Настройки сохранены');
}

async function testNotifChannel(){
  const sid = currentUser.id;
  const settings = loadNotifSettings(sid);
  if(!settings.tgChatId){ showNotif('Telegram не подключён'); return; }
  try{
    const d = await tgApiCall('sendMessage', { chat_id: settings.tgChatId,
      text:'🔔 *Тест уведомлений*\n\nЕсли вы получили это сообщение — Telegram подключён успешно! ✅', parse_mode:'Markdown' });
    showNotif(d.ok ? '✅ Тест отправлен — проверьте Telegram!' : '❌ Ошибка: ' + (d.description||''));
  } catch(e){ showNotif('❌ Ошибка соединения: ' + e.message); }
}

// ── Страница администратора ──
function renderNotifSettingsAdmin(){
  // Токен хранится на сервере, не читаем из localStorage
  const botName  = localStorage.getItem(adminTgBotKey())  || '';
  const elBot    = document.getElementById('admin-tg-botname');
  if(elBot)   elBot.value   = botName;

  const statusEl = document.getElementById('admin-notif-student-status');
  if(!statusEl) return;
  const students = getStudents();
  if(!students.length){ statusEl.innerHTML = emptyHTML(); return; }
  statusEl.innerHTML = students.map(s=>{
    const cfg = loadNotifSettings(s.id);
    const connected = !!cfg.tgChatId;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--green-xpale);flex-wrap:wrap">
      <div style="font-weight:600;font-size:0.88rem;min-width:120px">${esc(s.name)}</div>
      ${connected
        ? `<span style="background:#e8f8f0;color:#27ae60;font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:10px">✅ TG подключён · ID: ${cfg.tgChatId}</span>
           <button class="btn btn-green btn-sm" onclick="adminSendTestToStudent('${s.id}')">🔔 Тест</button>`
        : `<span style="background:var(--bg);color:var(--text3);font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:10px">❌ Не подключён</span>`}
    </div>`;
  }).join('');

  if(typeof renderWeeklyReportSettings === 'function'){
    renderWeeklyReportSettings(document.getElementById('weekly-report-container'));
  }
}

function saveAdminTgBot(){
  // Токен НЕ сохраняется в localStorage — он хранится только в переменной окружения Vercel (TELEGRAM_BOT_TOKEN).
  // Здесь сохраняем только публичное имя бота для ссылки на него.
  const botName = (document.getElementById('admin-tg-botname')||{}).value?.trim();
  if(botName) localStorage.setItem(adminTgBotKey(), botName.startsWith('@')?botName:'@'+botName);
  testBotToken();
}

async function testBotToken(){
  const statusEl = document.getElementById('bot-connection-status');
  if(statusEl){ statusEl.textContent='⏳ Проверяем...'; statusEl.style.color='var(--text3)'; }
  try{
    const d = await tgApiCall('getMe', {});
    if(d.ok){
      const name = d.result.first_name + ' (@' + d.result.username + ')';
      if(statusEl){ statusEl.innerHTML=`✅ Бот найден: <b>${name}</b>`; statusEl.style.color='var(--green-deep)'; }
      localStorage.setItem(adminTgBotKey(), '@'+d.result.username);
      const el = document.getElementById('admin-tg-botname');
      if(el) el.value = '@'+d.result.username;
      showNotif('✅ Бот подключён: ' + name);
      renderNotifSettingsAdmin();
    } else {
      if(statusEl){ statusEl.textContent='❌ Неверный токен: '+d.description; statusEl.style.color='#c0392b'; }
    }
  } catch(e){
    if(statusEl){ statusEl.textContent='❌ Ошибка: '+e.message; statusEl.style.color='#c0392b'; }
  }
}

async function adminSendTestToStudent(sid){
  const settings = loadNotifSettings(sid);
  if(!settings.tgChatId){ showNotif('Ученик не подключил Telegram'); return; }
  const s = getStudents().find(s=>s.id===sid);
  await sendTelegramNotif(sid,'chat',`👋 Привет, ${s?s.name:''}! Это тестовое уведомление от преподавателя.`);
  showNotif('✅ Тест отправлен');
}

// WALLET (кошелёк)
// ══════════════════════════════════════════
const _walletCache = {};
function walletKey(sid){ return 'biohim_wallet_' + sid; }
function loadWallet(sid){
  return _walletCache[sid] !== undefined ? _walletCache[sid] : { balance: 0, txns: [] };
}
function saveWallet(sid, w){
  _walletCache[sid] = w;
  _fbInit().ref('db/wallet/'+sid).set(w)
    .catch(e => console.error('[Firebase] wallet save', e));
}

function walletTopUp(sid, amount, note, _skipPaymentRecord){
  const w = loadWallet(sid);
  w.balance += amount;
  const dateStr = new Date().toLocaleDateString('ru');
  w.txns.push({ id:'tx'+Date.now(), type:'topup', amount, note: note||'Пополнение',
    date: dateStr, ts: Date.now() });
  saveWallet(sid, w);
  // Записываем в payments как доход (статус paid), если это реальное пополнение от ученика
  // _skipPaymentRecord=true используется для возвратов (отмена списания), чтобы не задваивать
  if (!_skipPaymentRecord) {
    const payments = load('payments') || [];
    payments.push({
      id: 'p_topup_' + Date.now(),
      studentId: sid,
      period: dateStr,
      amount,
      status: 'paid',
      note: note || 'Пополнение кошелька',
      date: dateStr,
      _fromWallet: true
    });
    save('payments', payments);
  }
  addNotif(sid, {type:'wallet', text:`💰 Кошелёк пополнен на ${amount}₽${note?' · '+note:''}`, nav:'student-payment'});
}

function walletDebit(sid, amount, note){
  const w = loadWallet(sid);
  w.balance -= amount;
  w.txns.push({ id:'tx'+Date.now(), type:'debit', amount, note: note||'Списание',
    date: new Date().toLocaleDateString('ru'), ts: Date.now() });
  saveWallet(sid, w);
  addNotif(sid, {type:'wallet', text:`💳 Списано ${amount}₽ с кошелька${note?' · '+note:''}`, nav:'student-payment'});
}

// ── ATP PAGE (unified attend+pay admin) ──
let _atpTab = 'attendance';
let _walletRealtimeSid = null; // sid текущей подписки на кошелёк
function switchAtpTab(tab, el){
  _atpTab = tab;
  document.querySelectorAll('#page-attend-pay-admin .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['attendance','wallet','payments'].forEach(t=>{
    const el2 = document.getElementById('atp-tab-'+t);
    if(el2) el2.style.display = t===tab ? '' : 'none';
  });
  // Подписываемся на realtime обновления кошелька выбранного ученика
  if(tab === 'wallet'){
    const sid = getSelectedStudent();
    if(sid && sid !== _walletRealtimeSid){
      if(_walletRealtimeSid) _fbInit().ref('db/wallet/'+_walletRealtimeSid).off('value');
      _walletRealtimeSid = sid;
      _fbInit().ref('db/wallet/'+sid).on('value', snap=>{
        _walletCache[sid] = snap.val() || {balance:0, txns:[]};
        if(_atpTab === 'wallet' && getSelectedStudent() === sid) renderAtpWallet();
      });
    }
  }
  renderAtpTab();
}

function renderAtpPage(){
  renderAtpTab();
}

function renderAtpTab(){
  if(_atpTab==='attendance') renderAtpAttendance();
  else if(_atpTab==='wallet') renderAtpWallet();
  else if(_atpTab==='payments') renderPaymentAdmin();
}

// ── Attendance sub-tab ──
function renderAtpAttendance(){
  const sid = getSelectedStudent();
  const students = getStudents();
  const rawAtt = load('attendance')||[];
  const allAtt = (Array.isArray(rawAtt) ? rawAtt : Object.values(rawAtt)).slice().reverse();
  const el = document.getElementById('atp-attendance-list');
  if(!el) return;

  const sids = sid ? [sid] : students.map(s=>s.id);
  const lessons = allAtt.filter(a=>sids.includes(a.studentId));
  if(!lessons.length){ el.innerHTML=`<div class="card">${emptyHTML()}</div>`; return; }

  const byLesson = {};
  lessons.forEach(a=>{
    if(!byLesson[a.lessonId]) byLesson[a.lessonId]={
      lessonId:a.lessonId, date:a.date, time:a.time, topic:a.topic,
      group:a.group, costPerStudent:a.costPerStudent, slotId:a.slotId, entries:[]
    };
    byLesson[a.lessonId].entries.push(a);
  });

  el.innerHTML = Object.values(byLesson).sort((a,b)=>b.date.localeCompare(a.date)).map(lg=>{
    const dateLabel = lg.date ? new Date(lg.date+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'}) : '—';
    let slotLabel = '', courseLabel = '', slotBadge = '';
    if(lg.slotId){
      const slot   = (load('slots')||[]).find(s=>s.id===lg.slotId);
      const course = slot?.courseId ? (load('courses')||[]).find(c=>c.id===slot.courseId) : null;
      if(slot){ slotLabel = `${slot.day} ${slot.time}`; }
      if(course){ courseLabel = course.title; }
      if(slot){
        slotBadge = `<span style="background:#e8f4fd;color:#1565c0;font-size:0.72rem;font-weight:700;padding:3px 9px;border-radius:10px;margin-left:4px">🗓 ${slotLabel}${courseLabel?' · '+courseLabel:''}</span>`;
      }
    }
    // Check if payment record exists for this lesson
    const allPayments = load('payments')||[];
    const lessonPayment = allPayments.find(p=>p.lessonId===lg.lessonId);
    const payBadge = lessonPayment
      ? `<span style="background:${lessonPayment.status==='paid'?'#e8f8f0':lessonPayment.status==='partial'?'#fff3cd':'#fdecea'};color:${lessonPayment.status==='paid'?'#27ae60':lessonPayment.status==='partial'?'#856404':'#c0392b'};font-size:0.72rem;font-weight:700;padding:3px 9px;border-radius:10px;cursor:pointer" onclick="switchAtpTab('payments',document.querySelector('#page-attend-pay-admin .tab:nth-child(3)'))">💳 ${lessonPayment.status==='paid'?'Оплачено':lessonPayment.status==='partial'?'Частично':lg.costPerStudent+'₽ не оплачено'}</span>`
      : (lg.costPerStudent>0 ? `<span style="background:#fdecea;color:#c0392b;font-size:0.72rem;font-weight:700;padding:3px 9px;border-radius:10px">💳 ${lg.costPerStudent}₽ без записи</span>` : '');

    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.97rem;color:var(--accent);display:flex;align-items:center;flex-wrap:wrap;gap:6px">
            📅 ${dateLabel}${lg.time?' · '+lg.time:''}
            ${slotBadge}
            ${payBadge}
          </div>
          <div style="font-size:0.8rem;color:var(--text3);margin-top:4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            ${lg.topic?`<span>📖 ${escHtml(lg.topic)}</span>`:''}
            ${lg.group?`<span>👥 ${escHtml(lg.group)}</span>`:''}
            ${lg.duration?`<span>⏱ ${lg.duration} мин</span>`:''}
            ${lg.costPerStudent?`<span style="color:var(--green-deep);font-weight:700">💰 ${lg.costPerStudent}₽/чел.</span>`:''}
          </div>
        </div>
        <button class="btn btn-red btn-sm" onclick="deleteLesson('${lg.lessonId}')">🗑 Занятие</button>
      </div>
      ${lg.entries.map(a=>{
        const s = students.find(s=>s.id===a.studentId);
        const w = loadWallet(a.studentId);
        const balColor = w.balance < 0 ? 'color:#c0392b' : 'color:var(--green-deep)';
        // Статус: present=был, paid=деньги списаны, absentPaid=не был но деньги списаны
        const statusClass = a.present ? 'present' : (a.absentPaid ? 'absent' : 'absent');
        return `<div class="att-row att-${statusClass}">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.88rem">${s?s.name:'—'}</div>
            <div style="font-size:0.75rem;${balColor};font-weight:700">Баланс: ${w.balance}₽</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${a.paid ? `
              <span class="att-badge-${a.present?'present':'absent'}" style="cursor:pointer" onclick="undoAttPaid('${escAttr(a.id)}')" title="Отменить списание">
                ${a.present ? '✅ Был · списано' : '❌ Не был · списано'}
              </span>
              <span class="att-cost-badge">−${a.costPerStudent}₽ ✓</span>
            ` : `
              <button class="btn btn-outline btn-sm" onclick="markAttPresent('${escAttr(a.id)}')" style="border-color:#27ae60;color:#27ae60;min-width:90px">
                ✅ Был
              </button>
              <button class="btn btn-outline btn-sm" onclick="markAttAbsentPaid('${escAttr(a.id)}')" style="border-color:#856404;color:#856404;font-size:0.78rem" title="Не был, но списать деньги">
                ❌ Списать
              </button>
              ${a.costPerStudent>0?`<span class="att-unpaid-badge">💳 ${a.costPerStudent}₽ не списано</span>`:''}
            `}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

// ── Wallet sub-tab ──
function renderAtpWallet(){
  const sid = getSelectedStudent();
  if(!sid) return;
  // Если кошелёк ученика не в кэше (admin смотрит чужой кошелёк) — грузим из Firebase
  if(_walletCache[sid] === undefined){
    // Показываем загрузку
    const balEl0 = document.getElementById('atp-wallet-balance');
    if(balEl0) balEl0.textContent = '…';
    const histEl0 = document.getElementById('atp-wallet-history');
    if(histEl0) histEl0.innerHTML = '<div style="color:var(--text3);font-size:0.85rem;padding:12px 0">Загрузка…</div>';
    _fbInit().ref('db/wallet/'+sid).get().then(snap=>{
      _walletCache[sid] = snap.val() || {balance:0, txns:[]};
      renderAtpWallet(); // перерисовываем после загрузки
    }).catch(()=>{ _walletCache[sid] = {balance:0, txns:[]}; renderAtpWallet(); });
    return; // ждём загрузки
  }
  const w = loadWallet(sid);
  const balEl = document.getElementById('atp-wallet-balance');
  if(balEl){
    balEl.style.color = w.balance < 0 ? '#c0392b' : 'var(--green-deep)';
    balEl.textContent = w.balance.toLocaleString('ru') + ' ₽';
  }
  const histEl = document.getElementById('atp-wallet-history');
  if(!histEl) return;
  const txns = [...(w.txns||[])].reverse();
  if(!txns.length){ histEl.innerHTML='<div style="color:var(--text3);font-size:0.85rem;padding:12px 0">Транзакций пока нет</div>'; return; }
  histEl.innerHTML = txns.map(tx=>{
    const isTopup = tx.type==='topup';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--green-xpale)">
      <div style="width:32px;height:32px;border-radius:50%;background:${isTopup?'#e8f8f0':'#fdecea'};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">
        ${isTopup?'↑':'↓'}
      </div>
      <div style="flex:1">
        <div style="font-size:0.88rem;font-weight:600;color:var(--text)">${tx.note||''}</div>
        <div style="font-size:0.75rem;color:var(--text3)">${tx.date}</div>
      </div>
      <div style="font-weight:800;font-size:0.97rem;color:${isTopup?'var(--green-deep)':'#c0392b'}">
        ${isTopup?'+':'−'}${tx.amount}₽
      </div>
    </div>`;
  }).join('');
}

function openTopUp(){
  document.getElementById('atp-wallet-debit-form').style.display='none';
  const f=document.getElementById('atp-wallet-topup-form');
  f.style.display = f.style.display==='none' ? '' : 'none';
}
function openDebit(){
  document.getElementById('atp-wallet-topup-form').style.display='none';
  const f=document.getElementById('atp-wallet-debit-form');
  f.style.display = f.style.display==='none' ? '' : 'none';
}
function doTopUp(){
  const sid    = getSelectedStudent();
  const amount = +(document.getElementById('atp-topup-amount').value)||0;
  const note   = document.getElementById('atp-topup-note').value;
  if(!amount){ showNotif('Укажите сумму'); return; }
  walletTopUp(sid, amount, note);
  document.getElementById('atp-wallet-topup-form').style.display='none';
  document.getElementById('atp-topup-amount').value='';
  document.getElementById('atp-topup-note').value='';
  renderAtpWallet();
  renderAtpAttendance();
  showNotif(`✅ Пополнено на ${amount}₽`);
}
function doDebit(){
  const sid    = getSelectedStudent();
  const amount = +(document.getElementById('atp-debit-amount').value)||0;
  const note   = document.getElementById('atp-debit-note').value;
  if(!amount){ showNotif('Укажите сумму'); return; }
  walletDebit(sid, amount, note);
  document.getElementById('atp-wallet-debit-form').style.display='none';
  document.getElementById('atp-debit-amount').value='';
  document.getElementById('atp-debit-note').value='';
  renderAtpWallet();
  renderAtpAttendance();
  showNotif(`✅ Списано ${amount}₽`);
}

// ── Был — отметить присутствие и списать деньги ──
function markAttPresent(id){
  const raw = load('attendance')||[];
  const att = Array.isArray(raw) ? raw : Object.values(raw);
  // eslint-disable-next-line eqeqeq
  const a   = att.find(a=>a.id==id); if(!a){ console.warn('[markAttPresent] запись не найдена, id=',id,'тип=',typeof id,'все id=',att.map(x=>x.id)); return; }
  const dateLabel = a.date ? new Date(a.date+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long'}) : '';
  a.present = true;
  a.absentPaid = false;
  if(!a.paid && a.costPerStudent>0){
    walletDebit(a.studentId, +a.costPerStudent||0,
      `Занятие ${dateLabel}${a.topic?' · '+a.topic:''}${a.group?' · '+a.group:''}`);
    a.paid = true;
  }
  save('attendance', att);
  renderAtpAttendance();
  renderAtpWallet();
  showNotif('✅ Отмечен как присутствующий, деньги списаны');
}

// ── Не был, но списать деньги ──
function markAttAbsentPaid(id){
  const raw = load('attendance')||[];
  const att = Array.isArray(raw) ? raw : Object.values(raw);
  // eslint-disable-next-line eqeqeq
  const a   = att.find(a=>a.id==id); if(!a){ console.warn('[markAttAbsentPaid] запись не найдена, id=',id,'тип=',typeof id,'все id=',att.map(x=>x.id)); return; }
  const dateLabel = a.date ? new Date(a.date+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long'}) : '';
  a.present = false;
  a.absentPaid = true;
  if(!a.paid && a.costPerStudent>0){
    walletDebit(a.studentId, +a.costPerStudent||0,
      `Занятие ${dateLabel} (не был)${a.topic?' · '+a.topic:''}${a.group?' · '+a.group:''}`);
    a.paid = true;
  }
  save('attendance', att);
  renderAtpAttendance();
  renderAtpWallet();
  showNotif('❌ Отмечен как отсутствующий, деньги списаны');
}

// ── Отменить списание (возврат) ──
function undoAttPaid(id){
  const raw = load('attendance')||[];
  const att = Array.isArray(raw) ? raw : Object.values(raw);
  // eslint-disable-next-line eqeqeq
  const a   = att.find(a=>a.id==id); if(!a){ console.warn('[undoAttPaid] запись не найдена, id=',id); return; }
  if(!confirm('Отменить списание и вернуть деньги на кошелёк?')) return;
  const dateLabel = a.date ? new Date(a.date+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long'}) : '';
  walletTopUp(a.studentId, +a.costPerStudent||0, `Возврат: занятие ${dateLabel}`, true/*skipPaymentRecord*/);
  a.paid = false;
  a.present = false;
  a.absentPaid = false;
  save('attendance', att);
  renderAtpAttendance();
  renderAtpWallet();
  showNotif('↩️ Списание отменено, деньги возвращены');
}

// legacy stub
function toggleAttPaid(id){ markAttPresent(id); }

// ── Override saveAttendance: prefill from slot ──
function saveAttendance(){
  const date  = document.getElementById('att-date').value;
  const time  = document.getElementById('att-time').value;
  const topic = document.getElementById('att-topic').value.trim();
  const group = document.getElementById('att-group').value.trim();
  const cost  = +(document.getElementById('att-cost').value)||0;
  const slotId = document.getElementById('att-slot-id')?.value || null;
  if(!date){ showNotif('Укажите дату'); return; }
  const checks = document.querySelectorAll('#att-student-checks input[type=checkbox]:checked');
  if(!checks.length){ showNotif('Выберите хотя бы одного ученика'); return; }
  const lessonId = 'les_'+Date.now();
  const att = load('attendance')||[];
  let _attIdCounter = 0;
  checks.forEach(cb=>{
    att.push({
      id:'att_'+Date.now()+'_'+(++_attIdCounter)+'_'+cb.value,
      lessonId, studentId:cb.value,
      date, time, topic, group,
      costPerStudent: cost,
      slotId: slotId || null,
      present:false, paid:false, absentPaid:false,
      createdAt: todayStr()
    });
  });
  save('attendance', att);
  closeModal('modal-add-attendance');
  renderAtpAttendance();
  showNotif(`✅ Занятие добавлено для ${checks.length} учеников`);
}

// ── Student wallet + lessons view ──
function switchStudentPayTab(tab, el){
  document.querySelectorAll('#page-student-payment .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['wallet','lessons','history'].forEach(t=>{
    const div = document.getElementById('sp-tab-'+t);
    if(div) div.style.display = t===tab ? '' : 'none';
  });
  if(tab==='wallet')  renderStudentWallet();
  if(tab==='lessons') renderStudentLessons();
  if(tab==='history') renderStudentPaymentHistory();
}

function renderStudentWallet(){
  const sid = currentUser.id;
  const w   = loadWallet(sid);
  const balColor = w.balance < 0 ? '#c0392b' : 'var(--green-deep)';
  const el  = document.getElementById('student-wallet-block');
  if(!el) return;

  // Unpaid lessons count
  const unpaidLessons = (load('attendance')||[])
    .filter(a=>a.studentId===sid && a.present && !a.paid);
  const unpaidTotal = unpaidLessons.reduce((s,a)=>s+(+a.costPerStudent||0), 0);

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><span class="dot"></span>💰 Мой кошелёк</div>
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <div style="font-size:0.78rem;color:var(--text3);font-weight:700;margin-bottom:4px">Баланс</div>
          <div style="font-size:2.2rem;font-weight:900;color:${balColor}">${w.balance.toLocaleString('ru')} ₽</div>
        </div>
        ${unpaidTotal>0?`<div style="background:#fdecea;border-radius:10px;padding:10px 16px;border:1px solid #f5c6c2">
          <div style="font-size:0.75rem;color:#c0392b;font-weight:700">Не списано</div>
          <div style="font-size:1.3rem;font-weight:900;color:#c0392b">${unpaidTotal} ₽</div>
          <div style="font-size:0.72rem;color:#c0392b">${unpaidLessons.length} занят.</div>
        </div>`:'<div style="font-size:0.85rem;color:var(--green-deep);font-weight:700">✅ Нет задолженностей</div>'}
      </div>
      ${w.balance<0?`<div style="background:#fdecea;border-radius:8px;padding:10px 14px;font-size:0.85rem;color:#c0392b;font-weight:600;margin-bottom:12px">⚠️ Баланс отрицательный. Пожалуйста, пополните кошелёк.</div>`:''}
    </div>
    <div class="card">
      <div class="card-title"><span class="dot"></span>История транзакций</div>
      ${(w.txns||[]).length===0
        ? '<div style="color:var(--text3);font-size:0.85rem;padding:8px 0">Транзакций нет</div>'
        : [...(w.txns||[])].reverse().map(tx=>{
            const isTopup = tx.type==='topup';
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--green-xpale)">
              <div style="width:32px;height:32px;border-radius:50%;background:${isTopup?'#e8f8f0':'#fdecea'};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">
                ${isTopup?'↑':'↓'}
              </div>
              <div style="flex:1">
                <div style="font-size:0.87rem;font-weight:600">${tx.note}</div>
                <div style="font-size:0.73rem;color:var(--text3)">${tx.date}</div>
              </div>
              <div style="font-weight:800;font-size:0.97rem;color:${isTopup?'var(--green-deep)':'#c0392b'}">
                ${isTopup?'+':'−'}${tx.amount}₽
              </div>
            </div>`;
          }).join('')
      }
    </div>`;
}

function renderStudentLessons(){
  const sid = currentUser.id;
  const att = (()=>{const _r=load('attendance')||[];return Array.isArray(_r)?_r:Object.values(_r);})().filter(a=>a.studentId===sid).slice().reverse();
  const el  = document.getElementById('student-lessons-block');
  if(!el) return;
  if(!att.length){ el.innerHTML=`<div class="card">${emptyHTML()}</div>`; return; }

  const present = att.filter(a=>a.present).length;
  const absent  = att.filter(a=>!a.present).length;
  const unpaid  = att.filter(a=>a.present&&!a.paid).length;

  el.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div style="text-align:center;padding:10px;background:var(--bg);border-radius:10px;border:1px solid var(--green-xpale)">
          <div style="font-size:1.3rem;font-weight:900;color:var(--accent)">${att.length}</div>
          <div style="font-size:0.73rem;color:var(--text3);font-weight:700">Всего</div>
        </div>
        <div style="text-align:center;padding:10px;background:#e8f8f0;border-radius:10px;border:1px solid #a8e6c7">
          <div style="font-size:1.3rem;font-weight:900;color:#1a7a4a">${present}</div>
          <div style="font-size:0.73rem;color:#1a7a4a;font-weight:700">Посещено</div>
        </div>
        <div style="text-align:center;padding:10px;background:${unpaid>0?'#fdecea':'var(--bg)'};border-radius:10px;border:1px solid ${unpaid>0?'#f5c6c2':'var(--green-xpale)'}">
          <div style="font-size:1.3rem;font-weight:900;color:${unpaid>0?'#c0392b':'var(--text3)'}">
            ${unpaid>0?unpaid+'⚠️':'✅'}
          </div>
          <div style="font-size:0.73rem;color:${unpaid>0?'#c0392b':'var(--text3)'};font-weight:700">${unpaid>0?'Не оплачено':'Всё ок'}</div>
        </div>
      </div>
    </div>
    <div class="card">
      ${att.map(a=>{
        const dateLabel = a.date ? new Date(a.date+'T12:00').toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'long'}) : '—';
        const isUnpaid  = a.present && !a.paid;
        // Для ученика: если absentPaid — показываем "Не был", деньги всё равно списаны
        const borderColor = isUnpaid ? '#ef4444' : a.present ? 'var(--green-mid)' : a.absentPaid ? '#ef4444' : 'var(--green-xpale)';
        const bgColor = isUnpaid ? '#fef2f2' : a.absentPaid && a.paid ? '#fef2f2' : '';
        return `<div style="padding:12px;border-radius:10px;margin-bottom:8px;border:1px solid var(--green-xpale);border-left:3px solid ${borderColor};${bgColor?'background:'+bgColor+';':''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div>
              <div style="font-weight:700;font-size:0.9rem;color:var(--accent)">${dateLabel}${a.time?' · '+a.time:''}</div>
              ${a.topic||a.group?`<div style="font-size:0.78rem;color:var(--text2);margin-top:3px">${a.topic?'📖 '+escHtml(a.topic):''}${a.group?' · 👥 '+escHtml(a.group):''}</div>`:''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="att-badge-${a.present?'present':'absent'}">${a.present?'✅ Был(а)':'❌ Не был(а)'}</span>
              ${(a.present||a.absentPaid)&&a.costPerStudent>0?`<span class="att-cost-badge">−${a.costPerStudent}₽</span>`:''}
              ${isUnpaid&&!a.absentPaid?`<span class="att-unpaid-badge">Не оплачено</span>`:''}
              ${a.paid?`<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:8px">✅ Оплачено</span>`:''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// Init student payment page on load
function renderStudentPayment(){
  renderStudentWallet();
}

// Prefill slot data when opening attendance modal
function prefillAttendanceFromSlot(){
  const students = getStudents();
  const slots = load('slots')||[];
  const courses = load('courses')||[];
  // Find slots happening today (by day of week)
  const dow = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'][new Date().getDay()];
  const todaySlots = slots.filter(s=>s.day===dow);
  const slotSel = document.getElementById('att-slot-select');
  if(slotSel){
    slotSel.innerHTML = '<option value="">— Без привязки к слоту —</option>' +
      todaySlots.map(s=>{
        const c = s.courseId ? courses.find(c=>c.id===s.courseId) : null;
        return `<option value="${s.id}">${s.time}${c?' · '+c.title:''} (${c?.price||0}₽)</option>`;
      }).join('');
    slotSel.onchange = function(){
      const sl = slots.find(s=>s.id===this.value);
      if(!sl) return;
      const c = sl.courseId ? courses.find(c=>c.id===sl.courseId) : null;
      if(c?.price) document.getElementById('att-cost').value = c.price;
      document.getElementById('att-time').value = sl.time||'';
      // Check students in this slot
      const slotStudents = students.filter(s=>isSlotForStudent(sl,s.id));
      document.querySelectorAll('#att-student-checks input[type=checkbox]').forEach(cb=>{
        cb.checked = slotStudents.some(s=>s.id===cb.value);
      });
      // Store slotId
      const hidden = document.getElementById('att-slot-id');
      if(hidden) hidden.value = sl.id;
    };
  }
}


// ══════════════════════════════════════════
// AVAILABILITY HELPERS
// ══════════════════════════════════════════
function availStatus(item){
  const now=Date.now();
  if(item.openAt && new Date(item.openAt).getTime()>now) return 'not-open';
  if(item.closeAt && new Date(item.closeAt).getTime()<now) return 'closed';
  return '';
}
function fmtDt(iso){
  if(!iso) return '';
  const d=new Date(iso);
  return d.toLocaleDateString('ru',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
}
function availBadge(item){
  if(!item.openAt && !item.closeAt) return '';
  const parts=[];
  if(item.openAt)  parts.push('📅 с '+fmtDt(item.openAt));
  if(item.closeAt) parts.push('🔒 до '+fmtDt(item.closeAt));
  const st=availStatus(item);
  const col=st==='not-open'?'#b45309':st==='closed'?'var(--red)':'var(--green-mid)';
  return `<span style="font-size:0.73rem;color:${col};font-weight:600;white-space:nowrap">${parts.join(' · ')}</span>`;
}
function availLockBanner(item){
  const st=availStatus(item);
  if(!st) return '';
  const bg=st==='not-open'?'#fffbea':'#fff0f0';
  const col=st==='not-open'?'#b45309':'var(--red)';
  const msg=st==='not-open'?`⏳ Откроется ${fmtDt(item.openAt)}`:`🔒 Доступ закрыт`;
  return `<div style="background:${bg};border-radius:10px;padding:10px 14px;font-size:0.84rem;font-weight:600;color:${col};margin-bottom:8px">${msg}</div>`;
}
/** Renders a start button OR a lock/countdown banner for student view */
function renderAttemptsHistory(item){
  const attempts = item.attempts||[];
  if(!attempts.length) return '';
  const gradeMode = item.gradeMode||'best';
  const gradeModeLabel = gradeMode==='best' ? '🏆 Засчитывается лучший' : '🕐 Засчитывается последний';
  const maxAttempts = item.maxAttempts||0;
  const header = `<div style="margin-bottom:8px;font-size:0.8rem;font-weight:700;color:var(--text2)">
    📋 История попыток · ${gradeModeLabel}${maxAttempts>0?' · Лимит: '+maxAttempts:''}
  </div>`;
  const rows = attempts.map((a,i)=>{
    const isFinal = gradeMode==='best'
      ? a.pct===Math.max(...attempts.map(x=>x.pct))
      : i===attempts.length-1;
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;margin-bottom:4px;background:${isFinal?'var(--green-xpale)':'var(--bg)'};border:1px solid ${isFinal?'var(--green-pale)':'var(--green-xpale)'}">
      <span style="font-size:0.75rem;color:var(--text3);min-width:60px">Попытка ${a.n}</span>
      ${a.total ? `<span class="badge badge-blue" style="font-size:0.7rem">⭐ ${a.score}/${a.total} б. (${a.pct}%)</span>` : ''}
      ${a.total && (a.grade || a.pct!=null) ? `<span class="grade-result-badge grade-${a.grade||calcGrade(a.pct,null)}" style="font-size:0.68rem;padding:2px 8px">Оценка: ${a.grade||calcGrade(a.pct,null)}</span>` : ''}
      ${isFinal ? `<span style="font-size:0.7rem;color:var(--green-mid);margin-left:auto;font-weight:700">← зачтено</span>` : ''}
      <span style="font-size:0.7rem;color:var(--text3);margin-left:auto">${esc(a.date)} ${esc(a.time||'')}</span>
    </div>`;
  }).join('');
  return `<div style="margin-bottom:12px;padding:10px 12px;background:var(--bg2,#f8f9fa);border-radius:10px;border:1px solid var(--green-xpale)">
    ${header}${rows}
  </div>`;
}

function availGate(item, fnName, customLabel){
  const st=availStatus(item);
  if(st==='not-open') return `<div style="background:#fffbea;border-radius:10px;padding:10px 14px;font-size:0.84rem;font-weight:600;color:#b45309">⏳ Откроется ${fmtDt(item.openAt)}</div>`;
  if(st==='closed')   return `<div style="background:#fff0f0;border-radius:10px;padding:10px 14px;font-size:0.84rem;font-weight:600;color:var(--red)">🔒 Срок истёк ${fmtDt(item.closeAt)}</div>`;
  const labels={takeTest:'▶️ Пройти тест',doHW:'✏️ Выполнить',startTrial:'▶ Начать пробник'};
  const btnClass=fnName==='startTrial'?'btn btn-green':'btn btn-green';
  return `<button class="${btnClass}" onclick="${fnName}('${item.id}')">${customLabel||labels[fnName]||'▶ Начать'}</button>`;
}
/** Shared library section HTML */
function libSection(label, count, inner){
  return `<div style="margin-top:20px;padding-top:16px;border-top:2px dashed var(--green-pale)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:0.82rem;font-weight:700;color:var(--text2)">${label}</span>
      <span class="badge badge-gold" style="font-size:0.7rem">${count}</span>
    </div>${inner}</div>`;
}

// ── Edit Availability ──
let _eavType=null, _eavId=null;
function openEditAvail(type,id){
  requireAdmin('openEditAvail');
  _eavType=type; _eavId=id;
  let item=null;
  if(type==='content') item=(load('content')||[]).find(c=>c.id===id);
  else if(type==='test') item=(load('tests')||[]).find(t=>t.id===id);
  else if(type==='hw')  item=(load('hw')||[]).find(h=>h.id===id);
  else if(type==='trial') item=(load('trials')||[]).find(t=>t.id===id);
  if(!item) return;
  document.getElementById('eav-open-at').value=item.openAt||'';
  document.getElementById('eav-close-at').value=item.closeAt||'';
  openModal('modal-edit-avail');
}
function saveEditAvail(){
  const openAt=document.getElementById('eav-open-at').value;
  const closeAt=document.getElementById('eav-close-at').value;
  const upd=arr=>arr.map(x=>x.id===_eavId?{...x,openAt,closeAt}:x);
  if(_eavType==='content'){ save('content',upd(load('content')||[])); renderContentAdmin(); }
  else if(_eavType==='test'){ save('tests',upd(load('tests')||[])); renderTestsAdmin(); }
  else if(_eavType==='hw'){ save('hw',upd(load('hw')||[])); renderHWAdmin(); }
  else if(_eavType==='trial'){ save('trials',upd(load('trials')||[])); renderTrialAdmin(); }
  closeModal('modal-edit-avail');
  showNotif('⏰ Доступность обновлена');
}
function clearEditAvail(){
  document.getElementById('eav-open-at').value='';
  document.getElementById('eav-close-at').value='';
  saveEditAvail();
}

// ══════════════════════════════════════════════════════════
// QUESTION TYPES — init, score, render
// ══════════════════════════════════════════════════════════

/** Create a blank question of any type */
function initQuestion(id, type){
  return {id, type, text:'', options:[], correct:'', pairs:[], points:1, imageUrl:'', hint:'', tags:''};
}

/** Auto-score a question (returns true/false) */
// ══════════════════════════════════════════════
// МОИ ОШИБКИ — СБОР И ОТОБРАЖЕНИЕ
// ══════════════════════════════════════════════

/**
 * Collect wrong answers from a test/hw submission and merge into 'mistakes' store.
 * Each mistake entry: { id, studentId, sourceType, sourceId, sourceTitle, questionId,
 *   questionText, questionType, options, pairs, correct, studentAnswer,
 *   explanation, imageUrl, date, resolved }
 */
function _collectAndSaveWrongAnswers(sourceType, item, answers) {
  if (!currentUser) return;
  const mistakes = load('mistakes') || [];
  const date = new Date().toLocaleDateString('ru');
  (item.questions || []).forEach(q => {
    if (q.type === 'open') return; // open questions are manually checked
    const ans = answers[q.id] || '';
    if (scoreQuestion(q, ans)) return; // correct — skip
    // Check if already exists for this student+question+source
    const existingIdx = mistakes.findIndex(m =>
      m.studentId === currentUser.id && m.sourceId === item.id && m.questionId === q.id
    );
    const entry = {
      id: 'm' + Date.now() + '_' + q.id,
      studentId: currentUser.id,
      sourceType,
      sourceId: item.id,
      sourceTitle: item.title || '',
      questionId: q.id,
      questionText: q.text || '',
      questionType: q.type,
      options: q.options || [],
      pairs: q.pairs || [],
      correct: q.correct || '',
      studentAnswer: ans,
      explanation: q.explanation || '',
      imageUrl: q.imageUrl || '',
      date,
      resolved: false
    };
    if (existingIdx >= 0) {
      // Update with latest attempt data, reset resolved
      mistakes[existingIdx] = { ...mistakes[existingIdx], ...entry, id: mistakes[existingIdx].id, resolved: false };
    } else {
      mistakes.push(entry);
    }
  });
  save('mistakes', mistakes);
}

function _collectAndSaveWrongAnswersTrial(trial, answers) {
  if (!currentUser) return;
  const mistakes = load('mistakes') || [];
  const date = new Date().toLocaleDateString('ru');
  (trial.sections || []).forEach(sec => {
    (sec.questions || []).forEach(q => {
      if (q.type === 'open') return;
      const ans = answers[q.id] || '';
      if (scoreQuestion(q, ans)) return;
      const existingIdx = mistakes.findIndex(m =>
        m.studentId === currentUser.id && m.sourceId === trial.id && m.questionId === q.id
      );
      const entry = {
        id: 'm' + Date.now() + '_' + q.id,
        studentId: currentUser.id,
        sourceType: 'trial',
        sourceId: trial.id,
        sourceTitle: trial.title || '',
        questionId: q.id,
        questionText: q.text || '',
        questionType: q.type,
        options: q.options || [],
        pairs: q.pairs || [],
        correct: q.correct || '',
        studentAnswer: ans,
        explanation: q.explanation || '',
        imageUrl: q.imageUrl || '',
        date,
        resolved: false
      };
      if (existingIdx >= 0) {
        mistakes[existingIdx] = { ...mistakes[existingIdx], ...entry, id: mistakes[existingIdx].id, resolved: false };
      } else {
        mistakes.push(entry);
      }
    });
  });
  save('mistakes', mistakes);
}

function resolveMistake(id) {
  const mistakes = load('mistakes') || [];
  const m = mistakes.find(m => m.id === id);
  if (m) { m.resolved = !m.resolved; save('mistakes', mistakes); renderStudentMistakes(); }
}

function deleteMistake(id) {
  let mistakes = load('mistakes') || [];
  mistakes = mistakes.filter(m => m.id !== id);
  save('mistakes', mistakes);
  renderStudentMistakes();
}

function renderStudentMistakes() {
  const el = document.getElementById('student-mistakes-content');
  if (!el) return;
  const sid = currentUser.id;
  let mistakes = (load('mistakes') || []).filter(m => m.studentId === sid);

  const filter = window._mistakesFilter || 'all';
  const groupBy = window._mistakesGroup || 'source';

  // filter bar
  const filterBar = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      <button class="btn ${filter==='all'?'btn-green':'btn-outline'} btn-sm" onclick="window._mistakesFilter='all';renderStudentMistakes()">Все (${mistakes.length})</button>
      <button class="btn ${filter==='unresolved'?'btn-green':'btn-outline'} btn-sm" onclick="window._mistakesFilter='unresolved';renderStudentMistakes()">❌ Не разобраны (${mistakes.filter(m=>!m.resolved).length})</button>
      <button class="btn ${filter==='resolved'?'btn-green':'btn-outline'} btn-sm" onclick="window._mistakesFilter='resolved';renderStudentMistakes()">✅ Разобраны (${mistakes.filter(m=>m.resolved).length})</button>
      <span style="margin-left:auto;font-size:0.8rem;color:var(--text3)">Группировка:</span>
      <button class="btn ${groupBy==='source'?'btn-green':'btn-outline'} btn-sm" onclick="window._mistakesGroup='source';renderStudentMistakes()">По работе</button>
      <button class="btn ${groupBy==='date'?'btn-green':'btn-outline'} btn-sm" onclick="window._mistakesGroup='date';renderStudentMistakes()">По дате</button>
    </div>`;

  if (filter === 'unresolved') mistakes = mistakes.filter(m => !m.resolved);
  if (filter === 'resolved') mistakes = mistakes.filter(m => m.resolved);

  if (!mistakes.length) {
    el.innerHTML = filterBar + `<div class="empty-state"><div class="big">${filter==='resolved'?'🏆':'🎉'}</div><p>${filter==='resolved'?'Нет разобранных ошибок':'Ошибок нет — отличная работа!'}</p></div>`;
    return;
  }

  // Group
  let groups = {};
  if (groupBy === 'source') {
    mistakes.forEach(m => {
      const key = m.sourceTitle || m.sourceId;
      if (!groups[key]) groups[key] = { label: `${_sourceIcon(m.sourceType)} ${esc(m.sourceTitle||m.sourceId)}`, items: [] };
      groups[key].items.push(m);
    });
  } else {
    mistakes.forEach(m => {
      const key = m.date || '—';
      if (!groups[key]) groups[key] = { label: `📅 ${key}`, items: [] };
      groups[key].items.push(m);
    });
  }

  function _sourceIcon(t) { return t==='test'?'📋':t==='hw'?'✏️':'🎯'; }

  let html = filterBar;
  Object.values(groups).forEach(g => {
    const unresolved = g.items.filter(m => !m.resolved).length;
    html += `<div class="card" style="margin-bottom:16px">
      <div class="card-title" style="margin-bottom:14px">
        <span class="dot"></span>${g.label}
        <span class="badge ${unresolved?'badge-gold':'badge-green'}" style="margin-left:auto;font-size:0.72rem">${unresolved ? unresolved + ' не разобрано' : '✅ все разобраны'}</span>
      </div>
      ${g.items.map(m => _renderMistakeCard(m)).join('')}
    </div>`;
  });

  el.innerHTML = html;
}

function _renderMistakeCard(m) {
  const typeLabel = {auto:'⚡ Авто',multi:'☑️ Несколько',fill:'🔤 Вставка',match:'🔗 Соответствие',pairs:'🧩 Пары',order:'📊 Порядок'}[m.questionType]||'Вопрос';
  const correctDisplay = _formatCorrectAnswer(m);
  const studentDisplay = m.studentAnswer || '—';
  return `<div style="border:1.5px solid ${m.resolved?'var(--green-pale)':'#fdd'};border-radius:12px;padding:14px;margin-bottom:10px;background:${m.resolved?'var(--bg)':'#fff8f8'}">
    <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <span class="badge" style="background:${m.resolved?'var(--green-xpale)':'#ffeaea'};color:${m.resolved?'var(--green-deep)':'var(--red)'};border-color:${m.resolved?'var(--green-pale)':'#f5c6cb'};flex-shrink:0">${m.resolved?'✅':'❌'} ${typeLabel}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:0.93rem;color:var(--text);margin-bottom:6px">${esc(m.questionText)}</div>
        ${m.imageUrl?`<img src="${safeUrl(m.imageUrl)}" style="max-width:100%;max-height:180px;border-radius:8px;object-fit:contain;margin-bottom:8px" alt="" onerror="this.style.display='none'">` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div style="background:#ffeaea;border-radius:8px;padding:8px 10px;font-size:0.83rem">
            <div style="font-size:0.7rem;color:var(--red);font-weight:700;margin-bottom:2px">ВАШ ОТВЕТ</div>
            <div style="color:var(--text)">${esc(studentDisplay)}</div>
          </div>
          <div style="background:#e8f8ef;border-radius:8px;padding:8px 10px;font-size:0.83rem">
            <div style="font-size:0.7rem;color:var(--green-deep);font-weight:700;margin-bottom:2px">ПРАВИЛЬНО</div>
            <div style="color:var(--text)">${correctDisplay}</div>
          </div>
        </div>
        ${m.explanation ? `<div style="background:var(--bg2);border-radius:8px;padding:8px 12px;font-size:0.83rem;color:var(--text2);margin-bottom:8px"><span style="font-weight:700;color:var(--green-deep)">💡 Пояснение:</span> ${esc(m.explanation)}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          <button class="btn btn-sm ${m.resolved?'btn-outline':'btn-green'}" onclick="resolveMistake('${m.id}')">${m.resolved?'↩️ Вернуть в ошибки':'✅ Отметить разобранным'}</button>
          <button class="btn btn-sm btn-outline" onclick="deleteMistake('${m.id}')" style="color:var(--red);border-color:var(--red)">🗑 Удалить</button>
        </div>
      </div>
    </div>
  </div>`;
}

function _formatCorrectAnswer(m) {
  if (m.questionType === 'match' || m.questionType === 'pairs') {
    return (m.pairs || []).map(p => `${esc(p[0])} → ${esc(p[1])}`).join('<br>');
  }
  return esc(m.correct || '—');
}

function scoreQuestion(q, ans){
  if(!ans) return false;
  const norm = s => (s||'').toString().trim().toLowerCase();
  if(q.type==='auto'){
    return norm(ans)===norm(q.correct);
  } else if(q.type==='multi'){
    const correct = (q.correct||'').split(',').map(s=>norm(s)).filter(Boolean).sort();
    const given   = (ans||'').split(',').map(s=>norm(s)).filter(Boolean).sort();
    return JSON.stringify(correct)===JSON.stringify(given);
  } else if(q.type==='fill'){
    const correct = (q.correct||'').split(',').map(s=>norm(s));
    const given   = (ans||'').split(',').map(s=>norm(s));
    return correct.every((c,i)=>c===given[i]);
  } else if(q.type==='match'||q.type==='pairs'){
    // ans = "A:B,C:D,..."
    const pairs = (q.pairs||[]);
    const correctMap = Object.fromEntries(pairs.map(p=>[norm(p[0]),norm(p[1])]));
    const givenPairs = (ans||'').split(',').map(s=>s.split(':').map(norm));
    return givenPairs.length===pairs.length && givenPairs.every(([a,b])=>correctMap[a]===b);
  } else if(q.type==='order'){
    const correct = (q.correct||'').split(',').map(s=>norm(s));
    const given   = (ans||'').split(',').map(s=>norm(s));
    return JSON.stringify(correct)===JSON.stringify(given);
  }
  return false;
}

/** Render a question for a student taking a test/hw/trial */
function renderStudentQuestion(q, idx, answerObj, selectFn){
  const ans = getAnswer(answerObj, q.id) || '';
  const pts = +q.points||1;
  const typeLabels={auto:'⚡ Авто',multi:'☑️ Несколько правильных',open:'📝 Открытый',fill:'🔤 Вставка слова',match:'🔗 Соответствие',pairs:'🧩 Найти пары',order:'📊 По порядку'};

  let body='';

  if(q.type==='auto'){
    body=`<div class="option-list">${(q.options||[]).map(o=>`
      <div class="option-item ${ans===o?'selected':''}" onclick="${selectFn}('${q.id}','${o.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}',false)">
        <span style="width:20px;height:20px;border-radius:50%;border:2px solid var(--green-mid);display:inline-flex;align-items:center;justify-content:center;font-size:0.7rem">${ans===o?'●':''}</span>${o}
      </div>`).join('')}</div>`;

  } else if(q.type==='multi'){
    const sel=(ans||'').split(',').map(s=>s.trim()).filter(Boolean);
    body=`<div style="font-size:0.76rem;color:var(--text3);margin-bottom:6px">Выбери все правильные варианты</div>
    <div class="option-list">${(q.options||[]).map(o=>`
      <div class="option-item ${sel.includes(o)?'selected':''}" onclick="${selectFn}('${q.id}','${o.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}',true)" style="gap:10px">
        <span style="width:18px;height:18px;border-radius:4px;border:2px solid var(--green-mid);display:inline-flex;align-items:center;justify-content:center;font-size:0.65rem;flex-shrink:0">${sel.includes(o)?'✓':''}</span>${o}
      </div>`).join('')}</div>`;

  } else if(q.type==='open'){
    body=`<textarea style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;min-height:80px;resize:vertical;box-sizing:border-box"
      placeholder="Ваш ответ..." oninput="${answerObj}['${q.id}']=this.value">${ans}</textarea>`;

  } else if(q.type==='fill'){
    // Show text with ___ replaced by inputs
    const parts = (q.text||'').split('___');
    const fills = ans ? ans.split(',') : [];
    if(parts.length>1){
      body = `<div style="font-size:0.92rem;line-height:2;color:var(--text1)">` +
        parts.map((part,pi)=>{
          if(pi===parts.length-1) return part;
          const inputVal=(fills[pi]||'').replace(/"/g,'&quot;');
          return part+`<input type="text" value="${inputVal}" placeholder="..." style="border:none;border-bottom:2px solid var(--green-mid);padding:2px 6px;min-width:80px;font-family:Nunito,sans-serif;font-size:0.88rem;background:transparent;outline:none" oninput="(function(el,i){const f=${answerObj}['${q.id}']?${answerObj}['${q.id}'].split(','):new Array(${parts.length-1}).fill('');f[i]=el.value;${answerObj}['${q.id}']=f.join(',')})(this,${pi})">`;
        }).join('') + `</div>`;
    } else {
      body=`<input style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem" placeholder="Ваш ответ..." value="${(ans||'').replace(/"/g,'&quot;')}" oninput="${answerObj}['${q.id}']=this.value">`;
    }

  } else if(q.type==='match'){
    const pairs=q.pairs||[];
    const leftCol=pairs.map(p=>p[0]);
    const rightCol=[...pairs.map(p=>p[1])].sort(()=>Math.random()-0.5);
    const curMap = {};
    (ans||'').split(',').forEach(s=>{ const[a,b]=s.split(':'); if(a&&b) curMap[a.trim()]=b.trim(); });
    body=`<div style="font-size:0.76rem;color:var(--text3);margin-bottom:8px">Соедини каждый элемент слева с соответствующим справа</div>
    <div style="display:grid;gap:8px">${leftCol.map(left=>`
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center">
        <div style="padding:8px 12px;background:var(--green-xpale);border-radius:8px;font-weight:600;font-size:0.85rem">${left}</div>
        <span style="color:var(--text3)">→</span>
        <select style="padding:8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem"
          onchange="(function(sel,l){const m={};'${ans}'.split(',').forEach(s=>{const[a,b]=s.split(':');if(a&&b)m[a.trim()]=b.trim()});m[l]=sel.value;${answerObj}['${q.id}']=Object.entries(m).map(([a,b])=>a+':'+b).join(',')})(this,'${left.replace(/'/g,"\\'")}')">
          <option value="">— выбери —</option>
          ${rightCol.map(r=>`<option value="${r.replace(/"/g,'&quot;')}" ${curMap[left]===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>`).join('')}
    </div>`;

  } else if(q.type==='pairs'){
    const pairs=q.pairs||[];
    const leftCol=pairs.map(p=>p[0]);
    const rightCol=[...pairs.map(p=>p[1])].sort(()=>Math.random()-0.5);
    const curMap={};
    (ans||'').split(',').forEach(s=>{ const[a,b]=s.split(':'); if(a&&b) curMap[a.trim()]=b.trim(); });
    body=`<div style="font-size:0.76rem;color:var(--text3);margin-bottom:8px">Выбери пару для каждого элемента</div>
    <div style="display:grid;gap:8px">${leftCol.map(left=>`
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center">
        <div style="padding:8px 12px;background:#e8f5e9;border-radius:8px;font-weight:600;font-size:0.85rem;border:1.5px solid var(--green-pale)">${left}</div>
        <span style="color:var(--text3)">↔</span>
        <select style="padding:8px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.85rem"
          onchange="(function(sel,l){const m={};'${ans}'.split(',').forEach(s=>{const[a,b]=s.split(':');if(a&&b)m[a.trim()]=b.trim()});m[l]=sel.value;${answerObj}['${q.id}']=Object.entries(m).map(([a,b])=>a+':'+b).join(',')})(this,'${left.replace(/'/g,"\\'")}')">
          <option value="">— выбери —</option>
          ${rightCol.map(r=>`<option value="${r.replace(/"/g,'&quot;')}" ${curMap[left]===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>`).join('')}
    </div>`;

  } else if(q.type==='order'){
    const items=(q.options||q.correct.split(',')).map(s=>s.trim()).filter(Boolean);
    const shuffled = ans ? ans.split(',').map(s=>s.trim()) : [...items].sort(()=>Math.random()-0.5);
    body=`<div style="font-size:0.76rem;color:var(--text3);margin-bottom:8px">Расставь элементы в правильном порядке</div>
    <div style="display:grid;gap:6px" id="order-list-${q.id}">
      ${shuffled.map((item,ii)=>`
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--white);border-radius:8px;border:1.5px solid var(--green-pale)">
          <span style="font-size:0.8rem;color:var(--text3);font-weight:700;min-width:20px">${ii+1}.</span>
          <span style="flex:1;font-size:0.88rem">${item}</span>
          <div style="display:flex;flex-direction:column;gap:2px">
            ${ii>0?`<button onclick="moveOrderItem('${q.id}',${ii},-1,'${answerObj}')" style="background:none;border:none;cursor:pointer;font-size:0.8rem;padding:2px">▲</button>`:'<span style="padding:2px;font-size:0.8rem">　</span>'}
            ${ii<shuffled.length-1?`<button onclick="moveOrderItem('${q.id}',${ii},1,'${answerObj}')" style="background:none;border:none;cursor:pointer;font-size:0.8rem;padding:2px">▼</button>`:'<span style="padding:2px;font-size:0.8rem">　</span>'}
          </div>
        </div>`).join('')}
    </div>`;
  }

  return `<div class="question-block">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div class="question-num">${typeLabels[q.type]||q.type} · Вопрос ${idx+1}</div>
      <span style="font-size:0.78rem;color:var(--text3)">⭐ ${pts} б.</span>
    </div>
    ${q.type!=='fill'?`<div class="question-text">${escHtml(q.text)}</div>`:''}
    ${q.imageUrl?`<img src="${safeUrl(q.imageUrl)}" class="q-img-preview" style="margin-bottom:10px" alt="">`:''}
    ${body}
    ${q.hint?`<div style="margin-top:10px">
      <button onclick="toggleHint('hint-${q.id}')" style="background:none;border:1.5px solid var(--green-pale);border-radius:8px;padding:5px 12px;cursor:pointer;font-family:Nunito,sans-serif;font-size:0.78rem;color:var(--text3);display:inline-flex;align-items:center;gap:5px;transition:all 0.15s" onmouseover="this.style.borderColor='var(--green-mid)';this.style.color='var(--green-deep)'" onmouseout="this.style.borderColor='var(--green-pale)';this.style.color='var(--text3)'">💡 Показать подсказку</button>
      <div id="hint-${q.id}" style="display:none;margin-top:8px;background:linear-gradient(135deg,#fffbeb,#fef9e7);border:1.5px solid #fce98a;border-radius:10px;padding:10px 14px;font-size:0.84rem;color:#856404;line-height:1.6">
        <span style="font-weight:700;margin-right:6px">💡</span>${q.hint}
      </div>
    </div>`:''}
  </div>`;
}

function toggleHint(id){
  const el=document.getElementById(id);
  if(!el) return;
  const btn=el.previousElementSibling;
  if(el.style.display==='none'){
    el.style.display='block';
    if(btn) btn.innerHTML='💡 Скрыть подсказку';
  } else {
    el.style.display='none';
    if(btn) btn.innerHTML='💡 Показать подсказку';
  }
}

function moveOrderItem(qId, idx, dir, answerObj){
  const cur = getAnswer(answerObj, qId)||'';
  const arr = cur ? cur.split(',').map(s=>s.trim()) : [];
  const newIdx = idx+dir;
  if(newIdx<0||newIdx>=arr.length) return;
  [arr[idx],arr[newIdx]]=[arr[newIdx],arr[idx]];
  setAnswer(answerObj, qId, arr.join(','));
  // Re-render the right body
  if(answerObj==='_testAnswers') renderTakeTestBody();
  else if(answerObj==='_trialAnswers') renderTrialTakeBody();
}

/** Render a review (results) block for a question */
function renderReviewQuestion(q, answers){
  const pts=+q.points||1;
  const ans=answers[q.id]||'';
  const typeLabels={auto:'⚡ Авто',multi:'☑️ Несколько',open:'📝 Открытый',fill:'🔤 Вставка',match:'🔗 Соответствие',pairs:'🧩 Пары',order:'📊 Порядок'};

  if(q.type==='open'){
    return `<div class="question-block">
      <div class="question-num">📝 Открытый · <span style="font-size:0.75rem;color:var(--text3)">⭐ ${pts} б.</span></div>
      <div class="question-text">${escHtml(q.text)}</div>
      ${q.imageUrl?`<img src="${safeUrl(q.imageUrl)}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
      <div class="feedback-box"><strong>Ваш ответ:</strong> ${ans||'—'}</div>
      ${q.checked?`<div class="feedback-box" style="border-left-color:var(--gold);margin-top:8px"><strong>Баллы: ${q.grade!=null?q.grade:q.earnedPts!=null?q.earnedPts:'—'}</strong><br>${q.comment||''}</div>`:`<div style="color:var(--text3);font-size:0.8rem;margin-top:6px">⏳ Ожидает проверки</div>`}
    </div>`;
  }

  const correct = scoreQuestion(q, ans);
  let detail='';
  if(q.type==='auto'||q.type==='fill'||q.type==='order'){
    detail=`<div class="option-item ${correct?'correct':'wrong'}" style="margin-top:4px">${ans||'—'} ${correct?'✅':'❌ Правильно: '+q.correct}</div>`;
  } else if(q.type==='multi'){
    detail=`<div class="option-item ${correct?'correct':'wrong'}" style="margin-top:4px">${ans||'—'} ${correct?'✅':'❌ Правильно: '+q.correct}</div>`;
  } else if(q.type==='match'||q.type==='pairs'){
    const pairs=q.pairs||[];
    detail=pairs.map(p=>{
      const givenMap={};
      (ans||'').split(',').forEach(s=>{const[a,b]=s.split(':');if(a&&b)givenMap[a.trim()]=b.trim();});
      const given=givenMap[p[0]]||'—';
      const ok=(given||'').toLowerCase()===p[1].toLowerCase();
      return `<div class="option-item ${ok?'correct':'wrong'}" style="margin-top:4px">${p[0]} → ${given} ${ok?'✅':'❌ Правильно: '+p[1]}</div>`;
    }).join('');
  }

  return `<div class="question-block">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="question-num">${typeLabels[q.type]||q.type}</div>
      <span style="font-size:0.78rem;font-weight:700;color:${correct?'var(--green-mid)':'var(--red)'}">⭐ ${correct?pts:0}/${pts} б.</span>
    </div>
    <div class="question-text">${escHtml(q.text)}</div>
    ${q.imageUrl?`<img src="${safeUrl(q.imageUrl)}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
    ${detail}
  </div>`;
}

// Add .q-input CSS class shorthand helper (used in buildQuestionHTML)


// ═══════════════════════════════════════════════════════════════
// JSON IMPORT — импорт материалов, тестов, ДЗ, пробников из JSON
// ═══════════════════════════════════════════════════════════════

let _importType = null; // 'material' | 'test' | 'hw' | 'trial'

function triggerImportJSON(type) {
  _importType = type;
  const input = document.getElementById('import-json-input');
  if (!input) return;
  input.value = ''; // reset so same file can be re-imported
  input.click();
}

function handleImportJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      switch (_importType) {
        case 'material': importMaterial(data); break;
        case 'test':     importTest(data);     break;
        case 'hw':       importHW(data);       break;
        case 'trial':    importTrial(data);    break;
        default: showNotif('⚠️ Неизвестный тип импорта');
      }
    } catch(err) {
      showNotif('❌ Ошибка чтения JSON: ' + err.message);
      console.error(err);
    }
  };
  reader.readAsText(file, 'utf-8');
}

// ── Валидатор вопросов (общий для теста / ДЗ / пробника) ──
function normalizeQuestion(q, idx) {
  if (!q || typeof q !== 'object') throw new Error(`Вопрос ${idx+1}: не объект`);
  const validTypes = ['auto','multi','open','fill','match','order','pairs'];
  const type = q.type || 'auto';
  if (!validTypes.includes(type)) throw new Error(`Вопрос ${idx+1}: неизвестный тип «${type}»`);
  const norm = {
    id: q.id || ('q_' + Date.now() + '_' + idx),
    type,
    text: String(q.text || ''),
    points: +(q.points) || 1,
  };
  if (['auto','multi'].includes(type)) {
    if (!Array.isArray(q.options) || !q.options.length)
      throw new Error(`Вопрос ${idx+1} (${type}): нужно поле "options" — массив вариантов`);
    norm.options = q.options.map(String);
    norm.correct = String(q.correct || q.options[0]);
  }
  if (type === 'fill') {
    norm.correct = String(q.correct || '');
  }
  if (type === 'order') {
    norm.correct = String(q.correct || '');
    norm.options = q.options ? q.options.map(String) : norm.correct.split(',').map(s=>s.trim());
  }
  if (['match','pairs'].includes(type)) {
    if (!Array.isArray(q.pairs) || !q.pairs.length)
      throw new Error(`Вопрос ${idx+1} (${type}): нужно поле "pairs" — массив пар [[A,B],...]`);
    norm.pairs = q.pairs.map((p,pi) => {
      if (!Array.isArray(p) || p.length < 2)
        throw new Error(`Вопрос ${idx+1}, пара ${pi+1}: должна быть [левое, правое]`);
      return [String(p[0]), String(p[1])];
    });
  }
  if (q.imageUrl) norm.imageUrl = String(q.imageUrl);
  if (q.hint)     norm.hint     = String(q.hint);
  if (q.tags)     norm.tags     = String(q.tags);
  return norm;
}

// ── Импорт материала (учебный конспект) ──
function importMaterial(data) {
  if (!data.title) throw new Error('Поле "title" обязательно');
  // Convert blocks to legacy format used by addTheory
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  // Build legacy fields from blocks
  let videoUrl = '', textContent = '', imageUrls = [];
  const paragraphs = [];
  blocks.forEach(b => {
    if (!b || !b.type) return;
    if (b.type === 'video' && b.url) { videoUrl = b.url; return; }
    if (b.type === 'image' && b.url) { imageUrls.push(b.url); return; }
    const tag = {
      'h1':'# ','h2':'## ','h3':'### ','p':'','quote':'> ','code':'`','callout':'💡 '
    }[b.type] || '';
    if (b.text) paragraphs.push(tag + b.text);
  });
  textContent = paragraphs.join('\n\n');

  // Build nb-style blocks for the content system
  const nbBlocks = blocks.map((b, i) => {
    if (!b || !b.type) return null;
    const id = 'nb_' + Date.now() + '_' + i;
    if (b.type === 'image') return { id, type:'image', url: b.url||'', caption: b.caption||'' };
    if (b.type === 'video') return { id, type:'video', url: b.url||'' };
    if (b.type === 'divider') return { id, type:'divider' };
    return { id, type: b.type, text: b.text||'' };
  }).filter(Boolean);

  const item = {
    id: 'ct_' + Date.now() + '_lib',
    type: 'theory',
    title: data.title,
    studentId: null,
    isLibrary: true,
    date: new Date().toLocaleDateString('ru'),
    videoUrl,
    text: textContent,
    imageUrls,
    nbBlocks,
    attachmentUrl: data.attachmentUrl || '',
  };

  const content = load('content') || [];
  content.push(item);
  save('content', content);
  renderContentAdmin();
  showNotif(`✅ Материал «${data.title}» импортирован в библиотеку`);
}

// ── Импорт теста ──
function importTest(data) {
  if (!data.title) throw new Error('Поле "title" обязательно');
  if (!Array.isArray(data.questions) || !data.questions.length)
    throw new Error('Поле "questions" обязательно — массив вопросов');

  const questions = data.questions.map((q, i) => normalizeQuestion(q, i));
  const autoTotal = questions.filter(q => ['auto','multi','fill','match','order','pairs'].includes(q.type))
                             .reduce((s,q) => s + (+q.points||1), 0);
  const gradeConfig = data.gradeConfig || { 5:90, 4:75, 3:55, 2:0 };

  const test = {
    id: 't' + Date.now() + '_lib',
    studentId: null,
    isLibrary: true,
    title: data.title,
    desc: data.desc || '',
    questions,
    date: new Date().toLocaleDateString('ru'),
    submitted: false,
    answers: {},
    autoScore: 0,
    autoTotal,
    gradeConfig,
    timeMins: data.timeLimit || data.timeMins || null,
    openAt: '',
    closeAt: '',
  };

  const tests = load('tests') || [];
  tests.push(test);
  save('tests', tests);
  renderTestsAdmin();
  showNotif(`✅ Тест «${data.title}» импортирован (${questions.length} вопр., ${autoTotal} б.)`);
}

// ── Импорт домашнего задания ──
function importHW(data) {
  if (!data.title) throw new Error('Поле "title" обязательно');

  // tasks → questions (ДЗ может быть как вопросы, так и задачи-open)
  const rawQ = data.questions || data.tasks || [];
  const questions = rawQ.map((q, i) => {
    // tasks-format: {id, type, text, points, hint}
    const norm = normalizeQuestion(
      { type: q.type || 'open', ...q }, i
    );
    return norm;
  });

  const hw = {
    id: 'hw' + Date.now() + '_lib',
    studentId: null,
    isLibrary: true,
    title: data.title,
    desc: data.desc || data.description || '',
    due: data.due || '',
    fileUrl: data.fileUrl || '',
    questions,
    submitted: false,
    answers: {},
    date: new Date().toLocaleDateString('ru'),
    openAt: '',
    closeAt: '',
  };

  const hws = load('hw') || [];
  hws.push(hw);
  save('hw', hws);
  renderHWAdmin();
  showNotif(`✅ ДЗ «${data.title}» импортировано (${questions.length} зад.)`);
}

// ── Импорт пробника ──
function importTrial(data) {
  if (!data.title) throw new Error('Поле "title" обязательно');

  let sections = [];

  if (Array.isArray(data.sections) && data.sections.length) {
    // Native sections format: [{title, questions:[...]}, ...]
    sections = data.sections.map((sec, si) => {
      if (!Array.isArray(sec.questions)) throw new Error(`Секция ${si+1}: нужно поле "questions"`);
      return {
        id: 'sec_' + Date.now() + '_' + si,
        title: sec.title || `Раздел ${si+1}`,
        questions: sec.questions.map((q,qi) => normalizeQuestion(q, qi)),
      };
    });
  } else if (Array.isArray(data.questions) && data.questions.length) {
    // Flat questions — wrap into single section
    sections = [{
      id: 'sec_' + Date.now(),
      title: data.sectionTitle || 'Основной раздел',
      questions: data.questions.map((q,i) => normalizeQuestion(q, i)),
    }];
  } else {
    throw new Error('Нужно поле "sections" или "questions"');
  }

  const allQ = sections.flatMap(s => s.questions);
  const maxPts = allQ.reduce((a,q) => a + (+q.points||1), 0);
  const gradeConfig = data.gradeConfig || { 5:85, 4:67, 3:45, 2:0 };

  const trial = {
    id: 'tr_' + Date.now() + '_lib',
    studentId: null,
    isLibrary: true,
    title: data.title,
    subject: data.subject || '',
    timeMins: data.timeMins || data.timeLimit || 180,
    passThresh: data.passThresh || 55,
    instruction: data.instruction || '',
    sections,
    maxPts,
    autoTotal: maxPts,
    gradeConfig,
    date: new Date().toLocaleDateString('ru'),
    submitted: false,
    answers: {},
    autoScore: 0,
    openAt: '',
    closeAt: '',
  };

  const trials = load('trials') || [];
  trials.push(trial);
  save('trials', trials);
  renderTrialAdmin();
  showNotif(`✅ Пробник «${data.title}» импортирован (${allQ.length} вопр., ${maxPts} б.)`);
}

// ═══════════════════════════════════════════════
// WEB PUSH — VAPID + Vercel Function
// ═══════════════════════════════════════════════

const WP_VAPID_PUB   = 'BBTKTldG8YMiwcYTPPv9Y4n5lQiVC-xBSEbIyMVYYLdjvAUho9mNsQf_uO9wwA0GhNk8ij32YWy0iAPspPEIbOY';
const WP_SUB_KEY     = 'biohim_wp_sub_';     // + studentId → JSON подписки
const WP_ENABLED_KEY = 'biohim_wp_on_';      // + studentId → '1'
const WP_SEND_URL    = '/api/send-push';

function wpSubKey(sid)     { return WP_SUB_KEY + sid; }
function wpEnabledKey(sid) { return WP_ENABLED_KEY + sid; }
function wpIsEnabled(sid)  { return !!localStorage.getItem(wpEnabledKey(sid)); }

function wpSupported() {
  return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}

async function wpGetReg() {
  return navigator.serviceWorker.ready;
}

// ── Подписка ──
async function wpSubscribe() {
  if (!wpSupported()) {
    showNotif('⚠️ Браузер не поддерживает Web Push');
    return;
  }
  const sid = currentUser?.id;
  if (!sid) return;

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    showNotif('⚠️ Разрешите уведомления в браузере и попробуйте снова');
    renderNotifSettingsStudent();
    return;
  }

  try {
    const reg = await wpGetReg();
    // Отписываем старую если есть
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe();

    // Конвертируем VAPID public key из base64url в Uint8Array
    const appKey = wpB64uToUint8(WP_VAPID_PUB);

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey,
    });

    const subJson = JSON.parse(JSON.stringify(sub));
    localStorage.setItem(wpSubKey(sid), JSON.stringify(subJson));
    localStorage.setItem(wpEnabledKey(sid), '1');

    showNotif('✅ Web Push включён!');
    renderNotifSettingsStudent();

    // Показываем тест через SW напрямую
    setTimeout(() => wpShowDirect('BioХим', '🔔 Web Push подключён! Уведомления придут даже при закрытом сайте.', ''), 600);

  } catch (err) {
    console.warn('wpSubscribe error:', err);
    showNotif('❌ Ошибка подписки: ' + err.message);
  }
}

// ── Отписка ──
async function wpUnsubscribe() {
  const sid = currentUser?.id;
  if (!sid) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {}
  localStorage.removeItem(wpSubKey(sid));
  localStorage.removeItem(wpEnabledKey(sid));
  showNotif('Web Push отключён');
  renderNotifSettingsStudent();
}

// ── Показать уведомление через SW напрямую (страница открыта/фон) ──
async function wpShowDirect(title, body, nav) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title || 'BioХим', {
      body,
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E%3Crect width='180' height='180' rx='40' fill='%232d6a4f'/%3E%3Ctext x='90' y='130' text-anchor='middle' font-family='Georgia,serif' font-size='96' font-weight='700' fill='white'%3EB%3C/text%3E%3C/svg%3E",
      tag: nav || 'biohim',
      renotify: true,
      data: { nav: nav || '' },
      vibrate: [200, 100, 200],
    });
  } catch (e) { console.warn('wpShowDirect:', e); }
}

// ── Отправить push через Vercel API (вызывается на стороне репетитора) ──
async function wpSendToStudent(sid, title, body, nav) {
  const subRaw = localStorage.getItem(wpSubKey(sid));
  if (!subRaw) return;  // нет подписки — тихо пропускаем
  try {
    const subscription = JSON.parse(subRaw);
    if (subscription.direct) return; // прямой режим, не используем API

    await fetch(WP_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        payload: JSON.stringify({ title: title || 'BioХим', body, nav: nav || '' })
      })
    });
  } catch (e) { console.warn('wpSend error:', e); }
}

// ── helper: base64url → Uint8Array (для applicationServerKey) ──
function wpB64uToUint8(b64u) {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - s.length % 4);
  const bin = atob(s + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// Web Push интегрирован напрямую в addNotif (выше) — патч удалён во избежание рекурсии

// ── Тест ──
async function testWebPush() {
  const sid = currentUser?.id;
  if (!wpIsEnabled(sid)) { showNotif('Web Push не включён'); return; }
  await wpShowDirect('BioХим — тест', '🔔 Web Push работает! Уведомления приходят. ✅', '');
  showNotif('✅ Тестовое уведомление отправлено');
}

// ── Навигация по клику на уведомление ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'navigate' && e.data.nav && typeof navigateTo === 'function') {
      navigateTo(e.data.nav);
    }
  });
}

// ═══════════════════════════════════════════════
// ЗАЩИТА ОТ ПОТЕРИ ДАННЫХ — beforeunload + backdrop
// ═══════════════════════════════════════════════

// Предупреждение при закрытии/обновлении вкладки
window.addEventListener('beforeunload', function(e) {
  if (_editorDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Клик по backdrop (мимо .modal) — через guard
document.addEventListener('click', function(e) {
  if (!e.target.classList.contains('modal-bg')) return;
  const modal = e.target;
  if (!modal.classList.contains('open')) return;
  closeModal(modal.id);
});

// Помечаем dirty при вводе текста в полях редакторов
document.addEventListener('input', function(e) {
  if (!_editorDirty && e.target.closest) {
    const inEditor = _DIRTY_MODALS.some(id => {
      const el = document.getElementById(id);
      return el && el.classList.contains('open') && el.contains(e.target);
    });
    if (inEditor) _setDirty(true);
  }
});

// ═══════════════════════════════════════════════
// АНАЛИТИЧЕСКАЯ ПАНЕЛЬ УЧЕНИКА
// ═══════════════════════════════════════════════

function renderStudentAnalytics() {
  const sid = currentUser.id;
  const el = document.getElementById('student-analytics-content');
  if (!el) return;

  const tests    = (load('tests')   || []).filter(t => t.studentId === sid && t.submitted);
  const hw       = (load('hw')      || []).filter(h => h.studentId === sid);
  const content  = (load('content') || []).filter(c => c.studentId === sid);
  const trials   = (load('trials')  || []).filter(t => t.studentId === sid && t.submitted);

  // ── collect subject data ──
  const subjects = ['Биология', 'Химия'];
  const subjectStats = {};
  subjects.forEach(subj => {
    const sTests  = tests.filter(t => t.subject === subj && t.score != null);
    const sMats   = content.filter(c => c.subject === subj);
    const sTrials = trials.filter(t => t.subject === subj && t.score != null);
    const avgScore = sTests.length
      ? Math.round(sTests.reduce((s, t) => s + Number(t.score || 0), 0) / sTests.length)
      : 0;
    subjectStats[subj] = { tests: sTests, mats: sMats, trials: sTrials, avgScore };
  });

  // ── topic breakdown ──
  function topicData(subj) {
    const items = tests.filter(t => t.subject === subj && t.score != null && t.tags && t.tags.length);
    const map = {};
    items.forEach(t => {
      (t.tags || []).forEach(tag => {
        if (!map[tag]) map[tag] = { total: 0, sum: 0, count: 0 };
        map[tag].sum += Number(t.score || 0);
        map[tag].count++;
        map[tag].total++;
      });
    });
    return Object.entries(map)
      .map(([tag, d]) => ({ tag, avg: Math.round(d.sum / d.count), count: d.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }

  // ── activity heatmap data (last 12 months) ──
  const ACTIVITY_KEY = 'biohim_viewed_' + sid;
  let viewedMap = _getViewedCache(sid);
  // Combine test submission dates + viewed material dates
  const activityDates = new Set();
  tests.forEach(t => { if (t.submittedAt) activityDates.add(t.submittedAt.substring(0, 10)); });
  hw.forEach(h => { if (h.submittedAt) activityDates.add(h.submittedAt.substring(0, 10)); });

  // ── trial score prediction ──
  const bioTrials  = trials.filter(t => t.subject === 'Биология' && t.score != null).sort((a, b) => (a.createdAt || '') > (b.createdAt || '') ? 1 : -1);
  const chemTrials = trials.filter(t => t.subject === 'Химия'    && t.score != null).sort((a, b) => (a.createdAt || '') > (b.createdAt || '') ? 1 : -1);

  function predictEge(trialList) {
    if (!trialList.length) return null;
    const last = trialList[trialList.length - 1];
    const s = Number(last.score || 0);
    if (trialList.length < 2) return { val: s, lo: Math.max(0, s - 5), hi: Math.min(100, s + 8) };
    const prev = trialList[trialList.length - 2];
    const trend = s - Number(prev.score || 0);
    const predicted = Math.min(100, Math.max(0, Math.round(s + trend * 0.5)));
    return { val: predicted, lo: Math.max(0, predicted - 4), hi: Math.min(100, predicted + 5) };
  }

  const bioPred  = predictEge(bioTrials);
  const chemPred = predictEge(chemTrials);

  // ── avg class data (from all students, anonymised) ──
  const allTests  = load('tests')  || [];
  const allTrials = load('trials') || [];
  const allStudents = (load('users') || []).filter(u => u.role === 'student');
  const classCount  = allStudents.length || 1;

  function classAvg(subj, key) {
    const items = allTests.filter(t => t.subject === subj && t.score != null && t[key] != null);
    if (!items.length) return 0;
    return Math.round(items.reduce((s, t) => s + Number(t.score), 0) / items.length);
  }
  const bioClassAvg  = classAvg('Биология');
  const chemClassAvg = classAvg('Химия');

  const bioTopics  = topicData('Биология');
  const chemTopics = topicData('Химия');

  // ─────────────────────────────────────────────
  // HTML
  // ─────────────────────────────────────────────
  el.innerHTML = `

  <!-- TOP METRICS -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px">
    <div class="stat-card">
      <div class="stat-icon">🧪</div>
      <div class="stat-num" style="font-size:1.8rem">${bioTrials.length}</div>
      <div class="stat-label">Пробников Биол.</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">⚗️</div>
      <div class="stat-num" style="font-size:1.8rem">${chemTrials.length}</div>
      <div class="stat-label">Пробников Хим.</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📋</div>
      <div class="stat-num" style="font-size:1.8rem">${tests.length}</div>
      <div class="stat-label">Тестов сдано</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📚</div>
      <div class="stat-num" style="font-size:1.8rem">${content.length}</div>
      <div class="stat-label">Материалов</div>
    </div>
  </div>

  <!-- ROW 1: TOPIC PROGRESS + EGE PREDICTION -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">

    <!-- TOPIC PROGRESS -->
    <div class="card">
      <div class="card-title"><span class="dot"></span>📊 Прогресс по темам</div>
      <div style="display:flex;gap:0;border:1px solid var(--green-pale);border-radius:10px;overflow:hidden;width:fit-content;margin-bottom:14px">
        <button id="an-tab-bio" onclick="analyticsTabSwitch('bio')"
          style="padding:5px 14px;font-size:0.8rem;font-weight:600;cursor:pointer;border:none;background:var(--green-deep);color:#fff;font-family:Nunito,sans-serif">🌿 Биология</button>
        <button id="an-tab-chem" onclick="analyticsTabSwitch('chem')"
          style="padding:5px 14px;font-size:0.8rem;font-weight:600;cursor:pointer;border:none;background:transparent;color:var(--text3);font-family:Nunito,sans-serif">⚗️ Химия</button>
      </div>
      <div id="an-topic-chart-wrap" style="position:relative;width:100%;height:200px">
        <canvas id="an-topics-chart" role="img" aria-label="Прогресс по темам"></canvas>
      </div>
      <div id="an-topic-empty" style="display:none;text-align:center;padding:30px;color:var(--text3);font-size:0.88rem">
        Пока нет данных — сдайте несколько тестов с тегами
      </div>
    </div>

    <!-- EGE PREDICTION -->
    <div class="card">
      <div class="card-title"><span class="dot"></span>🎯 Прогноз ЕГЭ</div>

      ${bioPred ? `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:0.83rem;margin-bottom:5px">
          <span style="color:var(--text2);font-weight:600">🌿 Биология</span>
          <span style="font-weight:700;color:var(--green-deep)">${bioPred.val} б.</span>
        </div>
        <div style="height:10px;background:var(--green-xpale);border-radius:100px;overflow:hidden">
          <div style="height:100%;width:${bioPred.val}%;background:linear-gradient(90deg,var(--green-deep),var(--green-mid));border-radius:100px;transition:width .8s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text3);margin-top:3px"><span>0</span><span>Порог: 36</span><span>100</span></div>
      </div>` : `<div style="font-size:0.82rem;color:var(--text3);margin-bottom:14px;padding:10px;background:var(--bg2);border-radius:8px">🌿 Биология: нет пробников</div>`}

      ${chemPred ? `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:0.83rem;margin-bottom:5px">
          <span style="color:var(--text2);font-weight:600">⚗️ Химия</span>
          <span style="font-weight:700;color:var(--chem)">${chemPred.val} б.</span>
        </div>
        <div style="height:10px;background:var(--green-xpale);border-radius:100px;overflow:hidden">
          <div style="height:100%;width:${chemPred.val}%;background:linear-gradient(90deg,var(--chem),var(--green-light));border-radius:100px;transition:width .8s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text3);margin-top:3px"><span>0</span><span>Порог: 36</span><span>100</span></div>
      </div>` : `<div style="font-size:0.82rem;color:var(--text3);margin-bottom:14px;padding:10px;background:var(--bg2);border-radius:8px">⚗️ Химия: нет пробников</div>`}

      ${(bioTrials.length + chemTrials.length) > 1 ? `
      <div style="border-top:1px solid var(--green-xpale);padding-top:12px;margin-top:4px">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);margin-bottom:8px">Динамика пробников</div>
        <div id="an-trial-chart-wrap" style="position:relative;width:100%;height:120px">
          <canvas id="an-trial-chart" role="img" aria-label="Динамика пробников"></canvas>
        </div>
      </div>` : `
      <div style="border-top:1px solid var(--green-xpale);padding-top:10px;margin-top:4px;font-size:0.78rem;color:var(--text3);text-align:center">
        Сдайте хотя бы 2 пробника, чтобы увидеть динамику
      </div>`}

      ${(bioPred || chemPred) ? `
      <div style="margin-top:12px;border-top:1px solid var(--green-xpale);padding-top:10px">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);margin-bottom:6px">Прогноз к экзамену</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${bioPred ? `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;background:var(--green-xpale);color:var(--green-deep)">🌿 ${bioPred.lo}–${bioPred.hi} б.</span>` : ''}
          ${chemPred ? `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;background:#e8f8f0;color:var(--chem)">⚗️ ${chemPred.lo}–${chemPred.hi} б.</span>` : ''}
        </div>
      </div>` : ''}
    </div>
  </div>

  <!-- ACTIVITY HEATMAP -->
  <div class="card" style="margin-bottom:18px">
    <div class="card-title"><span class="dot"></span>🗓 Активность — последние 12 месяцев</div>
    <div id="an-heatmap"></div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.75rem;color:var(--text3)">
      <span>меньше</span>
      <div style="display:flex;gap:2px">
        <div style="width:11px;height:11px;border-radius:2px;background:var(--green-xpale)"></div>
        <div style="width:11px;height:11px;border-radius:2px;background:var(--green-pale)"></div>
        <div style="width:11px;height:11px;border-radius:2px;background:var(--green-light)"></div>
        <div style="width:11px;height:11px;border-radius:2px;background:var(--green-mid)"></div>
        <div style="width:11px;height:11px;border-radius:2px;background:var(--green-deep)"></div>
      </div>
      <span>больше</span>
    </div>
  </div>

  <!-- COMPARISON -->
  <div class="card">
    <div class="card-title"><span class="dot"></span>🏆 Сравнение с классом</div>
    <div style="position:relative;width:100%;height:240px">
      <canvas id="an-compare-chart" role="img" aria-label="Сравнение с классом"></canvas>
    </div>
    <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;font-size:0.78rem;color:var(--text3)">
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#40916c;display:inline-block"></span>Вы</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#aaa;display:inline-block"></span>Средний по классу</span>
    </div>
  </div>
  `;

  // ── Store topic data for tab switching ──
  window._anBioTopics  = bioTopics;
  window._anChemTopics = chemTopics;
  window._anCurrentSubj = 'bio';

  // ── Render topic chart ──
  _renderAnalyticsTopicChart('bio');

  // ── Trial dynamics chart ──
  const trialChartEl = document.getElementById('an-trial-chart');
  if (trialChartEl && (bioTrials.length + chemTrials.length) > 1) {
    const trialLabels = [];
    const bioScores   = [];
    const chemScores  = [];
    const maxLen = Math.max(bioTrials.length, chemTrials.length);
    for (let i = 0; i < maxLen; i++) {
      trialLabels.push('Проб. ' + (i + 1));
      bioScores.push(bioTrials[i]  ? Number(bioTrials[i].score  || 0) : null);
      chemScores.push(chemTrials[i] ? Number(chemTrials[i].score || 0) : null);
    }
    new Chart(trialChartEl, {
      type: 'line',
      data: {
        labels: trialLabels,
        datasets: [
          { label: 'Биология', data: bioScores,  borderColor: '#40916c', backgroundColor: 'rgba(64,145,108,0.1)',  tension: 0.3, pointRadius: 4, spanGaps: true },
          { label: 'Химия',    data: chemScores, borderColor: '#52b788', backgroundColor: 'rgba(82,183,136,0.08)', tension: 0.3, pointRadius: 4, borderDash: [4, 3], spanGaps: true }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { min: 0, max: 100, grid: { color: 'rgba(128,128,128,.1)' }, ticks: { font: { size: 10 }, callback: v => v + 'б' } }
        }
      }
    });
  }

  // ── Activity heatmap ──
  _renderAnalyticsHeatmap(activityDates);

  // ── Comparison radar chart ──
  const compareEl = document.getElementById('an-compare-chart');
  if (compareEl) {
    const myBioAvg  = subjectStats['Биология'].avgScore;
    const myChemAvg = subjectStats['Химия'].avgScore;
    const myHWdone  = Math.round(hw.filter(h => h.submitted).length / (hw.length || 1) * 100);
    const myTrialAvg= trials.length ? Math.round(trials.reduce((s, t) => s + Number(t.score || 0), 0) / trials.length) : 0;
    const myMatsViewed = content.length ? Math.round(Object.keys(viewedMap).filter(k => content.find(c => c.id === k)).length / content.length * 100) : 0;

    const classHWdone = 60; // baseline placeholder
    new Chart(compareEl, {
      type: 'radar',
      data: {
        labels: ['Биология', 'Химия', 'Выполнение ДЗ', 'Пробники', 'Материалы'],
        datasets: [
          {
            label: 'Вы',
            data: [myBioAvg, myChemAvg, myHWdone, myTrialAvg, myMatsViewed],
            borderColor: '#40916c', backgroundColor: 'rgba(64,145,108,0.12)',
            pointBackgroundColor: '#40916c', borderWidth: 2, pointRadius: 4
          },
          {
            label: 'Средний',
            data: [bioClassAvg || 55, chemClassAvg || 52, classHWdone, 55, 60],
            borderColor: '#aaa', backgroundColor: 'rgba(170,170,170,0.08)',
            pointBackgroundColor: '#aaa', borderDash: [4, 3], borderWidth: 1.5, pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { font: { size: 9 }, stepSize: 25, callback: v => v + '%' },
            pointLabels: { font: { size: 11 } },
            grid: { color: 'rgba(128,128,128,.15)' }
          }
        }
      }
    });
  }
}

function analyticsTabSwitch(subj) {
  window._anCurrentSubj = subj;
  const btnBio  = document.getElementById('an-tab-bio');
  const btnChem = document.getElementById('an-tab-chem');
  if (!btnBio || !btnChem) return;
  const green = 'var(--green-deep)', white = '#fff', trans = 'transparent', gray = 'var(--text3)';
  if (subj === 'bio') {
    btnBio.style.background = green; btnBio.style.color = white;
    btnChem.style.background = trans; btnChem.style.color = gray;
  } else {
    btnChem.style.background = green; btnChem.style.color = white;
    btnBio.style.background = trans; btnBio.style.color = gray;
  }
  _renderAnalyticsTopicChart(subj);
}

function _renderAnalyticsTopicChart(subj) {
  const topics = subj === 'bio' ? (window._anBioTopics || []) : (window._anChemTopics || []);
  const wrap = document.getElementById('an-topic-chart-wrap');
  const empty = document.getElementById('an-topic-empty');
  if (!wrap || !empty) return;

  // Destroy old chart if exists
  const oldCanvas = document.getElementById('an-topics-chart');
  if (oldCanvas && oldCanvas._chartInst) { oldCanvas._chartInst.destroy(); }
  if (!topics.length) {
    wrap.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  wrap.style.display = 'block';
  empty.style.display = 'none';

  const canvas = document.getElementById('an-topics-chart');
  if (!canvas) return;
  const inst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: topics.map(t => t.tag.length > 14 ? t.tag.substring(0, 13) + '…' : t.tag),
      datasets: [{
        label: 'Средний балл',
        data: topics.map(t => t.avg),
        backgroundColor: topics.map(t => t.avg >= 75 ? 'rgba(64,145,108,0.8)' : t.avg >= 50 ? 'rgba(212,160,23,0.8)' : 'rgba(192,57,43,0.75)'),
        borderWidth: 0, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` Балл: ${ctx.parsed.y}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { min: 0, max: 100, grid: { color: 'rgba(128,128,128,.1)' }, ticks: { font: { size: 10 }, callback: v => v + 'б' } }
      }
    }
  });
  canvas._chartInst = inst;
}

function _renderAnalyticsHeatmap(activityDates) {
  const wrap = document.getElementById('an-heatmap');
  if (!wrap) return;

  const today = new Date();
  const yearAgo = new Date(today);
  yearAgo.setFullYear(today.getFullYear() - 1);

  // Align to Monday
  const startDay = new Date(yearAgo);
  const dow = (startDay.getDay() + 6) % 7;
  startDay.setDate(startDay.getDate() - dow);

  const COLS = 53;
  const COLORS = ['var(--green-xpale)', 'var(--green-pale)', 'var(--green-light)', 'var(--green-mid)', 'var(--green-deep)'];
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const DAY_LABELS = ['', 'Пн', '', 'Ср', '', 'Пт', ''];

  // Month header
  let monthHtml = '<div style="display:grid;grid-template-columns:22px repeat(53,1fr);gap:2px;margin-bottom:2px">';
  monthHtml += '<div></div>';
  let lastM = -1;
  for (let w = 0; w < COLS; w++) {
    const d = new Date(startDay); d.setDate(d.getDate() + w * 7);
    const m = d.getMonth();
    monthHtml += `<div style="font-size:9px;color:var(--text3)">${m !== lastM ? months[m] : ''}</div>`;
    lastM = m;
  }
  monthHtml += '</div>';

  // Grid
  let gridHtml = '<div style="display:grid;grid-template-columns:22px repeat(53,1fr);gap:2px">';
  for (let row = 0; row < 7; row++) {
    gridHtml += `<div style="font-size:9px;color:var(--text3);display:flex;align-items:center;justify-content:flex-end;padding-right:3px">${DAY_LABELS[row]}</div>`;
    for (let col = 0; col < COLS; col++) {
      const d = new Date(startDay); d.setDate(d.getDate() + col * 7 + row);
      const ds = d.toISOString().substring(0, 10);
      const inRange = d >= yearAgo && d <= today;
      const active = activityDates.has(ds);
      const level = !inRange ? -1 : active ? 3 : 0;
      const color = level < 0 ? 'transparent' : COLORS[level];
      const title = inRange ? (active ? ds + ': активно' : ds) : '';
      gridHtml += `<div style="height:11px;border-radius:2px;background:${color};cursor:default" title="${title}"></div>`;
    }
  }
  gridHtml += '</div>';

  wrap.innerHTML = monthHtml + gridHtml;
}

// ═══════════════════════════════════════════════
// ВИДЕОТРЕКИНГ — временные метки и прогресс просмотра
// ═══════════════════════════════════════════════

const _VIDEO_PROGRESS_KEY = 'biohim_video_progress';
const _videoProgressCache = {};

function _getVideoProgressMap() {
  return _videoProgressCache;
}

function _getVideoProgress(vidId) {
  if (!currentUser) return 0;
  return _videoProgressCache[currentUser.id + '_' + vidId] || 0;
}

function _saveVideoProgress(vidId, pct) {
  if (!currentUser) return;
  const key = currentUser.id + '_' + vidId;
  const prev = _videoProgressCache[key] || 0;
  if (pct > prev) {
    _videoProgressCache[key] = Math.min(100, Math.round(pct));
    _fbInit().ref('db/video_progress/' + currentUser.id + '/' + vidId)
      .set(_videoProgressCache[key])
      .catch(e => console.error('[Firebase] video_progress save', e));
    // Update progress bar in DOM
    const bar = document.getElementById('vp_' + vidId);
    const txt = document.getElementById('vp_' + vidId + '_txt');
    if (bar) bar.style.width = _videoProgressCache[key] + '%';
    if (txt) txt.textContent = _videoProgressCache[key] + '%';
    // If >= 90% — mark lesson as viewed too
    if (_videoProgressCache[key] >= 90 && currentUser.role === 'student') {
      const container = bar ? bar.closest('[data-video-id]') : null;
      const accItem = container ? container.closest('.accordion-item') : null;
      if (accItem) {
        const cid = accItem.getAttribute('data-content-id');
        if (cid) {
          const viewed = _getViewedCache(currentUser.id);
          if (!viewed[cid]) {
            viewed[cid] = true;
            _saveViewed(currentUser.id, viewed);
          }
        }
      }
    }
  }
}

function _tsToSeconds(ts) {
  if (!ts) return 0;
  ts = String(ts).trim();
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return parts[0] || 0;
}

// Called by timestamp buttons — jumps iframe to given second
function videoJumpTo(btn, seconds) {
  const wrap = btn.closest('[data-video-id]');
  if (!wrap) return;
  const vidId = wrap.getAttribute('data-video-id');
  const iframe = document.getElementById('iframe_' + vidId);
  if (!iframe) return;
  const src = iframe.src;
  // YouTube postMessage seek
  if (src.includes('youtube') || src.includes('youtu')) {
    try {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [seconds, true]
      }), '*');
      // Also ensure playing
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'playVideo',
        args: []
      }), '*');
    } catch(e) {}
    return;
  }
  // Vimeo postMessage seek
  if (src.includes('vimeo')) {
    try {
      iframe.contentWindow.postMessage(JSON.stringify({
        method: 'setCurrentTime',
        value: seconds
      }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({
        method: 'play'
      }), '*');
    } catch(e) {}
    return;
  }
  // Generic: reload with t= param for VK / Google Drive etc.
  const base = src.split('?')[0];
  const params = new URLSearchParams(src.includes('?') ? src.split('?')[1] : '');
  params.set('t', seconds);
  params.set('start', seconds);
  iframe.src = base + '?' + params.toString();
}

// Poll YouTube iframes for progress via postMessage
(function _initVideoTracking() {
  // Listen for YouTube / Vimeo API messages
  window.addEventListener('message', function(e) {
    try {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (!data) return;

      // YouTube: { event: 'infoDelivery', info: { currentTime, duration } }
      if (data.event === 'infoDelivery' && data.info) {
        const { currentTime, duration } = data.info;
        if (duration && currentTime) {
          const pct = (currentTime / duration) * 100;
          // Find which iframe sent this
          const iframes = document.querySelectorAll('iframe[id^="iframe_"]');
          iframes.forEach(iframe => {
            try {
              if (iframe.contentWindow === e.source) {
                const vidId = iframe.id.replace('iframe_', '');
                _saveVideoProgress(vidId, pct);
              }
            } catch(ex) {}
          });
        }
      }
      // Vimeo: { event: 'timeupdate', data: { percent } }
      if (data.event === 'timeupdate' && data.data && data.data.percent != null) {
        const pct = data.data.percent * 100;
        const iframes = document.querySelectorAll('iframe[id^="iframe_"]');
        iframes.forEach(iframe => {
          try {
            if (iframe.contentWindow === e.source) {
              const vidId = iframe.id.replace('iframe_', '');
              _saveVideoProgress(vidId, pct);
            }
          } catch(ex) {}
        });
      }
    } catch(ex) {}
  });

  // Poll YouTube iframes every 5s — request current time
  setInterval(function() {
    document.querySelectorAll('iframe[id^="iframe_"]').forEach(iframe => {
      const src = iframe.src || '';
      if (src.includes('youtube') || src.includes('youtu')) {
        try {
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'listening',
            id: 1
          }), '*');
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'getPlayerState',
            args: []
          }), '*');
        } catch(ex) {}
      }
      if (src.includes('vimeo')) {
        try {
          iframe.contentWindow.postMessage(JSON.stringify({
            method: 'getCurrentTime'
          }), '*');
          iframe.contentWindow.postMessage(JSON.stringify({
            method: 'getDuration'
          }), '*');
        } catch(ex) {}
      }
    });
  }, 5000);
})();

// ═══════════════════════════════════════════════════════════════
// СИСТЕМА ЦЕЛЕЙ ЕГЭ
// ═══════════════════════════════════════════════════════════════

const GOALS_KEY = 'biohim_goals_';
const _goalsCache = {};

function _loadGoals(sid) {
  return _goalsCache[sid] || {};
}
function _saveGoals(sid, data) {
  _goalsCache[sid] = data;
  _fbInit().ref('db/goals/'+sid).set(data)
    .catch(e => console.error('[Firebase] goals save', e));
}

/**
 * Расчёт текущего «балла» ученика по результатам тестов и пробников.
 * Возвращает { bio: number|null, chem: number|null, overall: number|null }
 */
function _calcCurrentScore(sid) {
  const tests  = (load('tests')  || []).filter(t => t.studentId === sid && t.submitted && t.autoTotal);
  const trials = (load('trials') || []).filter(t => t.studentId === sid && t.submitted && t.autoTotal);

  const bio  = [...tests, ...trials].filter(t => (t.subject||'').includes('Биол'));
  const chem = [...tests, ...trials].filter(t => (t.subject||'').includes('Хим'));
  const all  = [...tests, ...trials];

  const avg = arr => arr.length
    ? Math.round(arr.reduce((s, t) => s + Math.round((t.autoScore||0) / t.autoTotal * 100), 0) / arr.length)
    : null;

  return { bio: avg(bio), chem: avg(chem), overall: avg(all) };
}

/**
 * Подсказки «что подтянуть для +5 баллов».
 * Смотрим пробники с низкими баллами по темам / разделам.
 */
function _buildGoalHints(sid, targetPct) {
  const tests  = (load('tests')  || []).filter(t => t.studentId === sid && t.submitted);
  const trials = (load('trials') || []).filter(t => t.studentId === sid && t.submitted);
  const hw     = (load('hw')     || []).filter(h => h.studentId === sid && !h.submitted);

  const hints = [];

  // 1. Непроверенные/несданные ДЗ
  if (hw.length > 0) {
    hints.push({ icon: '✏️', text: `Сдать ${hw.length} несданных домашних задания — каждое повторение закрепляет навык` });
  }

  // 2. Пробники ниже цели
  const weakTrials = trials.filter(t => {
    const pct = t.autoTotal ? Math.round((t.autoScore||0) / t.autoTotal * 100) : 0;
    return pct < (targetPct - 5);
  });
  if (weakTrials.length > 0) {
    const titles = weakTrials.slice(0, 2).map(t => t.title).join(', ');
    hints.push({ icon: '🎯', text: `Разобрать ошибки в пробниках: ${titles}` });
  }

  // 3. Темы из тестов с низким процентом
  const tagScore = {};
  tests.forEach(t => {
    const tag = t.subject || t.title || 'Общее';
    if (!tagScore[tag]) tagScore[tag] = { sum: 0, n: 0 };
    const pct = t.autoTotal ? Math.round((t.autoScore||0) / t.autoTotal * 100) : 0;
    tagScore[tag].sum += pct;
    tagScore[tag].n++;
  });
  const weakTags = Object.entries(tagScore)
    .map(([tag, v]) => ({ tag, avg: Math.round(v.sum / v.n) }))
    .filter(x => x.avg < 70)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 2);

  weakTags.forEach(x => {
    hints.push({ icon: '📖', text: `Повторить тему «${x.tag}» — средний балл ${x.avg}%` });
  });

  // 4. Умное повторение
  const srData = getSRData ? getSRData(sid) : {};
  const content = (load('content') || []).filter(c => c.studentId === sid && c.type === 'theory');
  const today = new Date().toISOString().slice(0, 10);
  const dueCount = content.filter(c => {
    const sr = srData[c.id];
    return !sr || !sr.nextDue || sr.nextDue <= today;
  }).length;
  if (dueCount > 0) {
    hints.push({ icon: '🧠', text: `Выполнить умное повторение — ${dueCount} материалов ждут` });
  }

  if (hints.length === 0) {
    hints.push({ icon: '🌟', text: 'Отличная работа! Продолжай в том же темпе и регулярно проходи пробники' });
    hints.push({ icon: '📊', text: 'Разбирай каждый пробник после сдачи — анализ ошибок даёт +3–7 баллов' });
  }

  return hints.slice(0, 4);
}

function renderStudentGoals(containerId) {
  const sid = currentUser.id;
  const el  = document.getElementById(containerId || 'page-student-goals');
  if (!el) return;

  const goals   = _loadGoals(sid);
  const current = _calcCurrentScore(sid);

  // Предметы ученика
  const user = (load('users') || []).find(u => u.id === sid) || {};
  const subj = user.subject || '';
  const isBio  = subj.includes('Биол');
  const isChem = subj.includes('Хим');
  const isBoth = isBio && isChem;
  const subjects = isBoth ? ['Биология', 'Химия'] : isBio ? ['Биология'] : isChem ? ['Химия'] : ['Биология'];

  // Целевые баллы
  const targetBio  = goals.targetBio  || null;
  const targetChem = goals.targetChem || null;

  // Прогресс-бар
  const bar = (cur, target, color) => {
    if (cur === null) return '<div style="font-size:0.82rem;color:var(--text3)">Нет данных (сдайте хотя бы один тест)</div>';
    const pct = target ? Math.min(100, Math.round(cur / target * 100)) : cur;
    const bg = color || 'var(--green-mid)';
    return `<div style="margin-top:6px">
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text2);margin-bottom:4px">
        <span>Сейчас: <b style="color:var(--accent)">${cur}%</b></span>
        ${target ? `<span>Цель: <b style="color:${bg}">${target}%</b></span>` : ''}
      </div>
      <div style="height:14px;background:var(--green-xpale);border-radius:99px;overflow:hidden;position:relative">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,${bg},${bg}cc);border-radius:99px;transition:width 0.6s ease"></div>
        ${target && cur >= target ? '<div style="position:absolute;right:8px;top:0;height:100%;display:flex;align-items:center;font-size:0.65rem;font-weight:700;color:#fff">🎉</div>' : ''}
      </div>
      <div style="font-size:0.74rem;color:var(--text3);margin-top:4px">
        ${target ? (cur >= target ? '🎉 Цель достигнута!' : `Осталось ${target - cur} п.п. до цели`) : 'Установите целевой балл'}
      </div>
    </div>`;
  };

  // Подсказки
  const targetForHints = (targetBio || targetChem || 80);
  const hints = _buildGoalHints(sid, targetForHints);
  const hintsHTML = hints.map(h => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:var(--bg);border-radius:10px;border:1px solid var(--green-xpale)">
      <span style="font-size:1.2rem;flex-shrink:0">${h.icon}</span>
      <span style="font-size:0.88rem;color:var(--text2);line-height:1.5">${esc(h.text)}</span>
    </div>`).join('');

  // Мотивационный статус
  const overallPct = current.overall;
  let motivMsg = '', motivColor = 'var(--green-deep)';
  if (overallPct === null) {
    motivMsg = '📝 Сдайте первый тест, чтобы увидеть свой прогресс';
    motivColor = 'var(--text3)';
  } else if (overallPct >= 90) {
    motivMsg = '🏆 Превосходный результат! Ты на пути к высшему баллу';
  } else if (overallPct >= 75) {
    motivMsg = '💪 Хороший прогресс! Ещё немного усилий — и цель будет достигнута';
  } else if (overallPct >= 55) {
    motivMsg = '📈 Движение есть! Сосредоточься на слабых темах';
  } else {
    motivMsg = '🌱 Хорошее начало! Регулярные занятия дадут результат';
    motivColor = '#e07b00';
  }

  const content = el.querySelector('.page-content') || el;
  const wrap = el.querySelector('.page-content') || el;
  wrap.innerHTML = `
  <div style="max-width:760px">

    <!-- Заголовок -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;flex-wrap:wrap">
      <div>
        <h2 style="font-family:'Playfair Display',serif;font-size:1.7rem;color:var(--accent);margin-bottom:2px">🎯 Цели ЕГЭ</h2>
        <div style="font-size:0.85rem;color:var(--text3)">Установи целевой балл и отслеживай прогресс</div>
      </div>
    </div>

    <!-- Мотивационный баннер -->
    <div style="background:linear-gradient(135deg,var(--green-xpale),var(--bg));border:1.5px solid var(--green-pale);border-radius:var(--radius);padding:16px 20px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
      <div style="font-size:2rem;flex-shrink:0">${overallPct !== null ? (overallPct >= 75 ? '🚀' : overallPct >= 55 ? '💪' : '🌱') : '📝'}</div>
      <div>
        <div style="font-weight:700;font-size:1rem;color:${motivColor}">${motivMsg}</div>
        ${overallPct !== null ? `<div style="font-size:0.78rem;color:var(--text3);margin-top:2px">Средний балл по всем работам: <b>${overallPct}%</b></div>` : ''}
      </div>
    </div>

    <!-- Установка целей -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-title"><span class="dot"></span>🎯 Целевой балл ЕГЭ</div>
      <div style="font-size:0.83rem;color:var(--text3);margin-bottom:16px">Укажите желаемый процент выполнения по каждому предмету (например, 85 = 85%)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">

        ${isBio ? `
        <div style="background:var(--bg);border-radius:12px;padding:16px;border:1.5px solid var(--green-pale)">
          <div style="font-weight:700;color:var(--green-deep);margin-bottom:10px;display:flex;align-items:center;gap:6px">🌿 Биология</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <input type="number" id="goals-target-bio" min="1" max="100" value="${targetBio || ''}"
              placeholder="Цель %"
              style="width:90px;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:1rem;font-weight:700;text-align:center;color:var(--accent)">
            <span style="font-size:0.85rem;color:var(--text3)">% от максимума</span>
          </div>
          ${bar(current.bio ?? current.overall, targetBio, '#40916c')}
        </div>` : ''}

        ${(isChem || isBoth) ? `
        <div style="background:var(--bg);border-radius:12px;padding:16px;border:1.5px solid var(--green-pale)">
          <div style="font-weight:700;color:var(--chem);margin-bottom:10px;display:flex;align-items:center;gap:6px">⚗️ Химия</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <input type="number" id="goals-target-chem" min="1" max="100" value="${targetChem || ''}"
              placeholder="Цель %"
              style="width:90px;padding:8px 12px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:1rem;font-weight:700;text-align:center;color:var(--accent)">
            <span style="font-size:0.85rem;color:var(--text3)">% от максимума</span>
          </div>
          ${bar(current.chem ?? current.overall, targetChem, '#52b788')}
        </div>` : ''}

      </div>
      <button class="btn btn-green" style="margin-top:16px" onclick="saveStudentGoals()">💾 Сохранить цель</button>
    </div>

    <!-- Трекер прогресса -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-title"><span class="dot"></span>📊 Трекер прогресса</div>
      ${_renderGoalsProgressTracker(sid, goals, current)}
    </div>

    <!-- Подсказки +5 баллов -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-title"><span class="dot"></span>💡 Что подтянуть для +5 баллов?</div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:12px">Персональные рекомендации на основе твоих результатов</div>
      <div style="display:flex;flex-direction:column;gap:8px">${hintsHTML}</div>
    </div>

  </div>`;
}

function _renderGoalsProgressTracker(sid, goals, current) {
  const tests  = (load('tests')  || []).filter(t => t.studentId === sid && t.submitted && t.autoTotal).slice(-10);
  const trials = (load('trials') || []).filter(t => t.studentId === sid && t.submitted && t.autoTotal).slice(-5);

  if (!tests.length && !trials.length) {
    return '<div class="empty-state" style="padding:20px 0"><div class="big">📊</div><p>Нет данных — сдайте первый тест</p></div>';
  }

  const targetBio  = goals.targetBio  || null;
  const targetChem = goals.targetChem || null;

  const rows = [...tests, ...trials].slice(-8).reverse().map(item => {
    const pct     = Math.round((item.autoScore || 0) / item.autoTotal * 100);
    const target  = item.subject && item.subject.includes('Хим') ? targetChem : targetBio;
    const met     = target ? pct >= target : null;
    const barW    = pct;
    const barColor = pct >= 80 ? '#27ae60' : pct >= 60 ? '#e07b00' : '#c0392b';
    const icon    = item.sections ? '🎯' : '📋';
    return `<div style="display:grid;grid-template-columns:24px 1fr 80px 64px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--green-xpale)">
      <span style="font-size:1rem">${icon}</span>
      <div>
        <div style="font-size:0.85rem;font-weight:600;color:var(--accent)">${esc((item.title||'').substring(0, 36))}${(item.title||'').length > 36 ? '…' : ''}</div>
        <div style="height:6px;background:var(--green-xpale);border-radius:99px;overflow:hidden;margin-top:4px">
          <div style="width:${barW}%;height:100%;background:${barColor};border-radius:99px;transition:width 0.5s ease"></div>
        </div>
      </div>
      <div style="text-align:center;font-size:1rem;font-weight:800;color:${barColor}">${pct}%</div>
      <div style="text-align:right">
        ${met === true  ? '<span class="badge badge-green" style="font-size:0.7rem">✅ Цель</span>' : ''}
        ${met === false ? `<span class="badge badge-red" style="font-size:0.7rem">-${target - pct}п.п.</span>` : ''}
        ${met === null  ? '<span class="badge" style="font-size:0.7rem;background:var(--bg)">—</span>' : ''}
      </div>
    </div>`;
  }).join('');

  const targetLine = (targetBio || targetChem)
    ? `<div style="font-size:0.78rem;color:var(--text3);margin-bottom:10px">Целевой балл: ${targetBio ? `🌿 Биология ${targetBio}%` : ''} ${targetChem ? `⚗️ Химия ${targetChem}%` : ''}</div>`
    : '';

  return `${targetLine}<div>${rows}</div>`;
}

function saveStudentGoals() {
  const sid  = currentUser.id;
  const goals = _loadGoals(sid);
  const bioEl  = document.getElementById('goals-target-bio');
  const chemEl = document.getElementById('goals-target-chem');
  if (bioEl) {
    const v = parseInt(bioEl.value);
    if (v > 0 && v <= 100) goals.targetBio = v;
    else delete goals.targetBio;
  }
  if (chemEl) {
    const v = parseInt(chemEl.value);
    if (v > 0 && v <= 100) goals.targetChem = v;
    else delete goals.targetChem;
  }
  _saveGoals(sid, goals);
  showNotif('✅ Цель сохранена!');
  renderStudentGoals();
}
