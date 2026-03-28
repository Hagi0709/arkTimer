const STORAGE_KEY = 'arkTimerData_v1';

const BUILDING_DURATIONS = {
  'わら': 4,
  '木': 8,
  '石': 12,
  '金属': 16,
  'TEK': 35,
};

const state = {
  timers: [],
};

const elements = {
  addBtn: document.getElementById('addBtn'),
  clearExpiredBtn: document.getElementById('clearExpiredBtn'),
  modal: document.getElementById('timerModal'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  form: document.getElementById('timerForm'),
  typeSelect: document.getElementById('typeSelect'),
  materialField: document.getElementById('materialField'),
  customTimerField: document.getElementById('customTimerField'),
  timerList: document.getElementById('timerList'),
  emptyState: document.getElementById('emptyState'),
  activeCount: document.getElementById('activeCount'),
  expiredCount: document.getElementById('expiredCount'),
  mapInput: document.getElementById('mapInput'),
  memoInput: document.getElementById('memoInput'),
  customDaysInput: document.getElementById('customDaysInput'),
  customHoursInput: document.getElementById('customHoursInput'),
  customMinutesInput: document.getElementById('customMinutesInput'),
  timerCardTemplate: document.getElementById('timerCardTemplate'),
};

function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function saveTimers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.timers));
}

function loadTimers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.timers = raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('データ読み込み失敗', error);
    state.timers = [];
  }
}

function openModal() {
  elements.modal.classList.remove('hidden');
  elements.modalBackdrop.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  syncFormByType();
}

function closeModal() {
  elements.modal.classList.add('hidden');
  elements.modalBackdrop.classList.add('hidden');
  document.body.style.overflow = '';
  elements.form.reset();
  elements.customDaysInput.value = 0;
  elements.customHoursInput.value = 1;
  elements.customMinutesInput.value = 0;
  const defaultMaterial = document.querySelector('input[name="material"][value="わら"]');
  if (defaultMaterial) defaultMaterial.checked = true;
  elements.typeSelect.value = 'building';
  syncFormByType();
}

function syncFormByType() {
  const isBuilding = elements.typeSelect.value === 'building';
  elements.materialField.classList.toggle('hidden', !isBuilding);
  elements.customTimerField.classList.toggle('hidden', isBuilding);
}

function getSelectedMaterial() {
  const checked = document.querySelector('input[name="material"]:checked');
  return checked ? checked.value : 'わら';
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  const hh = `${date.getHours()}`.padStart(2, '0');
  const mm = `${date.getMinutes()}`.padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

function getRemainingMs(timer) {
  return timer.endsAt - Date.now();
}

function formatRemaining(ms) {
  if (ms <= 0) return '期限切れ';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${days}日 ${hours}時間 ${minutes}分`;
}

function getStatus(timer) {
  const remaining = getRemainingMs(timer);
  if (remaining <= 0) {
    return { text: '期限切れ', expired: true };
  }

  const hoursLeft = remaining / 1000 / 60 / 60;
  if (hoursLeft <= 24) {
    return { text: '24時間以内', expired: false };
  }

  return { text: '稼働中', expired: false };
}

function buildTimerTitle(timer) {
  if (timer.type === 'building') {
    return `${timer.material}建築`;
  }
  return 'その他';
}

function buildTypeLabel(timer) {
  if (timer.type === 'building') {
    return '建築タイマー';
  }
  return 'その他';
}

function renderTimers() {
  const sorted = [...state.timers].sort((a, b) => a.endsAt - b.endsAt);
  elements.timerList.innerHTML = '';

  let active = 0;
  let expired = 0;

  for (const timer of sorted) {
    const status = getStatus(timer);
    if (status.expired) expired += 1;
    else active += 1;

    const fragment = elements.timerCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.timer-card');
    const title = fragment.querySelector('.timer-title');
    const statusBadge = fragment.querySelector('.status-badge');
    const mapBadge = fragment.querySelector('.map-badge');
    const typeBadge = fragment.querySelector('.type-badge');
    const countdownValue = fragment.querySelector('.countdown-value');
    const startedAt = fragment.querySelector('.started-at');
    const expiresAt = fragment.querySelector('.expires-at');
    const memoBlock = fragment.querySelector('.memo-block');
    const memoText = fragment.querySelector('.memo-text');
    const deleteBtn = fragment.querySelector('.delete-btn');

    title.textContent = buildTimerTitle(timer);
    statusBadge.textContent = status.text;
    mapBadge.textContent = timer.map;
    typeBadge.textContent = buildTypeLabel(timer);
    countdownValue.textContent = formatRemaining(getRemainingMs(timer));
    startedAt.textContent = formatDateTime(timer.startedAt);
    expiresAt.textContent = formatDateTime(timer.endsAt);

    if (status.expired) {
      card.classList.add('expired');
      statusBadge.classList.add('is-expired');
    }

    if (timer.memo && timer.memo.trim()) {
      memoBlock.classList.remove('hidden');
      memoText.textContent = timer.memo;
    }

    deleteBtn.addEventListener('click', () => {
      deleteTimer(timer.id);
    });

    elements.timerList.appendChild(fragment);
  }

  elements.activeCount.textContent = String(active);
  elements.expiredCount.textContent = String(expired);
  elements.emptyState.classList.toggle('hidden', sorted.length > 0);
}

function deleteTimer(id) {
  state.timers = state.timers.filter((timer) => timer.id !== id);
  saveTimers();
  renderTimers();
}

function clearExpiredTimers() {
  state.timers = state.timers.filter((timer) => getRemainingMs(timer) > 0);
  saveTimers();
  renderTimers();
}

function createTimerFromForm() {
  const formData = new FormData(elements.form);
  const type = formData.get('type');
  const map = String(formData.get('map') || '').trim();
  const memo = String(formData.get('memo') || '').trim();
  const startedAt = Date.now();

  if (!map) {
    alert('マップを入力してください');
    return null;
  }

  if (type === 'building') {
    const material = getSelectedMaterial();
    const days = BUILDING_DURATIONS[material];

    return {
      id: generateId(),
      map,
      type,
      material,
      memo,
      startedAt,
      endsAt: startedAt + days * 24 * 60 * 60 * 1000,
    };
  }

  const days = Number(elements.customDaysInput.value || 0);
  const hours = Number(elements.customHoursInput.value || 0);
  const minutes = Number(elements.customMinutesInput.value || 0);
  const totalMs = (((days * 24) + hours) * 60 + minutes) * 60 * 1000;

  if (totalMs <= 0) {
    alert('その他タイマーは1分以上で入力してください');
    return null;
  }

  return {
    id: generateId(),
    map,
    type,
    material: null,
    memo,
    startedAt,
    endsAt: startedAt + totalMs,
  };
}

function handleSubmit(event) {
  event.preventDefault();
  const timer = createTimerFromForm();
  if (!timer) return;

  state.timers.push(timer);
  saveTimers();
  renderTimers();
  closeModal();
}

function bindEvents() {
  elements.addBtn.addEventListener('click', openModal);
  elements.closeModalBtn.addEventListener('click', closeModal);
  elements.modalBackdrop.addEventListener('click', closeModal);
  elements.typeSelect.addEventListener('change', syncFormByType);
  elements.form.addEventListener('submit', handleSubmit);
  elements.clearExpiredBtn.addEventListener('click', clearExpiredTimers);
}

function startTicker() {
  renderTimers();
  setInterval(renderTimers, 30000);
}

function init() {
  loadTimers();
  bindEvents();
  syncFormByType();
  startTicker();
}

init();
