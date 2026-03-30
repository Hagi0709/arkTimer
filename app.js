const STORAGE_KEY='arkTimer_store_v8';
const MAPS=['アイランド','スコーチドアース','センター','アベレーション','エクスティンクション','アストレオス','ラグナロク','バルゲロ','ロストコロニー','その他'];
const DEFAULT_MAP_IMAGES={'アイランド':'IMG_3555.jpeg','スコーチドアース':'IMG_3556.jpeg','センター':'IMG_3557.webp','アベレーション':'IMG_3558.jpeg','エクスティンクション':'IMG_3559.jpeg','アストレオス':'12DB1A38-79FA-496C-9F06-F24C06567D9F.png','ラグナロク':'69640213-1F63-4F2F-8C97-1072ADA3AC83.jpeg','バルゲロ':'5F4DEDA4-23E1-425C-9C92-C43A614C19B1.png','ロストコロニー':'EC5D5564-E4FE-431C-999B-4FAE6F4848D6.png','その他':'IMG_3570.jpeg'};
const MAP_BOUNDS={'アイランド':{width:100,height:100},'スコーチドアース':{width:100,height:100},'センター':{width:100,height:100},'アベレーション':{width:100,height:100},'エクスティンクション':{width:100,height:100},'アストレオス':{width:100,height:100},'ラグナロク':{width:100,height:100},'バルゲロ':{width:100,height:100},'ロストコロニー':{width:100,height:100},'その他':{width:100,height:100}};
const TRIBE_TOWER_ICON='7369529A-E04B-4212-8F0A-F320CC106E5E.png';
const GENERATOR_ICON='026D0A6D-7E86-4E5E-823D-3DE7D2909B98.png';
const BUILDING_DURATIONS={'わら':4,'木':8,'石':12,'金属':16,'TEK':35};
const SORT_KEY='arkTimer_sort_mode';
const $=id=>document.getElementById(id);
const list=$('list'),addBtn=$('add'),sortSelect=$('sortSelect'),activeCount=$('activeCount'),emptyState=$('emptyState'),overlay=$('overlay'),modal=$('modal'),closeModalBtn=$('closeModal'),modalTitle=$('modalTitle'),submitBtn=$('submitBtn'),timerForm=$('timerForm'),editIdInput=$('editId'),imageModeInput=$('imageMode'),mapSelect=$('mapSelect'),typeSelect=$('typeSelect'),materialField=$('materialField'),customTimerField=$('customTimerField'),memoInput=$('memoInput'),timerNameInput=$('timerNameInput'),latInput=$('latInput'),lngInput=$('lngInput'),daysInput=$('daysInput'),hoursInput=$('hoursInput'),minutesInput=$('minutesInput'),imageInput=$('imageInput'),imagePreview=$('imagePreview'),imagePreviewButton=$('imagePreviewButton'),imagePreviewPin=$('imagePreviewPin'),showPinInput=$('showPinInput'),confirmOverlay=$('confirmOverlay'),confirmTitle=$('confirmTitle'),confirmText=$('confirmText'),confirmCancel=$('confirmCancel'),confirmOk=$('confirmOk'),materialDays=$('materialDays');
const state={timers:[],pendingCustomImage:'',confirmResolver:null,sortMode:'dueSoon'};

function load(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    state.timers=raw?JSON.parse(raw):[];
  }catch(e){
    state.timers=[];
  }
  try{
    state.sortMode=localStorage.getItem(SORT_KEY)||'dueSoon';
  }catch(e){
    state.sortMode='dueSoon';
  }
  normalizeTimers();
}

function normalizeTimers(){
  state.timers=state.timers.map((timer,index)=>({
    showPin:timer.showPin!==false,
    sortOrder:Number.isFinite(Number(timer.sortOrder))?Number(timer.sortOrder):index,
    ...timer
  }));
}

function save(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state.timers));
  localStorage.setItem(SORT_KEY,state.sortMode);
}

function generateId(){return `timer_${Date.now()}_${Math.random().toString(36).slice(2,9)}`}
function getSelectedMaterial(){const checked=document.querySelector('input[name="material"]:checked');return checked?checked.value:'TEK'}
function updateMaterialDays(){const material=getSelectedMaterial();materialDays.textContent=`${material} ${BUILDING_DURATIONS[material]}日`}
function syncTypeUI(){const type=typeSelect.value;materialField.classList.toggle('hidden',type!=='building');customTimerField.classList.toggle('hidden',type==='building');if(type!=='building'){daysInput.value='';hoursInput.value='';minutesInput.value=''}updateMaterialDays()}
function getDefaultImageForMap(mapName){return DEFAULT_MAP_IMAGES[mapName]||''}
function setPreviewImage(src){imagePreview.style.backgroundImage=src?`url("${src}")`:'';imagePreview.classList.toggle('is-empty',!src)}
function getMapBounds(mapName){return MAP_BOUNDS[mapName]||{width:100,height:100}}
function clamp(num,min,max){return Math.min(max,Math.max(min,num))}
function parseCoord(value){const num=Number(String(value||'').trim());return Number.isFinite(num)?num:null}
function getPinPosition(mapName,lat,lng){
  const latNum=parseCoord(lat),lngNum=parseCoord(lng);
  if(latNum===null||lngNum===null)return null;
  const bounds=getMapBounds(mapName);
  const left=clamp((lngNum/bounds.width)*100,0,100);
  const top=clamp((latNum/bounds.height)*100,0,100);
  return {left,top};
}
function setPinElement(pinEl,mapName,lat,lng,showPin=true){
  if(!pinEl)return;
  const pos=showPin?getPinPosition(mapName,lat,lng):null;
  if(!pos){pinEl.classList.add('hidden');return}
  pinEl.classList.remove('hidden');
  pinEl.style.left=`${pos.left}%`;
  pinEl.style.top=`${pos.top}%`;
}
function refreshPreviewPin(){setPinElement(imagePreviewPin,mapSelect.value,latInput.value,lngInput.value,showPinInput.checked)}
function refreshImagePreviewForCurrentForm(){const defaultImage=getDefaultImageForMap(mapSelect.value);imageModeInput.value='default';state.pendingCustomImage='';imageInput.value='';setPreviewImage(defaultImage||'');refreshPreviewPin()}

function openModal(editTarget=null){
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.body.style.overflow='hidden';
  if(!editTarget){
    timerForm.reset();
    editIdInput.value='';
    imageModeInput.value='default';
    state.pendingCustomImage='';
    typeSelect.value='building';
    if(showPinInput)showPinInput.checked=true;
    const tek=document.querySelector('input[name="material"][value="TEK"]');
    if(tek)tek.checked=true;
    daysInput.value='';hoursInput.value='';minutesInput.value='';memoInput.value='';timerNameInput.value='';latInput.value='';lngInput.value='';
    modalTitle.textContent='タイマー追加';
    submitBtn.textContent='追加して開始';
    syncTypeUI();
    refreshImagePreviewForCurrentForm();
    return;
  }
  editIdInput.value=editTarget.id;
  mapSelect.value=MAPS.includes(editTarget.map)?editTarget.map:'その他';
  typeSelect.value=editTarget.type;
  memoInput.value=editTarget.memo||'';
  timerNameInput.value=editTarget.timerName||'';
  latInput.value=editTarget.lat||'';
  lngInput.value=editTarget.lng||'';
  if(showPinInput)showPinInput.checked=editTarget.showPin!==false;
  modalTitle.textContent='タイマー編集';
  submitBtn.textContent='保存';
  if(editTarget.type==='building'){
    const radio=document.querySelector(`input[name="material"][value="${editTarget.material}"]`);
    if(radio)radio.checked=true;
    daysInput.value='';hoursInput.value='';minutesInput.value='';
  }else{
    const durationMs=Math.max(60000,editTarget.endsAt-editTarget.startedAt);
    const totalMinutes=Math.floor(durationMs/60000);
    daysInput.value=Math.floor(totalMinutes/1440)||'';
    hoursInput.value=Math.floor((totalMinutes%1440)/60)||'';
    minutesInput.value=totalMinutes%60||'';
  }
  if(editTarget.imageMode==='custom'&&editTarget.imageSrc){
    imageModeInput.value='custom';
    state.pendingCustomImage=editTarget.imageSrc;
    setPreviewImage(editTarget.imageSrc);
  }else{
    const defaultImage=getDefaultImageForMap(mapSelect.value);
    imageModeInput.value='default';
    state.pendingCustomImage='';
    setPreviewImage(defaultImage||'');
  }
  imageInput.value='';
  syncTypeUI();
  refreshPreviewPin();
}
function closeModal(){overlay.classList.add('hidden');modal.classList.add('hidden');document.body.style.overflow=''}
function openConfirm(title,text){confirmTitle.textContent=title||'確認';confirmText.textContent=text||'実行しますか？';confirmOverlay.classList.remove('hidden');return new Promise(resolve=>{state.confirmResolver=resolve})}
function closeConfirm(result){confirmOverlay.classList.add('hidden');if(state.confirmResolver){const resolver=state.confirmResolver;state.confirmResolver=null;resolver(!!result)}}
function formatDateWithWeekday(timestamp){const date=new Date(timestamp);const w=['日','月','火','水','木','金','土'][date.getDay()];const y=date.getFullYear();const m=String(date.getMonth()+1).padStart(2,'0');const d=String(date.getDate()).padStart(2,'0');const hh=String(date.getHours()).padStart(2,'0');const mm=String(date.getMinutes()).padStart(2,'0');return `${y}/${m}/${d}(${w}) ${hh}:${mm}`}
function formatRemaining(ms){if(ms<=0)return '期限切れ';const totalMinutes=Math.floor(ms/60000);const days=Math.floor(totalMinutes/1440);const hours=Math.floor((totalMinutes%1440)/60);const minutes=totalMinutes%60;if(days>0)return `${days}日 ${hours}時間 ${minutes}分`;if(hours>0)return `${hours}時間 ${minutes}分`;return `${minutes}分`}
function getRemainingMs(timer){return timer.endsAt-Date.now()}
function getRemainClass(ms){const dayMs=24*60*60*1000;if(ms>=14*dayMs)return 'green';if(ms>=7*dayMs)return 'orange';if(ms<=0)return 'red5';const daysLeft=ms/dayMs;if(daysLeft>6)return 'red0';if(daysLeft>5)return 'red1';if(daysLeft>3)return 'red2';if(daysLeft>2)return 'red3';if(daysLeft>1)return 'red4';return 'red5'}
function buildTypeLabel(timer){if(timer.type==='building')return `建材:${timer.material}`;if(timer.type==='tribe_tower')return 'トライブタワー';if(timer.type==='generator')return 'ジェネレータ';return 'その他'}
function getDurationMsFromInput(type){if(type==='building'){return BUILDING_DURATIONS[getSelectedMaterial()]*24*60*60*1000}const days=Number(daysInput.value||0),hours=Number(hoursInput.value||0),minutes=Number(minutesInput.value||0);return ((((days*24)+hours)*60)+minutes)*60*1000}
function getTimerImageSrc(timer){if(timer.imageMode==='custom'&&timer.imageSrc)return timer.imageSrc;return getDefaultImageForMap(timer.map)}
function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function normalizeCoord(value){return String(value||'').trim()}
function buildCoordTag(timer){const lat=normalizeCoord(timer.lat),lng=normalizeCoord(timer.lng);if(!lat||!lng)return '';return `座標:${lat}/${lng}`}
function getNextSortOrder(){return state.timers.reduce((max,timer)=>Math.max(max,Number(timer.sortOrder)||0),-1)+1}
function getSortedTimers(){
  const timers=[...state.timers];
  switch(state.sortMode){
    case 'dueLate':
      return timers.sort((a,b)=>b.endsAt-a.endsAt||a.sortOrder-b.sortOrder);
    case 'name':
      return timers.sort((a,b)=>(a.timerName||'').localeCompare((b.timerName||''),'ja')||a.sortOrder-b.sortOrder);
    case 'map':
      return timers.sort((a,b)=>(a.map||'').localeCompare((b.map||''),'ja')||a.endsAt-b.endsAt||a.sortOrder-b.sortOrder);
    case 'manual':
      return timers.sort((a,b)=>a.sortOrder-b.sortOrder);
    case 'dueSoon':
    default:
      return timers.sort((a,b)=>a.endsAt-b.endsAt||a.sortOrder-b.sortOrder);
  }
}
function openMapViewer(timer){
  const imageSrc=getTimerImageSrc(timer);
  if(!imageSrc)return;
  const viewer=document.createElement('div');
  viewer.className='map-viewer';
  viewer.innerHTML='<div class="map-viewer-backdrop"></div><div class="map-viewer-panel"><button type="button" class="map-viewer-close" aria-label="閉じる">×</button><div class="map-viewer-image"></div></div>';
  const imageEl=viewer.querySelector('.map-viewer-image');
  imageEl.style.backgroundImage=`url("${imageSrc}")`;
  const pin=document.createElement('div');
  pin.className='map-pin viewer-pin hidden';
  imageEl.appendChild(pin);
  setPinElement(pin,timer.map,timer.lat,timer.lng,timer.showPin!==false);
  if(timer.type==='tribe_tower'){
    const badge=document.createElement('img');
    badge.className='overlay-badge';
    badge.src=TRIBE_TOWER_ICON;
    badge.alt='トライブタワー';
    imageEl.appendChild(badge);
  }
  if(timer.type==='generator'){
    const badge=document.createElement('img');
    badge.className='overlay-badge';
    badge.src=GENERATOR_ICON;
    badge.alt='ジェネレータ';
    imageEl.appendChild(badge);
  }
  const close=()=>viewer.remove();
  viewer.querySelector('.map-viewer-close').addEventListener('click',close);
  viewer.querySelector('.map-viewer-backdrop').addEventListener('click',close);
  viewer.addEventListener('click',event=>{if(event.target===viewer)close()});
  document.body.appendChild(viewer);
}
function render(){
  const sorted=getSortedTimers();
  list.innerHTML='';
  let active=0;
  const manualMode=state.sortMode==='manual';
  for(let i=0;i<sorted.length;i++){
    const timer=sorted[i];
    const remainMs=getRemainingMs(timer);
    if(remainMs>0)active+=1;
    const remainClass=getRemainClass(remainMs),imageSrc=getTimerImageSrc(timer),timerName=(timer.timerName||'').trim()||'未設定',coordTag=buildCoordTag(timer);
    const card=document.createElement('article');
    card.className=`card${remainMs<=0?' expired':''}`;
    card.innerHTML=`<div class="img" role="button" tabindex="0" aria-label="マップを拡大"></div><div class="info"><div class="name-row"><div class="timer-name">${escapeHtml(timerName)}</div></div><div class="tags-row"><span class="tag map-tag">${escapeHtml(timer.map)}</span><span class="tag type-tag">${escapeHtml(buildTypeLabel(timer))}</span>${coordTag?`<span class="tag coord-tag">${escapeHtml(coordTag)}</span>`:''}</div><div class="collapse-row"><div class="small"><span>崩壊</span><strong>${formatDateWithWeekday(timer.endsAt)}</strong></div></div><div class="remain"><span class="remain-label">残り</span><span class="remain-value ${remainClass}">${formatRemaining(remainMs)}</span></div><div class="actions">${manualMode?`<div class="move-actions"><button class="action-btn move-btn" type="button" data-action="move-up" data-id="${timer.id}" ${i===0?'disabled':''}>↑</button><button class="action-btn move-btn" type="button" data-action="move-down" data-id="${timer.id}" ${i===sorted.length-1?'disabled':''}>↓</button></div>`:''}<button class="action-btn reset-btn" type="button" data-action="reset" data-id="${timer.id}">リセット</button><button class="action-btn edit-btn" type="button" data-action="edit" data-id="${timer.id}">編集</button><button class="action-btn delete-btn" type="button" data-action="delete" data-id="${timer.id}">削除</button></div></div>`;
    const imgEl=card.querySelector('.img');
    if(imageSrc)imgEl.style.backgroundImage=`url("${imageSrc}")`;
    imgEl.addEventListener('click',()=>openMapViewer(timer));
    imgEl.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openMapViewer(timer)}});
    const pin=document.createElement('div');
    pin.className='map-pin card-pin hidden';
    imgEl.appendChild(pin);
    setPinElement(pin,timer.map,timer.lat,timer.lng,timer.showPin!==false);
    if(timer.type==='tribe_tower'){const badge=document.createElement('img');badge.className='overlay-badge';badge.src=TRIBE_TOWER_ICON;badge.alt='トライブタワー';imgEl.appendChild(badge)}
    if(timer.type==='generator'){const badge=document.createElement('img');badge.className='overlay-badge';badge.src=GENERATOR_ICON;badge.alt='ジェネレータ';imgEl.appendChild(badge)}
    if(timer.memo&&timer.memo.trim()){const memo=document.createElement('div');memo.className='small';memo.style.gridColumn='1 / -1';memo.innerHTML=`<span>メモ</span><strong>${escapeHtml(timer.memo)}</strong>`;card.querySelector('.info').appendChild(memo)}
    list.appendChild(card)
  }
  if(activeCount)activeCount.textContent=String(active);
  emptyState.classList.toggle('hidden',sorted.length>0)
}
function buildTimerPayload(now,keepId=null,existingSortOrder=null){
  const map=mapSelect.value,type=typeSelect.value,memo=memoInput.value.trim(),timerName=timerNameInput.value.trim()||'未設定',lat=normalizeCoord(latInput.value),lng=normalizeCoord(lngInput.value),durationMs=getDurationMsFromInput(type);
  if(!map){alert('マップを選択してください');return null}
  if(durationMs<=0){alert('タイマーは1分以上で入力してください');return null}
  return {id:keepId||generateId(),timerName,map,lat,lng,showPin:showPinInput?showPinInput.checked:true,type,material:type==='building'?getSelectedMaterial():null,memo,startedAt:now,endsAt:now+durationMs,sortOrder:existingSortOrder??getNextSortOrder(),imageMode:imageModeInput.value==='custom'&&state.pendingCustomImage?'custom':'default',imageSrc:imageModeInput.value==='custom'&&state.pendingCustomImage?state.pendingCustomImage:''}
}
function addTimerFromForm(event){
  event.preventDefault();
  const now=Date.now(),editingId=editIdInput.value;
  if(editingId){
    const index=state.timers.findIndex(timer=>timer.id===editingId);
    if(index===-1){alert('編集対象が見つかりません');return}
    const payload=buildTimerPayload(now,editingId,state.timers[index].sortOrder);
    if(!payload)return;
    state.timers[index]=payload;
  }else{
    const payload=buildTimerPayload(now,null,null);
    if(!payload)return;
    state.timers.push(payload);
  }
  save();render();closeModal()
}
async function resetTimer(id){const target=state.timers.find(timer=>timer.id===id);if(!target)return;const ok=await openConfirm('リセット確認','このタイマーを現在時刻から再スタートしますか？');if(!ok)return;const durationMs=target.type==='building'?BUILDING_DURATIONS[target.material]*24*60*60*1000:Math.max(60000,target.endsAt-target.startedAt);const now=Date.now();target.startedAt=now;target.endsAt=now+durationMs;save();render()}
function editTimer(id){const target=state.timers.find(timer=>timer.id===id);if(!target)return;openModal(target)}
async function deleteTimer(id){const target=state.timers.find(timer=>timer.id===id);if(!target)return;const name=(target.timerName||'').trim()||'未設定';const ok=await openConfirm('削除確認',`「${name}」を削除しますか？`);if(!ok)return;state.timers=state.timers.filter(timer=>timer.id!==id);save();render()}
function swapSortOrder(id,direction){
  const manual=state.timers.slice().sort((a,b)=>a.sortOrder-b.sortOrder);
  const index=manual.findIndex(timer=>timer.id===id);
  if(index===-1)return;
  const targetIndex=index+direction;
  if(targetIndex<0||targetIndex>=manual.length)return;
  const current=manual[index],target=manual[targetIndex];
  const tmp=current.sortOrder;
  current.sortOrder=target.sortOrder;
  target.sortOrder=tmp;
  save();render();
}
function bindListActions(event){
  const button=event.target.closest('button[data-action]');
  if(!button)return;
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='reset')return resetTimer(id);
  if(action==='edit')return editTimer(id);
  if(action==='delete')return deleteTimer(id);
  if(action==='move-up')return swapSortOrder(id,-1);
  if(action==='move-down')return swapSortOrder(id,1);
}
function handleImageChange(event){const file=event.target.files&&event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{state.pendingCustomImage=String(reader.result||'');imageModeInput.value='custom';setPreviewImage(state.pendingCustomImage);refreshPreviewPin()};reader.readAsDataURL(file)}
function handleSortChange(){state.sortMode=sortSelect&&sortSelect.value?sortSelect.value:'dueSoon';save();render()}
function bindMaterialEvents(){document.querySelectorAll('input[name="material"]').forEach(r=>r.addEventListener('change',updateMaterialDays))}
function startTicker(){render();setInterval(render,30000)}
function bindEvents(){
  if(addBtn)addBtn.addEventListener('click',()=>openModal());
  closeModalBtn.addEventListener('click',closeModal);
  overlay.addEventListener('click',closeModal);
  typeSelect.addEventListener('change',syncTypeUI);
  timerForm.addEventListener('submit',addTimerFromForm);
  list.addEventListener('click',bindListActions);
  mapSelect.addEventListener('change',refreshImagePreviewForCurrentForm);
  latInput.addEventListener('input',refreshPreviewPin);
  lngInput.addEventListener('input',refreshPreviewPin);
  if(showPinInput)showPinInput.addEventListener('change',refreshPreviewPin);
  imageInput.addEventListener('change',handleImageChange);
  imagePreviewButton.addEventListener('click',()=>imageInput.click());
  confirmCancel.addEventListener('click',()=>closeConfirm(false));
  confirmOk.addEventListener('click',()=>closeConfirm(true));
  confirmOverlay.addEventListener('click',e=>{if(e.target===confirmOverlay)closeConfirm(false)});
  if(sortSelect)sortSelect.addEventListener('change',handleSortChange);
  bindMaterialEvents()
}
function init(){
  load();
  if(sortSelect)sortSelect.value=state.sortMode;
  bindEvents();
  syncTypeUI();
  refreshImagePreviewForCurrentForm();
  render();
  startTicker();
}
init();
