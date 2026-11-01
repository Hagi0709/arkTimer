import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import {digest} from '../admin-access.js';
import {cleanRegistrations} from '../registration-api.js';
import {D1} from './d1.mjs';
const NOW=1800000000000,token='d'.repeat(64),pushToken='a'.repeat(64),password='unit-password';
const snapshot=()=>({characters:[{id:'c1',name:'<img src=x>',level:'120',map:'アイランド',serverNo:'5041',levelCap:135,
 levelProgress:[{name:'監督者',completed:true,tier:'alpha',points:15}],notes:[{name:'ノート',total:2,acquired:[{label:'#1',coord:'10,20'}]}],tribes:[],eosId:'private-eos',steamId:'private-steam',appearance:'private-image'}],
 timers:[{id:'t1',name:'拠点',map:'アイランド',serverNo:'5041',type:'building',material:'TEK',customType:'',memo:'燃料を確認',startedAt:NOW,endsAt:NOW+86400000,lat:'10',lng:'20',showPin:true,notificationSettings:{enabled:true,days:[1,14],hours:[],hourlyWithinDay:true},imageSrc:'private-map-image'}],notification:{enabled:true,permission:'granted'}});
async function setup(t){t.mock.method(Date,'now',()=>NOW);const DB=new D1();t.after(()=>DB.close());return{DB,REGISTRATION_ADMIN_PASSWORD_HASH:await digest(password)}}
async function call(env,path,{method='GET',body,cookie,origin,ip='1.2.3.4',fetchSite}={}){
 const headers={'cf-connecting-ip':ip};if(body!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;if(origin)headers.origin=origin;if(fetchSite)headers['sec-fetch-site']=fetchSite;
 const response=await worker.fetch(new Request('https://ark.test'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
 return{status:response.status,data:await response.json(),headers:response.headers};
}
const login=env=>call(env,'/api/admin/login',{method:'POST',body:{password}});
const sync=(env,revision=1,data=snapshot())=>call(env,'/api/registrations/sync',{method:'POST',body:{token,pushToken,revision,platform:'iPhone',data}});
test('未認証の一覧・個別内容を拒否し、パスワード設定前も公開しない',async t=>{
 const env=await setup(t);await sync(env);
 for(const path of ['/api/admin/registrations','/api/admin/registrations/'+await digest(token)])assert.equal((await call(env,path)).status,401);
 assert.equal((await call({DB:env.DB},'/api/admin/login',{method:'POST',body:{password}})).status,503);
});
test('サーバー照合後だけセッションCookieを発行し、DBにはCookie自体を保存しない',async t=>{
 const env=await setup(t),result=await login(env),cookie=result.headers.get('set-cookie');
 assert.equal(result.status,200);assert.match(cookie,/__Host-ark-manager-admin=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
 const raw=cookie.split(';')[0].split('=')[1];assert.equal(env.DB.sql.prepare('SELECT id FROM admin_sessions').get().id,await digest(raw));
 assert.equal((await call(env,'/api/admin/registrations',{cookie})).status,200);assert.doesNotMatch(JSON.stringify(result.data),/unit-password|PASSWORD_HASH/);
});
test('パスワードの連続失敗をIP単位で制限し、時間経過後に解除する',async t=>{
 const env=await setup(t);
 for(let i=0;i<5;i++)assert.equal((await call(env,'/api/admin/login',{method:'POST',body:{password:'wrong'}})).status,401);
 const limited=await login(env);assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
 t.mock.method(Date,'now',()=>NOW+15*60000+1);assert.equal((await login(env)).status,200);
});
test('複数IPからの試行も全体制限し、他サイトからの認証・同期は拒否する',async t=>{
 const env=await setup(t);
 for(const path of ['/api/admin/login','/api/registrations/sync'])assert.equal((await call(env,path,{method:'POST',origin:'https://other.test',body:{}})).status,403);
 assert.equal((await call(env,'/api/admin/registrations',{fetchSite:'cross-site'})).status,403);
 for(let i=0;i<30;i++)await call(env,'/api/admin/login',{method:'POST',body:{password:'wrong'},ip:'ip-'+i});
 assert.equal((await call(env,'/api/admin/login',{method:'POST',body:{password},ip:'new-ip'})).status,429);
});
test('有効期限とログアウト後は再認証が必要',async t=>{
 const env=await setup(t),cookie=(await login(env)).headers.get('set-cookie');
 const out=await call(env,'/api/admin/logout',{method:'POST',cookie});assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await call(env,'/api/admin/registrations',{cookie})).status,401);
 const next=(await login(env)).headers.get('set-cookie');t.mock.method(Date,'now',()=>NOW+30*60000+1);
 assert.equal((await call(env,'/api/admin/registrations',{cookie:next})).status,401);
});
test('登録内容と通知状態を認証後に表示し、画像・アカウントID・Push購読情報を返さない',async t=>{
 const env=await setup(t),id=await digest(token),subscriber=await digest(pushToken);
 env.DB.sql.prepare("INSERT INTO subscribers (id,endpoint,subscription,updated_at,sync_revision) VALUES (?,?,?,?,1)").run(subscriber,'private-endpoint','private-subscription',NOW);
 assert.equal((await sync(env)).status,200);const cookie=(await login(env)).headers.get('set-cookie');
 const list=await call(env,'/api/admin/registrations',{cookie});assert.equal(list.data.items[0].characters,1);assert.equal(list.data.items[0].timers,1);assert.equal(list.data.items[0].subscriberId,subscriber);assert.equal(list.data.notifications.length,1);
 const item=(await call(env,'/api/admin/registrations/'+id,{cookie})).data.item;
 assert.equal(item.characters[0].serverNo,'5041');assert.equal(item.timers[0].memo,'燃料を確認');assert.equal(item.characters[0].notes[0].acquired.length,1);
 assert.doesNotMatch(JSON.stringify([item,list.data]),/private-|eosId|steamId|appearance|imageSrc|endpoint|subscription|unit-password/);
 assert.equal(item.token,undefined);assert.equal(item.pushToken,undefined);assert.equal(list.headers.get('cache-control'),'no-store');
});
test('古い同期を後から送っても新しい内容を上書きしない',async t=>{
 const env=await setup(t);await sync(env,5);const changed=snapshot();changed.characters[0].name='古い名前';await sync(env,4,changed);
 assert.equal(JSON.parse(env.DB.sql.prepare('SELECT data FROM registration_snapshots').get().data).characters[0].name,'<img src=x>');
 await sync(env,6,changed);assert.equal(JSON.parse(env.DB.sql.prepare('SELECT data FROM registration_snapshots').get().data).characters[0].name,'古い名前');
});
test('不正な日数・大きすぎる内容・不正トークンを拒否し、既存内容を保持する',async t=>{
 const env=await setup(t);await sync(env);
 const bad=snapshot();bad.timers[0].notificationSettings.days=[0];assert.equal((await sync(env,2,bad)).status,400);
 assert.equal((await call(env,'/api/registrations/sync',{method:'POST',body:{padding:'x'.repeat(500001)}})).status,413);
 assert.equal((await call(env,'/api/registrations/sync',{method:'POST',body:{token:'bad',revision:2,platform:'PC',data:snapshot()}})).status,400);
 assert.equal(env.DB.sql.prepare('SELECT revision FROM registration_snapshots').get().revision,1);
});
test('30日を過ぎた登録内容は表示・保持せず、通知登録は消さない',async t=>{
 const env=await setup(t);await sync(env);env.DB.sql.prepare('UPDATE registration_snapshots SET updated_at=?').run(NOW-31*86400000);
 const cookie=(await login(env)).headers.get('set-cookie');assert.equal((await call(env,'/api/admin/registrations',{cookie})).data.items.length,0);
 assert.equal((await call(env,'/api/admin/registrations/'+await digest(token),{cookie})).status,404);
 await cleanRegistrations(env);assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM registration_snapshots').get().n,0);
});
