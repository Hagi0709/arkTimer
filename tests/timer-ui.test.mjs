import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const html=readFileSync('index.html','utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  .split('// Character records and images live separately')[0].replace(/init\(\);\s*$/,'');
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(){
  const nodes=new Map(),storage=new Map();
  function node(id){
    if(!nodes.has(id)){
      const classes=new Set();
      const item={value:'',checked:false,style:{},options:[],
        classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)},
        getAttribute:()=>id==='timerTab'?'true':null,querySelector:()=>null,appendChild(option){this.options.push(option)},
        getBoundingClientRect:()=>({left:50,top:100,width:200,height:200}),reset(){},
        setPointerCapture(id){this.pointer=id},hasPointerCapture(id){return this.pointer===id},releasePointerCapture(){this.pointer=null},
        set innerHTML(value){this.options=[...value.matchAll(/<option value="([^"]+)"/g)].map(m=>({value:m[1]}));if(this.options.length)this.value=this.options[0].value}
      };nodes.set(id,item);
    }return nodes.get(id);
  }
  node('mapSelect').options=[{value:''},{value:'アイランド'},{value:'__custom__'}];node('mapSelect').value='アイランド';
  node('typeSelect').value='other';
  for(const id of ['daysInput','hoursInput','minutesInput'])node(id).value='0';
  node('imageMode').value='default';
  const context=createContext({window:{scrollTo(){}},document:{getElementById:node,body:node('body'),
    querySelector:()=>({value:'TEK',checked:true}),createElement:()=>({value:'',textContent:''})},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    Image:class{naturalWidth=100;naturalHeight=100;set src(value){this.onload?.()}},alert:message=>{throw Error(message)}
  });
  runInContext(source,context);
  return {node,context,run:code=>runInContext(code,context),setTimers(timers){context.fixture=timers;runInContext('state.timers=fixture',context)}};
}
const timer=()=>({id:'timer_1',type:'other',map:'アイランド',timerName:'拠点',serverNo:'5041',memo:'旧メモ',
  startedAt:1800000000123,endsAt:1800007320123,sortOrder:3,lat:'10',lng:'20',showPin:true,imageMode:'default',imageSrc:''});

test('空欄や不正座標ではピンを表示せず、0座標は正しく表示',()=>{
  const h=harness();
  assert.equal(h.run("getPinPosition('アイランド','','')"),null);
  assert.equal(h.run("getPinPosition('アイランド','abc','20')"),null);
  assert.deepEqual(plain(h.run("getPinPosition('アイランド','0','0')")),{left:0,top:0});
});

test('タップ位置を座標とは別に保持し、地図の外側は範囲内に丸める',()=>{
  const h=harness();
  assert.deepEqual(plain(h.run("pinPositionFromPoint({left:50,top:100,width:200,height:200},150,250)")),{left:50,top:75});
  assert.deepEqual(plain(h.run("pinPositionFromPoint({left:50,top:100,width:200,height:200},-10,500)")),{left:0,top:100});
  assert.equal(h.run("pinPositionFromPoint({width:0,height:0},10,10)"),null);
  h.node('latInput').value='10';h.node('lngInput').value='20';
  h.run('placePreviewPin({detail:1,clientX:150,clientY:250})');
  assert.equal(h.node('latInput').value,'');assert.equal(h.node('lngInput').value,'');assert.equal(h.node('showPinInput').checked,true);
  assert.deepEqual(plain(h.run('state.manualPin')),{left:50,top:75});
});

test('矢印キーによるピン移動と0.1刻みの微調整',()=>{
  const h=harness();h.node('latInput').value='50';h.node('lngInput').value='50';
  h.run("movePreviewPin({key:'ArrowRight',shiftKey:true,preventDefault(){}})");
  assert.deepEqual(plain(h.run('state.manualPin')),{left:50.1,top:50});
  h.run("movePreviewPin({key:'ArrowUp',preventDefault(){}})");assert.equal(h.run('state.manualPin.top'),49);
  assert.equal(h.node('latInput').value,'');assert.equal(h.node('lngInput').value,'');
});

test('ピンのドラッグは座標を空にし、無関係なポインターでは位置を変えない',()=>{
  const h=harness();h.node('latInput').value='10';h.node('lngInput').value='20';
  h.run('startPreviewPinDrag({button:0,pointerId:7,target:{closest:()=>imagePreviewPin},preventDefault(){}})');
  h.run('dragPreviewPin({pointerId:8,clientX:200,clientY:120,preventDefault(){}})');assert.equal(h.run('state.manualPin'),null);
  h.run('dragPreviewPin({pointerId:7,clientX:200,clientY:120,preventDefault(){}});stopPreviewPinDrag({pointerId:7})');
  assert.deepEqual(plain(h.run('state.manualPin')),{left:75,top:10});assert.equal(h.run('state.pinDragPointer'),null);
  assert.equal(h.node('latInput').value,'');assert.equal(h.node('lngInput').value,'');
});

test('既存の2時間2分を編集画面で維持し、日・時間・分を選択できる',()=>{
  const h=harness();h.run('setupDurationSelects()');h.setTimers([timer()]);h.run('openModal(state.timers[0])');
  assert.equal(h.node('daysInput').options.length,366);assert.equal(h.node('hoursInput').options.length,24);assert.equal(h.node('minutesInput').options.length,60);
  assert.equal(h.node('daysInput').value,'0');assert.equal(h.node('hoursInput').value,'2');assert.equal(h.node('minutesInput').value,'2');
  h.run("typeSelect.value='generator';syncTypeUI()");assert.equal(h.node('hoursInput').value,'2');assert.equal(h.node('minutesInput').value,'2');
});

test('新規追加時はアイランドを選択し、未配置のピンを表示しない',()=>{
  const h=harness();h.run('setupDurationSelects();openModal()');
  assert.equal(h.node('mapSelect').value,'アイランド');assert.equal(h.node('latInput').value,'');
  assert.equal(h.node('imagePreviewPin').classList.contains('hidden'),true);
  assert.equal(h.node('add').classList.contains('hidden'),true);
});

test('ピンやメモだけの編集は開始時刻・期限・ID・並び順を維持',()=>{
  const h=harness(),previous=timer();h.setTimers([previous]);h.run('setupDurationSelects();openModal(state.timers[0])');
  h.node('latInput').value='75';h.node('lngInput').value='50';h.node('memoInput').value='新メモ';
  const next=plain(h.run("buildTimerPayload(1900000000000,'timer_1',3)"));
  assert.equal(next.startedAt,previous.startedAt);assert.equal(next.endsAt,previous.endsAt);assert.equal(next.id,previous.id);assert.equal(next.sortOrder,3);
  assert.equal(next.lat,'75');assert.equal(next.lng,'50');assert.equal(next.memo,'新メモ');
});

test('手動ピンの保存・再編集でも位置を保持し、座標入力時は座標のピンへ切り替える',()=>{
  const h=harness(),previous=timer();h.setTimers([previous]);h.run('setupDurationSelects();openModal(state.timers[0]);setPreviewPin({left:25,top:60})');
  const next=plain(h.run("buildTimerPayload(1900000000000,'timer_1',3)"));
  assert.equal(next.lat,'');assert.equal(next.lng,'');assert.equal(next.endsAt,previous.endsAt);assert.deepEqual(next.manualPin,{left:25,top:60});
  h.setTimers([next]);h.run('openModal(state.timers[0])');assert.equal(h.node('imagePreviewPin').style.left,'25%');assert.equal(h.node('imagePreviewPin').style.top,'60%');
  h.node('latInput').value='40';h.node('lngInput').value='10';h.run('usePreviewCoordinates()');
  assert.equal(h.run('state.manualPin'),null);assert.equal(h.node('imagePreviewPin').style.left,'10%');assert.equal(h.node('imagePreviewPin').style.top,'40%');
});

test('一覧からのリセットは同じ長さで再開し、ID・画像・手動ピンを維持',async()=>{
  const h=harness(),previous={...timer(),lat:'',lng:'',manualPin:{left:25,top:60}};h.setTimers([previous]);
  h.run('Date.now=()=>1900000000000;openConfirm=async()=>true;render=()=>{}');await h.run('resetTimer("timer_1")');
  const next=plain(h.run('state.timers[0]'));assert.equal(next.id,previous.id);assert.equal(next.startedAt,1900000000000);
  assert.equal(next.endsAt,1900000000000+previous.endsAt-previous.startedAt);assert.deepEqual(next.manualPin,previous.manualPin);assert.equal(next.imageSrc,previous.imageSrc);
});

test('時間の変更時だけ新しい長さを反映し、既存の画像は保持',()=>{
  const h=harness(),previous={...timer(),imageMode:'custom',imageSrc:'data:image/png;base64,aW1hZ2U='};
  h.setTimers([previous]);h.run('setupDurationSelects();openModal(state.timers[0])');h.node('hoursInput').value='3';
  const next=plain(h.run("buildTimerPayload(1900000000000,'timer_1',3)"));
  assert.equal(next.startedAt,1900000000000);assert.equal(next.endsAt,1900000000000+3*3600000+2*60000);
  assert.equal(next.imageSrc,previous.imageSrc);
});

test('既存の長い日数を選択肢の上限で切り捨てない',()=>{
  const h=harness();h.run('setupDurationSelects();setDurationValue(daysInput,500,"日")');assert.equal(h.node('daysInput').value,'500');
  assert.ok(h.node('daysInput').options.some(option=>option.value==='500'));
});
