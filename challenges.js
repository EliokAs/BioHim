// ═══════════════════════════════════════════════════════════════════
// CHALLENGES, LEADERBOARD & STREAK REWARDS  — BioХим
// ═══════════════════════════════════════════════════════════════════
// Хранение: Firebase db/challenges, db/challenge_progress, db/streaks
// Лидерборд: db/leaderboard_consent + db/leaderboard_scores

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ───────────────────────────────────────

function _chRef(path){ return _fbInit().ref('challenges_module/' + path); }

function _chLoad(path){
  return _chRef(path).get().then(s => s.val());
}

function _chSave(path, val){
  return _chRef(path).set(val).catch(e => console.error('[Challenges] save error', path, e));
}

function _chUpdate(path, val){
  return _chRef(path).update(val).catch(e => console.error('[Challenges] update error', path, e));
}

// ═══════════════════════════════════════════════════════════════════
// STREAK ENGINE — серии успехов
// ═══════════════════════════════════════════════════════════════════

const STREAK_REWARDS = [
  { days: 3,  emoji: '🔥',  title: 'Первый огонь',      desc: '3 дня подряд',   xp: 30  },
  { days: 7,  emoji: '⚡',  title: 'Неделя сила',        desc: '7 дней подряд',  xp: 75  },
  { days: 14, emoji: '💎',  title: 'Бриллиантовая серия',desc: '2 недели подряд',xp: 150 },
  { days: 30, emoji: '👑',  title: 'Легенда месяца',     desc: '30 дней подряд', xp: 400 },
];

/** Вызывается каждый раз, когда ученик сдаёт тест/ДЗ. Возвращает { streak, newReward } */
async function recordStreakActivity(studentId){
  if(!studentId) return null;
  const ref  = _chRef('streaks/' + studentId);
  const snap = await ref.get();
  const data = snap.val() || { streak: 0, lastDate: null, rewarded: [] };

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  if(data.lastDate === today) return { streak: data.streak, newReward: null }; // уже учтено сегодня

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  data.streak = (data.lastDate === yesterday) ? data.streak + 1 : 1;
  data.lastDate = today;
  if(!data.rewarded) data.rewarded = [];

  // Проверяем новые награды
  let newReward = null;
  STREAK_REWARDS.forEach(r => {
    if(data.streak === r.days && !data.rewarded.includes(r.days)){
      data.rewarded.push(r.days);
      newReward = r;
    }
  });

  await ref.set(data);

  // Добавляем XP в лидерборд
  if(newReward) await addLeaderboardXP(studentId, newReward.xp, 'streak');

  return { streak: data.streak, newReward };
}

/** Получить текущий streak ученика */
async function getStreak(studentId){
  const snap = await _chRef('streaks/' + studentId).get();
  const data = snap.val() || { streak: 0, lastDate: null };
  // Сбрасываем если пропустил вчера и сегодня
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if(data.lastDate && data.lastDate !== today && data.lastDate !== yesterday){
    return 0;
  }
  return data.streak || 0;
}

// ═══════════════════════════════════════════════════════════════════
// LEADERBOARD ENGINE
// ═══════════════════════════════════════════════════════════════════

/** Обновить лидерборд: добавить XP студенту */
async function addLeaderboardXP(studentId, xp, source){
  const ref = _chRef('leaderboard/' + studentId);
  const snap = await ref.get();
  const cur  = snap.val() || { xp: 0, history: [] };
  cur.xp = (cur.xp || 0) + xp;
  cur.history = (cur.history || []);
  cur.history.push({ xp, source, date: new Date().toISOString().split('T')[0] });
  if(cur.history.length > 100) cur.history = cur.history.slice(-100);
  await ref.set(cur);
}

/** Дать согласие на участие в лидерборде */
async function setLeaderboardConsent(studentId, consented){
  await _chSave('leaderboard_consent/' + studentId, { consented, updatedAt: Date.now() });
  showNotif(consented ? '✅ Вы участвуете в лидерборде' : '👋 Вы скрыты из лидерборда');
  renderLeaderboardPage();
}

/** Загрузить данные лидерборда (только давшие согласие) */
async function loadLeaderboard(){
  const [consentSnap, lbSnap, usersSnap] = await Promise.all([
    _chRef('leaderboard_consent').get(),
    _chRef('leaderboard').get(),
    Promise.resolve(load('users') || [])
  ]);
  const consents = consentSnap.val() || {};
  const scores   = lbSnap.val()    || {};
  const result   = [];
  Object.keys(consents).forEach(uid => {
    if(!consents[uid].consented) return;
    const user = usersSnap.find(u => u.id === uid);
    if(!user) return;
    result.push({
      id: uid,
      name: user.name,
      xp: (scores[uid] || {}).xp || 0,
    });
  });
  result.sort((a, b) => b.xp - a.xp);
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// CHALLENGES ENGINE
// ═══════════════════════════════════════════════════════════════════

/** Создать челлендж (только admin) */
async function saveChallenge(data){
  requireAdmin('saveChallenge');
  const id = data.id || ('ch_' + Date.now());
  const ch = {
    id,
    title:       data.title || 'Без названия',
    description: data.description || '',
    subject:     data.subject || 'bio',        // bio | chem | both
    goal:        parseInt(data.goal) || 10,     // количество действий
    unit:        data.unit || 'задач',          // задач / баллов / уроков
    type:        data.type || 'tasks',          // tasks | score | lessons | streak
    deadline:    data.deadline || null,         // ISO date string или null
    xpReward:    parseInt(data.xpReward) || 50,
    badgeEmoji:  data.badgeEmoji || '🏆',
    createdAt:   data.createdAt || Date.now(),
    active:      data.active !== false,
    forStudents: data.forStudents || [],        // [] = для всех
  };
  await _chSave('list/' + id, ch);
  showNotif('✅ Челлендж сохранён!');
  renderChallengesAdmin();
}

/** Удалить челлендж */
async function deleteChallenge(id){
  requireAdmin('deleteChallenge');
  if(!confirm('Удалить челлендж?')) return;
  await _chRef('list/' + id).remove();
  showNotif('🗑 Челлендж удалён');
  renderChallengesAdmin();
}

/** Загрузить все активные челленджи */
async function loadChallenges(){
  const snap = await _chRef('list').get();
  const val  = snap.val() || {};
  return Object.values(val).filter(c => c.active !== false);
}

/** Загрузить прогресс ученика по всем челленджам */
async function loadStudentProgress(studentId){
  const snap = await _chRef('progress/' + studentId).get();
  return snap.val() || {};
}

/** Обновить прогресс ученика */
async function updateChallengeProgress(studentId, challengeId, delta){
  const ref  = _chRef('progress/' + studentId + '/' + challengeId);
  const snap = await ref.get();
  const cur  = snap.val() || { progress: 0, completed: false, completedAt: null };
  if(cur.completed) return cur; // уже выполнен

  cur.progress = (cur.progress || 0) + (delta || 1);

  const chSnap = await _chRef('list/' + challengeId).get();
  const ch     = chSnap.val();

  if(ch && cur.progress >= ch.goal){
    cur.completed   = true;
    cur.completedAt = Date.now();
    cur.progress    = ch.goal;
    // Выдать XP
    await addLeaderboardXP(studentId, ch.xpReward || 50, 'challenge_' + challengeId);
    // Уведомление
    addNotif(studentId, {
      type: 'challenge',
      text: `🏆 Челлендж выполнен: «${ch.title}»! +${ch.xpReward} XP`,
      nav:  'student-challenges',
    });
    showNotif(`🎉 Челлендж «${ch.title}» выполнен! +${ch.xpReward} XP`);
  }

  await ref.set(cur);
  return cur;
}

/** Интеграция: вызывается при сдаче теста/ДЗ — автоматически обновляет прогресс */
async function onStudentTaskCompleted(studentId, type, score){
  if(!studentId) return;

  // Streak
  const streakResult = await recordStreakActivity(studentId);
  if(streakResult && streakResult.newReward){
    const r = streakResult.newReward;
    setTimeout(() => showStreakRewardBanner(r, streakResult.streak), 400);
  }

  // Challenges
  const challenges = await loadChallenges();
  for(const ch of challenges){
    // Проверяем доступность для этого ученика
    if(ch.forStudents && ch.forStudents.length && !ch.forStudents.includes(studentId)) continue;
    // Проверяем дедлайн
    if(ch.deadline && new Date() > new Date(ch.deadline)) continue;

    let delta = 0;
    if(ch.type === 'tasks'  && (type === 'test' || type === 'hw' || type === 'trial')) delta = 1;
    if(ch.type === 'score'  && score) delta = score;
    if(ch.type === 'lessons' && type === 'lesson') delta = 1;
    if(ch.type === 'streak' && streakResult) delta = 0; // streak обновляется отдельно

    if(delta > 0) await updateChallengeProgress(studentId, ch.id, delta);
  }

  // Обновить лидерборд (базовые XP за активность)
  const baseXP = type === 'test' ? 10 : type === 'hw' ? 8 : type === 'trial' ? 15 : 5;
  await addLeaderboardXP(studentId, baseXP + (score ? Math.round(score / 10) : 0), type);
}

// ═══════════════════════════════════════════════════════════════════
// UI: СТРАНИЦА «ЧЕЛЛЕНДЖИ» ДЛЯ УЧЕНИКА
// ═══════════════════════════════════════════════════════════════════

async function renderStudentChallenges(){
  const el = document.getElementById('page-student-challenges');
  if(!el) return;
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Загрузка...</div>';

  const [challenges, progress, streak, consentSnap] = await Promise.all([
    loadChallenges(),
    loadStudentProgress(currentUser.id),
    getStreak(currentUser.id),
    _chRef('leaderboard_consent/' + currentUser.id).get(),
  ]);

  const consent = (consentSnap.val() || {}).consented === true;
  const lbData  = await loadLeaderboard();
  const myRank  = lbData.findIndex(x => x.id === currentUser.id) + 1;
  const myXP    = (lbData.find(x => x.id === currentUser.id) || {}).xp || 0;

  // Streak bar
  const streakBar = _buildStreakBar(streak);

  // Challenges grid
  const now = Date.now();
  const activeChallenges   = challenges.filter(c => !c.deadline || new Date(c.deadline) > new Date());
  const expiredChallenges  = challenges.filter(c => c.deadline && new Date(c.deadline) <= new Date());

  const challengeCards = activeChallenges.length
    ? activeChallenges.map(c => _buildChallengeCard(c, progress[c.id] || {}, false)).join('')
    : '<div class="empty-state"><p>Активных челленджей пока нет 🎯</p></div>';

  const expiredCards = expiredChallenges.length
    ? expiredChallenges.map(c => _buildChallengeCard(c, progress[c.id] || {}, true)).join('')
    : '';

  // Leaderboard
  const lbHtml = _buildLeaderboardHtml(lbData, currentUser.id, consent);

  el.innerHTML = `
    <div class="page-title">🏆 Челленджи и достижения</div>

    <!-- STREAK BLOCK -->
    ${streakBar}

    <div style="display:grid;grid-template-columns:1fr 360px;gap:20px;align-items:start">

      <!-- LEFT: Challenges -->
      <div>
        <div class="card">
          <div class="card-title">⚡ Активные челленджи</div>
          <div id="ch-active-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:12px">
            ${challengeCards}
          </div>
        </div>

        ${expiredCards ? `
        <div class="card" style="margin-top:16px">
          <div class="card-title" style="color:var(--text3)">⏰ Завершённые</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:12px">
            ${expiredCards}
          </div>
        </div>` : ''}
      </div>

      <!-- RIGHT: Leaderboard -->
      <div>
        ${lbHtml}

        <!-- Consent toggle -->
        <div class="card" style="margin-top:16px">
          <div style="font-size:0.85rem;font-weight:700;color:var(--accent);margin-bottom:8px">👁 Конфиденциальность</div>
          <div style="font-size:0.8rem;color:var(--text2);margin-bottom:12px;line-height:1.5">
            Участвовать в общем рейтинге необязательно. Если включено — другие ученики видят ваше имя и XP.
          </div>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.88rem;font-weight:600">
            <div class="toggle-switch ${consent ? 'on' : ''}" onclick="setLeaderboardConsent('${currentUser.id}', ${!consent})" style="width:44px;height:24px;border-radius:12px;background:${consent ? 'var(--green-mid)' : 'var(--green-pale)'};position:relative;cursor:pointer;transition:background .2s;flex-shrink:0">
              <div style="position:absolute;top:2px;left:${consent ? '22' : '2'}px;width:20px;height:20px;background:#fff;border-radius:50%;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>
            </div>
            ${consent ? '✅ Участвую в рейтинге' : '🙈 Скрыт из рейтинга'}
          </label>
        </div>
      </div>
    </div>
  `;
}

function _buildStreakBar(streak){
  const milestones = [3, 7, 14, 30];
  const nextMilestone = milestones.find(m => m > streak) || 30;
  const pct = Math.min(100, Math.round((streak / nextMilestone) * 100));

  const flame = streak >= 7 ? '🔥' : streak >= 3 ? '✨' : '💤';
  const streakColor = streak >= 14 ? 'var(--gold)' : streak >= 7 ? '#ff6b35' : streak >= 3 ? 'var(--green-mid)' : 'var(--text3)';

  const rewardIcons = STREAK_REWARDS.map(r => {
    const reached = streak >= r.days;
    return `<div title="${r.title} — ${r.desc}" style="text-align:center;opacity:${reached ? '1' : '0.35'};transition:opacity .3s">
      <div style="font-size:1.4rem">${r.emoji}</div>
      <div style="font-size:0.62rem;color:${reached ? 'var(--gold)' : 'var(--text3)'};font-weight:700;margin-top:2px">${r.days}д</div>
    </div>`;
  }).join('');

  return `
  <div class="card" style="background:linear-gradient(135deg,var(--green-xpale),var(--bg2));margin-bottom:16px;position:relative;overflow:hidden">
    <div style="position:absolute;right:-20px;top:-20px;font-size:80px;opacity:0.08;pointer-events:none">🔥</div>
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div style="text-align:center;min-width:80px">
        <div style="font-size:2.8rem;line-height:1">${flame}</div>
        <div style="font-size:2rem;font-weight:900;color:${streakColor};font-family:'Playfair Display',serif;line-height:1.1">${streak}</div>
        <div style="font-size:0.72rem;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.08em">дней подряд</div>
      </div>
      <div style="flex:1;min-width:200px">
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text2);margin-bottom:6px">
          <span>До следующей награды: <b style="color:var(--green-deep)">${nextMilestone} дней</b></span>
          <span>${streak}/${nextMilestone}</span>
        </div>
        <div style="height:8px;background:var(--green-pale);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--green-mid),${streakColor});border-radius:4px;transition:width .4s"></div>
        </div>
        <div style="display:flex;justify-content:space-around;margin-top:14px">
          ${rewardIcons}
        </div>
      </div>
    </div>
  </div>`;
}

function _buildChallengeCard(ch, prog, expired){
  const completed = prog.completed === true;
  const current   = prog.progress  || 0;
  const pct       = Math.min(100, Math.round((current / ch.goal) * 100));

  const deadlineStr = ch.deadline
    ? (() => {
        const d = new Date(ch.deadline);
        const diff = Math.ceil((d - Date.now()) / 86400000);
        if(expired) return `<span style="color:var(--text3)">Завершён ${d.toLocaleDateString('ru')}</span>`;
        return `<span style="color:${diff <= 2 ? 'var(--red)' : 'var(--text3)'}">⏳ Осталось: ${diff}д</span>`;
      })()
    : '<span style="color:var(--text3)">Бессрочно</span>';

  const statusBg = completed ? 'linear-gradient(135deg,#d4edda,#c3e6cb)' :
                   expired   ? 'var(--bg2)' : 'var(--card)';
  const opacity  = expired && !completed ? '0.65' : '1';

  return `
  <div style="background:${statusBg};border:1.5px solid ${completed ? 'var(--green-mid)' : 'var(--green-pale)'};
    border-radius:var(--radius);padding:16px;position:relative;overflow:hidden;opacity:${opacity};
    transition:transform .15s,box-shadow .15s" 
    ${!expired && !completed ? 'onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'var(--shadow2)\'"  onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'"' : ''}>
    
    ${completed ? '<div style="position:absolute;top:8px;right:8px;font-size:0.7rem;background:var(--green-mid);color:#fff;padding:2px 8px;border-radius:12px;font-weight:700">✓ ВЫПОЛНЕН</div>' : ''}
    
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
      <div style="font-size:1.8rem;line-height:1">${ch.badgeEmoji || '🏆'}</div>
      <div style="flex:1">
        <div style="font-weight:800;font-size:0.92rem;color:var(--accent);line-height:1.3">${esc(ch.title)}</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:2px">${deadlineStr}</div>
      </div>
    </div>

    ${ch.description ? `<div style="font-size:0.8rem;color:var(--text2);margin-bottom:10px;line-height:1.5">${esc(ch.description)}</div>` : ''}

    <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text2);margin-bottom:6px">
      <span>${current} / ${ch.goal} ${esc(ch.unit)}</span>
      <span style="color:var(--gold);font-weight:700">+${ch.xpReward} XP</span>
    </div>

    <div style="height:7px;background:var(--green-pale);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${completed ? 'var(--green-mid)' : 'linear-gradient(90deg,var(--green-light),var(--green-mid))'};border-radius:4px;transition:width .4s"></div>
    </div>
    <div style="text-align:right;font-size:0.7rem;color:var(--text3);margin-top:4px">${pct}%</div>
  </div>`;
}

function _buildLeaderboardHtml(lbData, currentUserId, userConsented){
  if(!lbData.length){
    return `<div class="card">
      <div class="card-title">🥇 Рейтинг учеников</div>
      <div class="empty-state" style="padding:20px 0">
        <p>Никто пока не дал согласие на участие.</p>
        <p style="font-size:0.8rem;margin-top:6px">Включите участие ниже, чтобы попасть в рейтинг.</p>
      </div>
    </div>`;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rows = lbData.slice(0, 10).map((entry, i) => {
    const isMe = entry.id === currentUserId;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;
      border-radius:10px;margin-bottom:4px;
      background:${isMe ? 'linear-gradient(135deg,var(--green-xpale),var(--bg2))' : 'transparent'};
      border:${isMe ? '1.5px solid var(--green-pale)' : '1.5px solid transparent'}">
      <div style="width:28px;text-align:center;font-size:${i < 3 ? '1.2rem' : '0.8rem'};
        color:${i < 3 ? '' : 'var(--text3)'};font-weight:700">
        ${i < 3 ? medals[i] : i + 1}
      </div>
      <div style="flex:1;font-size:0.88rem;font-weight:${isMe ? '800' : '600'};
        color:${isMe ? 'var(--green-deep)' : 'var(--text)'}">
        ${esc(entry.name)}${isMe ? ' (вы)' : ''}
      </div>
      <div style="font-size:0.82rem;font-weight:800;color:var(--gold)">
        ${entry.xp} XP
      </div>
    </div>`;
  }).join('');

  const myRank = lbData.findIndex(x => x.id === currentUserId) + 1;
  const myXP   = (lbData.find(x => x.id === currentUserId) || {}).xp || 0;

  return `
  <div class="card">
    <div class="card-title">🥇 Рейтинг учеников</div>
    ${userConsented && myRank > 0 ? `
    <div style="background:var(--green-xpale);border-radius:10px;padding:8px 12px;margin-bottom:12px;display:flex;justify-content:space-between;font-size:0.83rem">
      <span style="color:var(--text2)">Ваше место:</span>
      <span style="font-weight:800;color:var(--green-deep)">#${myRank} · ${myXP} XP</span>
    </div>` : ''}
    <div style="margin-top:8px">${rows}</div>
    ${lbData.length > 10 ? `<div style="text-align:center;font-size:0.75rem;color:var(--text3);margin-top:10px">+${lbData.length - 10} участников за пределами топ-10</div>` : ''}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// UI: СТРАНИЦА «УПРАВЛЕНИЕ ЧЕЛЛЕНДЖАМИ» ДЛЯ ADMIN
// ═══════════════════════════════════════════════════════════════════

async function renderChallengesAdmin(){
  const el = document.getElementById('page-challenges-admin');
  if(!el) return;
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Загрузка...</div>';

  const [challenges, lbData] = await Promise.all([
    loadChallenges(),
    loadLeaderboard(),
  ]);

  const students = getStudents();

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px">
    <div class="page-title" style="margin-bottom:0">🏆 Управление челленджами</div>
    <button class="btn btn-green" onclick="openCreateChallengeModal()">+ Создать челлендж</button>
  </div>

  <div style="display:grid;grid-template-columns:1fr 360px;gap:20px;align-items:start">

    <!-- LEFT: Challenges list -->
    <div>
      <div class="card">
        <div class="card-title">⚡ Активные челленджи (${challenges.length})</div>
        ${challenges.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:12px">
          ${challenges.map(c => _buildAdminChallengeCard(c)).join('')}
        </div>` : '<div class="empty-state"><p>Нет активных челленджей</p></div>'}
      </div>
    </div>

    <!-- RIGHT: Leaderboard + Stats -->
    <div>
      <div class="card">
        <div class="card-title">🥇 Текущий рейтинг</div>
        ${lbData.length ? `
        <div style="margin-top:8px">
          ${lbData.slice(0, 15).map((e, i) => {
            const medals = ['🥇','🥈','🥉'];
            return `<div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;${i % 2 === 0 ? 'background:var(--bg2)' : ''}">
              <span style="width:24px;text-align:center;font-size:${i<3?'1rem':'0.75rem'};color:${i<3?'':'var(--text3)'};">${i<3?medals[i]:i+1}</span>
              <span style="flex:1;font-size:0.85rem;font-weight:600">${esc(e.name)}</span>
              <span style="font-size:0.82rem;font-weight:800;color:var(--gold)">${e.xp} XP</span>
            </div>`;
          }).join('')}
          ${lbData.length > 15 ? `<div style="text-align:center;font-size:0.75rem;color:var(--text3);margin-top:8px">+${lbData.length - 15} участников</div>` : ''}
        </div>` : '<div class="empty-state" style="padding:16px 0"><p>Никто не дал согласие</p></div>'}
      </div>

      <!-- Streak overview -->
      <div class="card" style="margin-top:16px">
        <div class="card-title">🔥 Серии учеников</div>
        <div id="ch-admin-streaks">Загрузка...</div>
      </div>
    </div>
  </div>`;

  // Load streaks async
  Promise.all(students.map(async s => {
    const streak = await getStreak(s.id);
    return { name: s.name, streak };
  })).then(results => {
    const el2 = document.getElementById('ch-admin-streaks');
    if(!el2) return;
    results.sort((a, b) => b.streak - a.streak);
    if(!results.length){ el2.innerHTML = '<div class="empty-state"><p>Нет учеников</p></div>'; return; }
    el2.innerHTML = results.map(r => {
      const flame = r.streak >= 7 ? '🔥' : r.streak >= 3 ? '✨' : '💤';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--green-xpale)">
        <span style="font-size:1rem">${flame}</span>
        <span style="flex:1;font-size:0.85rem">${esc(r.name)}</span>
        <span style="font-weight:800;color:${r.streak >= 7 ? 'var(--gold)' : r.streak >= 3 ? 'var(--green-mid)' : 'var(--text3)'};font-size:0.88rem">${r.streak} дн.</span>
      </div>`;
    }).join('');
  });
}

function _buildAdminChallengeCard(ch){
  const subj = ch.subject === 'bio' ? '🌿 Биология' : ch.subject === 'chem' ? '⚗️ Химия' : '🔬 Оба';
  const deadline = ch.deadline ? new Date(ch.deadline).toLocaleDateString('ru') : '∞';
  return `
  <div style="background:var(--bg2);border:1.5px solid var(--green-pale);border-radius:var(--radius);padding:14px;position:relative">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:1.6rem">${ch.badgeEmoji || '🏆'}</span>
      <div>
        <div style="font-weight:800;font-size:0.88rem;color:var(--accent)">${esc(ch.title)}</div>
        <div style="font-size:0.7rem;color:var(--text3)">${subj} · до ${deadline}</div>
      </div>
    </div>
    ${ch.description ? `<div style="font-size:0.78rem;color:var(--text2);margin-bottom:8px">${esc(ch.description)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text3);margin-bottom:10px">
      <span>Цель: ${ch.goal} ${esc(ch.unit)}</span>
      <span style="color:var(--gold);font-weight:700">+${ch.xpReward} XP</span>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-outline btn-sm" onclick="openEditChallengeModal('${escAttr(ch.id)}')">✏️ Изменить</button>
      <button class="btn btn-sm" style="background:var(--red);color:#fff;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;font-size:0.78rem"
        onclick="deleteChallenge('${escAttr(ch.id)}')">🗑</button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// MODAL: Создать / редактировать челлендж
// ═══════════════════════════════════════════════════════════════════

let _editingChallengeId = null;

function openCreateChallengeModal(){
  _editingChallengeId = null;
  _fillChallengeModal({});
  openModal('modal-challenge-form');
}

async function openEditChallengeModal(id){
  const snap = await _chRef('list/' + id).get();
  const ch   = snap.val() || {};
  _editingChallengeId = id;
  _fillChallengeModal(ch);
  openModal('modal-challenge-form');
}

function _fillChallengeModal(ch){
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
  const modalTitle = document.getElementById('challenge-modal-title');
  if(modalTitle) modalTitle.textContent = _editingChallengeId ? '✏️ Редактировать челлендж' : '➕ Создать челлендж';

  set('ch-title',      ch.title      || '');
  set('ch-desc',       ch.description|| '');
  set('ch-goal',       ch.goal       || 10);
  set('ch-unit',       ch.unit       || 'задач');
  set('ch-type',       ch.type       || 'tasks');
  set('ch-deadline',   ch.deadline   || '');
  set('ch-xp',         ch.xpReward   || 50);
  set('ch-emoji',      ch.badgeEmoji || '🏆');
  set('ch-subject',    ch.subject    || 'both');

  // Students checkboxes
  const container = document.getElementById('ch-students-list');
  if(container){
    const students = getStudents();
    container.innerHTML = students.map(s => `
      <label style="display:flex;align-items:center;gap:6px;font-size:0.83rem;cursor:pointer;padding:3px 0">
        <input type="checkbox" value="${escAttr(s.id)}" ${(!ch.forStudents || ch.forStudents.length === 0 || ch.forStudents.includes(s.id)) ? 'checked' : ''}>
        ${esc(s.name)}
      </label>`).join('');
  }
}

async function submitChallengeForm(){
  const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

  const title = g('ch-title');
  if(!title){ showNotif('⚠️ Введите название'); return; }

  const forStudents = [];
  document.querySelectorAll('#ch-students-list input[type=checkbox]').forEach(cb => {
    if(cb.checked) forStudents.push(cb.value);
  });
  const allStudents = getStudents();
  const forAll = forStudents.length === allStudents.length;

  const data = {
    id:          _editingChallengeId || null,
    title,
    description: g('ch-desc'),
    goal:        g('ch-goal'),
    unit:        g('ch-unit') || 'задач',
    type:        g('ch-type') || 'tasks',
    deadline:    g('ch-deadline') || null,
    xpReward:    g('ch-xp') || 50,
    badgeEmoji:  g('ch-emoji') || '🏆',
    subject:     g('ch-subject') || 'both',
    forStudents: forAll ? [] : forStudents,
    active:      true,
  };

  await saveChallenge(data);
  closeModal('modal-challenge-form');
}

// ═══════════════════════════════════════════════════════════════════
// STREAK REWARD BANNER (popup-уведомление)
// ═══════════════════════════════════════════════════════════════════

function showStreakRewardBanner(reward, streak){
  const existing = document.getElementById('streak-reward-banner');
  if(existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'streak-reward-banner';
  banner.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.7);
    background:linear-gradient(135deg,var(--green-deep),var(--accent));
    color:#fff;border-radius:24px;padding:36px 48px;text-align:center;
    z-index:9999;box-shadow:0 20px 60px rgba(0,0,0,0.35);
    max-width:380px;width:90%;transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .3s;opacity:0;
    font-family:'Nunito',sans-serif;
  `;
  banner.innerHTML = `
    <div style="font-size:3.5rem;margin-bottom:8px">${reward.emoji}</div>
    <div style="font-size:1.4rem;font-weight:900;font-family:'Playfair Display',serif;margin-bottom:6px">${esc(reward.title)}</div>
    <div style="font-size:0.95rem;opacity:0.85;margin-bottom:4px">${esc(reward.desc)}</div>
    <div style="font-size:2rem;font-weight:900;color:var(--green-light);margin:10px 0">${streak} 🔥</div>
    <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:8px 16px;font-size:0.9rem;margin-bottom:20px">
      <span style="color:var(--gold);font-weight:800">+${reward.xp} XP</span> добавлено в рейтинг!
    </div>
    <button onclick="document.getElementById('streak-reward-banner').remove()" 
      style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:10px 28px;
      border-radius:14px;font-family:'Nunito',sans-serif;font-size:0.95rem;font-weight:700;cursor:pointer;
      transition:background .2s"
      onmouseover="this.style.background='rgba(255,255,255,0.3)'"
      onmouseout="this.style.background='rgba(255,255,255,0.2)'">
      🎉 Круто!
    </button>
  `;
  document.body.appendChild(banner);

  requestAnimationFrame(() => {
    banner.style.opacity = '1';
    banner.style.transform = 'translate(-50%,-50%) scale(1)';
  });

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'streak-banner-backdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9998';
  backdrop.onclick = () => { banner.remove(); backdrop.remove(); };
  document.body.insertBefore(backdrop, banner);

  setTimeout(() => { banner.remove(); backdrop.remove(); }, 8000);
}

// ═══════════════════════════════════════════════════════════════════
// LEADERBOARD PAGE (отдельная страница для ученика)
// ═══════════════════════════════════════════════════════════════════

async function renderLeaderboardPage(){
  // Перерендерить раздел челленджей если он активен
  if(curPage === 'student-challenges') renderStudentChallenges();
}

// ═══════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ — хук на существующие функции submit
// ═══════════════════════════════════════════════════════════════════

/**
 * Патчим существующие функции сдачи тестов/ДЗ из script.js,
 * чтобы автоматически обновлять прогресс челленджей.
 * Вызывается после загрузки DOM.
 */
function initChallengesHooks(){
  // Патч submitTest
  const _origSubmitTest = window.submitTest;
  if(typeof _origSubmitTest === 'function'){
    window.submitTest = async function(...args){
      const result = await _origSubmitTest.apply(this, args);
      if(currentUser && currentUser.role === 'student'){
        const score = typeof result === 'number' ? result : 0;
        onStudentTaskCompleted(currentUser.id, 'test', score).catch(()=>{});
      }
      return result;
    };
  }

  // Патч submitHW
  const _origSubmitHW = window.submitHW;
  if(typeof _origSubmitHW === 'function'){
    window.submitHW = async function(...args){
      const result = await _origSubmitHW.apply(this, args);
      if(currentUser && currentUser.role === 'student'){
        onStudentTaskCompleted(currentUser.id, 'hw', 0).catch(()=>{});
      }
      return result;
    };
  }

  // Патч submitTrial (если есть)
  const _origFinishTrial = window.finishTrial;
  if(typeof _origFinishTrial === 'function'){
    window.finishTrial = async function(...args){
      const result = await _origFinishTrial.apply(this, args);
      if(currentUser && currentUser.role === 'student'){
        onStudentTaskCompleted(currentUser.id, 'trial', typeof result === 'number' ? result : 0).catch(()=>{});
      }
      return result;
    };
  }
}

// Запускаем хуки после загрузки скриптов
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initChallengesHooks);
} else {
  setTimeout(initChallengesHooks, 500);
}
