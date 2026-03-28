const STORAGE_KEY = 'arkTimer_store_v3';

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

const DEFAULT_MAP_IMAGES = {
  'アイランド':'IMG_3555.jpeg',
  'スコーチドアース':'IMG_3556.jpeg',
  'センター':'IMG_3557.webp',
  'アベレーション':'IMG_3558.jpeg',
  'エクスティンクション':'IMG_3559.jpeg',
  'アストレオス':'12DB1A38-79FA-496C-9F06-F24C06567D9F.png',
  'ラグナロク':'69640213-1F63-4F2F-8C97-1072ADA3AC83.jpeg',
  'バルゲロ':'5F4DEDA4-23E1-425C-9C92-C43A614C19B1.png',
  'ロストコロニー':'EC5D5564-E4FE-431C-999B-4FAE6F4848D6.png',
  'その他':'IMG_3570.jpeg'
};

const BUILDING_DURATIONS = {
  'わら':4,
  '木':8,
  '石':12,
  '金属':16,
  'TEK':35
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
const imageModeInput = document.getElementById('imageMode');
const mapSelect = document.getElementById('mapSelect');
const typeSelect = document.getElementById('typeSelect');
const materialField = document.getElementById('materialField');
const otherField = document.getElementById('otherField');
const memoInput = document.getElementById('memoInput');
const daysInput = document.getElementById('daysInput');
const hoursInput = document.getElementById('hoursInput');
const minutesInput = document.getElementById('minutesInput');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewLabel = document.getElementById('imagePreviewLabel');
const useDefaultImageBtn = document.getElementById('useDefaultImageBtn');

const state = {
  timers: [],
  pendingCustomImage: ''
};

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    state.timers = raw ? JSON.parse(raw) : [];
  }catch(error){
    console.error('load error', error);
    state.timers = [];
  }
}

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.timers));
}

function generateId(){
  return `timer_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
}

function getSelectedMaterial(){
  const checked = document.querySelector('input[name="material"]:checked');
  return checked ? checked.value : 'わら';
}

function syncTypeUI(){
  const isBuilding = typeSelect.value === 'building';
  materialField.classList.toggle('hidden', !isBuilding);
  otherField.classList.toggle('hidden', isBuilding);
}

function getDefaultImageForMap(mapName){
  return DEFAULT_MAP_IMAGES[mapName] || '';
}

function setPreviewImage(src, labelText){
  imagePreview.style.backgroundImage = src ? `url("${src}")` : '';
  imagePreview.classList.toggle('is-empty', !src);
  imagePreviewLabel.textContent = labelText;
}

function refreshImagePreviewForCurrentForm(){
  const map = mapSelect.value;

  if (imageModeInput.value === 'custom' && state.pendingCustomImage){
    setPreviewImage(state.pendingCustomImage, 'CUSTOM');
    return;
  }

  const defaultImage = getDefaultImageForMap(map);
  if (defaultImage) setPreviewImage(defaultImage, 'DEFAULT');
  else setPreviewImage('', 'NO IMAGE');
}

function resetPendingImageToDefault(){
  state.pendingCustomImage = '';
  imageModeInput.value = 'default';
  imageInput.value = '';
  refreshImagePreviewForCurrentForm();
}

function openModal(editTarget = null){
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (!editTarget){
    timerForm.reset();
    editIdInput.value = '';
    imageModeInput.value = 'default';
    state.pendingCustomImage = '';
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
    refreshImagePreviewForCurrentForm();
    return;
  }

  editIdInput.value = editTarget.id;
  mapSelect.value = MAPS.includes(editTarget.map) ? editTarget.map : 'その他';
  typeSelect.value = editTarget.type;
  memoInput.value = editTarget.memo || '';
  modalTitle.textContent = 'タイマー編集';
  submitBtn.textContent = '保存';

  if (editTarget.type === 'building'){
    const radio = document.querySelector(`input[name="material"][value="${editTarget.material}"]`);
    if (radio) radio.checked = true;
    daysInput.value = 0;
    hoursInput.value = 1;
    minutesInput.value = 0;
  }else{
    const durationMs = Math.max(60000, (editTarget.endsAt - editTarget.startedAt));
    const totalMinutes = Math.floor(durationMs / 60000);
    daysInput.value = Math.floor(totalMinutes / 1440);
    hoursInput.value = Math.floor((totalMinutes % 1440) / 60);
    minutesInput.value = totalMinutes % 60;
  }

  if (editTarget.imageMode === 'custom' && editTarget.imageSrc){
    imageModeInput.value = 'custom';
    state.pendingCustomImage = editTarget.imageSrc;
  }else{
    imageModeInput.value = 'default';
    state.pendingCustomImage = '';
  }

  imageInput.value = '';
  syncTypeUI();
  refreshImagePreviewForCurrentForm();
}

function closeModal(){
  overlay.classList.add('hidden');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function formatDateWithWeekday(timestamp){
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

function formatRemaining(ms){
  if (ms <= 0) return '期限切れ';

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

function getRemainingMs(timer){
  return timer.endsAt - Date.now();
}

function getRemainClass(ms){
  if (ms <= 0) return 'danger';
  if (ms <= 24 * 60 * 60 * 1000) return 'warn';
  return '';
}

function buildTypeLabel(timer){
  return timer.type === 'building' ? `建築 / ${timer.material}` : 'その他';
}

function getDurationMsFromInput(type){
  if (type === 'building'){
    const material = getSelectedMaterial();
    return BUILDING_DURATIONS[material] * 24 * 60 * 60 * 1000;
  }

  const days = Number(daysInput.value || 0);
  const hours = Number(hoursInput.value || 0);
  const minutes = Number(minutesInput.value || 0);

  return ((((days * 24) + hours) * 60) + minutes) * 60 * 1000;
}

function getTimerImageSrc(timer){
  if (timer.imageMode === 'custom' && timer.imageSrc) return timer.imageSrc;
  return getDefaultImageForMap(timer.map);
}

function escapeHtml(value){
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function render(){
  const sorted = [...state.timers].sort((a,b) => a.endsAt - b.endsAt);
  list.innerHTML = '';

  let active = 0;

  sorted.forEach((timer) => {
    const remainMs = getRemainingMs(timer);
    if (remainMs > 0) active += 1;

    const remainClass = getRemainClass(remainMs);
    const imageSrc = getTimerImageSrc(timer);

    const card = document.createElement('article');
    card.className = `card${remainMs <= 0 ? ' expired' : ''}`;
    card.innerHTML = `
      <div class="img ${imageSrc ? '' : 'no-image'}"></div>
      <div class="info">
        <div class="top-row">
          <div class="map-name">${escapeHtml(timer.map)}</div>
          <span class="type-badge">${escapeHtml(buildTypeLabel(timer))}</span>
        </div>

        <div class="small start-row"><span>開始</span><strong>${formatDateWithWeekday(timer.startedAt)}</strong></div>
        <div class="small end-row"><span>終了</span><strong>${formatDateWithWeekday(timer.endsAt)}</strong></div>

        <div class="remain">
          <span class="remain-label">残り</span>
          <span class="remain-value${remainClass ? ' ' + remainClass : ''}">${formatRemaining(remainMs)}</span>
        </div>

        <div class="actions">
          <button class="action-btn reset-btn" type="button" data-action="reset" data-id="${timer.id}">リセット</button>
          <button class="action-btn edit-btn" type="button" data-action="edit" data-id="${timer.id}">編集</button>
        </div>
      </div>
    `;

    const imgEl = card.querySelector('.img');
    if (imageSrc) imgEl.style.backgroundImage = `url("${imageSrc}")`;

    if (timer.memo && timer.memo.trim()){
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

function buildTimerPayload(now, keepId = null){
  const map = mapSelect.value;
  const type = typeSelect.value;
  const memo = memoInput.value.trim();
  const durationMs = getDurationMsFromInput(type);

  if (!map){
    alert('マップを選択してください');
    return null;
  }

  if (durationMs <= 0){
    alert('その他タイマーは1分以上で入力してください');
    return null;
  }

  return {
    id: keepId || generateId(),
    map,
    type,
    material: type === 'building' ? getSelectedMaterial() : null,
    memo,
    startedAt: now,
    endsAt: now + durationMs,
    imageMode: imageModeInput.value === 'custom' && state.pendingCustomImage ? 'custom' : 'default',
    imageSrc: imageModeInput.value === 'custom' && state.pendingCustomImage ? state.pendingCustomImage : ''
  };
}

function addTimerFromForm(event){
  event.preventDefault();

  const now = Date.now();
  const editingId = editIdInput.value;
  const payload = buildTimerPayload(now, editingId || null);
  if (!payload) return;

  if (editingId){
    const index = state.timers.findIndex(timer => timer.id === editingId);
    if (index === -1){
      alert('編集対象が見つかりません');
      return;
    }
    state.timers[index] = payload;
  }else{
    state.timers.push(payload);
  }

  save();
  render();
  closeModal();
}

function resetTimer(id){
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

function editTimer(id){
  const target = state.timers.find(timer => timer.id === id);
  if (!target) return;
  openModal(target);
}

function bindListActions(event){
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'reset') return resetTimer(id);
  if (action === 'edit') return editTimer(id);
}

function handleImageChange(event){
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    state.pendingCustomImage = String(reader.result || '');
    imageModeInput.value = 'custom';
    refreshImagePreviewForCurrentForm();
  };
  reader.readAsDataURL(file);
}

function startTicker(){
  render();
  setInterval(render, 30000);
}

function bindEvents(){
  addBtn.addEventListener('click', () => openModal());
  closeModalBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  typeSelect.addEventListener('change', syncTypeUI);
  timerForm.addEventListener('submit', addTimerFromForm);
  list.addEventListener('click', bindListActions);
  mapSelect.addEventListener('change', () => {
    if (imageModeInput.value !== 'custom') refreshImagePreviewForCurrentForm();
  });
  imageInput.addEventListener('change', handleImageChange);
  useDefaultImageBtn.addEventListener('click', resetPendingImageToDefault);
}

function init(){
  load();
  bindEvents();
  syncTypeUI();
  refreshImagePreviewForCurrentForm();
  render();
  startTicker();
}

init();
