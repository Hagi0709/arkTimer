import webpush from 'web-push';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
function configured(env){return !!(env.DB&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT)}
function checkSubscription(s){return s&&typeof s.endpoint==='string'&&s.endpoint.startsWith('https://')&&s.endpoint.length<2500&&s.keys&&typeof s.keys.p256dh==='string'&&typeof s.keys.auth==='string'}
async function api(req,env){
 if(!configured(env))return json({error:'D1またはVAPID鍵が未設定です'},503);
 if(req.method==='GET'&&new URL(req.url).pathname==='/api/push/key')return json({publicKey:env.VAPID_PUBLIC_KEY});
 if(req.method!=='POST')return json({error:'method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>150000)return json({error:'too large'},413);
 let body;try{body=await req.json()}catch{return json({error:'invalid JSON'},400)}
 const pathname=new URL(req.url).pathname;
 if(pathname==='/api/push/unsubscribe'){
  if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'token required'},400);
  const id=await hash(body.token);await env.DB.batch([env.DB.prepare('DELETE FROM alerts WHERE subscriber_id=?').bind(id),env.DB.prepare('DELETE FROM subscribers WHERE id=?').bind(id)]);return json({ok:true});
 }
 if(pathname!=='/api/push/sync')return json({error:'not found'},404);
 if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'invalid device token'},400);
 if(!checkSubscription(body.subscription))return json({error:'invalid subscription'},400);
 const {subscription}=body;const id=await hash(body.token);
 const days=[...new Set((Array.isArray(body.days)?body.days:[]).filter(d=>Number.isInteger(d)&&d>=0&&d<=7))];
 const timers=(Array.isArray(body.timers)?body.timers:[]).slice(0,50);
 if(!days.length)return json({error:'days required'},400);
 const now=Date.now();const inserts=[];
 for(const t of timers){if(typeof t.id!=='string'||!Number.isFinite(t.endsAt)||t.endsAt<now-86400000||t.endsAt>now+365*86400000)continue;
  for(const d of days){const due=t.endsAt-d*86400000;if(due<now-60000)continue;
   const key=await hash(id+'|'+t.id+'|'+t.endsAt+'|'+d);
   inserts.push({key,subscriber_id:id,due_at:due,title:'ARK Manager｜タイマー通知',body:`${String(t.name||'未設定').slice(0,100)}（${String(t.map||'').slice(0,60)}）${d===0?'の期限です':`の期限まであと${d}日`}`});
  }
 }
 if(inserts.length>400)return json({error:'too many alerts'},400);
 await env.DB.prepare('INSERT INTO subscribers (id,endpoint,subscription,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,subscription=excluded.subscription,updated_at=excluded.updated_at').bind(id,subscription.endpoint,JSON.stringify(subscription),now).run();
 // Replacing pending alerts ensures edits, resets, deletes and day-setting changes are reflected.
 await env.DB.prepare('DELETE FROM alerts WHERE subscriber_id=? AND sent_at IS NULL').bind(id).run();
 for(let i=0;i<inserts.length;i+=80){await env.DB.batch(inserts.slice(i,i+80).map(a=>env.DB.prepare('INSERT OR IGNORE INTO alerts (id,subscriber_id,due_at,title,body) VALUES (?,?,?,?,?)').bind(a.key,a.subscriber_id,a.due_at,a.title,a.body)))}
 return json({ok:true,scheduled:inserts.length});
}
async function scheduled(env){if(!configured(env))return;await env.DB.prepare('DELETE FROM alerts WHERE sent_at IS NOT NULL AND sent_at<?').bind(Date.now()-30*86400000).run();webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
 const rows=await env.DB.prepare('SELECT a.id,a.title,a.body,s.subscription,s.id AS subscriber_id FROM alerts a JOIN subscribers s ON a.subscriber_id=s.id WHERE a.sent_at IS NULL AND a.due_at<=? ORDER BY a.due_at LIMIT 100').bind(Date.now()).all();
 for(const a of rows.results||[]){
  // Claim the alert before sending to avoid duplicate delivery from overlapping cron runs.
  const claim=await env.DB.prepare('UPDATE alerts SET sent_at=? WHERE id=? AND sent_at IS NULL').bind(Date.now(),a.id).run();if(!claim.meta?.changes)continue;
  try{await webpush.sendNotification(JSON.parse(a.subscription),JSON.stringify({title:a.title,body:a.body,tag:a.id}),{TTL:86400})}
  catch(e){if(e.statusCode===404||e.statusCode===410){await env.DB.batch([env.DB.prepare('DELETE FROM alerts WHERE subscriber_id=?').bind(a.subscriber_id),env.DB.prepare('DELETE FROM subscribers WHERE id=?').bind(a.subscriber_id)])}else{console.error('push failed',e.statusCode||e.message);await env.DB.prepare('UPDATE alerts SET sent_at=NULL WHERE id=?').bind(a.id).run()}}
 }
}
export default {async fetch(req,env){const u=new URL(req.url);if(u.pathname.startsWith('/api/push/')){if(req.headers.get('origin')&&req.headers.get('origin')!==u.origin)return json({error:'origin mismatch'},403);return api(req,env)}return env.ASSETS.fetch(req)},async scheduled(event,env,ctx){ctx.waitUntil(scheduled(env))}};
