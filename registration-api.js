import {adminJSON,adminLogin,adminLogout,authenticateAdmin,digest,cleanAdminSessions,readLimitedBody} from './admin-access.js';
import {sanitizeRegistrationData} from './registration-data.js';
const sql=(db,query,...values)=>db.prepare(query).bind(...values);
const tokenOK=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const RETENTION=30*86400000;
async function notificationStates(env){
 const rows=await env.DB.prepare(`SELECT s.id,s.updated_at,s.invalidated_at,
  SUM(CASE WHEN a.id IS NOT NULL AND a.sent_at IS NULL AND a.cancelled_at IS NULL AND a.failed_at IS NULL AND a.expires_at>? THEN 1 ELSE 0 END) AS pending,
  SUM(CASE WHEN a.sent_at IS NOT NULL THEN 1 ELSE 0 END) AS accepted,
  SUM(CASE WHEN a.displayed_at IS NOT NULL THEN 1 ELSE 0 END) AS displayed,
  SUM(CASE WHEN a.failed_at IS NOT NULL THEN 1 ELSE 0 END) AS failed
  FROM subscribers s LEFT JOIN alerts a ON a.subscriber_id=s.id GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 500`).bind(Date.now()).all();
 return rows.results.map(row=>({id:row.id,updatedAt:row.updated_at,invalidatedAt:row.invalidated_at,pending:row.pending||0,accepted:row.accepted||0,displayed:row.displayed||0,failed:row.failed||0}));
}
export async function registrationAPI(req,env){
 const url=new URL(req.url),path=url.pathname;
 if((req.headers.get('origin')&&req.headers.get('origin')!==url.origin)||req.headers.get('sec-fetch-site')==='cross-site')return adminJSON({error:'origin mismatch'},403);
 if(!env.DB||!env.REGISTRATION_ADMIN_PASSWORD_HASH)return adminJSON({error:'管理機能は準備中です'},503);
 if(path==='/api/admin/login'&&req.method==='POST')return adminLogin(req,env);
 if(path==='/api/admin/logout'&&req.method==='POST')return adminLogout(req,env);
 if(path==='/api/registrations/sync'&&req.method==='POST'){
  const ip=await digest('registration|'+env.REGISTRATION_ADMIN_PASSWORD_HASH+'|'+(req.headers.get('cf-connecting-ip')||'local')),now=Date.now();
  await sql(env.DB,`INSERT INTO admin_login_limits (id,window_start,attempts) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET
   attempts=CASE WHEN admin_login_limits.window_start<=? THEN 1 ELSE admin_login_limits.attempts+1 END,
   window_start=CASE WHEN admin_login_limits.window_start<=? THEN excluded.window_start ELSE admin_login_limits.window_start END`,'sync:'+ip,now,now-60000,now-60000).run();
  if((await sql(env.DB,'SELECT attempts FROM admin_login_limits WHERE id=?','sync:'+ip).first()).attempts>120)return adminJSON({error:'しばらく待ってから再度同期してください'},429,{'retry-after':'60'});
  const bytes=await readLimitedBody(req,500000);if(!bytes)return adminJSON({error:'too large'},413);
  let body,data;
  try{body=JSON.parse(new TextDecoder().decode(bytes));data=sanitizeRegistrationData(body.data)}catch{return adminJSON({error:'登録内容を同期できません。データの形式・件数・サイズを確認してください'},400)}
  if(!tokenOK(body.token)||!Number.isSafeInteger(body.revision)||body.revision<1||!['iPhone','iPad','Android','PC','不明'].includes(body.platform)||(body.pushToken!==null&&body.pushToken!==undefined&&!tokenOK(body.pushToken)))return adminJSON({error:'invalid registration'},400);
  const id=await digest(body.token),subscriber=body.pushToken?await digest(body.pushToken):null;
  await sql(env.DB,`INSERT INTO registration_snapshots (id,revision,platform,subscriber_id,data,updated_at) VALUES (?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,platform=excluded.platform,subscriber_id=excluded.subscriber_id,data=excluded.data,updated_at=excluded.updated_at
   WHERE excluded.revision>registration_snapshots.revision`,id,body.revision,body.platform,subscriber,JSON.stringify(data),now).run();
  return adminJSON({ok:true});
 }
 if(!path.startsWith('/api/admin/'))return adminJSON({error:'not found'},404);
 if(!await authenticateAdmin(req,env))return adminJSON({error:'パスワードを入力してください'},401);
 if(req.method!=='GET')return adminJSON({error:'method not allowed'},405);
 if(path==='/api/admin/registrations'){
  const after=url.searchParams.get('after')||'';if(after&&!tokenOK(after))return adminJSON({error:'invalid page'},400);
  const rows=await sql(env.DB,`SELECT id,platform,subscriber_id,updated_at,json_array_length(data,'$.characters') AS characters,
   json_array_length(data,'$.timers') AS timers FROM registration_snapshots WHERE updated_at>? AND id>? ORDER BY id LIMIT 51`,Date.now()-RETENTION,after).all();
  const items=rows.results.slice(0,50).map(r=>({id:r.id,platform:r.platform,subscriberId:r.subscriber_id,updatedAt:r.updated_at,characters:r.characters,timers:r.timers}));
  return adminJSON({ok:true,items,next:rows.results.length>50?items.at(-1).id:null,notifications:await notificationStates(env)});
 }
 const match=path.match(/^\/api\/admin\/registrations\/([a-f0-9]{64})$/);
 if(match){
  const row=await sql(env.DB,'SELECT id,platform,subscriber_id,data,updated_at FROM registration_snapshots WHERE id=? AND updated_at>?',match[1],Date.now()-RETENTION).first();
  return row?adminJSON({ok:true,item:{id:row.id,platform:row.platform,subscriberId:row.subscriber_id,updatedAt:row.updated_at,...JSON.parse(row.data)}}):adminJSON({error:'登録内容が見つかりません'},404);
 }
 return adminJSON({error:'not found'},404);
}
export async function cleanRegistrations(env){
 if(!env.DB||!env.REGISTRATION_ADMIN_PASSWORD_HASH)return;
 await sql(env.DB,'DELETE FROM registration_snapshots WHERE updated_at<=?',Date.now()-RETENTION).run();
 await cleanAdminSessions(env);
}
