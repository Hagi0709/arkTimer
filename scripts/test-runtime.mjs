// Local workerd + D1 smoke test. Never contacts or deploys a production Worker.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { unstable_dev } from 'wrangler';
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys(); // Ephemeral test keys, kept in memory.
const app = await unstable_dev('worker.js', {
  config: 'wrangler.toml', local: true, ip: '127.0.0.1', port: 0, logLevel: 'error',
  vars: { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:test@example.test' },
  experimental: { disableExperimentalWarning: true, testScheduled: true, watch: false, disableDevRegistry: true }
});
const token = randomBytes(32).toString('hex');
const post = async (path, body) => {
  const response = await app.fetch('http://localhost/api/push/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal(response.status, 200);
  return response.json();
};
try {
  const key = await (await app.fetch('http://localhost/api/push/key')).json();
  assert.equal(key.protocol, 2);
  assert.equal(key.timerNotifications,true);
  assert.equal(key.flexibleTimerNotifications,true);
  const now = Date.now();
  const result = await post('sync', {
    token, revision: now, days: [], hours: [1, 2],
    subscription: { endpoint: 'https://push.example.invalid/local-test-only', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } },
    timers: [{ id: 'local-test', name: 'Local smoke test', map: 'test', startedAt: now, endsAt: now + 3 * 3600000 }]
  });
  assert.equal(result.scheduled, 2);
  const status = await post('status', { token });
  assert.deepEqual(status.alerts.map(a => a.due_at).sort(), [now + 3600000, now + 7200000]);
  const farEnd=now+10000*86400000-60000;
  const extended=await post('sync',{
    token,revision:now+1,days:[],hours:[1,2],
    subscription:{endpoint:'https://push.example.invalid/local-test-only',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}},
    timers:[{id:'local-test',name:'9999 days',map:'ジェネシス1(Ocean)',startedAt:now,endsAt:farEnd}]
  });
  assert.equal(extended.scheduled,2);
  assert.deepEqual((await post('status',{token})).alerts.filter(a=>a.cancelled_at===null).map(a=>a.due_at).sort(),[farEnd-7200000,farEnd-3600000]);
  const perTimer={token,revision:now+2,days:[],hours:[],
    subscription:{endpoint:'https://push.example.invalid/local-test-only',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}},
    timers:[{id:'per-a',startedAt:now,endsAt:now+4*3600000,notificationSettings:{enabled:true,days:[],hours:[1]}},
      {id:'per-b',startedAt:now,endsAt:now+8*3600000,notificationSettings:{enabled:true,days:[],hours:[2]}},
      {id:'per-off',startedAt:now,endsAt:now+4*3600000,notificationSettings:{enabled:false,days:[1],hours:[]}}]};
  assert.equal((await post('sync',perTimer)).scheduled,2);
  assert.deepEqual((await post('status',{token})).alerts.filter(a=>a.cancelled_at===null).map(a=>a.due_at).sort(),[now+3*3600000,now+6*3600000]);
  perTimer.revision++;perTimer.timers[0].notificationSettings.enabled=false;
  assert.equal((await post('sync',perTimer)).scheduled,1);
  assert.deepEqual((await post('status',{token})).alerts.filter(a=>a.cancelled_at===null).map(a=>a.due_at),[now+6*3600000]);
  const flexible={...perTimer,revision:now+4,timers:[{id:'flexible',startedAt:now,endsAt:now+40*86400000,
    notificationSettings:{enabled:true,days:[8,14,30,30],hours:[],hourlyWithinDay:true}}]};
  assert.equal((await post('sync',flexible)).scheduled,26);
  const flexibleAlerts=(await post('status',{token})).alerts.filter(a=>a.cancelled_at===null);
  assert.deepEqual(flexibleAlerts.map(a=>a.due_at).sort(),[8,14,30].map(n=>now+(40-n)*86400000).concat(Array.from({length:23},(_,i)=>now+40*86400000-(i+1)*3600000)).sort());
  await post('unsubscribe', { token, revision: now + 5 });
  assert.ok((await post('status', { token })).alerts.every(a => a.cancelled_at !== null));
  flexible.revision=now+6;
  assert.equal((await post('sync',flexible)).scheduled,26);
  assert.deepEqual((await post('status',{token})).alerts.filter(a=>a.cancelled_at===null).map(a=>a.due_at).sort(),flexibleAlerts.map(a=>a.due_at).sort());
  const cron = await app.fetch('http://localhost/cdn-cgi/local/scheduled');
  assert.equal(cron.status, 200);
  for (const path of ['/', '/push-client.js', '/install-guide.js', '/sw.js', '/manifest.webmanifest', '/build-info.json']) {
    const response = await app.fetch('http://localhost' + path);
    assert.equal(response.status, 200, path);
    if (path !== '/manifest.webmanifest') assert.equal(response.headers.get('cache-control'), 'no-cache', path);
  }
  for(const path of ['/ark-manager-app-icon-dodo-v2.jpg','/safari-share-symbol.png','/timer-tribe-tower.png','/timer-generator.png','/timer-material-stone.webp',...['thatch','wood','metal','tek'].map(name=>`/timer-material-${name}.png`),'/genesis1-ocean.jpg','/genesis1-genesis.jpg',...['island','astraeos','lost-colony','aberration','ragnarok'].map(name=>`/timer-map-${name}.jpg`),...['overseer','manticore','rockwell','king-titan','lost-queen','master-controller','astraeos'].map(name=>`/boss-${name}.webp`),...['explorer-notes','bobs-sc','bobs-ab','bobs-ex','chibi','tides-of-fortune'].map(name=>`/level-${name}.webp`)]){
    const response=await app.fetch('http://localhost'+path);assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),/^image\//);
  }
  console.log('Local Workers + D1: custom-day/hourly/legacy/9999-day schedules, individual/global cancellation, Cron and PWA assets passed');
} finally { await app.stop(); }
