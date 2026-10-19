import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const html=readFileSync('index.html','utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  .split('// Character records and images live separately')[0].replace(/init\(\);\s*$/,'');
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(){
  const nodes=new Map(),storage=new Map([['arkTimer_notification_settings_v1',JSON.stringify({enabled:true})]]),listeners={};let created=0;
  function node(id){
    if(!nodes.has(id)){
      const classes=new Set();
      const item={value:'',checked:false,style:{},options:[],children:[],
        classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)},
        getAttribute:()=>id==='timerTab'?'true':null,removeAttribute(key){delete this[key]},setAttribute(key,value){this[key]=value},addEventListener(name,fn){listeners[id+':'+name]=fn},
        querySelector(selector){if(selector==='[data-remove-notify-day]')return this.removeButton;if(selector==='[data-notify-day]')return this.dayInput;if(selector==='[data-notify-day-enabled]')return this.dayToggle;return null},
        querySelectorAll(selector){if(selector==='[data-notify-preset]')return this.presetInputs||[];return selector==='[data-notify-day]'?this.children.flatMap(row=>row.dayInput?[row.dayInput]:[]):[]},
        appendChild(option){this.options.push(option);this.children.push(option);option.parentElement=this},
        remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this)},
        getBoundingClientRect:()=>({left:50,top:100,width:200,height:200}),reset(){},
        setPointerCapture(id){this.pointer=id},hasPointerCapture(id){return this.pointer===id},releasePointerCapture(){this.pointer=null},
        set innerHTML(value){this.html=value;this.children=[];
          this.presetInputs=[...value.matchAll(/<input type="checkbox" data-notify-preset value="([^"]+)"( checked)?>/g)].map(match=>({value:match[1],checked:!!match[2]}));
          this.options=[...value.matchAll(/<option value="([^"]*)"([^>]*)>/g)].map(m=>({value:m[1],selected:m[2].includes('selected'),disabled:m[2].includes('disabled')}));if(this.options.length)this.value=this.options[0].value;
          if(value.includes('data-notify-day')){
            this.dayInput={value:this.options.find(option=>option.selected)?.value??'',dataset:{},options:this.options,parentElement:this,closest(){return this.parentElement},setAttribute(key,value){this[key]=value}};
            this.dayToggle={checked:value.includes('data-notify-day-enabled checked'),style:{},setAttribute(key,value){this[key]=value}};
            this.removeButton={parentElement:this,disabled:false};
          }}
      };nodes.set(id,item);
    }return nodes.get(id);
  }
  node('mapSelect').options=[{value:''},{value:'アイランド'},{value:'__custom__'}];node('mapSelect').value='アイランド';
  node('typeSelect').value='other';
  for(const id of ['daysInput','hoursInput','minutesInput'])node(id).value='0';
  node('imageMode').value='default';
  const context=createContext({window:{scrollTo(){},addEventListener(name,fn){listeners['window:'+name]=fn}},document:{getElementById:node,body:node('body'),hidden:false,addEventListener(name,fn){listeners['document:'+name]=fn},
    querySelectorAll:()=>[],querySelector:()=>({value:'TEK',checked:true}),createElement:()=>node('__created'+created++)},
    navigator:{permissions:{async query(){return{addEventListener(name,fn){listeners['permission:'+name]=fn}}}}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    Image:class{naturalWidth=100;naturalHeight=100;set src(value){this.onload?.()}},alert:message=>{throw Error(message)}
  });
  runInContext(source,context);
  return {node,storage,context,listeners,run:code=>runInContext(code,context),setTimers(timers){context.fixture=timers;runInContext('state.timers=fixture',context)}};
}
const timer=()=>({id:'timer_1',type:'other',map:'アイランド',timerName:'拠点',serverNo:'5041',memo:'旧メモ',
  startedAt:1800000000123,endsAt:1800007320123,sortOrder:3,lat:'10',lng:'20',showPin:true,imageMode:'default',imageSrc:''});

test('既存の通知時刻を各タイマーに複製し、ID・期限・画像・ピンを保持',()=>{
  const h=harness(),original={...timer(),manualPin:{left:25,top:75},imageSrc:'data:image/png;base64,aW1hZ2U='};
  h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({enabled:false,days:[0,2],hours:[3]}));
  h.storage.set('arkTimer_store_v8',JSON.stringify([original,{...timer(),id:'timer_2'}]));h.run('load()');
  const next=plain(h.run('state.timers'));
  assert.deepEqual(next[0],{...original,notificationSettings:{enabled:true,days:[2],hours:[],hourlyWithinDay:true}});
  assert.notEqual(h.run('state.timers[0].notificationSettings'),h.run('state.timers[1].notificationSettings'));
  h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({days:[7],hours:[]}));h.run('load()');
  assert.deepEqual(plain(h.run('state.timers[0].notificationSettings')),{enabled:true,days:[2],hours:[],hourlyWithinDay:true});
});

test('通知時刻だけの変更は期限を維持し、別タイマーへ影響しない',()=>{
  const h=harness(),a={...timer(),notificationSettings:{enabled:true,days:[2],hours:[3]}},b={...timer(),id:'timer_2',notificationSettings:{enabled:false,days:[],hours:[1]}};
  h.setTimers([a,b]);h.run('setupDurationSelects();openModal(state.timers[0]);render=()=>{}');
  h.run("timerNotificationPresetInputs().forEach(input=>input.checked=false);timerNotificationDayInputs()[0].value='30';syncTimerNotificationDayInputs()");h.node('timerNotificationHourly').checked=false;
  h.run('addTimerFromForm({preventDefault(){}})');
  const saved=JSON.parse(h.storage.get('arkTimer_store_v8'));
  assert.deepEqual(saved[0].notificationSettings,{enabled:true,days:[30],hours:[],hourlyWithinDay:false,presetDays:[],customNotifications:{enabled:true,entries:[{days:30,enabled:true}]}});
  assert.equal(saved[0].endsAt,a.endsAt);assert.equal(saved[0].startedAt,a.startedAt);assert.deepEqual(saved[1],b);
  h.run('openModal(state.timers[1])');assert.equal(h.node('timerNotificationEnabled').checked,false);
  assert.equal(h.node('timerNotificationChoices').classList.contains('hidden'),true);
  h.run('openModal()');assert.equal(h.node('timerNotificationEnabled').checked,true);
  assert.deepEqual(plain(h.run('readTimerNotificationForm()')),{enabled:true,days:[1],hours:[],hourlyWithinDay:false});
});

test('通知ONには日数または毎時通知が必要で、OFFでも選んだ内容を保持',()=>{
  const h=harness();h.run('openModal()');
  h.run("timerNotificationPresetInputs().forEach(input=>input.checked=false)");
  assert.throws(()=>h.run('readTimerNotificationForm()'),/通知日数/);
  h.node('timerNotificationEnabled').checked=false;
  assert.deepEqual(plain(h.run('readTimerNotificationForm()')),{enabled:false,days:[],hours:[],hourlyWithinDay:false});
  h.node('timerNotificationHourly').checked=true;
  assert.deepEqual(plain(h.run('readTimerNotificationForm()')),{enabled:false,days:[],hours:[],hourlyWithinDay:true});
  h.node('timerNotificationEnabled').checked=true;
  assert.deepEqual(plain(h.run('readTimerNotificationForm()')),{enabled:true,days:[],hours:[],hourlyWithinDay:true});
});

test('選択ごとに空欄を追加し、件数を制限せず重複日数をまとめ、日数の削除も可能',()=>{
  const h=harness();h.run('openModal()');
  h.run('timerNotificationPresetInputs().forEach(input=>input.checked=false);syncTimerNotificationUI()');
  assert.equal(h.run('timerNotificationDayInputs().length'),1);
  for(let n=8;n<=109;n++)h.run(`timerNotificationDayInputs().at(-1).value='${n}';syncTimerNotificationDayInputs()`);
  assert.equal(h.run('timerNotificationDayInputs().length'),103);
  h.run("timerNotificationDayInputs().at(-1).value='30';syncTimerNotificationDayInputs()");
  assert.equal(h.run('readTimerNotificationForm().days.length'),102);
  h.run('timerNotificationDayInputs()[0].parentElement.remove();syncTimerNotificationDayInputs()');
  assert.equal(h.run('readTimerNotificationForm().days.includes(8)'),false);
  for(const value of ['6','0','-1','7.5','1000','9007199254740991']){
    h.run(`timerNotificationDayInputs()[0].value='${value}'`);
    assert.throws(()=>h.run('readTimerNotificationForm()'),/7〜999日/);
  }
});

test('停止中の説明はタイマーのチェックによらず、通知設定がOFFのときだけ表示する',()=>{
  const h=harness();h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({enabled:false}));h.run('openModal()');assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),false);
  h.node('timerNotificationEnabled').checked=false;h.run('syncTimerNotificationUI()');assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),false);
  h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({enabled:true}));h.run('syncTimerNotificationUI()');
  assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),true);
  h.node('timerNotificationEnabled').checked=true;h.run('syncTimerNotificationUI()');assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),true);
  h.node('timerNotificationEnabled').checked=false;h.run('syncTimerNotificationUI()');
  assert.equal(h.run('timerNotificationDayInputs()[0].disabled'),true);
  h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({enabled:false}));h.run('syncTimerNotificationUI()');
  assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),false);
});

test('通知許可済みでも全体OFFなら個別設定を固定し、ONで元の選択と操作を復元する',()=>{
  for(const enabled of [true,false]){
    const h=harness(),settings={enabled,days:[7,1,14],hours:[],hourlyWithinDay:true,presetDays:[7,1],customNotifications:{enabled:true,entries:[{days:14,enabled:true},{days:30,enabled:false}]}};
    h.context.window.Notification={permission:'granted'};
    h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({enabled:false}));
    h.setTimers([{...timer(),notificationSettings:settings}]);h.run('openModal(state.timers[0])');
    assert.equal(h.node('timerNotificationEnabled').checked,enabled);
    assert.equal(h.node('timerNotificationEnabled').disabled,true);
    assert.equal(h.node('timerNotificationToggle').classList.contains('timer-notify-unavailable'),true);
    assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),false);
    assert.equal(h.run('timerNotificationPresetInputs().every(input=>input.disabled)'),true);
    assert.equal(h.node('timerNotificationHourly').disabled,true);
    assert.equal(h.run('timerNotificationDayInputs().every(input=>input.disabled&&input.parentElement.dayToggle.disabled&&input.parentElement.removeButton.disabled)'),true);
    assert.deepEqual(plain(h.run('readTimerNotificationForm()')),settings);
    h.node('memoInput').value='全体OFF中の編集';h.run('render=()=>{};addTimerFromForm({preventDefault(){}})');
    const saved=JSON.parse(h.storage.get('arkTimer_store_v8'))[0];
    assert.deepEqual(saved.notificationSettings,settings);assert.equal(saved.endsAt,timer().endsAt);
    h.run('openModal(state.timers[0])');
    h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({enabled:true}));h.run('syncTimerNotificationUI()');
    assert.equal(h.node('timerNotificationEnabled').disabled,false);
    assert.equal(h.node('timerNotificationEnabled').checked,enabled);
    assert.equal(h.node('timerNotificationToggle').classList.contains('timer-notify-unavailable'),false);
    assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),true);
    assert.equal(h.node('timerNotificationHourly').disabled,!enabled);
    assert.equal(h.run('timerNotificationDayInputs()[0].parentElement.dayToggle.disabled'),!enabled);
    assert.deepEqual(plain(h.run('readTimerNotificationForm()')),settings);
  }
});

test('アプリ復帰・別タブの全体設定変更・共通設定を閉じた時に操作可否を更新する',()=>{
  const h=harness();h.run('openModal();bindTimerNotificationHintEvents()');
  for(const event of ['window:pageshow','window:focus','window:storage','document:visibilitychange','timerNotificationDialog:close']){
    h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({enabled:false}));h.listeners[event]({key:'arkTimer_notification_settings_v1'});
    assert.equal(h.node('timerNotificationEnabled').disabled,true);assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),false);
    h.storage.set('arkTimer_notification_settings_v1',JSON.stringify({enabled:true}));h.listeners[event]({key:'arkTimer_notification_settings_v1'});
    assert.equal(h.node('timerNotificationEnabled').disabled,false);assert.equal(h.node('timerNotificationHint').classList.contains('hidden'),true);
    assert.equal(h.node('timerNotificationEnabled').checked,true);
  }
});

test('追加通知の旧全体OFFを各項目のOFFへ引き継ぎ、標準7〜1日前は維持する',()=>{
  const h=harness(),settings={enabled:true,days:[7,3,1],hours:[],hourlyWithinDay:true,customNotifications:{enabled:false,entries:[{days:14,enabled:true},{days:30,enabled:true}]}};
  h.setTimers([{...timer(),notificationSettings:settings}]);h.run('setupDurationSelects();openModal(state.timers[0])');
  assert.deepEqual(plain(h.run('timerNotificationPresetInputs().map(input=>Number(input.value))')),[7,6,5,4,3,2,1]);
  assert.deepEqual(plain(h.run('timerNotificationPresetInputs().filter(input=>input.checked).map(input=>Number(input.value))')),[7,3,1]);
  assert.equal(h.run('timerNotificationDayInputs()[0].parentElement.dayToggle.checked'),false);
  const off=plain(h.run('readTimerNotificationForm()'));
  assert.deepEqual(off.days,[7,3,1]);assert.deepEqual(off.customNotifications,{enabled:true,entries:[{days:14,enabled:false},{days:30,enabled:false}]});assert.equal(h.run('timerNotificationDayInputs()[0].disabled'),false);
  h.context.savedSettings=off;h.run('setTimerNotificationForm({notificationSettings:savedSettings})');
  assert.equal(h.run('timerNotificationDayInputs()[1].parentElement.dayToggle.checked'),false);assert.equal(h.node('timerNotificationHourly').checked,true);
  h.run('timerNotificationDayInputs()[0].parentElement.dayToggle.checked=true');
  assert.deepEqual(plain(h.run('readTimerNotificationForm().days')),[7,3,1,14]);
});

test('日数は7〜999日の選択式で、各項目のOFFを保存し標準7日前と独立して復元する',()=>{
  const h=harness();h.run('openModal();timerNotificationPresetInputs().forEach(input=>input.checked=false)');
  h.node('timerNotificationHourly').checked=true;h.run('syncTimerNotificationUI()');
  assert.deepEqual(plain(h.run('timerNotificationDayInputs()[0].options.map(option=>option.value)')),['',...Array.from({length:993},(_,i)=>String(i+7))]);
  h.run("timerNotificationDayInputs()[0].value='7';syncTimerNotificationDayInputs();timerNotificationDayInputs()[1].value='999';syncTimerNotificationDayInputs();timerNotificationDayInputs()[1].parentElement.dayToggle.checked=false");
  const saved=plain(h.run('readTimerNotificationForm()'));
  assert.deepEqual(saved.days,[7]);assert.deepEqual(saved.presetDays,[]);
  assert.deepEqual(saved.customNotifications,{enabled:true,entries:[{days:7,enabled:true},{days:999,enabled:false}]});
  h.context.savedSettings=saved;h.run('setTimerNotificationForm({notificationSettings:savedSettings})');
  assert.equal(h.run('timerNotificationPresetInputs().some(input=>input.checked)'),false);
  assert.equal(h.run('timerNotificationDayInputs()[1].parentElement.dayToggle.checked'),false);
  h.run('timerNotificationDayInputs()[0].parentElement.dayToggle.checked=false');
  assert.deepEqual(plain(h.run('readTimerNotificationForm().days')),[]);
  h.node('timerNotificationEnabled').checked=false;h.run('syncTimerNotificationUI()');
  assert.equal(h.run('timerNotificationDayInputs()[0].parentElement.dayToggle.disabled'),true);
});

test('以前に保存した999日超の通知は勝手に切り捨てず、変更先は7〜999日だけを提示する',()=>{
  const h=harness();h.setTimers([{...timer(),notificationSettings:{enabled:true,days:[1200],hours:[],hourlyWithinDay:false}}]);
  h.run('openModal(state.timers[0])');
  assert.equal(h.run('timerNotificationDayInputs()[0].value'),'1200');
  assert.equal(h.run('timerNotificationDayInputs()[0].options.at(-1).disabled'),true);
  assert.deepEqual(plain(h.run('readTimerNotificationForm().days')),[1200]);
  h.run("timerNotificationDayInputs()[0].value='999'");assert.deepEqual(plain(h.run('readTimerNotificationForm().days')),[999]);
});

test('一覧のタップで直接編集を開き、新規作成には削除ボタンを表示しない',()=>{
  const h=harness();h.setTimers([timer()]);h.node('modal').scrollTop=400;h.run("setupDurationSelects();bindListActions({target:{closest:selector=>selector==='[data-timer]'?{dataset:{timer:'timer_1'}}:null}})");
  assert.equal(h.node('editId').value,'timer_1');assert.equal(h.node('modalTitle').textContent,'タイマー編集');
  assert.equal(h.node('modal').scrollTop,0);
  assert.equal(h.node('deleteTimerFromForm').classList.contains('hidden'),false);assert.equal(h.node('modal').classList.contains('hidden'),false);
  h.run('closeModal();openModal()');assert.equal(h.node('deleteTimerFromForm').classList.contains('hidden'),true);
});

test('一覧には期限と登録済みメモを表示し、メモのHTMLを実行可能な形で挿入しない',()=>{
  const h=harness();h.setTimers([{...timer(),memo:'<img src=x onerror=alert(1)>\n補充を確認'}]);
  const summary=h.run('buildTimerSummary(state.timers[0],60000)');
  assert.ok(summary.includes(h.run('formatDateWithWeekday(state.timers[0].endsAt)')));assert.match(summary,/timer-deadline/);
  assert.match(summary,/&lt;img src=x onerror=alert\(1\)&gt;\n補充を確認/);assert.doesNotMatch(summary,/<img src=x/);
  h.run("state.timers[0].memo='   '");assert.doesNotMatch(h.run('buildTimerSummary(state.timers[0],60000)'),/timer-memo/);
});

test('編集画面からの削除は確認後だけ実行し、他のタイマーを維持して一覧へ戻る',async()=>{
  const h=harness(),other={...timer(),id:'timer_2'};h.setTimers([timer(),other]);
  h.run('setupDurationSelects();openModal(state.timers[0]);render=()=>{};openConfirm=async()=>false');
  await h.run('deleteTimer("timer_1")');assert.equal(h.run('state.timers.length'),2);assert.equal(h.node('modal').classList.contains('hidden'),false);
  h.run('openConfirm=async()=>true');await h.run('deleteTimer("timer_1")');
  assert.deepEqual(plain(h.run('state.timers')),[other]);assert.equal(h.node('modal').classList.contains('hidden'),true);
  assert.equal(h.node('add').classList.contains('hidden'),false);
});

test('新版アイランドの標準画像を表示し、座標と独自のマップ画像を維持',()=>{
  const h=harness(),previous=timer();h.setTimers([previous]);h.run('setupDurationSelects();openModal(state.timers[0])');
  assert.match(h.node('imagePreview').style.backgroundImage,/timer-map-island\.jpg/);
  assert.equal(h.node('imagePreviewButton').classList.contains('island-map-frame'),true);
  assert.equal(h.node('latInput').value,'10');assert.equal(h.node('lngInput').value,'20');
  h.run("setPreviewImage('data:image/png;base64,aW1hZ2U=')");
  assert.equal(h.node('imagePreview').style.backgroundImage,'url("data:image/png;base64,aW1hZ2U=")');
  assert.equal(h.node('imagePreviewButton').classList.contains('island-map-frame'),false);
  assert.equal(h.run('state.timers[0].endsAt'),previous.endsAt);
});

test('空欄や不正座標ではピンを表示せず、0座標は正しく表示',()=>{
  const h=harness();
  assert.equal(h.run("getPinPosition('アイランド','','')"),null);
  assert.equal(h.run("getPinPosition('アイランド','abc','20')"),null);
  assert.deepEqual(plain(h.run("getPinPosition('アイランド','0','0')")),{left:0,top:0});
});

test('タップ位置を座標へ反映し、地図の外側は範囲内に丸める',()=>{
  const h=harness();
  assert.deepEqual(plain(h.run("pinPositionFromPoint({left:50,top:100,width:200,height:200},150,250)")),{left:50,top:75});
  assert.deepEqual(plain(h.run("pinPositionFromPoint({left:50,top:100,width:200,height:200},-10,500)")),{left:0,top:100});
  assert.equal(h.run("pinPositionFromPoint({width:0,height:0},10,10)"),null);
  h.node('latInput').value='10';h.node('lngInput').value='20';
  h.run('placePreviewPin({detail:1,clientX:150,clientY:250})');
  assert.equal(h.node('latInput').value,'75');assert.equal(h.node('lngInput').value,'50');assert.equal(h.node('showPinInput').checked,true);
  assert.deepEqual(plain(h.run('state.manualPin')),{left:50,top:75});
});

test('矢印キーによるピン移動と0.1刻みの微調整',()=>{
  const h=harness();h.node('latInput').value='50';h.node('lngInput').value='50';
  h.run("movePreviewPin({key:'ArrowRight',shiftKey:true,preventDefault(){}})");
  assert.deepEqual(plain(h.run('state.manualPin')),{left:50.1,top:50});
  h.run("movePreviewPin({key:'ArrowUp',preventDefault(){}})");assert.equal(h.run('state.manualPin.top'),49);
  assert.equal(h.node('latInput').value,'49');assert.equal(h.node('lngInput').value,'50.1');
});

test('ピンのドラッグは座標へ反映し、無関係なポインターでは位置を変えない',()=>{
  const h=harness();h.node('latInput').value='10';h.node('lngInput').value='20';
  h.run('startPreviewPinDrag({button:0,pointerId:7,target:{closest:()=>imagePreviewPin},preventDefault(){}})');
  h.run('dragPreviewPin({pointerId:8,clientX:200,clientY:120,preventDefault(){}})');assert.equal(h.run('state.manualPin'),null);
  h.run('dragPreviewPin({pointerId:7,clientX:200,clientY:120,preventDefault(){}});stopPreviewPinDrag({pointerId:7})');
  assert.deepEqual(plain(h.run('state.manualPin')),{left:75,top:10});assert.equal(h.run('state.pinDragPointer'),null);
  assert.equal(h.node('latInput').value,'10');assert.equal(h.node('lngInput').value,'75');
});

test('既存の2時間2分を編集画面で維持し、日・時間・分を選択できる',()=>{
  const h=harness();h.run('setupDurationSelects()');h.setTimers([timer()]);h.run('openModal(state.timers[0])');
  assert.equal(h.node('daysInput').options.length,10000);assert.equal(h.node('hoursInput').options.length,24);assert.equal(h.node('minutesInput').options.length,60);
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
  assert.equal(next.lat,'60');assert.equal(next.lng,'25');assert.equal(next.endsAt,previous.endsAt);assert.deepEqual(next.manualPin,{left:25,top:60});
  h.setTimers([next]);h.run('openModal(state.timers[0])');assert.equal(h.node('imagePreviewPin').style.left,'25%');assert.equal(h.node('imagePreviewPin').style.top,'60%');
  assert.equal(h.node('latInput').value,'60');assert.equal(h.node('lngInput').value,'25');
  h.node('latInput').value='40';h.node('lngInput').value='10';h.run('usePreviewCoordinates()');
  assert.equal(h.run('state.manualPin'),null);assert.equal(h.node('imagePreviewPin').style.left,'10%');assert.equal(h.node('imagePreviewPin').style.top,'40%');
});

test('旧形式の座標が空の手動ピンも0座標を含めて表示・再編集でき、期限は変更しない',()=>{
  const h=harness(),previous={...timer(),lat:'',lng:'',manualPin:{left:0,top:75.5}};
  h.setTimers([previous]);assert.equal(h.run('buildCoordTag(state.timers[0])'),'座標:75.5/0');
  h.run('setupDurationSelects();openModal(state.timers[0])');
  assert.equal(h.node('latInput').value,'75.5');assert.equal(h.node('lngInput').value,'0');
  assert.equal(h.node('imagePreviewPin').style.left,'0%');assert.equal(h.node('imagePreviewPin').style.top,'75.5%');
  const next=plain(h.run("buildTimerPayload(1900000000000,'timer_1',3)"));
  assert.equal(next.lat,'75.5');assert.equal(next.lng,'0');assert.deepEqual(next.manualPin,previous.manualPin);
  assert.equal(next.startedAt,previous.startedAt);assert.equal(next.endsAt,previous.endsAt);
});

test('ピンの座標換算はマップの範囲に従い、不正な位置では入力を消さない',()=>{
  const h=harness();h.run("MAP_BOUNDS['テスト']={width:200,height:80}");
  assert.deepEqual(plain(h.run("coordinatesForPin('テスト',{left:25,top:75})")),{lat:60,lng:50});
  assert.equal(h.run("coordinatesForPin('テスト',{left:-1,top:50})"),null);
  h.node('latInput').value='10';h.node('lngInput').value='20';h.run('setPreviewPin({left:101,top:50})');
  assert.equal(h.node('latInput').value,'10');assert.equal(h.node('lngInput').value,'20');assert.equal(h.run('state.manualPin'),null);
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

test('9999日23時間59分を選択して保存でき、既存の上限を超える日数も切り捨てない',()=>{
  const h=harness();h.run('setupDurationSelects()');h.node('daysInput').value='9999';h.node('hoursInput').value='23';h.node('minutesInput').value='59';
  const next=plain(h.run('buildTimerPayload(1900000000000)'));assert.equal(next.endsAt-next.startedAt,10000*86400000-60000);
  h.run('setDurationValue(daysInput,15000,"日")');assert.equal(h.node('daysInput').value,'15000');
  assert.ok(h.node('daysInput').options.some(option=>option.value==='15000'));
});

test('自由入力の種類名を保存・再編集し、既存のその他タイマーも開ける',()=>{
  const h=harness(),previous=timer();h.setTimers([previous]);h.run('setupDurationSelects();openModal(state.timers[0])');
  assert.equal(h.node('customTypeField').classList.contains('hidden'),false);assert.equal(h.run('buildTypeLabel(state.timers[0])'),'自由入力');
  h.node('customTypeInput').value=' テイム待機 ';const next=plain(h.run("buildTimerPayload(1900000000000,'timer_1',3)"));
  assert.equal(next.customType,'テイム待機');assert.equal(next.endsAt,previous.endsAt);h.setTimers([next]);h.run('openModal(state.timers[0])');
  assert.equal(h.node('customTypeInput').value,'テイム待機');assert.equal(h.run('buildTypeLabel(state.timers[0])'),'テイム待機');
  h.run("typeSelect.value='building';syncTypeUI()");assert.equal(h.node('customTypeField').classList.contains('hidden'),true);
});

test('ジェネシス1の2つのマップ画像を名前ごとに解決',()=>{
  const h=harness();
  assert.equal(h.run("getDefaultImageForMap('ジェネシス1(Ocean)')"),'genesis1-ocean.jpg');
  assert.equal(h.run("getDefaultImageForMap('ジェネシス1(Genesis)')"),'genesis1-genesis.jpg');
});

test('自由入力の種類画像はマップ画像と別に保存・再編集し、期限を維持',()=>{
  const h=harness(),picture='data:image/png;base64,aW1hZ2U=',previous={...timer(),imageMode:'custom',imageSrc:'data:image/png;base64,bWFw'};
  h.setTimers([previous]);h.run('setupDurationSelects();openModal(state.timers[0])');h.context.picture=picture;
  h.run('state.pendingTypeImage=picture;updateTypeImagePreview()');
  const next=plain(h.run("buildTimerPayload(1900000000000,'timer_1',3)"));
  assert.equal(next.customTypeImage,picture);assert.equal(next.imageSrc,previous.imageSrc);assert.equal(next.endsAt,previous.endsAt);
  h.setTimers([next]);h.run('openModal(state.timers[0])');assert.equal(h.node('customTypeImagePreview').src,picture);
  assert.equal(h.run('timerKindIcon(state.timers[0])'),picture);assert.match(h.run('buildTimerKindImage(state.timers[0])'),/src="data:image\/png/);
  assert.doesNotMatch(h.run('buildTimerKindImage(state.timers[0])'),/src="\.\/data:/);
  h.run('clearTypeImage()');assert.equal(h.node('customTypeImagePreview').classList.contains('hidden'),true);
  assert.equal(plain(h.run("buildTimerPayload(1900000000000,'timer_1',3)")).customTypeImage,'');
});

test('画像なしの旧タイマーを表示でき、新規フォームに前の種類画像を持ち越さない',()=>{
  const h=harness();assert.equal(h.run("buildTimerKindImage({type:'other'})"),'');
  for(const value of ['https://example.test/image.png','data:image/svg+xml;base64,c3Zn',{}]){
    h.context.untrusted=value;assert.equal(h.run('customTypeImageSource(untrusted)'),'');
  }
  h.run("state.pendingTypeImage='data:image/png;base64,aW1hZ2U=';setupDurationSelects();openModal();typeSelect.value='other';syncTypeUI()");
  assert.equal(h.run('state.pendingTypeImage'),'');assert.equal(h.node('customTypeImageField').classList.contains('hidden'),false);
  h.run("typeSelect.value='building';syncTypeUI()");assert.equal(h.node('customTypeImageField').classList.contains('hidden'),true);
});

test('読み込み中の保存を防ぎ、画像を外した後に古い読み込み結果を反映しない',async()=>{
  const h=harness();h.run('readTimerTypeImage=()=>new Promise(resolve=>{globalThis.finishTypeImage=resolve})');
  const pending=h.run("handleTypeImageChange({target:{files:[{type:'image/png'}],value:'file'}})");
  assert.equal(h.node('submitBtn').disabled,true);assert.throws(()=>h.run('buildTimerPayload(1900000000000)'),/読み込み中/);
  h.run("clearTypeImage();finishTypeImage('data:image/png;base64,aW1hZ2U=')");await pending;
  assert.equal(h.run('state.pendingTypeImage'),'');assert.equal(h.node('submitBtn').disabled,false);
});

test('編集中に閉じた場合も遅れて読み込んだ種類画像を次のフォームへ混ぜない',async()=>{
  const h=harness();h.run('setupDurationSelects();readTimerTypeImage=()=>new Promise(resolve=>{globalThis.finishTypeImage=resolve})');
  const pending=h.run("handleTypeImageChange({target:{files:[{type:'image/png'}],value:'file'}})");
  h.run("closeModal();openModal();finishTypeImage('data:image/png;base64,aW1hZ2U=')");await pending;
  assert.equal(h.run('state.pendingTypeImage'),'');assert.equal(h.node('submitBtn').disabled,false);
});
