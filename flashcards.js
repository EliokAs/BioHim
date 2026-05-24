// ═══════════════════════════════════════════════════════════════
// FLASHCARDS MODULE — BioХим Platform
// ═══════════════════════════════════════════════════════════════
// Две роли:
//   admin  → создаёт колоды и карточки, назначает ученикам
//   student→ учится через flip-карточки с оценкой «знаю / не знаю»
//            прогресс хранится в getSRData/saveSRData (SM-2)
// ═══════════════════════════════════════════════════════════════

// ─── Ключи localStorage ───────────────────────────────────────
const FC_DECKS_KEY   = 'flashcard_decks';      // массив колод
const FC_SR_PREFIX   = 'fc_sr_';               // SR-данные по карточкам

// ─── Утилиты хранения ─────────────────────────────────────────
function fcLoad()         { return load(FC_DECKS_KEY) || []; }
function fcSave(decks)    { save(FC_DECKS_KEY, decks); }

/** SM-2-совместимые данные для флешкарт конкретного ученика */
function fcSRKey(sid)           { return FC_SR_PREFIX + sid; }
function fcGetSR(sid)           {
  try { return JSON.parse(localStorage.getItem('biohim_' + fcSRKey(sid)) || '{}'); }
  catch(e) { return {}; }
}
function fcSaveSR(sid, data)    {
  localStorage.setItem('biohim_' + fcSRKey(sid), JSON.stringify(data));
}

/** Вычислить следующий интервал по алгоритму SM-2 */
function fcNextInterval(cardId, quality, srData) {
  // quality: 0 = «не знаю», 1 = «знаю»
  // Маппим на упрощённый SM-2: 0→1d, 1→ef-зависимый
  const item = srData[cardId] || { interval: 1, repetitions: 0, ef: 2.5 };
  if (quality === 0) {
    item.repetitions = 0;
    item.interval    = 1;
  } else {
    const n = item.repetitions;
    if (n === 0)      item.interval = 1;
    else if (n === 1) item.interval = 3;
    else              item.interval = Math.round(item.interval * item.ef);
    // Обновляем фактор лёгкости: q∈[0,1] → нормируем в [0,5]
    const q5  = quality === 1 ? 4 : 1;
    item.ef   = Math.max(1.3, item.ef + 0.1 - (5 - q5) * (0.08 + (5 - q5) * 0.02));
    item.repetitions += 1;
  }
  const due = new Date();
  due.setDate(due.getDate() + item.interval);
  item.nextDue  = due.toISOString().slice(0, 10);
  item.lastRated = todayStr();
  srData[cardId] = item;
  return item;
}

/** Карточки из всех колод, доступных ученику, срок которых наступил */
function fcDueCards(sid) {
  const decks  = fcLoad();
  const srData = fcGetSR(sid);
  const today  = todayStr();
  const result = [];
  decks.forEach(deck => {
    if (!fcDeckVisibleFor(deck, sid)) return;
    (deck.cards || []).forEach(card => {
      const sr = srData[card.id];
      if (!sr || sr.nextDue <= today) result.push({ ...card, deckId: deck.id, deckTitle: deck.title });
    });
  });
  return result;
}

/** Все карточки ученика (для статистики) */
function fcAllCards(sid) {
  const decks = fcLoad();
  const result = [];
  decks.forEach(deck => {
    if (!fcDeckVisibleFor(deck, sid)) return;
    (deck.cards || []).forEach(card => result.push({ ...card, deckId: deck.id, deckTitle: deck.title }));
  });
  return result;
}

/** Видима ли колода для данного ученика */
function fcDeckVisibleFor(deck, sid) {
  if (!deck.published) return false;
  if (!deck.assignedTo || deck.assignedTo.length === 0) return true; // всем
  return deck.assignedTo.includes(sid);
}

// ─── Глобальное состояние сессии ──────────────────────────────
let _fcSession = {
  queue:   [],   // [{...card, deckTitle}]
  index:   0,
  known:   0,
  unknown: 0,
  sid:     null,
  srData:  {},
};

// ═══════════════════════════════════════════════════════════════
// ADMIN — управление колодами
// ═══════════════════════════════════════════════════════════════

function renderFlashcardsAdmin() {
  const decks    = fcLoad();
  const students = (load('users') || []).filter(u => u.role === 'student' && u.active !== false);
  const el       = document.getElementById('flashcards-admin-ui');
  if (!el) return;

  el.innerHTML = `
  <div style="display:flex;gap:10px;align-items:center;margin-bottom:22px;flex-wrap:wrap">
    <h2 style="font-family:'Playfair Display',serif;font-size:1.6rem;color:var(--accent);flex:1">🃏 Флешкарты</h2>
    <button class="btn btn-green" onclick="fcOpenCreateDeck()">+ Новая колода</button>
  </div>

  ${decks.length === 0 ? `
    <div class="card" style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:2.5rem;margin-bottom:12px">🃏</div>
      <div style="font-weight:600;font-size:1rem;margin-bottom:6px">Колод пока нет</div>
      <div style="font-size:0.85rem">Создайте первую колоду — добавьте термины и определения для учеников</div>
    </div>
  ` : decks.map(deck => fcRenderDeckCard(deck, students)).join('')}
  `;

  // Модальные окна рендерим в портал на уровне <body>, чтобы position:fixed
  // был относительно viewport, а не анимирующегося предка (.page с fadeIn).
  const portal = document.getElementById('fc-modals-portal');
  if (portal) {
    portal.innerHTML = fcModalCreateDeckHTML() + fcModalEditCardHTML();
  }
}

function fcRenderDeckCard(deck, students) {
  const cards      = deck.cards || [];
  const assignedNames = (deck.assignedTo || []).map(sid => {
    const u = (students || []).find(u => u.id === sid);
    return u ? u.name : sid;
  });
  const who = assignedNames.length ? assignedNames.join(', ') : 'Все ученики';
  return `
  <div class="card" style="margin-bottom:16px">
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="font-size:2rem;flex-shrink:0">🗂</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-family:'Playfair Display',serif;font-size:1.1rem;color:var(--accent);font-weight:700">${esc(deck.title)}</span>
          <span class="badge ${deck.published ? 'badge-green' : 'badge-red'}">${deck.published ? 'Опубликована' : 'Черновик'}</span>
          <span class="badge badge-blue">${cards.length} карточек</span>
        </div>
        ${deck.description ? `<div style="font-size:0.83rem;color:var(--text3);margin-top:4px">${esc(deck.description)}</div>` : ''}
        <div style="font-size:0.78rem;color:var(--text3);margin-top:4px">👤 ${esc(who)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="fcOpenAddCard('${escAttr(deck.id)}')">+ Карточка</button>
        <button class="btn btn-outline btn-sm" onclick="fcTogglePublish('${escAttr(deck.id)}')">${deck.published ? '🙈 Скрыть' : '📢 Опубликовать'}</button>
        <button class="btn btn-outline btn-sm" onclick="fcOpenEditDeck('${escAttr(deck.id)}')">✏️</button>
        <button class="btn btn-red btn-sm" onclick="fcDeleteDeck('${escAttr(deck.id)}')">🗑</button>
      </div>
    </div>

    ${cards.length > 0 ? `
    <div style="margin-top:16px;border-top:1px solid var(--green-xpale);padding-top:14px">
      <div style="display:flex;flex-wrap:wrap;gap:10px" id="fc-cards-${escAttr(deck.id)}">
        ${cards.map(card => fcRenderAdminCard(card, deck.id)).join('')}
      </div>
    </div>
    ` : `<div style="margin-top:12px;font-size:0.83rem;color:var(--text3)">Карточек ещё нет — нажмите «+ Карточка»</div>`}
  </div>`;
}

function fcRenderAdminCard(card, deckId) {
  return `
  <div style="background:var(--bg);border:1px solid var(--green-pale);border-radius:10px;padding:10px 12px;min-width:180px;max-width:240px;position:relative">
    <div style="font-weight:700;font-size:0.85rem;color:var(--green-deep);margin-bottom:4px">${esc(card.term)}</div>
    <div style="font-size:0.78rem;color:var(--text2);line-height:1.4">${esc(card.definition)}</div>
    <div style="display:flex;gap:4px;margin-top:8px">
      <button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:0.72rem" onclick="fcEditCard('${escAttr(deckId)}','${escAttr(card.id)}')">✏️</button>
      <button class="btn btn-red btn-sm" style="padding:3px 8px;font-size:0.72rem" onclick="fcDeleteCard('${escAttr(deckId)}','${escAttr(card.id)}')">✕</button>
    </div>
  </div>`;
}

// ─── Модальные окна (создание/редактирование) ─────────────────

function fcModalCreateDeckHTML() {
  const students = (load('users') || []).filter(u => u.role === 'student' && u.active !== false);
  return `
  <div class="modal-bg" id="fc-modal-deck" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;align-items:center;justify-content:center">
    <div class="modal" style="max-width:500px;width:94%">
      <div class="modal-title" id="fc-deck-modal-title">🗂 Новая колода</div>
      <span class="modal-close" onclick="fcCloseDeckModal()">✕</span>
      <input type="hidden" id="fc-edit-deck-id">
      <div class="form-group">
        <label>Название колоды</label>
        <input id="fc-deck-title" placeholder="Биология: Клетка, Химия: Органика…">
      </div>
      <div class="form-group">
        <label>Описание <span style="font-weight:400;color:var(--text3)">(необязательно)</span></label>
        <input id="fc-deck-desc" placeholder="Краткое описание темы">
      </div>
      <div class="form-group">
        <label>Назначить ученикам <span style="font-weight:400;color:var(--text3)">(пусто = все)</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px" id="fc-assign-list">
          ${students.map(s => `
            <label style="display:flex;align-items:center;gap:6px;font-size:0.84rem;cursor:pointer;padding:5px 10px;border:1.5px solid var(--green-pale);border-radius:8px;user-select:none">
              <input type="checkbox" class="fc-assign-cb" value="${escAttr(s.id)}" style="accent-color:var(--green-mid)"> ${esc(s.name)}
            </label>
          `).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-green" onclick="fcSaveDeck()">Сохранить</button>
        <button class="btn btn-outline" onclick="fcCloseDeckModal()">Отмена</button>
      </div>
    </div>
  </div>`;
}

function fcModalEditCardHTML() {
  return `
  <div class="modal-bg" id="fc-modal-card" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1001;align-items:center;justify-content:center">
    <div class="modal" style="max-width:480px;width:94%">
      <div class="modal-title" id="fc-card-modal-title">➕ Новая карточка</div>
      <span class="modal-close" onclick="fcCloseCardModal()">✕</span>
      <input type="hidden" id="fc-edit-card-deck-id">
      <input type="hidden" id="fc-edit-card-id">
      <div class="form-group">
        <label>Термин / Вопрос <span style="font-size:0.75rem;color:var(--text3)">(лицевая сторона)</span></label>
        <textarea id="fc-card-term" rows="2" placeholder="Митохондрия"></textarea>
      </div>
      <div class="form-group">
        <label>Определение / Ответ <span style="font-size:0.75rem;color:var(--text3)">(оборотная сторона)</span></label>
        <textarea id="fc-card-def" rows="3" placeholder="Органелла клетки — «энергетическая станция»…"></textarea>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-green" onclick="fcSaveCard()">Сохранить</button>
        <button class="btn btn-outline" onclick="fcCloseCardModal()">Отмена</button>
      </div>
    </div>
  </div>`;
}

// ─── Действия преподавателя ───────────────────────────────────

function fcOpenCreateDeck() {
  document.getElementById('fc-deck-modal-title').textContent = '🗂 Новая колода';
  document.getElementById('fc-edit-deck-id').value = '';
  document.getElementById('fc-deck-title').value   = '';
  document.getElementById('fc-deck-desc').value    = '';
  document.querySelectorAll('.fc-assign-cb').forEach(cb => cb.checked = false);
  const m = document.getElementById('fc-modal-deck');
  m.style.display = 'flex';
}

function fcOpenEditDeck(deckId) {
  const decks = fcLoad();
  const deck  = decks.find(d => d.id === deckId);
  if (!deck) return;
  document.getElementById('fc-deck-modal-title').textContent = '✏️ Редактировать колоду';
  document.getElementById('fc-edit-deck-id').value = deck.id;
  document.getElementById('fc-deck-title').value   = deck.title || '';
  document.getElementById('fc-deck-desc').value    = deck.description || '';
  document.querySelectorAll('.fc-assign-cb').forEach(cb => {
    cb.checked = (deck.assignedTo || []).includes(cb.value);
  });
  document.getElementById('fc-modal-deck').style.display = 'flex';
}

function fcCloseDeckModal() {
  document.getElementById('fc-modal-deck').style.display = 'none';
}

function fcSaveDeck() {
  const title = (document.getElementById('fc-deck-title').value || '').trim();
  if (!title) { showNotif('⚠️ Введите название колоды'); return; }
  const desc      = (document.getElementById('fc-deck-desc').value || '').trim();
  const assigned  = [...document.querySelectorAll('.fc-assign-cb:checked')].map(cb => cb.value);
  const editId    = document.getElementById('fc-edit-deck-id').value;
  const decks     = fcLoad();

  if (editId) {
    const idx = decks.findIndex(d => d.id === editId);
    if (idx !== -1) {
      decks[idx].title       = title;
      decks[idx].description = desc;
      decks[idx].assignedTo  = assigned;
    }
  } else {
    decks.push({
      id:          'fc_' + Date.now(),
      title,
      description: desc,
      assignedTo:  assigned,
      published:   false,
      cards:       [],
      createdAt:   todayStr(),
    });
  }
  fcSave(decks);
  fcCloseDeckModal();
  renderFlashcardsAdmin();
  showNotif('✅ Колода сохранена');
}

function fcTogglePublish(deckId) {
  const decks = fcLoad();
  const deck  = decks.find(d => d.id === deckId);
  if (!deck) return;
  if (!deck.cards || deck.cards.length === 0) {
    showNotif('⚠️ Добавьте хотя бы одну карточку перед публикацией');
    return;
  }
  deck.published = !deck.published;
  fcSave(decks);
  renderFlashcardsAdmin();
  showNotif(deck.published ? '📢 Колода опубликована' : '🙈 Колода скрыта');
}

function fcDeleteDeck(deckId) {
  if (!confirm('Удалить колоду со всеми карточками?')) return;
  const decks = fcLoad().filter(d => d.id !== deckId);
  fcSave(decks);
  renderFlashcardsAdmin();
  showNotif('🗑 Колода удалена');
}

// ─── Карточки ─────────────────────────────────────────────────

function fcOpenAddCard(deckId) {
  document.getElementById('fc-card-modal-title').textContent = '➕ Новая карточка';
  document.getElementById('fc-edit-card-deck-id').value = deckId;
  document.getElementById('fc-edit-card-id').value      = '';
  document.getElementById('fc-card-term').value         = '';
  document.getElementById('fc-card-def').value          = '';
  document.getElementById('fc-modal-card').style.display = 'flex';
}

function fcEditCard(deckId, cardId) {
  const decks = fcLoad();
  const deck  = decks.find(d => d.id === deckId);
  const card  = (deck?.cards || []).find(c => c.id === cardId);
  if (!card) return;
  document.getElementById('fc-card-modal-title').textContent = '✏️ Редактировать карточку';
  document.getElementById('fc-edit-card-deck-id').value = deckId;
  document.getElementById('fc-edit-card-id').value      = cardId;
  document.getElementById('fc-card-term').value         = card.term || '';
  document.getElementById('fc-card-def').value          = card.definition || '';
  document.getElementById('fc-modal-card').style.display = 'flex';
}

function fcCloseCardModal() {
  document.getElementById('fc-modal-card').style.display = 'none';
}

function fcSaveCard() {
  const term = (document.getElementById('fc-card-term').value || '').trim();
  const def  = (document.getElementById('fc-card-def').value || '').trim();
  if (!term || !def) { showNotif('⚠️ Заполните термин и определение'); return; }

  const deckId = document.getElementById('fc-edit-card-deck-id').value;
  const cardId = document.getElementById('fc-edit-card-id').value;
  const decks  = fcLoad();
  const deck   = decks.find(d => d.id === deckId);
  if (!deck) return;

  if (cardId) {
    const card = (deck.cards || []).find(c => c.id === cardId);
    if (card) { card.term = term; card.definition = def; }
  } else {
    deck.cards = deck.cards || [];
    deck.cards.push({ id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), term, definition: def });
  }
  fcSave(decks);
  fcCloseCardModal();
  renderFlashcardsAdmin();
  showNotif('✅ Карточка сохранена');
}

function fcDeleteCard(deckId, cardId) {
  if (!confirm('Удалить карточку?')) return;
  const decks = fcLoad();
  const deck  = decks.find(d => d.id === deckId);
  if (!deck) return;
  deck.cards = (deck.cards || []).filter(c => c.id !== cardId);
  fcSave(decks);
  renderFlashcardsAdmin();
  showNotif('🗑 Карточка удалена');
}

// ═══════════════════════════════════════════════════════════════
// STUDENT — режим обучения
// ═══════════════════════════════════════════════════════════════

function renderStudentFlashcards(customEl) {
  const sid    = currentUser.id;
  const decks  = fcLoad().filter(d => fcDeckVisibleFor(d, sid));
  const srData = fcGetSR(sid);
  const today  = todayStr();
  const el     = customEl || document.getElementById('student-flashcards-ui');
  if (!el) return;

  // Считаем статистику
  let totalCards = 0, dueCards = 0, learnedCards = 0;
  decks.forEach(deck => {
    (deck.cards || []).forEach(card => {
      totalCards++;
      const sr = srData[card.id];
      if (!sr || sr.nextDue <= today) dueCards++;
      if (sr && (sr.repetitions || 0) > 0 && sr.nextDue > today) learnedCards++;
    });
  });

  el.innerHTML = `
  <!-- Статистика -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px">
    <div class="stat-card">
      <div class="stat-icon">🃏</div>
      <div class="stat-num">${totalCards}</div>
      <div class="stat-label">Всего карточек</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🔥</div>
      <div class="stat-num" style="color:${dueCards>0?'var(--gold)':'var(--green-deep)'}">${dueCards}</div>
      <div class="stat-label">К повторению</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">✅</div>
      <div class="stat-num">${learnedCards}</div>
      <div class="stat-label">Усвоено</div>
    </div>
  </div>

  <!-- Кнопка начать сессию -->
  ${dueCards > 0 ? `
  <div style="background:linear-gradient(135deg,#fff3cd,#ffe08a);border:1.5px solid var(--gold);border-radius:14px;padding:18px 22px;display:flex;align-items:center;gap:16px;margin-bottom:22px;flex-wrap:wrap">
    <div style="font-size:2rem">🔥</div>
    <div style="flex:1">
      <div style="font-weight:700;color:#7d5a00;font-size:1rem">Есть ${dueCards} карточек для повторения!</div>
      <div style="font-size:0.83rem;color:#9a7200;margin-top:3px">Запустите сессию — переверните карточку, оцените себя</div>
    </div>
    <button class="btn btn-green" onclick="fcStartSession('${escAttr(sid)}')">▶ Начать сессию</button>
  </div>
  ` : `
  <div style="background:var(--green-xpale);border-radius:14px;padding:16px 20px;margin-bottom:22px;text-align:center;color:var(--green-deep);font-weight:600">
    🎉 Отличная работа! На сегодня нечего повторять. Возвращайтесь завтра.
  </div>
  `}

  <!-- Список колод -->
  <div class="card">
    <div class="card-title"><span class="dot"></span>Мои колоды</div>
    ${decks.length === 0 ? `
      <div style="text-align:center;padding:30px;color:var(--text3)">
        <div style="font-size:2rem;margin-bottom:8px">🃏</div>
        <div>Преподаватель ещё не создал флешкарты</div>
      </div>
    ` : decks.map(deck => {
      const cards = deck.cards || [];
      let deckDue = 0, deckLearned = 0;
      cards.forEach(card => {
        const sr = srData[card.id];
        if (!sr || sr.nextDue <= today) deckDue++;
        else if ((sr.repetitions || 0) > 0) deckLearned++;
      });
      const pct = cards.length ? Math.round(deckLearned / cards.length * 100) : 0;
      return `
      <div style="display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--green-xpale);border-radius:12px;margin-bottom:10px;cursor:pointer;transition:box-shadow 0.18s" 
           onmouseenter="this.style.boxShadow='var(--shadow)'" onmouseleave="this.style.boxShadow=''"
           onclick="fcStartDeckSession('${escAttr(sid)}','${escAttr(deck.id)}')">
        <div style="font-size:2rem">🗂</div>
        <div style="flex:1">
          <div style="font-weight:700;color:var(--accent)">${esc(deck.title)}</div>
          ${deck.description ? `<div style="font-size:0.78rem;color:var(--text3)">${esc(deck.description)}</div>` : ''}
          <div style="margin-top:8px;background:var(--green-xpale);border-radius:20px;height:6px;width:100%;overflow:hidden">
            <div style="background:var(--green-mid);height:100%;width:${pct}%;border-radius:20px;transition:width 0.5s"></div>
          </div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px">${deckLearned}/${cards.length} усвоено · ${deckDue > 0 ? `🔥 ${deckDue} к повторению` : '✅ всё усвоено'}</div>
        </div>
        ${deckDue > 0 ? `<span class="badge badge-gold">${deckDue} карточек</span>` : `<span class="badge badge-green">✓</span>`}
      </div>`;
    }).join('')}
  </div>

  <!-- Контейнер сессии (скрыт) -->
  <div id="fc-session-container" style="display:none"></div>
  `;
}

// ─── Сессия повторения ────────────────────────────────────────

function fcStartSession(sid) {
  _fcSession = {
    queue:   fcDueCards(sid),
    index:   0,
    known:   0,
    unknown: 0,
    sid,
    srData:  fcGetSR(sid),
  };
  _fcSession.queue = _fcSession.queue.sort(() => Math.random() - 0.5); // перемешать
  if (!_fcSession.queue.length) { showNotif('🎉 Нечего повторять!'); return; }
  fcShowCard();
}

function fcStartDeckSession(sid, deckId) {
  const decks  = fcLoad();
  const deck   = decks.find(d => d.id === deckId);
  if (!deck) return;
  const today  = todayStr();
  const srData = fcGetSR(sid);
  let queue    = (deck.cards || []).map(c => ({ ...c, deckId: deck.id, deckTitle: deck.title }));
  // Сначала — просроченные, затем новые
  queue = queue.filter(c => { const sr = srData[c.id]; return !sr || sr.nextDue <= today; });
  if (!queue.length) { showNotif(`✅ Все карточки колоды «${deck.title}» усвоены!`); return; }
  _fcSession = {
    queue: queue.sort(() => Math.random() - 0.5),
    index: 0,
    known: 0,
    unknown: 0,
    sid,
    srData,
  };
  fcShowCard();
}

function fcShowCard() {
  const el = document.getElementById('fc-session-container');
  if (!el) return;

  const { queue, index, known, unknown } = _fcSession;
  if (index >= queue.length) {
    fcShowResults();
    return;
  }
  const card  = queue[index];
  const total = queue.length;
  const pct   = Math.round(index / total * 100);

  el.style.display = 'block';
  // Скроллим к сессии
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  el.innerHTML = `
  <div style="background:var(--card);border-radius:20px;border:1px solid var(--green-xpale);box-shadow:var(--shadow2);padding:28px;margin-top:20px">
    <!-- Прогресс-бар -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div style="flex:1;background:var(--green-xpale);border-radius:20px;height:8px;overflow:hidden">
        <div style="background:linear-gradient(90deg,var(--green-mid),var(--green-light));height:100%;width:${pct}%;border-radius:20px;transition:width 0.4s"></div>
      </div>
      <span style="font-size:0.82rem;color:var(--text3);white-space:nowrap">${index + 1} / ${total}</span>
      <button class="btn btn-outline btn-sm" onclick="fcEndSession()">✕ Завершить</button>
    </div>

    <!-- Колода -->
    <div style="font-size:0.75rem;color:var(--text3);text-align:center;margin-bottom:12px;letter-spacing:0.08em;text-transform:uppercase">${esc(card.deckTitle)}</div>

    <!-- Flip-карточка -->
    <div id="fc-flip-scene" style="perspective:1000px;cursor:pointer;margin:0 auto;max-width:560px;height:260px" onclick="fcFlipCard()">
      <div id="fc-flip-card" style="
        position:relative;width:100%;height:100%;
        transform-style:preserve-3d;
        transition:transform 0.55s cubic-bezier(0.4,0.2,0.2,1);
      ">
        <!-- ЛИЦЕВАЯ (термин) -->
        <div style="
          position:absolute;inset:0;backface-visibility:hidden;
          background:linear-gradient(135deg,var(--accent) 0%,var(--green-mid) 100%);
          border-radius:18px;display:flex;flex-direction:column;
          align-items:center;justify-content:center;padding:28px 32px;
          box-shadow:0 8px 32px rgba(45,106,79,0.25);
        ">
          <div style="font-size:0.72rem;letter-spacing:0.14em;color:rgba(255,255,255,0.55);text-transform:uppercase;margin-bottom:14px">Термин</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.55rem;color:#fff;text-align:center;line-height:1.3;font-weight:600">${esc(card.term)}</div>
          <div style="margin-top:22px;font-size:0.78rem;color:rgba(255,255,255,0.45)">нажмите, чтобы перевернуть</div>
        </div>
        <!-- ОБРАТНАЯ (определение) -->
        <div style="
          position:absolute;inset:0;backface-visibility:hidden;
          transform:rotateY(180deg);
          background:linear-gradient(135deg,#fff 0%,var(--green-xpale) 100%);
          border-radius:18px;display:flex;flex-direction:column;
          align-items:center;justify-content:center;padding:28px 32px;
          box-shadow:0 8px 32px rgba(45,106,79,0.18);
          border:2px solid var(--green-pale);
        ">
          <div style="font-size:0.72rem;letter-spacing:0.14em;color:var(--text3);text-transform:uppercase;margin-bottom:14px">Определение</div>
          <div style="font-size:1.05rem;color:var(--text);text-align:center;line-height:1.6">${esc(card.definition)}</div>
        </div>
      </div>
    </div>

    <!-- Кнопки оценки (скрыты до переворота) -->
    <div id="fc-rate-btns" style="display:none;justify-content:center;gap:20px;margin-top:24px">
      <button onclick="fcRate(0)" style="
        display:flex;flex-direction:column;align-items:center;gap:6px;
        padding:14px 36px;border-radius:14px;border:2px solid #f5c6c2;
        background:#fdecea;color:var(--red);cursor:pointer;font-family:Nunito,sans-serif;
        font-size:0.95rem;font-weight:700;transition:all 0.18s;
      " onmouseenter="this.style.transform='translateY(-3px)'" onmouseleave="this.style.transform=''">
        <span style="font-size:1.6rem">😕</span> Не знаю
      </button>
      <button onclick="fcRate(1)" style="
        display:flex;flex-direction:column;align-items:center;gap:6px;
        padding:14px 36px;border-radius:14px;border:2px solid var(--green-pale);
        background:linear-gradient(135deg,var(--green-deep),var(--green-mid));
        color:#fff;cursor:pointer;font-family:Nunito,sans-serif;
        font-size:0.95rem;font-weight:700;transition:all 0.18s;
        box-shadow:0 4px 16px rgba(45,106,79,0.22);
      " onmouseenter="this.style.transform='translateY(-3px)'" onmouseleave="this.style.transform=''">
        <span style="font-size:1.6rem">✅</span> Знаю!
      </button>
    </div>

    <!-- Прогресс сессии -->
    <div style="display:flex;justify-content:center;gap:24px;margin-top:20px;font-size:0.83rem">
      <span style="color:var(--green-mid);font-weight:700">✅ ${known} знаю</span>
      <span style="color:var(--red);font-weight:700">😕 ${unknown} не знаю</span>
    </div>
  </div>`;
}

let _fcFlipped = false;

function fcFlipCard() {
  const card = document.getElementById('fc-flip-card');
  const btns = document.getElementById('fc-rate-btns');
  if (!card) return;
  _fcFlipped = !_fcFlipped;
  card.style.transform = _fcFlipped ? 'rotateY(180deg)' : '';
  if (_fcFlipped && btns) {
    setTimeout(() => { btns.style.display = 'flex'; }, 300);
  } else if (btns) {
    btns.style.display = 'none';
  }
}

function fcRate(quality) {
  const { queue, index, sid } = _fcSession;
  const card = queue[index];
  if (!card) return;

  // Обновляем SM-2
  fcNextInterval(card.id, quality, _fcSession.srData);
  fcSaveSR(sid, _fcSession.srData);

  if (quality === 1) _fcSession.known++;
  else               _fcSession.unknown++;
  _fcSession.index++;
  _fcFlipped = false;
  fcShowCard();
}

function fcEndSession() {
  // Сохранить текущий прогресс
  if (_fcSession.sid) fcSaveSR(_fcSession.sid, _fcSession.srData);
  const el = document.getElementById('fc-session-container');
  if (el) el.style.display = 'none';
  showNotif('📊 Сессия завершена');
  renderStudentFlashcards();
}

function fcShowResults() {
  // Финальный экран
  const { known, unknown, queue, sid } = _fcSession;
  fcSaveSR(sid, _fcSession.srData);
  const total = known + unknown;
  const pct   = total ? Math.round(known / total * 100) : 0;
  const el    = document.getElementById('fc-session-container');
  if (!el) return;

  let msg, color;
  if (pct >= 80)      { msg = '🏆 Отличный результат!'; color = 'var(--green-mid)'; }
  else if (pct >= 50) { msg = '👍 Хороший прогресс!';   color = 'var(--gold)'; }
  else                { msg = '💪 Продолжайте учиться!'; color = 'var(--red)'; }

  el.innerHTML = `
  <div style="background:var(--card);border-radius:20px;border:1px solid var(--green-xpale);box-shadow:var(--shadow2);padding:40px 28px;margin-top:20px;text-align:center">
    <div style="font-size:3.5rem;margin-bottom:12px">${pct >= 80 ? '🏆' : pct >= 50 ? '🌱' : '💪'}</div>
    <div style="font-family:'Playfair Display',serif;font-size:1.8rem;color:${color};margin-bottom:6px">${msg}</div>
    <div style="font-size:0.9rem;color:var(--text3);margin-bottom:28px">Сессия завершена</div>

    <!-- Круговой индикатор -->
    <div style="position:relative;width:120px;height:120px;margin:0 auto 24px;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 120 120" style="position:absolute;inset:0;transform:rotate(-90deg)">
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--green-xpale)" stroke-width="10"/>
        <circle cx="60" cy="60" r="50" fill="none" stroke="${color}" stroke-width="10"
          stroke-dasharray="${2 * Math.PI * 50}" 
          stroke-dashoffset="${2 * Math.PI * 50 * (1 - pct / 100)}"
          stroke-linecap="round"
          style="transition:stroke-dashoffset 1s ease"/>
      </svg>
      <div style="font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:${color}">${pct}%</div>
    </div>

    <div style="display:flex;justify-content:center;gap:32px;margin-bottom:28px">
      <div>
        <div style="font-size:2rem;font-weight:800;color:var(--green-mid)">${known}</div>
        <div style="font-size:0.8rem;color:var(--text3)">Знаю</div>
      </div>
      <div style="width:1px;background:var(--green-xpale)"></div>
      <div>
        <div style="font-size:2rem;font-weight:800;color:var(--red)">${unknown}</div>
        <div style="font-size:0.8rem;color:var(--text3)">Не знаю</div>
      </div>
    </div>

    ${unknown > 0 ? `<div style="font-size:0.83rem;color:var(--text3);margin-bottom:20px">Карточки «Не знаю» будут показаны завтра для повторения по SM-2</div>` : ''}

    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-green" onclick="fcStartSession('${escAttr(sid)}')">🔁 Ещё раз</button>
      <button class="btn btn-outline" onclick="fcEndSession()">← К колодам</button>
    </div>
  </div>`;
}
