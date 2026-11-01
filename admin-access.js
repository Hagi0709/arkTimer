const WINDOW=15*60*1000,SESSION=30*60*1000;
const COOKIE='__Host-ark-manager-admin';
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
const sql=(db,query,...values)=>db.prepare(query).bind(...values);
export const adminJSON=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Cookie',...headers}});
export async function readLimitedBody(req,max){
 if(Number(req.headers.get('content-length'))>max)return null;
 const reader=req.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max){await reader.cancel();return null}chunks.push(part.value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
}
const sessionCookie=(value,age)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function cookie(req){const value=req.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export async function authenticateAdmin(req,env){
 if(!env.DB||!env.REGISTRATION_ADMIN_PASSWORD_HASH)return false;
 const token=cookie(req);if(!token)return false;
 const row=await sql(env.DB,'SELECT expires_at FROM admin_sessions WHERE id=?',await digest(token)).first();
 return !!row&&row.expires_at>Date.now();
}
export async function adminLogin(req,env){
 if(!env.DB||!env.REGISTRATION_ADMIN_PASSWORD_HASH)return adminJSON({error:'管理画面はまだ設定されていません'},503);
 const now=Date.now(),ip=req.headers.get('cf-connecting-ip')||'local';
 const keys=[await digest(env.REGISTRATION_ADMIN_PASSWORD_HASH+'|'+ip),'all'];
 await env.DB.batch(keys.map(key=>sql(env.DB,`INSERT INTO admin_login_limits (id,window_start,attempts) VALUES (?,?,1)
  ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN admin_login_limits.window_start<=? THEN 1 ELSE admin_login_limits.attempts+1 END,
  window_start=CASE WHEN admin_login_limits.window_start<=? THEN excluded.window_start ELSE admin_login_limits.window_start END`,key,now,now-WINDOW,now-WINDOW)));
 for(let i=0;i<keys.length;i++){
  const limit=await sql(env.DB,'SELECT attempts,window_start FROM admin_login_limits WHERE id=?',keys[i]).first();
  if(limit.attempts>(i===0?5:30))return adminJSON({error:'入力回数が上限に達しました。15分ほど待ってから再度お試しください'},429,{'retry-after':String(Math.ceil((limit.window_start+WINDOW-now)/1000))});
 }
 const bytes=await readLimitedBody(req,1024);if(!bytes)return adminJSON({error:'入力内容を確認してください'},413);const text=new TextDecoder().decode(bytes);
 let data;try{data=JSON.parse(text)}catch{return adminJSON({error:'入力内容を確認してください'},400)}
 if(typeof data?.password!=='string'||data.password.length>100||!equal(await digest(data.password),env.REGISTRATION_ADMIN_PASSWORD_HASH))return adminJSON({error:'パスワードが違います'},401);
 const old=cookie(req);if(old)await sql(env.DB,'DELETE FROM admin_sessions WHERE id=?',await digest(old)).run();
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 await sql(env.DB,'INSERT INTO admin_sessions (id,expires_at) VALUES (?,?)',await digest(token),now+SESSION).run();
 return adminJSON({ok:true,expiresAt:now+SESSION},200,{'set-cookie':sessionCookie(token,SESSION/1000)});
}
export async function adminLogout(req,env){
 const token=cookie(req);if(token&&env.DB)await sql(env.DB,'DELETE FROM admin_sessions WHERE id=?',await digest(token)).run();
 return adminJSON({ok:true},200,{'set-cookie':sessionCookie('',0)});
}
export async function cleanAdminSessions(env){
 if(!env.DB||!env.REGISTRATION_ADMIN_PASSWORD_HASH)return;
 await env.DB.batch([sql(env.DB,'DELETE FROM admin_sessions WHERE expires_at<=?',Date.now()),sql(env.DB,'DELETE FROM admin_login_limits WHERE window_start<=?',Date.now()-WINDOW)]);
}
