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
// SECURITY CORE (упрощено: пароли в открытом виде для учебного режима)
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

// 2. Защита от брутфорса (сохраняется)
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

// 3. Проверка прав доступа
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

// 4. Безопасный доступ к объекту вместо eval()
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
  // Удаляем старые данные с passwordHash и создаём пользователей с открытым паролем
  const existingUsers = load('users')||[];
  if(existingUsers.length && existingUsers.some(u=>u.passwordHash || !u.password)){
    localStorage.removeItem('biohim_db_users');
  }

  if(!(load('users')||[]).length){
    // Создаём пользователей с паролями в открытом виде
    save('users',[
      {id:'admin', login:'admin', password:'admin123', name:'Преподаватель', role:'admin'},
      {id:'anna',  login:'anna',  password:'1234', name:'Анна Петрова',  role:'student', subject:'Биология', active:true},
      {id:'dima',  login:'dima',  password:'1234', name:'Дмитрий Козлов',role:'student', subject:'Химия',    active:true}
    ]);
  } else {
    // Миграция: если остались старые пользователи с passwordHash, заменяем на password
    const users = load('users')||[];
    let changed = false;
    users.forEach(u=>{
      if(u.passwordHash && !u.password){
        // Сопоставляем известные пароли по логину
        const known = {admin:'admin123', anna:'1234', dima:'1234'}[u.login];
        u.password = known || '';
        delete u.passwordHash;
        changed = true;
      }
    });
    if(changed) save('users', users);
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

  const users = load('users')||[];
  console.log('users in DB:', JSON.stringify(users.map(u=>({login:u.login, hasPassword:!!u.password}))));

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

  // Прямое сравнение строк (пароль в открытом виде)
  if(found.password !== upass){
    recordFailedLogin(uname);
    errEl.textContent = 'Неверный пароль.';
    return;
  }

  resetLoginAttempts(uname);
  errEl.textContent = '';
  _startSession(found);
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
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text3)">Нет учеников</td>`;
