/**
 * ═══════════════════════════════════════════════════════════════════
 * COURSE BINDING PATCH — course-binding.js
 * Подключается ПОСЛЕ script.js в index.html:
 *   <script src="course-binding.js"></script>
 *
 * Что делает:
 *  1. getStudents()       — для teacher возвращает только учеников его курсов
 *  2. buildStudentSelector() — для teacher показывает только своих учеников
 *  3. populateModalStudents() — для teacher отфильтровывает по курсу
 *  4. renderStudentMaterials/Tests/HW() — ученик видит только материалы своих курсов
 *  5. renderTestsAdmin / renderHWAdmin / renderContentAdmin — teacher видит только
 *     учеников своих курсов
 *  6. addTheory / saveTest / saveHW — сохраняют courseId из нового select-а
 *  7. Добавляет select «📚 Курс» в модалки создания контента/теста/ДЗ
 *  8. Добавляет фильтр-бар «Курсы» на страницах студента
 *  9. renderTeacherDashboard — показывает только студентов/курсы своего набора
 * ═══════════════════════════════════════════════════════════════════
 */

// ──────────────────────────────────────────────
// УТИЛИТЫ
// ──────────────────────────────────────────────

/** Курсы, которые ведёт текущий преподаватель */
function getTeacherCourseIds(teacherId) {
  const tid = teacherId || (currentUser && currentUser.id);
  return (load('courses') || [])
    .filter(c => c.teacherId === tid)
    .map(c => c.id);
}

/** Ученики, которые записаны хотя бы на один курс преподавателя */
function getTeacherStudentIds(teacherId) {
  const courseIds = new Set(getTeacherCourseIds(teacherId));
  if (!courseIds.size) return [];
  return (load('users') || [])
    .filter(u => u.role === 'student' && u.active !== false)
    .filter(u => (u.enrolledCourses || []).some(cid => courseIds.has(cid)))
    .map(u => u.id);
}

/** Проверить: является ли текущий пользователь teacher */
function _isTeacher() {
  return currentUser && currentUser.role === 'teacher';
}

/** Курсы ученика (объекты) */
function getStudentCourses(studentId) {
  const sid = studentId || (currentUser && currentUser.id);
  const all = load('courses') || [];
  const user = (load('users') || []).find(u => u.id === sid);
  if (!user) return [];
  return (user.enrolledCourses || [])
    .map(cid => all.find(c => c.id === cid))
    .filter(Boolean);
}

/**
 * Вставить select «📚 Курс» перед указанным элементом-контейнером
 * студентов (если ещё не добавлен).
 */
function _injectCourseSelect(beforeId, selectId) {
  // Если select уже есть — удаляем и перестраиваем (курсы могли измениться)
  const existing = document.getElementById(selectId);
  if (existing) existing.closest('.form-group') && existing.closest('.form-group').remove();
  const target = document.getElementById(beforeId);
  if (!target) return;

  // Для учителя — только его курсы; для админа — все курсы
  let courses = load('courses') || [];
  if (_isTeacher() && currentUser) {
    courses = courses.filter(c => c.teacherId === currentUser.id);
  }

  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  wrap.style.marginBottom = '10px';

  // Если у учителя нет курсов — показываем предупреждение
  if (_isTeacher() && courses.length === 0) {
    wrap.innerHTML = `
      <div style="background:#fef3cd;border-radius:10px;padding:10px 14px;font-size:0.82rem;color:#856404;border:1px solid #fce98a">
        ⚠️ У вас нет назначенных курсов. Обратитесь к администратору.
      </div>`;
    target.parentNode.insertBefore(wrap, target);
    return;
  }

  wrap.innerHTML = `
    <label style="font-size:0.82rem;color:var(--text3);display:block;margin-bottom:4px">📚 Привязать к курсу <span style="font-weight:400;color:var(--text3)">(необязательно)</span></label>
    <select id="${selectId}"
      style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--green-pale);
             font-family:Nunito,sans-serif;font-size:0.9rem;background:var(--bg)">
      <option value="">— Без курса (для всех) —</option>
      ${courses.map(c => `<option value="${c.id}">${esc(c.title)}${c.subject ? ' · ' + esc(c.subject) : ''}</option>`).join('')}
    </select>`;
  target.parentNode.insertBefore(wrap, target);
}

// ──────────────────────────────────────────────
// 1. ПЕРЕОПРЕДЕЛЕНИЕ getStudents()
//    Для teacher — только ученики его курсов
// ──────────────────────────────────────────────
const _origGetStudents = window.getStudents;
window.getStudents = function () {
  const all = _origGetStudents ? _origGetStudents() : (load('users') || []).filter(u => u.role === 'student');
  if (!_isTeacher()) return all;
  const myIds = new Set(getTeacherStudentIds());
  return all.filter(u => myIds.has(u.id));
};

// ──────────────────────────────────────────────
// 2. ПЕРЕОПРЕДЕЛЕНИЕ buildStudentSelector()
//    Для teacher — видит только своих учеников
// ──────────────────────────────────────────────
const _origBuildStudentSelector = window.buildStudentSelector;
window.buildStudentSelector = function (containerId, onChange) {
  if (!_isTeacher()) {
    return _origBuildStudentSelector(containerId, onChange);
  }
  // Teacher: показываем только учеников его курсов
  const students = getStudents(); // уже отфильтровано через переопределённый getStudents
  if (!_selectedStudent && students.length) _selectedStudent = students[0].id;
  const el = document.getElementById(containerId);
  if (!el) return;
  el._selectorOnChange = onChange;
  el.innerHTML = students.map(s => `
    <div class="student-chip ${_selectedStudent === s.id ? 'active' : ''}"
         onclick="selectStudent('${s.id}','${containerId}')">
      ${esc(s.name)}
    </div>`).join('');
};

// ──────────────────────────────────────────────
// 3. ПЕРЕОПРЕДЕЛЕНИЕ populateModalStudents()
//    Для teacher — только ученики его курсов
//    Также: если в модалке есть select курса — фильтруем по нему
// ──────────────────────────────────────────────
const _origPopulateModalStudents = window.populateModalStudents;
window.populateModalStudents = function (containerId) {
  if (!_isTeacher()) {
    return _origPopulateModalStudents(containerId);
  }
  const el = document.getElementById(containerId);
  if (!el) return;
  const students = getStudents(); // уже отфильтровано
  if (!students.length) {
    el.innerHTML = '<span style="font-size:0.82rem;color:var(--text3)">Нет учеников в ваших курсах</span>';
    return;
  }
  const cur = _selectedStudent;
  el.innerHTML = students.map(s => {
    const courses = getStudentCourses(s.id);
    const courseBadge = courses.length
      ? `<span style="font-size:0.7rem;color:var(--text3);margin-left:4px">(${courses.map(c => esc(c.title)).join(', ')})</span>`
      : '';
    return `<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;
              border:1.5px solid var(--green-pale);background:var(--white);cursor:pointer;
              font-size:0.82rem;font-weight:600;white-space:nowrap;flex-shrink:0">
      <input type="checkbox" value="${s.id}" ${(!cur || s.id === cur) ? 'checked' : ''}
        style="accent-color:var(--green-deep);flex-shrink:0;width:15px;height:15px">
      <span style="white-space:nowrap">${esc(s.name)}</span>${courseBadge}
    </label>`;
  }).join('');
};

// ──────────────────────────────────────────────
// 4. STUDENT — фильтрация по курсу
//    renderStudentMaterials / renderStudentTests / renderStudentHW
//    показывают только материалы курсов ученика
// ──────────────────────────────────────────────

/** Текущий выбранный курс-фильтр для ученика (null = все) */
let _studentCourseFilter = null;

/** Построить бар фильтрации по курсам для ученика */
function _buildStudentCourseFilterBar(containerId, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const courses = getStudentCourses(currentUser.id);
  if (courses.length <= 1) {
    el.innerHTML = '';
    if (courses.length === 1) _studentCourseFilter = courses[0].id; // авто-выбор единственного
    return;
  }
  el.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
      <span style="font-size:0.78rem;color:var(--text3);font-weight:700">📚 Курс:</span>
      <div class="student-chip ${!_studentCourseFilter ? 'active' : ''}"
           onclick="_studentCourseFilter=null;${onSelect}">Все курсы</div>
      ${courses.map(c => `
        <div class="student-chip ${_studentCourseFilter === c.id ? 'active' : ''}"
             onclick="_studentCourseFilter='${c.id}';${onSelect}">
          ${esc(c.title)}
        </div>`).join('')}
    </div>`;
}

/** Получить предметы (subjects) курсов ученика для фильтрации */
function _getStudentCourseSubjects(studentId, courseId) {
  const user = (load('users') || []).find(u => u.id === studentId);
  if (!user) return new Set();
  const allCourses = load('courses') || [];
  let enrolled = (user.enrolledCourses || []).map(cid => allCourses.find(c => c.id === cid)).filter(Boolean);
  if (courseId) enrolled = enrolled.filter(c => c.id === courseId);
  return new Set(enrolled.map(c => c.id)); // возвращаем ID курсов
}

/**
 * Проверить, принадлежит ли item ученику с учётом курсовой фильтрации.
 * item.courseId — опциональный ID курса при создании.
 * Если у item нет courseId — показываем всем enrolled студентам.
 */
function _itemMatchesCourseFilter(item, courseFilterId) {
  if (!courseFilterId) return true;       // фильтр не выбран — показываем всё
  if (!item.courseId) return true;        // у материала нет привязки к курсу — показываем всем
  return item.courseId === courseFilterId;
}

// Переопределяем renderStudentMaterials
const _origRenderStudentMaterials = window.renderStudentMaterials;
window.renderStudentMaterials = function () {
  // Вставляем бар курсов
  _buildStudentCourseFilterBar('s-course-filter-bar', 'renderStudentMaterials()');

  const sid = currentUser.id;
  let content = (load('content') || []).filter(c => c.studentId === sid);

  // Фильтр по курсу
  content = content.filter(c => _itemMatchesCourseFilter(c, _studentCourseFilter));

  const el = document.getElementById('s-list-theory-accordion');
  if (!el) return;
  if (!content.length) { el.innerHTML = emptyHTML(); return; }

  const theories   = content.filter(c => c.type === 'theory');
  const legacy     = content.filter(c => c.type !== 'theory');
  const legacyAsTheory = legacy.map(c => ({
    ...c, type: 'theory',
    videoUrl: c.type === 'video' ? (c.url || '') : (c.videoUrl || ''),
    files: c.type === 'video' ? [] : (c.files || (c.attachmentUrl
      ? [{ type: c.type === 'word' ? 'word' : 'pdf', name: c.title, url: c.attachmentUrl || c.url || '' }]
      : (c.url ? [{ type: c.type === 'word' ? 'word' : 'pdf', name: c.title, url: c.url }] : [])))
  }));
  let all = [...theories, ...legacyAsTheory];

  const viewed = _getViewedCache(sid);
  if (_materialFilter === 'viewed') all = all.filter(c => viewed[c.id]);
  if (_materialFilter === 'new')    all = all.filter(c => !viewed[c.id]);

  if (!all.length) {
    const msgs = { viewed: 'Просмотренных материалов пока нет', new: 'Все материалы уже просмотрены!' };
    el.innerHTML = `<div class="empty-state"><div class="big">📭</div><p>${msgs[_materialFilter] || 'Нет материалов'}</p></div>`;
    return;
  }
  el.innerHTML = all.map(c => theoryAccordionHTML(c, false, viewed[c.id])).join('');
};

// Переопределяем renderStudentTests
const _origRenderStudentTests = window.renderStudentTests;
window.renderStudentTests = function () {
  _buildStudentCourseFilterBar('s-tests-course-filter-bar', 'renderStudentTests()');

  const sid = currentUser.id;
  let tests = (load('tests') || []).filter(t => t.studentId === sid);

  // Фильтр по курсу
  tests = tests.filter(t => _itemMatchesCourseFilter(t, _studentCourseFilter));

  const el = document.getElementById('student-tests-list');
  if (!el) { if (_origRenderStudentTests) _origRenderStudentTests(); return; }
  if (!tests.length) { el.innerHTML = emptyHTML(); return; }

  if (_testFilter === 'pending') tests = tests.filter(t => !t.submitted);
  if (_testFilter === 'done')    tests = tests.filter(t => t.submitted && !(t.openChecked || !(t.questions || []).some(q => q.type === 'open')));
  if (_testFilter === 'checked') tests = tests.filter(t => t.submitted && (t.openChecked || !(t.questions || []).some(q => q.type === 'open')));
  tests = tests.slice().reverse();

  if (!tests.length) {
    const msgs = { all: 'Тестов пока нет', pending: 'Все тесты уже сданы! 🎉', done: 'Нет тестов на проверке', checked: 'Нет проверенных тестов' };
    const icons = { all: '📋', pending: '🎉', done: '📝', checked: '✔️' };
    el.innerHTML = `<div class="empty-state"><div class="big">${icons[_testFilter] || '📋'}</div><p>${msgs[_testFilter] || 'Нет тестов'}</p></div>`;
    return;
  }
  // Делегируем рендер каждого теста оригинальному коду (через innerHTML)
  // Используем ту же логику что и оригинальная функция
  el.innerHTML = tests.map(t => {
    const pct = t.autoTotal ? Math.round((t.autoScore || 0) / t.autoTotal * 100) : 0;
    const hasOpen = (t.questions || []).some(q => q.type === 'open');
    const fullyChecked = t.submitted && (!hasOpen || t.openChecked);
    const statusIcon = !t.submitted ? '⏳' : fullyChecked ? '✅' : '🔍';
    const statusBadge = !t.submitted
      ? `<span class="badge badge-gold">⏳ Не сдан</span>`
      : fullyChecked
        ? `<span class="badge badge-green">✅ Проверено · ${t.autoScore || 0}/${t.autoTotal || 0} б. · ${pct}%${t.finalGrade ? ' · Оценка ' + t.finalGrade : ''}</span>`
        : `<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке · авто: ${t.autoScore || 0}/${t.autoTotal || 0} б.</span>`;
    const grade = t.finalGrade || null;
    const courseLabel = t.courseId ? (() => { const c = (load('courses') || []).find(x => x.id === t.courseId); return c ? `<span style="font-size:0.7rem;background:var(--green-xpale);color:var(--green-deep);border-radius:10px;padding:2px 8px;margin-left:6px">📚 ${esc(c.title)}</span>` : ''; })() : '';
    return `<div class="card collapsible-card" data-item-id="${t.id}">
      <div class="card-title collapsible collapsed" onclick="toggleCollapse('t_${t.id}', this)">
        <span class="dot"></span>${statusIcon} ${esc(t.title)}${courseLabel}
        ${grade && t.submitted ? `<span class="grade-result-badge grade-${grade}" style="font-size:0.7rem;padding:2px 8px;margin-left:4px">${grade}</span>` : ''}
        <span class="collapse-arrow">▼</span>
      </div>
      <div class="card-collapse-body collapsed" id="cb-t_${t.id}">
        <div style="font-size:0.85rem;color:var(--text3);margin-bottom:10px">
          ⭐ ${t.maxPts || t.autoTotal || 0} б.${t.timeLimit ? ` · ⏱ ${t.timeLimit} мин` : ''}
        </div>
        <div style="margin-bottom:12px">${statusBadge}</div>
        ${t.submitted && t.teacherFeedback ? `<div class="feedback-box" style="margin-bottom:10px"><strong>💬 Отзыв преподавателя:</strong><br>${esc(t.teacherFeedback)}</div>` : ''}
        ${t.submitted ? renderTestResults(t) : availGate(t, 'takeTest')}
        <div id="cmt-test-${t.id}"></div>
      </div>
    </div>`;
  }).join('');
  tests.filter(t => t.submitted).forEach(t => {
    const el2 = document.getElementById(`cmt-test-${t.id}`);
    if (el2) renderCommentThread('test', t.id, el2);
  });
};

// Переопределяем renderStudentHW
const _origRenderStudentHW = window.renderStudentHW;
window.renderStudentHW = function () {
  _buildStudentCourseFilterBar('s-hw-course-filter-bar', 'renderStudentHW()');

  const sid = currentUser.id;
  let hws = (load('hw') || []).filter(h => h.studentId === sid);

  // Фильтр по курсу
  hws = hws.filter(h => _itemMatchesCourseFilter(h, _studentCourseFilter));

  const el = document.getElementById('student-hw-list');
  if (!el) { if (_origRenderStudentHW) _origRenderStudentHW(); return; }
  if (!hws.length) { el.innerHTML = emptyHTML(); return; }

  if (_hwFilter === 'pending') hws = hws.filter(h => !h.submitted);
  if (_hwFilter === 'done')    hws = hws.filter(h => h.submitted && !(h.openChecked || !(h.questions || []).some(q => q.type === 'open')));
  if (_hwFilter === 'checked') hws = hws.filter(h => h.submitted && (h.openChecked || !(h.questions || []).some(q => q.type === 'open')));
  hws = hws.slice().reverse();

  if (!hws.length) {
    const msgs = { all: 'ДЗ пока нет', pending: 'Все ДЗ уже сданы! 🎉', done: 'Нет ДЗ на проверке', checked: 'Нет проверенных ДЗ' };
    const icons = { all: '✏️', pending: '🎉', done: '📝', checked: '✔️' };
    el.innerHTML = `<div class="empty-state"><div class="big">${icons[_hwFilter] || '✏️'}</div><p>${msgs[_hwFilter] || 'Нет ДЗ'}</p></div>`;
    return;
  }
  el.innerHTML = hws.map(h => {
    const pct = h.autoTotal ? Math.round((h.autoScore || 0) / h.autoTotal * 100) : 0;
    const hasOpen = (h.questions || []).some(q => q.type === 'open');
    const fullyChecked = h.submitted && (!hasOpen || h.openChecked);
    const statusIcon = !h.submitted ? '⏳' : fullyChecked ? '✅' : '🔍';
    const statusBadge = !h.submitted
      ? `<span class="badge badge-gold">⏳ Не сдано</span>`
      : fullyChecked
        ? `<span class="badge badge-green">✅ Проверено · ${h.autoScore || 0}/${h.autoTotal || 0} б. · ${pct}%${h.finalGrade ? ' · Оценка ' + h.finalGrade : ''}</span>`
        : `<span class="badge" style="background:#e8f4fd;color:#1565c0;border-color:#90caf9">🔍 На проверке · авто: ${h.autoScore || 0}/${h.autoTotal || 0} б.</span>`;
    const grade = h.finalGrade || null;
    const courseLabel = h.courseId ? (() => { const c = (load('courses') || []).find(x => x.id === h.courseId); return c ? `<span style="font-size:0.7rem;background:var(--green-xpale);color:var(--green-deep);border-radius:10px;padding:2px 8px;margin-left:6px">📚 ${esc(c.title)}</span>` : ''; })() : '';
    return `<div class="card collapsible-card" data-item-id="${h.id}">
      <div class="card-title collapsible collapsed" onclick="toggleCollapse('hw_${h.id}', this)">
        <span class="dot"></span>${statusIcon} ${esc(h.title)}${courseLabel}
        ${grade && h.submitted ? `<span class="grade-result-badge grade-${grade}" style="font-size:0.7rem;padding:2px 8px;margin-left:4px">${grade}</span>` : ''}
        ${h.due ? `<span style="font-size:0.7rem;color:var(--text3);margin-left:4px">📅 ${h.due}</span>` : ''}
        <span class="collapse-arrow">▼</span>
      </div>
      <div class="card-collapse-body collapsed" id="cb-hw_${h.id}">
        ${h.desc ? `<div style="font-size:0.87rem;color:var(--text2);margin-bottom:10px">${esc(h.desc)}</div>` : ''}
        ${h.due ? `<div class="content-meta" style="margin-bottom:10px">📅 Срок: ${h.due}</div>` : ''}
        <div style="font-size:0.85rem;color:var(--text3);margin-bottom:10px">⭐ ${h.maxPts || h.autoTotal || 0} б.</div>
        <div style="margin-bottom:12px">${statusBadge}</div>
        ${h.submitted && h.teacherFeedback ? `<div class="feedback-box" style="margin-bottom:10px"><strong>💬 Отзыв преподавателя:</strong><br>${esc(h.teacherFeedback)}</div>` : ''}
        ${h.submitted ? renderHWResults(h) : availGate(h, 'doHW')}
        <div id="cmt-hw-${h.id}"></div>
      </div>
    </div>`;
  }).join('');
  hws.filter(h => h.submitted).forEach(h => {
    const el2 = document.getElementById(`cmt-hw-${h.id}`);
    if (el2) renderCommentThread('hw', h.id, el2);
  });
};

// ──────────────────────────────────────────────
// 5. TEACHER / ADMIN — фильтрация по курсу
//    renderTestsAdmin / renderHWAdmin / renderContentAdmin
// ──────────────────────────────────────────────

const _origRenderTestsAdmin = window.renderTestsAdmin;
window.renderTestsAdmin = function () {
  if (!_isTeacher()) { return _origRenderTestsAdmin(); }
  // Teacher: временно подменяем load('users') чтобы оригинал видел только своих студентов
  const _origLoad = window.load;
  const myStudentIds = new Set(getTeacherStudentIds());
  const myCourseIds = new Set(getTeacherCourseIds());
  window.load = function(k) {
    const data = _origLoad(k);
    if (k === 'users' && Array.isArray(data)) {
      return data.filter(u => u.role !== 'student' || myStudentIds.has(u.id));
    }
    if (k === 'tests' && Array.isArray(data)) {
      // Показываем тесты только для своих студентов и только привязанные к своему курсу (или без курса)
      return data.filter(t => {
        if (!t.studentId) return false;
        if (!myStudentIds.has(t.studentId)) return false;
        if (t.courseId && !myCourseIds.has(t.courseId)) return false;
        return true;
      });
    }
    return data;
  };
  try {
    _origRenderTestsAdmin();
  } finally {
    window.load = _origLoad;
  }
  _injectTeacherCourseInfoBar('tests-course-info-bar', 'tests-admin');
};

const _origRenderHWAdmin = window.renderHWAdmin;
window.renderHWAdmin = function () {
  if (!_isTeacher()) { return _origRenderHWAdmin(); }
  const _origLoad = window.load;
  const myStudentIds = new Set(getTeacherStudentIds());
  const myCourseIds = new Set(getTeacherCourseIds());
  window.load = function(k) {
    const data = _origLoad(k);
    if (k === 'users' && Array.isArray(data)) {
      return data.filter(u => u.role !== 'student' || myStudentIds.has(u.id));
    }
    if (k === 'hw' && Array.isArray(data)) {
      return data.filter(h => {
        if (!h.studentId) return false;
        if (!myStudentIds.has(h.studentId)) return false;
        if (h.courseId && !myCourseIds.has(h.courseId)) return false;
        return true;
      });
    }
    return data;
  };
  try {
    _origRenderHWAdmin();
  } finally {
    window.load = _origLoad;
  }
  _injectTeacherCourseInfoBar('hw-course-info-bar', 'hw-admin');
};

const _origRenderContentAdmin = window.renderContentAdmin;
window.renderContentAdmin = function () {
  if (_isTeacher()) {
    const _origLoad = window.load;
    const myStudentIds = new Set(getTeacherStudentIds());
    const myCourseIds = new Set(getTeacherCourseIds());
    window.load = function(k) {
      const data = _origLoad(k);
      if (k === 'users' && Array.isArray(data)) {
        return data.filter(u => u.role !== 'student' || myStudentIds.has(u.id));
      }
      if (k === 'content' && Array.isArray(data)) {
        return data.filter(c => {
          if (!c.studentId) return false;
          if (!myStudentIds.has(c.studentId)) return false;
          if (c.courseId && !myCourseIds.has(c.courseId)) return false;
          return true;
        });
      }
      return data;
    };
    try {
      _origRenderContentAdmin();
    } finally {
      window.load = _origLoad;
    }
    _injectTeacherCourseInfoBar('content-course-info-bar', 'content-admin');
  } else {
    _origRenderContentAdmin();
  }
};

/** Вставить плашку «Ваши курсы: …» над страницей для преподавателя */
function _injectTeacherCourseInfoBar(barId, pageId) {
  // Если бар уже есть — обновляем
  let bar = document.getElementById(barId);
  const page = document.getElementById('page-' + pageId);
  if (!page) return;
  const courses = (load('courses') || []).filter(c => c.teacherId === currentUser.id);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = barId;
    bar.style.cssText = 'background:var(--green-xpale);border-radius:10px;padding:8px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--green-deep);display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    const firstCard = page.querySelector('.card, .page-title, .stat-card');
    if (firstCard) page.insertBefore(bar, firstCard);
    else page.prepend(bar);
  }
  if (!courses.length) {
    bar.innerHTML = '⚠️ <b>У вас нет назначенных курсов.</b> Обратитесь к администратору.';
  } else {
    bar.innerHTML = `📚 <b>Ваши курсы:</b> ${courses.map(c => `<span style="background:var(--green-pale);border-radius:8px;padding:2px 10px;font-weight:700">${esc(c.title)}</span>`).join(' ')}
      <span style="color:var(--text3);margin-left:4px">· показаны только ученики этих курсов</span>`;
  }
}

// ──────────────────────────────────────────────
// 6. ДОБАВЛЕНИЕ courseId ПРИ СОХРАНЕНИИ
//    addTheory / saveTest / saveHW
// ──────────────────────────────────────────────

const _origAddTheory = window.addTheory;
window.addTheory = function () {
  _pendingCourseId = (document.getElementById('nth-course-select') || {}).value || null;
  _pendingCourseTimestamp = Date.now();
  _origAddTheory();
  _pendingCourseId = null;
};

const _origSaveTest = window.saveTest;
window.saveTest = function () {
  _pendingCourseId = (document.getElementById('nt-course-select') || {}).value || null;
  _pendingCourseTimestamp = Date.now();
  _origSaveTest();
  _pendingCourseId = null;
};

const _origSaveHW = window.saveHW;
window.saveHW = function () {
  _pendingCourseId = (document.getElementById('nhw-course-select') || {}).value || null;
  _pendingCourseTimestamp = Date.now();
  _origSaveHW();
  _pendingCourseId = null;
};

// Перехват save() — добавляем courseId к только что добавленным элементам
let _pendingCourseId = null;
let _pendingCourseTimestamp = 0; // метка времени создания элементов

const _origSave = window.save;
window.save = function (key, data) {
  if (_pendingCourseId && Array.isArray(data) && data.length &&
      ['content', 'tests', 'hw'].includes(key)) {
    // Добавляем courseId только к элементам без courseId, созданным прямо сейчас
    // (их id содержит _pendingCourseTimestamp или они не имеют courseId вообще)
    const now = _pendingCourseTimestamp;
    data.forEach(item => {
      if (!item.courseId && item.id && String(item.id).includes(String(now))) {
        item.courseId = _pendingCourseId;
      }
    });
  }
  return _origSave(key, data);
};

// ──────────────────────────────────────────────
// 6б. СОХРАНЕНИЕ courseId ДЛЯ ПРОБНИКА
// ──────────────────────────────────────────────
const _origSaveTrial = window.saveTrial;
if (typeof window.saveTrial === 'function') {
  window.saveTrial = function () {
    _pendingCourseId = (document.getElementById('ntr-course-select') || {}).value || null;
    _pendingCourseTimestamp = Date.now();
    _origSaveTrial();
    _pendingCourseId = null;
  };
}

// ──────────────────────────────────────────────
// 7. ИНЪЕКЦИЯ select «Курс» В МОДАЛКИ
//    Вызываем при открытии модалок
// ──────────────────────────────────────────────

const _origOpenModal = window.openModal;
window.openModal = function (id, extra) {
  _origOpenModal(id, extra);

  // Добавить select курса в модалки создания контента
  if (id === 'modal-add-theory') {
    setTimeout(() => {
      _injectCourseSelect('modal-theory-students', 'nth-course-select');
      _preselectTeacherCourse('nth-course-select');
    }, 30);
  }
  if (id === 'modal-create-test') {
    setTimeout(() => {
      _injectCourseSelect('modal-test-students', 'nt-course-select');
      _preselectTeacherCourse('nt-course-select');
    }, 30);
  }
  if (id === 'modal-create-hw') {
    setTimeout(() => {
      _injectCourseSelect('modal-hw-students', 'nhw-course-select');
      _preselectTeacherCourse('nhw-course-select');
    }, 30);
  }
  if (id === 'modal-create-trial') {
    setTimeout(() => {
      _injectCourseSelect('modal-trial-students', 'ntr-course-select');
      _preselectTeacherCourse('ntr-course-select');
    }, 30);
  }
};

/** Для teacher — авто-выбрать первый его курс в select */
function _preselectTeacherCourse(selectId) {
  if (!_isTeacher()) return;
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const myCourses = getTeacherCourseIds();
  if (myCourses.length === 1) sel.value = myCourses[0];
}

// ──────────────────────────────────────────────
// 8. ПЕРЕОПРЕДЕЛЕНИЕ renderStudentLibrary / renderStudentWorks
//    Вставляем фильтр-бары курсов прямо в разметку
// ──────────────────────────────────────────────

const _origRenderStudentLibrary = window.renderStudentLibrary;
window.renderStudentLibrary = function () {
  if (typeof _origRenderStudentLibrary === 'function') _origRenderStudentLibrary();

  // После рендера добавляем бар курсов перед аккордеоном материалов
  if (typeof _libraryTab !== 'undefined' && _libraryTab === 'materials') {
    const accordion = document.getElementById('s-list-theory-accordion');
    if (accordion && !document.getElementById('s-course-filter-bar')) {
      const bar = document.createElement('div');
      bar.id = 's-course-filter-bar';
      accordion.parentNode.insertBefore(bar, accordion);
      _buildStudentCourseFilterBar('s-course-filter-bar', 'renderStudentMaterials()');
      renderStudentMaterials(); // перерисовываем с новым баром
    }
  }
};

const _origRenderStudentWorks = window.renderStudentWorks;
window.renderStudentWorks = function () {
  if (typeof _origRenderStudentWorks === 'function') _origRenderStudentWorks();

  // После рендера вставляем бар для активной вкладки
  const tab = typeof _worksTab !== 'undefined' ? _worksTab : 'tests';
  if (tab === 'tests') {
    const list = document.getElementById('student-tests-list');
    if (list && !document.getElementById('s-tests-course-filter-bar')) {
      const bar = document.createElement('div');
      bar.id = 's-tests-course-filter-bar';
      list.parentNode.insertBefore(bar, list);
      _buildStudentCourseFilterBar('s-tests-course-filter-bar', 'renderStudentTests()');
      renderStudentTests();
    }
  } else if (tab === 'hw') {
    const list = document.getElementById('student-hw-list');
    if (list && !document.getElementById('s-hw-course-filter-bar')) {
      const bar = document.createElement('div');
      bar.id = 's-hw-course-filter-bar';
      list.parentNode.insertBefore(bar, list);
      _buildStudentCourseFilterBar('s-hw-course-filter-bar', 'renderStudentHW()');
      renderStudentHW();
    }
  }
};

// ──────────────────────────────────────────────
// 9. РАСШИРЕНИЕ renderTeacherDashboard
//    Показывает плашку курсов преподавателя
// ──────────────────────────────────────────────

const _origRenderTeacherDashboard = window.renderTeacherDashboard;
window.renderTeacherDashboard = function () {
  if (typeof _origRenderTeacherDashboard === 'function') _origRenderTeacherDashboard();
  // Добавить/обновить плашку курсов
  const page = document.getElementById('page-teacher-dashboard');
  if (!page) return;
  let bar = document.getElementById('teacher-course-summary-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'teacher-course-summary-bar';
    const firstEl = page.querySelector('.stat-card, .card, .page-title');
    if (firstEl && firstEl.parentNode) firstEl.parentNode.insertBefore(bar, firstEl);
    else page.prepend(bar);
  }
  const myCourses = (load('courses') || []).filter(c => c.teacherId === currentUser.id);
  const myStudentIds = getTeacherStudentIds();
  const myStudents = (load('users') || []).filter(u => myStudentIds.includes(u.id));
  if (!myCourses.length) {
    bar.innerHTML = `<div style="background:var(--green-xpale);border-radius:12px;padding:12px 18px;margin-bottom:16px;color:var(--green-deep);font-size:0.88rem">
      ⚠️ <b>У вас нет назначенных курсов.</b> Обратитесь к администратору для привязки курсов.
    </div>`;
    return;
  }
  bar.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--green-xpale),var(--bg2));border-radius:14px;padding:14px 18px;margin-bottom:16px;border:1.5px solid var(--green-pale)">
      <div style="font-weight:700;font-size:0.88rem;color:var(--accent);margin-bottom:10px">📚 Мои курсы и ученики</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
        ${myCourses.map(c => {
          const enrolled = myStudents.filter(s => (s.enrolledCourses || []).includes(c.id));
          return `<div style="background:var(--white);border-radius:10px;padding:10px 14px;border:1px solid var(--green-pale)">
            <div style="font-weight:700;font-size:0.88rem;color:var(--green-deep);margin-bottom:4px">📖 ${esc(c.title)}</div>
            ${c.subject ? `<div style="font-size:0.73rem;color:var(--text3);margin-bottom:6px">${esc(c.subject)}</div>` : ''}
            <div style="font-size:0.78rem;color:var(--text2)">👥 ${enrolled.length} ${enrolled.length === 1 ? 'ученик' : enrolled.length >= 2 && enrolled.length <= 4 ? 'ученика' : 'учеников'}</div>
            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:3px">
              ${enrolled.map(s => `<span style="background:var(--green-xpale);border-radius:12px;padding:1px 8px;font-size:0.7rem;font-weight:600;color:var(--green-deep)">${esc(s.name.split(' ')[0])}</span>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
};

// ──────────────────────────────────────────────
// Сброс фильтра курсов при смене роли / выходе
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  const waitForLogin = setInterval(() => {
    if (typeof currentUser !== 'undefined') {
      clearInterval(waitForLogin);
      // Сбрасываем фильтр курсов когда открывается приложение
      _studentCourseFilter = null;
    }
  }, 300);
});

console.log('[course-binding] ✅ Курсовая привязка загружена');
