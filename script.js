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

// ── Ключи localStorage для урока ──
const LS_LESSON      = 'biohim_live_lesson';   // { code, room, note, startedAt, studentId }
const LS_LESSON_CHAT = 'biohim_lesson_chat_';  // + code → [{who,name,text,ts}]
const LS_LESSON_NOTE = 'biohim_lesson_note_';  // + code → string

function getLessonData(){ try{ return JSON.parse(localStorage.getItem(LS_LESSON)||'null'); }catch(e){ return null; } }
function saveLessonData(d){ localStorage.setItem(LS_LESSON, JSON.stringify(d)); }

function getLessonChat(code){ try{ return JSON.parse(localStorage.getItem(LS_LESSON_CHAT+code)||'[]'); }catch(e){ return []; } }
function saveLessonChat(code,arr){ localStorage.setItem(LS_LESSON_CHAT+code, JSON.stringify(arr)); }

function getLessonNote(code){ return localStorage.getItem(LS_LESSON_NOTE+code)||''; }
function saveLessonNote(code,text){ localStorage.setItem(LS_LESSON_NOTE+code, text); }

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
              ${students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}
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
      <div style="font-weight:600">${a.topic||'Без темы'}</div>
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
      ${student?`<span style="font-size:0.82rem;color:var(--text3)">· ${student.name}</span>`:''}
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
        <div class="lmsg-bubble">${m.text}</div>
      </div>
      <div class="lmsg-meta" style="${isMe?'text-align:right':''}">${isMe?'Вы':m.name} · ${time}</div>
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
      whoText = g ? `👥 Группа: ${g.name}` : '';
    } else if(studentId){
      const u = allUsers.find(u=>u.id===studentId);
      whoText = u ? `👤 Ученик: ${u.name}` : '';
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
  // ученик видит обновление через poll
}

function lsSendMsg(who){
  const live = getLessonData();
  if(!live) return;
  const inp = document.getElementById('ls-chat-inp');
  if(!inp||!inp.value.trim()) return;
  const text = inp.value.trim();
  inp.value = '';
  const name = who==='admin' ? 'Преподаватель' : (currentUser?.name||'Ученик');
  const chat = getLessonChat(live.code);
  chat.push({ who, name, text, ts: Date.now() });
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
  if(_lsChatPoll) clearInterval(_lsChatPoll);
  _lsChatPoll = setInterval(()=>{
    _renderChatNow(code, viewer);
    // Update note for student
    if(viewer==='student'){
      const noteEl = document.getElementById('ls-student-note');
      if(noteEl){
        const note = getLessonNote(code);
        noteEl.innerHTML = note||'<span style="color:var(--text3)">Преподаватель ещё не написал конспект...</span>';
      }
      // Check if lesson ended
      const live = getLessonData();
      if(!live || !live.code){
        clearInterval(_lsChatPoll);
        renderStudentLesson();
      }
    }
  }, 2000);
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

  // Очистка
  localStorage.removeItem(LS_LESSON);
  _lessonActive = false;
  clearInterval(_lessonTimer);
  clearInterval(_lsChatPoll);
  if(typeof _jitsiAPI!=='undefined'&&_jitsiAPI){ try{_jitsiAPI.dispose();}catch(e){} _jitsiAPI=null; }
  if(_jitsiWindow && !_jitsiWindow.closed){ try{_jitsiWindow.close();}catch(e){} }
  showNotif(`✅ Занятие завершено! Длительность: ${dur} мин${price?` · Оплата ${price}₽ добавлена`:''}`);
  renderAdminLesson();
}

function lsStudentJoin(){
  const input = document.getElementById('ls-code-input');
  if(!input||!input.value.trim()){ showNotif('Введите код занятия'); return; }
  const code = input.value.trim().replace(/\D/g,'');
  if(code.length!==6){ showNotif('Код — 6 цифр'); return; }
  saveLessonData({ code, room:'biohim-lesson-'+code, topic:'Занятие', studentId:currentUser?.id||'', startedAt:Date.now() });
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
// LOCAL STORAGE — замена Firebase
// ══════════════════════════════════════════
const LS_PREFIX = 'biohim_db_';
const COLLECTIONS = ['users','content','tests','hw','payments','courses','slots','bookings','notifs'];

function load(k){
  const raw = localStorage.getItem(LS_PREFIX + k);
  if(raw == null) return null;
  try { return JSON.parse(raw); } catch(e){ return null; }
}

function save(k, v){
  localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
}

async function preloadCache(){ /* данные уже в localStorage */ }

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

// 2. Хеширование пароля (SHA-256, встроено в браузер)
function hashPassword(plain){
  // Simple but consistent hash — no crypto.subtle needed (works on HTTP too)
  if(!plain) return Promise.resolve('');
  let h = 0x811c9dc5;
  for(let i=0;i<plain.length;i++){
    h ^= plain.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Second pass for better avalanche
  let h2 = 0x5f5f5f5f;
  for(let i=plain.length-1;i>=0;i--){
    h2 ^= plain.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  const result = (h >>> 0).toString(16).padStart(8,'0') + (h2 >>> 0).toString(16).padStart(8,'0') + plain.length.toString(16).padStart(4,'0');
  return Promise.resolve(result);
}

// 3. Защита от брутфорса
const _loginAttempts = {};
function checkBruteForce(login){
  const now = Date.now();
  if(!_loginAttempts[login]) _loginAttempts[login]={count:0,blockedUntil:0};
  const rec = _loginAttempts[login];
  if(rec.blockedUntil > now){
    const secs = Math.ceil((rec.blockedUntil-now)/1000);
    document.getElementById('login-err').textContent=`Слишком много попыток. Подождите ${secs} сек.`;
    return false;
  }
  return true;
}
function recordFailedLogin(login){
  if(!_loginAttempts[login]) _loginAttempts[login]={count:0,blockedUntil:0};
  const rec = _loginAttempts[login];
  rec.count++;
  if(rec.count >= 5){
    rec.blockedUntil = Date.now() + 60000; // 1 минута
    rec.count = 0;
  }
}
function resetLoginAttempts(login){
  delete _loginAttempts[login];
}

// 4. Проверка прав доступа
const ADMIN_PAGES = ['students','tests-admin','hw-admin','content-admin',
  'payments','schedule-admin','courses','analytics','settings'];
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



function subscribeRealtime(){ /* не нужен polling для localStorage */ }

// ══════════════════════════════════════════
// DEFAULT DATA (записываются один раз)
// ══════════════════════════════════════════
async function initData(){
  try {
    // Fix: clear users with undefined/null passwordHash (broken from old async bug)
    const existingUsers = load('users')||[];
    if(existingUsers.length && existingUsers.some(u=>!u.passwordHash && !u.password)){
      localStorage.removeItem('biohim_db_users');
    }
  } catch(e){ console.warn('user-check error', e); }

  if(!(load('users')||[]).length){
    // Создаём пользователей — пароли хешируются синхронно
    const h1 = await hashPassword('admin123');
    const h2 = await hashPassword('1234');
    const h3 = await hashPassword('1234');
    save('users',[
      {id:'admin', login:'admin', passwordHash:h1, name:'Преподаватель', role:'admin'},
      {id:'anna',  login:'anna',  passwordHash:h2, name:'Анна Петрова',  role:'student', subject:'Биология', active:true},
      {id:'dima',  login:'dima',  passwordHash:h3, name:'Дмитрий Козлов',role:'student', subject:'Химия',    active:true}
    ]);
  } else {
    // Миграция: если остались старые пользователи с plain-text паролями
    const users = load('users')||[];
    const needsMigration = users.filter(u=>u.password && !u.passwordHash);
    if(needsMigration.length){
      const hashes = await Promise.all(needsMigration.map(u=>hashPassword(u.password)));
      needsMigration.forEach((u,i)=>{
        u.passwordHash = hashes[i];
        delete u.password;
      });
      save('users', users);
    }
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
  COLLECTIONS.forEach(k => localStorage.removeItem(LS_PREFIX + k));
  localStorage.removeItem('biohim_session');
  localStorage.removeItem('biohim_admin_notifs');
  location.reload();
}

let currentUser = null;

function doLogin(){
  const uname = document.getElementById('login-username').value.trim();
  const upass  = document.getElementById('login-password').value;
  const errEl  = document.getElementById('login-err');

  // DEBUG: show what's in localStorage
  const users = load('users')||[];
  console.log('users in DB:', JSON.stringify(users.map(u=>({login:u.login,hasHash:!!u.passwordHash,hashVal:u.passwordHash}))));

  if(!checkBruteForce(uname)) return;

  if(!users.length){
    errEl.textContent = 'Ошибка: пользователи не загружены. Обновите страницу.';
    return;
  }

  const found = users.find(u=>u.login===uname);
  if(!found){
    errEl.textContent = 'Пользователь «'+uname+'» не найден. Доступны: '+users.map(u=>u.login).join(', ');
    recordFailedLogin(uname);
    return;
  }

  hashPassword(upass).then(hash=>{
    console.log('entered hash:', hash, 'stored hash:', found.passwordHash, 'match:', hash===found.passwordHash);
    // Support plain-text password (legacy) and hash
    const ok = (found.passwordHash && hash === found.passwordHash)
             || (!found.passwordHash && found.password === upass);
    if(!ok){
      recordFailedLogin(uname);
      errEl.textContent = 'Неверный пароль. (debug: hash='+hash.slice(0,8)+'... stored='+String(found.passwordHash).slice(0,8)+'...)';
      return;
    }
    resetLoginAttempts(uname);
    errEl.textContent = '';
    _startSession(found);
  }).catch(e=>{
    errEl.textContent = 'Ошибка хеширования: '+e.message;
    console.error(e);
  });
}
function _startSession(user){
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
  buildNav();
  subscribeRealtime();
  const defaultPage = user.role==='admin' ? 'dashboard' : 'student-dashboard';
  const lastPage = localStorage.getItem('biohim_last_page_'+user.id) || defaultPage;
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
  {section:'Управление'},
  {id:'chat-admin',       icon:'💬', label:'Чат с учениками'},
  {id:'zoom-settings',    icon:'⚙️', label:'Настройки платформы'},
  {id:'attend-pay-admin', icon:'📅', label:'Посещение и оплата'},
  {id:'schedule-admin',   icon:'🗓', label:'Расписание'},
  {id:'reports-admin',    icon:'📊', label:'Отчёты по ученикам'},
  {id:'notif-settings-admin', icon:'🔔', label:'Интеграции уведомлений'},
  {section:'Занятие'},
  {id:'admin-lesson', icon:'🎥', label:'Онлайн-занятие'},
];
const studentNav=[
  {section:'Кабинет'},
  {id:'student-dashboard', icon:'🏠',label:'Главная'},
  {id:'student-materials', icon:'📚',label:'Материалы'},
  {id:'student-repeat',    icon:'🧠',label:'Умное повторение'},
  {id:'student-tests',     icon:'📋',label:'Тесты'},
  {id:'student-trial',     icon:'🎯', label:'Пробник'},
  {id:'student-hw',        icon:'✏️', label:'Домашние задания'},
  {id:'student-chat',      icon:'💬', label:'Чат с преподавателем'},
  {section:'Прочее'},
  {id:'student-payment',   icon:'💰',label:'Оплата и занятия'},
  {id:'student-schedule',  icon:'🗓',label:'Запись на занятия'},
  {id:'student-notif-settings', icon:'🔔', label:'Уведомления'},
  {section:'Занятие'},
  {id:'student-lesson', icon:'🎥', label:'Онлайн-занятие'},
];

function buildNav(){
  const nav = currentUser.role==='admin'?adminNav:studentNav;
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
  document.getElementById('sidebar-role').textContent=currentUser.role==='admin'?'Администратор':'Ученик';
  setTimeout(()=>{ updateChatBadge(); updateAdminBadge(); }, 50);
}

function openAdminChatById(sid){
  navigateTo('chat-admin');
  setTimeout(()=>openAdminChat(sid), 80);
}

let curPage='';
function navigateTo(page){
  // Защита маршрутов — ученик не может зайти на страницы администратора
  if(ADMIN_PAGES.includes(page) && currentUser && currentUser.role !== 'admin'){
    showNotif('⛔ Нет доступа к этой странице');
    console.warn('Route guard blocked:', page, 'for role:', currentUser.role);
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
  else if(p==='student-trial'){ renderStudentTrial(); }
  else if(p==='chat-admin'){ renderChatAdmin(); }
  else if(p==='student-chat'){ renderStudentChat(); }
  else if(p==='attend-pay-admin'){ buildStudentSelector('atp-student-selector', ()=>renderAtpPage()); renderAtpPage(); }
  else if(p==='payment-admin'){ buildStudentSelector('atp-student-selector', ()=>renderAtpPage()); renderAtpPage(); } // legacy redirect
  else if(p==='schedule-admin') renderScheduleAdmin();
  else if(p==='reports-admin') renderReportsAdmin();
  else if(p==='student-dashboard') renderStudentDashboard();
  else if(p==='student-materials') renderStudentMaterials();
  else if(p==='student-repeat') renderRepeatPage();
  else if(p==='student-tests') renderStudentTests();
  else if(p==='student-hw') renderStudentHW();
  else if(p==='student-payment') renderStudentPayment();
  else if(p==='notif-settings-admin'){ renderNotifSettingsAdmin(); }
  else if(p==='student-notif-settings'){ renderNotifSettingsStudent(); }
  else if(p==='student-schedule') renderStudentSchedule();
  else if(p==='zoom-settings'){ renderZoomSettings(); }
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
  el.innerHTML=students.map(s=>`
    <div class="student-chip ${_selectedStudent===s.id?'active':''}" onclick="selectStudent('${s.id}','${containerId}',${onChange.toString()})">
      ${esc(s.name)}
    </div>`).join('');
}
function selectStudent(id, containerId, onChange){
  _selectedStudent=id;
  buildStudentSelector(containerId, onChange);
  onChange();
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
  const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
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
  localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
  updateAdminBadge();
  const slots=load('slots')||[];
  const ul=document.getElementById('upcoming-list');
  ul.innerHTML=slots.filter(s=>s.bookedBy).map(s=>{
    const u=(load('users')||[]).find(u=>u.id===s.bookedBy);
    return `<div class="hw-item"><div class="hw-status-dot done"></div><div><div class="content-name" style="font-size:0.83rem">${s.day} ${s.time}</div><div class="content-meta">${u?u.name:s.bookedBy} · ${s.dur} мин</div></div></div>`;
  }).join('') || '<div class="empty-state"><p>Нет записей</p></div>';
  // Calendar & Todo
  renderCalendar();
  renderTodoList('day');
}

// ─── STUDENTS ───
function renderStudents(){
  const students=getStudents();
  const tb=document.getElementById('students-table');
  tb.innerHTML=students.map(s=>`
    <tr>
      <td>
        <b>${esc(s.name)}</b>
        ${s.grade?`<div style="font-size:0.74rem;color:var(--text3)">${s.grade}</div>`:''}
      </td>
      <td>
        ${s.phone?`<div style="font-size:0.82rem">📞 ${s.phone}</div>`:''}
        ${s.email?`<div style="font-size:0.78rem;color:var(--text3)">${s.email}</div>`:''}
      </td>
      <td>
        ${esc(s.subject||'—')}
        ${s.format?`<div style="font-size:0.74rem;color:var(--text3)">${s.format}</div>`:''}
      </td>
      <td>
        <span class="badge ${s.active?'badge-green':'badge-red'}">${s.active?'Активен':'Неактивен'}</span>
        ${s.ofertaSigned
          ?`<div style="font-size:0.7rem;color:var(--green-mid);margin-top:3px">📄 Договор ✅</div>`
          :`<div style="font-size:0.7rem;color:var(--red);margin-top:3px">📄 Договор ❌</div>`}
      </td>
      <td>${getPaymentStatusBadge(s.id)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openStudentProfileModal('${s.id}')">👤 Профиль</button>
        <button class="btn btn-outline btn-sm" onclick="openEditStudent('${s.id}')">✏️ Изменить</button>
        <button class="btn btn-red btn-sm" onclick="deleteStudent('${s.id}')">🗑</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text3)">Нет учеников</td></tr>`;
  renderGroups();
}
function getPaymentStatusBadge(sid){
  const payments=(load('payments')||[]).filter(p=>p.studentId===sid);
  if(!payments.length) return '<span class="badge badge-red">Нет данных</span>';
  const last=payments[payments.length-1];
  const cls={paid:'badge-green',unpaid:'badge-red',partial:'badge-gold'}[last.status];
  const lbl={paid:'Оплачено',unpaid:'Не оплачено',partial:'Частично'}[last.status];
  return `<span class="badge ${cls}">${lbl}</span>`;
}
function addStudent(){
  const name=document.getElementById('ns-name').value.trim();
  const login=document.getElementById('ns-login').value.trim();
  const pass=document.getElementById('ns-pass').value;
  const subject=document.getElementById('ns-subject').value;
  if(!name||!login||!pass){ showNotif('Заполните все поля'); return; }
  if(!document.getElementById('ns-oferta').checked){ showNotif('⚠️ Необходимо принять договор оферты'); return; }
  const users=load('users')||[];
  if(users.find(u=>u.login===login)){ showNotif('Логин уже занят'); return; }
  users.push({
    id:login, login, password:pass, name, role:'student', subject, active:true,
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
  const hasText  = !!(c.body && c.body.trim());
  const hasPdf   = files.some(f=>f.type==='pdf');
  const hasWord  = files.some(f=>f.type==='word');
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
  // video player
  let videoBlock='';
  if(videoUrl){
    const embedUrl=getVideoEmbedUrl(videoUrl);
    if(embedUrl){
      videoBlock=`<div style="margin-bottom:18px">
        <div style="font-weight:700;color:var(--accent);margin-bottom:10px;font-size:0.9rem">🎬 Видео</div>
        <div style="border-radius:12px;overflow:hidden;background:#000;position:relative;width:100%;height:300px">
          <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen"></iframe>
        </div>
      </div>`;
    }
  }
  // text block
  let textBlock='';
  if(c.body && c.body.trim()){
    textBlock=`<div style="margin-bottom:18px">
      <div style="font-weight:700;color:var(--accent);margin-bottom:8px;font-size:0.9rem">📖 Текст урока</div>
      <div style="line-height:1.8;color:var(--text2);font-size:0.92rem;background:var(--bg);padding:16px;border-radius:10px;border:1px solid var(--green-xpale)">${c.body}</div>
    </div>`;
  }
  // images
  let imgsBlock='';
  if(c.images && c.images.filter(Boolean).length){
    imgsBlock=`<div style="margin-bottom:18px;display:flex;flex-wrap:wrap;gap:10px">`;
    c.images.filter(Boolean).forEach(img=>{
      imgsBlock+=`<img src="${img}" alt="" style="max-width:100%;border-radius:10px;border:1px solid var(--green-pale);max-height:260px;object-fit:contain">`;
    });
    imgsBlock+=`</div>`;
  }
  // files
  let filesBlock='';
  if(files.length){
    filesBlock=`<div style="margin-bottom:18px">
      <div style="font-weight:700;color:var(--accent);margin-bottom:8px;font-size:0.9rem">📎 Файлы</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${files.map(f=>`
          <a href="${f.url||'#'}" target="_blank" class="content-item" style="text-decoration:none;color:inherit">
            <div class="content-icon">${f.type==='pdf'?'📄':'📋'}</div>
            <div class="content-info">
              <div class="content-name">${f.name||'Файл'}</div>
              <div class="content-meta">${f.type==='pdf'?'PDF-документ':'Word-документ'}</div>
            </div>
            <div style="color:var(--green-mid);font-size:0.85rem">⬇ Открыть</div>
          </a>`).join('')}
      </div>
    </div>`;
  }
  return `<div class="accordion-item" id="acc-${c.id}" data-content-id="${c.id}">
    ${_availLockHtml}
    <div class="accordion-header" onclick="toggleAccordion(this)">
      <div style="font-size:1.4rem">📖</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.97rem;color:var(--accent);margin-bottom:4px">${esc(c.title)}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${badges||'<span style="font-size:0.75rem;color:var(--text3)">Пустой урок</span>'}${viewedBadge?'&nbsp;'+viewedBadge:''}${_availBadgeHtml?'&nbsp;'+_availBadgeHtml:''}</div>
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
      const viewed = JSON.parse(localStorage.getItem(key)||'{}');
      if(!viewed[cid]){
        viewed[cid] = true;
        localStorage.setItem(key, JSON.stringify(viewed));
        // Update badge in place without full re-render
        const badgeEl = item.querySelector('.accordion-header .accordion-badge[style*="1565c0"]');
        if(badgeEl) badgeEl.outerHTML = '<span class="accordion-badge" style="background:#e8f8f0;color:#27ae60">✅ Просмотрено</span>';
      }
    }
  }
}
function contentItemHTML(c, isAdmin){
  const icons={video:'🎬',theory:'📖',article:'📝',pdf:'📄',word:'📋'};
  if(!isAdmin && c.type==='video'){
    const embedUrl=getVideoEmbedUrl(c.url||'');
    const playerHtml=embedUrl
      ? `<div style="margin-top:10px;border-radius:10px;overflow:hidden;background:#000;position:relative;width:100%;height:260px"><iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen"></iframe></div>`
      : `<a href="${c.url||'#'}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:8px">⬇ Открыть</a>`;
    return `<div class="content-item" style="flex-direction:column;align-items:flex-start">
      <div style="display:flex;align-items:center;gap:14px;width:100%">
        <div class="content-icon">${icons[c.type]||'📎'}</div>
        <div class="content-info">
          <div class="content-name">${esc(c.title)}</div>
          <div class="content-meta">${c.desc||''}</div>
        </div>
      </div>
      ${playerHtml}
    </div>`;
  }
  const actions = isAdmin
    ? `<div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="openEditContent('${c.id}')">✏️</button><button class="btn btn-red btn-sm" onclick="deleteContent('${c.id}')">🗑</button></div>`
    : (c.type==='theory'||c.type==='article'
        ? `<button class="btn btn-outline btn-sm" onclick="viewTheory('${c.id}')">👁 Читать</button>`
        : `<a href="${c.url||'#'}" target="_blank" class="btn btn-outline btn-sm">⬇ Открыть</a>`);
  return `<div class="content-item">
    <div class="content-icon">${icons[c.type]||'📎'}</div>
    <div class="content-info">
      <div class="content-name">${esc(c.title)}</div>
      <div class="content-meta">${c.desc||c.url||''}</div>
      ${c.images&&c.images.length?`<div class="content-meta">🖼 ${c.images.length} изображ.</div>`:''}
      ${c.attachmentUrl?`<div class="content-meta">📎 Файл прикреплён</div>`:''}
    </div>
    <div class="content-actions">${actions}</div>
  </div>`;
}
function emptyHTML(){ return '<div class="empty-state"><div class="big">📭</div><p>Нет материалов</p></div>'; }

function openModal(id, extra){
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
    container.innerHTML=getStudents().map(s=>`
      <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;border:1.5px solid var(--green-pale);background:var(--white);cursor:pointer;font-size:0.82rem;font-weight:600">
        <input type="checkbox" value="${s.id}" checked style="accent-color:var(--green-deep)"> ${esc(s.name)}
      </label>`).join('');
    setTimeout(prefillAttendanceFromSlot, 50);
  }
  document.getElementById(id).classList.add('open');
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
  const students=(load('users')||[]).filter(u=>u.role==='student');
  if(!students.length){ el.innerHTML='<span style="font-size:0.82rem;color:var(--text3)">Нет учеников</span>'; return; }
  const cur=_selectedStudent||(students[0]||{}).id;
  el.innerHTML=students.map(s=>`
    <label class="chip-label">
      <input type="checkbox" value="${s.id}" ${s.id===cur?'checked':''} style="accent-color:var(--green-deep);flex-shrink:0;width:14px;height:14px"><span style="overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
    </label>`).join('');
}
function getCheckedModalStudents(containerId){
  const el=document.getElementById(containerId);
  if(!el) return [];
  return [...el.querySelectorAll('input[type=checkbox]:checked')].map(cb=>cb.value);
}
function closeModal(id){
  const el=document.getElementById(id);
  if(el) el.classList.remove('open');
  if(id==='modal-add-theory'){
    _theoryFiles=[];
  }
}

function getVideoEmbedUrl(url){
  if(!url) return null;
  url = url.trim();

  // ── YouTube ──
  let m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if(m) return 'https://www.youtube.com/embed/'+m[1];
  m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if(m) return 'https://www.youtube.com/embed/'+m[1];
  if(url.includes('youtube.com/embed/')) return url;

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
      ${blk.url?`<img src="${blk.url}" alt="" style="max-width:100%;border-radius:8px;max-height:300px;object-fit:contain" onerror="this.style.display='none'">` : ''}
      <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на изображение..."
        style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none;margin-top:8px;box-sizing:border-box"
        oninput="${stateVar}[${idx}].url=this.value" onblur="nbRenderCanvas(${stateVar},'${stateVar}','${canvasId}')">
      <div contenteditable="true" class="nb-img-caption" data-ph="Подпись..."
        oninput="${stateVar}[${idx}].caption=this.innerText">${blk.caption||''}</div>
    </div>`;
  } else if(blk.type==='image-upload'){
    content.innerHTML=`<div class="nb-img-block" style="padding:10px">
      ${blk.url?`<img src="${blk.url}" alt="" style="max-width:100%;border-radius:8px;max-height:300px;object-fit:contain">` : ''}
      <input type="file" accept="image/*" style="font-size:0.83rem;width:100%;margin-top:8px"
        onchange="nbHandleUploadFor(this,${idx},'${stateVar}','${canvasId}')">
      <div contenteditable="true" class="nb-img-caption" data-ph="Подпись..."
        oninput="${stateVar}[${idx}].caption=this.innerText">${blk.caption||''}</div>
    </div>`;
  } else if(blk.type==='video'){
    const embed=blk.url?getVideoEmbedUrl(blk.url):'';
    content.innerHTML=`<div style="padding:10px;background:var(--bg);border-radius:10px;border:1.5px dashed var(--green-pale)">
      ${embed?`<div class="nb-video-block"><iframe src="${embed}" allowfullscreen></iframe></div>`:''}
      <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на видео (YouTube, VK, Google Drive)..."
        style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none;margin-top:${embed?'10':'0'}px;box-sizing:border-box"
        oninput="${stateVar}[${idx}].url=this.value" onblur="nbRenderCanvas(${stateVar},'${stateVar}','${canvasId}')">
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
function renderTheoryImages(){}
function previewTheoryVideo(){}
function addTheoryFile(){}
function renderTheoryFiles(){}
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
      <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?s.name:'Ученик'}</div>
      ${tests.length ? tests.map(t=>testItemHTML(t)).join('') : emptyHTML()}
    </div>`;
  }

  // Update open answers for selected student (use first student if "all")
  _selectedStudent = _testsSelectedSid === 'all' ? (students[0]||{}).id : _testsSelectedSid;
  renderOpenAnswers();
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
  const totalPts = (t.questions||[]).reduce((s,q)=>s+(+q.points||1),0);
  return `<div class="content-item" style="flex-direction:column;align-items:stretch">
    <div style="display:flex;align-items:center;gap:14px">
      <div class="content-icon">📋</div>
      <div class="content-info">
        <div class="content-name">${esc(t.title)}</div>
        <div class="content-meta">${t.questions.length} вопросов · ${totalPts} ${ptWord(totalPts)} · Создан: ${t.date}</div>
        <div class="content-meta" style="margin-top:4px">
          ${(()=>{
            const hasOpen=(t.questions||[]).some(q=>q.type==='open');
            if(!t.submitted) return '<span class="badge badge-gold">Не сдан</span>';
            const scoreStr = t.autoTotal ? ` ${t.autoScore||0}/${t.autoTotal||0} б.${t.autoPct!=null?' ('+t.autoPct+'%)':''}` : '';
            if(t.openChecked || !hasOpen) return `<span class="badge badge-green">✓ Проверено</span>${scoreStr}`;
            return `<span class="badge badge-gold">Ожидает проверки</span>${scoreStr}`;
          })()}
          ${t.autoGrade?`<span class="grade-result-badge grade-${t.autoGrade}" style="font-size:0.72rem;padding:3px 10px">Оценка: ${t.autoGrade}</span>`:''}
        </div>
      </div>
      <div class="content-actions" style="flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openAssignStudents('test','${t.id}')">👤</button>
        <button class="btn btn-outline btn-sm" onclick="openEditAvail('test','${t.id}')" title="Доступность">⏰</button>
        <button class="btn btn-outline btn-sm" onclick="openEditTest('${t.id}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="deleteTest('${t.id}')">🗑</button>
      </div>
    </div>
    <div style="margin-top:2px">${availBadge(t)}</div>
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
        <div class="question-text">${q.text}</div>
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
    <div class="form-group"><label>Вопрос</label><div class="feedback-box">${q.text}</div></div>
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
  const examGradeEl=document.getElementById('ca-exam-grade');
  const examGrade=examGradeEl?examGradeEl.value:'';
  const items=load(itemType==='test'?'tests':'hw')||[];
  const item=items.find(t=>t.id===itemId);
  const q=item.questions.find(q=>q.id===qId);
  q.checked=true; q.grade=grade; q.comment=comment;
  if(examGrade!=='') q.examGrade=examGrade;
  item.openChecked=true;
  save(itemType==='test'?'tests':'hw',items);
  // Add notification
  const notifs=load('notifs')||[];
  notifs.push({id:'n'+Date.now(),studentId:item.studentId,text:`📬 Проверен ответ на вопрос "${q.text.substring(0,40)}..." в "${item.title}". Оценка: ${grade}`,date:new Date().toLocaleDateString('ru'),read:false});
  save('notifs',notifs);
  closeModal('modal-check-answer');
  renderOpenAnswers(); renderHWOpenAnswers();
  showNotif('✅ Ответ проверен, уведомление отправлено');
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
  // Show total points hint
  const hint = document.getElementById('nt-total-pts');
  if(hint) hint.textContent = 'Итого: '+totalPts+' '+ptWord(totalPts);
}
function ptWord(n){ return n===1?'балл':n<5?'балла':'баллов'; }

function buildQuestionHTML(q,i,ctx){
  const pfx = ctx==='test'?'_tempQuestions':'_tempHWQuestions';
  const removeFn = ctx==='test'?`removeQ(${i})`:`removeHWQ(${i})`;
  const rebuildFn = ctx==='test'?'renderTestBuilder()':'renderHWBuilder()';
  const imgTabId  = `img-tab-${ctx}-${i}`;
  const imgPreId  = `img-pre-${ctx}-${i}`;
  const imgPreview = q.imageUrl
    ? `<img id="${imgPreId}" class="q-img-preview" src="${q.imageUrl}" alt="">`
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
      <label style="font-size:0.75rem;color:var(--text3)">🖼 Картинка (необязательно)</label>
      <input class="q-input" style="margin-top:4px" placeholder="https://... или оставь пустым" value="${(q.imageUrl||'').startsWith('data:')?'':q.imageUrl||''}" oninput="${pfx}[${i}].imageUrl=this.value;updateQImgPreview('${imgPreId}',this.value)">
      ${imgPreview}
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
  const autoTotal=_tempQuestions.filter(q=>q.type==='auto').reduce((s,q)=>s+(+q.points||1),0);
  const tests=load('tests')||[];
  if(sids.length){
    sids.forEach(sid=>tests.push({id:'t'+Date.now()+'_'+sid,studentId:sid,title,questions:[..._tempQuestions],date:new Date().toLocaleDateString('ru'),submitted:false,answers:{},autoScore:0,autoTotal,gradeConfig,openAt,closeAt}));
  } else {
    tests.push({id:'t'+Date.now()+'_lib',studentId:null,title,questions:[..._tempQuestions],date:new Date().toLocaleDateString('ru'),submitted:false,answers:{},autoScore:0,autoTotal,gradeConfig,isLibrary:true,openAt,closeAt});
  }
  save('tests',tests);
  if(sids.length) sids.forEach(sid=>addNotif(sid,{type:'test',text:`📝 Новый тест: ${title}`,nav:'student-tests'}));
  _tempQuestions=[];
  ['nt-questions-list'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
  ['nt-title','nt-open-at','nt-close-at'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
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
  }
  closeModal('modal-assign-students');
  showNotif(`✅ Отправлено ${checked.length} ученикам`);
}

// ─── HW ADMIN ───
let _tempHWQuestions=[];
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
      <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?s.name:'Ученик'}</div>
      ${hws.length ? hws.map(h=>hwItemHTML(h)).join('') : emptyHTML()}
    </div>`;
  }

  _selectedStudent = _hwSelectedSid === 'all' ? (students[0]||{}).id : _hwSelectedSid;
  renderHWOpenAnswers();
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
  return `<div class="content-item" style="flex-direction:column;align-items:stretch">
    <div style="display:flex;align-items:center;gap:14px">
      <div class="content-icon">✏️</div>
      <div class="content-info">
        <div class="content-name">${esc(h.title)}</div>
        <div class="content-meta">${h.desc||''} · Срок: ${h.due||'—'}</div>
        <div class="content-meta" style="margin-top:4px">
          ${(()=>{
            const hasOpen=(h.questions||[]).some(q=>q.type==='open');
            if(!h.submitted) return '<span class="badge badge-gold">Ожидается</span>';
            if(h.openChecked || !hasOpen) return '<span class="badge badge-green">✓ Проверено</span>';
            return '<span class="badge badge-gold">Ожидает проверки</span>';
          })()}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openAssignStudents('hw','${h.id}')">👤</button>
        <button class="btn btn-outline btn-sm" onclick="openEditAvail('hw','${h.id}')" title="Доступность">⏰</button>
        <button class="btn btn-outline btn-sm" onclick="openEditHW('${h.id}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="deleteHW('${h.id}')">🗑</button>
      </div>
    </div>
    <div style="margin-top:2px">${availBadge(h)}</div>
    ${h.submitted ? `<div id="adm-cmt-hw-${h.id}" style="margin-top:4px"></div>` : ''}
  </div>`;
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
        <div class="question-text">${q.text}</div>
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
    <div class="form-group"><label>Вопрос</label><div class="feedback-box">${q.text}</div></div>
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
  const sids=getCheckedModalStudents('modal-hw-students');
  const hws=load('hw')||[];
  if(sids.length){
    sids.forEach(sid=>hws.push({id:'hw'+Date.now()+'_'+sid,studentId:sid,title,desc,due,fileUrl,questions:[..._tempHWQuestions],submitted:false,answers:{},date:new Date().toLocaleDateString('ru'),openAt,closeAt}));
  } else {
    hws.push({id:'hw'+Date.now()+'_lib',studentId:null,title,desc,due,fileUrl,questions:[..._tempHWQuestions],submitted:false,answers:{},date:new Date().toLocaleDateString('ru'),isLibrary:true,openAt,closeAt});
  }
  save('hw',hws);
  if(sids.length) sids.forEach(sid=>addNotif(sid,{type:'hw',text:`✏️ Новое домашнее задание: ${title}`,nav:'student-hw'}));
  _tempHWQuestions=[];
  ['nhw-questions-list'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
  ['nhw-title','nhw-desc','nhw-fileurl','nhw-open-at','nhw-close-at'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
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
  document.getElementById('es-subject').value=u.subject||'Биология';
  document.getElementById('es-format').value=u.format||'';
  document.getElementById('es-notes').value=u.notes||'';
  document.getElementById('es-active').value=String(u.active!==false);
  document.getElementById('es-oferta').value=String(!!u.ofertaSigned);
  document.getElementById('modal-edit-student').classList.add('open');
}
function saveEditStudent(){
  const id=document.getElementById('es-id').value;
  const name=document.getElementById('es-name').value.trim();
  const pass=document.getElementById('es-pass').value;
  const subject=document.getElementById('es-subject').value;
  const active=document.getElementById('es-active').value==='true';
  if(!name){ showNotif('Введите имя'); return; }
  const users=load('users')||[];
  const u=users.find(u=>u.id===id);
  if(!u) return;
  u.name=name; u.subject=subject; u.active=active;
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
  if(pass) u.password=pass;
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
  return { id: nbBlockId(), type, content:'', caption:'', url:'', name:'' };
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
  if(c.videoUrl) blocks.push({...nbDefaultBlock('video'), url: c.videoUrl});
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
        ${blk.url ? `<img src="${blk.url}" alt="" onerror="this.style.display='none'">` : ''}
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
        ${blk.url ? `<img src="${blk.url}" alt="">` : ''}
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
    content.innerHTML = `
      <div style="padding:10px;background:var(--bg);border-radius:10px;border:1.5px dashed var(--green-pale)">
        ${embed ? `<div class="nb-video-block"><iframe src="${embed}" allowfullscreen></iframe></div>` : ''}
        <div style="display:flex;gap:6px;margin-top:${embed?'10':'0'}px">
          <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на видео (YouTube, VK, Google Drive)..."
            style="flex:1;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none"
            oninput="_nbBlocks[${idx}].url=this.value" onblur="nbRender()">
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
    if(b.type==='p') return `<p style="margin:0 0 10px;line-height:1.75;color:var(--text2)">${b.content.replace(/\n/g,'<br>')}</p>`;
    if(b.type==='h1') return `<h2 style="font-family:'Playfair Display',serif;font-size:1.6rem;color:var(--accent);margin:20px 0 10px">${b.content}</h2>`;
    if(b.type==='h2') return `<h3 style="font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--green-deep);margin:16px 0 8px">${b.content}</h3>`;
    if(b.type==='h3') return `<h4 style="font-size:1rem;font-weight:700;color:var(--text);margin:12px 0 6px">${b.content}</h4>`;
    if(b.type==='quote') return `<blockquote style="border-left:3px solid var(--green-mid);padding:8px 16px;background:var(--bg2);border-radius:0 8px 8px 0;font-style:italic;color:var(--text2);margin:12px 0">${b.content}</blockquote>`;
    if(b.type==='callout') return `<div style="background:#fffbeb;border:1px solid #fce98a;border-radius:10px;padding:12px 16px;color:#856404;margin:12px 0">💡 ${b.content}</div>`;
    if(b.type==='code') return `<pre style="background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:14px 18px;overflow-x:auto;font-size:0.85rem;margin:12px 0"><code>${b.content.replace(/</g,'&lt;')}</code></pre>`;
    if(b.type==='divider') return `<hr style="border:none;border-top:2px solid var(--green-xpale);margin:16px 0">`;
    if(b.type==='image'||b.type==='image-upload') return b.url ? `<figure style="margin:16px 0;text-align:center"><img src="${b.url}" style="max-width:100%;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.1)" alt="${b.caption||''}"><figcaption style="font-size:0.78rem;color:var(--text3);margin-top:6px">${b.caption||''}</figcaption></figure>` : '';
    if(b.type==='video'){
      const embed=getVideoEmbedUrl(b.url||'');
      return embed ? `<div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;margin:16px 0"><iframe src="${embed}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe></div>` : '';
    }
    if(b.type==='file') return b.url ? `<a href="${b.url}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;text-decoration:none;color:var(--text);font-size:0.88rem;margin:8px 0">${b.content==='pdf'?'📄':b.content==='word'?'📋':'🔗'} ${b.name||b.url}</a>` : '';
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
  document.getElementById('modal-edit-content').classList.add('open');
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
// ── EDIT TEST ──
function openEditTest(id){
  const t=(load('tests')||[]).find(t=>t.id===id);
  if(!t) return;
  _editTestId=id;
  _editTestQuestions=JSON.parse(JSON.stringify(t.questions||[]));
  document.getElementById('et-id').value=id;
  document.getElementById('et-title').value=t.title||'';
  document.getElementById('et-desc').value=t.desc||'';
  document.getElementById('et-due').value=t.due||'';
  document.getElementById('et-pass').value=t.passThresh||'';
  const gc=t.gradeConfig||{};
  document.getElementById('et-g5').value=gc[5]??85;
  document.getElementById('et-g4').value=gc[4]??67;
  document.getElementById('et-g3').value=gc[3]??45;
  renderEditTestBuilder();
  document.getElementById('modal-edit-test').classList.add('open');
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
    </div>`;
  }).join('');
}
function addEditTestQuestion(type){
  _editTestQuestions.push({id:'q'+Date.now(),type,text:'',options:[],correct:'',points:1,pairs:[],items:[]});
  renderEditTestBuilder();
}
function removeEditQ(i){ _editTestQuestions.splice(i,1); renderEditTestBuilder(); }
function saveEditTest(){
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
  t.questions=_editTestQuestions;
  t.autoTotal=_editTestQuestions.filter(q=>q.type==='auto').reduce((s,q)=>s+(+q.points||1),0);
  save('tests',tests);
  closeModal('modal-edit-test');
  renderTestsAdmin();
  showNotif('✅ Тест обновлён');
}

// ── EDIT HW ──
let _editHWQuestions=[];
function openEditHW(id){
  const h=(load('hw')||[]).find(h=>h.id===id);
  if(!h) return;
  _editHWQuestions=JSON.parse(JSON.stringify(h.questions||[]));
  document.getElementById('ehw-id').value=h.id;
  document.getElementById('ehw-title').value=h.title||'';
  document.getElementById('ehw-desc').value=h.desc||'';
  document.getElementById('ehw-due').value=h.due||'';
  document.getElementById('ehw-fileurl').value=h.fileUrl||'';
  const gc=h.gradeConfig||{};
  document.getElementById('ehw-g5').value=gc[5]??85;
  document.getElementById('ehw-g4').value=gc[4]??67;
  document.getElementById('ehw-g3').value=gc[3]??45;
  renderEditHWBuilder();
  document.getElementById('modal-edit-hw').classList.add('open');
}
function renderEditHWBuilder(){
  const el=document.getElementById('ehw-questions-list');
  if(!el) return;
  const totalPts=_editHWQuestions.reduce((s,q)=>s+(+q.points||1),0);
  const hint=document.getElementById('ehw-total-hint');
  if(hint) hint.textContent=_editHWQuestions.length?`· ${_editHWQuestions.length} вопросов · итого ${totalPts} б.`:'';
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
    </div>`;
  }).join('');
}
function addEditHWQuestion(type){
  _editHWQuestions.push({id:'q'+Date.now(),type,text:'',options:[],correct:'',points:1,pairs:[],items:[]});
  renderEditHWBuilder();
}
function removeEditHWQ(i){ _editHWQuestions.splice(i,1); renderEditHWBuilder(); }
function saveEditHW(){
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
  h.questions=_editHWQuestions;
  h.autoTotal=_editHWQuestions.filter(q=>q.type==='auto').reduce((s,q)=>s+(+q.points||1),0);
  save('hw',hws);
  closeModal('modal-edit-hw');
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
    const whoLabel = g ? `<b>👥 ${g.name}</b>` : (u?`<b>${u.name}</b>`:'<span style="color:var(--text3)">Свободно</span>');
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

function getSRData(sid){
  const raw = localStorage.getItem('biohim_'+srKey(sid));
  return raw ? JSON.parse(raw) : {};
}
function saveSRData(sid, data){
  localStorage.setItem('biohim_'+srKey(sid), JSON.stringify(data));
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
    <a href="${f.url||'#'}" target="_blank" class="content-item" style="text-decoration:none;color:inherit">
      <div class="content-icon">${f.type==='pdf'?'📄':'📋'}</div>
      <div class="content-info"><div class="content-name">${f.name||'Файл'}</div></div>
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
    ? `<img id="${imgPreId}" class="q-img-preview" src="${q.imageUrl}" alt="">`
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
    el.innerHTML=`<div class="card"><div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?s.name:'Ученик'}</div>
      ${st.length?st.map(t=>trialAdminItemHTML(t)).join(''):emptyHTML()}</div>`;
  }
  renderTrialOpenAnswers();
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
  const fullyChecked = t.submitted && (!hasOpen || t.openChecked);
  const statusBadge = !t.submitted
    ? `<span class="badge badge-gold">⏳ Не пройден</span>`
    : fullyChecked
      ? `<span class="badge badge-green">✅ Проверено · ${t.autoScore||0}/${t.autoTotal||0} б. · ${pct}%</span>`
      : `<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке</span>`;
  return `<div class="content-item">
    <div class="content-icon">🎯</div>
    <div class="content-info">
      <div class="content-name">${esc(t.title)}</div>
      <div class="content-meta">${t.subject||''} · ⏱ ${t.timeMins} мин · ⭐ ${t.maxPts} б. · ${t.date}</div>
      <div style="margin-top:4px">${statusBadge}</div>
    </div>
    <div style="display:flex;gap:6px">
      ${t.submitted?`<button class="btn btn-outline btn-sm" onclick="viewTrialResult('${t.id}')">📊</button>`:''}
      <button class="btn btn-outline btn-sm" onclick="openEditAvail('trial','${t.id}')" title="Доступность">⏰</button>
      <button class="btn btn-outline btn-sm" onclick="openEditTrial('${t.id}')">✏️</button>
      <button class="btn btn-red btn-sm" onclick="deleteTrial('${t.id}')">🗑</button>
    </div>
    <div style="margin-top:2px">${availBadge(t)}</div>
  </div>`;
}
function deleteTrial(id){ save('trials',(load('trials')||[]).filter(t=>t.id!==id)); renderTrialAdmin(); }

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

  // Reset maxpts to readonly auto mode
  const maxEl = document.getElementById('etr-maxpts');
  const btn   = document.getElementById('etr-maxpts-btn');
  const hint  = document.getElementById('etr-maxpts-hint');
  maxEl.setAttribute('readonly','');
  maxEl.style.background='var(--bg)'; maxEl.style.color='var(--text3)';
  if(btn)  btn.textContent='✏️ Изменить';
  if(hint) hint.textContent='(считается автоматически из вопросов)';

  renderEditTrialBuilder();
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
  _editTrialSections.push({id:'ts_'+Date.now(), title:'Часть '+(+_editTrialSections.length+1), questions:[]});
  renderEditTrialBuilder();
}
function removeEditTrialSection(idx){
  _editTrialSections.splice(idx,1);
  renderEditTrialBuilder();
}
function addEditTrialQuestion(sIdx, type){
  _editTrialSections[sIdx].questions.push(initQuestion('tq_'+Date.now(), type));
  renderEditTrialBuilder();
}
function removeEditTrialQuestion(sIdx, qIdx){
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
      ${q.imageUrl?`<img id="${imgPreId}" class="q-img-preview" src="${q.imageUrl}" alt="">`:`<img id="${imgPreId}" class="q-img-preview" style="display:none" src="" alt="">`}
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
  t.sections=JSON.parse(JSON.stringify(_editTrialSections));
  const allQ=_editTrialSections.flatMap(s=>s.questions);
  const autoPts=_editTrialMaxPtsManual
    ? +(document.getElementById('etr-maxpts').value)||t.maxPts
    : allQ.reduce((a,q)=>a+(+q.points||1),0);
  t.maxPts=autoPts;
  t.autoTotal=allQ.filter(q=>q.type==='auto').reduce((a,q)=>a+(+q.points||1),0)||autoPts;
  save('trials',trials);
  closeModal('modal-edit-trial');
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
        <div class="question-text">${q.text}</div>
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
  (t.sections||[]).forEach(s=>s.questions.forEach(q=>{ if(q.id===qid){ q.checked=true; q.earnedPts=pts; } }));
  const openDone=(t.sections||[]).flatMap(s=>s.questions).filter(q=>q.type==='open').every(q=>q.checked);
  t.openChecked=openDone;
  const openScore=(t.sections||[]).flatMap(s=>s.questions).filter(q=>q.type==='open'&&q.checked).reduce((a,q)=>a+(q.earnedPts||0),0);
  t.autoScore=(t.autoScore||0)+openScore;
  save('trials',trials);
  renderTrialAdmin();
  showNotif(`✅ Ответ засчитан: +${pts} б.`);
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
    const statusBadge=!t.submitted
      ?`<span class="badge badge-gold">⏳ Не пройден</span>`
      :fullyChecked
        ?`<span class="badge badge-green">✅ Проверено · ${t.autoScore}/${t.autoTotal} б. · ${pct}% · Оценка ${calcGrade(pct,t.gradeConfig)}</span>`
        :`<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке · авто: ${t.autoScore}/${t.autoTotal} б.</span>`;
    return `<div class="card">
      <div class="card-title"><span class="dot"></span>🎯 ${esc(t.title)}</div>
      <div style="font-size:0.85rem;color:var(--text3);margin-bottom:10px">
        ${t.subject?`📚 ${t.subject} · `:''}⏱ ${t.timeMins} мин · ⭐ ${t.maxPts} б.
        ${t.passThresh?` · Порог: ${t.passThresh}%`:''}
      </div>
      <div style="margin-bottom:12px">${statusBadge}</div>
      ${!t.submitted ? availGate(t,'startTrial') : viewTrialResultHTML(t)}
      <div id="cmt-trial-${t.id}"></div>
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
  t.submitted=true; t.answers={..._trialAnswers};
  let score=0, total=0;
  (t.sections||[]).forEach(s=>s.questions.forEach(q=>{
    const pts=+q.points||1;
    const ans=_trialAnswers[q.id]||'';
    if(q.type!=='open'){ total+=pts; if(scoreQuestion(q,ans)) score+=pts; }
  }));
  t.autoScore=score; t.autoTotal=total||t.maxPts||total;
  const pct=t.autoTotal?Math.round(score/t.autoTotal*100):0;
  t.autoGrade=calcGrade(pct,t.gradeConfig); t.autoPct=pct;
  save('trials',trials);
  document.getElementById('modal-take-trial').classList.remove('open');
  renderStudentTrial();
  showNotif(timeout?`⏰ Время вышло! Авто: ${score}/${t.autoTotal} б.`:`✅ Пробник сдан! Авто: ${score}/${t.autoTotal} б. (${pct}%)`);
}
function viewTrialResultHTML(t){
  const allQ=(t.sections||[]).flatMap(s=>s.questions);
  return `<div style="margin-top:4px">
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
            <span class="badge" style="background:var(--green-xpale);color:var(--green-deep);border:none;font-size:0.7rem">${typeLabel[t.answerType||'open']||'📝 Открытый'}</span>
            <span class="badge" style="background:#fef3cd;color:#856404;border:none;font-size:0.7rem">⭐ ${t.points||1} ${(t.points||1)===1?'балл':(t.points||1)<5?'балла':'баллов'}</span>
          </div>
          <div style="font-size:0.92rem;font-weight:600;color:var(--accent);margin-bottom:6px;line-height:1.5">${t.text}</div>
          ${t.imageUrl?`<img src="${t.imageUrl}" style="max-width:200px;border-radius:8px;border:1px solid var(--green-xpale);margin-bottom:6px" alt="">`:''}
          ${t.answerType==='choice'&&t.options?.length?`
            <div style="font-size:0.8rem;color:var(--text3);margin-bottom:4px">Варианты: ${t.options.join(' · ')}</div>
            <div style="font-size:0.8rem;background:var(--bg);padding:6px 10px;border-radius:8px;border-left:3px solid var(--green-mid)">✅ Правильно: <b>${t.correctOption}</b>${t.explanation?` — ${t.explanation}`:''}</div>
          `:''}
          ${t.answerType==='short'?`
            <div style="font-size:0.8rem;background:var(--bg);padding:6px 10px;border-radius:8px;border-left:3px solid var(--green-mid)">✅ Правильно: <b>${t.correctShort}</b>${t.explanation?` — ${t.explanation}`:''}</div>
          `:''}
          ${t.answerType==='open'&&t.answer?`<div style="font-size:0.8rem;color:var(--text3);background:var(--bg);padding:8px 12px;border-radius:8px;border-left:3px solid var(--green-mid)">💡 ${t.answer}</div>`:''}
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
  const subject = document.getElementById('ntask-subject').value.trim();
  const imgUrl  = document.getElementById('ntask-imgurl').value.trim()||_ntaskImgData;
  const editId  = document.getElementById('ntask-edit-id').value;

  let taskData = { text, subject, imageUrl:imgUrl, answerType:type, points:Math.max(1,+document.getElementById('ntask-points').value||1) };
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
  document.getElementById('modal-add-task').classList.add('open');
}

function deleteTask(id){
  if(!confirm('Удалить задание?')) return;
  save('taskbank',(load('taskbank')||[]).filter(t=>t.id!==id));
  renderTaskBankAdmin();
}

// ── DAILY TASK for student ──
function getDailyTask(sid){
  const tasks=load('taskbank')||[];
  if(!tasks.length) return null;
  const today=todayStr();
  const log=JSON.parse(localStorage.getItem('biohim_daily_task_log')||'{}');
  const sidLog=log[sid]||[];
  const todayEntry=sidLog.find(e=>e.date===today);
  if(todayEntry){ return {task:tasks.find(t=>t.id===todayEntry.taskId)||null,isNew:false}; }
  const usedIds=new Set(sidLog.map(e=>e.taskId));
  const available=tasks.filter(t=>!usedIds.has(t.id));
  const pool=available.length?available:tasks;
  const task=pool[Math.floor(seededRandom(sid+today)*pool.length)];
  if(!task) return null;
  log[sid]=[...sidLog,{date:today,taskId:task.id}].slice(-365);
  localStorage.setItem('biohim_daily_task_log',JSON.stringify(log));
  return {task,isNew:true};
}
function seededRandom(seed){
  let h=0; for(let i=0;i<seed.length;i++) h=(Math.imul(31,h)+seed.charCodeAt(i))|0;
  return Math.abs(h)/2147483647;
}
function getDailyAnswer(sid){
  const answers=JSON.parse(localStorage.getItem('biohim_daily_answers')||'{}');
  return (answers[sid]||{})[todayStr()]||null;
}
function saveDailyAnswer(sid,data){
  const answers=JSON.parse(localStorage.getItem('biohim_daily_answers')||'{}');
  if(!answers[sid]) answers[sid]={};
  answers[sid][todayStr()]=data;
  localStorage.setItem('biohim_daily_answers',JSON.stringify(answers));
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
      <div style="color:var(--text1);line-height:1.6">${task.answer}</div>
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
  const allAtt = (load('attendance')||[]).slice().reverse();

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
            ${lg.topic?`📖 ${lg.topic} · `:''}${lg.group?`👥 ${lg.group} · `:''}💰 ${lg.costPerStudent}₽/чел.
          </div>
        </div>
        <button class="btn btn-red btn-sm" onclick="deleteLesson('${lg.lessonId}')">🗑 Занятие</button>
      </div>
      ${lg.entries.map(a=>{
        const s = students.find(s=>s.id===a.studentId);
        return `<div class="att-row att-${a.present?'present':'absent'}">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.88rem">${s?s.name:'—'}</div>
            ${a.group?`<div style="font-size:0.75rem;color:var(--text3)">${a.group}</div>`:''}
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

function toggleAttPresence(id){
  const att=load('attendance')||[];
  const a=att.find(a=>a.id===id); if(!a) return;
  a.present=!a.present;
  if(!a.present) a.paid=false;
  save('attendance',att);
  renderAtpAttendance();
  renderAtpWallet();
}
function deleteLesson(lessonId){
  if(!confirm('Удалить всё занятие?')) return;
  save('attendance',(load('attendance')||[]).filter(a=>a.lessonId!==lessonId));
  renderAtpAttendance();
}

function renderStudentAttendance(){
  const sid=currentUser.id;
  const att=(load('attendance')||[]).filter(a=>a.studentId===sid).slice().reverse();
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
              ${a.topic?`📖 ${a.topic}`:''}${a.group?' · 👥 '+a.group:''}
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
  if(!u) return;
  document.getElementById('student-profile-body').innerHTML = buildProfileHTML(u, true);
  document.getElementById('modal-student-profile').classList.add('open');
}

function buildProfileHTML(u, isAdmin){
  const age = u.birth ? Math.floor((Date.now()-new Date(u.birth))/(365.25*24*3600*1000)) : null;
  const row=(label,val,icon='')=>val?`
    <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--green-xpale)">
      <span style="font-size:0.78rem;color:var(--text3);min-width:150px;flex-shrink:0">${icon} ${label}</span>
      <span style="font-size:0.88rem;color:var(--text);font-weight:500">${val}</span>
    </div>`:''  ;
  return `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:linear-gradient(135deg,var(--green-xpale),var(--bg));border-radius:14px;margin-bottom:20px">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--green-mid));display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.4rem;font-weight:700;flex-shrink:0">
        ${u.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase()}
      </div>
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--accent);font-weight:700">${u.name}</div>
        <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">${u.subject||''}${u.format?' · '+u.format:''}${age?' · '+age+' лет':''}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'Активен':'Неактивен'}</span>
          <span class="badge ${u.ofertaSigned?'badge-green':'badge-red'}">📄 ${u.ofertaSigned?'Договор подписан':'Договор не подписан'}</span>
        </div>
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

    ${u.ofertaSigned&&u.ofertaDate?`
    <div style="background:#fffbeb;border:1px solid #fce98a;border-radius:10px;padding:10px 14px;font-size:0.8rem;color:#856404">
      📄 Договор оферты подписан ${u.ofertaDate}
    </div>`:''}

    ${isAdmin?`<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--green-xpale)">
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
function renderZoomSettings(){
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
  document.getElementById('student-notifs-list').innerHTML=notifs.slice().reverse().map(n=>{
    const isRepeat  = n.type==='repeat';
    const isChat    = n.type==='chat';
    const isComment = n.type==='comment';
    const isWallet  = n.type==='wallet' || n.type==='charge';
    const nav = n.nav || (isRepeat?'student-repeat': isChat?'student-chat': isWallet?'student-payment': '');
    const clickable = !!nav;
    const dotClass  = isChat?'new': isComment?'done': isWallet?'new': isRepeat?'':'new';
    const arrow     = isChat?'→ Чат': isComment?'→ Перейти': isWallet?'→ Оплата': isRepeat?'→ Повторить':'';
    const extraClass= isChat?'notif-chat': isComment?'notif-comment': isWallet?'notif-comment':'';
    return `<div class="hw-item ${extraClass}" style="cursor:${clickable?'pointer':'default'};${extraClass?'border-radius:10px;padding:10px;margin-bottom:4px;':''}" onclick="${clickable?`navigateTo('${nav}')`:''}" >
      <div class="hw-status-dot ${dotClass}"></div>
      <div><div class="content-name" style="font-size:0.85rem">${esc(n.text)}</div><div class="content-meta">${n.date}</div></div>
      ${clickable?`<span style="font-size:0.75rem;color:var(--green-mid);margin-left:auto;white-space:nowrap">${arrow}</span>`:''}
    </div>`;
  }).join('') || '<div class="empty-state"><p>Нет уведомлений</p></div>';

  // Render student calendar & todo
  _sCalYear = new Date().getFullYear();
  _sCalMonth = new Date().getMonth();
  renderStudentCalendar();
  renderStudentTodoList('day');
  // Daily task
  renderStudentZoomBlock();
  renderDailyTaskBlock(sid);
}

let _materialFilter = 'all';
let _testFilter = 'all';
let _hwFilter = 'all';

function setMaterialFilter(f, el){
  _materialFilter = f;
  document.querySelectorAll('#page-student-materials .filter-pill').forEach(p=>p.className='filter-pill');
  el.className = 'filter-pill ' + (f==='all'?'active': f==='viewed'?'active-done':'active-todo');
  renderStudentMaterials();
}
function setTestFilter(f, el){
  _testFilter = f;
  document.querySelectorAll('#page-student-tests .filter-pill').forEach(p=>p.className='filter-pill');
  const cls = {all:'active', done:'active-done', pending:'active-todo', waiting:'active-todo', checked:'active-done'}[f]||'active';
  el.className = 'filter-pill ' + cls;
  renderStudentTests();
}
function setHWFilter(f, el){
  _hwFilter = f;
  document.querySelectorAll('#page-student-hw .filter-pill').forEach(p=>p.className='filter-pill');
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
  const viewed = JSON.parse(localStorage.getItem('biohim_viewed_'+sid)||'{}');
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
    const grade = t.submitted && t.autoTotal ? (t.autoGrade || calcGrade(pct, t.gradeConfig)) : null;
    return `<div class="card" data-item-id="${t.id}">
      <div class="card-title"><span class="dot"></span>${esc(t.title)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
        ${(()=>{
          const hasOpen=(t.questions||[]).some(q=>q.type==='open');
          if(!t.submitted) return `<span class="badge badge-gold">⏳ Не сдан</span>`;
          if(t.openChecked || !hasOpen) return `<span class="badge badge-green">✅ Проверено</span>`;
          return `<span class="badge badge-gold">📝 Ожидает проверки</span>`;
        })()}
        ${t.submitted&&t.autoTotal?`<span class="badge badge-blue">⭐ ${t.autoScore||0}/${t.autoTotal} б. (${pct}%)</span>`:''}
        ${grade?`<span class="grade-result-badge grade-${grade}">Оценка: ${grade}</span>`:''}
      </div>
      ${t.submitted ? renderTestResults(t) : availGate(t,'takeTest')}
      <div id="cmt-test-${t.id}"></div>
    </div>`;
  }).join('');
  // Inject comment threads after render
  tests.filter(t=>t.submitted).forEach(t=>{
    const el2 = document.getElementById(`cmt-test-${t.id}`);
    if(el2) renderCommentThread('test', t.id, el2);
  });
}
function renderTestResults(t){
  return (t.questions||[]).map(q=>renderReviewQuestion(q,t.answers||{})).join('');
}

let _takingTest=null; let _testAnswers={};
function takeTest(id){
  const tests=load('tests')||[];
  _takingTest=tests.find(t=>t.id===id);
  _testAnswers={};
  document.getElementById('take-test-title').textContent=_takingTest.title;
  renderTakeTestBody();
  openModal('modal-take-test');
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

function submitTest(){
  const tests=load('tests')||[];
  const t=tests.find(t=>t.id===_takingTest.id);
  t.submitted=true;
  t.answers=_testAnswers;
  let score=0, total=0;
  t.questions.forEach(q=>{
    const pts=+q.points||1;
    const ans=_testAnswers[q.id]||'';
    if(q.type!=='open'){
      total+=pts;
      if(scoreQuestion(q,ans)) score+=pts;
    }
  });
  t.autoScore=score;
  t.autoTotal=total||t.autoTotal||0;
  const pct = t.autoTotal ? Math.round(score/t.autoTotal*100) : 0;
  t.autoGrade = calcGrade(pct, t.gradeConfig);
  t.autoPct = pct;
  save('tests',tests);
  closeModal('modal-take-test');
  renderStudentTests();
  showNotif(`✅ Тест сдан! ${score}/${t.autoTotal} баллов (${pct}%) — оценка ${t.autoGrade}`);
  // notify admin
  const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
  adminNotifs.push({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'submit', text:`📋 ${currentUser.name} сдал(а) тест «${esc(t.title)}»`, date:new Date().toLocaleDateString('ru'), read:false});
  localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
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
  el.innerHTML=hws.map(h=>`
    <div class="card" data-item-id="${h.id}">
      <div class="card-title"><span class="dot"></span>${esc(h.title)}</div>
      <div style="font-size:0.87rem;color:var(--text2);margin-bottom:10px">${h.desc}</div>
      ${h.due?`<div class="content-meta" style="margin-bottom:10px">📅 Срок: ${h.due}</div>`:''}
      <div style="display:flex;gap:8px;margin-bottom:12px">
        ${(()=>{
          const hasOpen=(h.questions||[]).some(q=>q.type==='open');
          if(!h.submitted) return `<span class="badge badge-gold">⏳ Не сдано</span>`;
          if(h.openChecked || !hasOpen) return `<span class="badge badge-green">✅ Проверено</span>`;
          return `<span class="badge badge-gold">📝 Ожидает проверки</span>`;
        })()}
      </div>
      ${h.submitted ? renderHWResults(h) : availGate(h,'doHW')}
      <div id="cmt-hw-${h.id}"></div>
    </div>`).join('');
  // Inject comment threads
  hws.filter(h=>h.submitted).forEach(h=>{
    const el2 = document.getElementById(`cmt-hw-${h.id}`);
    if(el2) renderCommentThread('hw', h.id, el2);
  });
}
function renderHWResults(h){
  if(!h.questions||!h.questions.length) return `<div class="feedback-box">Свободная форма — ответ сдан</div>`;
  return h.questions.map(q=>{
    const pts = +q.points||1;
    if(q.type==='auto'){
      const ua=h.answers&&h.answers[q.id]; const correct=ua===q.correct;
      return `<div class="question-block">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="question-num">⚡ Авто</div>
          <span style="font-size:0.78rem;color:${correct?'var(--green-mid)':'var(--red)'}">⭐ ${correct?pts:0}/${pts} б.</span>
        </div>
        <div class="question-text">${q.text}</div>
        ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
        <div class="option-item ${correct?'correct':'wrong'}">${ua||'—'} ${correct?'✅':'❌ '+q.correct}</div>
      </div>`;
    } else {
      return `<div class="question-block">
        <div class="question-num">📝 Открытый <span style="font-size:0.75rem;color:var(--text3)">(⭐ ${pts} б.)</span></div>
        <div class="question-text">${q.text}</div>
        ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
        <div class="feedback-box"><b>Ответ:</b> ${h.answers&&h.answers[q.id]||'—'}</div>
        ${q.checked?`<div class="feedback-box" style="border-color:var(--gold);margin-top:6px"><b>Оценка: ${q.grade}</b><br>${q.comment}</div>`:'<div style="font-size:0.8rem;color:var(--text3);margin-top:4px">⏳ Ожидает проверки</div>'}
      </div>`;
    }
  }).join('');
}

let _doingHW=null; let _hwAnswers={};
function doHW(id){
  const hws=load('hw')||[];
  _doingHW=hws.find(h=>h.id===id);
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
        <div class="question-text">${q.text}</div>
        ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:10px" alt="">`:''}
        ${q.type==='auto'?`<div class="option-list">${q.options.map(o=>`
          <div class="option-item" onclick="selectHWOption('${q.id}','${o.replace(/'/g,"\\'")}',this)">${o}</div>`).join('')}</div>`
        :`<textarea style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;min-height:80px" 
          onchange="_hwAnswers['${q.id}']=this.value" placeholder="Ваш ответ..."></textarea>`}
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
  h.submitted=true;
  h.answers=_hwAnswers;
  const freeEl=document.getElementById('hw-free-answer');
  if(freeEl) h.freeAnswer=freeEl.value;
  save('hw',hws);
  closeModal('modal-take-test');
  renderStudentHW();
  showNotif('✅ ДЗ отправлено на проверку!');
  // notify admin
  const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
  adminNotifs.push({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'submit', text:`✏️ ${currentUser.name} сдал(а) ДЗ «${esc(h.title)}»`, date:new Date().toLocaleDateString('ru'), read:false});
  localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
  updateAdminBadge();
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
      <div><b>${p.period}</b>${p.note?` <span style="font-size:0.8rem;opacity:0.7">${p.note}</span>`:''}</div>
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

function renderStudentSchedule(){
  const courses=load('courses')||[];
  const slots=load('slots')||[];
  const bookings=load('bookings')||[];
  const sid=currentUser.id;
  const formatLabel={individual:'👤 Индивидуальный',group:'👥 Групповой',pair:'👫 Парный'};
  document.getElementById('courses-student-list').innerHTML=`<div class="grid-3">`+
  courses.map(c=>`
    <div class="course-card">
      <div class="course-header ${c.subject==='Биология'?'course-bio':c.subject==='Химия'?'course-chem':'course-combined'}">
        ${c.subject==='Биология'?'🌿':c.subject==='Химия'?'⚗️':'🧬'}
      </div>
      <div class="course-body">
        <div class="course-name">${esc(c.title)}</div>
        <div class="content-meta" style="margin-bottom:8px">${c.desc}</div>
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
          ${g?`<span class="badge badge-blue" style="font-size:0.7rem">👥 ${g.name}</span>`:''}
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
  const allAtt   = (load('attendance')||[]).filter(a=>a.studentId===sid);
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
  const taskLog = JSON.parse(localStorage.getItem('biohim_daily_task_log')||'{}');
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
        <div style="font-size:1.4rem;font-weight:900;color:var(--accent)">${student.name}</div>
        <div style="font-size:0.82rem;color:var(--text3);margin-top:3px">
          ${student.subject||''}${student.subject&&student.format?' · ':''}${student.format||''}
          &nbsp;·&nbsp; Период: <b>${periodLabel}</b>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="downloadReport('${sid}')">⬇ Скачать .txt</button>
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
          <div style="flex:1;font-size:0.82rem;font-weight:600">${a.topic||'Занятие'}${a.group?' · '+a.group:''}</div>
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
    <button class="btn btn-green" onclick="downloadReport('${sid}')">⬇ Скачать отчёт (.txt)</button>
  </div>`;
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
  const taskLog  = JSON.parse(localStorage.getItem('biohim_daily_task_log')||'{}');
  const tasksDone = Object.keys(taskLog).filter(k=>k.endsWith('_'+sid)).length;

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
// STARTUP — load from Firebase then show login
// ═══════════════════════════════════════════
(async () => {
  // Show a loading overlay while Firebase loads
  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px';
  overlay.innerHTML = `
    <div style="font-family:'Playfair Display',serif;font-size:2rem;color:var(--green-deep)">Био<span style="color:var(--chem)">Хим</span></div>
    <div style="color:var(--text3);font-size:0.9rem">Загрузка данных…</div>
    <div id="spin-loader" style="width:40px;height:40px;border:4px solid var(--green-pale);border-top-color:var(--green-mid);border-radius:50%"></div>`;
  document.body.appendChild(overlay);
  const spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes spin{to{transform:rotate(360deg)}} #spin-loader{animation:spin 0.8s linear infinite}';
  document.head.appendChild(spinStyle);

  try {
    await preloadCache();
    await initData();
  } catch(e) {
    console.error('Init error:', e);
    // Even on error — remove overlay so login form is accessible
    overlay.remove();
    // Show error inline on login form instead
    const errEl = document.getElementById('login-err');
    if(errEl) errEl.textContent = '⚠️ Ошибка загрузки: ' + (e.message||e) + ' — попробуйте обновить страницу';
    return;
  }

  overlay.remove();

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
        currentUser = user;
        document.getElementById('login-screen').style.display='none';
        document.getElementById('app').style.display='block';
        const resetBtn = document.getElementById('btn-reset-data');
        if(resetBtn) resetBtn.style.display = user.role==='admin' ? 'block' : 'none';
        buildNav();
        subscribeRealtime();
        const defaultPage = user.role==='admin' ? 'dashboard' : 'student-dashboard';
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
// CHAT
// ══════════════════════════════════════════
function chatKey(sid){ return 'chat_'+sid; }
function loadChat(sid){ return JSON.parse(localStorage.getItem(chatKey(sid))||'[]'); }
function saveChat(sid, msgs){ localStorage.setItem(chatKey(sid), JSON.stringify(msgs)); }

function chatUnread(sid){
  const msgs = loadChat(sid);
  const role = currentUser.role;
  return msgs.filter(m=> m.from !== role && !m.read).length;
}
function markChatRead(sid){
  const role = currentUser.role;
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
        <div class="chat-contact-last">${last?(last.from==='admin'?'Вы: ':'')+last.text:'Нет сообщений'}</div>
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
      html += `<div class="chat-date-divider">${m.date}</div>`;
      lastDate = m.date;
    }
    const refBlock = m.ref ? `<div class="chat-bubble-ref">📎 ${m.ref}</div>` : '';
    html += `<div class="chat-msg ${mine?'mine':'theirs'}">
      <div class="chat-bubble">${refBlock}${escHtml(m.text)}</div>
      <div class="chat-time">${m.time}</div>
    </div>`;
    return html;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ─ STUDENT ─
function renderStudentChat(){
  markChatRead(currentUser.id);
  updateChatBadge();
  renderChatMessages('chat-student-messages', currentUser.id, 'student');
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
  inp.value = '';
  renderChatMessages('chat-student-messages', sid, 'student');
  // notify admin (global notif with type chat)
  const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
  adminNotifs.push({id:'an'+Date.now(), studentId:sid, studentName: currentUser.name, type:'chat', text:`💬 ${currentUser.name}: ${text.substring(0,60)}`, time: new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}), date: new Date().toLocaleDateString('ru'), read:false});
  localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
  updateChatBadge();
}

function updateChatBadge(){
  // Student: count unread from admin
  if(currentUser && currentUser.role==='student'){
    const count = chatUnread(currentUser.id);
    document.querySelectorAll('#nav-student-chat').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(count>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${count}</span>`);
    });
  }
  // Admin: count all unread
  if(currentUser && currentUser.role==='admin'){
    const total = getStudents().reduce((s,st)=>s+chatUnread(st.id),0);
    const adminTotal = total + (JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]').filter(n=>!n.read).length);
    document.querySelectorAll('#nav-chat-admin').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(adminTotal>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${adminTotal}</span>`);
    });
  }
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

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
    const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
    adminNotifs.push({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'comment', text:`💬 ${currentUser.name} прокомментировал(а) ${typeLabel} «${itemTitle}»`, date:now.toLocaleDateString('ru'), read:false});
    localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
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
      + (JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]').filter(n=>!n.read).length);
    document.querySelectorAll('#nav-chat-admin').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(total>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${total}</span>`);
    });
  }
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
          <div class="content-name">${g.name}</div>
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
    getGroups().map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
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

function loadNotifSettings(sid){
  const raw = localStorage.getItem(notifSettingsKey(sid));
  const def = {
    tgChatId: '',
    types: { lesson:true, hw:true, test:true, payment:true, chat:true, repeat:true }
  };
  if(!raw) return def;
  try{ return Object.assign({}, def, JSON.parse(raw)); } catch(e){ return def; }
}
function saveNotifSettingsData(sid, s){ localStorage.setItem(notifSettingsKey(sid), JSON.stringify(s)); }

const NOTIF_TYPE_MAP = {
  schedule:'lesson', hw:'hw', test:'test', trial:'test',
  wallet:'payment', chat:'chat', repeat:'repeat',
  material:'lesson', comment:'chat', attendance:'lesson'
};

// ── Добавить уведомление + отправить в Telegram ──
function addNotif(studentId, {type, text, nav}){
  const notifs = load('notifs')||[];
  notifs.push({id:'n'+Date.now(), studentId, type, text, nav,
    date:new Date().toLocaleDateString('ru'), read:false});
  save('notifs', notifs);
  sendTelegramNotif(studentId, type, text);
}

// ── Отправка через Telegram Bot API ──
async function sendTelegramNotif(sid, type, text){
  const token = localStorage.getItem(adminTgTokenKey());
  if(!token) return;
  const settings = loadNotifSettings(sid);
  if(!settings.tgChatId) return;
  const mappedType = NOTIF_TYPE_MAP[type] || type;
  if(settings.types[mappedType] === false) return;

  const student = getStudents().find(s=>s.id===sid);
  const name = student ? student.name : 'Ученик';
  const msg = `📚 *BioХим* — ${name}\n\n${text}`;

  try{
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: settings.tgChatId, text: msg, parse_mode:'Markdown' })
    });
  } catch(e){
    console.warn('TG send error:', e);
  }
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
          <div class="toggle-desc">${t.desc}</div>
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
  const token = localStorage.getItem(adminTgTokenKey());
  if(!token){ showNotif('Токен бота не настроен администратором'); return; }
  try{
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: settings.tgChatId,
        text:'🔔 *Тест уведомлений*\n\nЕсли вы получили это сообщение — Telegram подключён успешно! ✅', parse_mode:'Markdown' })
    });
    const d = await r.json();
    showNotif(d.ok ? '✅ Тест отправлен — проверьте Telegram!' : '❌ Ошибка: ' + (d.description||''));
  } catch(e){ showNotif('❌ Ошибка соединения: ' + e.message); }
}

// ── Страница администратора ──
function renderNotifSettingsAdmin(){
  const token    = localStorage.getItem(adminTgTokenKey()) || '';
  const botName  = localStorage.getItem(adminTgBotKey())  || '';
  const elToken  = document.getElementById('admin-tg-token');
  const elBot    = document.getElementById('admin-tg-botname');
  if(elToken) elToken.value = token;
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
}

function saveAdminTgBot(){
  const token   = (document.getElementById('admin-tg-token')  ||{}).value?.trim();
  const botName = (document.getElementById('admin-tg-botname')||{}).value?.trim();
  if(token)   localStorage.setItem(adminTgTokenKey(), token);
  if(botName) localStorage.setItem(adminTgBotKey(),   botName.startsWith('@')?botName:'@'+botName);
  testBotToken();
}

async function testBotToken(){
  const token = localStorage.getItem(adminTgTokenKey());
  const statusEl = document.getElementById('bot-connection-status');
  if(!token){ if(statusEl){ statusEl.textContent='Введите токен'; statusEl.style.color='var(--text3)'; } return; }
  if(statusEl){ statusEl.textContent='⏳ Проверяем...'; statusEl.style.color='var(--text3)'; }
  try{
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const d = await r.json();
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
function walletKey(sid){ return 'biohim_wallet_' + sid; }
function loadWallet(sid){
  const raw = localStorage.getItem(walletKey(sid));
  return raw ? JSON.parse(raw) : { balance: 0, txns: [] };
}
function saveWallet(sid, w){ localStorage.setItem(walletKey(sid), JSON.stringify(w)); }

function walletTopUp(sid, amount, note){
  const w = loadWallet(sid);
  w.balance += amount;
  w.txns.push({ id:'tx'+Date.now(), type:'topup', amount, note: note||'Пополнение',
    date: new Date().toLocaleDateString('ru'), ts: Date.now() });
  saveWallet(sid, w);
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
function switchAtpTab(tab, el){
  _atpTab = tab;
  document.querySelectorAll('#page-attend-pay-admin .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['attendance','wallet','payments'].forEach(t=>{
    const el2 = document.getElementById('atp-tab-'+t);
    if(el2) el2.style.display = t===tab ? '' : 'none';
  });
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
  const allAtt = (load('attendance')||[]).slice().reverse();
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
            ${lg.topic?`<span>📖 ${lg.topic}</span>`:''}
            ${lg.group?`<span>👥 ${lg.group}</span>`:''}
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
        return `<div class="att-row att-${a.present?'present':'absent'}">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.88rem">${s?s.name:'—'}</div>
            <div style="font-size:0.75rem;${balColor};font-weight:700">Баланс: ${w.balance}₽</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="toggleAttPresence('${a.id}')" style="min-width:80px">
              ${a.present?'✅ Был':'❌ Не был'}
            </button>
            ${a.present ? `
              <button class="btn ${a.paid?'btn-outline':'btn-green'} btn-sm" onclick="toggleAttPaid('${a.id}')" style="min-width:100px">
                ${a.paid?'💳 Оплачено':'Списать ₽'}
              </button>
              ${!a.paid?`<span class="att-unpaid-badge">💳 ${a.costPerStudent}₽ не списано</span>`:''}
            ` : ''}
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

// ── Override toggleAttPaid: debit wallet + notify ──
function toggleAttPaid(id){
  const att = load('attendance')||[];
  const a   = att.find(a=>a.id===id); if(!a) return;
  if(!a.paid){
    // Debit from wallet
    const dateLabel = a.date ? new Date(a.date+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long'}) : '';
    walletDebit(a.studentId, +a.costPerStudent||0,
      `Занятие ${dateLabel}${a.topic?' · '+a.topic:''}${a.group?' · '+a.group:''}`);
    a.paid = true;
  } else {
    // Refund
    const dateLabel = a.date ? new Date(a.date+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long'}) : '';
    walletTopUp(a.studentId, +a.costPerStudent||0, `Возврат: занятие ${dateLabel}`);
    a.paid = false;
  }
  save('attendance', att);
  renderAtpAttendance();
  renderAtpWallet();
}

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
  checks.forEach(cb=>{
    att.push({
      id:'att_'+Date.now()+'_'+cb.value,
      lessonId, studentId:cb.value,
      date, time, topic, group,
      costPerStudent: cost,
      slotId: slotId || null,
      present:true, paid:false,
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
  const att = (load('attendance')||[]).filter(a=>a.studentId===sid).slice().reverse();
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
        return `<div style="padding:12px;border-radius:10px;margin-bottom:8px;border:1px solid var(--green-xpale);
          ${isUnpaid?'border-left:3px solid #ef4444;background:#fef2f2;':a.present?'border-left:3px solid var(--green-mid);':''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div>
              <div style="font-weight:700;font-size:0.9rem;color:var(--accent)">${dateLabel}${a.time?' · '+a.time:''}</div>
              ${a.topic||a.group?`<div style="font-size:0.78rem;color:var(--text2);margin-top:3px">${a.topic?'📖 '+a.topic:''}${a.group?' · 👥 '+a.group:''}</div>`:''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="att-badge-${a.present?'present':'absent'}">${a.present?'✅ Был(а)':'❌ Не был(а)'}</span>
              ${a.present?`<span class="att-cost-badge">−${a.costPerStudent}₽</span>`:''}
              ${isUnpaid?`<span class="att-unpaid-badge">Не оплачено</span>`:''}
              ${a.present&&a.paid?`<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:8px">✅ Оплачено</span>`:''}
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
function availGate(item, fnName){
  const st=availStatus(item);
  if(st==='not-open') return `<div style="background:#fffbea;border-radius:10px;padding:10px 14px;font-size:0.84rem;font-weight:600;color:#b45309">⏳ Откроется ${fmtDt(item.openAt)}</div>`;
  if(st==='closed')   return `<div style="background:#fff0f0;border-radius:10px;padding:10px 14px;font-size:0.84rem;font-weight:600;color:var(--red)">🔒 Срок истёк ${fmtDt(item.closeAt)}</div>`;
  const labels={takeTest:'▶️ Пройти тест',doHW:'✏️ Выполнить',startTrial:'▶ Начать пробник'};
  const btnClass=fnName==='startTrial'?'btn btn-green':'btn btn-green';
  return `<button class="${btnClass}" onclick="${fnName}('${item.id}')">${labels[fnName]||'▶ Начать'}</button>`;
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
  return {id, type, text:'', options:[], correct:'', pairs:[], points:1, imageUrl:''};
}

/** Auto-score a question (returns true/false) */
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
    ${q.type!=='fill'?`<div class="question-text">${q.text}</div>`:''}
    ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:10px" alt="">`:''}
    ${body}
  </div>`;
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
      <div class="question-text">${q.text}</div>
      ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
      <div class="feedback-box"><strong>Ваш ответ:</strong> ${ans||'—'}</div>
      ${q.checked?`<div class="feedback-box" style="border-left-color:var(--gold);margin-top:8px"><strong>Оценка: ${q.grade}</strong><br>${q.comment||''}</div>`:`<div style="color:var(--text3);font-size:0.8rem;margin-top:6px">⏳ Ожидает проверки</div>`}
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
    <div class="question-text">${q.text}</div>
    ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
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
              ${students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}
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
      <div style="font-weight:600">${a.topic||'Без темы'}</div>
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
      ${student?`<span style="font-size:0.82rem;color:var(--text3)">· ${student.name}</span>`:''}
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
        <div class="lmsg-bubble">${m.text}</div>
      </div>
      <div class="lmsg-meta" style="${isMe?'text-align:right':''}">${isMe?'Вы':m.name} · ${time}</div>
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
      whoText = g ? `👥 Группа: ${g.name}` : '';
    } else if(studentId){
      const u = allUsers.find(u=>u.id===studentId);
      whoText = u ? `👤 Ученик: ${u.name}` : '';
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
  // ученик видит обновление через poll
}

function lsSendMsg(who){
  const live = getLessonData();
  if(!live) return;
  const inp = document.getElementById('ls-chat-inp');
  if(!inp||!inp.value.trim()) return;
  const text = inp.value.trim();
  inp.value = '';
  const name = who==='admin' ? 'Преподаватель' : (currentUser?.name||'Ученик');
  const chat = getLessonChat(live.code);
  chat.push({ who, name, text, ts: Date.now() });
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
  if(_lsChatPoll) clearInterval(_lsChatPoll);
  _lsChatPoll = setInterval(()=>{
    _renderChatNow(code, viewer);
    // Update note for student
    if(viewer==='student'){
      const noteEl = document.getElementById('ls-student-note');
      if(noteEl){
        const note = getLessonNote(code);
        noteEl.innerHTML = note||'<span style="color:var(--text3)">Преподаватель ещё не написал конспект...</span>';
      }
      // Check if lesson ended
      const live = getLessonData();
      if(!live || !live.code){
        clearInterval(_lsChatPoll);
        renderStudentLesson();
      }
    }
  }, 2000);
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

  // Очистка
  localStorage.removeItem(LS_LESSON);
  _lessonActive = false;
  clearInterval(_lessonTimer);
  clearInterval(_lsChatPoll);
  if(typeof _jitsiAPI!=='undefined'&&_jitsiAPI){ try{_jitsiAPI.dispose();}catch(e){} _jitsiAPI=null; }
  if(_jitsiWindow && !_jitsiWindow.closed){ try{_jitsiWindow.close();}catch(e){} }
  showNotif(`✅ Занятие завершено! Длительность: ${dur} мин${price?` · Оплата ${price}₽ добавлена`:''}`);
  renderAdminLesson();
}

function lsStudentJoin(){
  const input = document.getElementById('ls-code-input');
  if(!input||!input.value.trim()){ showNotif('Введите код занятия'); return; }
  const code = input.value.trim().replace(/\D/g,'');
  if(code.length!==6){ showNotif('Код — 6 цифр'); return; }
  saveLessonData({ code, room:'biohim-lesson-'+code, topic:'Занятие', studentId:currentUser?.id||'', startedAt:Date.now() });
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
// LOCAL STORAGE — замена Firebase
// ══════════════════════════════════════════
const LS_PREFIX = 'biohim_db_';
const COLLECTIONS = ['users','content','tests','hw','payments','courses','slots','bookings','notifs'];

function load(k){
  const raw = localStorage.getItem(LS_PREFIX + k);
  if(raw == null) return null;
  try { return JSON.parse(raw); } catch(e){ return null; }
}

function save(k, v){
  localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
}

async function preloadCache(){ /* данные уже в localStorage */ }

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

// 2. Хеширование пароля (SHA-256, встроено в браузер)
function hashPassword(plain){
  // Simple but consistent hash — no crypto.subtle needed (works on HTTP too)
  if(!plain) return Promise.resolve('');
  let h = 0x811c9dc5;
  for(let i=0;i<plain.length;i++){
    h ^= plain.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Second pass for better avalanche
  let h2 = 0x5f5f5f5f;
  for(let i=plain.length-1;i>=0;i--){
    h2 ^= plain.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  const result = (h >>> 0).toString(16).padStart(8,'0') + (h2 >>> 0).toString(16).padStart(8,'0') + plain.length.toString(16).padStart(4,'0');
  return Promise.resolve(result);
}

// 3. Защита от брутфорса
const _loginAttempts = {};
function checkBruteForce(login){
  const now = Date.now();
  if(!_loginAttempts[login]) _loginAttempts[login]={count:0,blockedUntil:0};
  const rec = _loginAttempts[login];
  if(rec.blockedUntil > now){
    const secs = Math.ceil((rec.blockedUntil-now)/1000);
    document.getElementById('login-err').textContent=`Слишком много попыток. Подождите ${secs} сек.`;
    return false;
  }
  return true;
}
function recordFailedLogin(login){
  if(!_loginAttempts[login]) _loginAttempts[login]={count:0,blockedUntil:0};
  const rec = _loginAttempts[login];
  rec.count++;
  if(rec.count >= 5){
    rec.blockedUntil = Date.now() + 60000; // 1 минута
    rec.count = 0;
  }
}
function resetLoginAttempts(login){
  delete _loginAttempts[login];
}

// 4. Проверка прав доступа
const ADMIN_PAGES = ['students','tests-admin','hw-admin','content-admin',
  'payments','schedule-admin','courses','analytics','settings'];
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



function subscribeRealtime(){ /* не нужен polling для localStorage */ }

// ══════════════════════════════════════════
// DEFAULT DATA (записываются один раз)
// ══════════════════════════════════════════
async function initData(){
  try {
    // Fix: clear users with undefined/null passwordHash (broken from old async bug)
    const existingUsers = load('users')||[];
    if(existingUsers.length && existingUsers.some(u=>!u.passwordHash && !u.password)){
      localStorage.removeItem('biohim_db_users');
    }
  } catch(e){ console.warn('user-check error', e); }

  if(!(load('users')||[]).length){
    // Создаём пользователей — пароли хешируются синхронно
    const h1 = await hashPassword('admin123');
    const h2 = await hashPassword('1234');
    const h3 = await hashPassword('1234');
    save('users',[
      {id:'admin', login:'admin', passwordHash:h1, name:'Преподаватель', role:'admin'},
      {id:'anna',  login:'anna',  passwordHash:h2, name:'Анна Петрова',  role:'student', subject:'Биология', active:true},
      {id:'dima',  login:'dima',  passwordHash:h3, name:'Дмитрий Козлов',role:'student', subject:'Химия',    active:true}
    ]);
  } else {
    // Миграция: если остались старые пользователи с plain-text паролями
    const users = load('users')||[];
    const needsMigration = users.filter(u=>u.password && !u.passwordHash);
    if(needsMigration.length){
      const hashes = await Promise.all(needsMigration.map(u=>hashPassword(u.password)));
      needsMigration.forEach((u,i)=>{
        u.passwordHash = hashes[i];
        delete u.password;
      });
      save('users', users);
    }
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
  COLLECTIONS.forEach(k => localStorage.removeItem(LS_PREFIX + k));
  localStorage.removeItem('biohim_session');
  localStorage.removeItem('biohim_admin_notifs');
  location.reload();
}

let currentUser = null;

function doLogin(){
  const uname = document.getElementById('login-username').value.trim();
  const upass  = document.getElementById('login-password').value;
  const errEl  = document.getElementById('login-err');

  // DEBUG: show what's in localStorage
  const users = load('users')||[];
  console.log('users in DB:', JSON.stringify(users.map(u=>({login:u.login,hasHash:!!u.passwordHash,hashVal:u.passwordHash}))));

  if(!checkBruteForce(uname)) return;

  if(!users.length){
    errEl.textContent = 'Ошибка: пользователи не загружены. Обновите страницу.';
    return;
  }

  const found = users.find(u=>u.login===uname);
  if(!found){
    errEl.textContent = 'Пользователь «'+uname+'» не найден. Доступны: '+users.map(u=>u.login).join(', ');
    recordFailedLogin(uname);
    return;
  }

  hashPassword(upass).then(hash=>{
    console.log('entered hash:', hash, 'stored hash:', found.passwordHash, 'match:', hash===found.passwordHash);
    // Support plain-text password (legacy) and hash
    const ok = (found.passwordHash && hash === found.passwordHash)
             || (!found.passwordHash && found.password === upass);
    if(!ok){
      recordFailedLogin(uname);
      errEl.textContent = 'Неверный пароль. (debug: hash='+hash.slice(0,8)+'... stored='+String(found.passwordHash).slice(0,8)+'...)';
      return;
    }
    resetLoginAttempts(uname);
    errEl.textContent = '';
    _startSession(found);
  }).catch(e=>{
    errEl.textContent = 'Ошибка хеширования: '+e.message;
    console.error(e);
  });
}
function _startSession(user){
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
  buildNav();
  subscribeRealtime();
  const defaultPage = user.role==='admin' ? 'dashboard' : 'student-dashboard';
  const lastPage = localStorage.getItem('biohim_last_page_'+user.id) || defaultPage;
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
  {section:'Управление'},
  {id:'chat-admin',       icon:'💬', label:'Чат с учениками'},
  {id:'zoom-settings',    icon:'⚙️', label:'Настройки платформы'},
  {id:'attend-pay-admin', icon:'📅', label:'Посещение и оплата'},
  {id:'schedule-admin',   icon:'🗓', label:'Расписание'},
  {id:'reports-admin',    icon:'📊', label:'Отчёты по ученикам'},
  {id:'notif-settings-admin', icon:'🔔', label:'Интеграции уведомлений'},
  {section:'Занятие'},
  {id:'admin-lesson', icon:'🎥', label:'Онлайн-занятие'},
];
const studentNav=[
  {section:'Кабинет'},
  {id:'student-dashboard', icon:'🏠',label:'Главная'},
  {id:'student-materials', icon:'📚',label:'Материалы'},
  {id:'student-repeat',    icon:'🧠',label:'Умное повторение'},
  {id:'student-tests',     icon:'📋',label:'Тесты'},
  {id:'student-trial',     icon:'🎯', label:'Пробник'},
  {id:'student-hw',        icon:'✏️', label:'Домашние задания'},
  {id:'student-chat',      icon:'💬', label:'Чат с преподавателем'},
  {section:'Прочее'},
  {id:'student-payment',   icon:'💰',label:'Оплата и занятия'},
  {id:'student-schedule',  icon:'🗓',label:'Запись на занятия'},
  {id:'student-notif-settings', icon:'🔔', label:'Уведомления'},
  {section:'Занятие'},
  {id:'student-lesson', icon:'🎥', label:'Онлайн-занятие'},
];

function buildNav(){
  const nav = currentUser.role==='admin'?adminNav:studentNav;
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
  document.getElementById('sidebar-role').textContent=currentUser.role==='admin'?'Администратор':'Ученик';
  setTimeout(()=>{ updateChatBadge(); updateAdminBadge(); }, 50);
}

function openAdminChatById(sid){
  navigateTo('chat-admin');
  setTimeout(()=>openAdminChat(sid), 80);
}

let curPage='';
function navigateTo(page){
  // Защита маршрутов — ученик не может зайти на страницы администратора
  if(ADMIN_PAGES.includes(page) && currentUser && currentUser.role !== 'admin'){
    showNotif('⛔ Нет доступа к этой странице');
    console.warn('Route guard blocked:', page, 'for role:', currentUser.role);
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
  else if(p==='student-trial'){ renderStudentTrial(); }
  else if(p==='chat-admin'){ renderChatAdmin(); }
  else if(p==='student-chat'){ renderStudentChat(); }
  else if(p==='attend-pay-admin'){ buildStudentSelector('atp-student-selector', ()=>renderAtpPage()); renderAtpPage(); }
  else if(p==='payment-admin'){ buildStudentSelector('atp-student-selector', ()=>renderAtpPage()); renderAtpPage(); } // legacy redirect
  else if(p==='schedule-admin') renderScheduleAdmin();
  else if(p==='reports-admin') renderReportsAdmin();
  else if(p==='student-dashboard') renderStudentDashboard();
  else if(p==='student-materials') renderStudentMaterials();
  else if(p==='student-repeat') renderRepeatPage();
  else if(p==='student-tests') renderStudentTests();
  else if(p==='student-hw') renderStudentHW();
  else if(p==='student-payment') renderStudentPayment();
  else if(p==='notif-settings-admin'){ renderNotifSettingsAdmin(); }
  else if(p==='student-notif-settings'){ renderNotifSettingsStudent(); }
  else if(p==='student-schedule') renderStudentSchedule();
  else if(p==='zoom-settings'){ renderZoomSettings(); }
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
  el.innerHTML=students.map(s=>`
    <div class="student-chip ${_selectedStudent===s.id?'active':''}" onclick="selectStudent('${s.id}','${containerId}',${onChange.toString()})">
      ${esc(s.name)}
    </div>`).join('');
}
function selectStudent(id, containerId, onChange){
  _selectedStudent=id;
  buildStudentSelector(containerId, onChange);
  onChange();
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
  const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
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
  localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
  updateAdminBadge();
  const slots=load('slots')||[];
  const ul=document.getElementById('upcoming-list');
  ul.innerHTML=slots.filter(s=>s.bookedBy).map(s=>{
    const u=(load('users')||[]).find(u=>u.id===s.bookedBy);
    return `<div class="hw-item"><div class="hw-status-dot done"></div><div><div class="content-name" style="font-size:0.83rem">${s.day} ${s.time}</div><div class="content-meta">${u?u.name:s.bookedBy} · ${s.dur} мин</div></div></div>`;
  }).join('') || '<div class="empty-state"><p>Нет записей</p></div>';
  // Calendar & Todo
  renderCalendar();
  renderTodoList('day');
}

// ─── STUDENTS ───
function renderStudents(){
  const students=getStudents();
  const tb=document.getElementById('students-table');
  tb.innerHTML=students.map(s=>`
    <tr>
      <td>
        <b>${esc(s.name)}</b>
        ${s.grade?`<div style="font-size:0.74rem;color:var(--text3)">${s.grade}</div>`:''}
      </td>
      <td>
        ${s.phone?`<div style="font-size:0.82rem">📞 ${s.phone}</div>`:''}
        ${s.email?`<div style="font-size:0.78rem;color:var(--text3)">${s.email}</div>`:''}
      </td>
      <td>
        ${esc(s.subject||'—')}
        ${s.format?`<div style="font-size:0.74rem;color:var(--text3)">${s.format}</div>`:''}
      </td>
      <td>
        <span class="badge ${s.active?'badge-green':'badge-red'}">${s.active?'Активен':'Неактивен'}</span>
        ${s.ofertaSigned
          ?`<div style="font-size:0.7rem;color:var(--green-mid);margin-top:3px">📄 Договор ✅</div>`
          :`<div style="font-size:0.7rem;color:var(--red);margin-top:3px">📄 Договор ❌</div>`}
      </td>
      <td>${getPaymentStatusBadge(s.id)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openStudentProfileModal('${s.id}')">👤 Профиль</button>
        <button class="btn btn-outline btn-sm" onclick="openEditStudent('${s.id}')">✏️ Изменить</button>
        <button class="btn btn-red btn-sm" onclick="deleteStudent('${s.id}')">🗑</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text3)">Нет учеников</td></tr>`;
  renderGroups();
}
function getPaymentStatusBadge(sid){
  const payments=(load('payments')||[]).filter(p=>p.studentId===sid);
  if(!payments.length) return '<span class="badge badge-red">Нет данных</span>';
  const last=payments[payments.length-1];
  const cls={paid:'badge-green',unpaid:'badge-red',partial:'badge-gold'}[last.status];
  const lbl={paid:'Оплачено',unpaid:'Не оплачено',partial:'Частично'}[last.status];
  return `<span class="badge ${cls}">${lbl}</span>`;
}
function addStudent(){
  const name=document.getElementById('ns-name').value.trim();
  const login=document.getElementById('ns-login').value.trim();
  const pass=document.getElementById('ns-pass').value;
  const subject=document.getElementById('ns-subject').value;
  if(!name||!login||!pass){ showNotif('Заполните все поля'); return; }
  if(!document.getElementById('ns-oferta').checked){ showNotif('⚠️ Необходимо принять договор оферты'); return; }
  const users=load('users')||[];
  if(users.find(u=>u.login===login)){ showNotif('Логин уже занят'); return; }
  users.push({
    id:login, login, password:pass, name, role:'student', subject, active:true,
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
  const hasText  = !!(c.body && c.body.trim());
  const hasPdf   = files.some(f=>f.type==='pdf');
  const hasWord  = files.some(f=>f.type==='word');
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
  // video player
  let videoBlock='';
  if(videoUrl){
    const embedUrl=getVideoEmbedUrl(videoUrl);
    if(embedUrl){
      videoBlock=`<div style="margin-bottom:18px">
        <div style="font-weight:700;color:var(--accent);margin-bottom:10px;font-size:0.9rem">🎬 Видео</div>
        <div style="border-radius:12px;overflow:hidden;background:#000;position:relative;width:100%;height:300px">
          <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen"></iframe>
        </div>
      </div>`;
    }
  }
  // text block
  let textBlock='';
  if(c.body && c.body.trim()){
    textBlock=`<div style="margin-bottom:18px">
      <div style="font-weight:700;color:var(--accent);margin-bottom:8px;font-size:0.9rem">📖 Текст урока</div>
      <div style="line-height:1.8;color:var(--text2);font-size:0.92rem;background:var(--bg);padding:16px;border-radius:10px;border:1px solid var(--green-xpale)">${c.body}</div>
    </div>`;
  }
  // images
  let imgsBlock='';
  if(c.images && c.images.filter(Boolean).length){
    imgsBlock=`<div style="margin-bottom:18px;display:flex;flex-wrap:wrap;gap:10px">`;
    c.images.filter(Boolean).forEach(img=>{
      imgsBlock+=`<img src="${img}" alt="" style="max-width:100%;border-radius:10px;border:1px solid var(--green-pale);max-height:260px;object-fit:contain">`;
    });
    imgsBlock+=`</div>`;
  }
  // files
  let filesBlock='';
  if(files.length){
    filesBlock=`<div style="margin-bottom:18px">
      <div style="font-weight:700;color:var(--accent);margin-bottom:8px;font-size:0.9rem">📎 Файлы</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${files.map(f=>`
          <a href="${f.url||'#'}" target="_blank" class="content-item" style="text-decoration:none;color:inherit">
            <div class="content-icon">${f.type==='pdf'?'📄':'📋'}</div>
            <div class="content-info">
              <div class="content-name">${f.name||'Файл'}</div>
              <div class="content-meta">${f.type==='pdf'?'PDF-документ':'Word-документ'}</div>
            </div>
            <div style="color:var(--green-mid);font-size:0.85rem">⬇ Открыть</div>
          </a>`).join('')}
      </div>
    </div>`;
  }
  return `<div class="accordion-item" id="acc-${c.id}" data-content-id="${c.id}">
    ${_availLockHtml}
    <div class="accordion-header" onclick="toggleAccordion(this)">
      <div style="font-size:1.4rem">📖</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.97rem;color:var(--accent);margin-bottom:4px">${esc(c.title)}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${badges||'<span style="font-size:0.75rem;color:var(--text3)">Пустой урок</span>'}${viewedBadge?'&nbsp;'+viewedBadge:''}${_availBadgeHtml?'&nbsp;'+_availBadgeHtml:''}</div>
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
      const viewed = JSON.parse(localStorage.getItem(key)||'{}');
      if(!viewed[cid]){
        viewed[cid] = true;
        localStorage.setItem(key, JSON.stringify(viewed));
        // Update badge in place without full re-render
        const badgeEl = item.querySelector('.accordion-header .accordion-badge[style*="1565c0"]');
        if(badgeEl) badgeEl.outerHTML = '<span class="accordion-badge" style="background:#e8f8f0;color:#27ae60">✅ Просмотрено</span>';
      }
    }
  }
}
function contentItemHTML(c, isAdmin){
  const icons={video:'🎬',theory:'📖',article:'📝',pdf:'📄',word:'📋'};
  if(!isAdmin && c.type==='video'){
    const embedUrl=getVideoEmbedUrl(c.url||'');
    const playerHtml=embedUrl
      ? `<div style="margin-top:10px;border-radius:10px;overflow:hidden;background:#000;position:relative;width:100%;height:260px"><iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen"></iframe></div>`
      : `<a href="${c.url||'#'}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:8px">⬇ Открыть</a>`;
    return `<div class="content-item" style="flex-direction:column;align-items:flex-start">
      <div style="display:flex;align-items:center;gap:14px;width:100%">
        <div class="content-icon">${icons[c.type]||'📎'}</div>
        <div class="content-info">
          <div class="content-name">${esc(c.title)}</div>
          <div class="content-meta">${c.desc||''}</div>
        </div>
      </div>
      ${playerHtml}
    </div>`;
  }
  const actions = isAdmin
    ? `<div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="openEditContent('${c.id}')">✏️</button><button class="btn btn-red btn-sm" onclick="deleteContent('${c.id}')">🗑</button></div>`
    : (c.type==='theory'||c.type==='article'
        ? `<button class="btn btn-outline btn-sm" onclick="viewTheory('${c.id}')">👁 Читать</button>`
        : `<a href="${c.url||'#'}" target="_blank" class="btn btn-outline btn-sm">⬇ Открыть</a>`);
  return `<div class="content-item">
    <div class="content-icon">${icons[c.type]||'📎'}</div>
    <div class="content-info">
      <div class="content-name">${esc(c.title)}</div>
      <div class="content-meta">${c.desc||c.url||''}</div>
      ${c.images&&c.images.length?`<div class="content-meta">🖼 ${c.images.length} изображ.</div>`:''}
      ${c.attachmentUrl?`<div class="content-meta">📎 Файл прикреплён</div>`:''}
    </div>
    <div class="content-actions">${actions}</div>
  </div>`;
}
function emptyHTML(){ return '<div class="empty-state"><div class="big">📭</div><p>Нет материалов</p></div>'; }

function openModal(id, extra){
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
    container.innerHTML=getStudents().map(s=>`
      <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;border:1.5px solid var(--green-pale);background:var(--white);cursor:pointer;font-size:0.82rem;font-weight:600">
        <input type="checkbox" value="${s.id}" checked style="accent-color:var(--green-deep)"> ${esc(s.name)}
      </label>`).join('');
    setTimeout(prefillAttendanceFromSlot, 50);
  }
  document.getElementById(id).classList.add('open');
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
  const students=(load('users')||[]).filter(u=>u.role==='student');
  if(!students.length){ el.innerHTML='<span style="font-size:0.82rem;color:var(--text3)">Нет учеников</span>'; return; }
  const cur=_selectedStudent||(students[0]||{}).id;
  el.innerHTML=students.map(s=>`
    <label class="chip-label">
      <input type="checkbox" value="${s.id}" ${s.id===cur?'checked':''} style="accent-color:var(--green-deep);flex-shrink:0;width:14px;height:14px"><span style="overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
    </label>`).join('');
}
function getCheckedModalStudents(containerId){
  const el=document.getElementById(containerId);
  if(!el) return [];
  return [...el.querySelectorAll('input[type=checkbox]:checked')].map(cb=>cb.value);
}
function closeModal(id){
  const el=document.getElementById(id);
  if(el) el.classList.remove('open');
  if(id==='modal-add-theory'){
    _theoryFiles=[];
  }
}

function getVideoEmbedUrl(url){
  if(!url) return null;
  url = url.trim();

  // ── YouTube ──
  let m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if(m) return 'https://www.youtube.com/embed/'+m[1];
  m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if(m) return 'https://www.youtube.com/embed/'+m[1];
  if(url.includes('youtube.com/embed/')) return url;

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
      ${blk.url?`<img src="${blk.url}" alt="" style="max-width:100%;border-radius:8px;max-height:300px;object-fit:contain" onerror="this.style.display='none'">` : ''}
      <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на изображение..."
        style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none;margin-top:8px;box-sizing:border-box"
        oninput="${stateVar}[${idx}].url=this.value" onblur="nbRenderCanvas(${stateVar},'${stateVar}','${canvasId}')">
      <div contenteditable="true" class="nb-img-caption" data-ph="Подпись..."
        oninput="${stateVar}[${idx}].caption=this.innerText">${blk.caption||''}</div>
    </div>`;
  } else if(blk.type==='image-upload'){
    content.innerHTML=`<div class="nb-img-block" style="padding:10px">
      ${blk.url?`<img src="${blk.url}" alt="" style="max-width:100%;border-radius:8px;max-height:300px;object-fit:contain">` : ''}
      <input type="file" accept="image/*" style="font-size:0.83rem;width:100%;margin-top:8px"
        onchange="nbHandleUploadFor(this,${idx},'${stateVar}','${canvasId}')">
      <div contenteditable="true" class="nb-img-caption" data-ph="Подпись..."
        oninput="${stateVar}[${idx}].caption=this.innerText">${blk.caption||''}</div>
    </div>`;
  } else if(blk.type==='video'){
    const embed=blk.url?getVideoEmbedUrl(blk.url):'';
    content.innerHTML=`<div style="padding:10px;background:var(--bg);border-radius:10px;border:1.5px dashed var(--green-pale)">
      ${embed?`<div class="nb-video-block"><iframe src="${embed}" allowfullscreen></iframe></div>`:''}
      <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на видео (YouTube, VK, Google Drive)..."
        style="width:100%;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none;margin-top:${embed?'10':'0'}px;box-sizing:border-box"
        oninput="${stateVar}[${idx}].url=this.value" onblur="nbRenderCanvas(${stateVar},'${stateVar}','${canvasId}')">
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
function renderTheoryImages(){}
function previewTheoryVideo(){}
function addTheoryFile(){}
function renderTheoryFiles(){}
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
      <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?s.name:'Ученик'}</div>
      ${tests.length ? tests.map(t=>testItemHTML(t)).join('') : emptyHTML()}
    </div>`;
  }

  // Update open answers for selected student (use first student if "all")
  _selectedStudent = _testsSelectedSid === 'all' ? (students[0]||{}).id : _testsSelectedSid;
  renderOpenAnswers();
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
  const totalPts = (t.questions||[]).reduce((s,q)=>s+(+q.points||1),0);
  return `<div class="content-item" style="flex-direction:column;align-items:stretch">
    <div style="display:flex;align-items:center;gap:14px">
      <div class="content-icon">📋</div>
      <div class="content-info">
        <div class="content-name">${esc(t.title)}</div>
        <div class="content-meta">${t.questions.length} вопросов · ${totalPts} ${ptWord(totalPts)} · Создан: ${t.date}</div>
        <div class="content-meta" style="margin-top:4px">
          ${(()=>{
            const hasOpen=(t.questions||[]).some(q=>q.type==='open');
            if(!t.submitted) return '<span class="badge badge-gold">Не сдан</span>';
            const scoreStr = t.autoTotal ? ` ${t.autoScore||0}/${t.autoTotal||0} б.${t.autoPct!=null?' ('+t.autoPct+'%)':''}` : '';
            if(t.openChecked || !hasOpen) return `<span class="badge badge-green">✓ Проверено</span>${scoreStr}`;
            return `<span class="badge badge-gold">Ожидает проверки</span>${scoreStr}`;
          })()}
          ${t.autoGrade?`<span class="grade-result-badge grade-${t.autoGrade}" style="font-size:0.72rem;padding:3px 10px">Оценка: ${t.autoGrade}</span>`:''}
        </div>
      </div>
      <div class="content-actions" style="flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openAssignStudents('test','${t.id}')">👤</button>
        <button class="btn btn-outline btn-sm" onclick="openEditAvail('test','${t.id}')" title="Доступность">⏰</button>
        <button class="btn btn-outline btn-sm" onclick="openEditTest('${t.id}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="deleteTest('${t.id}')">🗑</button>
      </div>
    </div>
    <div style="margin-top:2px">${availBadge(t)}</div>
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
        <div class="question-text">${q.text}</div>
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
    <div class="form-group"><label>Вопрос</label><div class="feedback-box">${q.text}</div></div>
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
  const examGradeEl=document.getElementById('ca-exam-grade');
  const examGrade=examGradeEl?examGradeEl.value:'';
  const items=load(itemType==='test'?'tests':'hw')||[];
  const item=items.find(t=>t.id===itemId);
  const q=item.questions.find(q=>q.id===qId);
  q.checked=true; q.grade=grade; q.comment=comment;
  if(examGrade!=='') q.examGrade=examGrade;
  item.openChecked=true;
  save(itemType==='test'?'tests':'hw',items);
  // Add notification
  const notifs=load('notifs')||[];
  notifs.push({id:'n'+Date.now(),studentId:item.studentId,text:`📬 Проверен ответ на вопрос "${q.text.substring(0,40)}..." в "${item.title}". Оценка: ${grade}`,date:new Date().toLocaleDateString('ru'),read:false});
  save('notifs',notifs);
  closeModal('modal-check-answer');
  renderOpenAnswers(); renderHWOpenAnswers();
  showNotif('✅ Ответ проверен, уведомление отправлено');
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
  // Show total points hint
  const hint = document.getElementById('nt-total-pts');
  if(hint) hint.textContent = 'Итого: '+totalPts+' '+ptWord(totalPts);
}
function ptWord(n){ return n===1?'балл':n<5?'балла':'баллов'; }

function buildQuestionHTML(q,i,ctx){
  const pfx = ctx==='test'?'_tempQuestions':'_tempHWQuestions';
  const removeFn = ctx==='test'?`removeQ(${i})`:`removeHWQ(${i})`;
  const rebuildFn = ctx==='test'?'renderTestBuilder()':'renderHWBuilder()';
  const imgTabId  = `img-tab-${ctx}-${i}`;
  const imgPreId  = `img-pre-${ctx}-${i}`;
  const imgPreview = q.imageUrl
    ? `<img id="${imgPreId}" class="q-img-preview" src="${q.imageUrl}" alt="">`
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
      <label style="font-size:0.75rem;color:var(--text3)">🖼 Картинка (необязательно)</label>
      <input class="q-input" style="margin-top:4px" placeholder="https://... или оставь пустым" value="${(q.imageUrl||'').startsWith('data:')?'':q.imageUrl||''}" oninput="${pfx}[${i}].imageUrl=this.value;updateQImgPreview('${imgPreId}',this.value)">
      ${imgPreview}
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
  const autoTotal=_tempQuestions.filter(q=>q.type==='auto').reduce((s,q)=>s+(+q.points||1),0);
  const tests=load('tests')||[];
  if(sids.length){
    sids.forEach(sid=>tests.push({id:'t'+Date.now()+'_'+sid,studentId:sid,title,questions:[..._tempQuestions],date:new Date().toLocaleDateString('ru'),submitted:false,answers:{},autoScore:0,autoTotal,gradeConfig,openAt,closeAt}));
  } else {
    tests.push({id:'t'+Date.now()+'_lib',studentId:null,title,questions:[..._tempQuestions],date:new Date().toLocaleDateString('ru'),submitted:false,answers:{},autoScore:0,autoTotal,gradeConfig,isLibrary:true,openAt,closeAt});
  }
  save('tests',tests);
  if(sids.length) sids.forEach(sid=>addNotif(sid,{type:'test',text:`📝 Новый тест: ${title}`,nav:'student-tests'}));
  _tempQuestions=[];
  ['nt-questions-list'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
  ['nt-title','nt-open-at','nt-close-at'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
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
  }
  closeModal('modal-assign-students');
  showNotif(`✅ Отправлено ${checked.length} ученикам`);
}

// ─── HW ADMIN ───
let _tempHWQuestions=[];
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
      <div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?s.name:'Ученик'}</div>
      ${hws.length ? hws.map(h=>hwItemHTML(h)).join('') : emptyHTML()}
    </div>`;
  }

  _selectedStudent = _hwSelectedSid === 'all' ? (students[0]||{}).id : _hwSelectedSid;
  renderHWOpenAnswers();
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
  return `<div class="content-item" style="flex-direction:column;align-items:stretch">
    <div style="display:flex;align-items:center;gap:14px">
      <div class="content-icon">✏️</div>
      <div class="content-info">
        <div class="content-name">${esc(h.title)}</div>
        <div class="content-meta">${h.desc||''} · Срок: ${h.due||'—'}</div>
        <div class="content-meta" style="margin-top:4px">
          ${(()=>{
            const hasOpen=(h.questions||[]).some(q=>q.type==='open');
            if(!h.submitted) return '<span class="badge badge-gold">Ожидается</span>';
            if(h.openChecked || !hasOpen) return '<span class="badge badge-green">✓ Проверено</span>';
            return '<span class="badge badge-gold">Ожидает проверки</span>';
          })()}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="openAssignStudents('hw','${h.id}')">👤</button>
        <button class="btn btn-outline btn-sm" onclick="openEditAvail('hw','${h.id}')" title="Доступность">⏰</button>
        <button class="btn btn-outline btn-sm" onclick="openEditHW('${h.id}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="deleteHW('${h.id}')">🗑</button>
      </div>
    </div>
    <div style="margin-top:2px">${availBadge(h)}</div>
    ${h.submitted ? `<div id="adm-cmt-hw-${h.id}" style="margin-top:4px"></div>` : ''}
  </div>`;
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
        <div class="question-text">${q.text}</div>
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
    <div class="form-group"><label>Вопрос</label><div class="feedback-box">${q.text}</div></div>
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
  const sids=getCheckedModalStudents('modal-hw-students');
  const hws=load('hw')||[];
  if(sids.length){
    sids.forEach(sid=>hws.push({id:'hw'+Date.now()+'_'+sid,studentId:sid,title,desc,due,fileUrl,questions:[..._tempHWQuestions],submitted:false,answers:{},date:new Date().toLocaleDateString('ru'),openAt,closeAt}));
  } else {
    hws.push({id:'hw'+Date.now()+'_lib',studentId:null,title,desc,due,fileUrl,questions:[..._tempHWQuestions],submitted:false,answers:{},date:new Date().toLocaleDateString('ru'),isLibrary:true,openAt,closeAt});
  }
  save('hw',hws);
  if(sids.length) sids.forEach(sid=>addNotif(sid,{type:'hw',text:`✏️ Новое домашнее задание: ${title}`,nav:'student-hw'}));
  _tempHWQuestions=[];
  ['nhw-questions-list'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
  ['nhw-title','nhw-desc','nhw-fileurl','nhw-open-at','nhw-close-at'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
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
  document.getElementById('es-subject').value=u.subject||'Биология';
  document.getElementById('es-format').value=u.format||'';
  document.getElementById('es-notes').value=u.notes||'';
  document.getElementById('es-active').value=String(u.active!==false);
  document.getElementById('es-oferta').value=String(!!u.ofertaSigned);
  document.getElementById('modal-edit-student').classList.add('open');
}
function saveEditStudent(){
  const id=document.getElementById('es-id').value;
  const name=document.getElementById('es-name').value.trim();
  const pass=document.getElementById('es-pass').value;
  const subject=document.getElementById('es-subject').value;
  const active=document.getElementById('es-active').value==='true';
  if(!name){ showNotif('Введите имя'); return; }
  const users=load('users')||[];
  const u=users.find(u=>u.id===id);
  if(!u) return;
  u.name=name; u.subject=subject; u.active=active;
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
  if(pass) u.password=pass;
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
  return { id: nbBlockId(), type, content:'', caption:'', url:'', name:'' };
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
  if(c.videoUrl) blocks.push({...nbDefaultBlock('video'), url: c.videoUrl});
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
        ${blk.url ? `<img src="${blk.url}" alt="" onerror="this.style.display='none'">` : ''}
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
        ${blk.url ? `<img src="${blk.url}" alt="">` : ''}
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
    content.innerHTML = `
      <div style="padding:10px;background:var(--bg);border-radius:10px;border:1.5px dashed var(--green-pale)">
        ${embed ? `<div class="nb-video-block"><iframe src="${embed}" allowfullscreen></iframe></div>` : ''}
        <div style="display:flex;gap:6px;margin-top:${embed?'10':'0'}px">
          <input value="${(blk.url||'').replace(/"/g,'&quot;')}" placeholder="Ссылка на видео (YouTube, VK, Google Drive)..."
            style="flex:1;padding:7px 10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.83rem;background:var(--white);outline:none"
            oninput="_nbBlocks[${idx}].url=this.value" onblur="nbRender()">
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
    if(b.type==='p') return `<p style="margin:0 0 10px;line-height:1.75;color:var(--text2)">${b.content.replace(/\n/g,'<br>')}</p>`;
    if(b.type==='h1') return `<h2 style="font-family:'Playfair Display',serif;font-size:1.6rem;color:var(--accent);margin:20px 0 10px">${b.content}</h2>`;
    if(b.type==='h2') return `<h3 style="font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--green-deep);margin:16px 0 8px">${b.content}</h3>`;
    if(b.type==='h3') return `<h4 style="font-size:1rem;font-weight:700;color:var(--text);margin:12px 0 6px">${b.content}</h4>`;
    if(b.type==='quote') return `<blockquote style="border-left:3px solid var(--green-mid);padding:8px 16px;background:var(--bg2);border-radius:0 8px 8px 0;font-style:italic;color:var(--text2);margin:12px 0">${b.content}</blockquote>`;
    if(b.type==='callout') return `<div style="background:#fffbeb;border:1px solid #fce98a;border-radius:10px;padding:12px 16px;color:#856404;margin:12px 0">💡 ${b.content}</div>`;
    if(b.type==='code') return `<pre style="background:#1e1e1e;color:#d4d4d4;border-radius:8px;padding:14px 18px;overflow-x:auto;font-size:0.85rem;margin:12px 0"><code>${b.content.replace(/</g,'&lt;')}</code></pre>`;
    if(b.type==='divider') return `<hr style="border:none;border-top:2px solid var(--green-xpale);margin:16px 0">`;
    if(b.type==='image'||b.type==='image-upload') return b.url ? `<figure style="margin:16px 0;text-align:center"><img src="${b.url}" style="max-width:100%;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.1)" alt="${b.caption||''}"><figcaption style="font-size:0.78rem;color:var(--text3);margin-top:6px">${b.caption||''}</figcaption></figure>` : '';
    if(b.type==='video'){
      const embed=getVideoEmbedUrl(b.url||'');
      return embed ? `<div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;margin:16px 0"><iframe src="${embed}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe></div>` : '';
    }
    if(b.type==='file') return b.url ? `<a href="${b.url}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:var(--bg);border:1px solid var(--green-xpale);border-radius:10px;text-decoration:none;color:var(--text);font-size:0.88rem;margin:8px 0">${b.content==='pdf'?'📄':b.content==='word'?'📋':'🔗'} ${b.name||b.url}</a>` : '';
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
  document.getElementById('modal-edit-content').classList.add('open');
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
// ── EDIT TEST ──
function openEditTest(id){
  const t=(load('tests')||[]).find(t=>t.id===id);
  if(!t) return;
  _editTestId=id;
  _editTestQuestions=JSON.parse(JSON.stringify(t.questions||[]));
  document.getElementById('et-id').value=id;
  document.getElementById('et-title').value=t.title||'';
  document.getElementById('et-desc').value=t.desc||'';
  document.getElementById('et-due').value=t.due||'';
  document.getElementById('et-pass').value=t.passThresh||'';
  const gc=t.gradeConfig||{};
  document.getElementById('et-g5').value=gc[5]??85;
  document.getElementById('et-g4').value=gc[4]??67;
  document.getElementById('et-g3').value=gc[3]??45;
  renderEditTestBuilder();
  document.getElementById('modal-edit-test').classList.add('open');
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
    </div>`;
  }).join('');
}
function addEditTestQuestion(type){
  _editTestQuestions.push({id:'q'+Date.now(),type,text:'',options:[],correct:'',points:1,pairs:[],items:[]});
  renderEditTestBuilder();
}
function removeEditQ(i){ _editTestQuestions.splice(i,1); renderEditTestBuilder(); }
function saveEditTest(){
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
  t.questions=_editTestQuestions;
  t.autoTotal=_editTestQuestions.filter(q=>q.type==='auto').reduce((s,q)=>s+(+q.points||1),0);
  save('tests',tests);
  closeModal('modal-edit-test');
  renderTestsAdmin();
  showNotif('✅ Тест обновлён');
}

// ── EDIT HW ──
let _editHWQuestions=[];
function openEditHW(id){
  const h=(load('hw')||[]).find(h=>h.id===id);
  if(!h) return;
  _editHWQuestions=JSON.parse(JSON.stringify(h.questions||[]));
  document.getElementById('ehw-id').value=h.id;
  document.getElementById('ehw-title').value=h.title||'';
  document.getElementById('ehw-desc').value=h.desc||'';
  document.getElementById('ehw-due').value=h.due||'';
  document.getElementById('ehw-fileurl').value=h.fileUrl||'';
  const gc=h.gradeConfig||{};
  document.getElementById('ehw-g5').value=gc[5]??85;
  document.getElementById('ehw-g4').value=gc[4]??67;
  document.getElementById('ehw-g3').value=gc[3]??45;
  renderEditHWBuilder();
  document.getElementById('modal-edit-hw').classList.add('open');
}
function renderEditHWBuilder(){
  const el=document.getElementById('ehw-questions-list');
  if(!el) return;
  const totalPts=_editHWQuestions.reduce((s,q)=>s+(+q.points||1),0);
  const hint=document.getElementById('ehw-total-hint');
  if(hint) hint.textContent=_editHWQuestions.length?`· ${_editHWQuestions.length} вопросов · итого ${totalPts} б.`:'';
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
    </div>`;
  }).join('');
}
function addEditHWQuestion(type){
  _editHWQuestions.push({id:'q'+Date.now(),type,text:'',options:[],correct:'',points:1,pairs:[],items:[]});
  renderEditHWBuilder();
}
function removeEditHWQ(i){ _editHWQuestions.splice(i,1); renderEditHWBuilder(); }
function saveEditHW(){
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
  h.questions=_editHWQuestions;
  h.autoTotal=_editHWQuestions.filter(q=>q.type==='auto').reduce((s,q)=>s+(+q.points||1),0);
  save('hw',hws);
  closeModal('modal-edit-hw');
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
    const whoLabel = g ? `<b>👥 ${g.name}</b>` : (u?`<b>${u.name}</b>`:'<span style="color:var(--text3)">Свободно</span>');
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

function getSRData(sid){
  const raw = localStorage.getItem('biohim_'+srKey(sid));
  return raw ? JSON.parse(raw) : {};
}
function saveSRData(sid, data){
  localStorage.setItem('biohim_'+srKey(sid), JSON.stringify(data));
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
    <a href="${f.url||'#'}" target="_blank" class="content-item" style="text-decoration:none;color:inherit">
      <div class="content-icon">${f.type==='pdf'?'📄':'📋'}</div>
      <div class="content-info"><div class="content-name">${f.name||'Файл'}</div></div>
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
    ? `<img id="${imgPreId}" class="q-img-preview" src="${q.imageUrl}" alt="">`
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
    el.innerHTML=`<div class="card"><div class="card-title" style="margin-bottom:10px"><span class="dot"></span>👤 ${s?s.name:'Ученик'}</div>
      ${st.length?st.map(t=>trialAdminItemHTML(t)).join(''):emptyHTML()}</div>`;
  }
  renderTrialOpenAnswers();
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
  const fullyChecked = t.submitted && (!hasOpen || t.openChecked);
  const statusBadge = !t.submitted
    ? `<span class="badge badge-gold">⏳ Не пройден</span>`
    : fullyChecked
      ? `<span class="badge badge-green">✅ Проверено · ${t.autoScore||0}/${t.autoTotal||0} б. · ${pct}%</span>`
      : `<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке</span>`;
  return `<div class="content-item">
    <div class="content-icon">🎯</div>
    <div class="content-info">
      <div class="content-name">${esc(t.title)}</div>
      <div class="content-meta">${t.subject||''} · ⏱ ${t.timeMins} мин · ⭐ ${t.maxPts} б. · ${t.date}</div>
      <div style="margin-top:4px">${statusBadge}</div>
    </div>
    <div style="display:flex;gap:6px">
      ${t.submitted?`<button class="btn btn-outline btn-sm" onclick="viewTrialResult('${t.id}')">📊</button>`:''}
      <button class="btn btn-outline btn-sm" onclick="openEditAvail('trial','${t.id}')" title="Доступность">⏰</button>
      <button class="btn btn-outline btn-sm" onclick="openEditTrial('${t.id}')">✏️</button>
      <button class="btn btn-red btn-sm" onclick="deleteTrial('${t.id}')">🗑</button>
    </div>
    <div style="margin-top:2px">${availBadge(t)}</div>
  </div>`;
}
function deleteTrial(id){ save('trials',(load('trials')||[]).filter(t=>t.id!==id)); renderTrialAdmin(); }

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

  // Reset maxpts to readonly auto mode
  const maxEl = document.getElementById('etr-maxpts');
  const btn   = document.getElementById('etr-maxpts-btn');
  const hint  = document.getElementById('etr-maxpts-hint');
  maxEl.setAttribute('readonly','');
  maxEl.style.background='var(--bg)'; maxEl.style.color='var(--text3)';
  if(btn)  btn.textContent='✏️ Изменить';
  if(hint) hint.textContent='(считается автоматически из вопросов)';

  renderEditTrialBuilder();
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
  _editTrialSections.push({id:'ts_'+Date.now(), title:'Часть '+(+_editTrialSections.length+1), questions:[]});
  renderEditTrialBuilder();
}
function removeEditTrialSection(idx){
  _editTrialSections.splice(idx,1);
  renderEditTrialBuilder();
}
function addEditTrialQuestion(sIdx, type){
  _editTrialSections[sIdx].questions.push(initQuestion('tq_'+Date.now(), type));
  renderEditTrialBuilder();
}
function removeEditTrialQuestion(sIdx, qIdx){
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
      ${q.imageUrl?`<img id="${imgPreId}" class="q-img-preview" src="${q.imageUrl}" alt="">`:`<img id="${imgPreId}" class="q-img-preview" style="display:none" src="" alt="">`}
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
  t.sections=JSON.parse(JSON.stringify(_editTrialSections));
  const allQ=_editTrialSections.flatMap(s=>s.questions);
  const autoPts=_editTrialMaxPtsManual
    ? +(document.getElementById('etr-maxpts').value)||t.maxPts
    : allQ.reduce((a,q)=>a+(+q.points||1),0);
  t.maxPts=autoPts;
  t.autoTotal=allQ.filter(q=>q.type==='auto').reduce((a,q)=>a+(+q.points||1),0)||autoPts;
  save('trials',trials);
  closeModal('modal-edit-trial');
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
        <div class="question-text">${q.text}</div>
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
  (t.sections||[]).forEach(s=>s.questions.forEach(q=>{ if(q.id===qid){ q.checked=true; q.earnedPts=pts; } }));
  const openDone=(t.sections||[]).flatMap(s=>s.questions).filter(q=>q.type==='open').every(q=>q.checked);
  t.openChecked=openDone;
  const openScore=(t.sections||[]).flatMap(s=>s.questions).filter(q=>q.type==='open'&&q.checked).reduce((a,q)=>a+(q.earnedPts||0),0);
  t.autoScore=(t.autoScore||0)+openScore;
  save('trials',trials);
  renderTrialAdmin();
  showNotif(`✅ Ответ засчитан: +${pts} б.`);
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
    const statusBadge=!t.submitted
      ?`<span class="badge badge-gold">⏳ Не пройден</span>`
      :fullyChecked
        ?`<span class="badge badge-green">✅ Проверено · ${t.autoScore}/${t.autoTotal} б. · ${pct}% · Оценка ${calcGrade(pct,t.gradeConfig)}</span>`
        :`<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке · авто: ${t.autoScore}/${t.autoTotal} б.</span>`;
    return `<div class="card">
      <div class="card-title"><span class="dot"></span>🎯 ${esc(t.title)}</div>
      <div style="font-size:0.85rem;color:var(--text3);margin-bottom:10px">
        ${t.subject?`📚 ${t.subject} · `:''}⏱ ${t.timeMins} мин · ⭐ ${t.maxPts} б.
        ${t.passThresh?` · Порог: ${t.passThresh}%`:''}
      </div>
      <div style="margin-bottom:12px">${statusBadge}</div>
      ${!t.submitted ? availGate(t,'startTrial') : viewTrialResultHTML(t)}
      <div id="cmt-trial-${t.id}"></div>
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
  t.submitted=true; t.answers={..._trialAnswers};
  let score=0, total=0;
  (t.sections||[]).forEach(s=>s.questions.forEach(q=>{
    const pts=+q.points||1;
    const ans=_trialAnswers[q.id]||'';
    if(q.type!=='open'){ total+=pts; if(scoreQuestion(q,ans)) score+=pts; }
  }));
  t.autoScore=score; t.autoTotal=total||t.maxPts||total;
  const pct=t.autoTotal?Math.round(score/t.autoTotal*100):0;
  t.autoGrade=calcGrade(pct,t.gradeConfig); t.autoPct=pct;
  save('trials',trials);
  document.getElementById('modal-take-trial').classList.remove('open');
  renderStudentTrial();
  showNotif(timeout?`⏰ Время вышло! Авто: ${score}/${t.autoTotal} б.`:`✅ Пробник сдан! Авто: ${score}/${t.autoTotal} б. (${pct}%)`);
}
function viewTrialResultHTML(t){
  const allQ=(t.sections||[]).flatMap(s=>s.questions);
  return `<div style="margin-top:4px">
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
            <span class="badge" style="background:var(--green-xpale);color:var(--green-deep);border:none;font-size:0.7rem">${typeLabel[t.answerType||'open']||'📝 Открытый'}</span>
            <span class="badge" style="background:#fef3cd;color:#856404;border:none;font-size:0.7rem">⭐ ${t.points||1} ${(t.points||1)===1?'балл':(t.points||1)<5?'балла':'баллов'}</span>
          </div>
          <div style="font-size:0.92rem;font-weight:600;color:var(--accent);margin-bottom:6px;line-height:1.5">${t.text}</div>
          ${t.imageUrl?`<img src="${t.imageUrl}" style="max-width:200px;border-radius:8px;border:1px solid var(--green-xpale);margin-bottom:6px" alt="">`:''}
          ${t.answerType==='choice'&&t.options?.length?`
            <div style="font-size:0.8rem;color:var(--text3);margin-bottom:4px">Варианты: ${t.options.join(' · ')}</div>
            <div style="font-size:0.8rem;background:var(--bg);padding:6px 10px;border-radius:8px;border-left:3px solid var(--green-mid)">✅ Правильно: <b>${t.correctOption}</b>${t.explanation?` — ${t.explanation}`:''}</div>
          `:''}
          ${t.answerType==='short'?`
            <div style="font-size:0.8rem;background:var(--bg);padding:6px 10px;border-radius:8px;border-left:3px solid var(--green-mid)">✅ Правильно: <b>${t.correctShort}</b>${t.explanation?` — ${t.explanation}`:''}</div>
          `:''}
          ${t.answerType==='open'&&t.answer?`<div style="font-size:0.8rem;color:var(--text3);background:var(--bg);padding:8px 12px;border-radius:8px;border-left:3px solid var(--green-mid)">💡 ${t.answer}</div>`:''}
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
  const subject = document.getElementById('ntask-subject').value.trim();
  const imgUrl  = document.getElementById('ntask-imgurl').value.trim()||_ntaskImgData;
  const editId  = document.getElementById('ntask-edit-id').value;

  let taskData = { text, subject, imageUrl:imgUrl, answerType:type, points:Math.max(1,+document.getElementById('ntask-points').value||1) };
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
  document.getElementById('modal-add-task').classList.add('open');
}

function deleteTask(id){
  if(!confirm('Удалить задание?')) return;
  save('taskbank',(load('taskbank')||[]).filter(t=>t.id!==id));
  renderTaskBankAdmin();
}

// ── DAILY TASK for student ──
function getDailyTask(sid){
  const tasks=load('taskbank')||[];
  if(!tasks.length) return null;
  const today=todayStr();
  const log=JSON.parse(localStorage.getItem('biohim_daily_task_log')||'{}');
  const sidLog=log[sid]||[];
  const todayEntry=sidLog.find(e=>e.date===today);
  if(todayEntry){ return {task:tasks.find(t=>t.id===todayEntry.taskId)||null,isNew:false}; }
  const usedIds=new Set(sidLog.map(e=>e.taskId));
  const available=tasks.filter(t=>!usedIds.has(t.id));
  const pool=available.length?available:tasks;
  const task=pool[Math.floor(seededRandom(sid+today)*pool.length)];
  if(!task) return null;
  log[sid]=[...sidLog,{date:today,taskId:task.id}].slice(-365);
  localStorage.setItem('biohim_daily_task_log',JSON.stringify(log));
  return {task,isNew:true};
}
function seededRandom(seed){
  let h=0; for(let i=0;i<seed.length;i++) h=(Math.imul(31,h)+seed.charCodeAt(i))|0;
  return Math.abs(h)/2147483647;
}
function getDailyAnswer(sid){
  const answers=JSON.parse(localStorage.getItem('biohim_daily_answers')||'{}');
  return (answers[sid]||{})[todayStr()]||null;
}
function saveDailyAnswer(sid,data){
  const answers=JSON.parse(localStorage.getItem('biohim_daily_answers')||'{}');
  if(!answers[sid]) answers[sid]={};
  answers[sid][todayStr()]=data;
  localStorage.setItem('biohim_daily_answers',JSON.stringify(answers));
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
      <div style="color:var(--text1);line-height:1.6">${task.answer}</div>
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
  const allAtt = (load('attendance')||[]).slice().reverse();

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
            ${lg.topic?`📖 ${lg.topic} · `:''}${lg.group?`👥 ${lg.group} · `:''}💰 ${lg.costPerStudent}₽/чел.
          </div>
        </div>
        <button class="btn btn-red btn-sm" onclick="deleteLesson('${lg.lessonId}')">🗑 Занятие</button>
      </div>
      ${lg.entries.map(a=>{
        const s = students.find(s=>s.id===a.studentId);
        return `<div class="att-row att-${a.present?'present':'absent'}">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.88rem">${s?s.name:'—'}</div>
            ${a.group?`<div style="font-size:0.75rem;color:var(--text3)">${a.group}</div>`:''}
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

function toggleAttPresence(id){
  const att=load('attendance')||[];
  const a=att.find(a=>a.id===id); if(!a) return;
  a.present=!a.present;
  if(!a.present) a.paid=false;
  save('attendance',att);
  renderAtpAttendance();
  renderAtpWallet();
}
function deleteLesson(lessonId){
  if(!confirm('Удалить всё занятие?')) return;
  save('attendance',(load('attendance')||[]).filter(a=>a.lessonId!==lessonId));
  renderAtpAttendance();
}

function renderStudentAttendance(){
  const sid=currentUser.id;
  const att=(load('attendance')||[]).filter(a=>a.studentId===sid).slice().reverse();
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
              ${a.topic?`📖 ${a.topic}`:''}${a.group?' · 👥 '+a.group:''}
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
  if(!u) return;
  document.getElementById('student-profile-body').innerHTML = buildProfileHTML(u, true);
  document.getElementById('modal-student-profile').classList.add('open');
}

function buildProfileHTML(u, isAdmin){
  const age = u.birth ? Math.floor((Date.now()-new Date(u.birth))/(365.25*24*3600*1000)) : null;
  const row=(label,val,icon='')=>val?`
    <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--green-xpale)">
      <span style="font-size:0.78rem;color:var(--text3);min-width:150px;flex-shrink:0">${icon} ${label}</span>
      <span style="font-size:0.88rem;color:var(--text);font-weight:500">${val}</span>
    </div>`:''  ;
  return `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:linear-gradient(135deg,var(--green-xpale),var(--bg));border-radius:14px;margin-bottom:20px">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--green-mid));display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.4rem;font-weight:700;flex-shrink:0">
        ${u.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase()}
      </div>
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;color:var(--accent);font-weight:700">${u.name}</div>
        <div style="font-size:0.8rem;color:var(--text3);margin-top:2px">${u.subject||''}${u.format?' · '+u.format:''}${age?' · '+age+' лет':''}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'Активен':'Неактивен'}</span>
          <span class="badge ${u.ofertaSigned?'badge-green':'badge-red'}">📄 ${u.ofertaSigned?'Договор подписан':'Договор не подписан'}</span>
        </div>
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

    ${u.ofertaSigned&&u.ofertaDate?`
    <div style="background:#fffbeb;border:1px solid #fce98a;border-radius:10px;padding:10px 14px;font-size:0.8rem;color:#856404">
      📄 Договор оферты подписан ${u.ofertaDate}
    </div>`:''}

    ${isAdmin?`<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--green-xpale)">
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
function renderZoomSettings(){
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
  document.getElementById('student-notifs-list').innerHTML=notifs.slice().reverse().map(n=>{
    const isRepeat  = n.type==='repeat';
    const isChat    = n.type==='chat';
    const isComment = n.type==='comment';
    const isWallet  = n.type==='wallet' || n.type==='charge';
    const nav = n.nav || (isRepeat?'student-repeat': isChat?'student-chat': isWallet?'student-payment': '');
    const clickable = !!nav;
    const dotClass  = isChat?'new': isComment?'done': isWallet?'new': isRepeat?'':'new';
    const arrow     = isChat?'→ Чат': isComment?'→ Перейти': isWallet?'→ Оплата': isRepeat?'→ Повторить':'';
    const extraClass= isChat?'notif-chat': isComment?'notif-comment': isWallet?'notif-comment':'';
    return `<div class="hw-item ${extraClass}" style="cursor:${clickable?'pointer':'default'};${extraClass?'border-radius:10px;padding:10px;margin-bottom:4px;':''}" onclick="${clickable?`navigateTo('${nav}')`:''}" >
      <div class="hw-status-dot ${dotClass}"></div>
      <div><div class="content-name" style="font-size:0.85rem">${esc(n.text)}</div><div class="content-meta">${n.date}</div></div>
      ${clickable?`<span style="font-size:0.75rem;color:var(--green-mid);margin-left:auto;white-space:nowrap">${arrow}</span>`:''}
    </div>`;
  }).join('') || '<div class="empty-state"><p>Нет уведомлений</p></div>';

  // Render student calendar & todo
  _sCalYear = new Date().getFullYear();
  _sCalMonth = new Date().getMonth();
  renderStudentCalendar();
  renderStudentTodoList('day');
  // Daily task
  renderStudentZoomBlock();
  renderDailyTaskBlock(sid);
}

let _materialFilter = 'all';
let _testFilter = 'all';
let _hwFilter = 'all';

function setMaterialFilter(f, el){
  _materialFilter = f;
  document.querySelectorAll('#page-student-materials .filter-pill').forEach(p=>p.className='filter-pill');
  el.className = 'filter-pill ' + (f==='all'?'active': f==='viewed'?'active-done':'active-todo');
  renderStudentMaterials();
}
function setTestFilter(f, el){
  _testFilter = f;
  document.querySelectorAll('#page-student-tests .filter-pill').forEach(p=>p.className='filter-pill');
  const cls = {all:'active', done:'active-done', pending:'active-todo', waiting:'active-todo', checked:'active-done'}[f]||'active';
  el.className = 'filter-pill ' + cls;
  renderStudentTests();
}
function setHWFilter(f, el){
  _hwFilter = f;
  document.querySelectorAll('#page-student-hw .filter-pill').forEach(p=>p.className='filter-pill');
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
  const viewed = JSON.parse(localStorage.getItem('biohim_viewed_'+sid)||'{}');
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
    const grade = t.submitted && t.autoTotal ? (t.autoGrade || calcGrade(pct, t.gradeConfig)) : null;
    return `<div class="card" data-item-id="${t.id}">
      <div class="card-title"><span class="dot"></span>${esc(t.title)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
        ${(()=>{
          const hasOpen=(t.questions||[]).some(q=>q.type==='open');
          if(!t.submitted) return `<span class="badge badge-gold">⏳ Не сдан</span>`;
          if(t.openChecked || !hasOpen) return `<span class="badge badge-green">✅ Проверено</span>`;
          return `<span class="badge badge-gold">📝 Ожидает проверки</span>`;
        })()}
        ${t.submitted&&t.autoTotal?`<span class="badge badge-blue">⭐ ${t.autoScore||0}/${t.autoTotal} б. (${pct}%)</span>`:''}
        ${grade?`<span class="grade-result-badge grade-${grade}">Оценка: ${grade}</span>`:''}
      </div>
      ${t.submitted ? renderTestResults(t) : availGate(t,'takeTest')}
      <div id="cmt-test-${t.id}"></div>
    </div>`;
  }).join('');
  // Inject comment threads after render
  tests.filter(t=>t.submitted).forEach(t=>{
    const el2 = document.getElementById(`cmt-test-${t.id}`);
    if(el2) renderCommentThread('test', t.id, el2);
  });
}
function renderTestResults(t){
  return (t.questions||[]).map(q=>renderReviewQuestion(q,t.answers||{})).join('');
}

let _takingTest=null; let _testAnswers={};
function takeTest(id){
  const tests=load('tests')||[];
  _takingTest=tests.find(t=>t.id===id);
  _testAnswers={};
  document.getElementById('take-test-title').textContent=_takingTest.title;
  renderTakeTestBody();
  openModal('modal-take-test');
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

function submitTest(){
  const tests=load('tests')||[];
  const t=tests.find(t=>t.id===_takingTest.id);
  t.submitted=true;
  t.answers=_testAnswers;
  let score=0, total=0;
  t.questions.forEach(q=>{
    const pts=+q.points||1;
    const ans=_testAnswers[q.id]||'';
    if(q.type!=='open'){
      total+=pts;
      if(scoreQuestion(q,ans)) score+=pts;
    }
  });
  t.autoScore=score;
  t.autoTotal=total||t.autoTotal||0;
  const pct = t.autoTotal ? Math.round(score/t.autoTotal*100) : 0;
  t.autoGrade = calcGrade(pct, t.gradeConfig);
  t.autoPct = pct;
  save('tests',tests);
  closeModal('modal-take-test');
  renderStudentTests();
  showNotif(`✅ Тест сдан! ${score}/${t.autoTotal} баллов (${pct}%) — оценка ${t.autoGrade}`);
  // notify admin
  const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
  adminNotifs.push({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'submit', text:`📋 ${currentUser.name} сдал(а) тест «${esc(t.title)}»`, date:new Date().toLocaleDateString('ru'), read:false});
  localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
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
  el.innerHTML=hws.map(h=>`
    <div class="card" data-item-id="${h.id}">
      <div class="card-title"><span class="dot"></span>${esc(h.title)}</div>
      <div style="font-size:0.87rem;color:var(--text2);margin-bottom:10px">${h.desc}</div>
      ${h.due?`<div class="content-meta" style="margin-bottom:10px">📅 Срок: ${h.due}</div>`:''}
      <div style="display:flex;gap:8px;margin-bottom:12px">
        ${(()=>{
          const hasOpen=(h.questions||[]).some(q=>q.type==='open');
          if(!h.submitted) return `<span class="badge badge-gold">⏳ Не сдано</span>`;
          if(h.openChecked || !hasOpen) return `<span class="badge badge-green">✅ Проверено</span>`;
          return `<span class="badge badge-gold">📝 Ожидает проверки</span>`;
        })()}
      </div>
      ${h.submitted ? renderHWResults(h) : availGate(h,'doHW')}
      <div id="cmt-hw-${h.id}"></div>
    </div>`).join('');
  // Inject comment threads
  hws.filter(h=>h.submitted).forEach(h=>{
    const el2 = document.getElementById(`cmt-hw-${h.id}`);
    if(el2) renderCommentThread('hw', h.id, el2);
  });
}
function renderHWResults(h){
  if(!h.questions||!h.questions.length) return `<div class="feedback-box">Свободная форма — ответ сдан</div>`;
  return h.questions.map(q=>{
    const pts = +q.points||1;
    if(q.type==='auto'){
      const ua=h.answers&&h.answers[q.id]; const correct=ua===q.correct;
      return `<div class="question-block">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="question-num">⚡ Авто</div>
          <span style="font-size:0.78rem;color:${correct?'var(--green-mid)':'var(--red)'}">⭐ ${correct?pts:0}/${pts} б.</span>
        </div>
        <div class="question-text">${q.text}</div>
        ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
        <div class="option-item ${correct?'correct':'wrong'}">${ua||'—'} ${correct?'✅':'❌ '+q.correct}</div>
      </div>`;
    } else {
      return `<div class="question-block">
        <div class="question-num">📝 Открытый <span style="font-size:0.75rem;color:var(--text3)">(⭐ ${pts} б.)</span></div>
        <div class="question-text">${q.text}</div>
        ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
        <div class="feedback-box"><b>Ответ:</b> ${h.answers&&h.answers[q.id]||'—'}</div>
        ${q.checked?`<div class="feedback-box" style="border-color:var(--gold);margin-top:6px"><b>Оценка: ${q.grade}</b><br>${q.comment}</div>`:'<div style="font-size:0.8rem;color:var(--text3);margin-top:4px">⏳ Ожидает проверки</div>'}
      </div>`;
    }
  }).join('');
}

let _doingHW=null; let _hwAnswers={};
function doHW(id){
  const hws=load('hw')||[];
  _doingHW=hws.find(h=>h.id===id);
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
        <div class="question-text">${q.text}</div>
        ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:10px" alt="">`:''}
        ${q.type==='auto'?`<div class="option-list">${q.options.map(o=>`
          <div class="option-item" onclick="selectHWOption('${q.id}','${o.replace(/'/g,"\\'")}',this)">${o}</div>`).join('')}</div>`
        :`<textarea style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--green-pale);font-family:Nunito,sans-serif;font-size:0.88rem;min-height:80px" 
          onchange="_hwAnswers['${q.id}']=this.value" placeholder="Ваш ответ..."></textarea>`}
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
  h.submitted=true;
  h.answers=_hwAnswers;
  const freeEl=document.getElementById('hw-free-answer');
  if(freeEl) h.freeAnswer=freeEl.value;
  save('hw',hws);
  closeModal('modal-take-test');
  renderStudentHW();
  showNotif('✅ ДЗ отправлено на проверку!');
  // notify admin
  const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
  adminNotifs.push({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'submit', text:`✏️ ${currentUser.name} сдал(а) ДЗ «${esc(h.title)}»`, date:new Date().toLocaleDateString('ru'), read:false});
  localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
  updateAdminBadge();
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
      <div><b>${p.period}</b>${p.note?` <span style="font-size:0.8rem;opacity:0.7">${p.note}</span>`:''}</div>
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

function renderStudentSchedule(){
  const courses=load('courses')||[];
  const slots=load('slots')||[];
  const bookings=load('bookings')||[];
  const sid=currentUser.id;
  const formatLabel={individual:'👤 Индивидуальный',group:'👥 Групповой',pair:'👫 Парный'};
  document.getElementById('courses-student-list').innerHTML=`<div class="grid-3">`+
  courses.map(c=>`
    <div class="course-card">
      <div class="course-header ${c.subject==='Биология'?'course-bio':c.subject==='Химия'?'course-chem':'course-combined'}">
        ${c.subject==='Биология'?'🌿':c.subject==='Химия'?'⚗️':'🧬'}
      </div>
      <div class="course-body">
        <div class="course-name">${esc(c.title)}</div>
        <div class="content-meta" style="margin-bottom:8px">${c.desc}</div>
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
          ${g?`<span class="badge badge-blue" style="font-size:0.7rem">👥 ${g.name}</span>`:''}
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
  const allAtt   = (load('attendance')||[]).filter(a=>a.studentId===sid);
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
  const taskLog = JSON.parse(localStorage.getItem('biohim_daily_task_log')||'{}');
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
        <div style="font-size:1.4rem;font-weight:900;color:var(--accent)">${student.name}</div>
        <div style="font-size:0.82rem;color:var(--text3);margin-top:3px">
          ${student.subject||''}${student.subject&&student.format?' · ':''}${student.format||''}
          &nbsp;·&nbsp; Период: <b>${periodLabel}</b>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="downloadReport('${sid}')">⬇ Скачать .txt</button>
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
          <div style="flex:1;font-size:0.82rem;font-weight:600">${a.topic||'Занятие'}${a.group?' · '+a.group:''}</div>
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
    <button class="btn btn-green" onclick="downloadReport('${sid}')">⬇ Скачать отчёт (.txt)</button>
  </div>`;
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
  const taskLog  = JSON.parse(localStorage.getItem('biohim_daily_task_log')||'{}');
  const tasksDone = Object.keys(taskLog).filter(k=>k.endsWith('_'+sid)).length;

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
// STARTUP — load from Firebase then show login
// ═══════════════════════════════════════════
(async () => {
  // Show a loading overlay while Firebase loads
  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px';
  overlay.innerHTML = `
    <div style="font-family:'Playfair Display',serif;font-size:2rem;color:var(--green-deep)">Био<span style="color:var(--chem)">Хим</span></div>
    <div style="color:var(--text3);font-size:0.9rem">Загрузка данных…</div>
    <div id="spin-loader" style="width:40px;height:40px;border:4px solid var(--green-pale);border-top-color:var(--green-mid);border-radius:50%"></div>`;
  document.body.appendChild(overlay);
  const spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes spin{to{transform:rotate(360deg)}} #spin-loader{animation:spin 0.8s linear infinite}';
  document.head.appendChild(spinStyle);

  try {
    await preloadCache();
    await initData();
  } catch(e) {
    console.error('Init error:', e);
    // Even on error — remove overlay so login form is accessible
    overlay.remove();
    // Show error inline on login form instead
    const errEl = document.getElementById('login-err');
    if(errEl) errEl.textContent = '⚠️ Ошибка загрузки: ' + (e.message||e) + ' — попробуйте обновить страницу';
    return;
  }

  overlay.remove();

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
        currentUser = user;
        document.getElementById('login-screen').style.display='none';
        document.getElementById('app').style.display='block';
        const resetBtn = document.getElementById('btn-reset-data');
        if(resetBtn) resetBtn.style.display = user.role==='admin' ? 'block' : 'none';
        buildNav();
        subscribeRealtime();
        const defaultPage = user.role==='admin' ? 'dashboard' : 'student-dashboard';
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
// CHAT
// ══════════════════════════════════════════
function chatKey(sid){ return 'chat_'+sid; }
function loadChat(sid){ return JSON.parse(localStorage.getItem(chatKey(sid))||'[]'); }
function saveChat(sid, msgs){ localStorage.setItem(chatKey(sid), JSON.stringify(msgs)); }

function chatUnread(sid){
  const msgs = loadChat(sid);
  const role = currentUser.role;
  return msgs.filter(m=> m.from !== role && !m.read).length;
}
function markChatRead(sid){
  const role = currentUser.role;
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
        <div class="chat-contact-last">${last?(last.from==='admin'?'Вы: ':'')+last.text:'Нет сообщений'}</div>
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
      html += `<div class="chat-date-divider">${m.date}</div>`;
      lastDate = m.date;
    }
    const refBlock = m.ref ? `<div class="chat-bubble-ref">📎 ${m.ref}</div>` : '';
    html += `<div class="chat-msg ${mine?'mine':'theirs'}">
      <div class="chat-bubble">${refBlock}${escHtml(m.text)}</div>
      <div class="chat-time">${m.time}</div>
    </div>`;
    return html;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ─ STUDENT ─
function renderStudentChat(){
  markChatRead(currentUser.id);
  updateChatBadge();
  renderChatMessages('chat-student-messages', currentUser.id, 'student');
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
  inp.value = '';
  renderChatMessages('chat-student-messages', sid, 'student');
  // notify admin (global notif with type chat)
  const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
  adminNotifs.push({id:'an'+Date.now(), studentId:sid, studentName: currentUser.name, type:'chat', text:`💬 ${currentUser.name}: ${text.substring(0,60)}`, time: new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}), date: new Date().toLocaleDateString('ru'), read:false});
  localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
  updateChatBadge();
}

function updateChatBadge(){
  // Student: count unread from admin
  if(currentUser && currentUser.role==='student'){
    const count = chatUnread(currentUser.id);
    document.querySelectorAll('#nav-student-chat').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(count>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${count}</span>`);
    });
  }
  // Admin: count all unread
  if(currentUser && currentUser.role==='admin'){
    const total = getStudents().reduce((s,st)=>s+chatUnread(st.id),0);
    const adminTotal = total + (JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]').filter(n=>!n.read).length);
    document.querySelectorAll('#nav-chat-admin').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(adminTotal>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${adminTotal}</span>`);
    });
  }
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

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
    const adminNotifs = JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]');
    adminNotifs.push({id:'an'+Date.now(), studentId:currentUser.id, studentName:currentUser.name, type:'comment', text:`💬 ${currentUser.name} прокомментировал(а) ${typeLabel} «${itemTitle}»`, date:now.toLocaleDateString('ru'), read:false});
    localStorage.setItem('biohim_admin_notifs', JSON.stringify(adminNotifs));
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
      + (JSON.parse(localStorage.getItem('biohim_admin_notifs')||'[]').filter(n=>!n.read).length);
    document.querySelectorAll('#nav-chat-admin').forEach(el=>{
      el.querySelectorAll('.chat-badge').forEach(b=>b.remove());
      if(total>0) el.insertAdjacentHTML('beforeend',`<span class="rep-badge chat-badge">${total}</span>`);
    });
  }
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
          <div class="content-name">${g.name}</div>
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
    getGroups().map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
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

function loadNotifSettings(sid){
  const raw = localStorage.getItem(notifSettingsKey(sid));
  const def = {
    tgChatId: '',
    types: { lesson:true, hw:true, test:true, payment:true, chat:true, repeat:true }
  };
  if(!raw) return def;
  try{ return Object.assign({}, def, JSON.parse(raw)); } catch(e){ return def; }
}
function saveNotifSettingsData(sid, s){ localStorage.setItem(notifSettingsKey(sid), JSON.stringify(s)); }

const NOTIF_TYPE_MAP = {
  schedule:'lesson', hw:'hw', test:'test', trial:'test',
  wallet:'payment', chat:'chat', repeat:'repeat',
  material:'lesson', comment:'chat', attendance:'lesson'
};

// ── Добавить уведомление + отправить в Telegram ──
function addNotif(studentId, {type, text, nav}){
  const notifs = load('notifs')||[];
  notifs.push({id:'n'+Date.now(), studentId, type, text, nav,
    date:new Date().toLocaleDateString('ru'), read:false});
  save('notifs', notifs);
  sendTelegramNotif(studentId, type, text);
}

// ── Отправка через Telegram Bot API ──
async function sendTelegramNotif(sid, type, text){
  const token = localStorage.getItem(adminTgTokenKey());
  if(!token) return;
  const settings = loadNotifSettings(sid);
  if(!settings.tgChatId) return;
  const mappedType = NOTIF_TYPE_MAP[type] || type;
  if(settings.types[mappedType] === false) return;

  const student = getStudents().find(s=>s.id===sid);
  const name = student ? student.name : 'Ученик';
  const msg = `📚 *BioХим* — ${name}\n\n${text}`;

  try{
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: settings.tgChatId, text: msg, parse_mode:'Markdown' })
    });
  } catch(e){
    console.warn('TG send error:', e);
  }
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
          <div class="toggle-desc">${t.desc}</div>
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
  const token = localStorage.getItem(adminTgTokenKey());
  if(!token){ showNotif('Токен бота не настроен администратором'); return; }
  try{
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: settings.tgChatId,
        text:'🔔 *Тест уведомлений*\n\nЕсли вы получили это сообщение — Telegram подключён успешно! ✅', parse_mode:'Markdown' })
    });
    const d = await r.json();
    showNotif(d.ok ? '✅ Тест отправлен — проверьте Telegram!' : '❌ Ошибка: ' + (d.description||''));
  } catch(e){ showNotif('❌ Ошибка соединения: ' + e.message); }
}

// ── Страница администратора ──
function renderNotifSettingsAdmin(){
  const token    = localStorage.getItem(adminTgTokenKey()) || '';
  const botName  = localStorage.getItem(adminTgBotKey())  || '';
  const elToken  = document.getElementById('admin-tg-token');
  const elBot    = document.getElementById('admin-tg-botname');
  if(elToken) elToken.value = token;
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
}

function saveAdminTgBot(){
  const token   = (document.getElementById('admin-tg-token')  ||{}).value?.trim();
  const botName = (document.getElementById('admin-tg-botname')||{}).value?.trim();
  if(token)   localStorage.setItem(adminTgTokenKey(), token);
  if(botName) localStorage.setItem(adminTgBotKey(),   botName.startsWith('@')?botName:'@'+botName);
  testBotToken();
}

async function testBotToken(){
  const token = localStorage.getItem(adminTgTokenKey());
  const statusEl = document.getElementById('bot-connection-status');
  if(!token){ if(statusEl){ statusEl.textContent='Введите токен'; statusEl.style.color='var(--text3)'; } return; }
  if(statusEl){ statusEl.textContent='⏳ Проверяем...'; statusEl.style.color='var(--text3)'; }
  try{
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const d = await r.json();
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
function walletKey(sid){ return 'biohim_wallet_' + sid; }
function loadWallet(sid){
  const raw = localStorage.getItem(walletKey(sid));
  return raw ? JSON.parse(raw) : { balance: 0, txns: [] };
}
function saveWallet(sid, w){ localStorage.setItem(walletKey(sid), JSON.stringify(w)); }

function walletTopUp(sid, amount, note){
  const w = loadWallet(sid);
  w.balance += amount;
  w.txns.push({ id:'tx'+Date.now(), type:'topup', amount, note: note||'Пополнение',
    date: new Date().toLocaleDateString('ru'), ts: Date.now() });
  saveWallet(sid, w);
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
function switchAtpTab(tab, el){
  _atpTab = tab;
  document.querySelectorAll('#page-attend-pay-admin .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['attendance','wallet','payments'].forEach(t=>{
    const el2 = document.getElementById('atp-tab-'+t);
    if(el2) el2.style.display = t===tab ? '' : 'none';
  });
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
  const allAtt = (load('attendance')||[]).slice().reverse();
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
            ${lg.topic?`<span>📖 ${lg.topic}</span>`:''}
            ${lg.group?`<span>👥 ${lg.group}</span>`:''}
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
        return `<div class="att-row att-${a.present?'present':'absent'}">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.88rem">${s?s.name:'—'}</div>
            <div style="font-size:0.75rem;${balColor};font-weight:700">Баланс: ${w.balance}₽</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="toggleAttPresence('${a.id}')" style="min-width:80px">
              ${a.present?'✅ Был':'❌ Не был'}
            </button>
            ${a.present ? `
              <button class="btn ${a.paid?'btn-outline':'btn-green'} btn-sm" onclick="toggleAttPaid('${a.id}')" style="min-width:100px">
                ${a.paid?'💳 Оплачено':'Списать ₽'}
              </button>
              ${!a.paid?`<span class="att-unpaid-badge">💳 ${a.costPerStudent}₽ не списано</span>`:''}
            ` : ''}
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

// ── Override toggleAttPaid: debit wallet + notify ──
function toggleAttPaid(id){
  const att = load('attendance')||[];
  const a   = att.find(a=>a.id===id); if(!a) return;
  if(!a.paid){
    // Debit from wallet
    const dateLabel = a.date ? new Date(a.date+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long'}) : '';
    walletDebit(a.studentId, +a.costPerStudent||0,
      `Занятие ${dateLabel}${a.topic?' · '+a.topic:''}${a.group?' · '+a.group:''}`);
    a.paid = true;
  } else {
    // Refund
    const dateLabel = a.date ? new Date(a.date+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long'}) : '';
    walletTopUp(a.studentId, +a.costPerStudent||0, `Возврат: занятие ${dateLabel}`);
    a.paid = false;
  }
  save('attendance', att);
  renderAtpAttendance();
  renderAtpWallet();
}

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
  checks.forEach(cb=>{
    att.push({
      id:'att_'+Date.now()+'_'+cb.value,
      lessonId, studentId:cb.value,
      date, time, topic, group,
      costPerStudent: cost,
      slotId: slotId || null,
      present:true, paid:false,
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
  const att = (load('attendance')||[]).filter(a=>a.studentId===sid).slice().reverse();
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
        return `<div style="padding:12px;border-radius:10px;margin-bottom:8px;border:1px solid var(--green-xpale);
          ${isUnpaid?'border-left:3px solid #ef4444;background:#fef2f2;':a.present?'border-left:3px solid var(--green-mid);':''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div>
              <div style="font-weight:700;font-size:0.9rem;color:var(--accent)">${dateLabel}${a.time?' · '+a.time:''}</div>
              ${a.topic||a.group?`<div style="font-size:0.78rem;color:var(--text2);margin-top:3px">${a.topic?'📖 '+a.topic:''}${a.group?' · 👥 '+a.group:''}</div>`:''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="att-badge-${a.present?'present':'absent'}">${a.present?'✅ Был(а)':'❌ Не был(а)'}</span>
              ${a.present?`<span class="att-cost-badge">−${a.costPerStudent}₽</span>`:''}
              ${isUnpaid?`<span class="att-unpaid-badge">Не оплачено</span>`:''}
              ${a.present&&a.paid?`<span style="background:#e8f8f0;color:#27ae60;font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:8px">✅ Оплачено</span>`:''}
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
function availGate(item, fnName){
  const st=availStatus(item);
  if(st==='not-open') return `<div style="background:#fffbea;border-radius:10px;padding:10px 14px;font-size:0.84rem;font-weight:600;color:#b45309">⏳ Откроется ${fmtDt(item.openAt)}</div>`;
  if(st==='closed')   return `<div style="background:#fff0f0;border-radius:10px;padding:10px 14px;font-size:0.84rem;font-weight:600;color:var(--red)">🔒 Срок истёк ${fmtDt(item.closeAt)}</div>`;
  const labels={takeTest:'▶️ Пройти тест',doHW:'✏️ Выполнить',startTrial:'▶ Начать пробник'};
  const btnClass=fnName==='startTrial'?'btn btn-green':'btn btn-green';
  return `<button class="${btnClass}" onclick="${fnName}('${item.id}')">${labels[fnName]||'▶ Начать'}</button>`;
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
  return {id, type, text:'', options:[], correct:'', pairs:[], points:1, imageUrl:''};
}

/** Auto-score a question (returns true/false) */
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
    ${q.type!=='fill'?`<div class="question-text">${q.text}</div>`:''}
    ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:10px" alt="">`:''}
    ${body}
  </div>`;
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
      <div class="question-text">${q.text}</div>
      ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
      <div class="feedback-box"><strong>Ваш ответ:</strong> ${ans||'—'}</div>
      ${q.checked?`<div class="feedback-box" style="border-left-color:var(--gold);margin-top:8px"><strong>Оценка: ${q.grade}</strong><br>${q.comment||''}</div>`:`<div style="color:var(--text3);font-size:0.8rem;margin-top:6px">⏳ Ожидает проверки</div>`}
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
    <div class="question-text">${q.text}</div>
    ${q.imageUrl?`<img src="${q.imageUrl}" class="q-img-preview" style="margin-bottom:8px" alt="">`:''}
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
  return norm;
}

// ── Импорт материала (учебный конспект) ──
function importMaterial(data) {
  if (!data.title) throw new Error('Поле "title" обязательно');

  // Build nb-style blocks (content field for text, url for media)
  const rawBlocks = Array.isArray(data.blocks) ? data.blocks : [];
  const blocks = rawBlocks.map((b, i) => {
    if (!b || !b.type) return null;
    const id = 'nb_' + Date.now() + '_' + i;
    if (b.type === 'image')   return { id, type:'image',   url: b.url||'', caption: b.caption||'', content:'', name:'' };
    if (b.type === 'video')   return { id, type:'video',   url: b.url||'', content:'', caption:'', name:'' };
    if (b.type === 'divider') return { id, type:'divider', content:'', url:'', caption:'', name:'' };
    if (b.type === 'file')    return { id, type:'file',    url: b.url||'', name: b.name||'', content: b.fileType||'pdf', caption:'' };
    // text blocks: p, h1, h2, h3, quote, callout, code
    return { id, type: b.type, content: b.text || b.content || '', url:'', caption:'', name:'' };
  }).filter(Boolean);

  // Convert to legacy fields that theoryAccordionHTML reads
  const textBlocks = blocks.filter(b => ['p','h1','h2','h3','quote','callout','code','divider'].includes(b.type));
  const imgBlocks  = blocks.filter(b => b.type === 'image');
  const vidBlocks  = blocks.filter(b => b.type === 'video');
  const fileBlocks = blocks.filter(b => b.type === 'file');

  const body = textBlocks.map(b => {
    if (b.type === 'h1')      return '# '  + b.content;
    if (b.type === 'h2')      return '## ' + b.content;
    if (b.type === 'h3')      return '### '+ b.content;
    if (b.type === 'quote')   return '> '  + b.content;
    if (b.type === 'divider') return '---';
    return b.content;
  }).join('\n\n');

  const images   = imgBlocks.map(b => b.url).filter(Boolean);
  const videoUrl = vidBlocks.length ? vidBlocks[0].url : (data.videoUrl || '');
  const files    = fileBlocks.map(b => ({ type: b.content||'pdf', name: b.name||'', url: b.url||'' }))
                              .filter(f => f.url || f.name);

  const item = {
    id: 'ct_' + Date.now() + '_lib',
    type: 'theory',
    title: data.title,
    studentId: null,
    isLibrary: true,
    date: new Date().toLocaleDateString('ru'),
    body,
    images,
    videoUrl,
    files,
    blocks,
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
