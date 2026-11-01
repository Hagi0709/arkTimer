(() => {
 const KEY='arkManager_registration_sync_v1',$=id=>document.getElementById(id);
 const staticPage=()=>location.protocol==='file:'||/(^|\.)github\.io$/i.test(location.hostname);
 function state(){let s;try{s=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}return s&&/^[a-f0-9]{64}$/.test(s.token)?s:null}
 function freshState(){return{token:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''),revision:0,pending:false}}
 function platform(){return /iPhone/.test(navigator.userAgent)?'iPhone':/iPad/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'iPad':/Android/.test(navigator.userAgent)?'Android':'PC'}
 class RegistrationSync {
  constructor(){this.delay=1000;this.running=null;this.timer=null}
  markChanged(){
   if(staticPage())return;
   try{const s=state()||freshState();s.revision=Math.max(Date.now(),s.revision+1);s.pending=true;localStorage.setItem(KEY,JSON.stringify(s));clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),400)}catch{this.status('登録内容の同期設定を保存できません')}
  }
  status(message){if($('registrationSyncStatus'))$('registrationSyncStatus').textContent=message}
  flush(){
   if(staticPage()||this.running)return this.running;
   this.running=this.drain().catch(error=>{this.status('この端末の登録内容は未同期です。'+error.message);if(navigator.onLine!==false){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),this.delay);this.delay=Math.min(60000,this.delay*2)}}).finally(()=>{this.running=null});return this.running;
  }
  async drain(){
   while(state()?.pending){
    if(navigator.onLine===false)throw Error('オンラインで再度開いてください。');
    if(!window.ARKRegistrationSnapshot)throw Error('読み込み中です。');
    const s=state(),data=await window.ARKRegistrationSnapshot();
    if(state()?.revision!==s.revision)continue;
    const pushToken=localStorage.getItem('arkManager_push_device_token_v1');
    const body=JSON.stringify({token:s.token,revision:s.revision,platform:platform(),pushToken:/^[a-f0-9]{64}$/.test(pushToken||'')?pushToken:null,data});
    if(new TextEncoder().encode(body).length>500000)throw Error('登録内容が同期できるサイズを超えています。');
    this.latest=body;
    const response=await fetch('/api/registrations/sync',{method:'POST',headers:{'content-type':'application/json'},body,credentials:'omit',keepalive:body.length<60000,signal:AbortSignal.timeout(20000)});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'保存に失敗しました。');
    if(state()?.revision!==s.revision)continue;
    s.pending=false;s.syncedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(s));this.delay=1000;this.status('この端末の最終同期：'+new Date(s.syncedAt).toLocaleString('ja-JP'));
   }
  }
 }
 const sync=new RegistrationSync();window.ARKRegistrationSync=sync;
 window.addEventListener('online',()=>sync.flush());window.addEventListener('pageshow',()=>sync.markChanged());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync.markChanged()});
 window.addEventListener('pagehide',()=>{if(state()?.pending&&sync.latest&&JSON.parse(sync.latest).revision===state().revision&&sync.latest.length<60000)fetch('/api/registrations/sync',{method:'POST',headers:{'content-type':'application/json'},body:sync.latest,credentials:'omit',keepalive:true}).catch(()=>{})});
 const dialog=$('registrationAdminDialog'),notificationCache=new Map();let taps=0,lastTap=0,expiryTimer,selection=0,request=0,logoutPromise=Promise.resolve();
 function lock(){selection++;request++;notificationCache.clear();clearTimeout(expiryTimer);$('adminLoginForm').classList.remove('hidden');$('adminDashboard').classList.add('hidden');$('adminRegistrationList').replaceChildren();$('adminRegistrationDetail').replaceChildren();$('adminNotificationList').replaceChildren();$('adminPassword').value=''}
 function message(value){$('adminStatus').textContent=value}
 $('adminEntry').addEventListener('click',()=>{
  const now=Date.now();taps=now-lastTap>30000?1:taps+1;lastTap=now;if(taps<10)return;taps=0;
  lock();message(staticPage()?'管理画面は通知対応版（ark-manager.arktools.workers.dev）で開いてください':'');
  if(!dialog.open)dialog.showModal();document.dispatchEvent(new Event('ark:dialog-change'));$('adminPassword').focus();
 });
 $('closeRegistrationAdmin').addEventListener('click',()=>dialog.close());
 function logout(){if(staticPage())return Promise.resolve();return fetch('/api/admin/logout',{method:'POST',credentials:'same-origin',keepalive:true,signal:AbortSignal.timeout(20000)}).catch(()=>{})}
 dialog.addEventListener('close',()=>{lock();logoutPromise=logout()});
 async function api(path,options={}){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok){if(response.status===401){lock();message('パスワードを入力してください')}throw Error(result.error||'読み込みに失敗しました')};return result;
 }
 function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;return el}
 function line(parent,label,value){parent.appendChild(element('p',label+'：'+(value===undefined||value===null||value===''?'—':value)))}
 const when=value=>value?new Date(value).toLocaleString('ja-JP'):'—';
 function renderNotification(parent,n){
  line(parent,'購読',n.invalidatedAt?'無効／停止中':'有効');line(parent,'最終更新',when(n.updatedAt));
  line(parent,'通知予定',n.pending+'件');line(parent,'配信受付済み',n.accepted+'件');line(parent,'表示確認済み',n.displayed+'件');line(parent,'失敗',n.failed+'件');
 }
 async function openItem(id){
  const sequence=++selection,box=$('adminRegistrationDetail');box.replaceChildren(element('p','読み込み中…'));
  try{
   const {item}=await api('/api/admin/registrations/'+id);if(sequence!==selection||!dialog.open)return;
   box.replaceChildren(element('h3',item.platform+' · '+item.id.slice(0,8)));line(box,'最終同期',when(item.updatedAt));
   line(box,'アプリの通知',item.notification.enabled?'ON':'OFF');line(box,'通知の許可',({granted:'許可済み',denied:'拒否',default:'未許可',unavailable:'利用不可'})[item.notification.permission]);
   const notification=notificationCache.get(item.subscriberId);if(notification)renderNotification(box,notification);else line(box,'通知登録','未登録／更新待ち');
   box.appendChild(element('h3','キャラ '+item.characters.length+'件'));
   item.characters.forEach(c=>{
    const card=element('article',undefined,'admin-record');card.appendChild(element('h4',c.name||'名前未設定'));
    line(card,'レベル',c.level+' / Max '+c.levelCap);line(card,'在住マップ',c.map);line(card,'サーバー',c.serverNo);
    const levels=element('details');levels.appendChild(element('summary','レベル上限解放'));
    c.levelProgress.forEach(r=>line(levels,(r.completed?'✓ ':'□ ')+r.name,(r.tier?({alpha:'α',beta:'β',gamma:'γ'})[r.tier]+' ':'')+'+'+r.points+' Lv'));card.appendChild(levels);
    c.notes.forEach(g=>{const group=element('details');group.appendChild(element('summary',g.name+' '+g.acquired.length+'/'+g.total));g.acquired.forEach(n=>group.appendChild(element('p',n.label+(n.coord?'（'+n.coord+'）':''))));card.appendChild(group)});
    c.tribes.forEach(g=>line(card,g.map+'：'+g.serverNo,g.member?'トライブ所属':'未所属'));box.appendChild(card);
   });
   box.appendChild(element('h3','タイマー '+item.timers.length+'件'));
   item.timers.forEach(t=>{
    const card=element('article',undefined,'admin-record');card.appendChild(element('h4',t.name||'未設定'));
    line(card,'マップ',t.map);line(card,'サーバー',t.serverNo);line(card,'種類',t.type==='building'?'建材：'+t.material:t.type==='generator'?'ジェネレータ':t.type==='tribe_tower'?'トライブタワー':t.customType||'自由入力');
    line(card,'座標',t.lat+' / '+t.lng);line(card,'ピン表示',t.showPin?'ON':'OFF');line(card,'開始',when(t.startedAt));line(card,'期限',when(t.endsAt));if(t.memo)line(card,'メモ',t.memo);
    line(card,'個別通知',t.notificationSettings.enabled?'ON':'OFF');line(card,'通知日数',t.notificationSettings.days.map(n=>n+'日前').join('、'));
    if(t.notificationSettings.hours.length)line(card,'通知時間',t.notificationSettings.hours.map(n=>n+'時間前').join('、'));
    if(t.notificationSettings.customEntries?.length)line(card,'追加通知',t.notificationSettings.customEntries.map(e=>e.days+'日前（'+(e.enabled?'ON':'OFF')+'）').join('、'));
    line(card,'1日前以降の毎時通知',t.notificationSettings.hourlyWithinDay?'ON':'OFF');box.appendChild(card);
   });message('');
  }catch(error){if(sequence===selection)message(error.message)}
 }
 async function loadList(after=''){
  const version=++request;
  try{
   const data=await api('/api/admin/registrations'+(after?'?after='+after:''));if(version!==request||!dialog.open)return;
   data.notifications.forEach(n=>notificationCache.set(n.id,n));
   const list=$('adminRegistrationList');if(!after)list.replaceChildren();
   data.items.forEach(item=>{const button=element('button',item.platform+' · '+item.id.slice(0,8)+'\nキャラ '+item.characters+'件 / タイマー '+item.timers+'件\n'+when(item.updatedAt),'admin-device');button.type='button';button.addEventListener('click',()=>openItem(item.id));list.appendChild(button)});
   if(!list.children.length)list.appendChild(element('p','登録内容はまだありません。各端末でアプリを更新して開くと表示されます。'));
   $('adminLoadMore').classList.toggle('hidden',!data.next);$('adminLoadMore').dataset.after=data.next||'';
   const notices=$('adminNotificationList');notices.replaceChildren();
   data.notifications.forEach(n=>{const card=element('details',undefined,'admin-record');card.appendChild(element('summary','通知端末 '+n.id.slice(0,8)));renderNotification(card,n);notices.appendChild(card)});
   if(!data.notifications.length)notices.appendChild(element('p','通知の登録はありません。'));message('');
  }catch(error){if(version===request)message(error.message)}
 }
 $('adminLoginForm').addEventListener('submit',async event=>{
  event.preventDefault();if(staticPage()){message('通知対応版で開いてください');return}
  const password=$('adminPassword').value,version=selection;message('確認中…');$('adminLoginButton').disabled=true;
  try{
   await logoutPromise;
   if(!dialog.open||version!==selection)return;
   const result=await api('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
   if(!dialog.open||version!==selection){await logout();return}
   $('adminLoginForm').classList.add('hidden');$('adminDashboard').classList.remove('hidden');expiryTimer=setTimeout(()=>{lock();message('有効期限が切れました。再度パスワードを入力してください')},Math.max(0,result.expiresAt-Date.now()));await loadList();
  }catch(error){message(error.message)}finally{$('adminPassword').value='';$('adminLoginButton').disabled=false}
 });
 $('adminRefresh').addEventListener('click',()=>{sync.markChanged();loadList()});$('adminLoadMore').addEventListener('click',()=>loadList($('adminLoadMore').dataset.after));
 sync.markChanged();
})();
