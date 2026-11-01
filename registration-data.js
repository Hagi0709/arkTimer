function text(value,max=200){if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>max)throw Error('invalid text');return value}
function list(value,max){if(!Array.isArray(value)||value.length>max)throw Error('invalid list');return value}
function number(value,min,max){if(!Number.isFinite(value)||value<min||value>max)throw Error('invalid number');return value}
function flag(value){if(typeof value!=='boolean')throw Error('invalid flag');return value}
function offsets(value,max){return list(value,1000).map(n=>{if(!Number.isSafeInteger(n)||n<1||n>max)throw Error('invalid offset');return n})}
// Explicit allowlists on both sides keep images and account identifiers out of snapshots.
export function sanitizeRegistrationData(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('invalid snapshot');
 const characters=list(raw.characters,100).map(c=>({
  id:text(c.id),name:text(c.name),level:text(c.level,30),map:text(c.map),serverNo:text(c.serverNo,100),levelCap:number(c.levelCap,0,100000),
  levelProgress:list(c.levelProgress,100).map(r=>({name:text(r.name),completed:flag(r.completed),tier:text(r.tier,10),points:number(r.points,0,100000)})),
  notes:list(c.notes,100).map(g=>({name:text(g.name),total:number(g.total,0,10000),acquired:list(g.acquired,10000).map(n=>({label:text(n.label),coord:text(n.coord,100)}))})),
  tribes:list(c.tribes,1000).map(g=>({map:text(g.map),serverNo:text(g.serverNo,100),member:flag(g.member)}))
 }));
 const timers=list(raw.timers,200).map(t=>({
  id:text(t.id),name:text(t.name),map:text(t.map),serverNo:text(t.serverNo,100),type:text(t.type,50),material:text(t.material,50),customType:text(t.customType),
  memo:text(t.memo,10000),startedAt:number(t.startedAt,0,8640000000000000),endsAt:number(t.endsAt,0,8640000000000000),
  lat:text(t.lat,50),lng:text(t.lng,50),showPin:flag(t.showPin),
  notificationSettings:{enabled:flag(t.notificationSettings.enabled),days:offsets(t.notificationSettings.days,100000000),hours:offsets(t.notificationSettings.hours,23),hourlyWithinDay:flag(t.notificationSettings.hourlyWithinDay),customEntries:list(t.notificationSettings.customEntries||[],1000).map(e=>({days:offsets([e.days],100000000)[0],enabled:flag(e.enabled)}))}
 }));
 if(!['granted','denied','default','unavailable'].includes(raw.notification?.permission))throw Error('invalid permission');
 return {characters,timers,notification:{enabled:flag(raw.notification.enabled),permission:raw.notification.permission}};
}
