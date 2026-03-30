// ====================== 追加：マップ座標サイズ定義 ======================
const MAP_COORD_SIZES = {
  'アイランド': { w: 100, h: 100 },
  'スコーチドアース': { w: 100, h: 100 },
  'センター': { w: 100, h: 100 },
  'アベレーション': { w: 100, h: 100 },
  'エクスティンクション': { w: 100, h: 100 },
  'アストレオス': { w: 100, h: 100 },
  'ラグナロク': { w: 100, h: 100 },
  'バルゲロ': { w: 100, h: 100 },
  'ロストコロニー': { w: 100, h: 100 },
  'その他': { w: 100, h: 100 }
};

// ====================== ピン生成 ======================
function createMapPin(lat, lng, map){
  const size = MAP_COORD_SIZES[map] || { w:100, h:100 };
  const x = (Number(lng) / size.w) * 100;
  const y = (Number(lat) / size.h) * 100;

  const pin = document.createElement('div');
  pin.className = 'map-pin';
  pin.style.left = x + '%';
  pin.style.top = y + '%';
  return pin;
}

// ====================== ピン表示判定 ======================
function shouldShowPin(timer){
  return timer.showPin !== false && timer.lat && timer.lng;
}

// ====================== render内修正 ======================
function render(){
  const sorted = [...state.timers].sort((a,b)=>a.endsAt-b.endsAt);
  list.innerHTML='';

  for(const timer of sorted){
    const imageSrc = getTimerImageSrc(timer);

    const card=document.createElement('article');
    card.className='card';

    card.innerHTML=`
      <div class="img"></div>
      <div class="info">
        <div class="timer-name">${timer.timerName}</div>
      </div>
    `;

    const imgEl=card.querySelector('.img');

    if(imageSrc){
      imgEl.style.backgroundImage=`url("${imageSrc}")`;
    }

    // ★ ピン追加
    if(shouldShowPin(timer)){
      const pin = createMapPin(timer.lat, timer.lng, timer.map);
      imgEl.appendChild(pin);
    }

    list.appendChild(card);
  }
}

// ====================== フォーム保存時 ======================
function buildTimerPayload(now,keepId=null){
  const map = mapSelect.value;

  return {
    id: keepId || generateId(),
    map,
    lat: latInput.value,
    lng: lngInput.value,
    showPin: document.getElementById('pinCheck').checked,
    startedAt: now,
    endsAt: now + 60000
  };
}

// ====================== 並び替え ======================
let sortMode = 'near';

function setSort(mode){
  sortMode = mode;
  render();
}

function sortTimers(list){
  if(sortMode === 'far'){
    return list.sort((a,b)=>b.endsAt-a.endsAt);
  }
  if(sortMode === 'name'){
    return list.sort((a,b)=>a.timerName.localeCompare(b.timerName));
  }
  if(sortMode === 'map'){
    return list.sort((a,b)=>a.map.localeCompare(b.map));
  }
  return list.sort((a,b)=>a.endsAt-b.endsAt);
}