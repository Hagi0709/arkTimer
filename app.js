const STORAGE_KEY='arkTimer_store_v8';
const MAPS=['アイランド','スコーチドアース','センター','アベレーション','エクスティンクション','アストレオス','ラグナロク','バルゲロ','ロストコロニー','その他'];
const DEFAULT_MAP_IMAGES={'アイランド':'IMG_3555.jpeg','スコーチドアース':'IMG_3556.jpeg','センター':'IMG_3557.webp','アベレーション':'IMG_3558.jpeg','エクスティンクション':'IMG_3559.jpeg','アストレオス':'12DB1A38-79FA-496C-9F06-F24C06567D9F.png','ラグナロク':'69640213-1F63-4F2F-8C97-1072ADA3AC83.jpeg','バルゲロ':'5F4DEDA4-23E1-425C-9C92-C43A614C19B1.png','ロストコロニー':'EC5D5564-E4FE-431C-999B-4FAE6F4848D6.png','その他':'IMG_3570.jpeg'};
const MAP_BOUNDS={'アイランド':{width:100,height:100},'スコーチドアース':{width:100,height:100},'センター':{width:100,height:100},'アベレーション':{width:100,height:100},'エクスティンクション':{width:100,height:100},'アストレオス':{width:100,height:100},'ラグナロク':{width:100,height:100},'バルゲロ':{width:100,height:100},'ロストコロニー':{width:100,height:100},'その他':{width:100,height:100}};
const TRIBE_TOWER_ICON='7369529A-E04B-4212-8F0A-F320CC106E5E.png';
const GENERATOR_ICON='026D0A6D-7E86-4E5E-823D-3DE7D2909B98.png';
const BUILDING_DURATIONS={'わら':4,'木':8,'石':12,'金属':16,'TEK':20};
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

// Character records and images live separately from the original timer storage.
(()=>{
 const CHARACTER_MAPS=['アップロード中','アイランド','センター','スコーチドアース','アベレーション','エクスティンクション','アストレオス','ラグナロク','バルゲロ','ジェネシス1','ドラゴントピア','クリスタルアイルズ','ロストアイランド','フィヨルド','ジェネシス2','アトランティス'];
 const CHARACTER_STORAGE_KEY='arkManager_characters_local_v1';
 const SERVER_STORAGE_KEY='arkManager_saved_servers_v1';
 const LEVEL_RULES_KEY='arkManager_level_rules_v1';
 const LEVEL_BASE=105;
 const DEFAULT_LEVEL_RULES=[
  {id:'overseer',name:'アイランド：TEK洞窟の監督者を討伐',points:15},
  {id:'manticore',name:'スコーチドアース：マンティコアを討伐',points:15},
  {id:'rockwell',name:'アベレーション：ロックウェルを討伐',points:15},
  {id:'king_titan',name:'エクスティンクション：キングタイタンαを討伐',points:15},
  {id:'lost_queen',name:'ロストコロニー：ロストクイーンを討伐',points:15},
  {id:'master_controller',name:'ジェネシス1：汚染された支配者を討伐',points:15},
  {id:'abyssalus_shallocis',name:'アストレオス：AbyssalusとShallocisを両方討伐',points:15},
  {id:'explorer_notes',name:'アイランド・スコーチドアース：探検家の記録をすべて集める',points:10},
  {id:'bobs_tall_tales',name:'スコーチドアース・アベレーション・エクスティンクション：「ボブのほら話」を全回収',points:15},
  {id:'chibi',name:'ちびペットのレベルを上げる',points:5},
  {id:'tides_of_fortune',name:'ジェネシス1：Tides of Fortuneのマイルストーンと全記録を達成',points:5}
 ];
 let levelRules=[];
 try{const raw=localStorage.getItem(LEVEL_RULES_KEY);const parsed=raw?JSON.parse(raw):null;levelRules=Array.isArray(parsed)?parsed.filter(r=>r&&typeof r.id==='string'&&typeof r.name==='string'&&Number.isFinite(Number(r.points))):DEFAULT_LEVEL_RULES.map(r=>({...r}))}catch(e){levelRules=DEFAULT_LEVEL_RULES.map(r=>({...r}))}
 function saveLevelRules(){localStorage.setItem(LEVEL_RULES_KEY,JSON.stringify(levelRules))}
 function checkedLevelIds(c){return Array.isArray(c.levelUnlocks)?c.levelUnlocks:[]}
 function getLevelTotal(c){return LEVEL_BASE+levelRules.filter(r=>checkedLevelIds(c).includes(r.id)).reduce((sum,r)=>sum+Number(r.points),0)}
 function levelPanel(c){const selectedIds=checkedLevelIds(c),total=getLevelTotal(c),possible=LEVEL_BASE+levelRules.reduce((sum,r)=>sum+Number(r.points),0);
  return `<section class="level-panel"><h2>レベル上限解放</h2><div class="level-summary">現在の上限：Lv ${total}</div><div class="level-progress">基本 Lv ${LEVEL_BASE} ＋ 解放 ${total-LEVEL_BASE} / ${possible-LEVEL_BASE}（登録条件 ${levelRules.length}件）</div><div class="level-check-list">${levelRules.map(r=>`<label class="level-check-item"><input type="checkbox" data-level-id="${esc(r.id)}" ${selectedIds.includes(r.id)?'checked':''}><span>${esc(r.name)}</span><strong>+${Number(r.points)}</strong></label>`).join('')}</div></section>`}
 function renderLevelSettings(){const list=$('levelSettingsList');list.innerHTML=levelRules.map(r=>`<div class="level-setting-row"><span>${esc(r.name)}（+${Number(r.points)} Lv）</span><button class="manager-small-btn" data-level-edit="${esc(r.id)}" type="button">編集</button><button class="manager-small-btn" data-level-delete="${esc(r.id)}" type="button">削除</button></div>`).join('')||'<p>登録条件はありません。</p>'}
 function openLevelSettings(){renderLevelSettings();openDialog($('levelSettingsDialog'))}

 let savedServers=[];
 try{const value=JSON.parse(localStorage.getItem(SERVER_STORAGE_KEY)||'[]');savedServers=Array.isArray(value)?value.filter(x=>x&&x.map&&x.serverNo):[]}catch(e){}
 function saveServers(){localStorage.setItem(SERVER_STORAGE_KEY,JSON.stringify(savedServers))}
 function mapOptions(){return CHARACTER_MAPS.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')}
 function serverChoiceOptions(map='',server=''){
  const presets=savedServers.map((s,i)=>`<option value="preset:${i}" ${s.map===map&&s.serverNo===server?'selected':''}>${esc(s.map)} / ${esc(s.serverNo)}${s.memo?' — '+esc(s.memo):''}</option>`).join('');
  const maps=CHARACTER_MAPS.map(m=>`<option value="map:${esc(m)}" ${m===map&&!savedServers.some(s=>s.map===map&&s.serverNo===server)?'selected':''}>${esc(m)}</option>`).join('');
  return '<option value="">選択してください</option><optgroup label="登録済みマップ・サーバー">'+presets+'</optgroup><optgroup label="マップのみ選択">'+maps+'</optgroup>';
 }
 function renderServerSettings(){$('serverSettingsList').innerHTML=savedServers.length?savedServers.map((s,i)=>`<div class="saved-server-row" data-server-index="${i}"><span class="server-drag-handle" data-server-drag="${i}">☰</span><span>${esc(s.map)} / ${esc(s.serverNo)}${s.memo?`<small class="server-memo">${esc(s.memo)}</small>`:''}</span><button type="button" class="manager-small-btn" data-edit-server="${i}">編集</button><button type="button" class="manager-small-btn" data-remove-server="${i}">削除</button></div>`).join(''):'<p class="eos-help">登録済みの組み合わせはありません。</p>'}
 let editingServerIndex=-1;

 const labels={name:'サバイバー名',level:'レベル',map:'在住マップ',serverNo:'サーバー番号',eosId:'EOS ID',steamId:'Steam ID'};
 const help='シングルプレイ（ローカル）を開始し、コンソール（コマンド入力画面）を開いて whoami';
 let reorderMode=false;let records=[],selectedId=null,editingField=null,imageField=null,imageContext='detail',pendingFormImages={appearance:'',implant:''},toastTimeout,db=null,ready=false,returnFocus=null;
 const esc=escapeHtml;
 function toast(text){$('managerToast').textContent=text;$('managerToast').classList.remove('hidden');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('managerToast').classList.add('hidden'),3000)}
 function openDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open('arkManager_characters_v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('characters',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
 function readRecords(){return new Promise((resolve,reject)=>{const tx=db.transaction('characters','readonly');const req=tx.objectStore('characters').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
 function loadLocalRecords(){try{const raw=localStorage.getItem(CHARACTER_STORAGE_KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[]}catch(e){return []}}
 function writeRecord(record,remove=false){
  if(!db){return new Promise((resolve,reject)=>{try{const next=remove?records.filter(c=>c.id!==record.id):records.some(c=>c.id===record.id)?records.map(c=>c.id===record.id?record:c):[...records,record];localStorage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(next));resolve()}catch(e){reject(e)}})}
  return new Promise((resolve,reject)=>{const tx=db.transaction('characters','readwrite');const store=tx.objectStore('characters');remove?store.delete(record.id):store.put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})
 }
 function openDialog(dialog){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','')}
 function closeDialog(dialog){if(!dialog)return;if(typeof dialog.close==='function'){if(dialog.open)dialog.close()}else dialog.removeAttribute('open')}
 function selected(){return records.find(c=>c.id===selectedId)}
 function renderCharacters(){
  records.sort((a,b)=>(a.sortOrder??a.createdAt??0)-(b.sortOrder??b.createdAt??0));
  $('characterCount').textContent=`${records.length}人`;$('characterEmpty').classList.toggle('hidden',records.length>0);
  $('characterList').innerHTML=records.map((c,i)=>`<div class="character-list-item" data-id="${esc(c.id)}"><button class="character-card" data-character="${esc(c.id)}" type="button">${c.appearance?`<img class="character-avatar" src="${esc(c.appearance)}" alt="">`:'<span class="character-avatar" aria-hidden="true">◉</span>'}<span class="character-summary"><span class="character-name">${esc(c.name||'名前未設定')}</span><span class="character-meta-list"><span><b>レベル</b>${esc(c.level||'未設定')} / 上限 ${getLevelTotal(c)}</span><span><b>マップ</b>${esc(c.map||'未設定')}</span><span><b>サーバー</b>${esc(c.serverNo||'未設定')}</span></span></span><span class="character-chevron" aria-hidden="true">›</span></button><div class="character-drag-handle" data-drag="${esc(c.id)}" aria-label="長押しして並び替え">☰</div></div>`).join('');
 }
 function imageBlock(c,field,label){return `<button type="button" class="character-image-button" data-photo="${field}" aria-label="${label}${c[field]?'を拡大':'を登録'}">${c[field]?`<img class="character-photo" src="${esc(c[field])}" alt="${label}">`:`<span class="photo-placeholder">＋ ${label}を登録</span>`}</button>${c[field]?`<div class="photo-actions"><button class="manager-small-btn" data-upload="${field}" type="button">画像を変更</button><button class="manager-small-btn" data-remove-photo="${field}" type="button">画像を削除</button></div>`:''}`}
 function tribeMapKey(map,server){return JSON.stringify([map||'',server||''])}
 function tribeMembershipPanel(c){
  const places=[...savedServers];
  if(c.map&&!places.some(s=>s.map===c.map&&s.serverNo===c.serverNo))places.unshift({map:c.map,serverNo:c.serverNo||'-'});
  const checked=c.tribeByMap||{};
  return `<section class="level-panel"><h2>マップ別トライブ所属</h2><div class="level-check-list">${places.map(s=>{const key=tribeMapKey(s.map,s.serverNo);const yes=Object.prototype.hasOwnProperty.call(checked,key)?checked[key]:Boolean(c.tribeMember&&s.map===c.map&&s.serverNo===c.serverNo);return `<label class="level-check-item"><input type="checkbox" data-tribe-map="${esc(key)}" ${yes?'checked':''}><span>${esc(s.map)} / ${esc(s.serverNo)}</span></label>`}).join('')||'<p class="eos-help">マップ・サーバーを登録してください。</p>'}</div></section>`;
 }
 function renderDetail(){
  const c=selected();if(!c)return showList();
  $('characterDetail').innerHTML=`<button class="character-back" data-back type="button">‹ キャラ一覧</button>${imageBlock(c,'appearance','見た目画像')}<div class="section-heading"><h1>${esc(c.name)}</h1></div><div class="character-fields">${Object.entries(labels).map(([key,label])=>`<div class="character-field"><div class="character-field-label">${label}</div><div class="character-field-row"><span class="character-field-value">${key==='tribeMember'?(c.tribeMember?'所属':'未所属'):esc(c[key]||'未設定')}</span><div class="character-field-buttons">${key!=='map'&&key!=='tribeMember'?`<button type="button" class="manager-small-btn" data-copy="${key}" aria-label="${label}をコピー" ${c[key]?'':'disabled'}>コピー</button>`:''}<button type="button" class="manager-small-btn" data-edit="${key}" aria-label="${label}を編集">編集</button></div></div>${key==='eosId'?`<p class="eos-help">${help}</p>`:''}</div>`).join('')}</div>${tribeMembershipPanel(c)}${levelPanel(c)}<div class="implant-section"><h2>インプラント画像</h2>${imageBlock(c,'implant','インプラント画像')}</div><button class="character-delete" type="button" data-delete-character>キャラを削除</button>`;
 }
 function showList(){selectedId=null;$('characterListPage').classList.remove('hidden');$('characterDetail').classList.add('hidden');$('addCharacter').classList.remove('hidden');renderCharacters()}
 function showDetail(id){selectedId=id;$('characterListPage').classList.add('hidden');$('characterDetail').classList.remove('hidden');$('addCharacter').classList.add('hidden');renderDetail();window.scrollTo(0,0)}
 function switchTab(tab){closeModal();closeDialog($('characterDialog'));closeDialog($('characterViewer'));const chars=tab==='characters';$('characterPage').classList.toggle('hidden',!chars);$('timerPage').classList.toggle('hidden',chars);$('add').classList.toggle('hidden',chars);$('addCharacter').classList.toggle('hidden',!chars||!!selectedId);for(const [id,active] of [['characterTab',chars],['timerTab',!chars]]){$(id).classList.toggle('selected',active);$(id).setAttribute('aria-selected',String(active))}window.scrollTo(0,0)}
 function formField(key,value=''){
  const label=labels[key];
  if(key==='tribeMember')return `<label class="field tribe-check"><input name="tribeMember" type="checkbox" value="yes" ${value===true||value==='yes'?'checked':''}><span>トライブに所属している</span></label>`;
  if(key==='map')return `<label class="field"><span>在住マップ</span><select name="mapChoice" id="characterMapChoice">${serverChoiceOptions(value,selected()?.serverNo||'')}</select></label>`;
  return `<label class="field"><span>${label}${key==='name'?'（必須）':''}</span><input name="${key}" type="${key==='level'?'number':'text'}" ${key==='level'?'min="1" step="1" inputmode="numeric"':''} ${key==='name'?'required maxlength="100"':''} value="${esc(value)}" autocomplete="off">${key==='eosId'?`<small class="eos-help">${help}</small>`:''}</label>`;
 }

 function formImageInner(field,label){const src=pendingFormImages[field];return `<span class="form-image-label">${label}</span><button class="form-image-picker" data-form-upload="${field}" type="button">${src?`<img src="${esc(src)}" alt="${label}"><span>画像を変更</span>`:`<span class="form-image-placeholder">＋ 画像を選択</span>`}</button>${src?`<button class="form-image-remove" data-form-remove="${field}" type="button">画像を削除</button>`:''}`}
 function formImagePicker(field,label){return `<div class="form-image-field" data-form-image="${field}">${formImageInner(field,label)}</div>`}
 function refreshFormImage(field){const box=document.querySelector(`[data-form-image="${field}"]`);if(box)box.innerHTML=formImageInner(field,field==='appearance'?'キャラの見た目画像':'インプラント画像')}
 function showEditor(key=null){if(!ready){toast('キャラ保存機能を読み込み中です');return}editingField=key;const c=selected();$('characterDialogTitle').textContent=key?`${labels[key]}を編集`:'キャラ追加';if(key){$('characterFormFields').innerHTML=formField(key,c[key])+(key==='map'?formField('serverNo',c.serverNo||''):'')}else{pendingFormImages={appearance:'',implant:''};$('characterFormFields').innerHTML=formImagePicker('appearance','キャラの見た目画像')+Object.keys(labels).map(k=>formField(k)).join('')+formImagePicker('implant','インプラント画像')}returnFocus=document.activeElement;openDialog($('characterDialog'));$('characterFormFields').querySelector('input,select,button').focus()}
 $('characterDialog').addEventListener('close',()=>returnFocus?.isConnected&&returnFocus.focus());
 async function persistChange(next){try{await writeRecord(next);records=records.map(c=>c.id===next.id?next:c);renderCharacters();renderDetail();return true}catch(e){toast('保存できませんでした。端末の空き容量・ブラウザ設定を確認してください');return false}}
 $('characterFormFields').addEventListener('change',e=>{
  if(e.target.id!=='characterMapChoice')return;
  const number=$('characterFormFields').querySelector('[name="serverNo"]');
  if(e.target.value.startsWith('preset:')){
   const server=savedServers[Number(e.target.value.slice(7))];
   if(server&&number)number.value=server.serverNo;
  }else if(e.target.value.startsWith('map:')&&number){const uploading=e.target.value==='map:アップロード中';number.value=uploading?'-':'';number.readOnly=uploading;}
 });
 $('settingsMap').innerHTML='<option value="">選択してください</option>'+mapOptions();$('settingsMap').addEventListener('change',()=>{const u=$('settingsMap').value==='アップロード中';$('settingsServer').value=u?'-':'';$('settingsServer').readOnly=u});
 $('openServerSettings').addEventListener('click',()=>{editingServerIndex=-1;$('serverSettingsForm').reset();renderServerSettings();openDialog($('serverSettingsDialog'))});
 $('closeServerSettings').addEventListener('click',()=>closeDialog($('serverSettingsDialog')));
 $('serverSettingsForm').addEventListener('submit',e=>{e.preventDefault();const map=$('settingsMap').value,serverNo=map==='アップロード中'?'-':$('settingsServer').value.trim();if(!map||!serverNo)return;const entry={map,serverNo,memo:$('settingsMemo').value.trim()};if(savedServers.some((s,i)=>i!==editingServerIndex&&s.map===map&&s.serverNo===serverNo)){toast('同じ組み合わせが登録されています');return}if(editingServerIndex>=0)savedServers[editingServerIndex]=entry;else savedServers.push(entry);try{saveServers()}catch(e){toast('設定を保存できませんでした');return}editingServerIndex=-1;$('serverSettingsForm').reset();renderServerSettings();toast('保存しました')});
 $('serverSettingsList').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.editServer!==undefined){editingServerIndex=Number(b.dataset.editServer);const s=savedServers[editingServerIndex];$('settingsMap').value=s.map;$('settingsServer').value=s.serverNo;$('settingsServer').readOnly=s.map==='アップロード中';$('settingsMemo').value=s.memo||'';$('settingsMap').focus()}else if(b.dataset.removeServer!==undefined){savedServers.splice(Number(b.dataset.removeServer),1);saveServers();renderServerSettings()}});
 $('characterForm').addEventListener('submit',async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));for(const k of Object.keys(values))values[k]=String(values[k]).trim();if('mapChoice' in values&&values.mapChoice){const choice=values.mapChoice;if(choice.startsWith('preset:')){const s=savedServers[Number(choice.slice(7))];if(!s){toast('登録済みマップを再選択してください');return}values.map=s.map;values.serverNo=s.serverNo}else if(choice.startsWith('map:')){values.map=choice.slice(4);if(values.map==='アップロード中')values.serverNo='-'}else{toast('在住マップを選択してください');return}delete values.mapChoice}delete values.mapChoice;if(values.map==='アップロード中')values.serverNo='-';if('name'in values&&!values.name){toast('サバイバー名を入力してください');return}if(values.level&&!/^[1-9]\d*$/.test(values.level)){toast('レベルは1以上の整数を入力してください');return}const button=$('characterSubmit');button.disabled=true;try{if(editingField){if(await persistChange({...selected(),...values}))closeDialog($('characterDialog'))}else{const c={id:generateId(),sortOrder:records.length?Math.max(...records.map(r=>r.sortOrder??r.createdAt??0))+1:Date.now(),appearance:pendingFormImages.appearance,implant:pendingFormImages.implant,createdAt:Date.now(),...values};await writeRecord(c);records.push(c);closeDialog($('characterDialog'));renderCharacters();showDetail(c.id)}}catch(e){toast('保存できませんでした。画像サイズを小さくするか、端末の空き容量・ブラウザ設定を確認してください')}finally{button.disabled=false}});
 async function copyField(key){const value=selected()?.[key];if(!value)return;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(String(value))}else{const input=document.createElement('textarea');input.value=String(value);input.style.cssText='position:fixed;top:0;opacity:0';document.body.appendChild(input);input.focus();input.select();input.setSelectionRange(0,input.value.length);const ok=document.execCommand('copy');input.remove();if(!ok)throw Error('copy')}toast(`${labels[key]}をコピーしました`)}catch(e){toast('コピーできませんでした。編集画面で長押ししてコピーしてください')}}
 function upload(field,context='detail'){imageField=field;imageContext=context;$('characterImageInput').value='';$('characterImageInput').click()}
 function compressImage(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return reject(Error('image'));const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{try{const scale=Math.min(1,1200/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.8))}catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('decode'))};img.src=url})}
 $('characterImageInput').addEventListener('change',async e=>{const file=e.target.files[0],field=imageField;if(!file)return;toast('画像を読み込んでいます…');try{const src=await compressImage(file);if(imageContext==='form'){pendingFormImages[field]=src;refreshFormImage(field);toast('画像を追加しました');return}const c=selected();if(!c)return;const current=records.find(r=>r.id===c.id);if(current&&await persistChange({...current,[field]:src}))toast('画像を保存しました')}catch(e){toast('画像を読み込めませんでした。JPEG・PNGなどで再選択してください')}});
 $('characterFormFields').addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.formUpload)return upload(button.dataset.formUpload,'form');if(button.dataset.formRemove){pendingFormImages[button.dataset.formRemove]='';refreshFormImage(button.dataset.formRemove)}});
 $('openLevelSettings').addEventListener('click',openLevelSettings);
 $('closeLevelSettings').addEventListener('click',()=>closeDialog($('levelSettingsDialog')));
 $('levelRuleCancel').addEventListener('click',()=>{$('levelRuleForm').reset();$('levelRuleEditId').value='';$('levelRuleCancel').classList.add('hidden')});
 $('levelRuleForm').addEventListener('submit',e=>{e.preventDefault();const id=$('levelRuleEditId').value,name=$('levelRuleName').value.trim(),points=Number($('levelRulePoints').value);if(!name||!Number.isInteger(points)||points<1||points>245)return toast('条件名と追加レベルを確認してください');
  const next={id:id||'custom_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),name,points};const old=levelRules.slice();levelRules=id?levelRules.map(r=>r.id===id?next:r):[...levelRules,next];try{saveLevelRules()}catch(err){levelRules=old;return toast('保存できませんでした')}
  $('levelRuleForm').reset();$('levelRuleEditId').value='';$('levelRuleCancel').classList.add('hidden');renderLevelSettings();renderCharacters();if(selectedId)renderDetail();toast('解放条件を保存しました')});
 $('levelSettingsList').addEventListener('click',async e=>{const btn=e.target.closest('button');if(!btn)return;const id=btn.dataset.levelEdit??btn.dataset.levelDelete;const rule=levelRules.find(r=>r.id===id);if(!rule)return;
  if(btn.dataset.levelEdit!==undefined){$('levelRuleEditId').value=id;$('levelRuleName').value=rule.name;$('levelRulePoints').value=rule.points;$('levelRuleCancel').classList.remove('hidden');$('levelRuleName').focus();return}
  if(!await openConfirm('解放条件を削除',`「${rule.name}」を削除しますか？ キャラの上限計算からも除外されます。`))return;
  const old=levelRules;levelRules=levelRules.filter(r=>r.id!==id);try{saveLevelRules()}catch(err){levelRules=old;return toast('削除できませんでした')}renderLevelSettings();renderCharacters();if(selectedId)renderDetail()});
 $('characterDetail').addEventListener('change',async e=>{const tribe=e.target.closest('[data-tribe-map]');if(tribe){const c=selected();if(!c)return;const next={...c,tribeByMap:{...(c.tribeByMap||{}),[tribe.dataset.tribeMap]:tribe.checked}};if(!await persistChange(next))tribe.checked=!tribe.checked;return}const input=e.target.closest('[data-level-id]');if(!input)return;const c=selected();if(!c)return;const id=input.dataset.levelId;if(!levelRules.some(r=>r.id===id))return;const ids=new Set(checkedLevelIds(c));if(input.checked)ids.add(id);else ids.delete(id);const ok=await persistChange({...c,levelUnlocks:[...ids]});if(!ok)input.checked=!input.checked});
 $('characterDetail').addEventListener('click',async e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.hasAttribute('data-back'))return showList();if(btn.hasAttribute('data-open-level-settings'))return openLevelSettings();if(btn.dataset.edit)return showEditor(btn.dataset.edit);if(btn.dataset.copy)return copyField(btn.dataset.copy);if(btn.dataset.upload)return upload(btn.dataset.upload);if(btn.dataset.photo){const field=btn.dataset.photo,c=selected();if(!c[field])return upload(field);$('characterViewerImage').src=c[field];$('characterViewerImage').alt=field==='appearance'?'見た目画像':'インプラント画像';openDialog($('characterViewer'));return}if(btn.dataset.removePhoto){const c=selected(),field=btn.dataset.removePhoto;if(await openConfirm('画像の削除','この画像を削除しますか？'))await persistChange({...c,[field]:''});return}if(btn.hasAttribute('data-delete-character')){const c=selected();if(!await openConfirm('キャラの削除',`「${c.name}」を削除しますか？`))return;try{await writeRecord(c,true);records=records.filter(r=>r.id!==c.id);showList();toast('キャラを削除しました')}catch(e){toast('削除できませんでした')}}});
 function installReorder(container,handleSelector,itemSelector,onOrder){
 let active=null,pointer=null,startY=0,engaged=false,timer=null;
 const stop=()=>{
  clearTimeout(timer);if(!active)return;
  const moved=active;active=null;pointer=null;moved.classList.remove('dragging');
  if(engaged)onOrder([...container.querySelectorAll(itemSelector)]);engaged=false;
 };
 container.addEventListener('pointerdown',e=>{
  const handle=e.target.closest(handleSelector);if(!handle)return;
  active=handle.closest(itemSelector);if(!active)return;
  pointer=e.pointerId;startY=e.clientY;engaged=false;
  handle.setPointerCapture(e.pointerId);
  timer=setTimeout(()=>{if(active){engaged=true;active.classList.add('dragging')}},180);
 });
 container.addEventListener('pointermove',e=>{
  if(!active||pointer!==e.pointerId)return;
  if(!engaged){if(Math.abs(e.clientY-startY)>12){clearTimeout(timer);active=null}return}
  e.preventDefault();
  const others=[...container.querySelectorAll(itemSelector)].filter(el=>el!==active);
  const next=others.find(el=>e.clientY<el.getBoundingClientRect().top+el.getBoundingClientRect().height/2);
  if(next)container.insertBefore(active,next);else container.appendChild(active);
  if(e.clientY<65)window.scrollBy(0,-12);else if(e.clientY>window.innerHeight-65)window.scrollBy(0,12);
 });
 container.addEventListener('pointerup',stop);
 container.addEventListener('pointercancel',stop);
 }
 installReorder($('characterList'),'[data-drag]','.character-list-item',async elements=>{
  const previous=records.slice();
  const next=elements.map((el,i)=>({...records.find(c=>c.id===el.dataset.id),sortOrder:i}));
  if(next.some(c=>!c.id))return renderCharacters();
  try{
   if(db){await new Promise((resolve,reject)=>{const tx=db.transaction('characters','readwrite'),store=tx.objectStore('characters');next.forEach(c=>store.put(c));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
   else localStorage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(next));
   records=next;renderCharacters();
  }catch(e){records=previous;renderCharacters();toast('並び順を保存できませんでした')}
 });
 installReorder($('serverSettingsList'),'[data-server-drag]','.saved-server-row',elements=>{
  const next=elements.map(el=>savedServers[Number(el.dataset.serverIndex)]);
  if(next.length!==savedServers.length)return;
  savedServers=next;editingServerIndex=-1;
  try{saveServers();renderServerSettings()}catch(e){toast('サーバーの並び順を保存できませんでした')}
 });
 $('characterList').addEventListener('click',e=>{const btn=e.target.closest('[data-character]');if(btn)showDetail(btn.dataset.character)});
 $('addCharacter').addEventListener('click',()=>showEditor());$('characterTab').addEventListener('click',()=>switchTab('characters'));$('timerTab').addEventListener('click',()=>switchTab('timers'));
 document.querySelector('.manager-tabs').setAttribute('role','tablist');document.querySelector('.manager-tabs').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const target=e.key==='Home'?$('characterTab'):e.key==='End'?$('timerTab'):document.activeElement===$('characterTab')?$('timerTab'):$('characterTab');target.click();target.focus()}});
 $('closeCharacterDialog').addEventListener('click',()=>closeDialog($('characterDialog')));$('closeCharacterViewer').addEventListener('click',()=>closeDialog($('characterViewer')));
 for(const id of ['characterDialog','characterViewer'])$(id).addEventListener('click',e=>{if(e.target!==$(id))return;const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog($(id))});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!confirmOverlay.classList.contains('hidden'))closeConfirm(false);else if(!modal.classList.contains('hidden'))closeModal()}});
 renderCharacters();(async()=>{try{if(location.protocol==='file:'||!('indexedDB' in window)){records=loadLocalRecords()}else{db=await openDatabase();records=await readRecords()}}catch(e){db=null;records=loadLocalRecords()}ready=true;renderCharacters()})();
})();
