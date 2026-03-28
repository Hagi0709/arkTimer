const list = document.getElementById('list');

const data = [];

function format(date){
  const d = new Date(date);
  return d.toLocaleString('ja-JP',{
    weekday:'short',
    month:'numeric',
    day:'numeric',
    hour:'2-digit',
    minute:'2-digit'
  });
}

function render(){
  list.innerHTML='';

  data.forEach((t,i)=>{
    const el=document.createElement('div');
    el.className='card';

    el.innerHTML=`
      <div class="img"></div>
      <div class="info">
        <div class="row">
          <strong>${t.map}</strong>
          <span>${t.type}</span>
        </div>

        <div class="small">開始: ${format(t.start)}</div>
        <div class="small">終了: ${format(t.end)}</div>

        <div class="buttons">
          <button onclick="resetTimer(${i})">リセット</button>
          <button onclick="editTimer(${i})">編集</button>
        </div>
      </div>
    `;

    list.appendChild(el);
  });
}

function resetTimer(i){
  const t = data[i];
  const duration = t.end - t.start;

  t.start = Date.now();
  t.end = t.start + duration;

  render();
}

function editTimer(i){
  alert('未実装');
}

// 仮データ
data.push({
  map:'Island',
  type:'建築',
  start:Date.now(),
  end:Date.now()+86400000
});

render();
