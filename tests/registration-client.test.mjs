import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync('registration-client.js','utf8'),KEY='arkManager_registration_sync_v1';
function harness({hostname='ark.test',fail=false}={}){
 const nodes=new Map(),storage=new Map(),timers=new Map(),calls=[],listeners={};let timerId=0,offline=false;
 const node=id=>{if(!nodes.has(id)){
  const events={},classes=new Set();nodes.set(id,{id,value:'',dataset:{},children:[],open:false,
   classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,on){if(on)classes.add(k);else classes.delete(k)}},
   addEventListener(name,fn){events[name]=fn},emit(name,event={}){return events[name]?.(event)},appendChild(el){this.children.push(el);return el},replaceChildren(...children){this.children=children},
   focus(){},showModal(){this.open=true},close(){this.open=false;events.close?.()},set innerHTML(value){throw Error('Untrusted HTML insertion')}
  });}return nodes.get(id)};
 const window={addEventListener(name,fn){listeners[name]=fn},ARKRegistrationSnapshot:async()=>({characters:[],timers:[],notification:{enabled:false,permission:'default'}})};
 const context={window,document:{getElementById:node,createElement:()=>node('new-'+nodes.size),addEventListener(name,fn){listeners[name]=fn},dispatchEvent(){}},location:{hostname,protocol:'https:'},
  navigator:{userAgent:'iPhone',get onLine(){return!offline}},crypto,TextEncoder,AbortSignal,Event,
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),
  async fetch(path,options={}){calls.push({path,options,body:options.body?JSON.parse(options.body):undefined});
   if(fail)return new Response('{"error":"test failure"}',{status:503});
   if(path.endsWith('/login'))return new Response(JSON.stringify({ok:true,expiresAt:Date.now()+1800000}));
   if(path==='/api/admin/registrations')return new Response(JSON.stringify({ok:true,items:[{id:'a'.repeat(64),platform:'iPhone',updatedAt:1800000000000,characters:1,timers:0}],notifications:[],next:null}));
   if(path.endsWith('a'.repeat(64)))return new Response(JSON.stringify({ok:true,item:{id:'a'.repeat(64),platform:'iPhone',updatedAt:1800000000000,notification:{enabled:true,permission:'granted'},characters:[{name:'<img src=x onerror=alert(1)>',level:'120',levelCap:135,map:'アイランド',serverNo:'5041',levelProgress:[],notes:[],tribes:[]}],timers:[]}}));
   return new Response('{"ok":true}');
  }
 };
 runInNewContext(source,context);
 return{node,window,storage,calls,timers,context,listeners,offline(){offline=true}};
}
test('ロゴ9回では開かず、10回目でパスワード入力を開き、閉じると回数をリセット',()=>{
 const h=harness();for(let i=0;i<9;i++)h.node('adminEntry').emit('click');assert.equal(h.node('registrationAdminDialog').open,false);
 h.node('adminEntry').emit('click');assert.equal(h.node('registrationAdminDialog').open,true);assert.equal(h.calls.length,0);
 h.node('registrationAdminDialog').close();h.node('adminEntry').emit('click');assert.equal(h.node('registrationAdminDialog').open,false);
});
test('パスワードはサーバーへ照合し、ブラウザー保存せず、表示値をHTMLとして挿入しない',async()=>{
 const h=harness();for(let i=0;i<10;i++)h.node('adminEntry').emit('click');h.node('adminPassword').value='unit-password';
 await h.node('adminLoginForm').emit('submit',{preventDefault(){}});
 assert.equal(h.calls[0].path,'/api/admin/login');assert.equal(h.calls[0].body.password,'unit-password');assert.equal(h.node('adminPassword').value,'');
 assert.equal(h.node('adminDashboard').classList.contains('hidden'),false);assert.doesNotMatch(JSON.stringify([...h.storage]),/unit-password/);
 await h.node('adminRegistrationList').children[0].emit('click');
 const detail=h.node('adminRegistrationDetail');assert.ok(detail.children.some(c=>c.children.some(n=>n.textContent==='<img src=x onerror=alert(1)>')));
 h.node('registrationAdminDialog').close();assert.equal(detail.children.length,0);assert.equal(h.node('adminDashboard').classList.contains('hidden'),true);
 assert.doesNotMatch(source,/7191/);
});
test('期限が切れると登録内容を消して再入力に戻し、同時読み込み中に閉じても再表示しない',async()=>{
 const h=harness();for(let i=0;i<10;i++)h.node('adminEntry').emit('click');h.node('adminPassword').value='unit-password';await h.node('adminLoginForm').emit('submit',{preventDefault(){}});
 const expiry=[...h.timers.values()].find(t=>t.delay>1000000);assert.ok(expiry);expiry.fn();
 assert.equal(h.node('adminDashboard').classList.contains('hidden'),true);assert.equal(h.node('adminRegistrationList').children.length,0);
});
test('登録内容は自動同期し、アプリ変更中の古いスナップショットを送らない',async()=>{
 const h=harness();let release;
 h.window.ARKRegistrationSnapshot=()=>new Promise(resolve=>{release=resolve});
 const syncing=h.window.ARKRegistrationSync.flush();
 h.window.ARKRegistrationSync.markChanged();h.window.ARKRegistrationSnapshot=async()=>({characters:[],timers:[],notification:{enabled:false,permission:'granted'}});
 release({characters:[{name:'古い'}],timers:[]});await syncing;
 assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].body.data.characters,[]);assert.equal(JSON.parse(h.storage.get(KEY)).pending,false);
});
test('通信失敗・オフラインでは未同期を保持し、GitHub Pagesからは同期しない',async()=>{
 const h=harness({fail:true});await h.window.ARKRegistrationSync.flush();assert.equal(JSON.parse(h.storage.get(KEY)).pending,true);assert.match(h.node('registrationSyncStatus').textContent,/未同期/);
 const off=harness();off.offline();await off.window.ARKRegistrationSync.flush();assert.equal(off.calls.length,0);assert.equal(JSON.parse(off.storage.get(KEY)).pending,true);
 const pages=harness({hostname:'hagi0709.github.io'});await pages.window.ARKRegistrationSync.flush();assert.equal(pages.calls.length,0);assert.equal(pages.storage.size,0);
});
test('実際の登録内容の投影も画像・アカウントIDを除外し、取得状況と通知OFFの日数を保持',async()=>{
 const html=readFileSync('index.html','utf8'),projection=html.slice(html.indexOf(' window.ARKRegistrationSnapshot=async()=>{'),html.indexOf(' window.ARKTransfer?.init('));
 const character={id:'c1',name:'キャラ',level:120,map:'アイランド',serverNo:'5041',appearance:'private-image',eosId:'private-eos',steamId:'private-steam',implantNumber:'private-implant',levelUnlocks:['boss'],extNotes:['n1'],tribeMember:true};
 const timer={id:'t1',timerName:'拠点',map:'アイランド',serverNo:'5041',type:'building',material:'TEK',startedAt:1800000000000,endsAt:1800086400000,imageSrc:'private-map',notificationSettings:{enabled:false,days:[1],hours:[],hourlyWithinDay:false,customNotifications:{enabled:true,entries:[{days:14,enabled:false}]}}};
 const window={ARKPush:{getSettings:()=>({enabled:true})},Notification:{permission:'granted'}};
 runInNewContext(projection,{window,charactersReady:Promise.resolve(),db:null,loadLocalRecords:()=>[character],localStorage:{getItem:()=>JSON.stringify([timer])},STORAGE_KEY:'timers',levelRules:[{id:'boss',name:'監督者',type:'boss'}],getLevelTotal:()=>120,checkedLevelIds:c=>c.levelUnlocks,bossRule:()=>true,bossTier:()=> 'alpha',BOSS_LEVELS:{alpha:15},EXT_NOTES:[{name:'ノート',items:[{id:'n1',label:'#1',coord:'10,20'}]}],coordinatesForPin:()=>null});
 const data=await window.ARKRegistrationSnapshot();assert.doesNotMatch(JSON.stringify(data),/private-|eosId|steamId|implantNumber|imageSrc|appearance/);
 assert.equal(data.characters[0].notes[0].acquired.length,1);assert.equal(data.characters[0].tribes[0].member,true);assert.equal(data.timers[0].notificationSettings.customEntries[0].enabled,false);
});
