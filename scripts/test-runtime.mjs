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
  await post('unsubscribe', { token, revision: now + 2 });
  assert.ok((await post('status', { token })).alerts.every(a => a.cancelled_at !== null));
  const cron = await app.fetch('http://localhost/cdn-cgi/local/scheduled');
  assert.equal(cron.status, 200);
  for (const path of ['/', '/push-client.js', '/sw.js', '/manifest.webmanifest', '/build-info.json']) {
    const response = await app.fetch('http://localhost' + path);
    assert.equal(response.status, 200, path);
    if (path !== '/manifest.webmanifest') assert.equal(response.headers.get('cache-control'), 'no-cache', path);
  }
  for(const path of ['/ark-manager-app-icon-asa.png','/genesis1-ocean.jpg','/genesis1-genesis.jpg']){
    const response=await app.fetch('http://localhost'+path);assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),/^image\//);
  }
  console.log('Local Workers + D1: hour/9999-day schedules, cancellation, Cron and PWA/map assets passed');
} finally { await app.stop(); }
