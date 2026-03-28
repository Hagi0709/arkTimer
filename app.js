const STORAGE_KEY = 'arkTimer_store_v2';

const MAPS = [
  'アイランド',
  'スコーチドアース',
  'センター',
  'アベレーション',
  'エクスティンクション',
  'アストレオス',
  'ラグナロク',
  'バルゲロ',
  'ロストコロニー',
  'その他'
];

const BUILDING_DURATIONS = {
  'わら': 4,
  '木': 8,
  '石': 12,
  '金属': 16,
  'TEK': 35
};

const list = document.getElementById('list');
const addBtn = document.getElementById('add');
const activeCount = document.getElementById('activeCount');
const emptyState = document.getElementById('emptyState');

const overlay = document.getElementById('overlay');
const modal = document.getElementById('modal');
const closeModalBtn = document.getElementById('closeModal');
const modalTitle = document.getElementById('modalTitle');
const submitBtn = document.getElementById('submitBtn');
const timerForm = document.getElementById('timerForm');
const editIdInput = document.getElementById('editId');

const mapSelect = document.getElementById('mapSelect');
const typeSelect = document.getElementById('typeSelect');
const materialField = document.getElementById('materialField');
const otherField = document.getElementById('otherField');
const memoInput = document.getElementById('memoInput');
const daysInput = document.getElementById('daysInput');
const hoursInput = document.getElementById('hoursInput');
const minutesInput = document.getElementById('minutesInput');

const state = {
  timers: []
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.timers = raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('load error', error);
    state.timers = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.timers));
}

function generateId() {
  return `timer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getSelectedMaterial() {
  const checked = document.querySelector('input[name="material"]:checked');
  return checked ? checked.value : 'わら';
}

function syncTypeUI() {
  const isBuilding = typeSelect.value === 'building';
  materialField.classList.toggle('hidden', !isBuilding);
  otherField.classList.toggle('hidden', isBuilding);
}

function openModal(editTarget = null) {
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (!editTarget) {
    timerForm.reset();
    editIdInput.value = '';
    typeSelect.value = 'building';
    const straw = document.querySelector('input[name="material"][value="わら"]');
    if (straw) straw.checked = true;
    daysInput.value = 0;
    hoursInput.value = 1;
    minutesInput.value = 0;
    memoInput.value = '';
    modalTitle.textContent = 'タイマー追加';
    submitBtn.textContent = '追加して開始';
    syncTypeUI();
    return;
  }

  editIdInput.value = editTarget.id;
  mapSelect.value = MAPS.includes(editTarget.map) ? editTarget.map : 'その他';
  typeSelect.value = editTarget.type;
  memoInput.value = editTarget.memo || '';
  modalTitle.textContent = 'タイマー編集';
  submitBtn.textContent = '保存';

  if (editTarget.type === 'building') {
    const radio = document.querySelector(`input[name="material"][value="${editTarget.material}"]`);
    if (radio) radio.checked = true;
    daysInput.value = 0;
    hoursInput.value = 1;
    minutesInput.value = 0;
  } else {
    const durationMs = Math.max(60000, (editTarget.endsAt - editTarget.startedAt));
    const totalMinutes = Math.floor(durationMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    daysInput.value = days;
    hoursInput.value = hours;
    minutesInput.value = minutes;
  }

  syncTypeUI();
}

function closeModal() {
  overlay.classList.add('hidden');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function formatDateWithWeekday(timestamp) {
  const date = new Date(timestamp);
  const weekdays = ['日','月','火','水','木','金','土'];
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const w = weekdays[date.getDay()];
  return `${y}/${m}/${d}(${w}) ${hh}:${mm}`;
}

function formatRemaining(ms) {
  if (ms <= 0) return '期限切れ';

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

function getRemainingMs(timer) {
  return timer.endsAt - Date.now();
}

function getRemainClass(ms) {
  if (ms <= 0) return 'danger';
  if (ms <= 24 * 60 * 60 * 1000) return 'warn';
  return '';
}

function buildTypeLabel(timer) {
  if (timer.type === 'building') {
    return `建築 / ${timer.material}`;
  }
  return 'その他';
}

function getDurationMsFromInput(type) {
  if (type === 'building') {
    const material = getSelectedMaterial();
    const days = BUILDING_DURATIONS[material];
    return days * 24 * 60 * 60 * 1000;
  }

  const days = Number(daysInput.value || 0);
  const hours = Number(hoursInput.value || 0);
  const minutes = Number(minutesInput.value || 0);

  return ((((days * 24) + hours) * 60) + minutes) * 60 * 1000;
}

function render() {
  const sorted = [...state.timers].sort((a, b) => a.endsAt - b.endsAt);
  list.innerHTML = '';

  let active = 0;

  sorted.forEach((timer) => {
    const remainMs = getRemainingMs(timer);
    if (remainMs > 0) active += 1;

    const card = document.createElement('article');
    card.className = 'card';
    if (remainMs <= 0) card.classList.add('expired');

    const remainClass = getRemainClass(remainMs);
    const remainClassAttr = remainClass ? ` ${remainClass}` : '';

    card.innerHTML = `
      <div class="img"></div>
      <div class="info">
        <div class="top-row">
          <div class="map-name">${escapeHtml(timer.map)}</div>
          <span class="type-badge">${escapeHtml(buildTypeLabel(timer))}</span>
        </div>

        <div class="small start-row"><span>開始</span><strong>${formatDateWithWeekday(timer.startedAt)}</strong></div>
        <div class="small end-row"><span>終了</span><strong>${formatDateWithWeekday(timer.endsAt)}</strong></div>

        <div class="remain">
          <span class="remain-label">残り</span>
          <span class="remain-value${remainClassAttr}">${formatRemaining(remainMs)}</span>
        </div>

        <div class="actions">
          <button class="action-btn reset-btn" type="button" data-action="reset" data-id="${timer.id}">リセット</button>
          <button class="action-btn edit-btn" type="button" data-action="edit" data-id="${timer.id}">編集</button>
        </div>
      </div>
    `;

    if (timer.memo && timer.memo.trim()) {
      const memo = document.createElement('div');
      memo.className = 'small';
      memo.style.gridColumn = '1 / -1';
      memo.innerHTML = `<span>メモ</span><strong>${escapeHtml(timer.memo)}</strong>`;
      card.querySelector('.info').appendChild(memo);
    }

    list.appendChild(card);
  });

  activeCount.textContent = String(active);
  emptyState.classList.toggle('hidden', sorted.length > 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function addTimerFromForm(event) {
  event.preventDefault();

  const map = mapSelect.value;
  const type = typeSelect.value;
  const memo = memoInput.value.trim();
  const durationMs = getDurationMsFromInput(type);
  const editingId = editIdInput.value;

  if (!map) {
    alert('マップを選択してください');
    return;
  }

  if (durationMs <= 0) {
    alert('その他タイマーは1分以上で入力してください');
    return;
  }

  const now = Date.now();

  if (editingId) {
    const index = state.timers.findIndex(timer => timer.id === editingId);
    if (index === -1) {
      alert('編集対象が見つかりません');
      return;
    }

    state.timers[index] = {
      ...state.timers[index],
      map,
      type,
      material: type === 'building' ? getSelectedMaterial() : null,
      memo,
      startedAt: now,
      endsAt: now + durationMs
    };
  } else {
    state.timers.push({
      id: generateId(),
      map,
      type,
      material: type === 'building' ? getSelectedMaterial() : null,
      memo,
      startedAt: now,
      endsAt: now + durationMs
    });
  }

  save();
  render();
  closeModal();
}

function resetTimer(id) {
  const target = state.timers.find(timer => timer.id === id);
  if (!target) return;

  const durationMs = target.type === 'building'
    ? BUILDING_DURATIONS[target.material] * 24 * 60 * 60 * 1000
    : Math.max(60000, target.endsAt - target.startedAt);

  const now = Date.now();
  target.startedAt = now;
  target.endsAt = now + durationMs;

  save();
  render();
}

function editTimer(id) {
  const target = state.timers.find(timer => timer.id === id);
  if (!target) return;
  openModal(target);
}

function bindListActions(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'reset') {
    resetTimer(id);
    return;
  }

  if (action === 'edit') {
    editTimer(id);
  }
}

function startTicker() {
  render();
  setInterval(render, 30000);
}

function bindEvents() {
  addBtn.addEventListener('click', () => openModal());
  closeModalBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  typeSelect.addEventListener('change', syncTypeUI);
  timerForm.addEventListener('submit', addTimerFromForm);
  list.addEventListener('click', bindListActions);
}

function init() {
  load();
  bindEvents();
  syncTypeUI();
  render();
  startTicker();
}

init();

